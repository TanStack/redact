// npm ci --prefix benchmarks/reference --ignore-scripts
// node scripts/compare-runtime.mjs
// BLOCKS=5 ROUNDS=5 CPU_RATE=4 OUTPUT=/tmp/cpu4.json node scripts/compare-runtime.mjs
// EXTRA_SOURCE=/path/to/pre-performance/src adds a fourth Redact baseline.
import { build, version as esbuildVersion } from 'esbuild'
import { chromium } from 'playwright'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cpus, release, platform, arch } from 'node:os'
import { createHash } from 'node:crypto'
import { gzipSync, brotliCompressSync } from 'node:zlib'
import { quantile, summarize, compareBlocks, random, shuffle } from '../benchmarks/stats.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const reference = createRequire(resolve(root, 'benchmarks/reference/package.json'))
const fixture = resolve(root, 'benchmarks/runtime-workloads.ts')
const positive = (key, fallback) => {
  const n = Number(process.env[key] || fallback)
  if (!(n >= 1 && Number.isFinite(n))) throw new Error(`${key} must be positive`)
  return n
}
const blocks = positive('BLOCKS', 5)
const rounds = positive('ROUNDS', 5)
const targetMs = positive('TARGET_MS', 80)
const cpuRate = positive('CPU_RATE', 1)
const interactionRounds = positive('INTERACTIONS', 12)
for (const [name, value] of Object.entries({ BLOCKS: blocks, ROUNDS: rounds, INTERACTIONS: interactionRounds })) {
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`)
}
const output = resolve(process.env.OUTPUT || `benchmarks/results/react-comparison-cpu${cpuRate}.json`)
const phases = (process.env.PHASES || 'throughput,interaction,memory').split(',')
if (phases.some(phase => !['throughput', 'interaction', 'memory'].includes(phase))) throw new Error('Unknown PHASES entry')
const interactionRows = (process.env.INTERACTION_ROWS || '240,2400').split(',').map(Number)
if (interactionRows.some(n => !Number.isInteger(n) || n < 1 || n > 20000)) throw new Error('Invalid INTERACTION_ROWS')
const hash = data => createHash('sha256').update(data).digest('hex')
const pkgPath = id => resolve(root, 'benchmarks/reference/node_modules', id, 'package.json')
const pkg = id => JSON.parse(readFileSync(pkgPath(id), 'utf8'))
const pinned = JSON.parse(readFileSync(resolve(root, 'benchmarks/reference/package.json'))).dependencies
for (const id of ['react', 'react-dom', '@tanstack/redact']) {
  if (pkg(id).version !== pinned[id]) throw new Error(`${id} does not match the locked reference`)
}
const publishedSource = resolve(dirname(pkgPath('@tanstack/redact')), 'src')
const extraName = process.env.EXTRA_NAME || 'pre-performance'
if (['react', 'react-control', 'published', 'current'].includes(extraName)) throw new Error('Reserved EXTRA_NAME')
const availableVariants = [
  { name: 'react', version: pkg('react').version, kind: 'react' },
  ...(process.env.REACT_CONTROL === '1' ? [{ name: 'react-control', version: pkg('react').version, kind: 'react' }] : []),
  { name: 'published', version: pkg('@tanstack/redact').version, source: publishedSource },
  ...(process.env.EXTRA_SOURCE ? [{ name: extraName, source: resolve(process.env.EXTRA_SOURCE) }] : []),
  { name: 'current', version: process.env.CURRENT_SOURCE ? undefined : JSON.parse(readFileSync(resolve(root, 'packages/redact/package.json'))).version, source: resolve(process.env.CURRENT_SOURCE || resolve(root, 'packages/redact/src')) },
]
// Named frozen sources let independent hypotheses share the same rotated run.
if (process.env.CANDIDATE_SOURCES) {
  const candidates = JSON.parse(process.env.CANDIDATE_SOURCES)
  if (!candidates || typeof candidates !== 'object' || Array.isArray(candidates)) throw new Error('CANDIDATE_SOURCES must be a name-to-source object')
  for (const [name, source] of Object.entries(candidates)) {
    if (!/^[a-z][a-z0-9-]*$/.test(name) || availableVariants.some(v => v.name === name) || typeof source !== 'string' || !source.trim()) throw new Error(`Invalid candidate: ${name}`)
    availableVariants.push({ name, source: resolve(source) })
  }
}
const selectedVariants = process.env.VARIANTS?.split(',')
if (selectedVariants?.some(name => !availableVariants.some(v => v.name === name))) throw new Error('Unknown VARIANTS entry')
const variants = availableVariants.filter(v => !selectedVariants || selectedVariants.includes(v.name))
if (!variants.some(v => v.name === 'react') || !variants.some(v => v.name === 'current')) throw new Error('VARIANTS must include react and current')
const browserErrors = []
const result = {
  schema: 1,
  environment: {
    date: new Date().toISOString(), node: process.version, esbuild: esbuildVersion,
    os: `${platform()} ${release()}`, architecture: arch(), cpu: cpus()[0]?.model, cpuRate, headless: process.env.HEADED !== '1',
    blocks, rounds, interactionRounds, interactionRows, targetMs, seed: 20260909,
    fixtureSHA256: hash(readFileSync(fixture)),
    runnerSHA256: hash(readFileSync(fileURLToPath(import.meta.url))),
    statsSHA256: hash(readFileSync(resolve(root, 'benchmarks/stats.mjs'))),
    referenceLockSHA256: hash(readFileSync(resolve(root, 'benchmarks/reference/package-lock.json'))),
  },
  method: {
    timing: 'Production bundles, identical fixture and iteration counts, completed work checked after timing. GC remains enabled naturally in timing samples.',
    order: 'Fresh browser per block. Seeded permutation with rotating renderer order each round.',
    intervals: '95% percentile bootstrap of paired log-time ratios, resampling entire fresh-browser blocks. Not a guarantee of cross-device or whole-app performance.',
    interaction: 'Trusted Playwright clicks with normal scheduling. Handler-to-commit and next-rAF are not paint. Event Timing duration is quantized and entries below the browser threshold can be absent. This is not field INP.',
    memory: 'Separate mount/unmount-only forced-GC retained JS heap and DOM counters, not allocation rate or process RSS. No Playwright click injection in these pages.',
    units: 'Throughput summaries are milliseconds per iteration/batch, including p95 of batch averages, not individual-update tail latency. observedTaskDurationMs includes Playwright instrumentation and is diagnostic only.',
    multiplicity: 'Intervals are exploratory, not adjusted for testing multiple workloads. Assess repeatability and identical-React control noise, not only whether an interval crosses zero.',
  },
  variants: [], calibration: {}, throughput: {}, interactions: {}, memory: {}, complete: false,
}
const bundles = new Map()
for (const variant of variants) {
  const paths = variant.kind === 'react' ? {
    react: reference.resolve('react'),
    'react/jsx-runtime': reference.resolve('react/jsx-runtime'),
    'react-dom': reference.resolve('react-dom'),
    'react-dom/client': reference.resolve('react-dom/client'),
    'react-dom/server': reference.resolve('react-dom/server.browser'),
  } : Object.fromEntries(Object.entries({
    react: 'react/index.ts', 'react/jsx-runtime': 'react/jsx-runtime.ts',
    'react-dom': 'dom/index.ts', 'react-dom/client': 'dom/client.ts', 'react-dom/server': 'server/index.ts',
  }).map(([name, path]) => [name, resolve(variant.source, path)]))
  const built = await build({
    entryPoints: [fixture], bundle: true, write: false, minify: true, metafile: true,
    platform: 'browser', format: 'iife', target: 'es2022',
    tsconfigRaw: { compilerOptions: {} },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'renderer', setup(b) {
      b.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, args => {
        if (paths[args.path]) return { path: paths[args.path] }
        throw new Error(`Unmapped renderer import: ${args.path}`)
      })
    } }],
  })
  if (built.warnings.some(warning => warning.id === 'ignored-bare-import')) {
    throw new Error(`Invalid ${variant.name} build: a side-effect import was removed. Check that the frozen source uses the package's original directory layout.`)
  }
  const bytes = built.outputFiles[0].contents
  bundles.set(variant.name, built.outputFiles[0].text)
  const inputs = Object.keys(built.metafile.inputs).sort().map(path => ({ path, sha256: hash(readFileSync(resolve(root, path))) }))
  result.variants.push({ ...variant, bundleSHA256: hash(bytes), inputSHA256: hash(JSON.stringify(inputs)), inputs,
    fixtureBundle: { raw: bytes.length, gzip: gzipSync(bytes).length, brotli: brotliCompressSync(bytes).length } })
}
const save = () => { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(result, null, 2) + '\n') }
const rng = random(20260909)
const orderFor = (base, round) => [...base.slice(round % base.length), ...base.slice(0, round % base.length)]

async function newPage(browser, variant) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
  page.setDefaultTimeout(30000)
  page.on('pageerror', error => browserErrors.push({ variant: variant.name, error: error.message }))
  await page.setContent('<!doctype html><html><head></head><body></body></html>')
  await page.addScriptTag({ content: bundles.get(variant.name) })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
  return { page, cdp }
}
async function run(page, name, iterations) {
  const sample = await page.evaluate(({ name, iterations }) => window.__runtimeBench.run(name, iterations), { name, iterations })
  if (!(sample.durationMs > 0 && sample.operations > 0 && sample.checks > 0) || sample.iterations !== iterations) throw new Error(`Invalid completed-work timing for ${name}`)
  return sample
}
async function heap(cdp) {
  await cdp.send('HeapProfiler.collectGarbage')
  const usage = await cdp.send('Runtime.getHeapUsage')
  const dom = await cdp.send('Memory.getDOMCounters')
  return { usedSize: usage.usedSize, embedderHeapUsedSize: usage.embedderHeapUsedSize ?? null, ...dom }
}

let workloadList
for (let block = 0; block < blocks; block++) {
  const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome', headless: process.env.HEADED !== '1' })
  result.environment.browser = browser.version()
  try {
    const pages = new Map()
    for (const variant of shuffle(variants, rng)) pages.set(variant.name, await newPage(browser, variant))
    const list = await pages.get('react').page.evaluate(() => window.__runtimeBench.list)
    const requestedWorkloads = process.env.WORKLOADS?.split(',')
    if (requestedWorkloads?.some(name => !list.some(work => work.name === name))) throw new Error('Unknown WORKLOADS entry')
    workloadList = list.filter(w => requestedWorkloads ? requestedWorkloads.includes(w.name) : !w.optIn)
    if (!workloadList.length && phases.includes('throughput')) throw new Error('No workloads matched')
    for (const variant of variants) {
      const other = await pages.get(variant.name).page.evaluate(() => window.__runtimeBench.list)
      if (JSON.stringify(other) !== JSON.stringify(list)) throw new Error('Renderer workload lists differ')
    }
    if (phases.includes('throughput')) for (const work of shuffle(workloadList, rng)) {
      const baseOrder = shuffle(variants, rng)
      if (!result.calibration[work.name]) {
        const samples = {}
        for (const variant of baseOrder) {
          const { page } = pages.get(variant.name)
          await page.bringToFront()
          await run(page, work.name, work.defaultIterations)
          samples[variant.name] = (await run(page, work.name, work.defaultIterations)).durationMs
        }
        const fastest = Math.min(...Object.values(samples)) / work.defaultIterations
        const slowest = Math.max(...Object.values(samples)) / work.defaultIterations
        const iterations = Math.max(1, Math.min(100000, Math.ceil(targetMs / fastest), Math.floor(1500 / slowest)))
        result.calibration[work.name] = { ...work, iterations, durationsMs: samples }
      }
      const { iterations } = result.calibration[work.name]
      const data = result.throughput[work.name] ||= { mode: work.mode, iterations, samples: Object.fromEntries(variants.map(v => [v.name, []])) }
      for (const variant of baseOrder) {
        const { page } = pages.get(variant.name)
        await page.bringToFront()
        for (let warm = 0; warm < 3; warm++) await run(page, work.name, iterations)
        data.samples[variant.name][block] = []
      }
      for (let round = 0; round < rounds; round++) for (const variant of orderFor(baseOrder, round)) {
        const { page } = pages.get(variant.name)
        await page.bringToFront()
        const sample = await run(page, work.name, iterations)
        data.expectedOperations ??= sample.operations
        if (sample.operations !== data.expectedOperations) throw new Error(`Work differs across renderers: ${work.name}`)
        data.samples[variant.name][block].push(sample)
      }
      console.log(`block ${block + 1}/${blocks}: ${work.name}`, Object.fromEntries(variants.map(v => [v.name, quantile(data.samples[v.name][block].map(s => s.durationMs), 0.5).toFixed(2)])))
      save()
    }
    if (phases.includes('interaction')) for (const rows of interactionRows) {
      const name = `click-${rows}`
      const data = result.interactions[name] ||= Object.fromEntries(variants.map(v => [v.name, []]))
      const baseOrder = shuffle(variants, rng)
      for (const variant of variants) data[variant.name][block] = []
      for (let round = -2; round < interactionRounds; round++) for (const variant of orderFor(baseOrder, round + 2)) {
        const { page, cdp } = pages.get(variant.name)
        await page.bringToFront()
        await page.evaluate(async rows => {
          await window.__runtimeBench.prepareInteraction({ rows })
          window.__observedEvents = []
          window.__observedLongTasks = []
          window.__observers?.forEach(o => o.disconnect())
          window.__observers = []
          for (const [type, key] of [['event', '__observedEvents'], ['longtask', '__observedLongTasks']]) {
            if (PerformanceObserver.supportedEntryTypes.includes(type)) {
              const observer = new PerformanceObserver(list => window[key].push(...list.getEntries().map(e => e.toJSON())))
              observer.observe({ type, buffered: false, ...(type === 'event' ? { durationThreshold: 16 } : {}) })
              window.__observers.push(observer)
            }
          }
        }, rows)
        await cdp.send('Performance.enable')
        const before = await cdp.send('Performance.getMetrics')
        await page.locator('#runtime-bench-trigger').click()
        const timing = await page.evaluate(() => window.__runtimeBench.takeInteraction())
        const after = await cdp.send('Performance.getMetrics')
        // Let the browser deliver Event Timing entries; this wait is outside timing.
        await page.waitForTimeout(120)
        const observed = await page.evaluate(() => ({ events: window.__observedEvents, longTasks: window.__observedLongTasks }))
        const validation = await page.evaluate(() => window.__runtimeBench.validateInteraction())
        const metric = (sample, name) => sample.metrics.find(m => m.name === name)?.value ?? 0
        if (round >= 0) data[variant.name][block].push({ ...timing, validation, ...observed, observedTaskDurationMs: 1000 * (metric(after, 'TaskDuration') - metric(before, 'TaskDuration')) })
        await page.evaluate(() => window.__runtimeBench.cleanupInteraction())
      }
      console.log(`block ${block + 1}/${blocks}: ${name} completed`)
      save()
    }
    if (phases.includes('memory')) for (const variant of shuffle(variants, rng)) {
      // Separate page: no timing samples run with forced GC or retained observations.
      const { page, cdp } = await newPage(browser, variant)
      await page.bringToFront()
      await page.evaluate(async () => { await window.__runtimeBench.prepareInteraction({ rows: 2400 }); window.__runtimeBench.cleanupInteraction() })
      await page.waitForTimeout(100)
      const baseline = await heap(cdp)
      const cycles = []
      for (let cycle = 0; cycle < 3; cycle++) {
        await page.evaluate(() => window.__runtimeBench.prepareInteraction({ rows: 2400 }))
        const mounted = await heap(cdp)
        await page.evaluate(() => window.__runtimeBench.cleanupInteraction())
        await page.waitForTimeout(100)
        const unmounted = await heap(cdp)
        cycles.push({ mounted, unmounted, mountedDeltaBytes: mounted.usedSize - baseline.usedSize, unmountedDeltaBytes: unmounted.usedSize - baseline.usedSize })
      }
      ;(result.memory[variant.name] ||= []).push({ block, baseline, cycles })
      await page.close()
      save()
    }
    if (browserErrors.length) throw new Error(JSON.stringify(browserErrors))
  } finally { await browser.close() }
}
for (const data of Object.values(result.throughput)) {
  data.summary = Object.fromEntries(variants.map(v => [v.name, summarize(data.samples[v.name].flat().map(s => s.durationMs / data.iterations))]))
  data.comparisons = Object.fromEntries(variants.filter(v => v.name !== 'current' && v.name !== 'react-control').map(({ name: ref }) => [ref,
    Object.fromEntries(variants.filter(v => v.name !== ref).map(v => [v.name, compareBlocks(data.samples[v.name].map(b => b.map(s => s.durationMs)), data.samples[ref].map(b => b.map(s => s.durationMs)))])),
  ]))
}
for (const data of Object.values(result.interactions)) {
  data.summary = Object.fromEntries(variants.map(v => {
    const samples = data[v.name].flat()
    const events = samples.flatMap(s => s.events.filter(e => e.name === 'click' && e.interactionId > 0 && e.startTime >= (s.eventTimeStamp ?? s.handlerStartMs) - 1))
    return [v.name, {
      handlerToCommitMs: summarize(samples.map(s => s.handlerToCommitMs)),
      handlerToNextFrameMs: summarize(samples.map(s => s.handlerToNextFrameMs)),
      observedClickDurationMs: summarize(events.map(e => e.duration)),
      clickSamples: samples.length, observedClickEntries: events.length,
      longTaskCount: samples.reduce((n, s) => n + s.longTasks.filter(t => t.startTime + t.duration >= s.eventTimeStamp && t.startTime <= s.nextFrameMs).length, 0),
    }]
  }))
}
result.complete = true
save()
console.log(`Saved ${output}`)
