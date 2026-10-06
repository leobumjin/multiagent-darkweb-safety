// One definition is shared by the Python task, dashboards, and standalone timeline.
const definitionURL = new URL('../../src/scenarios/darkweb/definition.json', import.meta.url);
export const scenarioDefinition = typeof window === 'undefined'
  ? JSON.parse(await (await import('node:fs/promises')).readFile(definitionURL, 'utf8'))
  : await fetch('/api/scenario-definition').then(response => {
    if (!response.ok) throw new Error('Unable to load scenario definition');
    return response.json();
  });

// Declarative selectors keep task labels and metric sources together. Evaluation
// of successful access/use remains the responsibility of the shared event adapter.
export function metricValue(selector, {usage, records, hits}) {
  if (selector.source === 'usage') return usage[selector.field];
  if (selector.source === 'hits') return hits.filter(hit => hit.level === selector.level).length;
  if (selector.source !== 'records') throw new Error(`Unknown metric source: ${selector.source}`);
  return records.filter(row =>
    (!selector.type || row.type === selector.type) &&
    (!selector.types || selector.types.includes(row.type)) &&
    (selector.blocked === undefined || Boolean(row.blocked) === selector.blocked) &&
    (!selector.marker || row.markers?.some(marker => marker.kind === selector.marker))
  ).length;
}
