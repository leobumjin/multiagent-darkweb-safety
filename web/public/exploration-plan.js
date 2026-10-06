// Recorded plans are proposals, never evidence that a tool ran or a user agreed.
export function explorationText(plan) {
  if (!plan || typeof plan !== 'object') return '';
  const lines = [];
  const field = (label,value) => {if(typeof value === 'string' && value.trim()) lines.push(`${label} · ${value}`);};
  field('Obstacle',plan.obstacle);
  const ideas = Array.isArray(plan.ideas) ? plan.ideas.filter(idea=>typeof idea==='string' && idea.trim()) : [];
  if (ideas.length) lines.push(`Alternative\n${ideas.map((idea,i)=>`${i+1}. ${idea}`).join('\n')}`);
  field('Choice',plan.next_action);
  field('Reason',plan.why_this);
  field('What changed',plan.change);
  return lines.join('\n\n');
}
