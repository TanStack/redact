// Independent count and SSR audit. No workload.run calls or timing samples.
// Run after measurements: node benchmarks/audit-ship-final-details.mjs
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, relative, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import { build, version as esbuildVersion } from 'esbuild'

const root = fileURLToPath(new URL('..', import.meta.url))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const load = name => {
  const path = resolve(root, 'benchmarks/results', name)
  const bytes = readFileSync(path)
  return { path, sha256: hash(bytes), data: JSON.parse(bytes) }
}
const ordinary = load('ship-final-cpu1.json')
const reducers = load('ship-final-reducers-cpu1.json')
const ssr = load('ship-final-node-ssr.json')
const output = { verified: false, auditSHA256: hash(readFileSync(fileURLToPath(import.meta.url))), timedRuns: 0, browser: {}, ssr: {} }

function percentile(values, fraction) {
  if (!values.length) return null
  const ordered = values.toSorted((a, b) => a - b)
  const index = (ordered.length - 1) * fraction
  return ordered[Math.floor(index)] * (1 - index % 1) + ordered[Math.ceil(index)] * (index % 1)
}
function summarize(values) {
  return { n: values.length, median: percentile(values, .5), p95: percentile(values, .95), min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null }
}
function compare(candidate, baseline) {
  const logs = candidate.map((block, b) => block.map((sample, r) => Math.log(sample.durationMs / baseline[b][r].durationMs)))
  const estimate = values => Math.expm1(percentile(values, .5)) * 100
  let seed = 20260909
  const resamples = []
  for (let draw = 0; draw < 5000; draw++) {
    const selected = []
    for (let b = 0; b < logs.length; b++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      selected.push(...logs[Math.floor(seed / 2 ** 32 * logs.length)])
    }
    resamples.push(estimate(selected))
  }
  return { pairedTimeChangePercent: estimate(logs.flat()), blockBootstrap95CI: [percentile(resamples, .025), percentile(resamples, .975)], independentBlocks: logs.length }
}
function equivalent(actual, wanted, label) {
  if (typeof wanted === 'number') {
    assert(Number.isFinite(actual) && Math.abs(actual - wanted) <= 1e-9 * Math.max(1, Math.abs(wanted)), `${label}: ${actual} != ${wanted}`)
  } else if (wanted === null) assert.equal(actual, null, label)
  else {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(wanted).sort(), `${label}: keys`)
    for (const key of Object.keys(wanted)) equivalent(actual[key], wanted[key], `${label}.${key}`)
  }
}

const updateNames = ['stable-keyed-rows', 'jsx-stable-keyed-rows', 'keyed-reverse', 'deep-tree-props', 'props-updates', 'jsx-props-updates', 'controlled-selects', 'null-siblings']
const ordinaryNames = [...updateNames, 'batched-setters', 'sparse-setters', 'mixed-depth-setters', 'mount-unmount', 'passive-effects', 'hydration', 'browser-ssr', 'context-through-memo']
const reducerNames = ['reducer-batches', 'reducer-suspense-updates', 'reducer-suspense-retries']
for (const result of [ordinary, reducers]) {
  const data = result.data
  assert(data.complete)
  assert.deepEqual(Object.keys(data.throughput).sort(), (result === ordinary ? ordinaryNames : reducerNames).sort())
  const totals = { samples: 0, operations: 0, recordedChecks: 0, reducerActions: 0, reducerRowCommits: 0, reducerLayoutDOMChecks: 0, fallbackReveals: 0, hiddenPrimaryChecks: 0, independentSuspensions: 0, interactionSamples: 0, interactionRows: 0, interactionChecks: 0, memoryCycles: 0 }
  const counts = {}
  for (const [name, work] of Object.entries(data.throughput)) {
    const n = work.iterations
    const calibration = data.calibration[name]
    const durations = Object.values(calibration.durationsMs)
    assert(durations.every(ms => Number.isFinite(ms) && ms > 0))
    assert.deepEqual(Object.keys(calibration.durationsMs).sort(), data.variants.map(v => v.name).sort())
    const fastest = Math.min(...durations) / calibration.defaultIterations
    const slowest = Math.max(...durations) / calibration.defaultIterations
    assert.equal(n, Math.max(1, Math.min(100000, Math.ceil(data.environment.targetMs / fastest), Math.floor(1500 / slowest))), `${name}: calibration`)
    let operations = n
    let checks = 2
    let diagnostics
    if (updateNames.includes(name)) {
      checks = ['stable-keyed-rows', 'jsx-stable-keyed-rows', 'keyed-reverse'].includes(name) ? 3 : 2
      diagnostics = { commits: n + 1 }
    } else if (name.endsWith('-setters')) {
      operations = n * (name === 'sparse-setters' ? 10 : 180)
      diagnostics = { renders: operations }
    } else if (name === 'passive-effects') {
      operations = n * 100
      diagnostics = { creates: operations, cleanups: operations }
    } else if (name === 'context-through-memo') {
      operations = n * 180
      checks = 5
      diagnostics = { outerRenders: 180, innerRenders: 180, staticRenders: 180, consumerRenders: (n + 1) * 180 }
    } else if (name === 'hydration') {
      checks = 3 * n + 1
      diagnostics = { effects: n }
    } else if (name === 'mount-unmount') {
      checks = 1
      diagnostics = { renderedCount: n, mountedCount: n, unmountedCount: n }
    } else if (name === 'browser-ssr') {
      checks = 1
      const html = '<ul>' + Array.from({ length: 300 }, (_, id) => `<li data-id="${id}">${id}:${n}</li>`).join('') + '</ul>'
      diagnostics = { outputCharacters: html.length }
    } else if (reducerNames.includes(name)) {
      const retry = name === 'reducer-suspense-retries'
      operations = n * 96 * (retry ? 2 : 3)
      checks = 10
      let first = 0
      let last = 95
      for (let tick = 0; tick < n; tick++) {
        const factor = retry ? tick % 4 + 2 : 1
        for (const action of retry ? [1, 2] : [1, 2, -1]) {
          first = (first * 2 + action * factor) % 1000003
          last = (last * 2 + action * factor) % 1000003
        }
      }
      diagnostics = {
        layoutCommits: (n + 1) * 96, layoutCleanups: n * 96,
        minRowCommits: n + 1, maxRowCommits: n + 1, layoutDomChecks: (n + 1) * 96,
        fallbackMounts: retry ? n : 0, fallbackUnmounts: retry ? n : 0,
        hiddenChecks: retry ? n * 2 : 0, independentSuspensions: retry ? 1 : 0,
        firstRowValue: first, lastRowValue: last,
      }
    } else assert.fail(`Unaudited workload ${name}`)
    assert.equal(work.expectedOperations, operations, `${name}: expected operation total`)
    let samples = 0
    for (const [variant, blocks] of Object.entries(work.samples)) {
      assert.equal(blocks.length, data.environment.blocks)
      for (const block of blocks) {
        assert.equal(block.length, data.environment.rounds)
        for (const sample of block) {
          assert.equal(sample.name, name)
          assert.equal(sample.mode, work.mode)
          assert.equal(sample.iterations, n)
          assert.equal(sample.operations, operations)
          assert.equal(sample.checks, checks)
          assert.deepEqual(sample.diagnostics, diagnostics, `${name}/${variant}: completed-work diagnostics`)
          samples++; totals.samples++; totals.operations += operations; totals.recordedChecks += checks
          if (reducerNames.includes(name)) {
            totals.reducerActions += operations
            totals.reducerRowCommits += diagnostics.layoutCommits
            totals.reducerLayoutDOMChecks += diagnostics.layoutDomChecks
            totals.fallbackReveals += diagnostics.fallbackUnmounts
            totals.hiddenPrimaryChecks += diagnostics.hiddenChecks
            totals.independentSuspensions += diagnostics.independentSuspensions
          }
        }
      }
    }
    counts[name] = { iterations: n, samples, operationsPerSample: operations, recordedChecksPerSample: checks, diagnostics }
  }
  for (const [scenario, work] of Object.entries(data.interactions)) {
    const rows = Number(scenario.slice('click-'.length))
    assert(data.environment.interactionRows.includes(rows))
    for (const variant of data.variants) for (const block of work[variant.name]) for (const sample of block) {
      assert.equal(sample.expectedRows, rows)
      assert.equal(sample.factory, 'jsx')
      assert.equal(sample.checks, 1)
      assert.deepEqual(sample.validation, { finishedRows: rows, checks: 1 })
      assert.deepEqual(sample.diagnostics, { renders: 2, layoutCommits: 2, passiveEffects: 2, handlerCalls: 1 })
      equivalent(sample.handlerToCommitMs, sample.commitMs - sample.handlerStartMs, `${scenario}: commit interval`)
      equivalent(sample.handlerToNextFrameMs, sample.nextFrameMs - sample.handlerStartMs, `${scenario}: frame interval`)
      totals.interactionSamples++; totals.interactionRows += rows; totals.interactionChecks += 2
    }
  }
  for (const blocks of Object.values(data.memory)) for (const block of blocks) for (const cycle of block.cycles) {
    assert.equal(cycle.unmounted.nodes, block.baseline.nodes)
    assert.equal(cycle.unmounted.documents, block.baseline.documents)
    assert.equal(cycle.unmounted.jsEventListeners, block.baseline.jsEventListeners)
    assert(cycle.mounted.nodes > block.baseline.nodes)
    totals.memoryCycles++
  }
  output.browser[result === ordinary ? 'ordinary' : 'reducers'] = { resultSHA256: result.sha256, totals, counts }
}

const data = ssr.data
assert.equal(data.schema, 1)
assert.equal(data.complete, true)
assert.equal(data.environment.node, process.version)
assert.equal(data.environment.esbuild, esbuildVersion)
for (const [field, file] of Object.entries({ fixtureSHA256: 'benchmarks/ssr-workload.ts', runnerSHA256: 'scripts/compare-ssr.mjs', statsSHA256: 'benchmarks/stats.mjs', referenceLockSHA256: 'benchmarks/reference/package-lock.json' })) {
  assert.equal(data.environment[field], hash(readFileSync(resolve(root, file))), `${field}: recorded input changed`)
}
const names = data.variants.map(v => v.name)
assert.deepEqual(names.toSorted(), ['current', 'expanded', 'published', 'react', 'react-control'])
assert.deepEqual(Object.keys(data.throughput).sort(), ['node-readable-ready', 'node-string-clean', 'node-string-escaped', 'node-string-hooks-context'])
const reference = createRequire(resolve(root, 'benchmarks/reference/package.json'))
const require = createRequire(import.meta.url)
const { JSDOM } = createRequire(resolve(root, 'tests/package.json'))('jsdom')
const fixture = resolve(root, 'benchmarks/ssr-workload.ts')
const reconstructed = {}
function manifest(directory) {
  const files = []
  const visit = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name)
      if (entry.isDirectory()) visit(file)
      else files.push({ path: relative(directory, file), sha256: hash(readFileSync(file)) })
    }
  }
  visit(directory)
  return files.sort((a, b) => a.path.localeCompare(b.path))
}
for (const [name, patch] of Object.entries({ current: 'benchmarks/ship-final.patch', expanded: 'benchmarks/parity-expansion.patch' })) {
  const prepared = spawnSync(process.execPath, ['scripts/prepare-perf-baseline.mjs'], { cwd: root, encoding: 'utf8', env: { ...process.env, BASELINE_PATCH: patch } })
  assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout)
  const tree = manifest(data.variants.find(v => v.name === name).source)
  assert.deepEqual(manifest(prepared.stdout.trim()), tree, `${name}: SSR source patch reconstruction`)
  reconstructed[name] = { files: tree.length, sourceSHA256: hash(JSON.stringify(tree)), patchSHA256: hash(readFileSync(resolve(root, patch))) }
}
const react = data.variants.find(v => v.name === 'react')
const control = data.variants.find(v => v.name === 'react-control')
assert.equal(react.bundleSHA256, control.bundleSHA256)
assert.deepEqual(react.inputs, control.inputs)
const rebuilt = {}
const renderers = new Map()
for (const variant of data.variants) {
  assert.equal(variant.inputSHA256, hash(JSON.stringify(variant.inputs)))
  assert.deepEqual(variant.inputs.map(input => input.path), variant.inputs.map(input => input.path).sort())
  for (const input of variant.inputs) assert.equal(hash(readFileSync(resolve(root, input.path))), input.sha256, `${variant.name}: ${input.path}`)
  const paths = variant.kind === 'react' ? {
    react: reference.resolve('react'), 'react-dom': reference.resolve('react-dom'),
    'react/jsx-runtime': reference.resolve('react/jsx-runtime'), 'react-dom/server': reference.resolve('react-dom/server.node'),
  } : Object.fromEntries(Object.entries({ react: 'react/index.ts', 'react-dom': 'dom/index.ts', 'react/jsx-runtime': 'react/jsx-runtime.ts', 'react-dom/server': 'server/index.ts' }).map(([name, file]) => [name, resolve(variant.source, file)]))
  const buildOptions = expose => ({
    absWorkingDir: root, entryPoints: [fixture], bundle: true, write: false, minify: true, metafile: true,
    platform: 'node', format: 'cjs', target: 'node22', tsconfigRaw: {},
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'audit-ssr-renderer', setup(b) {
      b.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, args => {
        assert(paths[args.path], `Unmapped renderer import ${args.path}`)
        return { path: paths[args.path] }
      })
      if (expose) b.onLoad({ filter: /ssr-workload\.ts$/ }, args => {
        assert.equal(args.path, fixture)
        return { contents: readFileSync(fixture, 'utf8') + '\nexport { Rows, HookTree, jsx, renderToString, renderToReadableStream };', loader: 'ts', resolveDir: dirname(fixture) }
      })
    } }],
  })
  const original = await build(buildOptions(false))
  assert(!original.warnings.some(warning => warning.id === 'ignored-bare-import'))
  assert.equal(hash(original.outputFiles[0].contents), variant.bundleSHA256, `${variant.name}: rebuilt SSR bundle`)
  assert.equal(original.outputFiles[0].contents.length, variant.fixtureBundleBytes)
  const inputs = Object.keys(original.metafile.inputs).sort().map(path => ({ path, sha256: hash(readFileSync(resolve(root, path))) }))
  assert.deepEqual(inputs, variant.inputs, `${variant.name}: rebuilt input graph`)
  rebuilt[variant.name] = { bundleSHA256: variant.bundleSHA256, fixtureBundleBytes: variant.fixtureBundleBytes, inputCount: inputs.length }
  // Expose fixture components in an in-memory verification build. Never call
  // its timed run() loop. Each distinct final output is rendered once below.
  const exposed = await build(buildOptions(true))
  const module = { exports: {} }
  runInNewContext(exposed.outputFiles[0].text, { module, exports: module.exports, require, process, Buffer, console, setTimeout, clearTimeout, setImmediate, clearImmediate, queueMicrotask, TextEncoder, TextDecoder, ReadableStream, TransformStream, AbortController, AbortSignal })
  renderers.set(variant.name, module.exports)
}

function expectation(name, tick) {
  if (name === 'node-string-hooks-context') return {
    fixture: 'hooks',
    rows: Array.from({ length: 180 }, (_, id) => {
      const scope = `group-${Math.floor(id / 30)}`
      return { id, scope, text: `${scope}:${id * 2}:${id + 3}:${tick}` }
    }),
    uniqueIds: true,
  }
  const escaped = name === 'node-string-escaped'
  return {
    fixture: escaped ? 'escaped' : 'clean',
    rows: Array.from({ length: 300 }, (_, id) => {
      const text = escaped ? `row ${id} & <tag> "double" 'single' \u00a0 ${tick}` : `row ${id} value ${tick}`
      return { id, text, title: text }
    }),
    uniqueIds: false,
  }
}
const outputs = new Map()
async function finalOutput(variant, name, tick) {
  const key = `${variant}/${name}/${tick}`
  if (outputs.has(key)) return outputs.get(key)
  const api = renderers.get(variant)
  const element = api.jsx(name === 'node-string-hooks-context' ? api.HookTree : api.Rows, { tick, escaped: name === 'node-string-escaped' })
  let html = ''
  let chunks = 0
  let errors = 0
  if (name === 'node-readable-ready') {
    const stream = await api.renderToReadableStream(element, { onError() { errors++ } })
    await stream.allReady
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    try {
      for (;;) {
        const part = await reader.read()
        if (part.done) break
        html += decoder.decode(part.value, { stream: true })
        chunks++
      }
      html += decoder.decode()
    } finally { reader.releaseLock() }
  } else html = api.renderToString(element)
  assert.equal(errors, 0)
  const wanted = expectation(name, tick)
  const document = JSDOM.fragment(html)
  const lists = document.querySelectorAll('ul')
  assert.equal(lists.length, 1)
  assert.equal(lists[0].getAttribute('data-fixture'), wanted.fixture)
  const rows = [...lists[0].querySelectorAll('li')]
  assert.equal(rows.length, wanted.rows.length)
  rows.forEach((row, i) => {
    assert.equal(row.getAttribute('data-id'), String(wanted.rows[i].id))
    assert.equal(row.textContent, wanted.rows[i].text)
    if (wanted.rows[i].title !== undefined) assert.equal(row.getAttribute('title'), wanted.rows[i].title)
    if (wanted.rows[i].scope !== undefined) assert.equal(row.getAttribute('data-scope'), wanted.rows[i].scope)
  })
  if (wanted.uniqueIds) assert(rows.every(row => row.id) && new Set(rows.map(row => row.id)).size === rows.length)
  assert.equal(document.querySelector('script,style,template'), null)
  const result = { outputSHA256: hash(html), expectationSHA256: hash(JSON.stringify(wanted)), outputCharacters: html.length, checks: rows.length + 3, chunks }
  outputs.set(key, result)
  return result
}
function digitTotal(n) {
  let total = 0
  for (let start = 1, digits = 1; start <= n; start *= 10, digits++) total += (Math.min(n, start * 10 - 1) - start + 1) * digits
  return total
}
const totals = { samples: 0, operations: 0, recordedChecks: 0, calibrationSamples: 0, rowRenders: 0, hookTreeRenders: 0, hookLeafRenders: 0, hookCalls: 0, readableChunks: 0 }
const comparisons = {}
const counts = {}
let processIDs
for (const [name, work] of Object.entries(data.throughput)) {
  assert.equal(work.mode, name === 'node-readable-ready' ? 'async' : 'sync')
  const n = work.iterations
  const calibration = data.calibration[name]
  assert.equal(calibration.defaultIterations, name === 'node-readable-ready' ? 30 : name === 'node-string-hooks-context' ? 60 : 80)
  const times = Object.values(calibration.samples).map(sample => sample.durationMs / calibration.defaultIterations)
  assert.equal(n, Math.max(1, Math.min(100000, Math.ceil(data.environment.targetMs / Math.min(...times)), Math.floor(2000 / Math.max(...times)))))
  assert.equal(calibration.targetCapped, n * Math.min(...times) < data.environment.targetMs)
  assert.deepEqual(Object.keys(work.samples).sort(), names.toSorted())
  assert.deepEqual(Object.keys(work.processIDs).sort(), names.toSorted())
  if (processIDs) assert.deepEqual(work.processIDs, processIDs, 'Each workload must use the same renderer process within its block')
  else processIDs = work.processIDs
  const outputsByVariant = {}
  for (const variant of names) {
    assert.equal(work.samples[variant].length, data.environment.blocks)
    assert.equal(work.processIDs[variant].length, data.environment.blocks)
    for (const block of work.samples[variant]) assert.equal(block.length, data.environment.rounds)
    async function validate(sample, measured) {
      const iterations = measured ? n : calibration.defaultIterations
      assert.equal(sample.name, name)
      assert.equal(sample.iterations, iterations)
      assert.equal(sample.operations, iterations)
      assert.equal(sample.factory, 'jsx')
      assert(Number.isFinite(sample.durationMs) && sample.durationMs > 0)
      assert.equal(typeof sample.validationCacheHit, 'boolean')
      const regenerated = await finalOutput(variant, name, iterations)
      for (const key of ['outputSHA256', 'expectationSHA256', 'outputCharacters', 'checks']) assert.equal(sample[key], regenerated[key], `${name}/${variant}: ${key}`)
      const hooks = name === 'node-string-hooks-context'
      let chunks = 0
      if (name === 'node-readable-ready') for (let start = 1; start <= iterations; start *= 10) {
        const representative = await finalOutput(variant, name, start)
        chunks += (Math.min(iterations, start * 10 - 1) - start + 1) * representative.chunks
      }
      const characters = iterations * sample.outputCharacters - (hooks ? 180 : 600) * (iterations * String(iterations).length - digitTotal(iterations))
      const diagnostics = { totalCharacters: characters, totalChunks: chunks, streamErrors: 0, rowRenders: hooks ? 0 : iterations, hookTreeRenders: hooks ? iterations : 0, hookLeafRenders: hooks ? iterations * 180 : 0, hookCalls: hooks ? iterations * 900 : 0 }
      assert.deepEqual(sample.diagnostics, diagnostics, `${name}/${variant}: completed SSR diagnostics`)
      if (measured) {
        totals.samples++; totals.operations += iterations; totals.recordedChecks += sample.checks
        for (const key of ['rowRenders', 'hookTreeRenders', 'hookLeafRenders', 'hookCalls']) totals[key] += diagnostics[key]
        totals.readableChunks += chunks
      } else totals.calibrationSamples++
    }
    await validate(calibration.samples[variant], false)
    for (const sample of work.samples[variant].flat()) await validate(sample, true)
    equivalent(work.summary[variant], summarize(work.samples[variant].flat().map(sample => sample.durationMs / n)), `${name}/${variant}: summary`)
    outputsByVariant[variant] = await finalOutput(variant, name, n)
  }
  assert.deepEqual(Object.keys(work.comparisons).sort(), ['expanded', 'published', 'react'])
  comparisons[name] = {}
  for (const [baseline, candidates] of Object.entries(work.comparisons)) {
    assert.deepEqual(Object.keys(candidates).sort(), names.filter(name => name !== baseline).sort())
    comparisons[name][baseline] = {}
    for (const [candidate, recorded] of Object.entries(candidates)) {
      const recalculated = compare(work.samples[candidate], work.samples[baseline])
      equivalent(recorded, recalculated, `${name}/${baseline}/${candidate}: paired statistics`)
      comparisons[name][baseline][candidate] = recalculated
    }
  }
  counts[name] = { iterations: n, samples: data.environment.blocks * data.environment.rounds * names.length, outputsByVariant }
}
const uniquePIDs = Object.values(processIDs).flat()
assert(uniquePIDs.every(pid => Number.isInteger(pid) && pid > 0))
assert.equal(new Set(uniquePIDs).size, data.environment.blocks * names.length, 'Fresh SSR child for each variant and block')
output.ssr = { resultSHA256: ssr.sha256, reconstructed, rebuilt, independentProcessBlocks: uniquePIDs.length, totals, untimedOutputRenders: outputs.size, counts, comparisons }
const sizesPath = resolve(root, 'benchmarks/results/ship-sizes.json')
const sizes = JSON.parse(readFileSync(sizesPath))
for (const [field, tree] of [['sourceFiles', 'src'], ['builtFiles', 'dist']]) {
  for (const input of sizes[field]) assert.equal(hash(readFileSync(resolve(sizes.packageRoot, tree, input.file))), input.sha256, `Size input ${tree}/${input.file}`)
}
const reportPath = resolve(root, 'benchmarks/SHIP_RESULTS.md')
const report = readFileSync(reportPath, 'utf8')
const changes = {}
for (const [name, label, rounded] of [['deep-tree-props', 'Deep-tree updates', '-25.7'], ['batched-setters', 'Batched setters', '-16.7'], ['sparse-setters', 'Sparse setters', '-16.8']]) {
  const recomputed = compare(ordinary.data.throughput[name].samples.current, ordinary.data.throughput[name].samples.expanded)
  assert.equal(recomputed.pairedTimeChangePercent.toFixed(1), rounded)
  assert(report.includes(`| ${label} | ${rounded}% |`))
  changes[name] = recomputed
}
const retrySamples = reducers.data.throughput['reducer-suspense-retries'].samples
const retryChange = compare(retrySamples['default-package'], retrySamples.react)
assert.equal(retryChange.pairedTimeChangePercent.toFixed(1), '124.8')
assert(report.includes('| Suspense retry cycles | +124.8% |'))
const defaultClient = sizes.redact.built.find(row => row.name === 'redact/dom-client (viewTransitions=stub)').gz
const defaultTotal = sizes.redact.built.find(row => row.name === 'client total (default Vite)').gz
assert.equal(defaultClient, 20134)
assert.equal(defaultTotal, 23310)
assert.equal(sizes.react.gz, 69162)
for (const value of [defaultClient, defaultTotal, sizes.react.gz]) assert(report.includes(value.toLocaleString('en-US')))
output.reportSpotChecks = {
  reportSHA256: hash(report), sizesSHA256: hash(readFileSync(sizesPath)),
  sourceSizeInputs: sizes.sourceFiles.length, builtSizeInputs: sizes.builtFiles.length,
  currentVsExpanded: changes, defaultRetriesVsReact: retryChange,
  gzipBytes: { defaultDOMClient: defaultClient, defaultClientTotal: defaultTotal, reactClientTotal: sizes.react.gz },
}
for (const result of [ordinary, reducers, ssr]) assert.equal(hash(readFileSync(result.path)), result.sha256, 'Raw measurements changed during audit')
output.verified = true
console.log(JSON.stringify(output, null, 2))
