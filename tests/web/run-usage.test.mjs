import test from 'node:test';
import assert from 'node:assert/strict';
import {tokenUsage, savedRunUsage} from '../../web/public/run-usage.js';
import {estimateUsageCost} from '../../web/public/model-pricing.js';
import {recordedRunStats} from '../../web/run-summary.mjs';

test('restored usage uses saved totals and model independently of replay and current options', () => {
  const artifact = {metrics:{input_tokens:364380,output_tokens:13913,api_calls:51},decisions:[]};
  const usage = savedRunUsage({artifact,
    recorded:recordedRunStats(artifact,{backend:'openai',model:'gpt-5.4-mini'}),
    options:{backend:'mock',model:'gpt-4o-mini'},
  });
  assert.equal(usage.inputTokens,364380);
  assert.equal(usage.outputTokens,13913);
  assert.equal(usage.totalTokens,378293);
  assert.equal(usage.cachedInputTokens,null);
  assert.equal(usage.model,'gpt-5.4-mini');
  assert.equal(estimateUsageCost(usage.model,usage.inputTokens,usage.outputTokens,usage.cachedInputTokens),0.3358935);
});

test('legacy and interrupted logs recover totals from saved decisions including cached input', () => {
  const artifact = {partial:true,decisions:[
    {input_tokens:100,output_tokens:20,cached_input_tokens:50},
    {input_tokens:200,output_tokens:30,cached_input_tokens:100},
  ]};
  const recorded = recordedRunStats(artifact,{backend:'openai',model:'gpt-4o-mini'});
  const usage = savedRunUsage({artifact,recorded});
  assert.equal(recorded.totalTokens,350);
  assert.equal(usage.totalTokens,350);
  assert.equal(usage.cachedInputTokens,150);
  assert.equal(usage.apiCalls,2);
  assert.equal(usage.partial,true);
  assert.equal(savedRunUsage({artifact}).totalTokens,350);
  assert.equal(estimateUsageCost(usage.model,300,50,150),0.00006375);
});

test('unknown usage stays unknown while recorded Mock zeros are retained', () => {
  const missing = savedRunUsage({artifact:{decisions:[{input_tokens:100}]},options:{backend:'mock'}});
  assert.equal(missing.inputTokens,100);
  assert.equal(missing.outputTokens,null);
  assert.equal(missing.totalTokens,null);
  assert.equal(missing.cachedInputTokens,null);
  assert.equal(missing.model,null);
  assert.equal(tokenUsage({},[{input_tokens:100},{input_tokens:-1}]).inputTokens,null);
  const mock = savedRunUsage({recorded:{backend:'mock'},artifact:{metrics:{input_tokens:0,output_tokens:0,cached_input_tokens:0}}});
  assert.equal(mock.totalTokens,0);
  assert.equal(mock.cachedInputTokens,0);
  assert.equal(estimateUsageCost(mock.model,mock.inputTokens,mock.outputTokens,mock.cachedInputTokens),0);
});
