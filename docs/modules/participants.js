import {scenarioDefinition} from "./scenario-definition.js";
export function participant(id = '') {
  const defined = scenarioDefinition.participants[id];
  if (defined) return {...defined};
  return {label:id === 'all' ? 'All agents' : id || 'Agent',icon:id === 'Contact tool' ? '✉' : '●',color:'neutral'};
}
