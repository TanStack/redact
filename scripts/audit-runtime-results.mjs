// Read-only result verification. --rebuild also rebuilds in memory and reconstructs
// declared baseline patches in temporary directories. Do not run during timings.
// BASELINE_PATCHES='{"before-new-apis":"benchmarks/pre-new-apis.patch"}' node scripts/audit-runtime-results.mjs benchmarks/results/new-apis-cpu1.json --rebuild
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, realpathSync, existsSync } from 'node:fs'
import { resolve, join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { gzipSync, brotliCompressSync } from 'node:zlib'

const root = fileURLToPath(new URL('..', import.meta.url))
const input = process.argv.slice(2).find(arg => !arg.startsWith('--'))
assert(input, 'Pass a completed runtime result JSON')
const rebuild = process.argv.includes('--rebuild')
const hash = value => createHash('sha256').update(value).digest('hex')
const bytes = readFileSync(resolve(root, input))
const data = JSON.parse(bytes)
assert.equal(data.schema, 1)
assert.equal(data.complete, true, 'Incomplete results cannot be audited as final')
const names = data.variants.map(v => v.name)
assert.equal(new Set(names).size, names.length, 'Duplicate variants')
const sourceOverrides = JSON.parse(process.env.SOURCE_OVERRIDES || '{}')
assert(sourceOverrides && !Array.isArray(sourceOverrides) && typeof sourceOverrides === 'object', 'SOURCE_OVERRIDES must map variant names to frozen source directories')
for (const [name, source] of Object.entries(sourceOverrides)) {
  assert(data.variants.some(v => v.name === name && v.source), `Unknown source override ${name}`)
  assert(typeof source === 'string' && source.length > 0, `Invalid source override ${name}`)
}
const sourceDirectory = variant => sourceOverrides[variant.name] ? resolve(root, sourceOverrides[variant.name]) : variant.source
function inputPath(variant, path) {
  const original = resolve(root, path)
  if (!sourceOverrides[variant.name]) return original
  const roots = [resolve(variant.source)]
  try { roots.push(realpathSync(variant.source)) } catch {}
  for (const source of roots) {
    const within = relative(source, original)
    if (within && within !== '..' && !within.startsWith('../') && !within.startsWith('/')) return resolve(sourceDirectory(variant), within)
  }
  return original
}
const { blocks, rounds, interactionRounds } = data.environment
for (const count of [blocks, rounds, interactionRounds]) assert(Number.isInteger(count) && count > 0)

const archivedRunner = `benchmarks/runners/${data.environment.runnerSHA256}.mjs`
for (const [field, file] of Object.entries({
  fixtureSHA256: 'benchmarks/runtime-workloads.ts',
  runnerSHA256: existsSync(resolve(root, archivedRunner)) ? archivedRunner : 'scripts/compare-runtime.mjs',
  statsSHA256: 'benchmarks/stats.mjs',
  referenceLockSHA256: 'benchmarks/reference/package-lock.json',
})) assert.equal(hash(readFileSync(resolve(root, file))), data.environment[field], `${field} no longer matches`)

for (const variant of data.variants) {
  assert.equal(hash(JSON.stringify(variant.inputs)), variant.inputSHA256, `${variant.name} input manifest hash`)
  assert.deepEqual(variant.inputs.map(i => i.path), variant.inputs.map(i => i.path).sort())
  for (const entry of variant.inputs) assert.equal(hash(readFileSync(inputPath(variant, entry.path))), entry.sha256, `${variant.name}: ${entry.path}`)
}
const react = data.variants.find(v => v.name === 'react')
const control = data.variants.find(v => v.name === 'react-control')
assert(react && control, 'This audit requires an identical React control')
assert.equal(react.bundleSHA256, control.bundleSHA256, 'React control bundle differs')
assert.deepEqual(react.inputs, control.inputs)
assert.deepEqual(react.fixtureBundle, control.fixtureBundle)

// Independent implementation, deliberately do not import benchmarks/stats.mjs.
function percentile(values, fraction) {
  if (!values.length) return null
  const sorted = values.toSorted((a, b) => a - b)
  const location = (sorted.length - 1) * fraction
  const lower = Math.floor(location)
  return sorted[lower] + (sorted[Math.ceil(location)] - sorted[lower]) * (location - lower)
}
function summary(values) {
  return { n: values.length, median: percentile(values, .5), p95: percentile(values, .95), min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null }
}
function compare(candidate, baseline) {
  const logRatios = candidate.map((block, b) => block.map((sample, r) => Math.log(sample.durationMs / baseline[b][r].durationMs)))
  const estimate = logs => 100 * Math.expm1(percentile(logs, .5))
  let interval = null
  if (logRatios.length >= 3) {
    let seed = 20260909
    const distribution = []
    for (let sample = 0; sample < 5000; sample++) {
      const logs = []
      for (let block = 0; block < logRatios.length; block++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        logs.push(...logRatios[Math.floor(seed / 4294967296 * logRatios.length)])
      }
      distribution.push(estimate(logs))
    }
    interval = [percentile(distribution, .025), percentile(distribution, .975)]
  }
  return { pairedTimeChangePercent: estimate(logRatios.flat()), blockBootstrap95CI: interval, independentBlocks: logRatios.length }
}
function equivalent(actual, expected, label) {
  if (typeof expected === 'number') {
    assert(Number.isFinite(actual) && Number.isFinite(expected), `${label}: non-finite statistic`)
    assert(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${label}: ${actual} != ${expected}`)
  } else if (expected === null) assert.equal(actual, null, label)
  else {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${label} keys`)
    for (const key of Object.keys(expected)) equivalent(actual[key], expected[key], `${label}.${key}`)
  }
}
function matrix(samples, width, label) {
  assert.equal(samples.length, blocks, `${label}: block count`)
  for (const block of samples) assert.equal(block.length, width, `${label}: round count`)
}

const totals = { throughputSamples: 0, throughputChecks: 0, completedOperations: 0, interactionSamples: 0, interactionChecks: 0, observedClickEntries: 0, memoryCycles: 0 }
const comparisons = {}
for (const [workload, work] of Object.entries(data.throughput)) {
  assert.deepEqual(Object.keys(work.samples).sort(), [...names].sort())
  assert.equal(work.iterations, data.calibration[workload].iterations, `${workload} calibrated iterations`)
  assert(Number.isInteger(work.iterations) && work.iterations > 0)
  for (const name of names) {
    const samples = work.samples[name]
    matrix(samples, rounds, `${workload}/${name}`)
    for (const sample of samples.flat()) {
      assert(sample.durationMs > 0 && Number.isFinite(sample.durationMs))
      assert.equal(sample.iterations, work.iterations)
      assert(sample.operations > 0 && sample.checks > 0)
      assert(Number.isInteger(sample.checks))
      totals.throughputSamples++; totals.throughputChecks += sample.checks; totals.completedOperations += sample.operations
    }
    for (let b = 0; b < blocks; b++) for (let r = 0; r < rounds; r++) {
      assert.equal(samples[b][r].operations, work.samples.react[b][r].operations, `${workload}/${name} equal completed work`)
      assert.equal(samples[b][r].checks, work.samples.react[b][r].checks, `${workload}/${name} equal check count`)
    }
    equivalent(work.summary[name], summary(samples.flat().map(s => s.durationMs / work.iterations)), `${workload}/${name} summary`)
  }
  assert.deepEqual(Object.keys(work.comparisons).sort(), names.filter(name => !['current', 'react-control'].includes(name)).sort())
  for (const [baseline, candidates] of Object.entries(work.comparisons)) {
    assert.deepEqual(Object.keys(candidates).sort(), names.filter(name => name !== baseline).sort())
    for (const [candidate, recorded] of Object.entries(candidates)) equivalent(recorded, compare(work.samples[candidate], work.samples[baseline]), `${workload}/${baseline}/${candidate}`)
  }
  comparisons[workload] = Object.fromEntries(Object.entries(work.comparisons).map(([baseline, candidates]) => [baseline, candidates.current]))
}

for (const [scenario, interactions] of Object.entries(data.interactions)) for (const name of names) {
  matrix(interactions[name], interactionRounds, `${scenario}/${name}`)
  const samples = interactions[name].flat()
  for (const sample of samples) {
    assert(sample.checks > 0 && sample.validation.checks > 0)
    assert.equal(sample.validation.finishedRows, sample.expectedRows)
    assert(sample.commitMs >= sample.handlerStartMs && sample.nextFrameMs >= sample.commitMs)
    totals.interactionSamples++; totals.interactionChecks += sample.checks + sample.validation.checks
  }
  const events = samples.flatMap(s => s.events.filter(e => e.name === 'click' && e.interactionId > 0 && e.startTime >= (s.eventTimeStamp ?? s.handlerStartMs) - 1))
  const recalculated = {
    handlerToCommitMs: summary(samples.map(s => s.handlerToCommitMs)),
    handlerToNextFrameMs: summary(samples.map(s => s.handlerToNextFrameMs)),
    observedClickDurationMs: summary(events.map(e => e.duration)),
    clickSamples: samples.length, observedClickEntries: events.length,
    longTaskCount: samples.reduce((count, s) => count + s.longTasks.filter(t => t.startTime + t.duration >= s.eventTimeStamp && t.startTime <= s.nextFrameMs).length, 0),
  }
  equivalent(interactions.summary[name], recalculated, `${scenario}/${name}`)
  totals.observedClickEntries += events.length
}
if (Object.keys(data.memory).length) assert.deepEqual(Object.keys(data.memory).sort(), [...names].sort())
for (const [name, measurements] of Object.entries(data.memory)) {
  assert(names.includes(name)); assert.equal(measurements.length, blocks)
  measurements.forEach((block, index) => {
    assert.equal(block.block, index); assert.equal(block.cycles.length, 3)
    for (const cycle of block.cycles) {
      assert.equal(cycle.mountedDeltaBytes, cycle.mounted.usedSize - block.baseline.usedSize)
      assert.equal(cycle.unmountedDeltaBytes, cycle.unmounted.usedSize - block.baseline.usedSize)
      totals.memoryCycles++
    }
  })
}

function treeManifest(directory) {
  const entries = []
  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = join(path, entry.name)
      if (entry.isDirectory()) visit(file)
      else { assert(entry.isFile(), `Unexpected non-file in source: ${file}`); entries.push({ path: relative(directory, file), sha256: hash(readFileSync(file)) }) }
    }
  }
  visit(directory)
  return entries.sort((a, b) => a.path.localeCompare(b.path))
}
const reconstructed = {}
const patches = JSON.parse(process.env.BASELINE_PATCHES || '{}')
if (Object.keys(patches).length) assert(rebuild, 'Baseline reconstruction requires --rebuild, run only after timings')
if (rebuild) {
  for (const [name, patch] of Object.entries(patches)) {
    const variant = data.variants.find(v => v.name === name)
    assert(variant?.source, `Unknown source baseline ${name}`)
    const prepared = spawnSync(process.execPath, ['scripts/prepare-perf-baseline.mjs'], { cwd: root, encoding: 'utf8', env: { ...process.env, BASELINE_PATCH: patch } })
    assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout)
    let source = prepared.stdout.trim()
    if (variant.entryExtension === 'js') {
      const built = spawnSync(process.execPath, ['scripts/build.mjs'], {
        cwd: root, encoding: 'utf8', env: { ...process.env, BUILD_PACKAGE_ROOT: dirname(source) },
      })
      assert.equal(built.status, 0, built.stderr || built.stdout)
      source = join(dirname(source), 'dist')
    }
    const actual = treeManifest(sourceDirectory(variant))
    assert.deepEqual(treeManifest(source), actual, `${name} reconstructed source differs`)
    const reconstructedPackage = readFileSync(join(dirname(source), 'package.json'))
    const sourcePackage = readFileSync(join(dirname(sourceDirectory(variant)), 'package.json'))
    const packageA = JSON.parse(reconstructedPackage)
    const packageB = JSON.parse(sourcePackage)
    assert.deepEqual(packageA, packageB, `${name} package metadata differs`)
    // Conditional export/import key ordering affects resolution even when
    // ordinary package field ordering and whitespace do not.
    for (const key of ['exports', 'imports']) assert.equal(JSON.stringify(packageA[key]), JSON.stringify(packageB[key]), `${name} ${key} ordering differs`)
    reconstructed[name] = {
      tree: variant.entryExtension === 'js' ? 'dist' : 'src',
      sourceSHA256: hash(JSON.stringify(actual)), files: actual.length,
      patchSHA256: hash(readFileSync(resolve(root, patch))),
      sourcePackageSHA256: hash(sourcePackage), reconstructedPackageSHA256: hash(reconstructedPackage),
      packageByteIdentical: sourcePackage.equals(reconstructedPackage),
    }
  }
  const { build, version } = await import('esbuild')
  assert.equal(version, data.environment.esbuild, 'esbuild version changed')
  const reference = createRequire(resolve(root, 'benchmarks/reference/package.json'))
  for (const variant of data.variants) {
    const paths = variant.kind === 'react'
      ? Object.fromEntries(['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'react-dom/server'].map(name => [name, reference.resolve(name === 'react-dom/server' ? 'react-dom/server.browser' : name)]))
      : Object.fromEntries(Object.entries({ react: 'react/index', 'react/jsx-runtime': 'react/jsx-runtime', 'react-dom': 'dom/index', 'react-dom/client': 'dom/client', 'react-dom/server': 'server/index' }).map(([name, file]) => [name, resolve(variant.source, `${file}.${variant.entryExtension || 'ts'}`)]))
    const result = await build({
      entryPoints: [resolve(root, 'benchmarks/runtime-workloads.ts')], bundle: true, write: false, minify: true, metafile: true,
      platform: 'browser', format: 'iife', target: 'es2022', tsconfigRaw: { compilerOptions: {} }, define: { 'process.env.NODE_ENV': '"production"' },
      plugins: [{ name: 'audit-renderer', setup(b) {
        b.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, args => { assert(paths[args.path], `Unmapped renderer import ${args.path}`); return { path: paths[args.path] } })
        if (sourceOverrides[variant.name]) b.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, args => {
          const frozen = inputPath(variant, args.path)
          if (frozen === args.path) return
          const extension = args.path.split('.').at(-1)
          const loader = extension === 'tsx' ? 'tsx' : extension === 'ts' || extension === 'mts' || extension === 'cts' ? 'ts' : 'js'
          return { contents: readFileSync(frozen, 'utf8'), loader, resolveDir: dirname(args.path) }
        })
      } }],
    })
    assert(!result.warnings.some(w => w.id === 'ignored-bare-import'), 'Side-effect import was removed')
    const bundle = result.outputFiles[0].contents
    assert.equal(hash(bundle), variant.bundleSHA256, `${variant.name} rebuilt bundle differs`)
    assert.deepEqual({ raw: bundle.length, gzip: gzipSync(bundle).length, brotli: brotliCompressSync(bundle).length }, variant.fixtureBundle, `${variant.name} rebuilt sizes`)
  }
}
console.log(JSON.stringify({ result: resolve(root, input), resultSHA256: hash(bytes), verified: true, rebuilt: rebuild, variants: names, sourceOverrides, blocks, rounds, workloads: Object.keys(data.throughput).length, totals, reconstructed, comparisons }, null, 2))
