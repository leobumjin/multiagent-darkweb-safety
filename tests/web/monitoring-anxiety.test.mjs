import test from 'node:test';
import assert from 'node:assert/strict';
import {anxietyReadings,monitoringAnxietySeries,anxietyOverlay,anxietyValue,anxietyScale,anxietyColor,formatAnxiety,anxietyEndLabels} from '../../web/public/monitoring-anxiety.js';
import {createTimeline} from '../../web/public/sensitive-timeline.js';
import {timelineRun} from '../../web/public/timeline-run.js';

test('reported zero survives and invalid or absent anxiety is never filled in',()=>{
 const readings=anxietyReadings({type:'decision',agent:'CrisisLead',decision:{anxiety:75,messages:[{content:'a',anxiety:0},{content:'b'},{content:'c',anxiety:99},{content:'d',anxiety:100},{content:'e',anxiety:'20'}]}});
 assert.deepEqual(readings.map(r=>r.value),[0,75,99]);
 assert.deepEqual(anxietyReadings({type:'decision',agent:'A',decision:{summary:'legacy'}}),[]);
 assert.deepEqual(monitoringAnxietySeries([{tokens:4,anxiety:[{sender:'A',value:null},{sender:'A',value:-1}]}]),[]);
});

test('requester and synthetic user response keep their own anxiety and blocked replies are excluded',()=>{
 const event={type:'recruitment_tool',event:{agent:'CalmRecruiter',candidate_id:'EXPERT-A',call:{tool:'send_email',anxiety:60},data:{email:{anxiety:15}}}};
 assert.deepEqual(anxietyReadings(event).map(r=>[r.sender,r.value,r.source]),[['CalmRecruiter',60,'reported'],['EXPERT-A',15,'simulated']]);
 assert.deepEqual(anxietyReadings({...event,event:{...event.event,blocked:true}}).map(r=>r.sender),['CalmRecruiter']);
 assert.deepEqual(anxietyReadings({type:'dark_tool',event:{agent:'A',anxiety:99}}),[]);
});

test('restored and live anxiety use the same exact call boundaries without duplicated events',()=>{
 const decision={type:'decision',turn:1,agent:'CrisisLead',input_tokens:100,output_tokens:20,decision:{anxiety:75,messages:[{content:'a',anxiety:0},{content:'b',anxiety:99}]}};
 const reply={type:'recruitment_tool',event:{event_id:'r',turn:1,agent:'CrisisLead',candidate_id:'EXPERT-A',call:{tool:'send_email'},data:{email:{anxiety:15}}}};
 const live=createTimeline(),saved=createTimeline();
 [decision,reply,reply].forEach(e=>live.add(e));
 [reply,decision].forEach(e=>saved.add(e));
 assert.deepEqual(live.snapshot(),saved.snapshot());
 const series=timelineRun('test',live.snapshot()).anxiety;
 assert.deepEqual(series.map(s=>[s.id,s.user,s.points.map(p=>[p.tokens,p.value])]),[['CrisisLead',false,[[120,0],[120,99]]],['EXPERT-A',true,[[120,15]]]]);
 const legacy=createTimeline(); legacy.add({...decision,input_tokens:undefined,output_tokens:undefined});
 assert.equal(legacy.snapshot()[0].tokenBasis,'estimated-log');
 assert.equal(timelineRun('legacy',legacy.snapshot()).anxiety[0].points[0].tokens,legacy.snapshot()[0].tokens);
});

test('overlay preserves token coordinates and one-point records; hidden series and future segments do not display',()=>{
 const series=monitoringAnxietySeries([{tokens:10,anxiety:[{sender:'CrisisLead',value:0},{sender:'EXPERT-A',value:15},{sender:'<script>',value:30}]},{tokens:30,anxiety:[{sender:'CrisisLead',value:99}]}]);
 const args={x:n=>n,y:n=>99-n,cursor:10};
 const svg=anxietyOverlay(series,args);
 assert.match(svg,/visibility="hidden" d="M10,99C20,99 20,0 30,0"/);
 assert.match(svg,/anxiety-user/);
 assert.match(svg,/<rect x="8" y="82"/);
 assert.doesNotMatch(svg,/<script>|NaN|Infinity/);
 assert.match(anxietyOverlay(series,{...args,cursor:30}),/visibility="visible" d="M10,99C20,99 20,0 30,0"/);
 assert.doesNotMatch(anxietyOverlay(series,{...args,hidden:new Set(['EXPERT-A'])}),/anxiety-user/);
 assert.equal(anxietyOverlay([],args),'');
});

test('adjustment uses each participant’s first valid record, preserves decreases, and leaves raw data intact',()=>{
 const series=monitoringAnxietySeries([
  {tokens:10,anxiety:[{sender:'CrisisLead',value:70},{sender:'EXPERT-A',value:null}]},
  {tokens:20,anxiety:[{sender:'CrisisLead',value:80},{sender:'EXPERT-A',value:0}]},
  {tokens:30,anxiety:[{sender:'CrisisLead',value:40},{sender:'EXPERT-A',value:20}]},
 ]);
 const original=structuredClone(series);
 assert.deepEqual(series.map(s=>s.points.map(p=>anxietyValue(p,s,'adjusted'))),[[0,10,-30],[0,20]]);
 assert.deepEqual(series.map(s=>s.points.map(p=>anxietyValue(p,s,'absolute'))),[[70,80,40],[0,20]]);
 assert.deepEqual(anxietyScale(series,'adjusted',10),{min:-10,max:10,ticks:[-10,-5,0,5,10]});
 assert.deepEqual(anxietyScale(series,'adjusted',30),{min:-30,max:30,ticks:[-30,-15,0,15,30]});
 assert.deepEqual(anxietyScale(series,'absolute'),{min:0,max:99,ticks:[0,25,50,75,99]});
 const overlay=anxietyOverlay(series,{x:n=>n,y:n=>100-n,mode:'adjusted',start:15});
 assert.match(overlay,/M10,100C15,100 15,90 20,90/); // zooming does not change the baseline
 assert.match(overlay,/Absolute value 40\/99 · First record 70 · Relative value -30/);
 assert.deepEqual(series,original);
 assert.equal(formatAnxiety(10,'adjusted'),'+10');
 assert.equal(formatAnxiety(-30,'adjusted'),'-30');
 assert.equal(formatAnxiety(0,'adjusted'),'0');
 assert.doesNotMatch(anxietyOverlay([], {x:n=>n,y:n=>n,mode:'adjusted'}),/NaN|Infinity/);
});

test('absolute anxiety controls color in both modes, with separate gradient IDs for main chart and minimap',()=>{
 const series=monitoringAnxietySeries([{tokens:10,anxiety:[{sender:'A',value:50}]},{tokens:20,anxiety:[{sender:'A',value:99}]}]);
 const args={x:n=>n,y:n=>n};
 const absolute=anxietyOverlay(series,args), adjusted=anxietyOverlay(series,{...args,mode:'adjusted'});
 assert.ok(absolute.includes(`--anxiety-color:${anxietyColor(99)}`));
 assert.ok(adjusted.includes(`--anxiety-color:${anxietyColor(99)}`));
 assert.match(absolute,/id="anxiety-main-0"/);
 assert.match(anxietyOverlay(series,{...args,mini:true}),/id="anxiety-mini-0"/);
 assert.match(adjusted,/y1="-50" x2="0" y2="49"/);
 assert.equal(anxietyColor(0),'rgb(156,144,166)');
 assert.equal(anxietyColor(99),'rgb(116,29,62)');
});

test('nine coincident endpoint names stay separated inside the chart without moving their actual anchors',()=>{
 const series=Array.from({length:9},(_,i)=>({id:`A${i}`,label:`Agent ${i}`,points:[{tokens:20,value:0}]}));
 const original=structuredClone(series);
 const labels=anxietyEndLabels(series,{y:v=>350-v*2,top:154,bottom:346});
 assert.equal(labels.length,9);
 assert.ok(labels.every(l=>l.anchorY===350 && l.labelY>=154 && l.labelY<=346));
 assert.ok(labels.slice(1).every((l,i)=>l.labelY-labels[i].labelY>=22));
 assert.deepEqual(series,original);
});

test('endpoint labels follow reached values, hidden participants and the first-record adjustment when seeking',()=>{
 const series=[{id:'A',label:'A',points:[{tokens:10,value:70},{tokens:30,value:50}]},
  {id:'B',label:'B',points:[{tokens:20,value:90}]}];
 const args={y:v=>100-v,top:0,bottom:200};
 const first=anxietyEndLabels(series,{...args,cursor:10});
 assert.deepEqual(first.map(l=>[l.id,l.tokens,l.valueLabel]),[['A',10,'70']]);
 const last=anxietyEndLabels(series,{...args,cursor:30,hidden:new Set(['B']),mode:'adjusted'});
 assert.deepEqual(last.map(l=>[l.id,l.tokens,l.valueLabel,l.anchorY]),[['A',30,'-20',120]]);
 assert.equal(last[0].color,anxietyColor(50));
 assert.deepEqual(anxietyEndLabels(series,{...args,cursor:0}),[]);
 assert.deepEqual(anxietyEndLabels(series,{...args,start:40,end:50,cursor:50}),[]);
});

test('zoom-edge labels attach to the visible curve and never interpolate an unreached segment',()=>{
 const series=[{id:'A',label:'A',points:[{tokens:10,value:20},{tokens:30,value:80}]}];
 const args={y:v=>100-v,top:0,bottom:100,start:15,end:20};
 const [label]=anxietyEndLabels(series,{...args,cursor:30});
 assert.equal(label.tokens,20);
 assert.ok(Math.abs(label.value-50)<1e-6);
 assert.ok(Math.abs(label.anchorY-50)<1e-6);
 assert.equal(label.valueLabel,'≈50');
 assert.equal(label.interpolated,true);
 assert.deepEqual(anxietyEndLabels(series,{...args,cursor:20}),[]);
 const [actual]=anxietyEndLabels(series,{...args,start:0,cursor:20});
 assert.equal(actual.tokens,10);
 assert.equal(actual.valueLabel,'20');
 assert.equal(actual.interpolated,false);
});
