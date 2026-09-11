// Exploratory microbenchmark, not a substitute for the complete SSR comparison.
// ESCAPE_BASELINE=/path/to/baseline/src/server/escape.ts node scripts/bench-escape.mjs
import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'

if (!process.env.ESCAPE_BASELINE) throw new Error('Set ESCAPE_BASELINE to the previous server/escape.ts')
const modules = {}
const metadata = {}
for (const [name, path] of Object.entries({
  baseline: process.env.ESCAPE_BASELINE,
  current: 'packages/redact/src/server/escape.ts',
})) {
  const result = await build({
    entryPoints: [resolve(path)], bundle: true, minify: true, write: false,
    format: 'esm', platform: 'node', target: 'node22',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const bytes = result.outputFiles[0].contents
  modules[name] = await import('data:text/javascript;base64,' + Buffer.from(bytes).toString('base64'))
  metadata[name] = {
    sourceSHA256: createHash('sha256').update(readFileSync(path)).digest('hex'),
    bundleSHA256: createHash('sha256').update(bytes).digest('hex'),
    standaloneBytes: bytes.length, standaloneGzipBytes: gzipSync(bytes).length,
  }
}
const cases = {
  'clean-short': Array.from({ length: 300 }, (_, id) => `row ${id} value ${id % 4}`),
  'escaped-short': Array.from({ length: 300 }, (_, id) => `row ${id} & <tag> "double" 'single' \u00a0 ${id % 4}`),
  dense: Array.from({ length: 300 }, (_, id) => '&<>"'.repeat(id % 10 + 1)),
  'clean-long': Array.from({ length: 300 }, (_, id) => 'hello世界🌎'.repeat(100) + id),
  'sparse-long': Array.from({ length: 300 }, (_, id) => 'hello世界🌎'.repeat(50) + '&' + id + 'x'.repeat(400)),
}
let sink = 0
function run(fn, values, iterations) {
  const start = performance.now()
  for (let tick = 0; tick < iterations; tick++) for (const value of values) {
    const output = fn(value)
    sink += output.length + output.charCodeAt(output.length >> 1)
  }
  return performance.now() - start
}
const results = {}
for (const [name, values] of Object.entries(cases)) for (const method of ['escapeAttr', 'escapeText']) {
  for (const value of values) if (modules.baseline[method](value) !== modules.current[method](value)) {
    throw new Error(`${method} output differs for ${name}`)
  }
  for (const module of Object.values(modules)) run(module[method], values, 100)
  const fastest = Math.min(...Object.values(modules).map(module => run(module[method], values, 400)))
  const iterations = Math.max(400, Math.ceil(400 * 50 / fastest))
  const samples = { baseline: [], current: [] }
  for (let round = 0; round < 9; round++) for (const variant of round % 2 ? ['current', 'baseline'] : ['baseline', 'current']) {
    samples[variant].push(run(modules[variant][method], values, iterations))
  }
  const median = values => [...values].sort((a, b) => a - b)[4]
  results[`${name}/${method}`] = {
    iterations,
    samplesMs: samples,
    baselineMedianMs: median(samples.baseline), currentMedianMs: median(samples.current),
    currentTimeChangePercent: (median(samples.current) / median(samples.baseline) - 1) * 100,
  }
}
const output = JSON.stringify({
  node: process.version,
  method: 'Production-minified functions in one process, 100 warmup batches and 9 alternating timed rounds with equal calibrated iteration counts targeting 50ms, 300 strings per batch. Output length and a middle code unit are consumed. Times include output flattening. No confidence intervals, isolated function results only.',
  metadata, results, sink,
}, null, 2) + '\n'
if (process.env.OUTPUT) writeFileSync(process.env.OUTPUT, output)
console.log(output)
