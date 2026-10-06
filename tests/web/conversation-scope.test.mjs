import test from 'node:test';
import assert from 'node:assert/strict';
import {messageScope,emailScope} from '../../web/public/conversation-scope.js';
import {replayMessages} from '../../web/public/conversation-replay.js';
test('recruiter discussion is labelled separately from legacy DMs',()=>{
 const messages=replayMessages({type:'decision',phase:'pair',agent:'ImpatientRecruiter',turn:5,decision:{messages:[{recipients:['CalmRecruiter'],content:'Discuss information for the email.'}]}});
 assert.equal(messages[0].scope.id,'pair');
 assert.equal(messages[0].scope.label,'Recruiter discussion');
});
test('actual recipients determine discussion versus DM even in a DM phase',()=>{
 const messages=replayMessages({type:'decision',phase:'dm',decision:{messages:[{recipients:['all'],content:'team'},{recipients:['SecurityExpert'],content:'private'}]}});
 assert.deepEqual(messages.map(m=>m.scope.id),['discussion','dm']);
 assert.equal(messageScope({}).id,'unknown');
});
test('only recorded email delivery permits a user reply scope',()=>{
 assert.equal(emailScope({blocked:true},true).id,'tool');
 assert.match(emailScope({blocked:true}).label,/blocked/);
 assert.match(emailScope({}).label,/not delivered/);
 assert.equal(emailScope({data:{email:{response:'Approved'}}},true).id,'email-reply');
});
