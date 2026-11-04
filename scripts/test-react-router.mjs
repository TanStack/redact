import assert from 'node:assert/strict'
import { execFileSync, fork } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, firefox, webkit } from 'playwright'

const repo = fileURLToPath(new URL('../', import.meta.url))
const work = await mkdtemp(join(tmpdir(), 'redact-router-'))
const fixture = join(work, 'fixture')
const env = {
  PATH: process.env.PATH,
  HOME: work,
  npm_config_userconfig: join(work, 'user.npmrc'),
  npm_config_globalconfig: join(work, 'global.npmrc'),
}
const npm = 'npm'
const installOptions = ['--ignore-scripts', '--no-audit', '--no-fund']
if (process.env.npm_config_cache) installOptions.push('--cache', process.env.npm_config_cache)
if (process.env.npm_config_offline === 'true') installOptions.push('--offline')

function run(command, args, cwd, extraEnv) {
  return execFileSync(command, args, {
    cwd,
    env: { ...env, ...extraEnv },
    encoding: 'utf8',
    timeout: 120_000,
  })
}

async function checkPage(browser, origin, reference) {
  const context = await browser.newContext({ extraHTTPHeaders: { 'X-Fixture-Seed': 'Ada' } })
  try {
    await context.route(url => url.origin !== origin, route => route.abort())
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.setDefaultTimeout(15_000)
    let release
    const held = new Promise(resolve => { release = resolve })
    await page.route('**/*.js*', async route => {
      await held
      await route.continue()
    })
    try {
      await page.goto(origin, { waitUntil: 'commit' })
      await page.getByRole('heading', { name: 'Home loader' }).waitFor()
      await page.locator('h1').evaluate(heading => {
        window.originalHeading = heading
        window.originalField = document.querySelector('label').control
      })
    } finally {
      release()
    }
    await page.waitForFunction(() => window.routerReady === true)
    const hydration = await page.evaluate(() => ({
      headingRetained: document.querySelector('h1') === window.originalHeading,
      fieldRetained: document.querySelector('label').control === window.originalField,
      id: window.originalField.id,
      renderer: window.fixtureRenderer,
      recoveries: window.routerRecoveries,
    }))
    assert.equal(hydration.headingRetained, true)
    assert.equal(hydration.fieldRetained, true)
    assert.ok(hydration.id.startsWith('_app-R_'))
    assert.equal(hydration.renderer, reference ? 'native' : 'redact')
    assert.deepEqual(hydration.recoveries, [])
    assert.equal(await page.locator('#session').textContent(), 'Ada')
    assert.equal(await page.locator('#server-trace').textContent(), 'root-before|child-before')

    await page.locator('main #stream').getByText('Stream complete').waitFor()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.locator('#action').getByText('Saved Ada').waitFor()
    assert.equal(await page.locator('#action-session').textContent(), 'Ada')
    await page.getByRole('button', { name: 'Fetch save', exact: true }).click()
    await page.locator('#fetcher').getByText('Saved Grace').waitFor()
    assert.equal(await page.locator('#fetcher-session').textContent(), 'Ada')

    await page.mouse.wheel(0, 800)
    await page.waitForFunction(() => scrollY > 500)
    const scrollBefore = await page.evaluate(() => scrollY)
    await page.getByRole('link', { name: 'Detail', exact: true }).evaluate(link => link.click())
    await page.getByRole('heading', { name: 'Detail loader' }).waitFor()
    assert.equal(await page.evaluate(() => scrollY), 0)
    await page.goBack()
    await page.getByRole('heading', { name: 'Home loader' }).waitFor()
    await page.waitForFunction(before => Math.abs(scrollY - before) < 3, scrollBefore)
    const middleware = await page.evaluate(() => window.middlewareEvents)
    assert.ok(middleware.some(event => event.part === 'child-before'))
    assert.ok(middleware.every(event => Number.isInteger(event.seed) && event.seed > 0))
    await page.locator('main #stream').getByText('Stream complete').waitFor()
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
  }

  const noJS = await browser.newContext({
    javaScriptEnabled: false,
    extraHTTPHeaders: { 'X-Fixture-Seed': 'Grace' },
  })
  try {
    await noJS.route(url => url.origin !== origin, route => route.abort())
    const page = await noJS.newPage()
    await page.goto(origin)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForLoadState('load')
    await page.locator('#action').getByText('Saved Ada').waitFor()
    assert.equal(await page.locator('#action-session').textContent(), 'Grace')
  } finally {
    await noJS.close()
  }
}

try {
  await cp(join(repo, 'tests/fixtures/react-router-framework'), fixture, { recursive: true })
  run(npm, ['ci', ...installOptions], fixture)
  const [pack] = JSON.parse(run(npm, [
    'pack', '--json', '--ignore-scripts', '--pack-destination', work,
  ], join(repo, 'packages/redact')))
  run(npm, ['install', '--no-save', ...installOptions, join(work, pack.filename)], fixture)

  for (const reference of [true, false]) {
    const mode = { NODE_ENV: 'production', ROUTER_REFERENCE: reference ? '1' : '' }
    run(process.execPath, ['node_modules/@react-router/dev/bin.cjs', 'build'], fixture, mode)
    const server = fork(join(fixture, 'server.mjs'), [], { cwd: fixture, env: { ...env, ...mode } })
    try {
      const [port] = await once(server, 'message', { signal: AbortSignal.timeout(20_000) })
      for (const [engine, launcher] of Object.entries({ chromium, firefox, webkit })) {
        const browser = await launcher.launch(engine === 'chromium' ? { chromiumSandbox: true } : {})
        try {
          await checkPage(browser, 'http://127.0.0.1:' + port, reference)
          console.log(reference ? 'Native React' : 'Redact browser', engine, 'passed')
        } finally {
          await browser.close()
        }
      }
    } finally {
      if (server.exitCode === null && server.signalCode === null) {
        const exited = once(server, 'exit')
        server.kill()
        await exited
      }
    }
  }
} finally {
  await rm(work, { recursive: true, force: true })
}
