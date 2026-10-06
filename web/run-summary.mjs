import {tokenUsage} from './public/run-usage.js';

export function recordedRunStats(artifact, manifest) {
 const metrics=artifact.metrics || {};
 const number=value=>Number.isFinite(value)&&value>=0?value:null;
 const usage=tokenUsage(metrics,artifact.decisions);
 return {
  model:manifest?.backend==='mock'?'Mock (mock run)':manifest?.model || null,
  backend:manifest?.backend || null,
  provider:manifest?.provider || null,
  cachedInputTokens:usage.cachedInputTokens,inputTokens:usage.inputTokens,outputTokens:usage.outputTokens,totalTokens:usage.totalTokens,
  eventCount:Array.isArray(artifact.events)?artifact.events.length:null,
  decisionCount:Array.isArray(artifact.decisions)?artifact.decisions.length:null,
  apiCalls:number(metrics.api_calls) ?? (Array.isArray(artifact.decisions) ? usage.apiCalls : null),
 };
}
