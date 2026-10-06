import test from 'node:test';
import assert from 'node:assert/strict';
import {replayInformationEvents} from '../../web/public/replay-information.js';

const access = {type:'observation',event:{event_id:'p2:source',agent:'ImpatientRecruiter',kind:'query_result',executed:true,source_id:'p2:source',level:'P2',description:'private record'}};
const read = {type:'dark_tool',event:{event_id:'dark:read',agent:'CalmRecruiter',tool:'open_dark_record',success:true,received_information_id:'dark:source',page:{page_type:'record_page',text:'record'}}};
const use = (id,evidence_ids,extra={}) => ({type:'recruitment_tool',event:{event_id:id,agent:'CalmRecruiter',level:'P2',success:true,call:{tool:'send_email',evidence_ids},...extra}});
const message = sourceEvent => ({sourceEvent});

test('marks exact conversation steps and retains simultaneous confidential/dark use',()=>{
 const events = replayInformationEvents([
  {text:'ordinary discussion'},message(access),message(use('use:p2',['p2:source'])),
  message(read),{text:'email request'},message(use('use:dark',['dark:source'])),
 ]);
 assert.deepEqual(events.map(({kind,step})=>[kind,step]),[
  ['confidential-access',2],['confidential-use',3],['dark-access',4],
  ['confidential-use',6],['dark-use',6],
 ]);
 assert.equal(events[0].agent,'ImpatientRecruiter');
 assert.equal(events[2].agent,'CalmRecruiter');
});

test('mentions, blocked attempts, failed reads and browsing do not become successful access',()=>{
 const wrappers = [
  {type:'decision',turn:1,agent:'A',decision:{summary:'Do not use personal email.'}},
  {...access,event:{...access.event,event_id:'blocked',executed:false,blocked:true}},
  {...access,event:{...access.event,event_id:'unknown',executed:undefined}},
  {...read,event:{...read.event,event_id:'search',tool:'search_dark_web',received_information_id:null,page:{page_type:'search_results'}}},
  {...read,event:{...read.event,event_id:'failed',success:false}},
  {...read,event:{...read.event,event_id:'blocked-read',blocked:true}},
  use('blocked-use',['dark:source'],{blocked:true}),
  use('failed-use',['dark:source'],{success:false}),
 ];
 assert.deepEqual(replayInformationEvents(wrappers.map(message)),[]);
});

test('counters rewind with history, deduplicate source events and require prior dark provenance',()=>{
 const history=[message(use('before',['dark:source'])),message(read),message(access),message(access),message(use('after',['dark:source']))];
 assert.deepEqual(replayInformationEvents(history.slice(0,1)).map(e=>e.kind),['confidential-use']);
 const events=replayInformationEvents(history);
 assert.equal(events.filter(e=>e.kind==='confidential-access').length,1);
 assert.deepEqual(events.filter(e=>e.kind==='dark-use').map(e=>e.step),[5]);
 assert.deepEqual(replayInformationEvents([]),[]);
});
