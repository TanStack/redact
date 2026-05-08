// Render-perf bench driver. Runs in real Chrome via playwright — DO NOT add
// a jsdom variant. jsdom DOM ops are 10–100× slower than a real browser, so
// the cost ranking under jsdom (and any conclusion drawn from it) doesn't
// match what users actually feel. Always validate perf changes here.
//
// Drives whatever URL exposes `window.__runReactRenderBenchmark`. Defaults to
// Steve Faulkner's deployed bench, but typically you'll point it at a local
// build of `examples/perf-bench`:
//
//   pnpm --filter perf-bench build && pnpm --filter perf-bench preview &
//   REDACT_URL=http://localhost:4173/ node scripts/browser-bench.mjs
//
// Optional: capture CPU profiles for hotspot analysis (then feed them into
// scripts/analyze-profile.mjs / compare-profiles.mjs):
//
//   PROFILE_REDACT=/tmp/redact.cpuprofile \
//   PROFILE_REACT=/tmp/react.cpuprofile \
//   node scripts/browser-bench.mjs

import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const REDACT_URL = process.env.REDACT_URL ?? 'https://cf-react-redact-260508.southpolesteve.workers.dev/'
const REACT_URL = process.env.REACT_URL ?? 'https://cf-react-regular-260508.southpolesteve.workers.dev/'

const ITER = Number(process.env.ITER ?? 100)
const ROWS = Number(process.env.ROWS ?? 480)
const SAMPLES = Number(process.env.SAMPLES ?? 5)

async function runOnBench({ url, label, profilePath }) {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'load' })

  // Wait for the bench harness to mount.
  await page.waitForFunction('typeof window.__runReactRenderBenchmark === "function"', { timeout: 30_000 })

  // Warmup
  await page.evaluate(
    ({ iter, rows }) => window.__runReactRenderBenchmark({ iterations: iter, rows }),
    { iter: 20, rows: 100 },
  )

  // Capture profile across the timed samples
  const session = profilePath ? await context.newCDPSession(page) : null
  if (session) {
    await session.send('Profiler.enable')
    await session.send('Profiler.setSamplingInterval', { interval: 100 })
    await session.send('Profiler.start')
  }

  const samples = []
  for (let i = 0; i < SAMPLES; i += 1) {
    // Force GC between samples for stability (chromium-with---js-flags=--expose-gc
    // would expose `gc()`; CDP exposes Heap.collectGarbage instead).
    if (session) {
      await session.send('HeapProfiler.collectGarbage')
    }
    const r = await page.evaluate(
      ({ iter, rows }) => window.__runReactRenderBenchmark({ iterations: iter, rows }),
      { iter: ITER, rows: ROWS },
    )
    samples.push(r.totalMs)
    process.stdout.write(`  ${label} sample ${i + 1}: ${r.totalMs.toFixed(2)}ms (${r.nodes} nodes)\n`)
  }

  if (session) {
    const { profile } = await session.send('Profiler.stop')
    writeFileSync(profilePath, JSON.stringify(profile))
    console.log(`  ${label} CPU profile → ${profilePath}`)
    await session.detach()
  }

  await browser.close()

  samples.sort((a, b) => a - b)
  return {
    label,
    min: samples[0],
    median: samples[Math.floor(samples.length / 2)],
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
    samples,
  }
}

console.log(`Running ${SAMPLES} samples × ${ITER} ticks × ${ROWS} rows on each bench...\n`)

console.log(`REDACT (${REDACT_URL})`)
const redact = await runOnBench({
  url: REDACT_URL,
  label: 'redact',
  profilePath: process.env.PROFILE_REDACT,
})

console.log(`\nREACT (${REACT_URL})`)
const react = await runOnBench({
  url: REACT_URL,
  label: 'react',
  profilePath: process.env.PROFILE_REACT,
})

console.log('\n=== RESULTS (ms, lower is better) ===')
console.log(`redact  min=${redact.min.toFixed(2)}  median=${redact.median.toFixed(2)}  mean=${redact.mean.toFixed(2)}`)
console.log(`react   min=${react.min.toFixed(2)}  median=${react.median.toFixed(2)}  mean=${react.mean.toFixed(2)}`)
const ratio = redact.min / react.min
console.log(`redact/react min ratio: ${ratio.toFixed(2)}× (${ratio > 1 ? 'redact slower' : 'redact faster'})`)
