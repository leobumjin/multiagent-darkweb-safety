// Standard USD / 1M tokens, checked 2026-10-02 against official model pages.
export const MODEL_PRICES = {
  'gpt-6-luna': [.10, .50],
  'gpt-6.1-sol': [2, 10],
  'gpt-6-astra': [10, 50],
  'gpt-5.4-mini': [.75, 4.50],
  'gpt-5-mini': [.25, 2],
  'gpt-4.1': [2, 8],
  'gpt-4.1-mini': [.40, 1.60],
  'gpt-4o-mini': [.15, .60],
};
export function estimateRunCost(model, scenario, environment = {}) {
  const multi = (environment.ARCHITECTURE || 'multi') === 'multi';
  const emergency = scenario === 'emergency_recruitment';
  const rounds = Math.min(emergency ? 10 : 20, Math.max(1, Number(environment.ROUNDS) || 1));
  const turns = Math.min(99, emergency && multi ? (environment.EFFICIENT_INTERACTIONS === true && ![2, 3].includes(Number(environment.CRISIS_LEVEL)) ? 4 + rounds * 6 : rounds * 10) : rounds * (multi ? 5 : 1));
  const finalize = environment.FINALIZE == null || environment.FINALIZE === ''
    ? true : /^(1|true|yes|on)$/i.test(String(environment.FINALIZE));
  const calls = turns + Number(multi && finalize);
  if (['mock', 'demo'].includes(model)) return {calls: 0, low: 0, high: 0};
  const rates = MODEL_PRICES[model];
  if (!rates) return {calls, low: null, high: null};
  return {calls, low: calls * (5000 * rates[0] + 500 * rates[1]) / 1e6,
    high: calls * (5000 * rates[0] + 1500 * rates[1]) / 1e6};
}
export function costLabel(estimate) {
  return estimate.low == null ? 'Cost estimate unavailable' : estimate.high === 0 ? '$0 · Mock run'
    : `Approximately $${estimate.low.toFixed(3)}–$${estimate.high.toFixed(3)} / Experiment`;
}

const CACHED_INPUT_PRICES = {
  'gpt-6-luna': .01, 'gpt-6.1-sol': .10, 'gpt-6-astra': 1,
  'gpt-5.4-mini': .075, 'gpt-5-mini': .025,
  'gpt-4.1': .50, 'gpt-4.1-mini': .10, 'gpt-4o-mini': .075,
};
export function estimateUsageCost(model, input, output, cached = null) {
  if (['mock', 'demo'].includes(model)) return 0;
  const rates = MODEL_PRICES[model];
  if (!rates || !Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return null;
  const hit = Number.isFinite(cached) ? Math.max(0, Math.min(input, cached)) : 0;
  return ((input - hit) * rates[0] + hit * CACHED_INPUT_PRICES[model] + output * rates[1]) / 1e6;
}
