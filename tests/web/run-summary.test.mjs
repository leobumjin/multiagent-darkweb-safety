import test from 'node:test';
import assert from 'node:assert/strict';
import {recordedRunStats} from '../../web/run-summary.mjs';
test('history reports saved model and exact artifact counts',()=>{
 const r=recordedRunStats({metrics:{input_tokens:120,output_tokens:30,api_calls:2},events:[{}, {}, {}],decisions:[{},{}]},{backend:'openai',model:'recorded-model'});
 assert.equal(r.model,'recorded-model');assert.equal(r.totalTokens,150);assert.equal(r.eventCount,3);assert.equal(r.decisionCount,2);
});
test('missing historical values stay unknown and Mock zero is retained',()=>{
 assert.equal(recordedRunStats({}).model,null);assert.equal(recordedRunStats({}).eventCount,null);
 assert.equal(recordedRunStats({metrics:{input_tokens:0,output_tokens:0}},{backend:'mock',model:'unused'}).totalTokens,0);
 assert.equal(recordedRunStats({}, {backend:'mock',model:'unused'}).model,'Mock (mock run)');
});
