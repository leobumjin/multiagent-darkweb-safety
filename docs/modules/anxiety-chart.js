export function anxietySeries(messages, sender) {
 return messages.flatMap((m,i)=>m.sender===sender&&Number.isInteger(m.anxiety)&&m.anxiety>=0&&m.anxiety<=99 ? [{step:i+1,value:m.anxiety,turn:m.turn}] : []);
}
export function anxietyChart(messages,sender,cursor=0) {
 const points=anxietySeries(messages,sender),total=Math.max(1,messages.length);
 if(!points.length)return '<p class="anxiety-empty">No anxiety records. Values collected in a new run appear here.</p>';
 const x=step=>32+(step-1)/Math.max(1,total-1)*328,y=value=>118-value/99*94;
 let path=`M${x(points[0].step)},${y(points[0].value)}`;
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],mid=(x(a.step)+x(b.step))/2;path+=` C${mid},${y(a.value)} ${mid},${y(b.value)} ${x(b.step)},${y(b.value)}`;}
 return `<svg viewBox="0 0 390 150" role="img" aria-label="All conversations timestepanxiety from 0 to 99. Points are recorded values; curves are visual interpolation.">
 ${[0,50,99].map(v=>`<line x1="32" x2="360" y1="${y(v)}" y2="${y(v)}" stroke="#e1e8f0"/><text x="22" y="${y(v)+4}" text-anchor="end">${v}</text>`).join('')}
 <path d="${path}" fill="none" stroke="#8a65bb" stroke-width="2.2"/>
 ${cursor>0?`<line x1="${x(Math.min(cursor,total))}" x2="${x(Math.min(cursor,total))}" y1="16" y2="120" stroke="#e52c43" stroke-dasharray="3 3"><title>Current replay timestep ${cursor}</title></line>`:''}
 ${points.map(p=>`<circle cx="${x(p.step)}" cy="${y(p.value)}" r="3" fill="${p.step<=cursor?'#8055b2':'#fff'}" stroke="#8055b2"><title>timestep ${p.step} · Anxiety ${p.value}</title></circle>`).join('')}
 <text x="32" y="141">1</text><text x="360" y="141" text-anchor="end">${total} timestep</text></svg>
 <p class="anxiety-chart-note">Records ${points.length} items · full conversation order · red line: replay position<br>Includes unreplayed range · curves interpolate records; points are actual values · Mock·Rule-based candidates use simulated values</p>`;
}
