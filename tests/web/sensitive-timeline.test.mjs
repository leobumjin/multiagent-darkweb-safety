import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimeline, timelineRecord, withTokenPositions } from '../../web/public/sensitive-timeline.js';
test('only actual observable fields count, including repeated mentions', () => {
 const r=timelineRecord({type:'decision',turn:1,agent:'A',decision:{summary:'personal email, personal email',messages:[{content:'treatment facility query forbidden'}]},memory:{secret:'home address'}});
 assert.equal(r.hits.length,3);assert.equal(r.hits[0].field,'summary');
});
test('blocked response text is counted as mentions but hidden payload is excluded',()=>{
 const r=timelineRecord({type:'recruitment_tool',event:{event_id:'e1',blocked:true,call:{message:'personal phone request'},response:'Blocked',data:{record:'home address'}}});
 assert.equal(r.hits.length,1);assert.equal(r.blocked,true);
});
test('replayed SSE events deduplicate and reset clears records',()=>{
 const t=createTimeline(), e={type:'observation',event:{event_id:'e2',turn:2,description:'personal email'}};
 assert.equal(t.add(e),true);assert.equal(t.add({...e,id:33}),false);assert.equal(t.snapshot().length,1);
 t.reset();assert.deepEqual(t.snapshot(),[]);
});
test('live and saved wrappers produce same ordered records',()=>{
 const events=[{type:'decision',phase:'dm',turn:1,agent:'A',decision:{summary:'family relationships'}},{type:'observation',event:{event_id:'e1',turn:1,agent:'A',description:'treatment facility'}}];
 const live=createTimeline(),saved=createTimeline();events.forEach(e=>live.add({...e,timestamp:'today'}));events.toReversed().forEach(e=>saved.add(e));
 assert.deepEqual(live.snapshot(),saved.snapshot());
 assert.equal(timelineRecord({type:'run_end',scenario:{secret:'home address'}}),null);
});

test('token positions use cumulative API usage and tools share the call boundary', () => {
 const t=createTimeline();
 t.add({type:'decision',turn:1,agent:'A',input_tokens:100,output_tokens:20,decision:{}});
 t.add({type:'observation',event:{event_id:'obs',turn:1,agent:'A',description:'personal email'}});
 t.add({type:'decision',turn:2,agent:'B',input_tokens:200,output_tokens:30,decision:{}});
 assert.deepEqual(t.snapshot().map(r=>r.tokens),[120,120,350]);
});
test('missing usage stays unknown instead of inventing token positions', () => {
 const t=createTimeline();
 t.add({type:'decision',turn:1,agent:'A',decision:{}});
 t.add({type:'decision',turn:2,agent:'B',input_tokens:200,output_tokens:30,decision:{}});
 assert.deepEqual(withTokenPositions(t.snapshot()).map(r=>r.tokens),[null,null]);
 assert.ok(t.snapshot().every(r=>r.tokenBasis === "estimated-log"));
});

test('legacy logs render nonzero estimated positions without inventing API usage', () => {
 const t=createTimeline();
 t.add({type:'decision',turn:1,agent:'A',decision:{summary:'personal email'}});
 t.add({type:'observation',event:{event_id:'o1',turn:1,agent:'A',description:'treatment facility'}});
 const rows=t.snapshot();
 assert.ok(rows[0].tokens > 0);
 assert.ok(rows[1].tokens > rows[0].tokens);
 assert.ok(rows.every(r=>r.tokenBasis === 'estimated-log'));
 assert.equal(rows.flatMap(r=>r.hits).length,2);
});

test('English and Korean mentions remain visible without claiming actual access',()=>{
 for (const summary of ['Personal email', '\uac1c\uc778 \uc774\uba54\uc77c']) {
  const record=timelineRecord({type:'decision',turn:1,agent:'A',decision:{summary}});
  assert.ok(record.hits.some(hit=>hit.level === 'P2'));
  assert.equal(record.accessLevel,null);
  assert.equal(record.confidentialUse,false);
 }
});
