import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(import.meta.url)
const redactRepo = resolve(dirname(script), '..')
const source = '/Users/tannerlinsley/GitHub/tanstack.com'
const originalPackage = join(redactRepo, 'packages/redact')
const [action = 'prepare', requestedStage] = process.argv.slice(2)
const rootFiles = ['AGENTS.md', 'package.json', 'tsconfig.json', 'tsr.config.json', 'vite.config.ts', 'content-collections.ts', 'wrangler.jsonc', 'src', 'public', 'scripts']
const excluded = new Set(['.git', 'node_modules', 'dist', 'build', '.output', '.wrangler', '.cloudflare', '.tanstack', '.content-collections', '.vite', '.vite-temp', '.cache', '.next', '.turbo', '.vinxi', 'coverage', 'test-results', 'playwright-report', '.vscode', '.idea', '.codex', '.agents', '.claude', '.cursor', '.DS_Store'])
const forbidden = name => excluded.has(name) || /^\.(env|dev\.vars|secret|npmrc|yarnrc|mcp)/i.test(name) || /\.(pem|key|p12|pfx|log|tsbuildinfo)$/i.test(name)
const digest = value => createHash('sha256').update(value).digest('hex')

function copyTree(from, to) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (forbidden(entry.name) || entry.isSymbolicLink()) continue
    const target = join(to, entry.name), origin = join(from, entry.name)
    if (entry.isDirectory()) copyTree(origin, target)
    else if (entry.isFile()) copyFileSync(origin, target)
  }
}

function hashTree(root) {
  const files = {}
  function visit(dir, prefix = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) visit(join(dir, entry.name), prefix + entry.name + '/')
      else if (entry.isFile()) files[prefix + entry.name] = digest(readFileSync(join(dir, entry.name)))
    }
  }
  visit(root)
  return { sha256: digest(JSON.stringify(files)), files }
}

function replaceOnce(text, from, to) {
  assert.equal(text.split(from).length, 2, `Expected one config marker: ${from}`)
  return text.replace(from, to)
}

function linkDependencies(app, frozenPackage) {
  const modules = join(app, 'node_modules'), installed = join(source, 'node_modules')
  mkdirSync(modules)
  let count = 0
  for (const entry of readdirSync(installed, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    if (entry.name.startsWith('@')) {
      mkdirSync(join(modules, entry.name))
      for (const name of readdirSync(join(installed, entry.name))) {
        if (name.startsWith('.')) continue
        const target = entry.name === '@tanstack' && name === 'redact' ? frozenPackage : join(installed, entry.name, name)
        symlinkSync(target, join(modules, entry.name, name), 'dir')
        count++
      }
    } else {
      symlinkSync(join(installed, entry.name), join(modules, entry.name), 'dir')
      count++
    }
  }
  return count
}

function prepare(renderer = 'local-redact') {
  const published = renderer === 'published-redact'
  const packageRoot = published ? join(source, 'node_modules/@tanstack/redact') : originalPackage
  assert(existsSync(join(packageRoot, 'dist/vite/index.js')), 'Build Redact before preparing the site smoke.')
  const stage = mkdtempSync('/tmp/redact-tanstack-site-')
  const app = join(stage, 'site'), frozenPackage = join(stage, 'redact-package')
  mkdirSync(app)
  for (const name of rootFiles) {
    const from = join(source, name), to = join(app, name)
    if (name === 'src' || name === 'public' || name === 'scripts') copyTree(from, to)
    else copyFileSync(from, to)
  }
  mkdirSync(frozenPackage)
  const before = hashTree(join(packageRoot, 'dist'))
  copyTree(join(packageRoot, 'dist'), join(frozenPackage, 'dist'))
  copyFileSync(join(packageRoot, 'package.json'), join(frozenPackage, 'package.json'))
  assert.equal(hashTree(join(packageRoot, 'dist')).sha256, before.sha256, 'Redact dist changed during snapshot.')
  assert.equal(hashTree(join(frozenPackage, 'dist')).sha256, before.sha256, 'Redact snapshot differs from dist.')
  for (const path of ['cache/vite', 'cache/home', 'cache/config', 'cache/tmp', 'artifacts']) mkdirSync(join(stage, path), { recursive: true })
  const linkedDependencies = linkDependencies(app, frozenPackage)
  const oldConfig = readFileSync(join(app, 'vite.config.ts'), 'utf8')
  const plugin = join(frozenPackage, 'dist/vite/index.js')
  let config = replaceOnce(oldConfig, "from '@tanstack/redact/vite'", `from ${JSON.stringify(plugin)}`)
  const envFallback = config.match(/^const localEnvPath = [\s\S]*?^    : __dirname\n/gm)
  assert.equal(envFallback?.length, 1, 'Expected the checkout env fallback block.')
  config = replaceOnce(config, envFallback[0], 'const envDir = false\n')
  assert(!config.includes('.env.local'), 'The isolated config must not reference any checkout env file.')
  config = replaceOnce(config, 'defineConfig({', `defineConfig({\n  root: ${JSON.stringify(app)},\n  cacheDir: ${JSON.stringify(join(stage, 'cache/vite'))},`)
  config = replaceOnce(config, '    chunkSizeWarningLimit: 4_000,', `    outDir: ${JSON.stringify(join(app, 'dist'))},\n    chunkSizeWarningLimit: 4_000,`)
  writeFileSync(join(app, 'vite.config.ts'), config)
  const requireSite = createRequire(join(app, 'package.json'))
  const manifest = {
    stage, source, app, frozenPackage, renderer, createdAt: new Date().toISOString(), linkedDependencies,
    packageVersion: JSON.parse(readFileSync(renderer === 'react' ? requireSite.resolve('react/package.json') : join(packageRoot, 'package.json'), 'utf8')).version,
    pluginEnabled: renderer !== 'react',
    originalPlugin: join(packageRoot, 'dist/vite/index.js'),
    pluginSource: published ? null : join(originalPackage, 'src/vite/index.ts'),
    pluginSourceSha256: published ? null : digest(readFileSync(join(originalPackage, 'src/vite/index.ts'))),
    pluginSha256: digest(readFileSync(plugin)),
    dist: before, originalConfigSha256: digest(oldConfig), isolatedConfigSha256: digest(config),
    preset: 'default', appAliasesPreserved: true, appImportsPreserved: true,
    envFallbackRemoved: true, envDir: false,
  }
  writeFileSync(join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(JSON.stringify({ stage, renderer, packageVersion: manifest.packageVersion, pluginSha256: manifest.pluginSha256, distSha256: before.sha256, command: `${process.execPath} ${script} build ${stage}` }, null, 2))
}

function readStage() {
  assert(requestedStage, `Usage: node ${script} build /tmp/redact-tanstack-site-...`)
  const stage = realpathSync(requestedStage)
  assert(stage.startsWith('/private/tmp/redact-tanstack-site-') || stage.startsWith('/tmp/redact-tanstack-site-'), 'Only an isolated smoke directory is allowed.')
  const manifest = JSON.parse(readFileSync(join(stage, 'manifest.json'), 'utf8'))
  assert.equal(realpathSync(manifest.app), join(stage, 'site'))
  assert.equal(hashTree(join(stage, 'redact-package/dist')).sha256, manifest.dist.sha256, 'Frozen Redact build was changed.')
  const config = readFileSync(join(stage, 'site/vite.config.ts'), 'utf8')
  assert(!config.includes('.env.local') && config.includes('const envDir = false'), 'The env isolation guard was changed.')
  return { stage, app: join(stage, 'site'), manifest }
}

function safeEnv(info) {
  const env = { CI: '1', NO_COLOR: '1', TERM: 'dumb', NODE_ENV: 'production', WRANGLER_SEND_METRICS: 'false' }
  for (const key of ['PATH', 'LANG', 'LC_ALL', 'TZ']) if (process.env[key]) env[key] = process.env[key]
  return {
    ...env,
    HOME: join(info.stage, 'cache/home'), XDG_CONFIG_HOME: join(info.stage, 'cache/config'),
    XDG_CACHE_HOME: join(info.stage, 'cache'), TMPDIR: join(info.stage, 'cache/tmp'),
    LOCAL_REDACT_PACKAGE_ROOT: info.manifest.frozenPackage,
    DISABLE_REDACT: info.manifest.renderer === 'react' ? 'true' : 'false',
  }
}

async function build(info) {
  const requireSite = createRequire(join(info.app, 'package.json'))
  const cli = join(dirname(requireSite.resolve('vite/package.json')), 'bin/vite.js')
  const args = [cli, 'build', '--config', join(info.app, 'vite.config.ts'), '--configLoader', 'bundle']
  const log = createWriteStream(join(info.stage, 'artifacts/build.log'), { flags: 'a' })
  const child = spawn(process.execPath, args, { cwd: info.app, env: safeEnv(info), detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const result = { renderer: info.manifest.renderer, command: [process.execPath, ...args], pluginSha256: info.manifest.pluginSha256, distSha256: info.manifest.dist.sha256, passed: false, timedOut: false }
  child.stdout.on('data', chunk => { log.write(chunk); process.stdout.write(chunk) })
  child.stderr.on('data', chunk => { log.write(chunk); process.stderr.write(chunk) })
  const done = new Promise((resolveDone, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolveDone({ code, signal }))
  })
  let kill
  function stop() {
    if (child.exitCode !== null || child.signalCode) return
    process.kill(-child.pid, 'SIGTERM')
    kill = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL') } catch {} }, 5000)
  }
  const timeout = setTimeout(() => { result.timedOut = true; stop() }, 180_000)
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stop)
  try {
    const exit = await done
    Object.assign(result, exit, { passed: exit.code === 0 && !result.timedOut })
    if (!result.passed) process.exitCode = 1
  } finally {
    clearTimeout(timeout)
    if (kill) clearTimeout(kill)
    log.end()
    writeFileSync(join(info.stage, 'artifacts/build-result.json'), JSON.stringify(result, null, 2))
  }
  console.log(JSON.stringify(result, null, 2))
}

async function bounded(promise, label) {
  let timeout
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timeout = setTimeout(() => reject(Error(`${label} exceeded 15 seconds`)), 15_000) })])
  } finally {
    clearTimeout(timeout)
  }
}

async function browserSmoke(worker, info) {
  const requireRedact = createRequire(import.meta.url)
  const { chromium } = requireRedact('playwright')
  const origin = (await worker.ready).origin
  const result = { origin, passed: false, completed: [], blockedRequests: [], pageErrors: [], pageErrorCount: 0, consoleErrors: [] }
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', serviceWorkers: 'block' })
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin || url.pathname.startsWith('/_a/')) {
        result.blockedRequests.push({ origin: url.origin, pathname: url.pathname })
        return route.fulfill({ status: 204, body: '' })
      }
      return route.continue()
    })
    await context.addInitScript(() => { window.__redactSmokeDocument = Math.random().toString(36) })
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    page.on('pageerror', error => {
      result.pageErrorCount++
      if (!result.pageErrors.includes(error.stack)) result.pageErrors.push(error.stack)
      if (result.pageErrorCount === 1) page.close().catch(() => {})
    })
    page.on('console', message => { if (message.type() === 'error') result.consoleErrors.push({ text: message.text(), url: message.location().url }) })
    await page.goto(origin + '/privacy', { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: 'Privacy Policy', exact: true }).waitFor()
    const documentId = await page.evaluate(() => window.__redactSmokeDocument)
    const theme = page.getByRole('button', { name: /^Theme: / })
    for (const mode of ['dark', 'light', 'auto']) {
      await theme.click()
      await page.waitForFunction(expected => localStorage.getItem('theme') === expected, mode)
      assert(await page.locator('html').evaluate((html, expected) => html.classList.contains(expected === 'auto' ? 'auto' : expected), mode))
    }
    result.completed.push('hydration and theme context updates')
    await page.getByRole('navigation', { name: 'Legal links', exact: true }).getByRole('link', { name: 'Terms', exact: true }).click()
    await page.waitForURL('**/terms')
    await page.getByRole('heading', { name: 'Terms of Service', exact: true }).waitFor()
    assert.equal(await page.evaluate(() => window.__redactSmokeDocument), documentId, 'Terms navigation reloaded the document.')
    await page.goBack()
    await page.waitForURL('**/privacy')
    await page.getByRole('heading', { name: 'Privacy Policy', exact: true }).waitFor()
    result.completed.push('client navigation and history without document reload')
    await page.getByRole('link', { name: 'Latest posts', exact: true }).click()
    await page.waitForURL('**/blog')
    await page.getByRole('heading', { name: 'Blog', exact: true }).waitFor()
    await page.waitForFunction(() => document.querySelectorAll('.blog-year-grid > *').length === 12)
    await page.getByRole('button', { name: /^Load more posts/ }).click()
    await page.waitForFunction(() => document.querySelectorAll('.blog-year-grid > *').length === 24)
    result.completed.push('stateful blog pagination')
    await page.getByLabel('Search posts', { exact: true }).fill('__redact_no_post__')
    await page.waitForFunction(() => new URL(location.href).searchParams.get('q') === '__redact_no_post__')
    await page.getByText('No posts found matching', { exact: false }).waitFor()
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('q') && document.querySelectorAll('.blog-year-grid > *').length === 12)
    result.completed.push('controlled search input and URL-backed filter reset')
    await page.getByRole('button', { name: 'All topics', exact: true }).click()
    await page.getByRole('menuitem', { name: /^Query \(/ }).click()
    await page.waitForFunction(() => new URL(location.href).searchParams.get('library') === 'query')
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('library'))
    result.completed.push('Radix portal menu and route search updates')
    assert.equal(await page.evaluate(() => window.__redactSmokeDocument), documentId, 'Blog interactions reloaded the document.')
    await page.screenshot({ path: join(info.stage, 'artifacts/blog-desktop.png'), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Open Menu', exact: true }).click()
    await page.getByRole('button', { name: 'Close Menu', exact: true }).click()
    await page.screenshot({ path: join(info.stage, 'artifacts/blog-mobile.png'), fullPage: true })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile page overflows horizontally.')
    result.completed.push('mobile navigation menu and overflow check')
    assert.deepEqual(result.pageErrors, [], 'Browser runtime errors.')
    assert.deepEqual(result.consoleErrors, [], 'Browser console errors.')
    result.passed = true
  } catch (error) {
    result.error = error.stack
  } finally {
    await browser.close()
    writeFileSync(join(info.stage, 'artifacts/browser-result.json'), JSON.stringify(result, null, 2))
  }
  return result
}

async function ssr(info, includeBrowser = false) {
  process.env = safeEnv(info)
  process.chdir(info.app)
  const requireCloudflare = createRequire(join(realpathSync(join(info.app, 'node_modules/@cloudflare/vite-plugin')), 'package.json'))
  const { Miniflare, Response, Log, LogLevel } = requireCloudflare('miniflare')
  const { unstable_getMiniflareWorkerOptions } = requireCloudflare('wrangler')
  const configPath = join(info.app, 'dist/server/wrangler.json')
  const { workerOptions, main, externalWorkers } = unstable_getMiniflareWorkerOptions(configPath)
  assert.equal(externalWorkers.length, 0, 'Unexpected external Worker binding.')
  assert.equal(realpathSync(main), join(info.app, 'dist/server/index.js'))
  const result = { renderer: info.manifest.renderer, pluginSha256: info.manifest.pluginSha256, distSha256: info.manifest.dist.sha256, started: false, passed: false, blockedOutbound: [], routes: [] }
  const serverRoot = dirname(main)
  const modules = [{ type: 'ESModule', path: main }]
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (path !== main && /\.(m?js|wasm)$/.test(entry.name)) modules.push({ type: entry.name.endsWith('.wasm') ? 'CompiledWasm' : 'ESModule', path })
    }
  }
  visit(serverRoot)
  let worker
  try {
    worker = new Miniflare({
      ...workerOptions, modules, modulesRoot: serverRoot, cf: false, host: '127.0.0.1', port: 0,
      defaultPersistRoot: join(info.stage, 'cache/worker'), log: new Log(LogLevel.WARN),
      outboundService(request) {
        const url = new URL(request.url)
        result.blockedOutbound.push({ method: request.method, origin: url.origin, pathname: url.pathname })
        return new Response('External requests are blocked by this local smoke.', { status: 503 })
      },
    })
    await bounded(worker.ready, 'Worker startup')
    result.started = true
    for (const [path, status, expected] of [['/privacy', 200, 'Privacy Policy'], ['/terms', 200, 'Terms of Service'], ['/blog', 200, 'Blog'], ['/', 200, 'open source'], ['/__redact_smoke_missing__', 404, null]]) {
      try {
        const response = await bounded(worker.dispatchFetch(`http://localhost${path}`, { redirect: 'manual' }), `GET ${path}`)
        const html = await bounded(response.text(), `Body ${path}`)
        const hasExpectedContent = expected === null || html.includes(expected)
        result.routes.push({ path, status: response.status, expectedStatus: status, hasExpectedContent, passed: response.status === status && hasExpectedContent, bytes: Buffer.byteLength(html), title: html.match(/<title[^>]*>([^<]*)<\/title>/)?.[1] })
        writeFileSync(join(info.stage, 'artifacts', `ssr-${path === '/' ? 'home' : path.slice(1)}.html`), html)
      } catch (error) {
        result.routes.push({ path, error: error.stack, passed: false })
      }
    }
    result.passed = result.routes.every(route => route.passed)
    if (includeBrowser && result.passed) {
      result.browser = await browserSmoke(worker, info)
      result.passed = result.browser.passed
    }
  } catch (error) {
    result.error = error.stack
  } finally {
    await worker?.dispose()
    writeFileSync(join(info.stage, 'artifacts/ssr-result.json'), JSON.stringify(result, null, 2))
  }
  if (!result.passed) process.exitCode = 1
  console.log(JSON.stringify(result, null, 2))
}

if (action === 'prepare' || action === 'prepare-published' || action === 'prepare-react') prepare(action === 'prepare-react' ? 'react' : action === 'prepare-published' ? 'published-redact' : 'local-redact')
else if (action === 'build') await build(readStage())
else if (action === 'ssr') await ssr(readStage())
else if (action === 'smoke') await ssr(readStage(), true)
else throw Error(`Unknown command: ${action}`)
