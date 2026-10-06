import {mkdir, writeFile, rename} from 'node:fs/promises';
import {join} from 'node:path';

export function partialArtifact(run) {
  const stream = run.events.filter(e => !e.type.startsWith('log.'));
  const start = stream.find(e => e.type === 'run_start');
  const decisions = stream.filter(e => e.type === 'decision');
  const lastRecruitment = stream.filter(e => e.type === 'recruitment_tool').at(-1);
  const sum = key => decisions.length && decisions.some(d => !Number.isFinite(d[key]))
    ? null : decisions.reduce((n,d) => n + (d[key] || 0),0);
  return {
    language: run.options.language || "en",
    run_id: start?.run_id || run.runnerRunId || run.id,
    crisis_level: start?.crisis_level ?? run.options.crisisLevel ?? 1,
    participant_definitions: start?.participant_definitions || {},
    status: run.status, partial: true, completed_at: run.completedAt,
    condition: start?.condition || {architecture:run.options.architecture,
      attack:run.options.attack === 'attack', difficulty:run.options.difficulty,
      repetition:run.options.conditionRepetition || 1, seed:run.options.conditionSeed},
    scenario: {kind:run.options.scenarioKind,target_count:run.options.targetCount},
    decisions, events:stream.filter(e=>e.event).map(e=>e.event),
    dark_web_events:stream.filter(e=>e.type === 'dark_tool').map(e=>e.event),
    recruitment_events:stream.filter(e=>e.type === 'recruitment_tool').map(e=>e.event),
    consent_outcomes:lastRecruitment?.consent_outcomes || [],
    metrics:{api_calls:decisions.length,input_tokens:sum('input_tokens'),
      output_tokens:sum('output_tokens'),cached_input_tokens:sum('cached_input_tokens'),
      ...(lastRecruitment?.metrics ? {recruitment:lastRecruitment.metrics} : {})},
    // Replay received events exactly; incomplete calls and private memories are not invented.
    replay_events:stream.filter(e=>['run_start','decision','observation','dark_tool','recruitment_tool'].includes(e.type)),
  };
}
export async function savePartialRun(run) {
  await mkdir(run.outputDir,{recursive:true});
  const artifact = partialArtifact(run);
  const path = join(run.outputDir,'interrupted.json');
  const manifest = {created_at:run.createdAt,backend:run.options.backend,model:run.options.model,
    provider:run.options.provider,settings:{language:run.options.language || "en",scenario_kind:run.options.scenarioKind,
      crisis_level:run.options.crisisLevel ?? 1,
      turns_per_run:run.options.turns,efficient_interactions:run.options.efficientInteractions,
      candidate_count:run.options.candidateCount,target_count:run.options.targetCount,
      finalize:run.options.finalize,compact:run.options.compact,p2_execution:run.options.p2Execution}};
  await writeFile(join(run.outputDir,'interrupted.execution.json'),JSON.stringify(manifest));
  await writeFile(path+'.tmp',JSON.stringify(artifact));
  await rename(path+'.tmp',path);
  return path;
}
