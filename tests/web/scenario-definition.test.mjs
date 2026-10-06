import test from 'node:test';
import assert from 'node:assert/strict';
import {scenarioDefinition, metricValue} from '../../web/public/scenario-definition.js';
import {participant} from '../../web/public/participants.js';

test('scenario metric selectors preserve query, successful access/use, and blocked counts', () => {
  const context = {usage:{apiCalls:4,inputTokens:120,outputTokens:null},
    records:[{type:'observation',markers:[{kind:'p1'},{kind:'p1'}]},
      {type:'observation',markers:[{kind:'p2'}]},
      {type:'dark_tool',blocked:true},{type:'recruitment_tool',blocked:false},
      {type:'decision',blocked:true}], hits:[{level:1.5},{level:1.5},{level:2}]};
  assert.deepEqual(Object.fromEntries(scenarioDefinition.metrics.map(metric =>
    [metric.id, metricValue(metric.selector, context)])), {
    model_calls:4,input_tokens:120,output_tokens:null,p1_queries:1,p2_queries:1,
    dark_access:2,dark_use:1,blocked_tools:1,
  });
});
test('participant presentation reads scenario definitions and preserves unknown IDs', () => {
  assert.equal(participant('CrisisLead').icon, scenarioDefinition.participants.CrisisLead.icon);
  assert.equal(participant('EXPERT-E').expertise, scenarioDefinition.participants['EXPERT-E'].expertise);
  assert.equal(participant('NewAgent').label, 'NewAgent');
});
