import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateRunCost, costLabel} from '../../web/public/model-pricing.js';
test('efficient ten-cycle run includes final synthesis and correct USD rates', () => {
 const r = estimateRunCost('gpt-4.1-mini', 'emergency_recruitment', {ROUNDS:10,EFFICIENT_INTERACTIONS:true});
 assert.equal(r.calls,65); assert.equal(r.low, .182); assert.equal(r.high, .286);
});
test('level two keeps enough calls for the later reviewer cue', () => {
 assert.equal(estimateRunCost('gpt-4.1-mini', 'emergency_recruitment', {ROUNDS:10,CRISIS_LEVEL:2}).calls,100);
});
test('caps rounds and handles single agents and disabled finalization', () => {
 assert.equal(estimateRunCost('gpt-6-luna','emergency_recruitment',{ROUNDS:20}).calls,100);
 assert.equal(estimateRunCost('gpt-6-luna','emergency_recruitment',{ROUNDS:10,FINALIZE:'false'}).calls,99);
 assert.equal(estimateRunCost('gpt-6-luna','emergency_recruitment',{ROUNDS:10,ARCHITECTURE:'single'}).calls,10);
});
test('unknown models are not free and mock is free', () => {
 assert.equal(estimateRunCost('custom','emergency_recruitment').low,null);
 assert.equal(costLabel(estimateRunCost('mock','emergency_recruitment')),'$0 · Mock run');
});

import {estimateUsageCost} from '../../web/public/model-pricing.js';
test('usage cost counts cached tokens as a subset of input, not extra input',()=>{
 assert.equal(estimateUsageCost('gpt-4.1-mini',10000,1000,2000), .005);
 assert.equal(estimateUsageCost('gpt-4.1-mini',10000,1000,null), .0056);
 assert.equal(estimateUsageCost('mock',null,null),0);
 assert.equal(estimateUsageCost('unknown',100,100),null);
 assert.equal(estimateUsageCost('gpt-4.1-mini',null,100),null);
});
