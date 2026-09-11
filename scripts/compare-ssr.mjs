// npm ci --prefix benchmarks/reference --ignore-scripts
// node scripts/compare-ssr.mjs
// BLOCKS=5 ROUNDS=5 TARGET_MS=80 OUTPUT=/tmp/node-ssr.json node scripts/compare-ssr.mjs
// EXTRA_SOURCE=/path/to/pre-performance/src adds an independent source baseline.
// CURRENT_SOURCE=/path/to/candidate/src measures a frozen candidate without editing the checkout.
import { build, version as esbuildVersion } from 'esbuild'
import { fork, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { cpus, release, platform, arch, tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { summarize, compareBlocks, random, shuffle } from '../benchmarks/stats.mjs'

if (process.argv[2] === '--child') {
  const loaded = await import(pathToFileURL(process.argv[3]).href)
  const workload = loaded.default ?? loaded
  process.on('message', async message => {
    if (message.type !== 'run') return
    try {
      const result = await workload.run(message.name, message.iterations)
      process.send({ id: message.id, result })
    } catch (error) {
      process.send({ id: message.id, error: error?.stack || String(error) })
    }
  })
  process.send({ ready: true, list: workload.list, pid: process.pid })
} else {
  await main()
}

async function main() {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const reference = createRequire(resolve(root, 'benchmarks/reference/package.json'))
  const tests = createRequire(resolve(root, 'tests/package.json'))
  const { JSDOM } = tests('jsdom')
  const fixture = resolve(root, 'benchmarks/ssr-workload.ts')
  const runner = fileURLToPath(import.meta.url)
  const positive = (key, fallback, integer = false) => {
    const value = Number(process.env[key] || fallback)
    if (!(value >= 1 && Number.isFinite(value)) || (integer && !Number.isInteger(value))) throw new Error(`${key} must be a positive ${integer ? 'integer' : 'number'}`)
    return value
  }
  const blocks = positive('BLOCKS', 5, true)
  const rounds = positive('ROUNDS', 5, true)
  const targetMs = positive('TARGET_MS', 80)
  const output = resolve(process.env.OUTPUT || 'benchmarks/results/node-ssr-comparison.json')
  const hash = data => createHash('sha256').update(data).digest('hex')
  const pkgPath = name => resolve(root, 'benchmarks/reference/node_modules', name, 'package.json')
  const pkg = name => JSON.parse(readFileSync(pkgPath(name), 'utf8'))
  const pinned = JSON.parse(readFileSync(resolve(root, 'benchmarks/reference/package.json'), 'utf8')).dependencies
  for (const name of ['react', 'react-dom', '@tanstack/redact']) {
    if (pkg(name).version !== pinned[name]) throw new Error(`${name} install does not match pinned reference ${pinned[name]}`)
  }
  const extraName = process.env.EXTRA_NAME || 'pre-performance'
  if (['react', 'react-control', 'published', 'current'].includes(extraName)) throw new Error('Reserved EXTRA_NAME')
  const variants = [
    { name: 'react', version: pkg('react').version, kind: 'react' },
    ...(process.env.REACT_CONTROL === '1' ? [{ name: 'react-control', version: pkg('react').version, kind: 'react' }] : []),
    { name: 'published', version: pkg('@tanstack/redact').version, source: resolve(dirname(pkgPath('@tanstack/redact')), 'src') },
    ...(process.env.EXTRA_SOURCE ? [{ name: extraName, source: resolve(process.env.EXTRA_SOURCE) }] : []),
    { name: 'current', version: process.env.CURRENT_SOURCE ? undefined : JSON.parse(readFileSync(resolve(root, 'packages/redact/package.json'), 'utf8')).version, source: resolve(process.env.CURRENT_SOURCE || resolve(root, 'packages/redact/src')) },
  ]
  const temp = mkdtempSync(join(tmpdir(), 'redact-node-ssr-'))
  const result = {
    schema: 1,
    environment: {
      date: new Date().toISOString(), node: process.version, versions: process.versions,
      esbuild: esbuildVersion, os: `${platform()} ${release()}`, architecture: arch(),
      cpu: cpus()[0]?.model, logicalCpus: cpus().length,
      blocks, rounds, targetMs, seed: 20260909,
      fixtureSHA256: hash(readFileSync(fixture)), runnerSHA256: hash(readFileSync(runner)),
      statsSHA256: hash(readFileSync(resolve(root, 'benchmarks/stats.mjs'))),
      referenceLockSHA256: hash(readFileSync(resolve(root, 'benchmarks/reference/package-lock.json'))),
      gitHEAD: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    },
    method: {
      timing: 'Production Node bundles using the automatic JSX factory. Timers run inside the renderer child and exclude IPC, output validation, startup, and warmup. GC is not forced.',
      order: 'A fresh child process per renderer per block. Exactly one child runs work at a time. Seeded workload order and rotating randomized renderer order per round.',
      calibration: 'Same iteration count for every renderer, targeting the fastest measured renderer. Calibration is excluded from reported samples.',
      validation: 'Every final output and expectation are SHA256 checked outside child timing. Previously unseen output/expectation pairs are parsed in the parent. Successful semantic checks are cached to avoid repeated parent parser allocation. Checks cover text, attributes, row order, and unique hook IDs, not serialization spelling.',
      readableStream: 'Fully-ready render, await allReady, consume through EOF, and decode all output. No suspense or shell-only timings.',
      intervals: '95% percentile bootstrap of paired log-time ratios, resampling whole process blocks. Does not estimate request latency, network throughput, or production server capacity.',
    },
    variants: [], calibration: {}, throughput: {}, complete: false,
  }
  const save = () => { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(result, null, 2) + '\n') }
  const rng = random(20260909)
  const bundles = new Map()
  const children = new Set()
  try {
    for (const variant of variants) {
      const paths = variant.kind === 'react' ? {
        react: reference.resolve('react'),
        'react-dom': reference.resolve('react-dom'),
        'react/jsx-runtime': reference.resolve('react/jsx-runtime'),
        'react-dom/server': reference.resolve('react-dom/server.node'),
      } : {
        react: resolve(variant.source, 'react/index.ts'),
        'react-dom': resolve(variant.source, 'dom/index.ts'),
        'react/jsx-runtime': resolve(variant.source, 'react/jsx-runtime.ts'),
        'react-dom/server': resolve(variant.source, 'server/index.ts'),
      }
      const built = await build({
        absWorkingDir: root, entryPoints: [fixture], bundle: true, write: false, minify: true, metafile: true,
        platform: 'node', format: 'cjs', target: 'node22', tsconfigRaw: {},
        define: { 'process.env.NODE_ENV': '"production"' },
        plugins: [{ name: 'renderer', setup(b) {
          b.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, args => {
            if (paths[args.path]) return { path: paths[args.path] }
            throw new Error('Unmapped renderer import: ' + args.path)
          })
        } }],
      })
      const bytes = built.outputFiles[0].contents
      const bundlePath = resolve(temp, variant.name + '.cjs')
      writeFileSync(bundlePath, bytes)
      bundles.set(variant.name, bundlePath)
      const inputs = Object.keys(built.metafile.inputs).sort().map(path => ({ path, sha256: hash(readFileSync(resolve(root, path))) }))
      result.variants.push({ ...variant, bundleSHA256: hash(bytes), inputSHA256: hash(JSON.stringify(inputs)), inputs, fixtureBundleBytes: bytes.length })
    }

    const validationCache = new Map()
    function validate(sample) {
      if (!(sample.durationMs > 0) || sample.diagnostics.streamErrors !== 0) throw new Error('Invalid SSR completion')
      const outputSHA256 = hash(sample.html)
      const expectationSHA256 = hash(JSON.stringify(sample.expected))
      const cacheKey = outputSHA256 + ':' + expectationSHA256
      const { html, expected: _, ...raw } = sample
      const cachedChecks = validationCache.get(cacheKey)
      if (cachedChecks !== undefined) return { ...raw, checks: cachedChecks, outputSHA256, expectationSHA256, outputCharacters: html.length, validationCacheHit: true }
      const document = JSDOM.fragment(html)
      const { expected } = sample
      const lists = document.querySelectorAll('ul')
      if (lists.length !== 1 || lists[0].getAttribute('data-fixture') !== expected.fixture) throw new Error('SSR fixture structure mismatch')
      const rows = Array.from(lists[0].querySelectorAll('li'))
      if (rows.length !== expected.rows.length) throw new Error('SSR row count mismatch')
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const wanted = expected.rows[i]
        if (row.getAttribute('data-id') !== String(wanted.id) || row.textContent !== wanted.text) throw new Error('SSR row content/order mismatch at ' + i)
        if (wanted.title !== undefined && row.getAttribute('title') !== wanted.title) throw new Error('SSR escaped attribute mismatch at ' + i)
        if (wanted.scope !== undefined && row.getAttribute('data-scope') !== wanted.scope) throw new Error('SSR context attribute mismatch at ' + i)
      }
      if (expected.uniqueIds && (rows.some(row => !row.id) || new Set(rows.map(row => row.id)).size !== rows.length)) throw new Error('SSR hook IDs not unique')
      if (document.querySelector('script,style,template')) throw new Error('Unexpected active SSR markup')
      const checks = rows.length + 3
      validationCache.set(cacheKey, checks)
      return { ...raw, checks, outputSHA256, expectationSHA256, outputCharacters: html.length, validationCacheHit: false }
    }

    async function startChild(variant) {
      const child = fork(runner, ['--child', bundles.get(variant.name)], {
        cwd: root, env: { ...process.env, NODE_ENV: 'production' },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      })
      children.add(child)
      let stderr = ''
      let stdout = ''
      child.stderr.on('data', chunk => { stderr += chunk })
      child.stdout.on('data', chunk => { stdout += chunk })
      let nextId = 0
      const waiting = new Map()
      let readyResolve
      let readyReject
      const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject })
      const startupTimer = setTimeout(() => { child.kill(); readyReject(new Error('SSR child startup timed out')) }, 30000)
      child.on('message', message => {
        if (message.ready) { clearTimeout(startupTimer); readyResolve(message); return }
        const request = waiting.get(message.id)
        if (!request) return
        waiting.delete(message.id)
        clearTimeout(request.timer)
        if (message.error) request.reject(new Error(message.error))
        else request.resolve(message.result)
      })
      child.on('error', error => {
        clearTimeout(startupTimer)
        readyReject(error)
        for (const request of waiting.values()) { clearTimeout(request.timer); request.reject(error) }
        waiting.clear()
      })
      child.on('exit', (code, signal) => {
        children.delete(child)
        clearTimeout(startupTimer)
        const error = new Error(`SSR child ${variant.name} exited (${code}, ${signal}): ${stderr || stdout}`)
        readyReject(error)
        for (const request of waiting.values()) { clearTimeout(request.timer); request.reject(error) }
        waiting.clear()
      })
      const metadata = await ready
      return {
        ...metadata,
        async run(name, iterations) {
          const id = ++nextId
          const sample = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              waiting.delete(id)
              child.kill()
              reject(new Error(`SSR workload ${name} timed out`))
            }, 60000)
            waiting.set(id, { resolve, reject, timer })
            child.send({ type: 'run', id, name, iterations })
          })
          if (sample.name !== name || sample.iterations !== iterations) throw new Error('SSR child returned mismatched workload')
          return validate(sample)
        },
        close() { child.kill() },
      }
    }

    for (let block = 0; block < blocks; block++) {
      const processes = new Map()
      try {
        for (const variant of shuffle(variants, rng)) processes.set(variant.name, await startChild(variant))
        const list = processes.get('react').list
        for (const variant of variants) if (JSON.stringify(processes.get(variant.name).list) !== JSON.stringify(list)) throw new Error('SSR workload lists differ')
        const selected = list.filter(work => !process.env.WORKLOADS || process.env.WORKLOADS.split(',').includes(work.name))
        if (!selected.length) throw new Error('No SSR workloads matched')
        for (const work of shuffle(selected, rng)) {
          const baseOrder = shuffle(variants, rng)
          if (!result.calibration[work.name]) {
            const samples = {}
            for (const variant of baseOrder) {
              const child = processes.get(variant.name)
              await child.run(work.name, work.defaultIterations)
              samples[variant.name] = await child.run(work.name, work.defaultIterations)
            }
            const fastest = Math.min(...Object.values(samples).map(sample => sample.durationMs / work.defaultIterations))
            const slowest = Math.max(...Object.values(samples).map(sample => sample.durationMs / work.defaultIterations))
            const iterations = Math.max(1, Math.min(100000, Math.ceil(targetMs / fastest), Math.floor(2000 / slowest)))
            result.calibration[work.name] = { ...work, iterations, samples, targetCapped: iterations * fastest < targetMs }
          }
          const { iterations } = result.calibration[work.name]
          const data = result.throughput[work.name] ||= { mode: work.mode, iterations, samples: Object.fromEntries(variants.map(v => [v.name, []])), processIDs: Object.fromEntries(variants.map(v => [v.name, []])) }
          for (const variant of baseOrder) {
            const child = processes.get(variant.name)
            data.samples[variant.name][block] = []
            data.processIDs[variant.name][block] = child.pid
            for (let warm = 0; warm < 3; warm++) await child.run(work.name, iterations)
          }
          for (let round = 0; round < rounds; round++) {
            const order = [...baseOrder.slice(round % baseOrder.length), ...baseOrder.slice(0, round % baseOrder.length)]
            for (const variant of order) data.samples[variant.name][block].push(await processes.get(variant.name).run(work.name, iterations))
          }
          console.log(`SSR block ${block + 1}/${blocks}: ${work.name}`, Object.fromEntries(variants.map(v => [v.name, summarize(data.samples[v.name][block].map(sample => sample.durationMs)).median.toFixed(2)])))
          save()
        }
      } finally { for (const child of processes.values()) child.close() }
    }
    for (const data of Object.values(result.throughput)) {
      data.summary = Object.fromEntries(variants.map(v => [v.name, summarize(data.samples[v.name].flat().map(sample => sample.durationMs / data.iterations))]))
      data.comparisons = Object.fromEntries(['react', 'published', ...(process.env.EXTRA_SOURCE ? [extraName] : [])].map(reference => [reference,
        Object.fromEntries(variants.filter(v => v.name !== reference).map(v => [v.name, compareBlocks(data.samples[v.name].map(block => block.map(sample => sample.durationMs)), data.samples[reference].map(block => block.map(sample => sample.durationMs)))])),
      ]))
    }
    result.complete = true
    save()
    console.log('Saved ' + output)
  } catch (error) {
    result.error = error?.stack || String(error)
    save()
    throw error
  } finally {
    for (const child of children) child.kill()
    rmSync(temp, { recursive: true, force: true })
  }
}
