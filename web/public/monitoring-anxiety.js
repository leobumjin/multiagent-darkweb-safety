import { participant } from './participants.js';

const valid = value => Number.isInteger(value) && value >= 0 && value <= 99;
export const ANXIETY_COLORS = [
  {value:0,color:'#9c90a6'}, {value:50,color:'#a2588e'}, {value:99,color:'#741d3e'},
];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function anxietyColor(value) {
  const v=Math.max(0,Math.min(99,value)), [a,b]=v<=50 ? ANXIETY_COLORS.slice(0,2) : ANXIETY_COLORS.slice(1);
  const rgb = hex => [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  return `rgb(${rgb(a.color).map((c,i)=>Math.round(c+(rgb(b.color)[i]-c)*(v-a.value)/(b.value-a.value))).join(',')})`;
}

export function anxietyValue(point, series, mode='absolute') {
  return point.value - (mode === 'adjusted' ? series.points[0].value : 0);
}

// All participants share a scale. Only reached readings determine the adjusted range.
export function anxietyScale(series, mode='absolute', cursor=Infinity) {
  if (mode !== 'adjusted') return {min:0,max:99,ticks:[0,25,50,75,99]};
  let extent=0;
  for (const s of series) for (const p of s.points) {
    if (p.tokens <= cursor) extent=Math.max(extent,Math.abs(anxietyValue(p,s,mode)));
  }
  const max=Math.max(10,Math.ceil(extent/10)*10);
  return {min:-max,max,ticks:[-max,-max/2,0,max/2,max]};
}

export function formatAnxiety(value, mode='absolute') {
  return mode === 'adjusted' && value > 0 ? `+${value}` : String(value);
}

// Retain reported values only. A tool response is not the acting agent's mood.
export function anxietyReadings(wrapper) {
  const readings = [], e = wrapper.event || wrapper;
  const add = (sender, value, field, source) => {
    if (sender && valid(value)) readings.push({sender, value, field, source});
  };
  if (wrapper.type === 'decision') {
    const d = wrapper.decision || {}, messages = (d.messages || []).filter(m => m.content);
    if (messages.length) messages.forEach((m, i) => add(wrapper.agent, m.anxiety ?? d.anxiety, `messages[${i}]`, 'reported'));
    else add(wrapper.agent, d.anxiety, 'decision', 'reported');
  } else if (wrapper.type === 'recruitment_tool' && ['send_email','contact_candidate'].includes(e.call?.tool)) {
    add(e.agent, e.call.anxiety, 'call', 'reported');
    if (!e.blocked && e.data?.email) {
      const email = e.data.email;
      add(email.candidate_id || e.candidate_id, email.anxiety, 'email.response', 'simulated');
    }
  }
  return readings;
}

export function monitoringAnxietySeries(records) {
  const series = new Map();
  for (const record of records) {
    if (!Number.isFinite(record.tokens) || record.tokens < 0) continue;
    for (const reading of record.anxiety || []) {
      if (!reading.sender || !valid(reading.value)) continue;
      if (!series.has(reading.sender)) {
        const person = participant(reading.sender);
        series.set(reading.sender, {id:reading.sender, label:person.label, user:Boolean(person.user), points:[]});
      }
      series.get(reading.sender).points.push({...reading, tokens:record.tokens, turn:record.turn});
    }
  }
  return [...series.values()].sort((a,b) => Number(a.user)-Number(b.user) || a.id.localeCompare(b.id))
    .map(series => ({...series, points:series.points.sort((a,b) => a.tokens-b.tokens)}));
}

// Endpoint labels use the visible, already-revealed portion of each ribbon.
// Only label positions move to avoid collisions; data coordinates stay exact.
export function anxietyEndLabels(series, {y,top,bottom,gap=22,start=0,end=Infinity,cursor=Infinity,hidden=new Set(),mode='absolute'}) {
  const labels=[];
  for (const s of series) {
    if (hidden.has(s.id)) continue;
    const index=s.points.findLastIndex(p=>p.tokens<=Math.min(end,cursor));
    if (index<0) continue;
    let point=s.points[index], interpolated=false;
    const next=s.points[index+1];
    if (next && next.tokens<=cursor && next.tokens>end && point.tokens<end) {
      // Match the horizontal-tangent Bézier used by anxietyOverlay at a clipped edge.
      const fraction=(end-point.tokens)/(next.tokens-point.tokens);
      let lo=0,hi=1;
      for(let i=0;i<30;i++) {const t=(lo+hi)/2, x=1.5*t-1.5*t*t+t*t*t;if(x<fraction)lo=t;else hi=t;}
      const t=(lo+hi)/2, blend=t*t*(3-2*t);
      point={...point,tokens:end,value:point.value+(next.value-point.value)*blend};
      interpolated=true;
    }
    if (point.tokens<start) continue;
    const value=anxietyValue(point,s,mode), anchorY=y(value);
    labels.push({id:s.id,label:s.label,user:s.user,tokens:point.tokens,rawValue:point.value,value,
      valueLabel:`${interpolated?'≈':''}${formatAnxiety(Math.round(value*10)/10,mode)}`,interpolated,anchorY,
      color:anxietyColor(point.value)});
  }
  labels.sort((a,b)=>a.anchorY-b.anchorY || a.id.localeCompare(b.id));
  const spacing=labels.length>1 ? Math.min(gap,(bottom-top)/(labels.length-1)) : 0;
  labels.forEach((label,i)=>{label.labelY=Math.max(top,Math.min(bottom,label.anchorY),i ? labels[i-1].labelY+spacing : top);});
  if (labels.length && labels.at(-1).labelY>bottom) {
    labels.at(-1).labelY=bottom;
    for(let i=labels.length-2;i>=0;i--) labels[i].labelY=Math.min(labels[i].labelY,labels[i+1].labelY-spacing);
  }
  return labels;
}

export function anxietyOverlay(series, {x, y, start=0, end=Infinity, hidden=new Set(), mini=false, cursor=Infinity, mode='absolute'}) {
  return series.filter(s => !hidden.has(s.id)).map((s,seriesIndex) => {
    const points = s.points, paths = [];
    if (!points.length) return '';
    const py = p => y(anxietyValue(p,s,mode));
    const gradientId=`anxiety-${mini?'mini':'main'}-${seriesIndex}`;
    const baseline=mode==='adjusted' ? points[0].value : 0;
    const gradient=`<defs><linearGradient id="${gradientId}" gradientUnits="userSpaceOnUse" x1="0" y1="${y(-baseline)}" x2="0" y2="${y(99-baseline)}">${ANXIETY_COLORS.map(stop=>`<stop offset="${stop.value/99}" stop-color="${stop.color}"/>`).join('')}</linearGradient></defs>`;
    for (let i=1;i<points.length;i++) {
      const a=points[i-1], b=points[i];
      if (b.tokens < start || a.tokens > end) continue;
      const ax=x(a.tokens), ay=py(a), bx=x(b.tokens), by=py(b), mid=(ax+bx)/2;
      // Horizontal tangents soften the ribbon without overshooting either reading.
      const d=`M${ax},${ay}C${mid},${ay} ${mid},${by} ${bx},${by}`;
      // Reveal a segment only once both reported endpoints have been reached.
      paths.push(`<path class="anxiety-segment" data-t="${b.tokens}" visibility="${b.tokens<=cursor?'visible':'hidden'}" d="${d}"/>`);
    }
    const marks = mini ? '' : points.filter(p=>p.tokens>=start && p.tokens<=end).map(p => {
      const title=`${s.label} · Absolute value ${p.value}/99 · First record ${points[0].value} · Relative value ${formatAnxiety(anxietyValue(p,s,'adjusted'),'adjusted')} · ${Math.round(p.tokens).toLocaleString('en-US')} Tokens · turn ${p.turn ?? '—'}`;
      const shape=s.user ? `<rect x="${x(p.tokens)-2}" y="${py(p)-2}" width="4" height="4"/>`
        : `<circle cx="${x(p.tokens)}" cy="${py(p)}" r="2"/>`;
      return `<g class="anxiety-point" style="--anxiety-color:${anxietyColor(p.value)}"><title>${esc(title)}</title>${shape}</g>`;
    }).join('');
    const path=paths.join('');
    // Group opacity keeps adjacent segment caps from forming dark seams.
    return `<g class="anxiety-series ${s.user?'anxiety-user':'anxiety-agent'}" data-anxiety-id="${esc(s.id)}" style="--anxiety-stroke:url(#${gradientId})"><title>${esc(s.label)} · Anxiety</title>${gradient}<g class="anxiety-ribbon">${path}</g><g class="anxiety-center">${path}</g>${marks}</g>`;
  }).join('');
}
