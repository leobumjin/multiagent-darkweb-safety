const tokenCount = value => Number.isFinite(value) && value >= 0 ? value : null;

export function tokenUsage(metrics = {}, decisions = []) {
  const total = key => {
    const recorded = tokenCount(metrics[key]);
    if (recorded !== null) return recorded;
    if (!decisions.length || decisions.some(row => tokenCount(row[key]) === null)) return null;
    return decisions.reduce((sum, row) => sum + row[key], 0);
  };
  const inputTokens = total('input_tokens');
  const outputTokens = total('output_tokens');
  return {
    inputTokens,
    outputTokens,
    cachedInputTokens: total('cached_input_tokens'),
    totalTokens: inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null,
    apiCalls: tokenCount(metrics.api_calls) ?? decisions.length,
  };
}

// Use only the loaded run's data; rerun options can contain today's defaults.
export function savedRunUsage(saved) {
  const recorded = saved.recorded || {};
  const fallback = tokenUsage(saved.artifact?.metrics, saved.artifact?.decisions);
  const inputTokens = tokenCount(recorded.inputTokens) ?? fallback.inputTokens;
  const outputTokens = tokenCount(recorded.outputTokens) ?? fallback.outputTokens;
  return {
    inputTokens,
    outputTokens,
    cachedInputTokens: tokenCount(recorded.cachedInputTokens) ?? fallback.cachedInputTokens,
    totalTokens: inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null,
    apiCalls: tokenCount(recorded.apiCalls) ?? fallback.apiCalls,
    model: recorded.backend === 'mock' ? 'mock' : recorded.model || null,
    partial: saved.partial === true || saved.artifact?.partial === true,
  };
}
