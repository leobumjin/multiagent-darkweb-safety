import test from 'node:test';
import assert from 'node:assert/strict';
import {activeConnections} from '../../web/public/replay-network.js';
test('discussion fans out, DM highlights only its recipient',()=>{
 assert.equal(activeConnections({sender:'CrisisLead',to:'all',scope:{id:'discussion'}}).length,3);
 assert.deepEqual(activeConnections({sender:'CrisisLead',to:'SecurityExpert',scope:{id:'dm'}}),[{from:'CrisisLead',to:'SecurityExpert',scope:'dm'}]);
});
test('email reply reverses direction and blocked sending never activates a delivery edge',()=>{
 assert.deepEqual(activeConnections({sender:'EXPERT-A',to:'CalmRecruiter',scope:{id:'email-reply'}}),[{from:'EXPERT-A',to:'CalmRecruiter',scope:'email-reply'}]);
 assert.deepEqual(activeConnections({sender:'CalmRecruiter',to:'EXPERT-A',scope:{id:'email-send',label:'Email to candidate · blocked'}}),[]);
 assert.deepEqual(activeConnections(null),[]);
});

test('audit counts refusals and retains them after approval, and resets with replay',async()=>{
 const {replayAudit}=await import('../../web/public/replay-network.js');
 const history=[{userOutcome:{candidate:'EXPERT-C',status:'refused'}},{userOutcome:{candidate:'EXPERT-C',status:'refused'}},{userOutcome:{candidate:'EXPERT-C',status:'approved'}},{audit:{agent:'A',category:'P2',status:'Blocked',turn:3}}];
 assert.deepEqual(replayAudit(history).users['EXPERT-C'],{status:'approved',refusals:2});
 assert.equal(replayAudit(history).alerts[0].status,'Blocked');
 assert.deepEqual(replayAudit([]),{users:{},alerts:[]});
});

test('curve terminals meet flat node edges with perpendicular tangents',async()=>{
 const {connectionPath}=await import('../../web/public/replay-network.js');
 const size={width:250,height:108};
 const edge=connectionPath({x:225,y:80},{x:575,y:275},size,size);
 assert.equal(edge.start.y,139);assert.equal(edge.end.y,214);
 assert.ok(edge.start.x<225+125-9);assert.ok(edge.end.x>575-125+9);
 assert.match(edge.d,new RegExp(`C${edge.start.x},`));
 const reverse=connectionPath({x:575,y:275},{x:225,y:80},size,size);
 assert.equal(reverse.start.y,216);assert.equal(reverse.end.y,141);
 const horizontal=connectionPath({x:225,y:80},{x:575,y:80},size,size);
 assert.equal(horizontal.start.y,80);assert.equal(horizontal.end.y,80);assert.match(horizontal.d,/ L/);
});

test('delivered English emails activate a connection using the real replay scope', async()=>{
 const {emailScope}=await import('../../web/public/conversation-scope.js');
 const scope=emailScope({data:{email:{candidate_id:'EXPERT-A',status:'approved'}}});
 assert.deepEqual(activeConnections({sender:'CalmRecruiter',to:'EXPERT-A',scope}),
  [{from:'CalmRecruiter',to:'EXPERT-A',scope:'email-send'}]);
});
