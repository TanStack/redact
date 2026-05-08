// Multi-workload bench: runs the canonical RowList bench plus a few other
// patterns (keyed reorder, mount/unmount, deep tree, state churn) to make
// sure perf changes targeted at one workload don't regress others.
//
// Local-only — runs the in-tree bench app (built + previewed). Real Chrome.
import { chromium } from 'playwright'

const URL = process.env.URL ?? 'http://localhost:4173/'
const SAMPLES = Number(process.env.SAMPLES ?? 10)

const WORKLOADS = [
  { name: 'canonical (480 rows × 100 ticks)', fn: '__runReactRenderBenchmark', args: { iterations: 100, rows: 480 } },
  { name: 'keyed reorder (240 × 100)',       fn: '__benchKeyedReorder',         args: { iterations: 100, rows: 240 } },
  { name: 'mount/unmount (200 × 100)',       fn: '__benchMountUnmount',         args: { iterations: 100, rows: 200 } },
  { name: 'deep tree (depth 60 × 100)',      fn: '__benchDeepTree',             args: { iterations: 100, depth: 60 } },
  { name: 'state churn (240 × 100)',         fn: '__benchStateChurn',           args: { iterations: 100, rows: 240 } },
]

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(`typeof window.${WORKLOADS[0].fn} === "function"`, { timeout: 30_000 })

console.log(`url=${URL}  samples=${SAMPLES}\n`)
console.log('workload'.padEnd(40), 'min'.padStart(7), 'median'.padStart(7), 'mean'.padStart(7))
console.log('-'.repeat(40 + 1 + 7 + 1 + 7 + 1 + 7))

for (const w of WORKLOADS) {
  // Warmup
  await page.evaluate(({ fn, args }) => window[fn]({ ...args, iterations: 20 }), { fn: w.fn, args: w.args })
  const samples = []
  for (let i = 0; i < SAMPLES; i += 1) {
    const r = await page.evaluate(
      ({ fn, args }) => window[fn](args),
      { fn: w.fn, args: w.args },
    )
    samples.push(r.totalMs)
  }
  samples.sort((a, b) => a - b)
  const min = samples[0]
  const median = samples[Math.floor(samples.length / 2)]
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  console.log(
    w.name.padEnd(40),
    `${min.toFixed(2)}`.padStart(7),
    `${median.toFixed(2)}`.padStart(7),
    `${mean.toFixed(2)}`.padStart(7),
  )
}

await browser.close()
