import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { resolve, join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, firefox, webkit } from 'playwright'
import { checkNext } from './next-browser-checks.mjs'
import { watchBrowserErrors } from './next-browser-errors.mjs'
import { vinextPackageEvidence, vinextInstallation } from './vinext-results.mjs'
import { collectVinextPagesCoverage } from './report-vinext-pages-coverage.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const consumer = process.env.VINEXT_TEST_CONSUMER
assert.ok(consumer, 'Prepare a fresh npm consumer with scripts/prepare-vinext-consumer.mjs first')
assert.ok(!process.env.NEXT_TEST_SCENARIOS, 'The Pages-only gate requires every Pages scenario')
const vinextVersion = JSON.parse(await readFile(join(consumer, 'node_modules/vinext/package.json'), 'utf8')).version
const require = createRequire(join(consumer, 'package.json'))
const vite = join(dirname(require.resolve('vite/package.json')), 'bin/vite.js')
const cli = join(consumer, 'node_modules/vinext/dist/cli.js')
const browsers = { chromium, firefox, webkit }
const engines = (process.env.VINEXT_TEST_BROWSERS || 'chromium,firefox,webkit').split(',')
for (const name of engines) assert.ok(browsers[name], `Unknown browser ${name}`)
const deployments = (process.env.VINEXT_TEST_PAGES_DEPLOYMENTS || 'node,standalone,static-export,workers').split(',')
for (const name of deployments) assert.ok(['node', 'standalone', 'static-export', 'workers'].includes(name))
const port = Number(process.env.VINEXT_TEST_PORT || 4970)
const output = resolve(process.env.VINEXT_TEST_PAGES_RESULTS || 'benchmarks/results/vinext-pages')
await mkdir(output, { recursive: true })
const packageRoot = join(consumer, 'node_modules/@tanstack/redact')
async function fingerprint(paths) {
  const hash = createHash('sha256')
  async function visit(path, name) {
    if ((await stat(path)).isDirectory()) for (const entry of (await readdir(path)).sort()) await visit(join(path, entry), name + '/' + entry)
    else hash.update(name).update(await readFile(path))
  }
  for (const [path, name] of paths) await visit(path, name)
  return hash.digest('hex')
}
async function captureEvidence() {
  return {
    ...await vinextPackageEvidence(packageRoot), installation: await vinextInstallation(consumer),
    suiteSha256: await fingerprint([
      ...['test-vinext-pages', 'report-vinext-pages-coverage', 'next-browser-checks', 'next-extended-checks', 'next-browser-errors', 'vinext-results'].map(name => [join(root, 'scripts', name + '.mjs'), name]),
      ...['package-lock.json', 'package-evidence.json'].map(name => [join(consumer, name), name]),
    ]),
    fixtureSha256: await fingerprint([
      ...['pages', 'public'].map(name => [join(root, 'examples/next-demo', name), name]),
      ...['package.json', 'wrangler.jsonc'].map(name => [join(consumer, name), name]),
    ]),
  }
}
const evidence = await captureEvidence()
const results = []

for (const deployment of deployments) for (const reference of [true, false]) {
  for (const mode of ['node', 'workers'].includes(deployment) ? ['development', 'production'] : ['production']) {
    const production = mode === 'production', workers = deployment === 'workers', staticExport = deployment === 'static-export'
    const name = `${reference ? 'react' : 'redact'}-${mode}-${deployment}`
    const cwd = join(consumer, '.pages-fixtures', name)
    const basePath = ['standalone', 'static-export'].includes(deployment) ? '/coverage' : ''
    const origin = `http://127.0.0.1:${port}${basePath}`
    await rm(cwd, { recursive: true, force: true }); await mkdir(cwd, { recursive: true })
    for (const folder of ['pages', 'public']) await cp(join(root, 'examples/next-demo', folder), join(cwd, folder), { recursive: true })
    if (staticExport) await rm(join(cwd, 'pages/legacy-data'), { recursive: true })
    else {
      await mkdir(join(cwd, 'pages/api'), { recursive: true })
      await writeFile(join(cwd, 'pages/api/runtime.js'), `import React from 'react'\nexport default function handler(req, res) { res.json({ version: React.version, redact: !!globalThis[Symbol.for('@tanstack/redact.ReactSharedInternals')] }) }\n`)
    }
    await writeFile(join(cwd, 'pages/index.jsx'), `export { default } from './legacy'\n`)
    await writeFile(join(cwd, 'package.json'), '{"type":"module","private":true}\n')
    await writeFile(join(cwd, 'next.config.mjs'), `export default ${JSON.stringify({ reactStrictMode: true, basePath, trailingSlash: !!basePath, ...(deployment === 'standalone' ? { output: 'standalone' } : staticExport ? { output: 'export' } : {}) })}\n`)
    if (workers) await cp(join(consumer, 'wrangler.jsonc'), join(cwd, 'wrangler.jsonc'))
    const config = join(cwd, 'vite.config.mjs')
    await writeFile(config, `import { defineConfig } from 'vite'\nimport vinext from 'vinext'\nimport { redact } from '@tanstack/redact/vinext'\nimport { cloudflare } from '@tanstack/redact/cloudflare'\nexport default defineConfig({ root: ${JSON.stringify(cwd)}, cacheDir: ${JSON.stringify(join(cwd, '.vite'))}, plugins: [vinext({appDir:${JSON.stringify(cwd)}}), ${workers ? `await cloudflare({configPath:${JSON.stringify(join(cwd, 'wrangler.jsonc'))},viteEnvironment:{name:'ssr'},inspectorPort:false,persistState:false,remoteBindings:false,tunnel:false}),` : ''} redact({renderer:${JSON.stringify(reference ? 'react' : 'redact')}})] })\n`)
    const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', NEXT_PUBLIC_BASE_PATH: basePath, NEXT_TELEMETRY_DISABLED: '1' }
    let server, http, browser, logs = '', failure
    const children = new Set()
    function run(args) {
      const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
      children.add(child); child.once('exit', () => children.delete(child))
      for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { logs += chunk })
      return child
    }
    async function stop() {
      if (server && server.exitCode === null && server.signalCode === null) {
        const done = once(server, 'exit'); server.kill('SIGTERM')
        const timer = setTimeout(() => server.kill('SIGKILL'), 5000)
        try { await done } finally { clearTimeout(timer) }
      }
      server = null
    }
    async function ready() {
      const end = Date.now() + 90000
      while (Date.now() < end) {
        if (server) { assert.equal(server.exitCode, null, logs.slice(-12000)); assert.equal(server.signalCode, null, logs.slice(-12000)) }
        try { if ((await fetch(origin + '/legacy', { signal: AbortSignal.timeout(10000) })).ok) return } catch {}
        await new Promise(done => setTimeout(done, 200))
      }
      throw new Error('Pages server did not start: ' + logs.slice(-12000))
    }
    const watchdog = setTimeout(() => { for (const child of children) child.kill('SIGTERM'); console.error(logs.slice(-16000)); process.exit(1) }, 420000)
    watchdog.unref()
    try {
      if (production) {
        assert.equal((await once(run([vite, 'build', '--config', config]), 'exit'))[0], 0, 'Pages build failed: ' + logs.slice(-12000))
        if (staticExport) {
          const assets = join(cwd, 'dist/client')
          http = createServer(async (request, response) => {
            try {
              const pathname = decodeURIComponent(new URL(request.url, origin).pathname)
              let file = resolve(assets, '.' + pathname)
              assert.ok(file.startsWith(assets + '/'))
              if ((await stat(file)).isDirectory()) file = join(file, 'index.html')
              response.setHeader('content-type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' })[extname(file)] || 'application/octet-stream')
              response.end(await readFile(file))
            } catch { response.writeHead(404).end('Not found') }
          })
          http.listen(port, '127.0.0.1'); await once(http, 'listening')
        } else server = run(workers ? [vite, 'preview', '--config', config, '--host', '127.0.0.1', '--port', String(port), '--strictPort'] : deployment === 'standalone' ? [join(cwd, 'dist/standalone/server.js')] : [cli, 'start', '--port', String(port)])
        await ready()
      }
      for (const engine of engines) {
        const record = { router: 'pages-only', deployment, reference, mode, browser: engine, basePath, scenarios: [] }
        try {
          if (!production) { server = run([vite, 'dev', '--config', config, '--host', '127.0.0.1', '--port', String(port), '--strictPort']); await ready() }
          browser = await browsers[engine].launch({ headless: true }); record.browserVersion = browser.version()
          Object.assign(record, await checkNext({ browser, origin, production, cwd, reference, scenarios: staticExport ? ['pages-router'] : ['pages-router', 'pages-data', 'server-runtime'] }))
          const page = await browser.newPage(), errors = [], observed = watchBrowserErrors(page, errors)
          await page.addInitScript(() => {
            const observer = new MutationObserver(() => {
              const button = document.querySelector('button')
              if (button && !window.__pagesServerButton) { window.__pagesServerButton = button; observer.disconnect() }
            })
            observer.observe(document, { subtree: true, childList: true })
          })
          const ssr = await (await page.request.get(origin + '/legacy')).text()
          assert.match(ssr, /<button/)
          await page.goto(origin + '/legacy')
          await page.waitForFunction(() => window.next?.router?.isReady)
          assert.equal(await page.evaluate(() => window.__pagesServerButton === document.querySelector('button')), true, 'Pages hydration must reuse the server button')
          await page.getByRole('button', { name: 'Count: 0', exact: true }).click()
          await page.getByRole('button', { name: 'Count: 1', exact: true }).waitFor()
          record.scenarios.push({ name: 'pages-hydration', passed: true })
          if (!production) {
            const file = join(cwd, 'pages/legacy.jsx'), original = await readFile(file, 'utf8')
            try { await writeFile(file, original.replace('Count: {count}', 'Clicks: {count}')); await page.getByRole('button', { name: 'Clicks: 1', exact: true }).waitFor() }
            finally { await writeFile(file, original) }
            await page.getByRole('button', { name: 'Count: 1', exact: true }).waitFor()
            record.scenarios.push({ name: 'pages-fast-refresh', passed: true })
          }
          if (staticExport) {
            await page.goto(origin + '/legacy-static/')
            await page.getByRole('heading', { name: 'Generated static props', exact: true }).waitFor()
            record.scenarios.push({ name: 'pages-static-props', passed: true })
          }
          await page.waitForLoadState('networkidle'); await observed.flush(); assert.deepEqual(errors, [])
          await page.close()
          record.passed = record.scenarios.every(s => s.passed)
        } catch (error) { Object.assign(record, { passed: false, error: error.stack || String(error) }) }
        finally { await browser?.close(); browser = null; if (!production) await stop(); results.push(record); console.log(record.passed ? 'PASS' : 'FAIL', name, engine, record.error || '') }
      }
    } catch (error) { failure = error.stack || String(error); console.error('FAIL', name, failure) }
    finally {
      await browser?.close(); await stop()
      if (http) { http.closeAllConnections(); await new Promise(done => http.close(done)) }
      for (const child of children) child.kill('SIGTERM')
      clearTimeout(watchdog)
      await writeFile(join(output, name + '.log'), logs)
      await writeFile(join(output, name + '.json'), JSON.stringify({ framework: 'vinext', version: vinextVersion, evidence, results: results.filter(r => r.deployment === deployment && r.reference === reference && r.mode === mode), ...(failure ? { error: failure } : {}) }, null, 2) + '\n')
    }
  }
}
assert.deepEqual(await captureEvidence(), evidence, 'The package, dependencies, or checks changed during Pages verification')
const report = await collectVinextPagesCoverage(output)
await writeFile(join(output, 'coverage.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ ...report.summary, complete: report.complete, passed: report.passed, issues: report.issues }))
if (!report.passed) process.exitCode = 1
