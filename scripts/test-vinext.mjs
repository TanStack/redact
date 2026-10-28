import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { chromium, firefox, webkit } from 'playwright'
import { checkNext } from './next-browser-checks.mjs'
import { checkVinextEdges } from './vinext-edge-checks.mjs'
import { isExpectedVinextBoundaryLog } from './vinext-browser-errors.mjs'
import { prepareVinextFixture, prepareVinextPackage, vinextExample } from './prepare-vinext-fixture.mjs'
import { vinextEvidence } from './vinext-results.mjs'
import { startVinextTestGate } from './vinext-test-gate.mjs'

const require = createRequire(join(vinextExample, 'package.json'))
const pkg = JSON.parse(await readFile(join(vinextExample, 'package.json')))
const production = process.argv.includes('--production')
const standalone = process.argv.includes('--standalone')
const workers = !!process.env.VINEXT_TEST_WORKERS
assert.ok(!standalone || production, 'Standalone requires --production')
assert.ok(!standalone || !workers, 'Standalone and Workers are separate deployment targets')
const deployment = workers ? 'workers' : standalone ? 'standalone' : 'node'
const reference = !!process.env.VINEXT_TEST_REFERENCE
const cacheComponents = process.env.VINEXT_TEST_CACHE_COMPONENTS === '1'
const name = `${reference ? 'react' : 'redact'}-${production ? 'production' : 'development'}-${cacheComponents ? 'cache-components' : 'standard'}${deployment === 'node' ? '' : '-' + deployment}`
const gate = await startVinextTestGate()
const cwd = await prepareVinextFixture({ directory: process.env.VINEXT_TEST_DIR || join(vinextExample, '.fixtures', name), gateOrigin: gate.origin })
const packageRoot = process.env.VINEXT_TEST_PACKAGE || await prepareVinextPackage()
const evidence = await vinextEvidence(cwd, packageRoot)
const engines = (process.env.VINEXT_TEST_BROWSERS || 'chromium,firefox,webkit').split(',')
const browsers = { chromium, firefox, webkit }
for (const engine of engines) assert.ok(browsers[engine], `Unknown browser: ${engine}`)
const port = process.env.VINEXT_TEST_PORT || '4530'
// Keep the dev server and client on the same loopback address in containers.
const origin = `http://127.0.0.1:${port}${process.env.VINEXT_TEST_BASE_PATH || ''}`
const vite = resolve(dirname(require.resolve('vite/package.json')), 'bin/vite.js')
const vinext = join(vinextExample, 'node_modules/vinext/dist/cli.js')
const configuration = join(vinextExample, 'vite.config.mjs')
const env = { ...process.env, VINEXT_TEST_PACKAGE: packageRoot, VINEXT_TEST_DIR: cwd, NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_BASE_PATH: process.env.VINEXT_TEST_BASE_PATH || '', PORT: port, HOST: '127.0.0.1', ...(standalone ? { VINEXT_TEST_OUTPUT: 'standalone' } : {}) }
const output = resolve(process.env.VINEXT_TEST_RESULT || `benchmarks/results/vinext/${name}.json`)
await mkdir(dirname(output), { recursive: true })
const serverLog = createWriteStream(output.replace(/\.json$/, '.log'))
const children = new Set(), results = []
let logs = '', server, browser, failure
const started = Date.now()
const watchdog = setTimeout(() => {
  for (const child of children) child.kill('SIGTERM')
  console.error('Vinext verification timed out', logs.slice(-16000))
  process.exit(1)
}, 180_000 * (engines.length + Number(production)))
watchdog.unref()
function run(args, directory = vinextExample) {
  const child = spawn(process.execPath, args, { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] })
  children.add(child)
  child.once('exit', () => children.delete(child))
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { logs += data; serverLog.write(data) })
  return child
}
async function ready() {
  const deadline = Date.now() + 90_000
  while (true) {
    assert.equal(server.exitCode, null, logs.slice(-16000))
    assert.equal(server.signalCode, null, logs.slice(-16000))
    try { if ((await fetch(origin, { signal: AbortSignal.timeout(10000) })).ok) return } catch {}
    assert.ok(Date.now() < deadline, logs.slice(-16000))
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}
async function stopServer() {
  if (server && server.exitCode === null && server.signalCode === null) {
    const stopped = once(server, 'exit')
    server.kill('SIGTERM')
    const timer = setTimeout(() => server?.kill('SIGKILL'), 5000)
    try { await stopped } finally { clearTimeout(timer) }
  }
  server = null
}
try {
  if (production) {
    const child = run([vite, 'build', '--config', configuration])
    assert.equal((await once(child, 'exit'))[0], 0, logs.slice(-20000))
    server = run(workers ? [vite, 'preview', '--config', configuration, '--host', '127.0.0.1', '--port', port, '--strictPort'] : standalone ? [join(cwd, 'dist/standalone/server.js')] : [vinext, 'start', '--port', port], cwd)
    await ready()
  }
  for (const engine of engines) {
    const result = { framework: 'vinext', version: pkg.dependencies.vinext, reactVersion: pkg.dependencies.react, viteVersion: pkg.devDependencies.vite, rendering: cacheComponents ? 'cache-components' : 'standard', mode: production ? 'production' : 'development', deployment, browser: engine, reference, basePath: process.env.VINEXT_TEST_BASE_PATH || '' }
    const start = Date.now()
    try {
      if (!production) {
        server = run([vite, 'dev', '--config', configuration, '--host', '127.0.0.1', '--port', port, '--strictPort'])
        await ready()
      }
      browser = await browsers[engine].launch({ headless: true })
      result.browserVersion = browser.version()
      Object.assign(result, await checkNext({
        browser, origin, production, cwd, cacheComponents, reference,
        async beforeBoundaryReset(page) {
          if (production) return
          // Vinext displays caught development errors in a dismissible overlay.
          // Use its normal control before testing the application's reset button.
          await page.waitForLoadState('networkidle')
          const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true })
          if (await dismiss.isVisible()) await dismiss.click()
        },
        isExpectedBoundaryLog: message => isExpectedVinextBoundaryLog(message, origin),
      }))
      if (!process.env.NEXT_TEST_SCENARIOS) {
        result.scenarios.push(...await checkVinextEdges({ browser, origin, reference }))
        result.passed = result.scenarios.every(scenario => scenario.passed)
      }
    } catch (error) {
      Object.assign(result, { passed: false, error: error.stack || String(error) })
      console.error(logs.slice(-16000))
    } finally {
      result.durationMs = Date.now() - start
      results.push(result)
      console.log(`${result.passed ? 'PASS' : 'FAIL'} Vinext compatibility ${JSON.stringify(result)}`)
      if (!result.passed) process.exitCode = 1
      await browser?.close()
      browser = null
      if (!production) await stopServer()
    }
  }
} catch (error) {
  failure = error.stack || String(error)
  console.error(failure)
  process.exitCode = 1
} finally {
  await browser?.close()
  await stopServer()
  await gate.close()
  for (const child of children) child.kill('SIGTERM')
  clearTimeout(watchdog)
  await mkdir(dirname(output), { recursive: true })
  serverLog.end()
  await once(serverLog, 'finish')
  await writeFile(output, JSON.stringify({
    framework: 'vinext', version: pkg.dependencies.vinext, recordedAt: new Date().toISOString(), node: process.version,
    durationMs: Date.now() - started, evidence, results,
    complete: results.length === engines.length && results.every(result => result.scenarios?.length === 21 + Number(!production) + Number(cacheComponents)) && !process.env.NEXT_TEST_SCENARIOS,
    passed: !failure && results.length === engines.length && results.every(result => result.passed),
    ...(failure ? { error: failure } : {}),
  }, null, 2) + '\n')
}
