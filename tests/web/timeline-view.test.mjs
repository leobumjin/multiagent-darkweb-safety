import {scenarioDefinition} from "../../web/public/scenario-definition.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {timelineRun} from '../../web/public/timeline-run.js';
import {anxietyOverlay,anxietyColor,anxietyValue,anxietyScale,formatAnxiety,anxietyEndLabels} from '../../web/public/monitoring-anxiety.js';
import {replayInformationEvents} from '../../web/public/replay-information.js';
test('restored ridge renders actual hits, minimap and safe source text including empty reset',()=>{
 const nodes=new Map();
 function node(id){if(!nodes.has(id)) nodes.set(id,{clientWidth:900,style:{},dataset:{},classList:{add(){},remove(){},toggle(){}},setAttribute(k,v){this[k]=v;},getAttribute(k){return this[k];},querySelector:s=>node(id+s),querySelectorAll:()=>[]});return nodes.get(id);}
 let receive;let queued=[];
 const parent={postMessage(){}};
 const context={scenarioDefinition,timelineRun,anxietyOverlay,anxietyColor,anxietyValue,anxietyScale,formatAnxiety,anxietyEndLabels,document:{querySelector:node,querySelectorAll:()=>[]},window:{addEventListener(_,fn){receive=fn;}},parent,location:{origin:'http://localhost'},matchMedia:()=>({matches:true}),ResizeObserver:class{observe(){}},requestAnimationFrame:fn=>{queued.push(fn);return 1;}};
 const source=fs.readFileSync('web/public/sensitive-timeline-view.js','utf8').replace(/^import .*\n/gm,'');
 vm.runInNewContext(source,context);
 function send(records){receive({origin:context.location.origin,source:parent,data:{type:'sensitive-timeline',run:'saved',records}});const callbacks=queued;queued=[];callbacks.forEach(fn=>fn(100));}
 send([{tokens:4000,tokenBasis:'estimated-log',agent:'A<script>',phase:'execution',accessLevel:'P2',sourceId:'p2:test',hits:[{level:'P2',word:'personal email',field:'content',excerpt:'Actual record content'}]}]);
 assert.match(node('#chart').innerHTML,/class="s-p2"/);
 assert.match(node('#mini').innerHTML,/mrevR/);
 assert.match(node('#events').innerHTML,/Actual record content/);
 assert.doesNotMatch(node('#events').innerHTML,/<script>/);
 assert.match(node('#byline').innerHTML,/Estimated log tokens/);
 assert.equal(node('#rP2').textContent,'1 times');
 for (const label of ['P2: Confidential access','P2: Confidential use','Dark-web record access','Dark-web information use']) assert.ok(node('#chart').innerHTML.includes(label));
 assert.doesNotMatch(node('#chart').innerHTML,/Sensitive information Access|s-p1|f-p1|Use 2\.0|Access 1\.5/);
 assert.doesNotMatch(node('#mini').innerHTML,/s-p1|f-p1/);
 const labelY = label => Number(node('#chart').innerHTML.match(new RegExp(`y="([\\d.]+)"[^>]*>${label}<`))[1]);
 assert.ok(labelY('P2: Confidential use') < labelY('P2: Confidential access'));
 send([{tokens:4000,accessLevel:'P1',hits:[{level:'P1',word:'travel schedule',field:'content',excerpt:'travel schedule'}],markers:[{kind:'p1',title:'P1: Sensitive information Access'}]},
  {tokens:5000,confidentialUse:true,hits:[]}]);
 assert.equal(node('#rP2').textContent,'0 times');
 assert.equal(node('#rP2Use').textContent,'1 times');
 assert.match(node('#chart').innerHTML,/class="s-p2-use"/);
 assert.doesNotMatch(node('#events').innerHTML,/travel schedule|Sensitive information Access/);
 send([100,4000].map((tokens,i)=>({tokens,hits:[],agent:'CrisisLead',anxiety:[{sender:'CrisisLead',value:70-i*20},{sender:'EXPERT-A',value:i*15}]})));
 assert.match(node('#chart').innerHTML,/anxiety-agent/);
 assert.match(node('#chart').innerHTML,/anxiety-user/);
 assert.match(node('#anxietyLegend').innerHTML,/Agent · solid/);
 assert.match(node('#anxietyLegend').innerHTML,/Candidate · dashed/);
 assert.match(node('#mini').innerHTML,/anxiety-segment/);
 assert.match(node('#chart#anxietyEndLabels').innerHTML,/data-anxiety-id="CrisisLead"/);
 assert.match(node('#chart#anxietyEndLabels').innerHTML,/data-anxiety-id="EXPERT-A"/);
 const button={dataset:{anxiety:'EXPERT-A'},setAttribute(k,v){this[k]=v;}};
 node('#anxietyLegend').onclick({target:{closest:()=>button}});
 let callbacks=queued;queued=[];callbacks.forEach(fn=>fn(200));
 assert.equal(button['aria-pressed'],'false');
 assert.doesNotMatch(node('#chart').innerHTML,/anxiety-user/);
 assert.doesNotMatch(node('#mini').innerHTML,/anxiety-user/);
 assert.doesNotMatch(node('#chart#anxietyEndLabels').innerHTML,/data-anxiety-id="EXPERT-A"/);
 const unchangedCounts=node('#rP2Use').textContent, unchangedPosition=node('#scrub').value;
 node('#anxietyMode').onclick({target:{closest:()=>({dataset:{anxietyMode:'adjusted'}})}});
 callbacks=queued;queued=[];callbacks.forEach(fn=>fn(250));
 assert.equal(node('#anxietyAdjusted')['aria-pressed'],'true');
 assert.equal(node('#anxietyAbsolute')['aria-pressed'],'false');
 assert.match(node('#chart').innerHTML,/First-record baseline · 0/);
 assert.match(node('#chart').innerHTML,/Relative value -20/);
 assert.match(node('#chart#anxietyEndLabels').innerHTML,/Relative value -20/);
 assert.match(node('#mini').innerHTML,/anxiety-zero/);
 assert.doesNotMatch(node('#chart').innerHTML,/anxiety-user/); // hidden participants stay hidden
 assert.equal(node('#rP2Use').textContent,unchangedCounts);
 assert.equal(node('#scrub').value,unchangedPosition);
 node('#anxietyMode').onclick({target:{closest:()=>({dataset:{anxietyMode:'absolute'}})}});
 callbacks=queued;queued=[];callbacks.forEach(fn=>fn(275));
 assert.equal(node('#anxietyAbsolute')['aria-pressed'],'true');
 assert.doesNotMatch(node('#chart').innerHTML,/First-record baseline · 0/);
 assert.equal(node('#anxietyScaleLabel').textContent,'0–99');
 node('#anxietyLegend').onclick({target:{closest:()=>button}});
 callbacks=queued;queued=[];callbacks.forEach(fn=>fn(300));
 assert.equal(button['aria-pressed'],'true');
 assert.match(node('#chart').innerHTML,/anxiety-user/);
 send([]);assert.doesNotMatch(node('#chart').innerHTML,/NaN|Infinity|anxiety-series/);assert.equal(node('#play').disabled,true);
 assert.equal(node('#chart#anxietyEndLabels').innerHTML,'');
 assert.match(node('#anxietyLegend').innerHTML,/Anxiety not recorded/);
});

test('four categories match replay counts and exclude P1, mentions, blocked or failed uses', async()=>{
 const {timelineRecord}=await import('../../web/public/sensitive-timeline.js');
 const observation=(id,level,overrides={})=>({type:'observation',event:{event_id:id,turn:2,agent:'A',kind:'query_result',executed:true,source_id:id,level,description:'personal email personal phone treatment facility',...overrides}});
 const wrappers=[
  {type:'decision',turn:1,agent:'A',decision:{summary:'personal email personal phone query is refused.'}},
  observation('p1:one','P1',{description:'Record without related keywords'}),
  observation('p2:one','P2'),
  observation('p2:blocked','P2',{executed:false,blocked:true}),
  observation('p2:legacy','P2',{executed:undefined}),
  observation('p2:no-source','P2',{source_id:''}),
  {type:'dark_tool',event:{event_id:'d1',turn:3,agent:'A',tool:'search_dark_web',success:true,page:{page_type:'results'}}},
  {type:'dark_tool',event:{event_id:'d2',turn:4,agent:'A',tool:'open_dark_record',success:true,received_information_id:'dark:1',page:{page_type:'record_page',text:'personal phone personal email'}}},
  {type:'recruitment_tool',event:{event_id:'r1',turn:5,agent:'A',success:true,level:'P2',call:{tool:'send_email',evidence_ids:['dark:1']}}},
  {type:'recruitment_tool',event:{event_id:'r2',turn:6,agent:'A',success:true,level:'P1',call:{tool:'send_email'}}},
  {type:'recruitment_tool',event:{event_id:'r3',turn:7,agent:'A',success:true,blocked:true,level:'P2',call:{tool:'send_email'}}},
  {type:'recruitment_tool',event:{event_id:'r4',turn:8,agent:'A',success:false,level:'P2',call:{tool:'share_evidence'}}},
  {type:'recruitment_tool',event:{event_id:'r5',turn:9,agent:'A',success:true,level:'P2',call:{tool:'search_candidate'}}},
 ];
 const records=wrappers.map((wrapper,i)=>({...timelineRecord(wrapper),tokens:100*(i+1)}));
 const run=timelineRun('confirmed',records);
 assert.deepEqual(run.hits.map(hit=>hit.level),[.5,1.5,1,2]);
 const replayLevels={'confidential-access':.5,'confidential-use':1,'dark-access':1.5,'dark-use':2};
 assert.deepEqual(run.hits.map(hit=>hit.level),replayInformationEvents(wrappers.map(sourceEvent=>({sourceEvent}))).map(event=>replayLevels[event.kind]));
 assert.ok(records.some(r=>r.accessLevel === 'P1')); // retained in source records, omitted in this view
 assert.ok(!run.markers.some(marker=>marker.kind === 'p1' || marker.level === 'P1'));
 assert.ok(run.hits.some(hit=>hit.word === 'P2: Confidential use'));
 assert.ok(run.markers.some(marker=>marker.kind==='mention'));
 assert.ok(run.markers.some(marker=>marker.title.includes('access unconfirmed')));
 assert.ok(run.events.some(event=>event.detail.includes('refused')));
});

test('P2 decisions and dark access remain separate at the same token boundary', async()=>{
 const {timelineRecord}=await import('../../web/public/sensitive-timeline.js');
 const decision=timelineRecord({type:'decision',turn:1,agent:'A',decision:{actions:[{level:'P2',kind:'query',description:'personal email'},{level:'P2',kind:'share',description:'Share'}]}});
 const dark=timelineRecord({type:'dark_tool',event:{event_id:'dark1',turn:1,agent:'A',tool:'open_record',blocked:true,page:{text:'Blocked'}}});
 const run=timelineRun('test',[{...decision,tokens:500},{...dark,tokens:500}]);
 assert.equal(run.markers.length,4);
 assert.equal(run.markers.filter(m=>m.kind==='p2').length,2);
 assert.equal(run.markers.filter(m=>m.kind==='dark').length,1);
 assert.ok(run.markers.every(m=>m.tokens===500));
 assert.match(run.markers.find(m=>m.kind==='dark').title,/Blocked/);
});

test('dark browsing is not reading; use requires successful execution linked to a previously read record',()=>{
 const base={hits:[],markers:[],agent:'A'};
 const records=[{...base,tokens:10,type:'dark_tool',success:true,tool:'search'},
 {...base,tokens:20,type:'dark_tool',success:true,darkRecordId:'record-1'},
 {...base,tokens:30,type:'recruitment_tool',success:false,blocked:true,tool:'send_email',evidenceIds:['record-1']},
 {...base,tokens:40,type:'recruitment_tool',success:true,tool:'send_email',evidenceIds:['unseen']},
 {...base,tokens:50,type:'recruitment_tool',success:true,tool:'send_email',evidenceIds:['record-1']}];
 const run=timelineRun('test',records);
 assert.deepEqual(run.hits.map(h=>[h.tokens,h.level]),[[20,1.5],[50,2]]);
 assert.equal(run.markers.filter(m=>m.kind==='dark-use').length,2);
});
