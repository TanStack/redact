import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, firefox, webkit } from 'playwright'
import { prepareVinextFixture } from './prepare-vinext-fixture.mjs'
import { checkNext } from './next-browser-checks.mjs'
import { checkVinextEdges } from './vinext-edge-checks.mjs'
import { isExpectedVinextBoundaryLog } from './vinext-browser-errors.mjs'
import { watchBrowserErrors } from './next-browser-errors.mjs'
import { vinextEvidence, vinextInstallation, vinextPackageEvidence } from './vinext-results.mjs'

assert.ok(process.argv.includes('--deploy'), 'Hosted verification creates public Workers. Pass --deploy explicitly.')
assert.match(process.env.CLOUDFLARE_ACCOUNT_ID || '', /^[a-f0-9]{32}$/, 'Set the selected Cloudflare account explicitly')
const consumer = process.env.VINEXT_TEST_CONSUMER
assert.ok(consumer, 'Prepare a fresh npm consumer first')
assert.equal(await vinextInstallation(consumer), 'npm-tarball', 'Hosted release checks require an unpatched npm consumer')
assert.ok(!process.env.NEXT_TEST_SCENARIOS && !process.env.VINEXT_TEST_BROWSERS, 'Hosted verification requires every scenario and browser')
const prefix = process.env.VINEXT_HOSTED_PREFIX || `redact-vinext-${Date.now().toString(36)}`
assert.match(prefix, /^redact-vinext-[a-z0-9-]{1,28}$/)
const require = createRequire(join(consumer, 'package.json'))
const vite = join(dirname(require.resolve('vite/package.json')), 'bin/vite.js')
const wrangler = join(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js')
const packageRoot = join(consumer, 'node_modules/@tanstack/redact')
const packageEvidence = await vinextPackageEvidence(packageRoot)
const packageLockSha256 = createHash('sha256').update(await readFile(join(consumer, 'package-lock.json'))).digest('hex')
const repo = fileURLToPath(new URL('..', import.meta.url))
const directory = join(consumer, '.hosted', prefix)
const output = resolve(process.env.VINEXT_HOSTED_RESULTS || 'benchmarks/results/vinext-hosted')
await mkdir(directory, { recursive: true }); await mkdir(output, { recursive: true })
const report = {
  recordedAt: new Date().toISOString(), node: process.version, deployment: 'cloudflare-hosted',
  installation: 'npm-tarball', ...packageEvidence, packageLockSha256,
  verificationSha256: createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).update(await readFile(join(repo, 'scripts/vinext-hosted-state.mjs'))).update(await readFile(join(repo, 'scripts/vinext-hosted-cache.mjs'))).update(await readFile(join(repo, 'scripts/test-vinext-hosted-state.mjs'))).digest('hex'),
  prefix, deployments: [], results: [], complete: false, passed: false,
}
const save = async () => writeFile(join(output, 'coverage.json'), JSON.stringify(report, null, 2) + '\n')
async function run(args, cwd, name, extra = {}) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...extra, WRANGLER_SEND_METRICS: 'false', NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let text = ''
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { text += chunk })
  const timer = setTimeout(() => child.kill('SIGTERM'), 240000)
  let code
  try { [code] = await once(child, 'exit') } finally { clearTimeout(timer) }
  await writeFile(join(output, name + '.log'), text)
  assert.equal(code, 0, `${name} failed:\n${text.slice(-12000)}`)
  return text
}
async function deploy(config, cwd, name) {
  const log = await run([wrangler, 'deploy', '--config', config, '--name', name], cwd, `${name}-deploy`)
  const origin = log.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/)?.[0]
  assert.ok(origin, `Missing deployment URL in ${name}`)
  const versionId = log.match(/Current Version ID:\s*(\S+)/)?.[1]
  assert.ok(versionId, `Missing version ID in ${name}`)
  const deployed = { name, origin, versionId }
  report.deployments.push(deployed); await save()
  console.log('DEPLOYED', JSON.stringify(deployed))
  return origin
}
async function ready(origin, contentType, expectedVersion) {
  const deadline = Date.now() + 60000
  let last = 'No response'
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(10000) })
      const body = await response.text()
      last = `${response.status}: ${body.slice(0,200)}`
      if (response.ok && response.headers.get('content-type')?.includes(contentType) && (!expectedVersion || JSON.parse(body).version === expectedVersion)) return
    } catch (error) { last = String(error) }
    await new Promise(done => setTimeout(done, 1000))
  }
  throw new Error('Hosted deployment did not become ready: ' + last)
}
async function sharedCacheInvalidation(browser, origin) {
  const page = await browser.newPage(), errors = [], observed = watchBrowserErrors(page, errors)
  const id = randomUUID(), url = origin + '/mutations?id=' + id
  const read = async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
    assert.equal(response.status, 200)
    return (await response.text()).match(/data-testid="cached-record">([^<]*)/)?.[1]
  }
  try {
    await page.goto(url)
    await page.waitForFunction(() => document.querySelector('main[data-ready="true"]'))
    assert.deepEqual(await Promise.all(Array.from({ length: 12 }, read)), Array(12).fill('initial'))
    await page.getByRole('textbox', { name: 'Record', exact: true }).fill(id)
    await page.getByRole('button', { name: 'Update cached record', exact: true }).click()
    await page.getByTestId('cached-record').getByText(id, { exact: true }).waitFor()
    assert.deepEqual(await Promise.all(Array.from({ length: 12 }, read)), Array(12).fill(id), 'Concurrent server requests must see the invalidated record')
    await page.reload()
    await page.waitForFunction(() => document.querySelector('main[data-ready="true"]'))
    assert.equal(await page.getByTestId('cached-record').textContent(), id)
    await page.waitForLoadState('networkidle'); await observed.flush(); assert.deepEqual(errors, [])
    return { name: 'hosted-cache-invalidation', passed: true, concurrentReads: 12 }
  } catch (error) { return { name: 'hosted-cache-invalidation', passed: false, error: error.stack || String(error) } }
  finally { await observed.navigate(() => page.close()) }
}
async function pagesHydration(browser, origin, reference) {
  const page = await browser.newPage(), errors = [], observed = watchBrowserErrors(page, errors)
  try {
    await page.addInitScript(() => {
      const observer = new MutationObserver(() => {
        const button = document.querySelector('button')
        if (button && !window.__pagesServerButton) { window.__pagesServerButton = button; observer.disconnect() }
      })
      observer.observe(document, { subtree: true, childList: true })
    })
    assert.match(await (await page.request.get(origin + '/legacy')).text(), /<button/)
    await page.goto(origin + '/legacy')
    await page.waitForFunction(() => window.next?.router?.isReady)
    assert.equal(await page.evaluate(() => window.__pagesServerButton === document.querySelector('button')), true, 'Pages hydration must reuse the server button')
    assert.equal(await page.evaluate(() => !!globalThis[Symbol.for('@tanstack/redact.ReactSharedInternals')]), !reference)
    await page.getByRole('button', { name: 'Count: 0', exact: true }).click()
    await page.getByRole('button', { name: 'Count: 1', exact: true }).waitFor()
    await page.waitForLoadState('networkidle'); await observed.flush(); assert.deepEqual(errors, [])
    return { name: 'pages-hydration', passed: true }
  } finally { await page.close() }
}
try {
  await run([join(repo, 'scripts/test-vinext-hosted-state.mjs')], repo, 'hosted-state-contract')
  const state = join(directory, 'state')
  await mkdir(state, { recursive: true })
  await cp(join(repo, 'scripts/vinext-hosted-state.mjs'), join(state, 'worker.mjs'))
  const previousState = await readFile(join(state, 'wrangler.json'), 'utf8').then(JSON.parse).catch(error => { if (error.code !== 'ENOENT') throw error })
  const key = previousState?.vars?.TEST_KEY || randomUUID()
  await writeFile(join(state, 'wrangler.json'), JSON.stringify({
    name: prefix + '-state', main: 'worker.mjs', compatibility_date: '2026-10-24', compatibility_flags: ['nodejs_compat'], workers_dev: true,
    vars: { TEST_KEY: key }, durable_objects: { bindings: [{ name: 'STATE', class_name: 'HostedTestState' }] },
    migrations: [{ tag: 'v1', new_sqlite_classes: ['HostedTestState'] }],
  }, null, 2))
  const gate = await deploy(join(state, 'wrangler.json'), state, prefix + '-state') + '/' + key
  await ready(gate, 'application/json')
  assert.deepEqual(await (await fetch(gate)).json(), { pending: 0 })
  // Exercise the remote data service before any application tests depend on it.
  const waiting = fetch(gate + '/wait').then(response => response.text())
  const deadline = Date.now() + 15000
  while (!(await (await fetch(gate)).json()).pending) { assert.ok(Date.now() < deadline); await new Promise(done => setTimeout(done, 100)) }
  assert.deepEqual(await (await fetch(gate, { method: 'POST' })).json(), { released: 1 })
  assert.equal(await waiting, 'released')
  const configurations = [
    ...[false, true].flatMap(cacheComponents => [true, false].map(reference => ({ router: 'mixed', reference, cacheComponents }))),
    ...[true, false].map(reference => ({ router: 'pages-only', reference, cacheComponents: false })),
  ]
  for (const config of configurations) {
    const { router, reference, cacheComponents } = config
    const name = `${prefix}-${reference ? 'react' : 'redact'}-${router === 'pages-only' ? 'pages' : cacheComponents ? 'cache' : 'app'}`
    const cwd = join(directory, name)
    process.env.VINEXT_TEST_WORKERS = '1'
    await prepareVinextFixture({ directory: cwd, gateOrigin: gate })
    if (router === 'mixed') {
      await cp(join(repo, 'scripts/vinext-hosted-cache.mjs'), join(cwd, 'hosted-cache.mjs'))
      await writeFile(join(cwd, 'app/hosted-data.js'), `import { env } from 'cloudflare:workers'\nexport const testFetch = (path, options) => env.REDACT_TEST_STATE.fetch(${JSON.stringify('https://test-state/' + key)} + path, options)\n`)
      await writeFile(join(cwd, 'app/slow/gate.js'), `import { testFetch } from '../hosted-data'\nexport async function waitForRelease() { const response = await testFetch('/wait'); if (!response.ok) throw new Error('Slow data source failed'); await response.text() }\nexport async function pendingCount() { return (await (await testFetch('/')).json()).pending }\nexport async function release() { return (await (await testFetch('/', { method: 'POST' })).json()).released }\n`)
      // A deployed app needs a shared data store, not a module-global Map.
      await writeFile(join(cwd, 'app/mutations/store.js'), `import { unstable_cache } from 'next/cache'\nimport { testFetch } from '../hosted-data'\nexport const records = { async set(id, value) { const response = await testFetch('/records/' + encodeURIComponent(id), { method: 'PUT', body: value }); if (!response.ok) throw new Error('Test record write failed') } }\nexport const readRecord = unstable_cache(async id => { const response = await testFetch('/records/' + encodeURIComponent(id), { cache: 'no-store' }); if (!response.ok) throw new Error('Test record read failed'); return (await response.json()).value }, ['redact-next-record'])\n`)
      const actions = join(cwd, 'app/mutations/actions.js')
      await writeFile(actions, (await readFile(actions, 'utf8')).replace('  records.set(', '  await records.set('))
    } else {
      const { rm } = await import('node:fs/promises')
      await rm(join(cwd, 'app'), { recursive: true })
      await writeFile(join(cwd, 'next.config.mjs'), 'export default { reactStrictMode: true }\n')
      await writeFile(join(cwd, 'pages/index.jsx'), `export { default } from './legacy'\n`)
      await mkdir(join(cwd, 'pages/api'), { recursive: true })
      await writeFile(join(cwd, 'pages/api/runtime.js'), `import React from 'react'\nexport default function handler(req, res) { res.json({ version: React.version, redact: !!globalThis[Symbol.for('@tanstack/redact.ReactSharedInternals')] }) }\n`)
    }
    if (router === 'mixed') {
      await mkdir(join(cwd, 'app/api/verification'), { recursive: true })
      await writeFile(join(cwd, 'app/api/verification/route.js'), `import { env } from 'cloudflare:workers'\nimport { testFetch } from '../../hosted-data'\nexport async function GET() { const response = await testFetch('/'); return Response.json({ version: env.VERIFICATION_VERSION.id, state: response.ok ? await response.json() : null }, { status: response.ok ? 200 : 503 }) }\n`)
    } else await writeFile(join(cwd, 'pages/api/verification.js'), `import { env } from 'cloudflare:workers'\nexport default function handler(req, res) { res.json({ version: env.VERIFICATION_VERSION.id }) }\n`)
    const workerConfig = JSON.parse(await readFile(join(cwd, 'wrangler.jsonc'), 'utf8'))
    Object.assign(workerConfig, { name, workers_dev: true, version_metadata: { binding: 'VERIFICATION_VERSION' }, ...(router === 'mixed' ? { vars: { REDACT_CACHE_NAMESPACE: name }, services: [{ binding: 'REDACT_TEST_STATE', service: prefix + '-state' }] } : {}) })
    await writeFile(join(cwd, 'wrangler.jsonc'), JSON.stringify(workerConfig, null, 2))
    const viteConfig = join(cwd, 'vite.config.mjs')
    await writeFile(viteConfig, `import { defineConfig } from 'vite'\nimport vinext from 'vinext'\nimport { redact } from '@tanstack/redact/vinext'\nimport { cloudflare } from '@tanstack/redact/cloudflare'\nexport default defineConfig({ root: ${JSON.stringify(cwd)}, cacheDir: ${JSON.stringify(join(cwd, '.vite'))}, plugins: [vinext({appDir:${JSON.stringify(cwd)}, ${router === 'mixed' ? 'cache: { data: { adapter: ' + JSON.stringify(join(cwd, 'hosted-cache.mjs')) + ' } }' : ''}}), await cloudflare({configPath:${JSON.stringify(join(cwd, 'wrangler.jsonc'))},viteEnvironment:${JSON.stringify(router === 'mixed' ? { name: 'rsc', childEnvironments: ['ssr'] } : { name: 'ssr' })},inspectorPort:false,persistState:false,remoteBindings:false,tunnel:false}), redact({renderer:${JSON.stringify(reference ? 'react' : 'redact')}})] })\n`)
    const evidence = await vinextEvidence(cwd, packageRoot)
    await run([vite, 'build', '--config', viteConfig], cwd, name + '-build', { VINEXT_TEST_CACHE_COMPONENTS: cacheComponents ? '1' : '', VINEXT_TEST_REFERENCE: reference ? '1' : '' })
    const deploymentFile = join(cwd, '.wrangler/deploy/config.json')
    const deployment = JSON.parse(await readFile(deploymentFile, 'utf8'))
    const builtConfig = resolve(dirname(deploymentFile), deployment.configPath)
    assert.ok(builtConfig.startsWith(cwd + '/dist/'), 'Deploy the config generated by this build')
    const origin = await deploy(builtConfig, cwd, name)
    await ready(origin + '/api/verification', 'application/json', report.deployments.at(-1).versionId)
    await ready(origin, 'text/html')
    if (router === 'mixed') assert.deepEqual(await (await fetch(origin + '/api/release-slow')).json(), { pending: 0 }, 'The deployed application must reach its test data service')
    for (const [engine, browserType] of Object.entries({ chromium, firefox, webkit })) {
      const result = { ...config, mode: 'production', deployment: 'cloudflare-hosted', origin, browser: engine, evidence, scenarios: [] }
      const browser = await browserType.launch({ headless: true })
      try {
        result.browserVersion = browser.version()
        Object.assign(result, await checkNext({ browser, origin, production: true, cwd, cacheComponents, reference, isExpectedBoundaryLog: message => isExpectedVinextBoundaryLog(message, origin), ...(router === 'pages-only' ? { scenarios: ['pages-router', 'pages-data', 'server-runtime'] } : {}) }))
        if (router === 'mixed') {
          result.scenarios.push(...await checkVinextEdges({ browser, origin, reference }))
          result.scenarios.push(await sharedCacheInvalidation(browser, origin))
        }
        else result.scenarios.push(await pagesHydration(browser, origin, reference))
        result.passed = result.scenarios.length === (router === 'pages-only' ? 4 : 22 + Number(cacheComponents)) && result.scenarios.every(s => s.passed)
      } catch (error) { Object.assign(result, { passed: false, error: error.stack || String(error) }) }
      finally { await browser.close(); report.results.push(result); await save(); console.log(result.passed ? 'PASS' : 'FAIL', name, engine) }
    }
  }
  assert.deepEqual(await vinextPackageEvidence(packageRoot), packageEvidence, 'Runtime changed during hosted verification')
  assert.equal(await vinextInstallation(consumer), 'npm-tarball')
  assert.equal(createHash('sha256').update(await readFile(join(consumer, 'package-lock.json'))).digest('hex'), packageLockSha256)
} catch (error) { report.error = error.stack || String(error); console.error(report.error) }
finally {
  report.summary = { configurations: report.results.length, scenarios: report.results.reduce((n, r) => n + r.scenarios.length, 0), passed: report.results.reduce((n, r) => n + r.scenarios.filter(s => s.passed).length, 0) }
  report.complete = report.summary.configurations === 18 && report.summary.scenarios === 282
  report.passed = report.complete && report.results.every(r => r.passed) && !report.error
  await save(); console.log(JSON.stringify({ ...report.summary, complete: report.complete, passed: report.passed }))
  if (!report.passed) process.exitCode = 1
}
