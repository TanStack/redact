export function quantile(values, q) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * q
  const left = Math.floor(position)
  return sorted[left] + (sorted[Math.ceil(position)] - sorted[left]) * (position - left)
}

export function summarize(values) {
  return {
    n: values.length,
    median: quantile(values, 0.5),
    p95: quantile(values, 0.95),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  }
}

export function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

export function shuffle(values, rng) {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// The independent unit is a fresh browser block, not every inner sample.
// Pair the same round across renderers, then resample complete blocks.
export function compareBlocks(candidate, reference) {
  if (candidate.length !== reference.length || candidate.some((block, b) => block.length !== reference[b]?.length)) {
    throw new Error('Comparison needs matching blocks and rounds')
  }
  const logs = candidate.map((block, b) => block.map((ms, i) => {
    const ref = reference[b]?.[i]
    if (!(ms > 0 && ref > 0)) throw new Error('Comparison needs paired positive timings')
    return Math.log(ms / ref)
  }))
  if (!logs.length || logs.some(block => !block.length)) throw new Error('Empty comparison')
  const estimate = values => 100 * (Math.exp(quantile(values.flat(), 0.5)) - 1)
  let interval = null
  if (logs.length >= 3) {
    const rng = random(20260909)
    const resamples = Array.from({ length: 5000 }, () => estimate(
      Array.from({ length: logs.length }, () => logs[Math.floor(rng() * logs.length)]),
    ))
    interval = [quantile(resamples, 0.025), quantile(resamples, 0.975)]
  }
  return { pairedTimeChangePercent: estimate(logs), blockBootstrap95CI: interval, independentBlocks: logs.length }
}
