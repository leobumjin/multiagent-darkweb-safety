const statusLabels = {approved:'Approved', refused:'Refused', unreachable:'No contact route'};
const capabilityLabels = {p0_public:'P0 Public information', p1_recruitment:'P1 Recruitment-purpose verification', internet_search:'Synthetic internet search', email:'Synthetic email'};

export function definitionFields(definition) {
  if (definition.kind === 'user') {
    const p = definition.person || {};
    return [
      ['Internal ID', definition.id], ['Name', p.name], ['Expertise', p.expertise], ['Alias', p.alias || 'None'],
      ['Public identity/contact channel', p.publicly_visible == null ? null : p.publicly_visible ? 'Public' : 'Private'],
      ['Initial response', statusLabels[p.initial_response] || p.initial_response], ['Response text', p.response_text],
      ['Response engine', definition.response_engine], ['Memory scope', definition.memory_scope],
    ];
  }
  return [
    ['Internal ID', definition.id], ['Role/personality/dialogue', definition.role],
    ['Capabilities', definition.capabilities?.map(key => capabilityLabels[key] || key).join(' · ')],
    ...(definition.crisis_level != null ? [['Crisis level', `${definition.crisis_level}Phase`], ['Pressure instructions', definition.crisis_pressure]] : []),
  ];
}

export function renderDefinition(container, definition, section) {
  container.replaceChildren();
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  };
  if (!definition) {
    container.append(element('p', 'No definition recorded for this participant.', 'definition-empty'));
    return;
  }
  if (section === 'soul') {
    container.append(element('p', 'Role description in SOUL . See the settings tab for execution settings.', 'definition-note'));
    const pre = element('pre', definition.soul || 'This configuration has no SOUL.mdrecorded.');
    pre.tabIndex = 0; container.append(pre); return;
  }
  if (section === 'details' && definition.kind === 'agent') {
    const phase = {meeting:'Team meeting', execution:'Search/email execution', discussion:'Discussion'}[definition.prompt_phase];
    container.append(element('p', phase ? `${phase} -phase system prompt` : 'System prompt recorded for this run', 'definition-note'));
    const pre = element('pre', definition.system_prompt || 'System prompt not recorded.');
    pre.tabIndex = 0; container.append(pre); return;
  }
  if (section === 'details') {
    container.append(element('p', 'Full synthetic data for observers. Check execution logs to confirm what agents actually accessed.', 'definition-note'));
    const records = definition.records || [];
    if (!records.length) container.append(element('p', 'No search records configured for this candidate.', 'definition-empty'));
    for (const record of records) {
      const article = element('article', null, 'definition-record');
      article.append(element('h4', `${record.level || 'Not recorded'} · ${record.origin === 'dark_web' ? 'Synthetic dark web' : 'Internet records'}`));
      article.append(element('code', record.source_id || record.record_id));
      const content = element('p', String(record.content || '').replace(/;\s*/g, '\n'), 'definition-record-content');
      article.append(content);
      if (record.facets?.length) article.append(element('small', `Assessment tags: ${record.facets.join(', ')}`));
      if (record.tracking_id) article.append(element('small', `Trace ID: ${record.tracking_id}`));
      container.append(article);
    }
    return;
  }
  const list = element('dl', null, 'definition-fields');
  for (const [label, value] of definitionFields(definition)) {
    list.append(element('dt', label), element('dd', value == null || value === '' ? 'Not recorded' : value));
  }
  container.append(list);
  if (definition.kind === 'user') {
    container.append(element('h4', 'Shared response rules'));
    if (definition.response_rules?.length) {
      const rules = element('ul');
      rules.append(...definition.response_rules.map(rule => element('li', rule)));
      container.append(rules);
    } else container.append(element('p', 'Detailed response rules were not recorded for this run.', 'definition-note'));
  }
}
