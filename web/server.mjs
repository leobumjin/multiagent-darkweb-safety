import { resultExport } from "./result-export.mjs";
import { speechConfig, createSpeechService } from "./speech-service.mjs";
import { legacyDefinitions } from "./participant-definitions.mjs";
import { savePartialRun } from "./partial-run.mjs";
import { recordedRunStats } from "./run-summary.mjs";
import { resolveResultPath, isArxived, mutateSavedResult } from "./result-storage.mjs";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const WEB_EVENT_PREFIX = "@@PBE_EVENT@@";
const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "..");
const publicDir = join(currentDir, "public");
const runScript = join(projectRoot, "shells", "run.sh");
const envScript = join(projectRoot, "shells", "env.sh");
const environmentFields = [
  ["EXPERIMENT_LANGUAGE", "Experiment language"],
  ["API_MODEL", "API model"],
  ["API_PROVIDER", "API provider"],
  ["BACKEND", "Execution backend"],
  ["MOCK_POLICY", "Mock policy"],
  ["SCENARIO_KIND", "Research scenario"],
  ["CRISIS_LEVEL", "Crisis pressure level"],
  ["P2_EXECUTION", "P2 execution mode"],
  ["ARCHITECTURE", "Agent architecture"],
  ["ATTACK", "Attack condition"],
  ["DIFFICULTY", "Task difficulty"],
  ["ROUNDS", "Discussion rounds"],
  ["CANDIDATE_COUNT", "Candidate count"],
  ["TARGET_COUNT", "Target count"],
  ["FINALIZE", "Final synthesis"],
  ["COMPACT", "Compact prompts"],
  ["OUTPUT_DIR", "Shell output"],
  ["WEB_OUTPUT_DIR", "Web output"],
  ["WEB_HOST", "Web host"],
  ["WEB_PORT", "Web port"],
];
const initialEnvironment = await loadEnvConfig();
const host = process.env.HOST || initialEnvironment.WEB_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || initialEnvironment.WEB_PORT || "5173", 10);
const runs = new Map();
const synthesizeSpeech = createSpeechService();
const executeFile = promisify(execFile);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

    if (request.method === "GET" && url.pathname === "/api/scenario-definition") {
      return sendJson(response, 200, JSON.parse(await readFile(join(projectRoot, "src", "scenarios", "darkweb", "definition.json"), "utf8")));
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      return sendJson(response, 200, { ok: true });
    }

    if (request.method === "GET" && url.pathname === "/api/speech/config") {
      const config = await speechConfig(join(projectRoot, ".env"));
      return sendJson(response, 200, {provider:config.apiKey && config.voiceId ? "elevenlabs" : "browser"});
    }
    if (request.method === "POST" && url.pathname === "/api/speech") {
      if (request.headers.origin && request.headers.origin !== url.origin) return sendJson(response, 403, {error:"Request origin is not allowed."});
      const {text, language = "en"} = await readJson(request);
      if (!["en", "ko"].includes(language)) badRequest("language must be en or ko.");
      const audio = await synthesizeSpeech(text, {...await speechConfig(join(projectRoot, ".env")), language});
      response.writeHead(200, {"Content-Type":"audio/mpeg", "Content-Length":audio.length, "Cache-Control":"no-store"});
      return response.end(audio);
    }

    if (request.method === "GET" && url.pathname === "/api/environment") {
      return sendJson(response, 200, {
        source: "shells/env.sh",
        values: await loadEnvConfig(),
        fields: environmentFields.map(([name, label]) => ({ name, label })),
      });
    }

    if (request.method === "GET" && url.pathname === "/api/participant-definitions") {
      const input = {};
      if (url.searchParams.has("language")) input.language = url.searchParams.get("language");
      if (url.searchParams.has("scenarioKind")) input.scenarioKind = url.searchParams.get("scenarioKind");
      if (url.searchParams.has("crisisLevel")) input.crisisLevel = Number(url.searchParams.get("crisisLevel"));
      const options = validateRunOptions(input, await loadEnvConfig());
      const localPython = join(projectRoot, ".venv", "bin", "python");
      const python = await stat(localPython).then(() => localPython, () => process.env.PYTHON_BIN || "python3");
      const { stdout } = await executeFile(python, ["-m", "privacy_boundary_eval.inspection", "--options", JSON.stringify(options)], {
        cwd: projectRoot, timeout: 15000, maxBuffer: 8 * 1024 * 1024,
        env: {...process.env, PYTHONPATH: join(projectRoot, "src")},
      });
      return sendJson(response, 200, JSON.parse(stdout));
    }

    if (request.method === "GET" && url.pathname === "/api/runs") {
      const items = [...runs.values()]
        .map(publicRun)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      return sendJson(response, 200, { runs: items });
    }

    if (request.method === "GET" && url.pathname === "/api/results") {
      return sendJson(response, 200, { results: await listSavedResults() });
    }

    if (parts[0] === "api" && parts[1] === "results" && parts[2]) {
      const saved = await readSavedResult(parts[2]);
      const resultAction = request.method === "DELETE" && parts.length === 3 ? "delete"
        : request.method === "POST" && parts.length === 4 && parts[3] === "arxiv" ? "arxiv" : null;
      if (resultAction) {
        if (request.headers.origin && request.headers.origin !== url.origin) return sendJson(response, 403, {error:"Request origin is not allowed."});
        if ([...runs.values()].some(run => ["running", "starting", "stopping"].includes(run.status) && dirname(saved.path) === run.outputDir)) {
          return sendJson(response, 409, {error:"Archive or delete running results after the run finishes."});
        }
        const environment = await loadEnvConfig();
        const changed = await mutateSavedResult({projectRoot, roots:resultRoots(environment), saved, action:resultAction});
        if (!changed.path) return sendJson(response, 200, {ok:true, deletedId:saved.id});
        const {artifact:_artifact, path:_path, ...result} = await readSavedArtifact(changed.path, environment);
        return sendJson(response, 200, {ok:true, result});
      }
      if (request.method === "GET" && parts.length === 3) {
        const { path: _path, ...publicSaved } = saved;
        publicSaved.participantDefinitions = saved.artifact.participant_definitions?.participants
          ? saved.artifact.participant_definitions
          : legacyDefinitions(saved.artifact, (await resultExport(saved)).metadata);
        return sendJson(response, 200, publicSaved);
      }
      if (request.method === "GET" && parts[3] === "export") {
        const exported = await resultExport(saved);
        response.setHeader("Content-Disposition", 'attachment; filename="experiment-result.json"');
        return sendJson(response, 200, exported);
      }
      if (request.method === "GET" && parts[3] === "artifact") {
        return await sendSavedArtifact(response, saved.path);
      }
      if (request.method === "POST" && parts[3] === "rerun") {
        if ([...runs.values()].some((run) => run.status === "running")) {
          return sendJson(response, 409, { error: "An experiment is already running." });
        }
        const environment = await loadEnvConfig();
        const options = validateRunOptions(saved.options, environment);
        const run = await startRun(options, saved.relativePath);
        return sendJson(response, 202, publicRun(run));
      }
    }

    if (request.method === "POST" && url.pathname === "/api/runs") {
      if ([...runs.values()].some((run) => run.status === "running")) {
        return sendJson(response, 409, { error: "An experiment is already running." });
      }
      const environment = await loadEnvConfig();
      const options = validateRunOptions(await readJson(request), environment);
      const run = await startRun(options);
      return sendJson(response, 202, publicRun(run));
    }

    if (parts[0] === "api" && parts[1] === "runs" && parts[2]) {
      const run = runs.get(parts[2]);
      if (!run) return sendJson(response, 404, { error: "Run not found." });

      if (request.method === "GET" && parts.length === 3) {
        return sendJson(response, 200, publicRun(run));
      }
      if (request.method === "GET" && parts[3] === "events") {
        return openEventStream(request, response, run);
      }
      if (request.method === "DELETE" && parts.length === 3) {
        if (run.status !== "running") {
          return sendJson(response, 409, { error: "This task is not currently running." });
        }
        run.cancelled = true;
        run.child.kill("SIGTERM");
        emit(run, "process.stopping", { message: "The user stopped the run." });
        return sendJson(response, 202, { ok: true });
      }
      if (request.method === "GET" && parts[3] === "artifacts" && parts.length === 4) {
        return sendJson(response, 200, { artifacts: await listArtifacts(run) });
      }
      if (request.method === "GET" && parts[3] === "artifacts" && parts[4]) {
        return await sendArtifact(response, run, parts[4]);
      }
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return sendJson(response, 405, { error: "Unsupported request." });
    }
    return serveStatic(response, url.pathname, request.method === "HEAD");
  } catch (error) {
    const status = error.statusCode || 500;
    sendJson(response, status, { error: status === 500 ? "Server error." : error.message });
    if (status === 500) console.error(error);
  }
});

let usingAutomaticPort = port === 0;
server.on("error", (error) => {
  if (error.code === "EADDRINUSE" && !usingAutomaticPort) {
    usingAutomaticPort = true;
    console.log(`Port ${port} is already in use; selecting an available port.`);
    server.listen(0, host);
    return;
  }
  console.error(`Unable to start server: ${error.message}`);
  process.exitCode = 1;
});
server.once("listening", () => {
  console.log(`\n  Multi-Agent Dark-Web Safety  http://${host}:${server.address().port}\n`);
});
server.listen(port, host);

async function startRun(options, replayOf = null) {
  const id = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const webOutputRoot = resolveWorkspacePath(options.webOutputDir, "WEB_OUTPUT_DIR");
  const outputDir = join(webOutputRoot, id);
  await mkdir(outputDir, { recursive: true });
  const args = [
    runScript,
    "--scenario", options.scenarioKind,
    "--crisis-level", String(options.crisisLevel),
    "--p2-execution", options.p2Execution,
    "--architecture", options.architecture,
    "--attack", options.attack,
    "--difficulty", options.difficulty,
    "--max-runs", "1",
    "--turns", String(options.turns),
    "--candidate-count", String(options.candidateCount),
    "--target-count", String(options.targetCount),
    "--output-dir", outputDir,
    "--language", options.language,
    "--backend", options.backend,
    "--event-stream",
  ];
  if (options.efficientInteractions) args.push("--efficient-interactions");
  if (options.conditionSeed != null) args.push("--condition-seed", String(options.conditionSeed));
  if (options.conditionRepetition != null) args.push("--condition-repetition", String(options.conditionRepetition));
  if (options.backend === "mock") args.push("--mock-policy", options.mockPolicy);
  if (options.backend === "pi") args.push("--provider", options.provider);
  if (options.model) args.push("--model", options.model);
  if (options.compact) args.push("--compact");
  if (options.finalize) args.push("--finalize");

  const run = {
    id,
    status: "running",
    createdAt: new Date().toISOString(),
    completedAt: null,
    options,
    outputDir,
    child: null,
    cancelled: false,
    events: [],
    clients: new Set(),
    nextEventId: 0,
    metrics: null,
    runnerRunId: null,
    replayOf,
  };
  runs.set(id, run);
  emit(run, "process.started", { options });

  const child = spawn("bash", args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      API_MODEL: options.model,
      API_PROVIDER: options.provider,
      EXPERIMENT_LANGUAGE: options.language,
      BACKEND: options.backend,
      MOCK_POLICY: options.mockPolicy,
      SCENARIO_KIND: options.scenarioKind,
      CRISIS_LEVEL: String(options.crisisLevel),
      P2_EXECUTION: options.p2Execution,
      ARCHITECTURE: options.architecture,
      ATTACK: options.attack,
      DIFFICULTY: options.difficulty,
      ROUNDS: String(options.rounds),
      CANDIDATE_COUNT: String(options.candidateCount),
      TARGET_COUNT: String(options.targetCount),
      FINALIZE: String(options.finalize),
      COMPACT: String(options.compact),
      WEB_RUN_ID: id,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  run.child = child;
  consumeLines(child.stdout, (line) => handleStdout(run, line));
  consumeLines(child.stderr, (line) => emit(run, "log.stderr", { message: line }));
  child.on("error", (error) => {
    run.status = "failed";
    run.completedAt = new Date().toISOString();
    emit(run, "process.error", { message: error.message });
  });
  child.on("close", async (code, signal) => {
    run.completedAt = new Date().toISOString();
    if (run.cancelled) run.status = "cancelled";
    else if (code !== 0) run.status = "failed";
    else if (run.status === "running") run.status = "completed";
    if (run.status === "cancelled" || run.status === "failed") {
      try { await savePartialRun(run); }
      catch (error) { emit(run, "log.stderr", {message: `Failed to save partial run: ${error.message}`}); }
    }
    emit(run, "process.exited", { code, signal, status: run.status });
    for (const client of run.clients) client.end();
    run.clients.clear();
  });
  return run;
}

function handleStdout(run, line) {
  if (!line.startsWith(WEB_EVENT_PREFIX)) {
    if (line.trim()) emit(run, "log.stdout", { message: line });
    return;
  }
  try {
    const parsed = JSON.parse(line.slice(WEB_EVENT_PREFIX.length));
    const { type = "runner.event", timestamp, ...payload } = parsed;
    if (type === "run_start") run.runnerRunId = payload.run_id;
    if (type === "run_end") {
      run.metrics = payload.metrics;
      run.status = "completed";
    }
    if (type === "run_error") run.status = "failed";
    emit(run, type, payload, timestamp);
  } catch (error) {
    emit(run, "protocol.error", { message: error.message, line });
  }
}

function emit(run, type, payload = {}, timestamp = new Date().toISOString()) {
  const event = { id: ++run.nextEventId, type, timestamp, ...payload };
  run.events.push(event);
  if (run.events.length > 5000) run.events.shift();
  const encoded = `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of run.clients) client.write(encoded);
}

function openEventStream(request, response, run) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.write("retry: 1500\n\n");
  const lastEventId = Number.parseInt(request.headers["last-event-id"] || "0", 10) || 0;
  for (const event of run.events) {
    if (event.id > lastEventId) {
      response.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
    }
  }
  if (run.status !== "running") return response.end();
  run.clients.add(response);
  const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 15000);
  request.on("close", () => {
    clearInterval(heartbeat);
    run.clients.delete(response);
  });
}

function validateRunOptions(input, environment) {
  const pick = (name, allowed, fallback) => {
    const value = input[name] ?? fallback;
    if (!allowed.includes(value)) badRequest(`${name} Invalid value.`);
    return value;
  };
  const boundedInt = (name, fallback, min, max) => {
    const value = Number(input[name] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) {
      badRequest(`${name} must be an integer between ${min} and ${max}.`);
    }
    return value;
  };
  const demo = input.mockPolicy === "demo" && input.backend === "mock";
  if (demo) input = {...input, architecture: "multi", scenarioKind: "emergency_recruitment",
    crisisLevel: 2, rounds: 10, efficientInteractions: false, finalize: true};
  const architecture = pick("architecture", ["single", "multi"], environment.ARCHITECTURE || "multi");
  const scenarioKind = pick("scenarioKind", ["candidate_selection", "emergency_recruitment"], environment.SCENARIO_KIND || "emergency_recruitment");
  const emergency = scenarioKind === "emergency_recruitment";
  const crisisLevel = pick("crisisLevel", [1, 2, 3], Number(environment.CRISIS_LEVEL || 1));
  const candidateCount = emergency ? 5 : boundedInt("candidateCount", environment.CANDIDATE_COUNT || 6, 2, 500);
  const targetCount = emergency ? 5 : boundedInt("targetCount", environment.TARGET_COUNT || 4, 1, 499);
  if (!emergency && targetCount >= candidateCount) badRequest("targetCount must be less than candidateCount.");
  const rounds = boundedInt("rounds", environment.ROUNDS || 1, 1, 20);
  const model = String(input.model ?? environment.API_MODEL ?? "").trim().slice(0, 120);
  if (!model || model.startsWith("-") || !/^[a-zA-Z0-9._:/@-]+$/.test(model)) {
    badRequest("Invalid API_MODEL value.");
  }
  const provider = String(input.provider ?? environment.API_PROVIDER ?? "openai").trim();
  if (!provider || provider.startsWith("-") || !/^[a-zA-Z0-9._-]+$/.test(provider)) {
    badRequest("Invalid API_PROVIDER value.");
  }
  const conditionSeed = input.conditionSeed == null ? null : Number(input.conditionSeed);
  const conditionRepetition = input.conditionRepetition == null ? null : Number(input.conditionRepetition);
  if (conditionSeed != null && !Number.isSafeInteger(conditionSeed)) badRequest("conditionSeed Invalid value.");
  if (conditionRepetition != null && (!Number.isInteger(conditionRepetition) || conditionRepetition < 1)) badRequest("conditionRepetition Invalid value.");
  return {
    language: pick("language", ["en", "ko"], environment.EXPERIMENT_LANGUAGE || "en"),
    architecture,
    scenarioKind,
    crisisLevel,
    p2Execution: pick("p2Execution", ["observe", "block"], environment.P2_EXECUTION || "observe"),
    attack: pick("attack", ["control", "attack"], environment.ATTACK || "control"),
    difficulty: pick("difficulty", ["easy", "hard", "impossible"], environment.DIFFICULTY || "easy"),
    backend: pick("backend", ["mock", "openai", "pi"], environment.BACKEND || "mock"),
    mockPolicy: pick("mockPolicy", ["safe", "vulnerable", "demo"], environment.MOCK_POLICY || "safe"),
    provider,
    rounds: emergency ? Math.min(rounds, 10) : rounds,
    efficientInteractions: emergency && crisisLevel === 1 && input.efficientInteractions === true,
    turns: Math.min(99, emergency && crisisLevel === 1 && architecture === "multi" && input.efficientInteractions === true
      ? 4 + Math.min(rounds, 10) * 6
      : rounds * (architecture === "multi" ? (emergency ? 10 : 5) : 1)),
    candidateCount,
    targetCount,
    model,
    compact: input.compact == null ? parseBoolean(environment.COMPACT, true) : input.compact !== false,
    finalize: input.finalize == null ? parseBoolean(environment.FINALIZE, true) : input.finalize !== false,
    webOutputDir: environment.WEB_OUTPUT_DIR || "results/web",
    conditionSeed,
    conditionRepetition,
  };
}

async function listSavedResults() {
  const environment = await loadEnvConfig();
  const roots = resultRoots(environment);
  const seen = new Set();
  const results = [];
  for (const root of roots) {
    for (const path of await findJsonArtifacts(root)) {
      const relativePath = relativeProjectPath(path);
      if (seen.has(relativePath)) continue;
      seen.add(relativePath);
      try {
        const { artifact: _artifact, path: _path, ...summary } = await readSavedArtifact(path, environment);
        results.push(summary);
      } catch {
        // Aggregate and unrelated JSON files are intentionally ignored.
      }
    }
  }
  return results
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function readSavedResult(id) {
  const environment = await loadEnvConfig();
  const path = await resolveResultPath(projectRoot, resultRoots(environment), id);
  return readSavedArtifact(path, environment);
}

async function readSavedArtifact(path, environment) {
  const info = await stat(path);
  if (!info.isFile() || info.size > 20 * 1024 * 1024) throw new Error("Invalid artifact");
  const artifact = JSON.parse(await readFile(path, "utf8"));
  if (!artifact.run_id || !artifact.condition || !artifact.metrics || !Array.isArray(artifact.decisions)) {
    throw new Error("Invalid artifact");
  }
  const sidecarName = `${path.slice(0, -".json".length)}.execution.json`;
  const manifest = await readOptionalJson(sidecarName) || await readOptionalJson(join(dirname(path), "execution.json"));
  const relativePath = relativeProjectPath(path);
  const options = replayOptions(artifact, manifest, environment);
  return {
    ...savedSummary({ artifact, manifest, options, relativePath, path, info }),
    artifact,
    options,
    path,
  };
}

function savedSummary(saved) {
  const { artifact, manifest, options, relativePath, path, info } = saved;
  const createdAt = manifest?.created_at || info?.mtime?.toISOString() || new Date().toISOString();
  return {
    id: Buffer.from(relativePath).toString("base64url"),
    runId: artifact.run_id,
    status: artifact.status || "completed",
    partial: artifact.partial === true,
    relativePath,
    arxived: isArxived(projectRoot, path),
    createdAt,
    source: relativePath.includes("/web/") ? "web" : "shell",
    settingsSource: manifest ? "manifest" : "derived",
    options,
    metrics: artifact.metrics,
    recorded: recordedRunStats(artifact, manifest),
    artifactUrl: `/api/results/${Buffer.from(relativePath).toString("base64url")}/artifact`,
  };
}

function replayOptions(artifact, manifest, environment) {
  const architecture = artifact.condition.architecture;
  const settings = manifest?.settings || {};
  const discussionDecisions = artifact.decisions.filter((item) => item.phase !== "final");
  const discussionTurns = settings.turns_per_run || discussionDecisions.length || artifact.decisions.length || 1;
  const callsPerRound = architecture === "multi"
    ? (artifact.decisions.some((item) => item.phase === "meeting") ? 10 : 5) : 1;
  return {
    language: settings.language || artifact.language || "ko",
    architecture,
    scenarioKind: settings.scenario_kind || artifact.scenario?.kind || "candidate_selection",
    crisisLevel: settings.crisis_level ?? artifact.crisis_level ?? 1,
    p2Execution: settings.p2_execution || "observe",
    attack: artifact.condition.attack ? "attack" : "control",
    difficulty: artifact.condition.difficulty,
    backend: manifest?.backend || environment.BACKEND || "mock",
    mockPolicy: manifest?.mock_policy || environment.MOCK_POLICY || "safe",
    provider: manifest?.provider || environment.API_PROVIDER || "openai",
    model: manifest?.model || environment.API_MODEL || "gpt-4o-mini",
    efficientInteractions: settings.efficient_interactions ?? false,
    rounds: Math.max(1, Math.ceil(settings.efficient_interactions && architecture === "multi"
      ? (discussionTurns - 4) / 6 : discussionTurns / callsPerRound)),
    candidateCount: settings.candidate_count || artifact.scenario?.candidates?.length || Number(environment.CANDIDATE_COUNT || 6),
    targetCount: settings.target_count || artifact.scenario?.target_count || Number(environment.TARGET_COUNT || 4),
    compact: settings.compact ?? parseBoolean(environment.COMPACT, true),
    finalize: settings.finalize ?? artifact.decisions.some((item) => item.phase === "final"),
    conditionSeed: artifact.condition.seed,
    conditionRepetition: artifact.condition.repetition,
  };
}

function resultRoots(environment) {
  const candidates = ["results", "arxived_results", environment.OUTPUT_DIR, environment.WEB_OUTPUT_DIR].filter(Boolean);
  return [...new Set(candidates.map((value) => resolveWorkspacePath(value, "result path")))];
}

async function findJsonArtifacts(root, depth = 0) {
  if (depth > 5) return [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const paths = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...await findJsonArtifacts(path, depth + 1));
    else if (
      entry.isFile()
      && entry.name.endsWith(".json")
      && !entry.name.endsWith(".execution.json")
      && !["aggregate.json", "execution.json"].includes(entry.name)
    ) paths.push(path);
  }
  return paths;
}

async function readOptionalJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    return null;
  }
}

function relativeProjectPath(path) {
  const relative = path.slice(projectRoot.length + 1);
  if (!relative || relative.startsWith("..")) throw new Error("Invalid result path");
  return relative;
}

function parseBoolean(value, fallback) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function resolveWorkspacePath(value, name) {
  const path = resolve(projectRoot, value);
  if (path !== projectRoot && !path.startsWith(projectRoot + sep)) {
    badRequest(`${name} must be a path inside the project.`);
  }
  return path;
}

async function loadEnvConfig() {
  const names = environmentFields.map(([name]) => name).join(" ");
  const command = `source "$1"\nfor name in ${names}; do printf '%s\\0%s\\0' "$name" "\${!name-}"; done`;
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("bash", ["-c", command, "pbe-env", envScript], {
      cwd: projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`shells/env.sh Failed to load: ${Buffer.concat(stderr).toString("utf8").trim()}`));
        return;
      }
      const parts = Buffer.concat(stdout).toString("utf8").split("\0");
      const values = {};
      for (let index = 0; index + 1 < parts.length; index += 2) {
        if (environmentFields.some(([name]) => name === parts[index])) values[parts[index]] = parts[index + 1];
      }
      resolvePromise(values);
    });
  });
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 64 * 1024) badRequest("Request body is too large.");
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    badRequest("JSON Unable to parse request.");
  }
}

async function listArtifacts(run) {
  try {
    const entries = await readdir(run.outputDir, { withFileTypes: true });
    return Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
      const info = await stat(join(run.outputDir, entry.name));
      return { name: entry.name, size: info.size, url: `/api/runs/${run.id}/artifacts/${encodeURIComponent(entry.name)}` };
    }));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function sendArtifact(response, run, name) {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) return sendJson(response, 400, { error: "Invalid file name." });
  const path = join(run.outputDir, name);
  if (!resolve(path).startsWith(resolve(run.outputDir) + sep)) return sendJson(response, 403, { error: "Path is not allowed." });
  try {
    const info = await stat(path);
    if (!info.isFile()) return sendJson(response, 404, { error: "File not found." });
  } catch (error) {
    if (error.code === "ENOENT") return sendJson(response, 404, { error: "File not found." });
    throw error;
  }
  response.writeHead(200, {
    "Content-Type": contentTypes[extname(name)] || "application/octet-stream",
    "Content-Disposition": `inline; filename="${name}"`,
  });
  const stream = createReadStream(path);
  stream.on("error", () => response.destroy());
  stream.pipe(response);
}

async function sendSavedArtifact(response, path) {
  try {
    const info = await stat(path);
    if (!info.isFile()) return sendJson(response, 404, { error: "Result file not found." });
  } catch (error) {
    if (error.code === "ENOENT") return sendJson(response, 404, { error: "Result file not found." });
    throw error;
  }
  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `inline; filename="${path.split(sep).at(-1)}"`,
  });
  const stream = createReadStream(path);
  stream.on("error", () => response.destroy());
  stream.pipe(response);
}

async function serveStatic(response, pathname, headOnly) {
  const relative = pathname === "/" ? "index.html" : normalize(pathname).replace(/^[/\\]+/, "");
  // Expose only this visualization from UI; keep the rest of the repository private.
  const isTokenTimeline = pathname === "/token-timeline.html";
  const isPreviewImage = ["/assets/image_main.png", "/assets/image_measure.png"].includes(pathname);
  const path = isTokenTimeline ? join(projectRoot, "UI", "token-timeline.html")
    : isPreviewImage ? join(projectRoot, "assets", pathname.split("/").at(-1)) : resolve(publicDir, relative);
  if (!isTokenTimeline && !isPreviewImage && path !== publicDir && !path.startsWith(publicDir + sep)) return sendJson(response, 403, { error: "Path is not allowed." });
  try {
    const info = await stat(path);
    if (!info.isFile()) throw Object.assign(new Error("Not found"), { code: "ENOENT" });
    response.writeHead(200, { "Content-Type": contentTypes[extname(path)] || "application/octet-stream" });
    if (headOnly) return response.end();
    createReadStream(path).pipe(response);
  } catch (error) {
    if (error.code === "ENOENT") return sendJson(response, 404, { error: "Page not found." });
    throw error;
  }
}

function sendJson(response, status, data) {
  if (response.headersSent) return response.end();
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function publicRun(run) {
  return {
    id: run.id,
    status: run.status,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    options: run.options,
    metrics: run.metrics,
    runnerRunId: run.runnerRunId,
    replayOf: run.replayOf,
  };
}

function consumeLines(stream, onLine) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      onLine(buffer.slice(0, index).replace(/\r$/, ""));
      buffer = buffer.slice(index + 1);
    }
  });
  stream.on("end", () => {
    if (buffer) onLine(buffer);
  });
}
