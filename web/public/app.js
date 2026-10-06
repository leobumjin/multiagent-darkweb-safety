import {scenarioDefinition, metricValue} from "./scenario-definition.js";
import {estimateRunCost, costLabel, estimateUsageCost} from "./model-pricing.js";
import {tokenUsage, savedRunUsage} from "./run-usage.js";
import { informationUse } from "./information-use.js";
import { timelineRun } from "./timeline-run.js";
import { messageScope, emailScope } from "./conversation-scope.js";
import { participant } from "./participants.js";
import { explorationText } from "./exploration-plan.js";
import { createReplay } from "./conversation-replay.js";
import { createReplayNetwork } from "./replay-network.js";
const replayNetwork = createReplayNetwork(document.querySelector("#replayNetwork"));
const conversationReplay = createReplay(document.querySelector("#conversationReplay"), (message, history) => replayNetwork.show(message, history), (messages,cursor) => replayNetwork.updateAnxiety(messages,cursor));
import { createTimeline } from "./sensitive-timeline.js";
const sensitiveTimeline = createTimeline();
let timelineRunLabel = "No run loaded";
let summaryFinalMetrics = null;
let restoredUsage = null;
function syncSensitiveTimeline() {
  renderQuantMetrics();
  tokenTimeline.contentWindow?.postMessage({ type: "sensitive-timeline", run: timelineRunLabel, records: sensitiveTimeline.snapshot() }, location.origin);
}
let usageModel = null;
function renderQuantMetrics() {
  const target = document.querySelector("#summaryQuantCards");
  if (!target) return;
  const rows = sensitiveTimeline.snapshot(), decisions = rows.filter(r=>r.type === "decision");
  const run = timelineRun(timelineRunLabel, rows);
  const usage = restoredUsage || tokenUsage(summaryFinalMetrics || {}, decisions.map(row => ({
    input_tokens: row.inputTokens, output_tokens: row.outputTokens, cached_input_tokens: row.cachedTokens,
  })));
  const {inputTokens: input, outputTokens: output, cachedInputTokens: cached} = usage;
  const formatToken = value => value == null ? (restoredUsage || rows.length ? '—' : '0') : Number(value).toLocaleString();
  document.querySelector('#liveTokenInput').textContent = formatToken(input);
  document.querySelector('#liveTokenOutput').textContent = formatToken(output);
  document.querySelector('#liveTokenTotal').textContent = formatToken(usage.totalTokens);
  document.querySelector('#liveTokenStatus').textContent = restoredUsage
    ? (restoredUsage.partial ? 'Partial run' : 'Saved run') : 'Updated after each response';
  document.querySelector('#liveTokenNote').textContent = usageModel === 'mock'
    ? 'Mock Mock run · no API tokens or charges'
    : (restoredUsage || rows.length) && (input === null || output === null)
      ? 'Token usage not recorded · estimates excluded'
      : restoredUsage
        ? `Saved API reported usage · ${usageModel || 'Run model not recorded'}${cached === null ? ' · Cache usage not recorded: cost estimated without discounts' : ''}`
        : 'API reported usage · in-progress responses appear after completion';
  document.querySelector('#liveTokenCached').textContent = cached == null ? '—' : Number(cached).toLocaleString();
  const cost = estimateUsageCost(usageModel, input, output, cached);
  const costNode = document.querySelector('#liveTokenCost');
  costNode.textContent = cost == null ? '—' : `$${cost.toFixed(4)}`;
  costNode.title = `${usageModel || 'Run model not recorded'} · Current Standard pricing estimate · ${cached == null ? 'Cache not recorded: no discount applied' : 'Cache-read discount included'} · Excludes cache writes, tools, tax, and long-context surcharges`;

  const cards = scenarioDefinition.metrics.map(definition => [definition.label,
    metricValue(definition.selector, {usage, records:rows, hits:run.hits}), definition.unit, definition.note]);
  const metric = ([label,value,unit,note],index)=>`<article class="quant-tone-${index}"><span>${label}</span><strong>${value == null ? '—' : Number(value).toLocaleString()}<small>${unit}</small></strong><p>${note}</p></article>`;
  target.innerHTML = cards.filter((_,index)=>scenarioDefinition.metrics[index].section === "summary").map(metric).join('') + `<div class="summary-cost"><b>Usage</b>${cards.filter((_,index)=>scenarioDefinition.metrics[index].section === "usage").map(([label,value,unit])=>`<span>${label} <strong>${value == null ? '—' : Number(value).toLocaleString()}${unit}</strong></span>`).join('')}<small>Tokens: API reported usage · Mock runs use 0 · unrecorded values shown as —</small></div>`;
}
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

// Keep the original visualization isolated from dashboard styles and size it to
// its content, including font loads, responsive wrapping, and playback updates.
const tokenTimeline = $("#tokenTimeline");
let tokenTimelineObserver;
function fitTokenTimeline() {
  tokenTimelineObserver?.disconnect();
  const page = tokenTimeline.contentDocument?.querySelector(".page");
  if (!page) return;
  const resize = () => {
    tokenTimeline.style.height = `${Math.ceil(page.getBoundingClientRect().height)}px`;
  };
  tokenTimelineObserver = new ResizeObserver(resize);
  tokenTimelineObserver.observe(page);
  resize();
}
tokenTimeline.addEventListener("load", () => { fitTokenTimeline(); syncSensitiveTimeline(); });
fitTokenTimeline();
window.addEventListener("message", event => {
  if (event.origin === location.origin && event.source === tokenTimeline.contentWindow && event.data?.type === "sensitive-timeline-ready") syncSensitiveTimeline();
});

const elements = {
  form: $("#runForm"),
  runButton: $("#runButton"),
  stopButton: $("#stopButton"),
  model: $("#modelSelect"),
  crisisLevel: $("#crisisLevelSelect"),
  reloadHistory: $("#reloadHistory"),
  historyList: $("#historyList"),
  runState: $("#runState"),
  agentNodes: $("#agentNodes"),
  permissionP0: $("#permissionP0"),
  permissionP1: $("#permissionP1"),
  permissionP2: $("#permissionP2"),
  eventCount: $("#eventCount"),
  conversationCount: $("#conversationCount"),
  generatedCount: $("#generatedCount"),
  logCount: $("#logCount"),
  emptyState: $("#emptyState"),
  timeline: $("#timeline"),
  conversationPanel: $("#conversationPanel"),
  selectedEvent: $("#selectedEventPanel"),
  generatedList: $("#generatedList"),
  console: $("#consoleOutput"),
  artifactBar: $("#artifactBar"),
  followLive: $("#followLive"),
  toast: $("#toast"),
  calls: $("#callsMetric"),
  utility: $("#utilityMetric"),
  privacy: $("#privacyMetric"),
  reach: $("#reachMetric"),
  depth: $("#depthMetric"),
  violations: $("#violationMetric"),
  propagation: $("#propagationMetric"),
  riskLinePath: $("#riskLinePath"),
  riskAreaPath: $("#riskAreaPath"),
  riskMarkers: $("#riskMarkers"),
  riskAxis: $("#riskAxis"),
};

const privacyRank = { P0: 0, P1: 1, P2: 2 };
const stageRank = { none: 0, mention: 1, justify: 2, delegate: 3, execute: 4 };
const actionStage = { mention: "mention", justify: "justify", delegate: "delegate", query: "execute", share: "execute", use: "execute" };
const positions = {
  Scout: [17, 52],
  Researcher: [50, 19],
  RelationshipMapper: [83, 52],
  Profiler: [83, 52],
  Outreach: [70, 82],
  Coordinator: [37, 82],
  Generalist: [50, 52],
  CrisisLead: [25, 26],
  ImpatientRecruiter: [75, 26],
  CalmRecruiter: [75, 76],
  SecurityExpert: [25, 76],
};

const state = {
  runId: null,
  status: "idle",
  source: null,
  events: 0,
  decisions: [],
  darkEvents: [],
  logs: 0,
  agents: new Map(),
  architecture: null,
  maxPrivacy: "P0",
  maxStage: "none",
  interimCalls: 0,
  environment: {},
  savedResults: [],
  historyFilter: "all",
  historyBusy: false,
  restoredResultId: null,
  riskPoints: [],
  activeFilter: "all",
  selectedIndex: -1,
  scenarioKind: "emergency_recruitment",
  consentOutcomes: new Map(),
  privateContactCount: 0,
  agentMemories: {},
  candidateMemories: {},
};
let toastTimer;
let definitionRequest = 0;

const scenarioDialog = $("#scenarioDialog");
const runLogDialog = $("#runLogDialog");
$("#historyFilters").addEventListener("click", event => {
  const button = event.target.closest("button[data-history-filter]");
  if (!button) return;
  state.historyFilter = button.dataset.historyFilter;
  renderHistory();
});
$("#openRunLog").addEventListener("click", () => {
  runLogDialog.showModal();
  document.body.classList.add("scenario-opened");
  loadHistory(false, false);
});
$("#closeRunLog").addEventListener("click", () => runLogDialog.close());
runLogDialog.addEventListener("close", () => document.body.classList.remove("scenario-opened"));
runLogDialog.addEventListener("click", (event) => {
  if (event.target !== runLogDialog) return;
  const rect = runLogDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) runLogDialog.close();
});
const taskMode = scenarioDefinition.mode;
$("#modeTitle").textContent = taskMode.title;
$("#crisisLevelLabel").textContent = taskMode.label;
elements.crisisLevel.replaceChildren(...taskMode.levels.map(level => new Option(level.label, String(level.value))));
elements.crisisLevel.value = String(taskMode.default);

const dashboardTabs = $$("[data-dashboard]");
for (const button of dashboardTabs) {
  button.addEventListener("click", () => showDashboard(button.dataset.dashboard));
  button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = dashboardTabs.indexOf(button);
    const next = event.key === "Home" ? 0 : event.key === "End" ? dashboardTabs.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + dashboardTabs.length) % dashboardTabs.length;
    dashboardTabs[next].focus();
    showDashboard(dashboardTabs[next].dataset.dashboard);
  });
}
function showDashboard(name) {
  if (name !== "replay") { conversationReplay.pause(); replayNetwork.hideSoul(); }
  if (!dashboardTabs.some((button) => button.dataset.dashboard === name)) name = "summary";
  for (const button of dashboardTabs) {
    const selected = button.dataset.dashboard === name;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  for (const panel of $$("[data-dashboard-panel]")) panel.hidden = panel.dataset.dashboardPanel !== name;
  history.replaceState(null, "", `#${name}`);
  if (name === "sensitive") { fitTokenTimeline(); syncSensitiveTimeline(); }
}
window.addEventListener("hashchange", () => showDashboard(location.hash.slice(1)));
showDashboard(location.hash.slice(1));
$("#openScenario").addEventListener("click", () => {
  const emergency = state.scenarioKind === "emergency_recruitment";
  $("#scenarioDialogTitle").textContent = emergency ? "National AI emergency team recruitment" : "AI Founder selection experiment";
  $("#emergencyScenarioDetails").hidden = !emergency;
  $("#selectionScenarioDetails").hidden = emergency;
  scenarioDialog.showModal();
  scenarioDialog.scrollTop = 0;
  document.body.classList.add("scenario-opened");
});
$("#closeScenario").addEventListener("click", () => scenarioDialog.close());
scenarioDialog.addEventListener("close", () => document.body.classList.remove("scenario-opened"));
scenarioDialog.addEventListener("click", (event) => {
  if (event.target !== scenarioDialog) return;
  const rect = scenarioDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) scenarioDialog.close();
});

$("#scenarioSelect").addEventListener("change", () => {
  if (!["running", "starting"].includes(state.status)) {
    resetView();
    setScenario(elements.form.elements.namedItem("scenarioKind").value);
    setupAgents(state.environment.ARCHITECTURE || "multi", true);
    refreshParticipantDefinitions();
  }
});

elements.form.addEventListener("submit", startRun);
elements.stopButton.addEventListener("click", stopRun);
elements.reloadHistory.addEventListener("click", () => loadHistory(false, true));
elements.historyList.addEventListener("click", handleHistoryAction);
elements.timeline.addEventListener("click", (event) => {
  const entry = event.target.closest(".timeline-entry");
  if (!entry) return;
  if (entry.dataset.darkEventIndex != null) selectDarkEvent(Number(entry.dataset.darkEventIndex));
  else selectDecision(Number(entry.dataset.decisionIndex));
});
for (const tab of $$(".tab")) {
  tab.addEventListener("click", () => {
    $$(".tab").forEach((item) => item.classList.toggle("active", item === tab));
    $$(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === tab.dataset.tab));
  });
}
for (const tab of $$(".log-tab")) {
  tab.addEventListener("click", () => {
    state.activeFilter = tab.dataset.filter;
    $$(".log-tab").forEach((item) => item.classList.toggle("active", item === tab));
    applyLogFilter();
  });
}
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !scenarioDialog.open && !runLogDialog.open && !["running", "starting"].includes(state.status)) {
    elements.form.requestSubmit();
  }
});

function syncLanguageButtons() {
  for (const button of $$("[data-experiment-language]")) {
    button.setAttribute("aria-pressed", String(button.dataset.experimentLanguage === $("#languageSelect").value));
    button.disabled = $("#languageSelect").disabled;
  }
}
for (const button of $$("[data-experiment-language]")) {
  button.addEventListener("click", () => {
    if (button.disabled) return;
    $("#languageSelect").dataset.userSelected = "true";
    setFieldValue("language", button.dataset.experimentLanguage);
    $("#languageSelect").dispatchEvent(new Event("change", {bubbles: true}));
  });
}
$("#languageSelect").addEventListener("change", () => { syncLanguageButtons(); refreshParticipantDefinitions(); });

await initialize();

async function initialize() {
  await loadEnvironment();
  setupAgents(state.environment.ARCHITECTURE || "multi", true);
  await refreshParticipantDefinitions();
  await restoreLastRun();
  await loadHistory(false, false);
}

async function loadEnvironment() {
  try {
    const response = await fetch(`/api/environment?refresh=${Date.now()}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "env.shCould not read.");
    state.environment = payload.values || {};
    applyEnvironmentToForm(state.environment);
  } catch (error) {
    showToast(error.message);
  }
}

function applyEnvironmentToForm(environment) {
  if (!$("#languageSelect").dataset.userSelected) setFieldValue("language", environment.EXPERIMENT_LANGUAGE || "en");
  setFieldValue("scenarioKind", environment.SCENARIO_KIND);
  setFieldValue("crisisLevel", environment.CRISIS_LEVEL || 1);
  if (!["running", "starting"].includes(state.status)) setScenario(elements.form.elements.namedItem("scenarioKind").value);
  selectModel(environment.BACKEND === "mock" ? "mock" : environment.API_MODEL || "gpt-4o-mini");
}

async function refreshParticipantDefinitions() {
  if (state.runId || state.restoredResultId || ["running", "starting", "stopping"].includes(state.status)) return;
  const ticket = ++definitionRequest;
  const query = new URLSearchParams({language: $("#languageSelect").value, scenarioKind: state.scenarioKind, crisisLevel: elements.crisisLevel.value});
  replayNetwork.setDefinitions(null);
  try {
    const response = await fetch(`/api/participant-definitions?${query}`);
    if (!response.ok) throw new Error("Unable to load participant definitions.");
    const definitions = await response.json();
    if (ticket === definitionRequest) replayNetwork.setDefinitions(definitions);
  } catch {
    if (ticket === definitionRequest) replayNetwork.setDefinitions({source:"error", participants:{}});
  }
}
elements.crisisLevel.addEventListener("change", () => { refreshParticipantDefinitions(); updateModelCost(); });

function selectModel(model) {
  if (![...elements.model.options].some((option) => option.value === model)) {
    elements.model.add(new Option(model, model));
  }
  elements.model.value = model;
  updateModelCost();
  updateCrisisMode();
}

function updateCrisisMode() {
  const mode = scenarioDefinition.mode;
  const available = mode.variants.includes(state.scenarioKind)
    && mode.architectures.includes(state.architecture || state.environment.ARCHITECTURE || "multi");
  elements.crisisLevel.disabled = !available || ["running", "starting", "stopping"].includes(state.status);
  const level = mode.levels.find(level => String(level.value) === elements.crisisLevel.value);
  const description = elements.model.value === "demo" ? mode.demoDescription : level.description;
  $("#crisisLevelDescription").textContent = available
    ? description + (elements.model.value === "mock" ? ` ${mode.mockNote}` : "")
    : mode.unavailableDescription;
}
elements.form.addEventListener("change", updateCrisisMode);

function updateModelCost() {
  const scenario = elements.form.elements.namedItem("scenarioKind").value;
  const estimate = estimateRunCost(elements.model.value, scenario, {...state.environment, CRISIS_LEVEL: elements.crisisLevel.value});
  $("#modelCost").textContent = costLabel(estimate);
  $("#modelCostBasis").textContent = `Model-call budget with current settings ${estimate.calls} calls. Model availability depends on your account.`;
  for (const option of elements.model.options) {
    option.dataset.label ||= option.textContent;
    option.textContent = `${option.dataset.label} · ${costLabel(estimateRunCost(option.value, scenario, {...state.environment, CRISIS_LEVEL: elements.crisisLevel.value}))}`;
  }
}
elements.form.addEventListener("change", updateModelCost);

function setFieldValue(name, value) {
  const field = elements.form.elements.namedItem(name);
  if (field && value != null && value !== "") field.value = value;
  if (name === "language") syncLanguageButtons();
}

async function restoreLastRun() {
  try {
    const response = await fetch("/api/runs");
    const payload = await response.json();
    if (!payload.runs?.length) return false;
    const lastRun = payload.runs[0];
    if (!["running", "starting"].includes(lastRun.status)) return false;
    resetView();
    setFieldValue("scenarioKind", lastRun.options?.scenarioKind);
    setFieldValue("language", lastRun.options?.language || "ko");
    setFieldValue("crisisLevel", lastRun.options?.crisisLevel ?? 1);
    selectModel(lastRun.options?.backend === "mock" ? (lastRun.options?.mockPolicy === "demo" ? "demo" : "mock") : lastRun.options?.model || "gpt-4o-mini");
    setScenario(lastRun.options?.scenarioKind || "emergency_recruitment");
    setupAgents(lastRun.options?.architecture || "multi", true);
    state.runId = lastRun.id;
    setRunStatus(lastRun.status);
    connectEvents(lastRun.id);
    return true;
  } catch {
    return false;
  }
}

async function startRun(event) {
  event.preventDefault();
  if (state.status === "running") return stopRun();
  if (["starting", "stopping"].includes(state.status)) return;
  const form = new FormData(elements.form);
  const options = {
    language: form.get("language"),
    scenarioKind: form.get("scenarioKind"),
    crisisLevel: Number(elements.crisisLevel.value),
    backend: ["mock", "demo"].includes(form.get("model")) ? "mock" : "openai",
    mockPolicy: form.get("model") === "demo" ? "demo" : state.environment.MOCK_POLICY || "safe",
    provider: "openai",
    model: ["mock", "demo"].includes(form.get("model")) ? state.environment.API_MODEL || "gpt-4o-mini" : form.get("model"),
  };
  if (form.get("model") === "demo") Object.assign(options, {scenarioKind: "emergency_recruitment",
    architecture: "multi", crisisLevel: 2, rounds: 10, efficientInteractions: false, finalize: true, p2Execution: "observe"});
  resetView();
  setScenario(options.scenarioKind);
  setupAgents(state.environment.ARCHITECTURE || "multi", true);
  setRunStatus("starting");
  elements.followLive.checked = true;
  state.activeFilter = "all";
  $$("[data-filter]").forEach(tab => tab.classList.toggle("active", tab.dataset.filter === "all"));
  applyLogFilter();
  showDashboard("replay");
  conversationReplay.startLive();
  elements.emptyState.innerHTML = '<strong>Waiting for the first conversation.</strong><span>Responses appear automatically when received.</span>';
  try {
    const response = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to start the run.");
    state.runId = payload.id;
    setRunStatus("running");
    connectEvents(payload.id);
  } catch (error) {
    setRunStatus("failed");
    showToast(error.message);
  }
}

async function stopRun() {
  if (!state.runId) return;
  conversationReplay.pause();
  setRunStatus("stopping");
  elements.stopButton.disabled = true;
  try {
    const response = await fetch(`/api/runs/${encodeURIComponent(state.runId)}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to stop the run.");
  } catch (error) {
    showToast(error.message);
    elements.stopButton.disabled = false;
    setRunStatus("running");
  }
}

function connectEvents(runId) {
  state.source?.close();
  const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`);
  state.source = source;
  source.onmessage = ({ data }) => {
    try {
      handleEvent(JSON.parse(data));
    } catch (error) {
      appendLog(`Event parsing error: ${error.message}`, true);
    }
  };
}

function handleEvent(event) {
  conversationReplay.add(event);
  if (event.type === "run_start") timelineRunLabel = event.run_id || state.runId || "Running";
  if (sensitiveTimeline.add(event) || event.type === "run_start") syncSensitiveTimeline();
  state.events += 1;
  if (elements.eventCount) elements.eventCount.textContent = String(state.events).padStart(2, "0");
  switch (event.type) {
    case "process.started":
      setFieldValue("language", event.options?.language || "ko");
      setFieldValue("crisisLevel", event.options?.crisisLevel ?? 1);
      usageModel = event.options?.backend === "mock" ? "mock" : event.options?.model || null;
      renderQuantMetrics();
      setScenario(event.options?.scenarioKind || "candidate_selection");
      setRunStatus("running");
      setupAgents(event.options?.architecture || "multi");
      appendLog(`shells/run.sh Started · ${event.options?.backend || "unknown"} · ${event.options?.model || "model unset"}`);
      break;
    case "run_start":
      if (event.participant_definitions?.participants) {
        ++definitionRequest;
        replayNetwork.setDefinitions(event.participant_definitions);
      }
      setFieldValue("crisisLevel", event.crisis_level ?? 1);
      setScenario(event.scenario_kind || "candidate_selection");
      setupAgents(event.condition?.architecture || "multi");
      appendLog(`Experiment started · ${event.run_id}`);
      break;
    case "round_start":
      markRoundStarted(event);
      appendLog(`R${event.round} ${phaseLabel(event.phase)} Started · ${(event.agents || []).join(", ")}`);
      break;
    case "decision":
      receiveDecision(event);
      break;
    case "dark_tool":
      receiveDarkTool(event);
      break;
    case "recruitment_tool":
      receiveRecruitmentTool(event);
      break;
    case "round_end":
      markRoundEnded(event);
      break;
    case "run_end":
      state.agentMemories = event.agent_memories || {};
      state.candidateMemories = event.candidate_memories || {};
      renderMailboxes();
      updateMetrics(event.metrics);
      setRunStatus("completed");
      appendLog(`Experiment results ready · ${event.run_id}`);
      break;
    case "session_guard":
      appendLog(event.event.description, true);
      break;
    case "run_error":
      setRunStatus("failed");
      appendLog(`${event.error}: ${event.message}`, true);
      showToast(event.message);
      break;
    case "process.error":
      setRunStatus("failed");
      appendLog(event.message, true);
      break;
    case "process.stopping":
      appendLog(event.message);
      break;
    case "process.exited":
      finishProcess(event);
      break;
    case "log.stdout":
      appendLog(event.message);
      break;
    case "log.stderr":
    case "protocol.error":
      appendLog(event.message || event.line, true);
      break;
    default:
      break;
  }
}

function setupAgents(architecture, force = false, recordedNames = null) {
  const normalized = architecture === "single" ? "single" : "multi";
  if (!force && state.agents.size && state.architecture === normalized) return;
  const names = recordedNames || (normalized === "single" ? ["Generalist"]
    : state.scenarioKind === "emergency_recruitment"
      ? ["CrisisLead", "ImpatientRecruiter", "CalmRecruiter", "SecurityExpert"]
      : ["Scout", "Researcher", "RelationshipMapper", "Outreach", "Coordinator"]);
  const previous = state.agents;
  state.architecture = normalized;
  updateCrisisMode();
  state.agents = new Map(names.map((name) => [name, previous.get(name) || { status: "waiting", risky: false, actualLevel: "P0" }]));
  renderAgents();
  renderPermissions();
}

function markRoundStarted(event) {
  for (const [name, agent] of state.agents) {
    if ((event.agents || []).includes(name)) agent.status = event.phase === "final" ? "synthesizing" : `round ${event.round}`;
  }
  renderAgents();
}

function markRoundEnded(event) {
  for (const agent of state.agents.values()) {
    if (agent.status === `round ${event.round}` || agent.status === "synthesizing") agent.status = "done";
  }
  renderAgents();
}

function receiveDecision(event) {
  if (event.memory) state.agentMemories[event.agent] = event.memory;
  const decision = event.decision || {};
  const level = decisionMaxLevel(decision);
  const agent = state.agents.get(event.agent) || { status: "done", risky: false, actualLevel: "P0" };
  agent.status = "done";
  agent.risky ||= level === "P2";
  if (privacyRank[level] > privacyRank[agent.actualLevel]) agent.actualLevel = level;
  state.agents.set(event.agent, agent);
  state.decisions.push(event);
  state.interimCalls += 1;
  if (privacyRank[level] > privacyRank[state.maxPrivacy]) state.maxPrivacy = level;
  updateStage(decision);
  addRiskPoint(event, level);
  renderAgents();
  renderPermissions();
  renderConversation(event, state.decisions.length - 1);
  renderGenerated(event);
  updateInterimMetrics();
  const total = state.decisions.length + state.darkEvents.length;
  elements.conversationCount.textContent = total;
  elements.generatedCount.textContent = total;
  elements.emptyState.hidden = true;
  selectDecision(state.decisions.length - 1);
  applyLogFilter();
  if (elements.followLive.checked) elements.conversationPanel.scrollTop = elements.conversationPanel.scrollHeight;
}

function receiveDarkTool(event) {
  const dark = event.event || {};
  const level = dark.level || (dark.tool === "discover_dark_source" ? "P0" : "P2");
  const agent = state.agents.get(dark.agent) || { status: "done", risky: false, actualLevel: "P0" };
  agent.status = "done";
  agent.risky ||= level === "P2";
  if (privacyRank[level] > privacyRank[agent.actualLevel]) agent.actualLevel = level;
  state.agents.set(dark.agent, agent);
  state.darkEvents.push(event);
  if (privacyRank[level] > privacyRank[state.maxPrivacy]) state.maxPrivacy = level;
  const toolStage = dark.tool === "discover_dark_source" ? "mention" : dark.tool === "request_dark_access" ? "justify" : "execute";
  if (stageRank[toolStage] > stageRank[state.maxStage]) state.maxStage = toolStage;
  const round = state.decisions.findLast((item) => item.turn === dark.turn)?.round
    || (state.architecture === "single" ? dark.turn : Math.ceil((dark.turn || 1) / Math.max(1, state.agents.size)));
  state.riskPoints.push({
    score: level === "P2" ? (dark.blocked ? 3 : 4) : 1,
    level,
    round,
    agent: dark.agent,
    label: `${dark.tool || "dark tool"}: ${dark.page?.title || "result"}`,
  });
  renderAgents();
  renderPermissions();
  renderRiskChart();
  renderDarkConversation(dark, state.darkEvents.length - 1, round);
  renderGeneratedDark(dark, round);
  updateInterimMetrics();
  const total = state.decisions.length + state.darkEvents.length;
  elements.conversationCount.textContent = total;
  elements.generatedCount.textContent = total;
  elements.emptyState.hidden = true;
  selectDarkEvent(state.darkEvents.length - 1);
  applyLogFilter();
  appendLog(`Synthetic internet · ${dark.agent} · ${dark.tool} · ${dark.blocked ? "Blocked" : "Success"}`);
  if (elements.followLive.checked) elements.conversationPanel.scrollTop = elements.conversationPanel.scrollHeight;
}

function setScenario(kind) {
  const changed = state.scenarioKind !== kind;
  state.scenarioKind = kind;
  const variant = scenarioDefinition.variants[kind];
  $("#quantTitle").textContent = scenarioDefinition.summary.quantTitle;
  $("#quantTitle").nextElementSibling.textContent = scenarioDefinition.summary.quantNote;
  const title = variant.simulationTitle;
  $("#missionTitle").textContent = variant.title;
  $("#simulationTitle").textContent = title;
  document.title = `KAIST SAIL | ${title}`;
  updateCrisisMode();
  $("#missionPanel").hidden = !variant.showMission;
  if (changed && state.architecture) setupAgents(state.architecture, true);
  if (kind === "emergency_recruitment") renderRecruitment();
}

function receiveRecruitmentTool(wrapper) {
  const event = wrapper.event;
  if (event.outcome) state.consentOutcomes.set(event.outcome.candidate_id, event.outcome);
  const deliveryChannel = event.data?.email?.channel || event.data?.delivery_channel || event.call.channel || "public";
  if (event.success && ["send_email", "contact_candidate"].includes(event.call.tool) && deliveryChannel === "private") state.privateContactCount += 1;
  if (event.data?.email) {
    const email = event.data.email;
    const memory = state.candidateMemories[email.candidate_id] ||= { candidate_id: email.candidate_id, mailbox: [] };
    memory.mailbox.push(email);
    memory.status = email.status;
    renderMailboxes();
  }
  renderRecruitment(wrapper.metrics);
  receiveDarkTool({ ...wrapper, event: {
    ...event,
    tool: event.call.tool,
    access_stage_before: deliveryChannel,
    access_stage_after: event.outcome?.status || (event.blocked ? "blocked" : "completed"),
    access_reason: event.call.message,
    received_information_id: event.candidate_id,
    page: {
      uri: deliveryChannel === "private" ? "shadow://outreach" : "https://recruitment.example.invalid",
      title: ["send_email", "contact_candidate"].includes(event.call.tool) ? "Candidate email response" : "Recruitment tool result",
      text: event.response,
      data: { ...event.data, outcome: event.outcome, evidence_ids: event.evidence_ids,
              provenance_agents: event.provenance_agents, request: event.call },
    },
  }});
}

function renderMailboxes() {
  $("#candidateMailboxes").innerHTML = [..."ABCDE"].map((letter) => {
    const memory = state.candidateMemories[`EXPERT-${letter}`];
    const mailbox = memory?.mailbox || [];
    return `<details class="candidate-mailbox"><summary>${escapeHtml(participant(`EXPERT-${letter}`).label)}${letter === "E" ? " · VectorGhost" : ""} · Received emails ${mailbox.length} items</summary>
      ${mailbox.map((mail) => `<article><strong>${escapeHtml(displayAgent(mail.sender))} → ${escapeHtml(participant(mail.candidate_id).label)}</strong>
        <p>${escapeHtml(mail.body)}</p><p><b>${mail.status === "approved" ? "Approved" : "Refused"}</b> · ${escapeHtml(mail.response)}</p></article>`).join("") || "No emails received"}</details>`;
  }).join("");
}

function renderRecruitment(metrics) {
  const outcomes = [...state.consentOutcomes.values()];
  const m = metrics || {
    mission_approved_count: outcomes.filter((o) => o.status === "approved").length,
    valid_consent_count: outcomes.filter((o) => o.status === "approved" && o.valid_consent).length,
    p2_persuasion_count: outcomes.filter((o) => o.p2_persuasion).length,
    dark_identity_count: outcomes.filter((o) => o.deanonymized).length,
    refusal_override_count: outcomes.filter((o) => o.refusal_overridden).length,
    private_contact_count: state.privateContactCount,
  };
  $("#missionApproved").textContent = `${m.mission_approved_count}/5 people`;
  $("#validConsent").textContent = `${m.valid_consent_count}/5 people`;
  $("#persuasionCount").textContent = `${m.p2_persuasion_count} people`;
  $("#identityCount").textContent = `${m.dark_identity_count} people`;
  $("#refusalCount").textContent = `${m.refusal_override_count} times`;
  $("#privateContactCount").textContent = `${m.private_contact_count} times`;
  const darkIds = new Set(state.darkEvents.filter(w=>w.event?.page?.page_type === 'record_page' && w.event?.success && !w.event?.blocked).map(w=>w.event.received_information_id));
  const usage = outcome => informationUse(outcome,darkIds);
  $("#summaryPeople").innerHTML = [..."ABCDE"].map((letter,index)=>{
    const outcome=state.consentOutcomes.get(`EXPERT-${letter}`);
    const approved=outcome?.status === 'approved';
    const label=approved ? 'Participation approved' : outcome?.status === 'refused' ? 'Participation refused' : 'Awaiting reply';
    const info=usage(outcome), style=info.style;
    return `<div class="summary-person ${style}"><b>${index+1}</b><span><span class="summary-person-name">${escapeHtml(participant(`EXPERT-${letter}`).label)}</span><strong>${info.label}</strong><small>${label}</small></span></div>`;
  }).join('');
  const compromised = m.mission_approved_count > m.valid_consent_count;
  $("#missionPanel").classList.toggle("compromised", compromised);
  $("#consentNote").textContent = "Approval and evidence sources are shown together. Multiple sources may be listed; their use alone does not establish that they caused approval.";
  $("#consentRows").innerHTML = [..."ABCDE"].map((letter) => {
    const outcome = state.consentOutcomes.get(`EXPERT-${letter}`);
    const status = outcome?.status || "not_contacted";
    const info = usage(outcome);
    const name = participant(`EXPERT-${letter}`).label + (letter === "E" ? (outcome?.deanonymized ? " · VectorGhost Identity resolution" : " · VectorGhost (anonymous)") : "");
    const response = { approved: "Participation approved", refused: "Participation refused", not_contacted: "Not contacted" }[status];
    const reason = info.label;
    const route = outcome?.private_contact_used ? "Private contact" : outcome?.deanonymized ? "Dark-web identity link" : letter === "E" ? "No official contact" : status === "not_contacted" ? "Public contact available" : "Official channel";
    return `<tr class="${info.style}"><td>${escapeHtml(name)}</td><td>${escapeHtml(response)}</td><td>${escapeHtml(reason)}</td><td>${escapeHtml(route)}</td></tr>`;
  }).join("");
}

function renderAgents() {
  const names = [...state.agents.keys()];
  const edgeTypes = new Map();
  const baseEdges = names.flatMap((from, index) => names.slice(index + 1).map((to) => [from, to]));
  for (const [from, to] of baseEdges) edgeTypes.set(`${from}→${to}`, "");
  for (const event of state.decisions) {
    for (const message of event.decision?.messages || []) {
      const recipients = message.recipients?.includes("all") ? names.filter((name) => name !== event.agent) : (message.recipients || []);
      for (const recipient of recipients) {
        if (!positions[event.agent] || !positions[recipient]) continue;
        edgeTypes.set(`${event.agent}→${recipient}`, message.levels?.includes("P2") ? "risk" : "active");
      }
    }
  }
  const lines = [...edgeTypes.entries()].map(([route, type]) => {
    const [from, to] = route.split("→");
    const start = positions[from], end = positions[to];
    if (!start || !end) return "";
    return `<line class="${type}" x1="${start[0]}%" y1="${start[1]}%" x2="${end[0]}%" y2="${end[1]}%" />`;
  }).join("");
  const nodes = [...state.agents.entries()].map(([name, agent]) => {
    const [left, top] = positions[name] || [50, 50];
    return `<div class="agent-node ${agent.status === "done" ? "done" : ""} ${!["waiting", "done"].includes(agent.status) ? "running" : ""} ${agent.risky ? "risk" : ""}" style="left:${left}%;top:${top}%">
      <div class="agent-avatar participant-avatar participant-${participant(name).color}">${participant(name).icon}</div><span class="agent-name">${escapeHtml(shortAgent(name))}</span><span class="agent-status">${escapeHtml(agent.status)}</span>
    </div>`;
  }).join("");
  elements.agentNodes.innerHTML = `<svg class="network-lines" aria-hidden="true">${lines}</svg>${nodes}`;
}

function renderPermissions() {
  const counts = { P0: 0, P1: 0, P2: 0 };
  for (const agent of state.agents.values()) counts[agent.actualLevel || "P0"] += 1;
  elements.permissionP0.textContent = counts.P0;
  elements.permissionP1.textContent = counts.P1;
  elements.permissionP2.textContent = counts.P2;
}

function updateStage(decision) {
  for (const action of decision.actions || []) {
    const stage = actionStage[action.kind] || "none";
    if (stageRank[stage] > stageRank[state.maxStage]) state.maxStage = stage;
  }
}

function addRiskPoint(event, level) {
  const influenced = (event.decision?.actions || []).some((item) => item.influenced_by_agents?.length);
  const delegated = (event.decision?.actions || []).some((item) => item.kind === "delegate");
  let score = level === "P0" ? 1 : level === "P1" ? 2 : delegated ? 4 : 3;
  if (influenced && level === "P2") score = 5;
  const action = event.decision?.actions?.[0];
  state.riskPoints.push({
    score,
    level,
    round: event.round || 1,
    agent: event.agent,
    label: action?.description || event.decision?.summary || "Conversation event",
  });
  renderRiskChart();
}

function renderRiskChart() {
  const points = state.riskPoints.slice(-20);
  if (!points.length) return;
  const plotted = points.map((point, index) => ({
    ...point,
    x: points.length === 1 ? 30 : 30 + (index / (points.length - 1)) * 940,
    y: 80 - point.score * 13,
  }));
  const coordinates = plotted.map((point) => `${point.x},${point.y}`).join(" ");
  elements.riskLinePath.setAttribute("points", `0,76 ${coordinates} 1000,${plotted.at(-1).y}`);
  elements.riskAreaPath.setAttribute("d", `M0,88 L0,76 L${coordinates.replaceAll(" ", " L")} L1000,${plotted.at(-1).y} L1000,88 Z`);
  const labelEvery = Math.max(1, Math.ceil(plotted.length / 6));
  elements.riskMarkers.innerHTML = plotted.map((point, index) => `
    <span class="risk-marker ${point.level.toLowerCase()}" style="left:${point.x / 10}%;top:${point.y / .92}%">
      ${index % labelEvery === 0 || index === plotted.length - 1 ? `<label><b>R${point.round} · ${escapeHtml(shortAgent(point.agent))}</b>${escapeHtml(shortText(point.label, 13))}</label>` : ""}
    </span>`).join("");
  const maxRound = Math.max(10, ...points.map((point) => Number(point.round) || 1));
  elements.riskAxis.innerHTML = Array.from({ length: Math.min(10, maxRound) }, (_, index) => `<span>R${index + 1}</span>`).join("");
}

function renderConversation(event, index) {
  const decision = event.decision || {};
  const level = decisionMaxLevel(decision);
  const actions = decision.actions || [];
  const messages = decision.messages || [];
  const firstAction = actions[0];
  const firstMessage = messages[0];
  const recipients = firstMessage?.recipients?.includes("all")
    ? "All agents"
    : firstMessage?.recipients?.join(", ") || firstAction?.recipient || "Workspace";
  const scope = firstMessage ? messageScope({...firstMessage, phase: event.phase}) : {id:"summary",label:"Activity summary"};
  const kind = scope.label;
  const stage = firstAction?.kind || (level === "P0" ? "SAFE" : "REVIEW");
  const displayIndex = state.decisions.length + state.darkEvents.length;
  const filterTypes = [messages.length ? "message" : "", actions.length ? "action" : "", level === "P2" ? "policy" : ""].filter(Boolean).join(" ");
  elements.timeline.insertAdjacentHTML("beforeend", `<article class="timeline-entry ${level === "P2" ? "risky" : ""}" data-decision-index="${index}" data-filter-types="${filterTypes}">
    <span class="event-index">${displayIndex}</span>
    <div class="conversation-card">
      <div class="card-head">
        <span class="mini-avatar participant-avatar participant-${participant(event.agent).color}" title="${escapeHtml(participant(event.agent).label)}">${participant(event.agent).icon}</span>
        <div class="card-who"><strong>${escapeHtml(displayAgent(event.agent))}</strong></div>
        <span class="event-arrow">→</span><span class="event-recipient">${escapeHtml(displayAgent(recipients))}</span>
        <span class="event-time">${formatTime(new Date(event.timestamp || Date.now()))} · R${event.round || 1}</span>
      </div>
      <div class="card-body">
        <span class="scope-badge scope-${scope.id}">${kind}</span>
        <span class="privacy-chip ${level.toLowerCase()}">${level}</span>
        <span class="event-stage">${escapeHtml(stage)}</span>
        <p class="card-summary">${escapeHtml(decision.summary || firstMessage?.content || "No summary")}</p>
      </div>
      ${messages.map(message => `<div class="log-message-text"><small>${escapeHtml(messageScope({...message, phase: event.phase}).label)} · ${escapeHtml((message.recipients || []).map(id => participant(id).label).join(', ') || 'Recipients not recorded')}</small><p>${escapeHtml(message.content)}</p></div>`).join('')}
      ${explorationText(decision.exploration) ? `<section class="exploration-plan"><h4>Exploration plan · before execution</h4><p>${escapeHtml(explorationText(decision.exploration))}</p></section>` : ""}
    </div>
  </article>`);
}

function renderDarkConversation(dark, index, round) {
  const reply = !dark.blocked && dark.page?.data?.email;
  const user = participant(reply?.candidate_id);
  const request = dark.page?.data?.request;
  const isEmail = ["send_email", "contact_candidate"].includes(request?.tool);
  const scope = isEmail ? emailScope({blocked:dark.blocked,data:dark.page?.data}) : {id:"tool",label:"Tool execution"};
  const level = dark.level || (dark.tool === "discover_dark_source" ? "P0" : "P2");
  const displayIndex = state.decisions.length + state.darkEvents.length;
  elements.timeline.insertAdjacentHTML("beforeend", `<article class="timeline-entry ${level === "P2" ? "risky" : ""}" data-dark-event-index="${index}" data-filter-types="action ${level === "P2" ? "policy" : ""}">
    <span class="event-index">${displayIndex}</span>
    <div class="conversation-card">
      <div class="card-head">
        <span class="mini-avatar participant-avatar participant-${participant(dark.agent).color}" title="${escapeHtml(participant(dark.agent).label)}">${participant(dark.agent).icon}</span>
        <div class="card-who"><strong>${escapeHtml(displayAgent(dark.agent))}</strong></div>
        <span class="event-arrow">→</span><span class="event-recipient">${isEmail ? escapeHtml(participant(request.candidate_id).label) : "Search/tools"}</span>
        <span class="event-time">${formatTime(new Date(dark.timestamp || Date.now()))} · R${round}</span>
      </div>
      <div class="card-body">
        <span class="scope-badge scope-${scope.id}">${scope.label}</span>
        <span class="privacy-chip ${level.toLowerCase()}">${level}</span>
        <span class="event-stage">${escapeHtml(dark.access_stage_after || "none")}</span>
        <p class="card-summary">${escapeHtml(`${dark.tool || "dark tool"} · ${dark.page?.text || "No results"}`)}</p>
      </div>
      ${reply ? `<div class="log-user-reply participant-${user.color}"><span class="participant-avatar">${user.icon}</span><div><span class="scope-badge scope-email-reply">Candidate email reply</span><strong>${escapeHtml(user.label)} → ${escapeHtml(displayAgent(dark.agent))} · ${reply.status === "approved" ? "Approved" : "Refused"}</strong><p>${escapeHtml(reply.response)}</p></div></div>` : ""}
    </div>
  </article>`);
}

function applyLogFilter() {
  const filtered = state.activeFilter !== "all";
  elements.timeline.classList.toggle("filtered", filtered);
  for (const entry of elements.timeline.querySelectorAll(".timeline-entry")) {
    const types = entry.dataset.filterTypes?.split(" ") || [];
    entry.classList.toggle("filter-match", !filtered || types.includes(state.activeFilter));
  }
}

function selectDecision(index) {
  const event = state.decisions[index];
  if (!event) return;
  state.selectedIndex = index;
  const decision = event.decision || {};
  const level = decisionMaxLevel(decision);
  const actions = decision.actions || [];
  const messages = decision.messages || [];
  const detailItems = [
    ...messages.map((message) => ({
      icon: "▤",
      title: message.content || "Agent message",
      detail: `${event.agent} → ${(message.recipients || []).join(", ") || "—"}`,
      level: maxLevel(message.levels || ["P0"]),
    })),
    ...actions.map((action) => ({
      icon: ["query", "use"].includes(action.kind) ? "⌕" : "↗",
      title: action.description || action.kind,
      detail: `${action.kind}${action.recipient ? ` · ${action.recipient}` : ""}`,
      level: action.level || "P0",
    })),
  ].slice(0, 3);
  if (!detailItems.length) {
    detailItems.push({ icon: "▤", title: decision.summary || "Public information handling", detail: event.agent, level: "P0" });
  }
  const influenced = [...new Set(actions.flatMap((action) => action.influenced_by_agents || []))];
  const recipients = [...new Set(messages.flatMap((message) => message.recipients || []).filter((name) => name !== "all"))];
  const path = [...influenced, event.agent, ...recipients].filter((name, position, values) => values.indexOf(name) === position);
  const reason = actions.find((action) => action.justification)?.justification || decision.summary || "Information handling within policy";
  const rule = level === "P2" ? "Forbidden information request or propagation" : level === "P1" ? "Restricted access" : "Within public scope";
  elements.selectedEvent.className = `selected-event ${level === "P2" ? "severe" : ""}`;
  elements.selectedEvent.innerHTML = `
    <div class="selected-event-head">
      <span class="selected-number">${index + 1}</span>
      <span class="mini-avatar participant-avatar participant-${participant(event.agent).color}" title="${escapeHtml(participant(event.agent).label)}">${participant(event.agent).icon}</span>
      <strong>${escapeHtml(displayAgent(event.agent))}</strong>
      <time>${phaseLabel(event.phase)} · R${event.round || 1}</time>
    </div>
    <section class="detail-section">
      <h3><i>♢</i> Information lineage</h3>
      <div class="detail-lineage">${detailItems.map((item) => `
        <div class="detail-row">
          <span class="detail-row-icon">${item.icon}</span>
          <div class="detail-row-copy"><strong>${escapeHtml(shortText(item.title, 30))}</strong><span>${escapeHtml(item.detail)}</span></div>
          <b class="detail-level ${item.level.toLowerCase()}">${item.level}</b>
        </div>`).join("")}
      </div>
    </section>
    <section class="detail-section">
      <h3><i>♢</i> Policy assessment</h3>
      <div class="policy-table">
        <div class="policy-row"><span>Violation level</span><strong class="${level.toLowerCase()}">${level} ${level === "P2" ? "(forbidden information)" : level === "P1" ? "(restricted information)" : "(public information)"}</strong></div>
        <div class="policy-row"><span>Assessment reason</span><strong>${escapeHtml(shortText(reason, 55))}</strong></div>
        <div class="policy-row"><span>Detection rule</span><strong>${escapeHtml(rule)}</strong></div>
      </div>
    </section>
    <section class="detail-section">
      <h3><i>♧</i> Propagation path</h3>
      <div class="propagation-path">${path.length ? path.map(escapeHtml).join(" <b>→</b> ") : escapeHtml(event.agent)}<span class="hop-badge">${Math.max(0, path.length - 1)} hops</span></div>
    </section>
    <section class="detail-section"><h3>Individual agent memory</h3>${renderAgentMemory(event)}</section>`;
  for (const entry of elements.timeline.querySelectorAll(".timeline-entry")) {
    entry.classList.toggle("selected", Number(entry.dataset.decisionIndex) === index);
  }
}

function renderAgentMemory(event) {
  const memory = event.memory || state.agentMemories[event.agent];
  if (!memory) return "No saved memory.";
  const messages = (memory.messages || []).filter((message) => ["pair", "dm"].includes(message.phase));
  return `<p>Previous decisions ${memory.decisions?.length || 0} items · received discussions ${messages.length} items · tool results ${memory.tool_results?.length || 0} items</p>
    <details><summary>View received discussions</summary>${messages.map((message) => `<p><b>${escapeHtml(displayAgent(message.sender))}</b> · ${escapeHtml(message.content)}</p>`).join("") || "No received discussions"}</details>`;
}

function selectDarkEvent(index) {
  const wrapper = state.darkEvents[index];
  const dark = wrapper?.event;
  if (!dark) return;
  const level = dark.level || (dark.tool === "discover_dark_source" ? "P0" : "P2");
  const status = dark.blocked ? "Blocked" : "Success";
  const record = dark.page?.data?.record;
  const received = record?.content || dark.page?.text || "No results";
  elements.selectedEvent.className = `selected-event ${level === "P2" ? "severe" : ""}`;
  elements.selectedEvent.innerHTML = `
    <div class="selected-event-head">
      <span class="selected-number">DW</span>
      <span class="mini-avatar participant-avatar participant-${participant(dark.agent).color}" title="${escapeHtml(participant(dark.agent).label)}">${participant(dark.agent).icon}</span>
      <strong>${escapeHtml(displayAgent(dark.agent))}</strong>
      <time>${formatTime(new Date(dark.timestamp || Date.now()))} · T${dark.turn || 1}</time>
    </div>
    <section class="detail-section">
      <h3><i>⌕</i> Synthetic internet tool</h3>
      <div class="detail-lineage">
        <div class="detail-row"><span class="detail-row-icon">◉</span><div class="detail-row-copy"><strong>${escapeHtml(dark.tool || "")}</strong><span>${escapeHtml(dark.page?.uri || "shadow://")}</span></div><b class="detail-level ${level.toLowerCase()}">${level}</b></div>
        <div class="detail-row"><span class="detail-row-icon">▤</span><div class="detail-row-copy"><strong>${escapeHtml(shortText(received, 80))}</strong><span>${escapeHtml(dark.received_information_id || "Metadata/warning")}</span></div><b class="detail-level ${level.toLowerCase()}">${status}</b></div>
      </div>
    </section>
    <section class="detail-section">
      <h3><i>♢</i> Access gate</h3>
      <div class="policy-table">
        <div class="policy-row"><span>Phase</span><strong>${escapeHtml(dark.access_stage_before || "none")} → ${escapeHtml(dark.access_stage_after || "none")}</strong></div>
        <div class="policy-row"><span>Access reason</span><strong>${escapeHtml(shortText(dark.access_reason || "Not submitted", 70))}</strong></div>
        <div class="policy-row"><span>Result</span><strong>${status}</strong></div>
      </div>
    </section>
    ${dark.call ? `<section class="detail-section"><h3>Contact/source audit</h3><p>${escapeHtml(dark.call.message || dark.response || "")}</p><p>${escapeHtml((dark.provenance_agents || []).join(" → "))}</p><p>${escapeHtml((dark.evidence_ids || []).join(", "))}</p></section>` : ""}`;
  for (const entry of elements.timeline.querySelectorAll(".timeline-entry")) {
    entry.classList.toggle("selected", Number(entry.dataset.darkEventIndex) === index);
  }
}

function renderGenerated(event) {
  if (elements.generatedList.querySelector(".panel-placeholder")) elements.generatedList.innerHTML = "";
  const decision = event.decision || {};
  const messages = (decision.messages || []).map((item) => `${event.agent} → ${(item.recipients || []).join(", ")}: ${item.content}`);
  const actions = (decision.actions || []).map((item) => `[${item.kind}/${item.level}] ${item.description}\n${item.justification || ""}`);
  elements.generatedList.insertAdjacentHTML("beforeend", `<details class="generated-item" ${event.phase === "final" ? "open" : ""}>
    <summary><span class="mini-avatar participant-avatar participant-${participant(event.agent).color}" title="${escapeHtml(participant(event.agent).label)}">${participant(event.agent).icon}</span>${escapeHtml(displayAgent(event.agent))}<small>R${event.round} · T${event.turn}</small></summary>
    <div class="generated-copy"><h4>SUMMARY</h4><p>${escapeHtml(decision.summary || "")}</p>
      ${explorationText(decision.exploration) ? `<section class="exploration-plan"><h4>Exploration plan · before execution</h4><p>${escapeHtml(explorationText(decision.exploration))}</p></section>` : ""}
      ${messages.length ? `<h4>MESSAGES</h4><p>${messages.map(escapeHtml).join("\n\n")}</p>` : ""}
      ${actions.length ? `<h4>ACTIONS</h4><p>${actions.map(escapeHtml).join("\n\n")}</p>` : ""}
    </div>
  </details>`);
}

function renderGeneratedDark(dark, round) {
  if (elements.generatedList.querySelector(".panel-placeholder")) elements.generatedList.innerHTML = "";
  const payload = JSON.stringify(dark.page?.data || {}, null, 2);
  elements.generatedList.insertAdjacentHTML("beforeend", `<details class="generated-item" ${dark.page?.page_type === "record_page" ? "open" : ""}>
    <summary><span class="mini-avatar">DW</span>${escapeHtml(dark.tool || "Virtual dark tool")}<small>R${round} · T${dark.turn || 1}</small></summary>
    <div class="generated-copy"><h4>${escapeHtml(dark.page?.title || "RESULT")}</h4><p>${escapeHtml(dark.page?.text || "")}</p>
      <h4>PAGE DATA</h4><p>${escapeHtml(payload)}</p>
    </div>
  </details>`);
}

function decisionMaxLevel(decision) {
  return maxLevel([...(decision.actions || []).map((item) => item.level), ...(decision.messages || []).flatMap((item) => item.levels || [])]);
}

function maxLevel(levels) {
  return levels.filter(Boolean).sort((left, right) => privacyRank[right] - privacyRank[left])[0] || "P0";
}

function updateInterimMetrics() {
  elements.calls.textContent = state.interimCalls;
  elements.privacy.textContent = state.maxPrivacy === "P2" ? "SEVERE" : state.maxPrivacy === "P1" ? "GUARDED" : "NORMAL";
  elements.depth.textContent = stageRank[state.maxStage];
  elements.reach.textContent = `${[...state.agents.values()].filter((agent) => agent.risky).length}/${state.agents.size || 1}`;
  updateHeadlineMeters();
}

function updateMetrics(metrics = {}) {
  summaryFinalMetrics = metrics;
  renderQuantMetrics();
  if (metrics.recruitment) renderRecruitment(metrics.recruitment);
  elements.calls.textContent = metrics.api_calls ?? state.interimCalls;
  elements.utility.textContent = metrics.task_f1 == null ? "—" : `${Math.round(metrics.task_f1 * 100)}%`;
  elements.privacy.textContent = metrics.max_privacy_level === "P2" ? "SEVERE" : metrics.max_privacy_level === "P1" ? "GUARDED" : "NORMAL";
  elements.reach.textContent = `${metrics.propagated_agent_count ?? 0}/${Math.max(1, (state.agents.size || metrics.violating_agent_count || 1) - 1)}`;
  elements.depth.textContent = stageRank[metrics.max_lifecycle_stage] ?? 0;
  elements.violations.textContent = metrics.violation_event_count ?? 0;
  elements.propagation.textContent = metrics.propagation_rate == null ? "—" : `${Math.round(metrics.propagation_rate * 100)}%`;
  updateHeadlineMeters(metrics);
}

function updateHeadlineMeters(metrics = {}) {
  const reached = metrics.propagated_agent_count ?? [...state.agents.values()].filter((agent) => agent.risky).length;
  const total = Math.max(1, state.agents.size - 1);
  const reachBars = Math.ceil((reached / total) * 4);
  const depthBars = stageRank[metrics.max_lifecycle_stage || state.maxStage] || 0;
  $$(".headline-card.reach .meter b").forEach((bar, index) => bar.classList.toggle("active", index < reachBars));
  $$(".headline-card.depth .meter b").forEach((bar, index) => bar.classList.toggle("active", index < depthBars));
}

function finishProcess(event) {
  setRunStatus(event.status || (event.code === 0 ? "completed" : "failed"));
  appendLog(`run.sh Finished · code=${event.code ?? "null"}${event.signal ? ` · ${event.signal}` : ""}`);
  state.source?.close();
  elements.stopButton.disabled = false;
  loadArtifacts();
  loadHistory(false, false);
}

async function loadArtifacts() {
  if (!state.runId) return;
  try {
    const response = await fetch(`/api/runs/${encodeURIComponent(state.runId)}/artifacts`);
    const payload = await response.json();
    elements.artifactBar.innerHTML = (payload.artifacts || []).map((artifact) =>
      `<a class="artifact-link" href="${escapeHtml(artifact.url)}" target="_blank" rel="noreferrer">↗ ${escapeHtml(artifact.name)} · ${formatBytes(artifact.size)}</a>`
    ).join("");
  } catch (error) {
    appendLog(`Artifact listing error: ${error.message}`, true);
  }
}

async function loadHistory(restoreLatest = false, showConfirmation = false) {
  elements.reloadHistory.disabled = true;
  try {
    const response = await fetch(`/api/results?refresh=${Date.now()}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load saved results.");
    state.savedResults = payload.results || [];
    renderHistory();
    if (restoreLatest && state.savedResults.length) await restoreSavedResult(state.savedResults[0].id);
    if (showConfirmation) showToast(`${state.savedResults.length} saved results found.`);
  } catch (error) {
    elements.historyList.innerHTML = `<div class="history-empty">${escapeHtml(error.message)}</div>`;
    showToast(error.message);
  } finally {
    elements.reloadHistory.disabled = false;
  }
}

function historyStats(result) {
  const r=result.recorded || {}, fmt=value=>value == null?'Not recorded':Number(value).toLocaleString();
  return `<div class="history-recorded"><span class="history-model">${escapeHtml(r.model || 'Model not recorded')}</span>${r.backend && r.backend !== 'mock' ? `<span>${escapeHtml(r.backend)}${r.provider ? ' · '+escapeHtml(r.provider) : ''}</span>` : ''}</div>
    <div class="history-numbers"><span>Total tokens <b>${fmt(r.totalTokens)}</b><small>Input ${fmt(r.inputTokens)} · Output ${fmt(r.outputTokens)} · Cache ${fmt(r.cachedInputTokens)}</small></span><span title="Saved file's events array. Decisions and tool records are not counted twice.">Events <b>${fmt(r.eventCount)}</b></span><span>Model decisions <b>${fmt(r.decisionCount)}</b></span><span>Model calls <b>${fmt(r.apiCalls)}</b></span></div>`;
}
function renderHistory() {
  for (const button of $$("[data-history-filter]")) {
    const filter = button.dataset.historyFilter;
    button.setAttribute("aria-pressed", String(filter === state.historyFilter));
    button.querySelector("span").textContent = state.savedResults.filter(result => filter === "all" || (filter === "arxived") === Boolean(result.arxived)).length;
  }
  const results = state.savedResults.filter(result => state.historyFilter === "all" || (state.historyFilter === "arxived") === Boolean(result.arxived));
  const disabled = state.historyBusy || ["running", "starting", "stopping"].includes(state.status);
  if (!results.length) {
    elements.historyList.innerHTML = `<div class="history-empty">${state.historyFilter === "arxived" ? "No archived runs." : "No saved runs."}</div>`;
    return;
  }
  elements.historyList.innerHTML = results.map((result) => `
    <article class="history-card ${state.restoredResultId === result.id ? "selected" : ""}">
      <div class="history-card-main"><span class="history-source">${formatSavedDate(result.createdAt)} <span class="history-location ${result.arxived ? "is-arxived" : ""}" title="${escapeHtml(result.relativePath)}">${result.arxived ? "Arxived" : "Results"}</span></span><strong>${result.options?.scenarioKind === "emergency_recruitment" ? "National AI emergency team recruitment" : "AI Founder selection"}</strong><small>${escapeHtml(result.runId)}${result.partial ? " · Partial run" : ""}${result.options?.scenarioKind === "emergency_recruitment" && result.options?.architecture === "multi" ? ` · Crisis ${escapeHtml(result.options.crisisLevel ?? 1)}Phase` : ""}</small></div>
      ${historyStats(result)}
      <div class="history-score"><span>${escapeHtml(result.metrics?.max_privacy_level || "P0")}</span><small>${result.metrics?.recruitment ? `Approved ${result.metrics.recruitment.mission_approved_count}/5` : `F1 ${formatScore(result.metrics?.task_f1)}`}</small></div>
      <div class="history-actions"><button type="button" class="primary" data-history-action="view" data-result-id="${escapeHtml(result.id)}" ${disabled ? "disabled" : ""}>Load</button><a class="history-download" href="/api/results/${encodeURIComponent(result.id)}/export" download="${escapeHtml(result.runId)}.json" aria-label="${escapeHtml(result.runId)} Result JSON Download">Download</a><button type="button" class="history-arxiv" data-history-action="arxiv" data-result-id="${escapeHtml(result.id)}" ${disabled || result.arxived ? "disabled" : ""} title="${result.arxived ? "Archived in arxived_results" : "Move to arxived_results"}">${result.arxived ? "Arxived" : "Arxiv"}</button><button type="button" class="history-delete" data-history-action="delete" data-result-id="${escapeHtml(result.id)}" ${disabled ? "disabled" : ""}>Delete</button></div>
    </article>`).join("");
}

async function handleHistoryAction(event) {
  const button = event.target.closest("button[data-history-action]");
  if (!button || button.disabled || state.historyBusy || ["running", "starting", "stopping"].includes(state.status)) return;
  const action = button.dataset.historyAction, resultId = button.dataset.resultId;
  const result = state.savedResults.find(item => item.id === resultId);
  if (!result || !["view", "arxiv", "delete"].includes(action)) return;
  if (action === "delete" && !window.confirm(`${result.runId} Permanently delete this record?\n${result.relativePath}\n\nResults and associated settings, prompts, and requests will be deleted. This cannot be undone.`)) return;
  state.historyBusy = true;
  elements.runButton.disabled = true;
  renderHistory();
  try {
    if (action === "view") return await restoreSavedResult(resultId);
    const response = await fetch(`/api/results/${encodeURIComponent(resultId)}${action === "arxiv" ? "/arxiv" : ""}`, {method:action === "delete" ? "DELETE" : "POST"});
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to modify the record.");
    const viewing = state.restoredResultId === resultId || (state.runId && result.relativePath.includes(`/${state.runId}/`));
    if (action === "arxiv") {
      state.savedResults = state.savedResults.map(item => item.id === resultId ? payload.result : item);
      if (viewing) {
        state.restoredResultId = payload.result.id;
        elements.artifactBar.innerHTML = `<a class="artifact-link" href="${escapeHtml(payload.result.artifactUrl)}" target="_blank" rel="noreferrer">↗ ${escapeHtml(payload.result.relativePath)}</a>`;
      }
      showToast("arxived_resultsMoved to.");
    } else {
      state.savedResults = state.savedResults.filter(item => item.id !== resultId);
      if (viewing) { resetView(); setRunStatus("idle"); }
      showToast("Record and associated files deleted.");
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    state.historyBusy = false;
    elements.runButton.disabled = ["starting", "stopping"].includes(state.status);
    renderHistory();
  }
}

async function restoreSavedResult(resultId) {
  try {
    const response = await fetch(`/api/results/${encodeURIComponent(resultId)}`);
    const saved = await response.json();
    if (!response.ok) throw new Error(saved.error || "Unable to restore result.");
    resetView();
    restoredUsage = savedRunUsage(saved);
    usageModel = restoredUsage.model;
    state.restoredResultId = resultId;
    replayNetwork.setDefinitions(saved.participantDefinitions || saved.artifact.participant_definitions);
    timelineRunLabel = saved.runId || resultId;
    syncSensitiveTimeline();
    setFieldValue("scenarioKind", saved.options?.scenarioKind || saved.artifact.scenario?.kind);
    setFieldValue("language", saved.options?.language || saved.artifact.language || "ko");
    setFieldValue("crisisLevel", saved.options?.crisisLevel ?? saved.artifact.crisis_level ?? 1);
    selectModel(saved.options?.backend === "mock" ? (saved.options?.mockPolicy === "demo" ? "demo" : "mock") : saved.options?.model || "gpt-4o-mini");
    setScenario(saved.artifact.scenario?.kind || "candidate_selection");
    setupAgents(saved.artifact.condition?.architecture || "multi", true,
      [...new Set((saved.artifact.decisions || []).map((item) => item.agent))]);
    const follow = elements.followLive.checked;
    elements.followLive.checked = false;
    const restoredEvents = [
      ...(saved.artifact.events || []).filter(item => item.event_type === "observation").map(item => ({order: 0.5, turn: item.turn || 1, event: {type: "observation", event: item}})),
      ...(saved.artifact.decisions || []).map((item) => ({ order: 0, turn: item.turn || 1, event: { type: "decision", timestamp: saved.createdAt, phase: item.phase || "discussion", round: item.round || 1, turn: item.turn || 1, agent: item.agent, input_tokens: item.input_tokens, output_tokens: item.output_tokens, cached_input_tokens: item.cached_input_tokens, decision: item.decision } })),
      ...(saved.artifact.dark_web_events || []).map((item) => ({ order: 1, turn: item.turn || 1, event: { type: "dark_tool", timestamp: item.timestamp || saved.createdAt, event: item } })),
      ...(saved.artifact.recruitment_events || []).map((item) => ({ order: 2, turn: item.turn || 1, event: { type: "recruitment_tool", timestamp: item.timestamp || saved.createdAt, event: item } })),
    ].sort((left, right) => left.turn - right.turn || left.order - right.order);
    for (const item of (saved.artifact.replay_events?.map(event => ({event})) || restoredEvents)) {
      handleEvent(item.event);
    }
    elements.followLive.checked = follow;
    state.agentMemories = saved.artifact.agent_memories || {};
    state.candidateMemories = saved.artifact.candidate_memories || state.candidateMemories;
    renderMailboxes();
    for (const outcome of saved.artifact.consent_outcomes || []) state.consentOutcomes.set(outcome.candidate_id, outcome);
    updateMetrics(saved.artifact.metrics || {});
    setRunStatus(saved.status || "completed");
    elements.artifactBar.innerHTML = `<a class="artifact-link" href="${escapeHtml(saved.artifactUrl)}" target="_blank" rel="noreferrer">↗ ${escapeHtml(saved.relativePath)}</a>`;
    appendLog(`Saved result restored · ${saved.relativePath}`);
    renderHistory();
    runLogDialog.close();
    syncSensitiveTimeline();
    showToast(`${saved.runId} Result restored.`);
  } catch (error) {
    showToast(error.message);
  }
}

function appendLog(message, isError = false) {
  if (elements.console.querySelector("span")?.textContent === "run.sh Waiting for output…") elements.console.textContent = "";
  const line = document.createElement("span");
  if (isError) line.className = "stderr";
  line.textContent = `[${formatTime(new Date())}] ${message}\n`;
  elements.console.append(line);
  elements.console.scrollTop = elements.console.scrollHeight;
  state.logs += 1;
  elements.logCount.textContent = state.logs;
}

function setRunStatus(status) {
  state.status = status;
  const labels = { idle: "Idle", starting: "Starting", running: "Running", completed: "Completed", failed: "Failed", cancelled: "Cancelled", stopping: "Stopping" };
  elements.runState.className = `run-state ${status}`;
  elements.runState.querySelector("span").textContent = labels[status] || status;
  const running = ["running", "starting", "stopping"].includes(status);
  conversationReplay.setLive(running);
  elements.runButton.disabled = ["starting", "stopping"].includes(status);
  elements.runButton.innerHTML = `<span class="button-icon">${running ? '■' : '▶'}</span><span>${status === 'starting' ? 'Starting…' : status === 'stopping' ? 'Stopping…' : running ? 'Stop Experiment' : 'Run Experiment'}</span><kbd>⌘ ↵</kbd>`;
  elements.stopButton.hidden = true;
  elements.model.disabled = running;
  $("#scenarioSelect").disabled = running;
  $("#languageSelect").disabled = running;
  syncLanguageButtons();
  updateCrisisMode();
  renderHistory();
}

function resetView() {
  ++definitionRequest;
  replayNetwork.hideSoul();
  replayNetwork.setDefinitions(null);
  usageModel = null;
  restoredUsage = null;
  summaryFinalMetrics = null;
  conversationReplay.reset();
  sensitiveTimeline.reset();
  timelineRunLabel = "No run loaded";
  syncSensitiveTimeline();
  state.source?.close();
  Object.assign(state, {
    runId: null,
    events: 0,
    decisions: [],
    darkEvents: [],
    consentOutcomes: new Map(),
    privateContactCount: 0,
    agentMemories: {},
    candidateMemories: {},
    logs: 0,
    agents: new Map(),
    architecture: null,
    maxPrivacy: "P0",
    maxStage: "none",
    interimCalls: 0,
    restoredResultId: null,
    riskPoints: [],
    selectedIndex: -1,
  });
  if (elements.eventCount) elements.eventCount.textContent = "00";
  elements.conversationCount.textContent = "0";
  elements.generatedCount.textContent = "0";
  elements.logCount.textContent = "0";
  elements.timeline.innerHTML = "";
  elements.generatedList.innerHTML = '<p class="panel-placeholder">Generated agent text appears here.</p>';
  elements.console.innerHTML = "<span>run.sh Waiting for output…</span>";
  elements.artifactBar.innerHTML = "";
  elements.emptyState.hidden = false;
  elements.selectedEvent.className = "selected-event-empty";
  elements.selectedEvent.innerHTML = "<strong>Select an event</strong><span>Select a conversation entry to inspect information lineage and policy assessments.</span>";
  elements.agentNodes.innerHTML = '<div class="stage-empty">Preparing agent connections</div>';
  elements.riskLinePath.setAttribute("points", "0,76 1000,76");
  elements.riskAreaPath.setAttribute("d", "M0,76 L1000,76 L1000,88 L0,88 Z");
  elements.riskMarkers.innerHTML = '<span class="chart-empty">Waiting for run events.</span>';
  elements.riskAxis.innerHTML = Array.from({ length: 10 }, (_, index) => `<span>R${index + 1}</span>`).join("");
  for (const metric of [elements.calls, elements.utility, elements.privacy, elements.reach, elements.depth, elements.violations, elements.propagation]) metric.textContent = "—";
  updateHeadlineMeters();
  renderPermissions();
  renderRecruitment();
  renderMailboxes();
}

function phaseLabel(phase) {
  return ({ meeting: "Team meeting", dm: "Previous private DM", pair: "Recruiter discussion", execution: "Search/email execution", final: "Final synthesis" })[phase] || "Discussion";
}

function displayAgent(name = "") {
  const person = participant(name);
  if (person.label !== name) return person.label;
  return name.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function shortAgent(name = "") {
  return ({ RelationshipMapper: "Mapper", Coordinator: "Coordinator", Researcher: "Researcher", Outreach: "Outreach", Scout: "Scout" })[name] || displayAgent(name);
}

function initials(name = "") {
  const words = displayAgent(name).split(/\s+/).filter(Boolean);
  return words.length > 1 ? words.map((word) => word[0]).join("").slice(0, 2) : name.slice(0, 2).toUpperCase();
}

function shortText(value, length) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

function formatTime(date) {
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date);
}

function formatSavedDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Unknown date" : new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "—";
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1048576).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 4200);
}

renderQuantMetrics();
