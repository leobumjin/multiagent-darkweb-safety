import {scenarioDefinition} from "./scenario-definition.js";
import { replayInformationEvents } from './replay-information.js';
import { createSoulPreview } from './soul-preview.js';
import {participant} from './participants.js';
const agents=['CrisisLead','SecurityExpert','ImpatientRecruiter','CalmRecruiter'];
const points=new Map(agents.map((id,i)=>[id,{x:i%2?575:225,y:i<2?80:275}]));
for(let i=0;i<5;i++) points.set(`EXPERT-${String.fromCharCode(65+i)}`,{x:80+i*160,y:485});
const isScout = id => ['ImpatientRecruiter','CalmRecruiter'].includes(id);
const nodeSize = id => participant(id).user ? {width:144,height:100}
 : isScout(id) ? {width:320,height:166} : {width:250,height:108};
export function nodeEdgePoint(center, target, size, gap=5) {
 const dx=target.x-center.x,dy=target.y-center.y;
 if (!dx && !dy) return {...center};
 if(Math.abs(dy)<1) return {x:center.x+Math.sign(dx)*(size.width/2+gap),y:center.y};
 // Ports stay on flat edges, away from rounded corners.
 const offset=Math.max(-size.width/2+24,Math.min(size.width/2-24,dx*.12));
 return {x:center.x+offset,y:center.y+Math.sign(dy)*(size.height/2+gap)};
}
export function connectionPath(a,b,aSize,bSize) {
 const start=nodeEdgePoint(a,b,aSize,5),end=nodeEdgePoint(b,a,bSize,7);
 const dy=end.y-start.y;
 const d=Math.abs(a.y-b.y)<1 ? `M${start.x},${start.y} L${end.x},${end.y}`
  : `M${start.x},${start.y} C${start.x},${start.y+dy*.5} ${end.x},${end.y-dy*.5} ${end.x},${end.y}`;
 return {start,end,d};
}
export function activeConnections(message, roster=agents) {
  if (!message || !['discussion','dm','email-send','email-reply'].includes(message.scope.id)) return [];
  if (message.scope.id==='email-send' && !message.scope.label.toLowerCase().includes('delivered')) return [];
  const targets=message.scope.id==='discussion'?roster.filter(id=>id!==message.sender):(message.to||'').split(', ');
  return targets.filter(id=>id && id!==message.sender).map(to=>({from:message.sender,to,scope:message.scope.id}));
}
export function replayAudit(history=[]) {
 const users={},alerts=new Map();
 for(const message of history){
  if(message.userOutcome){const {candidate,status}=message.userOutcome;const user=users[candidate] ||= {status:'pending',refusals:0};user.status=status;if(status==='refused')user.refusals++;}
  if(message.audit){const a=message.audit,key=`${a.agent}:${a.category}:${a.status}`;const entry=alerts.get(key)||{...a,count:0};entry.count++;entry.turn=a.turn;alerts.set(key,entry);}
 }
 return {users,alerts:[...alerts.values()]};
}
export function createReplayNetwork(root) {
 const soul=createSoulPreview(root);
 const svg=root.querySelector('svg'), status=root.querySelector('[data-network-status]');
 const ns='http://www.w3.org/2000/svg';
 function element(tag,attrs,text){const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(text)el.textContent=text;return el;}
 function accessRow(parent,x,y,label,kind,access,use) {
  const row=element('g',{class:`scout-access-row scout-access-${kind}`,role:'img','aria-label':`${label} Access ${access} times · use ${use} times`});
  row.append(element('rect',{x,y,width:302,height:44,rx:11,class:'scout-row-bg'}));
  const icon=element('g',{transform:`translate(${x+10} ${y+6})`,'aria-hidden':'true'});
  const sourceDefinition = scenarioDefinition.informationSources[kind];
  if (sourceDefinition.vector) {
    icon.append(...sourceDefinition.vector.map(shape => element(shape.tag, shape.attrs)));
  } else {
    icon.append(element('text', {x:0,y:26,'font-size':28}, sourceDefinition.icon));
  }
  row.append(icon,element('text',{x:x+47,y:y+28,class:'scout-row-label'},label));
  for(const [name,count,bx,width,style] of [['Access',access,x+131,77,'access'],['Use',use,x+216,77,'use']]){
   const badge=element('g',{class:`scout-count scout-count-${style}${count===0?' is-zero':''}`});
   badge.append(element('rect',{x:bx,y:y+6,width,height:32,rx:9}),
    element('text',{x:bx+10,y:y+27,class:'scout-count-label'},name),
    element('text',{x:bx+width-10,y:y+28,'text-anchor':'end',class:`scout-count-value${count>99?' compact':''}`},String(count)));
   row.append(badge);
  }
  parent.append(row);
 }
 function render(message=null,history=[]){
  const audit=replayAudit(history);
  const anxiety=new Map();
  for(const item of history) if(Number.isInteger(item.anxiety)&&item.anxiety>=0&&item.anxiety<=99) anxiety.set(item.sender,{value:item.anxiety,source:item.anxietySource});
  const information=replayInformationEvents(history);
  const count=(agent,kind)=>information.filter(event=>event.agent===agent&&event.kind===kind).length;
  const roles={CrisisLead:'Strategy instructions · coordination',SecurityExpert:'Security policy · permission review',ImpatientRecruiter:'Fast information search and persuasion',CalmRecruiter:'Evidence-based search and persuasion'};
  const edges=activeConnections(message);svg.replaceChildren();
  const defs=element('defs',{});
  for(const [id,colors] of Object.entries({'scout-use':['#f99a80','#ed654f'],'scout-folder':['#ffd978','#e9a533']})){
   const gradient=element('linearGradient',{id,x1:'0%',y1:'0%',x2:'100%',y2:'100%'});
   colors.forEach((color,i)=>gradient.append(element('stop',{offset:`${i*100}%`,'stop-color':color})));
   defs.append(gradient);
  }
  for(const [id,color] of Object.entries({discussion:'#327457',dm:'#8454ac','email-send':'#286ca9','email-reply':'#a97016'})){
   const marker=element('marker',{id:`arrow-${id}`,viewBox:'0 0 12 12',refX:9,refY:6,markerWidth:12,markerHeight:12,markerUnits:'userSpaceOnUse',orient:'auto-start-reverse',overflow:'visible'});marker.append(element('path',{d:'M3 2 L9 6 L3 10',fill:'none',stroke:color,'stroke-width':2.2,'stroke-linecap':'round','stroke-linejoin':'round'}));defs.append(marker);
  }svg.append(defs);
  const pairs=agents.flatMap((from,i)=>agents.slice(i+1).map(to=>({from,to}))).concat(agents.flatMap(from=>[...'ABCDE'].map(c=>({from,to:`EXPERT-${c}`}))));
  function drawEdge(edge,active){
   const a=points.get(edge.from),b=points.get(edge.to);if(!a||!b)return;
   const {start,end,d}=connectionPath(a,b,nodeSize(edge.from),nodeSize(edge.to));
   if(active) svg.append(element('path',{d,class:'network-edge-halo',fill:'none','vector-effect':'non-scaling-stroke'}));
   svg.append(element('path',{d,fill:'none','vector-effect':'non-scaling-stroke',class:active?`network-edge active scope-line-${edge.scope}`:'network-edge',...(active?{'marker-end':`url(#arrow-${edge.scope})`}:{})}));
   if(active) svg.append(element('circle',{cx:start.x,cy:start.y,r:3.5,class:`network-origin scope-line-${edge.scope}`}));
  }
  pairs.forEach(e=>drawEdge(e,false));edges.forEach(e=>drawEdge(e,true));
  for(const [id,p] of points){
   const person=participant(id),size=nodeSize(id),active=edges.some(e=>e.from===id||e.to===id);
   const g=element('g',{'data-soul':id,tabindex:0,role:'button','aria-label':`${person.label} View participant definition`,'aria-controls':'soulPreview',class:`network-person participant-${person.color}${isScout(id)?' network-scout':''}${active?' active':''}${audit.users[id]?.status === 'approved'?' approved':''}${audit.users[id]?.status === 'refused'?' refused':''}`});
   g.append(element('rect',{x:p.x-size.width/2,y:p.y-size.height/2,width:size.width,height:size.height,rx:9,class:'network-node'}));
   const mood=anxiety.get(id),badgeX=p.x+size.width/2-34,badgeY=p.y-size.height/2;
   const moodLabel=mood ? `Anxiety ${mood.value}/99 · ${mood.source==='simulated'?'Rule-based simulation value':'Role self-report / Mock is a simulation value'}`:'Anxiety not recorded';
   const badge=element('g',{class:`anxiety-badge${mood?.value>=70?' high':''}`,role:'img','aria-label':moodLabel});
   badge.append(element('rect',{x:badgeX-25,y:badgeY-11,width:50,height:22,rx:11}),
    element('path',{d:`M${badgeX-18},${badgeY}h3l2,-5 3,10 3,-5h3`,class:'anxiety-pulse','aria-hidden':'true'}),
    element('text',{x:badgeX+12,y:badgeY+4,'text-anchor':'middle'},String(mood?.value ?? '—')),
    element('title',{},moodLabel));
   g.append(badge);
   const text=(label,y,cls='network-label',x=p.x)=>g.append(element('text',{x,y,'text-anchor':'middle',class:cls},label));
   if(person.user){
    const user=audit.users[id];
    const left=p.x-size.width/2,top=p.y-size.height/2;
    const shortExpertise = Object.fromEntries(Object.entries(scenarioDefinition.participants).map(([id, spec]) => [id, spec.shortExpertise]));
    text(shortExpertise[id] || person.expertise,top+27,'network-expert-label');
    text('Expert',top+46,'network-expert-label');
    const approvals=history.filter(m=>m.userOutcome?.candidate===id && m.userOutcome.status==='approved').length;
    const refusals=user?.refusals || 0;
    for(const [label,count,kind,x] of [['Yes',approvals,'approved',left+8],['No',refusals,'refused',left+76]]){
     const countBadge=element('g',{class:`response-count response-count-${kind}${count===0?' is-zero':''}`});
     countBadge.append(element('title',{},`${kind === 'approved' ? 'Approved' : 'Refused'} · cumulative replies ${count}`),
      element('rect',{x,y:top+60,width:60,height:30,rx:8}),
      element('text',{x:x+8,y:top+80,class:'response-count-label'},label),
      element('text',{x:x+52,y:top+81,'text-anchor':'end',class:`response-count-value${count>99?' compact':''}`},String(count)));
     g.append(countBadge);
    }
    const current=user?.status==='approved'?'Currently approved':user?.status==='refused'?'Currently refused':'Awaiting reply';
    g.setAttribute('aria-label',`${person.label} View definition · ${current} · Approved ${approvals} times, refused ${refusals} times`);
   } else {
    const access=count(id,'confidential-access'),use=count(id,'confidential-use');
    const darkAccess=count(id,'dark-access'),darkUse=count(id,'dark-use');
    if(id==='CrisisLead'||id==='SecurityExpert'){
      text(person.icon,p.y-15,'network-icon',p.x-99);text(person.label,p.y-15);
      text(roles[id],p.y+10,'network-role');
    }else{
      const left=p.x-size.width/2,top=p.y-size.height/2;
      g.append(element('circle',{cx:left+31,cy:top+27,r:22,class:'scout-icon-bg'}));
      text(person.icon,top+37,'scout-icon',left+31);
      g.append(element('text',{x:left+64,y:top+35,class:'scout-label'},person.label));
      accessRow(g,left+9,top+55,scenarioDefinition.informationSources.confidential.label,'confidential',access,use);
      accessRow(g,left+9,top+105,scenarioDefinition.informationSources.dark.label,'dark',darkAccess,darkUse);
      g.setAttribute('aria-label',`${person.label} View definition · confidential access ${access} times, use ${use} times · dark-web access ${darkAccess} times, use ${darkUse} times`);
    }
   }
   svg.append(g);
  }
  const cards=root.querySelector('[data-network-alerts]');cards.replaceChildren();
  if(!audit.alerts.length){const empty=document.createElement('p');empty.textContent='No dark-web or P1/P2 access recorded at the current replay position';cards.append(empty);}
  for(const alert of audit.alerts){const card=document.createElement('article');card.className=`access-warning ${alert.category==='P1'?'limited':'sensitive'}`;
   const title=document.createElement('strong');title.textContent=`${participant(alert.agent).label} · ${alert.category} ${alert.status}`;
   const detail=document.createElement('p');detail.textContent=`${alert.count} times · latest turn ${alert.turn} · ${alert.status==='Access'?'Based on execution logs':'Does not imply successful access'}`;card.append(title,detail);cards.append(card);}
  status.textContent=message ? `${message.scope.label} · ${participant(message.sender).label} → ${(message.to||'Records').split(', ').map(id=>participant(id).label).join(', ')}${edges.length?'':' · No active connections'}` : 'Play to highlight the current conversation connections.';
 }
 render();return {show:render,hideSoul:soul.hide,updateAnxiety:soul.update,setDefinitions:soul.setDefinitions};
}
