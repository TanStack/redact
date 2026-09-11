import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(import.meta.url)
const redactRepo = resolve(dirname(script), '..')
const source = resolve(process.env.SITE_SOURCE || '/Users/tannerlinsley/GitHub/tannerlinsley.com')
const originalPackage = join(redactRepo, 'packages/redact')
const [action = 'prepare', requestedStage] = process.argv.slice(2)
const rootFiles = ['AGENTS.md', 'package.json', 'tsconfig.json', 'vite.config.ts', 'vite-plugin-posts.ts', 'posts-discover.ts', 'wrangler.jsonc', 'src', 'public']
const excluded = new Set(['.git', 'node_modules', 'dist', 'build', '.output', '.wrangler', '.cloudflare', '.tanstack', '.vite', '.vite-temp', '.cache', '.next', '.turbo', '.vinxi', 'coverage', 'test-results', 'playwright-report', 'legacy-source', '.vscode', '.idea', '.codex', '.agents', '.claude', '.cursor', '.DS_Store'])
const forbidden = name => excluded.has(name) || /^\.(env|dev\.vars|secret|npmrc|yarnrc|mcp)/i.test(name) || /\.(pem|key|p12|pfx|log|tsbuildinfo)$/i.test(name)

function copyTree(from, to, filter = forbidden) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (filter(entry.name) || entry.isSymbolicLink()) continue
    const target = join(to, entry.name), origin = join(from, entry.name)
    if (entry.isDirectory()) copyTree(origin, target, filter)
    else if (entry.isFile()) copyFileSync(origin, target)
  }
}

const digest = value => createHash('sha256').update(value).digest('hex')
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

function prepare(renderer = 'local-redact', includeBuild = false) {
  const published = renderer === 'published-redact'
  const packageRoot = published ? join(source, 'node_modules/@tanstack/redact') : originalPackage
  assert(existsSync(join(packageRoot, 'dist/vite/index.js')), 'Build Redact before preparing the site smoke.')
  const stage = mkdtempSync('/tmp/redact-tanner-site-')
  const app = join(stage, 'site'), frozenPackage = join(stage, 'redact-package')
  mkdirSync(app)
  for (const name of rootFiles) {
    const from = join(source, name), to = join(app, name)
    if (name === 'src' || name === 'public') copyTree(from, to)
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
  let build = null
  if (includeBuild) {
    const output = join(source, 'dist')
    assert(existsSync(join(output, 'server/wrangler.json')), 'Run the site production build before preparing its output.')
    build = hashTree(output)
    // Generated output includes Vite's runtime manifest, not source caches.
    copyTree(output, join(app, 'dist'), name => /^\.(env|dev\.vars|secret|npmrc|yarnrc|mcp)/i.test(name) || /\.(pem|key|p12|pfx)$/i.test(name))
    assert.equal(hashTree(output).sha256, build.sha256, 'Site output changed during snapshot.')
    assert.equal(hashTree(join(app, 'dist')).sha256, build.sha256, 'Site output snapshot differs from the normal build.')
  }
  const oldConfig = readFileSync(join(app, 'vite.config.ts'), 'utf8')
  assert(oldConfig.includes("preset: 'nano'"), 'Expected the site nano preset.')
  const plugin = join(frozenPackage, 'dist/vite/index.js')
  let config = replaceOnce(oldConfig, "from '@tanstack/redact/vite'", `from ${JSON.stringify(plugin)}`)
  config = replaceOnce(config, 'redact({', `redact({\n      packageRoots: { '@tanstack/redact': ${JSON.stringify(frozenPackage)} },\n      resolveFrom: ${JSON.stringify(app)},`)
  if (renderer === 'react') {
    config = replaceOnce(config, `import { redact } from ${JSON.stringify(plugin)}`, '')
    const plugins = config.match(/^    redact\(\{[\s\S]*?^    \}\),\n/gm)
    assert.equal(plugins?.length, 1, 'Expected one Redact plugin block for the React control.')
    config = replaceOnce(config, plugins[0], '')
  }
  config = replaceOnce(config, 'defineConfig({', `defineConfig({\n  root: ${JSON.stringify(app)},\n  envDir: false,\n  cacheDir: ${JSON.stringify(join(stage, 'cache/vite'))},\n  build: { outDir: ${JSON.stringify(join(app, 'dist'))} },`)
  writeFileSync(join(app, 'vite.config.ts'), config)
  const requireSite = createRequire(join(app, 'package.json'))
  const matter = requireSite('gray-matter')
  const posts = readdirSync(join(app, 'src/posts')).filter(name => name.endsWith('.md')).map(name => {
    const { data } = matter(readFileSync(join(app, 'src/posts', name), 'utf8'))
    return { slug: name.slice(0, -3), title: data.title, date: String(data.date), published: data.published !== false }
  }).filter(post => post.published).sort((a, b) => b.date.localeCompare(a.date))
  const appearances = JSON.parse(readFileSync(join(app, 'src/data/appearances.json'), 'utf8'))
  const manifest = {
    stage, source, app, frozenPackage, createdAt: new Date().toISOString(), linkedDependencies,
    renderer, build,
    packageVersion: JSON.parse(readFileSync(renderer === 'react' ? requireSite.resolve('react/package.json') : join(packageRoot, 'package.json'), 'utf8')).version,
    originalPlugin: join(packageRoot, 'dist/vite/index.js'),
    pluginSource: published ? null : join(originalPackage, 'src/vite/index.ts'),
    pluginSourceSha256: published ? null : digest(readFileSync(join(originalPackage, 'src/vite/index.ts'))),
    pluginSha256: digest(readFileSync(plugin)),
    dist: before, originalConfigSha256: digest(oldConfig), isolatedConfigSha256: digest(config),
    preset: 'nano', features: ['hydration', 'context', 'suspense', 'classComponents', 'memo', 'forwardRef'],
    posts, appearanceCounts: Object.fromEntries(['all', 'talk', 'podcast', 'interview', 'livestream'].map(type => [type, appearances.filter(value => type === 'all' || value.type === type).length])),
  }
  writeFileSync(join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(JSON.stringify({ stage, renderer, packageVersion: manifest.packageVersion, pluginSha256: manifest.pluginSha256, distSha256: before.sha256, buildSha256: build?.sha256, posts: posts.map(post => post.slug), appearanceCounts: manifest.appearanceCounts, commands: (includeBuild ? ['worker-smoke'] : ['build', 'preview', 'smoke']).map(command => `${process.execPath} ${script} ${command} ${stage}`) }, null, 2))
}

function readStage() {
  assert(requestedStage, `Usage: node ${script} ${action} /tmp/redact-tanner-site-...`)
  const stage = realpathSync(requestedStage)
  assert(stage.startsWith('/private/tmp/redact-tanner-site-') || stage.startsWith('/tmp/redact-tanner-site-'), 'Only an isolated smoke directory is allowed.')
  const manifest = JSON.parse(readFileSync(join(stage, 'manifest.json'), 'utf8'))
  assert.equal(realpathSync(manifest.app), join(stage, 'site'))
  assert.equal(hashTree(join(stage, 'redact-package/dist')).sha256, manifest.dist.sha256, 'Frozen Redact build was changed.')
  if (manifest.build) assert.equal(hashTree(join(stage, 'site/dist')).sha256, manifest.build.sha256, 'Frozen site output was changed.')
  assert(readFileSync(join(stage, 'site/vite.config.ts'), 'utf8').includes('envDir: false'), 'The isolated config must not load env files.')
  return { stage, app: join(stage, 'site'), manifest }
}

function safeEnv(stage) {
  const env = { CI: '1', NO_COLOR: '1', TERM: 'dumb', NODE_ENV: 'production', WRANGLER_SEND_METRICS: 'false' }
  for (const key of ['PATH', 'LANG', 'LC_ALL', 'TZ']) if (process.env[key]) env[key] = process.env[key]
  return { ...env, HOME: join(stage, 'cache/home'), XDG_CONFIG_HOME: join(stage, 'cache/config'), XDG_CACHE_HOME: join(stage, 'cache'), TMPDIR: join(stage, 'cache/tmp') }
}

function vite(info, command, extra = []) {
  const requireSite = createRequire(join(info.app, 'package.json'))
  const cli = join(dirname(requireSite.resolve('vite/package.json')), 'bin/vite.js')
  const log = createWriteStream(join(info.stage, 'artifacts', `${command}.log`), { flags: 'a' })
  const child = spawn(process.execPath, [cli, command, '--config', join(info.app, 'vite.config.ts'), '--configLoader', 'runner', ...extra], { cwd: info.app, env: safeEnv(info.stage), detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', chunk => { log.write(chunk); process.stdout.write(chunk) })
  child.stderr.on('data', chunk => { log.write(chunk); process.stderr.write(chunk) })
  const done = new Promise((resolveDone, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => { log.end(); code === 0 || signal === 'SIGTERM' ? resolveDone() : reject(Error(`${command} exited ${code ?? signal}`)) })
  })
  done.catch(() => {})
  async function stop() {
    if (child.exitCode !== null || child.signalCode) return
    process.kill(-child.pid, 'SIGTERM')
    const kill = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL') } catch {} }, 5000)
    try { await done } finally { clearTimeout(kill) }
  }
  return { child, done, stop }
}

async function startWorker(info) {
  process.env = safeEnv(info.stage)
  process.chdir(info.app)
  const requireCloudflare = createRequire(join(realpathSync(join(info.app, 'node_modules/@cloudflare/vite-plugin')), 'package.json'))
  const { Miniflare, Response, Log, LogLevel } = requireCloudflare('miniflare')
  const { unstable_getMiniflareWorkerOptions } = requireCloudflare('wrangler')
  const { workerOptions, main, externalWorkers } = unstable_getMiniflareWorkerOptions(join(info.app, 'dist/server/wrangler.json'))
  assert.equal(externalWorkers.length, 0, 'Unexpected external Worker binding.')
  assert.equal(realpathSync(main), join(info.app, 'dist/server/index.js'))
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
  const blockedOutbound = []
  const worker = new Miniflare({
    ...workerOptions, modules, modulesRoot: serverRoot, cf: false, host: '127.0.0.1', port: 0,
    defaultPersistRoot: join(info.stage, 'cache/worker'), log: new Log(LogLevel.WARN),
    outboundService(request) {
      const url = new URL(request.url)
      blockedOutbound.push({ method: request.method, origin: url.origin, pathname: url.pathname })
      return new Response('External requests are blocked by this local smoke.', { status: 503 })
    },
  })
  let timeout
  try {
    const ready = await Promise.race([worker.ready, new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('Worker startup exceeded 15 seconds.')), 15000) })])
    return { origin: ready.origin, blockedOutbound, stop: () => worker.dispose() }
  } catch (error) {
    await worker.dispose()
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function smoke(info, directWorker = false) {
  const port = Number(process.env.SMOKE_PORT || 4179)
  assert(Number.isInteger(port) && port > 1024 && port < 65536)
  const server = directWorker ? await startWorker(info) : vite(info, 'preview', ['--host', '127.0.0.1', '--port', String(port), '--strictPort'])
  const origin = directWorker ? server.origin : `http://127.0.0.1:${port}`
  let browser
  const result = { origin, adapter: directWorker ? 'unchanged emitted Worker through Miniflare' : 'Vite preview', renderer: info.manifest.renderer ?? 'local-redact', passed: false, pluginSha256: info.manifest.pluginSha256, distSha256: info.manifest.dist.sha256, buildSha256: info.manifest.build?.sha256, ssr: [], completed: [], blockedRequests: [], blockedOutbound: server.blockedOutbound ?? [], pageErrors: [], pageErrorCount: 0, consoleErrors: [] }
  try {
    let ready = directWorker
    for (let attempt = 0; !ready && attempt < 100; attempt++) {
      if (server.child.exitCode !== null) throw Error('Preview exited before becoming ready.')
      try { const response = await fetch(origin, { redirect: 'manual' }); if (response.ok) { ready = true; break } } catch {}
      await new Promise(resolveDelay => setTimeout(resolveDelay, 200))
    }
    assert(ready, 'Preview did not become ready in 20 seconds.')
    const post = info.manifest.posts[0]
    for (const path of ['/', '/posts', `/posts/${post.slug}`, '/about', '/appearances', '/appearances?type=talk', '/feed.xml', '/__redact_smoke_missing__']) {
      const response = await fetch(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
      const html = await response.text()
      const status = path.includes('__redact_smoke_missing__') ? 404 : 200
      assert.equal(response.status, status, `HTTP ${path}`)
      if (path === '/feed.xml') assert(html.includes('<rss'))
      else { assert(html.includes('<html')); assert(html.includes('<main')); assert(!html.includes('Something went wrong')) }
      result.ssr.push({ path, status: response.status, bytes: Buffer.byteLength(html), title: html.match(/<title[^>]*>([^<]*)<\/title>/)?.[1] })
    }
    const requireRedact = createRequire(import.meta.url)
    const { chromium } = requireRedact('playwright')
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', serviceWorkers: 'block' })
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin || url.pathname.startsWith('/m/') || url.pathname.startsWith('/cdn-cgi/image/')) {
        result.blockedRequests.push({ origin: url.origin, pathname: url.pathname })
        return route.fulfill({ status: 204, body: '' })
      }
      return route.continue()
    })
    await context.addInitScript(() => { window.__redactSmokeDocument = Math.random().toString(36) })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    page.on('pageerror', error => {
      result.pageErrorCount++
      if (!result.pageErrors.includes(error.stack)) result.pageErrors.push(error.stack)
      if (result.pageErrorCount === 1) page.close().catch(() => {})
    })
    page.on('console', message => { if (message.type() === 'error') result.consoleErrors.push(message.text()) })
    await page.goto(origin, { waitUntil: 'networkidle' })
    await page.getByRole('heading', { level: 1 }).waitFor()
    const documentId = await page.evaluate(() => window.__redactSmokeDocument)
    await page.locator('header').getByRole('link', { name: 'Writing', exact: true }).click()
    await page.waitForURL('**/posts')
    await page.getByRole('heading', { name: 'Writing', exact: true }).waitFor()
    assert.equal(await page.evaluate(() => window.__redactSmokeDocument), documentId, 'Writing navigation reloaded the document.')
    assert.equal(await page.locator('main a[href^="/posts/"]').count(), info.manifest.posts.length)
    await page.locator(`main a[href="/posts/${post.slug}"]`).click()
    await page.waitForURL(`**/posts/${post.slug}`)
    await page.getByRole('heading', { level: 1, name: post.title, exact: true }).waitFor()
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), `https://tannerlinsley.com/posts/${post.slug}`)
    assert.equal(await page.locator('script[type="application/ld+json"]').evaluateAll(scripts => scripts.filter(script => JSON.parse(script.textContent)['@type'] === 'BlogPosting').length), 1)
    result.completed.push('hydration, client post navigation, canonical and structured data')
    await page.locator('header').getByRole('link', { name: 'Appearances', exact: true }).click()
    await page.waitForURL('**/appearances')
    await page.getByRole('button', { name: 'Talks', exact: true }).click()
    await page.waitForURL('**/appearances?type=talk')
    await page.waitForFunction(count => document.querySelectorAll('main a[target="_blank"]').length === count, info.manifest.appearanceCounts.talk)
    await page.getByRole('button', { name: 'Podcasts', exact: true }).click()
    await page.waitForURL('**/appearances?type=podcast')
    await page.waitForFunction(count => document.querySelectorAll('main a[target="_blank"]').length === count, info.manifest.appearanceCounts.podcast)
    await page.goBack()
    await page.waitForURL('**/appearances?type=talk')
    await page.waitForFunction(count => document.querySelectorAll('main a[target="_blank"]').length === count, info.manifest.appearanceCounts.talk)
    await page.getByRole('button', { name: 'All', exact: true }).click()
    await page.waitForURL('**/appearances')
    await page.waitForFunction(count => document.querySelectorAll('main a[target="_blank"]').length === count, info.manifest.appearanceCounts.all)
    assert.equal(await page.evaluate(() => window.__redactSmokeDocument), documentId, 'Client navigation reloaded the document.')
    result.completed.push('URL-backed appearance filters and browser history without document reload')
    const theme = page.getByRole('button', { name: 'Toggle theme (light, dark, auto)', exact: true })
    for (const expected of ['light', 'dark', 'auto']) {
      await theme.click()
      assert.equal(await page.locator('html').getAttribute('data-theme'), expected)
    }
    result.completed.push('theme context updates')
    await page.locator('header').getByRole('link', { name: 'About', exact: true }).click()
    await page.waitForURL('**/about')
    await page.getByRole('heading', { level: 1, name: 'Tanner Linsley', exact: true }).waitFor()
    await page.screenshot({ path: join(info.stage, 'artifacts/about-desktop.png'), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: join(info.stage, 'artifacts/about-mobile.png'), fullPage: true })
    result.completed.push('About navigation and desktop/mobile rendering')
    result.mobileWidths = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth, header: document.querySelector('header')?.scrollWidth }))
    assert(result.mobileWidths.document <= result.mobileWidths.viewport + 1, 'Mobile page overflows horizontally.')
    result.completed.push('mobile overflow check')
    assert.deepEqual(result.pageErrors, [], 'Browser runtime errors.')
    assert.deepEqual(result.consoleErrors, [], 'Browser console errors.')
    result.passed = true
  } catch (error) {
    result.error = error.stack
  } finally {
    await browser?.close()
    await server.stop()
    writeFileSync(join(info.stage, 'artifacts', directWorker ? 'worker-smoke.json' : 'smoke.json'), JSON.stringify(result, null, 2))
  }
  if (!result.passed) process.exitCode = 1
  console.log(JSON.stringify(result, null, 2))
}

if (action === 'prepare' || action === 'prepare-published' || action === 'prepare-react') prepare(action === 'prepare-react' ? 'react' : action === 'prepare-published' ? 'published-redact' : 'local-redact')
else if (action === 'prepare-built') prepare('published-redact', true)
else if (action === 'build' || action === 'preview') {
  const info = readStage()
  const task = vite(info, action, action === 'preview' ? ['--host', '127.0.0.1', '--port', String(Number(process.env.SMOKE_PORT || 4179)), '--strictPort'] : [])
  const timeout = action === 'build' ? setTimeout(() => { task.stop().finally(() => { process.exitCode = 1 }) }, 180_000) : null
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { task.stop().finally(() => { process.exitCode = 1 }) })
  try { await task.done } finally { if (timeout) clearTimeout(timeout) }
} else if (action === 'smoke') await smoke(readStage())
else if (action === 'worker-smoke') await smoke(readStage(), true)
else throw Error(`Unknown command: ${action}`)
