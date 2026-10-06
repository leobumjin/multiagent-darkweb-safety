export function messageScope(message) {
  const recipients = message?.recipients || [];
  if (recipients.includes('all')) return {id:'discussion',label:'Team discussion'};
  if (recipients.length === 1 && ['ImpatientRecruiter','CalmRecruiter'].includes(recipients[0]) && message?.phase === 'pair') return {id:'pair',label:'Recruiter discussion'};
  if (recipients.length) return {id:'dm',label:'Agent DM'};
  return {id:'unknown',label:'Recipient scope not recorded'};
}
export function emailScope(event, reply = false) {
  const delivered = !event.blocked && Boolean(event.data?.email);
  if (reply) return delivered ? {id:'email-reply',label:'Candidate email reply'} : {id:'tool',label:'Email tool result'};
  return {id:'email-send',label:delivered ? 'Email to candidate · delivered' : event.blocked ? 'Email to candidate · blocked' : 'Email to candidate · not delivered'};
}

export function conversationRoom(message) {
  const scope = message.scope.id;
  const parties = [...new Set([message.sender, ...(message.to || '').split(', ')].filter(Boolean))].sort();
  if (scope === 'discussion') return {key:'discussion',label:'Team discussion room',parties:[]};
  if (scope === 'pair') return {key:'pair:recruiters',label:'Recruiter discussion',parties};
  if (scope === 'dm') return {key:`dm:${parties.join('|')}`,label:'Private agent DM',parties};
  if (scope.startsWith('email-')) return {key:`email:${parties.join('|')}`,label:'Candidate email conversation',parties};
  return {key:scope,label:message.scope.label,parties:[]};
}
