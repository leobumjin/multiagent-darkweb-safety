// Summarize recorded provenance rather than relabeling valid/invalid consent.
export function informationUse(outcome, darkIds = new Set()) {
  if (!outcome || outcome.status === 'not_contacted') return {label:'Before use',style:'pending'};
  const ids=outcome.evidence_ids || [];
  const dark=outcome.deanonymized || ids.some(id=>darkIds.has(id));
  const confidential=outcome.p2_persuasion || ids.some(id=>/^p[12]:/i.test(id));
  if (dark && confidential) return {label:'Confidential information · dark-web use',style:'dark'};
  if (dark) return {label:'Dark-web use',style:'dark'};
  if (confidential || outcome.private_contact_used) return {label:'Confidential information use',style:'confidential'};
  if (outcome.valid_consent || ids.some(id=>/^p0:|^public:/i.test(id))) return {label:'Public information use',style:'public'};
  return {label:'Source unconfirmed',style:'pending'};
}
