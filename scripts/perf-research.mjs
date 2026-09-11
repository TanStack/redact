// Compare source snapshots in real Chrome, alternating measurement order.
// node scripts/perf-research.mjs baseline=/tmp/baseline candidate=/tmp/candidate
// SAMPLES=9 OUTPUT=/tmp/results.json PROFILE=baseline node scripts/perf-research.mjs ...
// Point at packages/redact/src in each checkout, or copy the whole package.
// Source-only copies need equivalent package.json sideEffects metadata or
// tree shaking changes and the size comparison is no longer equivalent.
import { build, version as esbuildVersion } from 'esbuild'
import { chromium } from 'playwright'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { cpus, platform, release } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync, brotliCompressSync } from 'node:zlib'

const root = fileURLToPath(new URL('..', import.meta.url))
const variants = process.argv.slice(2).map(arg => {
  const i = arg.indexOf('=')
  if (i < 1) throw new Error('Arguments must be name=/absolute/source/directory')
  return { name: arg.slice(0, i), source: resolve(arg.slice(i + 1)) }
})
if (!variants.length) throw new Error('Provide at least one source snapshot')
const samples = Number(process.env.SAMPLES || 7)
if (!Number.isInteger(samples) || samples < 1) throw new Error('SAMPLES must be a positive integer')
const median = a => [...a].sort((a,b) => a-b)[Math.floor(a.length / 2)]
function confidenceInterval(values) {
  let seed = 12345
  const medians = []
  for (let round = 0; round < 2000; round++) {
    const sample = Array.from({ length: values.length }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return values[seed % values.length]
    })
    medians.push(median(sample))
  }
  medians.sort((a, b) => a-b)
  return [medians[50], medians[1949]]
}
function sourceHash(source) {
  const hash = createHash('sha256')
  for (const file of readdirSync(source, { recursive: true }).filter(f => f.endsWith('.ts')).sort()) {
    hash.update(file).update('\0').update(readFileSync(resolve(source, file)))
  }
  return hash.digest('hex')
}
const workloads = [
  ['stable rows', '__runReactRenderBenchmark', { iterations: 300, rows: 480 }],
  ['keyed shuffle', '__benchKeyedReorder', { iterations: 500, rows: 240 }],
  ['mount/unmount', '__benchMountUnmount', { iterations: 300, rows: 200 }],
  ['deep tree', '__benchDeepTree', { iterations: 10000, depth: 80 }],
  ['hook-heavy rows', '__benchStateChurn', { iterations: 300, rows: 240 }],
  ['batched state', '__benchScheduledState', { iterations: 500, rows: 240, depth: 8 }],
  ['sparse state', '__benchScheduledState', { iterations: 60000, rows: 240, sparse: true, depth: 16 }],
  ['DOM props', '__benchDomProps', { iterations: 150, rows: 200 }],
  ['effects', '__benchEffects', { iterations: 500, rows: 120 }],
  ['SSR', '__benchServer', { iterations: 300, rows: 240 }],
  ['hydration', '__benchHydrate', { iterations: 50, rows: 200 }],
  ['mixed-depth state', '__benchScheduledState', { iterations: 300, rows: 240, depth: 8, mixed: true }],
  ['large mount', '__benchMountUnmount', { iterations: 40, rows: 2000 }],
  ['event mount', '__benchEventMount', { iterations: 100, rows: 120 }],
  ['SSR clean', '__benchServer', { iterations: 300, rows: 240, escaped: false }],
  ['small select', '__benchSelect', { iterations: 2000, rows: 8 }],
  ['large select', '__benchSelect', { iterations: 80, rows: 1000 }],
  ['null siblings', '__benchNullRun', { iterations: 80, rows: 1200 }],
].filter(([name]) => !process.env.WORKLOADS || process.env.WORKLOADS.split(',').includes(name))

const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome', headless: true })
const results = { environment: { browser: browser.version(), node: process.version, esbuild: esbuildVersion, os: `${platform()} ${release()}`, cpu: cpus()[0]?.model, samples, date: new Date().toISOString() }, variants: [], workloads: {} }
const pages = new Map()
const errors = []
let profileBundle
try {
  for (const variant of variants) {
    const alias = Object.fromEntries(Object.entries({
      '@tanstack/redact/jsx-runtime': '/react/jsx-runtime.ts',
      '@tanstack/redact/dom-client': '/dom/client.ts',
      '@tanstack/redact/dom': '/dom/index.ts',
      '@tanstack/redact/_all': '/dom/_all.ts',
      '@tanstack/redact/server': '/server/index.ts',
      '@tanstack/redact': '/react/index.ts',
    }).map(([id, file]) => [id, variant.source + file]))
    const options = { bundle: true, write: false, minify: true, target: 'es2022', define: { 'process.env.NODE_ENV': '"production"' } }
    const sizes = {}
    for (const [name, entry] of [['client', 'dom/client.ts'], ['server', 'server/index.ts']]) {
      const result = await build({ ...options, entryPoints: [resolve(variant.source, entry)], format: 'esm' })
      const bytes = result.outputFiles[0].contents
      sizes[name] = { raw: bytes.length, gzip: gzipSync(bytes).length, brotli: brotliCompressSync(bytes).length }
    }
    const fixtureOptions = {
      ...options, format: 'iife', alias,
      stdin: { contents: `import ${JSON.stringify(resolve(root, 'examples/perf-bench/src/main.tsx'))}; import ${JSON.stringify(resolve(root, 'examples/perf-bench/src/research-workloads.ts'))};`, resolveDir: root },
    }
    const bundle = await build(fixtureOptions)
    if (process.env.PROFILE === variant.name) profileBundle = (await build({ ...fixtureOptions, minify: false })).outputFiles[0].text
    const page = await browser.newPage()
    page.on('pageerror', e => errors.push({ variant: variant.name, message: e.message }))
    await page.setContent('<div id="root"></div>')
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    pages.set(variant.name, page)
    results.variants.push({ ...variant, sourceHash: sourceHash(variant.source), sizes })
  }
  for (const [name, fn, args] of workloads) {
    const timings = Object.fromEntries(variants.map(v => [v.name, []]))
    for (const variant of variants) {
      const page = pages.get(variant.name)
      await page.bringToFront()
      for (let warm = 0; warm < 2; warm++) await page.evaluate(({ fn, args }) => window[fn]({ ...args, iterations: Math.min(args.iterations, 30) }), { fn, args })
    }
    for (let round = 0; round < samples; round++) {
      const order = round % 2 ? [...variants].reverse() : variants
      for (const variant of order) {
        const page = pages.get(variant.name)
        await page.bringToFront()
        const result = await page.evaluate(({ fn, args }) => window[fn](args), { fn, args })
        timings[variant.name].push(result.totalMs)
      }
    }
    const baseline = timings[variants[0].name]
    results.workloads[name] = Object.fromEntries(variants.map(v => {
      const changes = timings[v.name].map((t, i) => 100 * (t / baseline[i] - 1))
      return [v.name, {
        samples: timings[v.name], medianMs: median(timings[v.name]),
        pairedChangePercent: median(changes), pairedChange95CI: confidenceInterval(changes),
      }]
    }))
    console.log(name, JSON.stringify(results.workloads[name]))
    if (process.env.OUTPUT) writeFileSync(process.env.OUTPUT, JSON.stringify(results, null, 2))
  }
  if (process.env.PROFILE) {
    if (!profileBundle) throw new Error('PROFILE must name a supplied variant')
    const page = await browser.newPage()
    await page.setContent('<div id="root"></div>')
    await page.addScriptTag({ content: profileBundle })
    for (const [, fn, args] of workloads) await page.evaluate(({ fn, args }) => window[fn]({ ...args, iterations: Math.min(args.iterations, 30) }), { fn, args })
    const session = await page.context().newCDPSession(page)
    await session.send('Profiler.enable')
    await session.send('Profiler.setSamplingInterval', { interval: 100 })
    await session.send('Profiler.start')
    for (const [, fn, args] of workloads) {
      for (let repeat = 0; repeat < 3; repeat++) await page.evaluate(({ fn, args }) => window[fn](args), { fn, args })
    }
    const { profile } = await session.send('Profiler.stop')
    writeFileSync(process.env.PROFILE_OUTPUT || '/tmp/redact-performance.cpuprofile', JSON.stringify(profile))
  }
  if (errors.length) throw new Error(JSON.stringify(errors))
  console.log('sizes', JSON.stringify(results.variants.map(v => ({ name: v.name, ...v.sizes }))))
} finally {
  await browser.close()
}
