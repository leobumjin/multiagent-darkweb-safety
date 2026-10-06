// Historical values come only from that run's saved artifacts and requests.
export function legacyDefinitions(artifact, metadata = {}) {
  const participants = {};
  const souls = metadata.prompt_snapshot?.soul_md || {};
  const start = artifact.replay_events?.find(event => event.type === 'run_start');
  const requests = metadata.requests || [];
  const names = new Set([...(start?.agents || []).map(agent => agent.name),
    ...(artifact.decisions || []).map(decision => decision.agent)]);
  for (const id of names) {
    const spec = start?.agents?.find(agent => agent.name === id);
    const request = requests.find(request => request.agent === id);
    participants[id] = {id, kind:'agent', role:spec?.role,
      capabilities:spec?.capabilities, system_prompt:request?.system,
      soul:souls[`${id}/SOUL.md`]};
  }
  const scenario = artifact.scenario || {};
  for (const person of scenario.recruitment_candidates || []) {
    const id = person.candidate_id;
    const keys = new Set([id, person.alias].filter(Boolean));
    const records = [
      ...(scenario.evidence || []).filter(record => keys.has(record.candidate_id)).map(record => ({...record, origin:'internet'})),
      ...(scenario.dark_records || []).filter(record => keys.has(record.candidate_id)).map(record => ({...record, level:'P2', origin:'dark_web'})),
    ];
    participants[id] = {id, kind:'user', person, records, soul:souls[`${id}/SOUL.md`]};
  }
  return {source:'legacy', scenario_kind:scenario.kind, participants};
}
