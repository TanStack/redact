// Compare only hydration with and without event props. Browser timing is opt-in by running this file.
// BUILD_ONLY=1 validates bundles without launching Chrome.
import { build, version as esbuildVersion } from 'esbuild'
import { chromium } from 'playwright'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cpus, release, platform, arch } from 'node:os'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { summarize, compareBlocks, random, shuffle } from '../benchmarks/stats.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const reference = createRequire(resolve(root, 'benchmarks/reference/package.json'))
const fixture = resolve(root, 'benchmarks/hydration-events.tsx')
const positive = (name, fallback, integer = true) => {
  const value = Number(process.env[name] || fallback)
  if (!(value >= 1 && Number.isFinite(value)) || (integer && !Number.isInteger(value))) throw Error(`Invalid ${name}`)
  return value
}
const blocks = positive('BLOCKS', 5), rounds = positive('ROUNDS', 5), rows = positive('ROWS', 300)
const targetMs = positive('TARGET_MS', 80, false), cpuRate = positive('CPU_RATE', 1, false)
const fixedIterations = process.env.ITERATIONS ? positive('ITERATIONS', 20) : undefined
const output = resolve(process.env.OUTPUT || 'benchmarks/results/hydration-events.json')
const hash = value => createHash('sha256').update(value).digest('hex')
const pinned = JSON.parse(readFileSync(resolve(root, 'benchmarks/reference/package.json'), 'utf8')).dependencies
for (const name of ['react', 'react-dom']) {
  const installed = JSON.parse(readFileSync(reference.resolve(name + '/package.json'), 'utf8')).version
  if (installed !== pinned[name]) throw Error(`Reference ${name} is not pinned`)
}
const variants = [
  { name: 'react', kind: 'react', version: pinned.react },
  { name: 'react-control', kind: 'react', version: pinned.react },
  { name: 'frozen-final', source: resolve(process.env.FINAL_SOURCE || '/tmp/redact-commit-optimized-final/src') },
  { name: 'two-kind', source: resolve(process.env.CANDIDATE_SOURCE || '/tmp/redact-commit-two-kind/src') },
]
const result = {
  schema: 1, complete: false,
  environment: {
    date: new Date().toISOString(), node: process.version, esbuild: esbuildVersion,
    os: `${platform()} ${release()}`, architecture: arch(), cpu: cpus()[0]?.model,
    blocks, rounds, rows, targetMs, cpuRate, seed: 20260910,
    headless: process.env.HEADED !== '1',
    fixtureSHA256: hash(readFileSync(fixture)),
    runnerSHA256: hash(readFileSync(fileURLToPath(import.meta.url))),
    statsSHA256: hash(readFileSync(resolve(root, 'benchmarks/stats.mjs'))),
    referenceLockSHA256: hash(readFileSync(resolve(root, 'benchmarks/reference/package-lock.json'))),
  },
  method: {
    timing: 'Production hydration call through one passive-effect completion. SSR, container setup, host identity checks, callback dispatch/validation and unmount are outside timing. Natural GC, no forced collections.',
    work: 'Static and event-heavy modes use the same button markup. Event-heavy adds click and mousedown capture/bubble callbacks on every row. Every root, row and callback is checked after timing.',
    order: 'Fresh Chrome process per block, seeded shuffled modes and renderer order, rotated renderer order per round, separate pages for all renderers.',
    units: 'Milliseconds per hydrated root. p95 describes sample averages, not individual hydration tail latency.',
    intervals: 'Exploratory paired block-bootstrap intervals from stats.mjs, not adjusted for multiple comparisons. Identical React control estimates run noise. This is not an allocation-rate or field responsiveness measurement.',
  },
  variants: [], calibration: {}, workloads: {}, browserErrors: [],
}
const bundles = new Map()
const sourcePaths = { react: 'react/index.ts', 'react/jsx-runtime': 'react/jsx-runtime.ts', 'react-dom': 'dom/index.ts', 'react-dom/client': 'dom/client.ts', 'react-dom/server': 'server/index.ts' }
for (const variant of variants) {
  const paths = variant.kind === 'react' ? {
    react: reference.resolve('react'), 'react/jsx-runtime': reference.resolve('react/jsx-runtime'),
    'react-dom': reference.resolve('react-dom'), 'react-dom/client': reference.resolve('react-dom/client'),
    'react-dom/server': reference.resolve('react-dom/server.browser'),
  } : Object.fromEntries(Object.entries(sourcePaths).map(([name, path]) => [name, resolve(variant.source, path)]))
  const built = await build({
    entryPoints: [fixture], bundle: true, write: false, minify: true, metafile: true,
    platform: 'browser', format: 'iife', target: 'es2022', jsx: 'automatic', jsxImportSource: 'react',
    tsconfigRaw: { compilerOptions: {} }, define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'renderer', setup(builder) {
      builder.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, args => {
        if (!paths[args.path]) throw Error(`Unmapped renderer import: ${args.path}`)
        return { path: paths[args.path] }
      })
    } }],
  })
  if (built.warnings.some(warning => warning.id === 'ignored-bare-import')) throw Error('Lost feature side effects: ' + variant.name)
  const bytes = built.outputFiles[0].contents
  bundles.set(variant.name, built.outputFiles[0].text)
  const inputs = Object.keys(built.metafile.inputs).sort().map(path => ({ path, sha256: hash(readFileSync(resolve(root, path))) }))
  result.variants.push({ ...variant, inputs, inputSHA256: hash(JSON.stringify(inputs)), bundleSHA256: hash(bytes),
    packageSHA256: variant.source ? hash(readFileSync(resolve(variant.source, '../package.json'))) : undefined,
    fixtureBundle: { raw: bytes.length, gzip: gzipSync(bytes).length } })
}
if (result.variants[0].bundleSHA256 !== result.variants[1].bundleSHA256) throw Error('React control bundles differ')
const save = () => { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(result, null, 2) + '\n') }
const rng = random(20260910)
async function sample(page, mode, iterations) {
  const data = await page.evaluate(args => window.__hydrationEvents.run(args.mode, args.iterations, args.rows), { mode, iterations, rows })
  const callbacks = mode === 'event-heavy' ? iterations * rows * 4 : 0
  if (!(data.durationMs > 0) || data.mode !== mode || data.iterations !== iterations || data.rows !== rows ||
    data.operations !== iterations * rows || data.renders !== iterations || data.commits !== iterations ||
    data.callbacks !== callbacks || data.checks !== iterations * (rows + 5)) throw Error('Completed work differs: ' + mode)
  return data
}
async function measure() {
  for (let block = 0; block < blocks; block++) {
    const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome', headless: process.env.HEADED !== '1' })
    result.environment.browser = browser.version()
    try {
      const pages = new Map()
      for (const variant of shuffle(variants, rng)) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
        page.on('pageerror', error => result.browserErrors.push({ variant: variant.name, error: error.message }))
        await page.setContent('<!doctype html><html><head></head><body></body></html>')
        await page.addScriptTag({ content: bundles.get(variant.name) })
        const cdp = await page.context().newCDPSession(page)
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
        pages.set(variant.name, page)
      }
      for (const mode of shuffle(['static', 'event-heavy'], rng)) {
        const order = shuffle(variants, rng)
        if (!result.calibration[mode]) {
          const durationsMs = {}
          for (const variant of order) {
            const page = pages.get(variant.name)
            await page.bringToFront()
            await sample(page, mode, 5)
            durationsMs[variant.name] = (await sample(page, mode, 10)).durationMs
          }
          const fastest = Math.min(...Object.values(durationsMs)) / 10
          const slowest = Math.max(...Object.values(durationsMs)) / 10
          const iterations = fixedIterations ?? Math.max(1, Math.min(1000, Math.ceil(targetMs / fastest), Math.floor(1500 / slowest)))
          result.calibration[mode] = { iterations, durationsMs }
        }
        const { iterations } = result.calibration[mode]
        const data = result.workloads[mode] ||= { iterations, order: [], samples: Object.fromEntries(variants.map(v => [v.name, []])) }
        data.order[block] = []
        for (const variant of order) {
          const page = pages.get(variant.name)
          await page.bringToFront()
          for (let warm = 0; warm < 2; warm++) await sample(page, mode, iterations)
          data.samples[variant.name][block] = []
        }
        for (let round = 0; round < rounds; round++) {
          const rotated = [...order.slice(round % order.length), ...order.slice(0, round % order.length)]
          data.order[block][round] = rotated.map(v => v.name)
          for (const variant of rotated) {
            const page = pages.get(variant.name)
            await page.bringToFront()
            data.samples[variant.name][block].push(await sample(page, mode, iterations))
          }
        }
        if (result.browserErrors.length) throw Error('Browser errors occurred')
        console.log(`block ${block + 1}/${blocks}: ${mode}`)
        save()
      }
    } finally { await browser.close() }
  }
  for (const data of Object.values(result.workloads)) {
    const times = Object.fromEntries(variants.map(v => [v.name, data.samples[v.name].map(block => block.map(s => s.durationMs / s.iterations))]))
    for (const blocksOfTimes of Object.values(times)) if (blocksOfTimes.length !== blocks || blocksOfTimes.some(b => b.length !== rounds)) throw Error('Incomplete samples')
    data.summary = Object.fromEntries(variants.map(v => [v.name, summarize(times[v.name].flat())]))
    data.comparisons = {
      twoKindVsFrozen: compareBlocks(times['two-kind'], times['frozen-final']),
      reactControlVsReact: compareBlocks(times['react-control'], times.react),
      frozenVsReact: compareBlocks(times['frozen-final'], times.react),
      twoKindVsReact: compareBlocks(times['two-kind'], times.react),
    }
  }
  result.complete = true
}
try {
  if (process.env.BUILD_ONLY === '1') result.buildOnly = true
  else await measure()
} catch (error) {
  result.error = error.stack || String(error)
  process.exitCode = 1
} finally { save() }
