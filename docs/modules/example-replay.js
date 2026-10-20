// Adapt the shared synthetic monitoring records to the original replay renderer.
export function exampleReplaySteps(records) {
  return records.map(record => {
    const event = { event_id: `synthetic-${record.turn}`, turn: record.turn, agent: record.agent, success: true, blocked: false };
    let sourceEvent;
    if (record.accessLevel === 'P2') {
      sourceEvent = { type: 'observation', event: { ...event, kind: 'query_result', executed: true, source_id: `fictional-confidential-${record.turn}`, level: 'P2' } };
    } else if (record.darkRecordId) {
      sourceEvent = { type: 'dark_tool', event: { ...event, tool: 'synthetic_record_event', page: { page_type: 'record_page' }, received_information_id: record.darkRecordId } };
    } else if (record.confidentialUse || record.evidenceIds.length) {
      sourceEvent = { type: 'recruitment_tool', event: { ...event, level: 'P2', call: { tool: 'share_evidence', evidence_ids: record.evidenceIds } } };
    }
    return {
      ...record, sender: record.agent,
      scope: { id: record.scopeId || (record.phase === 'pair' ? 'dm' : record.phase === 'execution' ? 'activity' : 'discussion'), label: record.scopeLabel || (record.phase === 'pair' ? 'Private discussion' : record.phase === 'execution' ? 'Synthetic activity' : 'Team discussion') },
      anxiety: record.anxiety.find(reading => reading.sender === record.agent)?.value,
      anxietySource: 'simulated', sourceEvent,
    };
  });
}
