import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { checkExtended } from './next-extended-checks.mjs'
import { watchBrowserErrors } from './next-browser-errors.mjs'
import { reloadDocument } from './browser-reload.mjs'

export async function checkNext({ browser, origin, production, cwd, cacheComponents, reference = false, beforeBoundaryReset, isExpectedBoundaryLog, scenarios: scenarioNames }) {
  const errors = []
  const context = await browser.newContext()
  let page = await context.newPage()
  let observed = watchBrowserErrors(page, errors)
  const cancellations = [], scenarios = [], scriptReleases = new Set()
  const selected = scenarioNames || process.env.NEXT_TEST_SCENARIOS?.split(',')
  const flushErrors = () => observed.flush()
  const settle = async () => {
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    await flushErrors()
  }
  const visit = async (url, options) => {
    // Independent hard-load scenarios use a fresh page in the same session.
    // Compiling a new route must not race HMR in the document being discarded.
    // Navigation, history, refresh and cancellation stay within their scenario.
    if (page.url() !== 'about:blank') await freshPage()
    await observed.navigate(() => page.goto(url, options))
    return page
  }
  const reload = async () => { await settle(); return observed.navigate(() => reloadDocument(page)) }
  const openPage = async () => {
    page = await context.newPage()
    observed = watchBrowserErrors(page, errors)
    page.setDefaultTimeout(15000)
    page.setDefaultNavigationTimeout(30000)
    await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }))
  }
  const holdScripts = async () => {
    let release
    const ready = new Promise(resolve => { release = resolve })
    const resume = () => { scriptReleases.delete(resume); release() }
    scriptReleases.add(resume)
    await page.route('**/*.js*', async route => { await ready; await route.continue() })
    return resume
  }
  const closePage = async () => {
    for (const release of scriptReleases) release()
    await page.unrouteAll({ behavior: 'wait' })
    await observed.navigate(() => page.close())
    cancellations.push(...observed.cancellations)
  }
  const freshPage = async () => { await settle(); await closePage(); await openPage() }
  const scenario = async (name, work) => {
    if (selected && !selected.includes(name)) return
    const started = Date.now(), result = { name, passed: true }
    try { await work(); await settle() }
    catch (error) {
      result.passed = false
      result.error = error.stack || String(error)
      if (typeof error.actual === 'string') result.actual = error.actual
      if (process.env.NEXT_TEST_TRACE) {
        // Keep the original failure. A second development navigation can abort
        // Playwright's wait, so record the resulting document before teardown.
        await page.waitForLoadState('load', { timeout: 5000 }).catch(() => {})
        result.failureDocument = await page.evaluate(() => ({
          url: location.href, readyState: document.readyState,
          title: document.title, text: document.body?.innerText.slice(0, 2000),
          navigation: performance.getEntriesByType('navigation').map(entry => ({
            type: entry.type, url: entry.name, duration: entry.duration,
          })),
        })).catch(diagnosticError => ({ error: String(diagnosticError) }))
      }
    }
    try { await closePage() }
    catch (error) { result.passed = false; result.error ||= error.stack || String(error) }
    if (errors.length) { result.passed = false; result.browserErrors = errors.splice(0) }
    result.durationMs = Date.now() - started
    scenarios.push(result)
    console.log((result.passed ? 'PASS' : 'FAIL') + ' Next scenario ' + JSON.stringify(result))
    await openPage()
  }
  page.setDefaultTimeout(15000)
  page.setDefaultNavigationTimeout(30000)
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }))
  await scenario('hydration', async () => {
    const releaseScripts = await holdScripts()
    console.log('Checking server DOM hydration')
    await visit(origin, { waitUntil: 'commit' })
    await page.getByRole('button', { name: 'Count: 0', exact: true }).waitFor()
    await page.evaluate(() => { window.ssrButton = document.querySelector('button'); window.originalDocument = document.documentElement })
    console.log('Loading browser runtime')
    releaseScripts()
    await page.waitForFunction(() => document.querySelector('button[data-ready="true"]')).catch(async error => { console.error(errors); throw error })
    assert.equal(await page.evaluate(() => !!globalThis[Symbol.for('@tanstack/redact.ReactSharedInternals')]), !reference, 'The selected renderer must run in the browser')
    assert.ok(await page.evaluate(() => window.ssrButton === document.querySelector('button')), 'Hydration must preserve server DOM')
    await page.getByRole('button', { name: 'Count: 0', exact: true }).click()
    await page.getByRole('button', { name: 'Count: 1', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Increment on server' }).click()
    await page.getByRole('button', { name: 'Count: 2', exact: true }).waitFor()
    await page.getByRole('link', { name: 'Other page', exact: true }).click()
    await page.getByRole('heading', { name: 'Other page', exact: true }).waitFor()
    await page.waitForFunction(() => document.title === 'Other page')
    assert.ok(await page.evaluate(() => window.originalDocument === document.documentElement), 'Navigation must stay in the same document')
    await page.goBack()
    await page.getByRole('heading', { name: 'Redact with Next.js' }).waitFor()
    await page.waitForFunction(() => document.title === 'Redact with Next.js')
  })
  await scenario('ids', async () => {
    console.log('Checking server-generated IDs')
    await freshPage()
    const releaseIdScripts = await holdScripts()
    await visit(`${origin}/ids`, { waitUntil: 'commit' })
    await page.getByLabel('Deep', { exact: true }).waitFor()
    const serverIds = await page.locator('input').evaluateAll(inputs => {
      window.serverInputs = inputs
      return inputs.map(input => [input.id, input.getAttribute('aria-describedby')])
    })
    releaseIdScripts()
    await page.waitForFunction(() => document.querySelector('main[data-ready="true"]'))
    assert.deepEqual(await page.locator('input').evaluateAll(inputs => inputs.map(input => [input.id, input.getAttribute('aria-describedby')])), serverIds)
    assert.ok(await page.locator('input').evaluateAll(inputs => inputs.every((input, index) => input === window.serverInputs[index])), 'ID hydration must preserve inputs')
    assert.equal(new Set(serverIds.flat()).size, serverIds.length * 2, 'IDs must be unique')
    await page.unroute('**/*.js*')
  })
  await scenario('actions', async () => {
    console.log('Checking form actions and optimistic updates')
    await visit(`${origin}/actions`)
    await page.waitForFunction(() => document.querySelector('main[data-ready="true"]'))
    await page.getByRole('textbox', { name: 'Name' }).fill('Saved')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('button', { name: 'Saving', exact: true }).waitFor()
    assert.equal(await page.getByTestId('optimistic').textContent(), 'Saved')
    assert.equal(await page.getByTestId('pending').textContent(), 'true')
    await page.getByText('1:Saved', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Save', exact: true }).waitFor()
    assert.equal(await page.getByTestId('pending').textContent(), 'false')
    assert.equal(await page.getByTestId('optimistic').textContent(), 'Saved')
    assert.equal(await page.getByRole('textbox', { name: 'Name' }).inputValue(), 'Initial')
  })
  await scenario('direct-actions', async () => {
    console.log('Checking direct Server Action forms')
    await visit(`${origin}/actions/direct`)
    await page.waitForFunction(() => document.querySelector('main[data-ready="true"]'))
    await page.getByRole('textbox', { name: 'Name' }).fill('Direct')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByText('1:Direct', { exact: true }).waitFor()
  })
  await scenario('progressive-actions', async () => {
    console.log('Checking submission before JavaScript loads')
    await freshPage()
    const releaseFormScripts = await holdScripts()
    await visit(`${origin}/actions/direct`, { waitUntil: 'commit' })
    await page.getByRole('textbox', { name: 'Name' }).fill('Before JS')
    assert.equal(await page.locator('main').getAttribute('data-ready'), 'false', 'The application must not have hydrated before submission')
    const submit = page.getByRole('button', { name: 'Save', exact: true })
    assert.ok(await submit.isVisible())
    assert.ok(await submit.isEnabled())
    const box = await submit.boundingBox()
    assert.ok(box && box.width > 0 && box.height > 0)
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    assert.ok(await submit.evaluate((button, point) => button.contains(document.elementFromPoint(point.x, point.y)), point), 'The submit button must receive the pointer event')
    assert.deepEqual(await submit.boundingBox(), box, 'The submit button must not move before the click')
    // Check geometry directly and send trusted pointer input. This server-only
    // submission must work while the application scripts are deliberately held.
    await observed.navigate(() => Promise.all([
      page.waitForNavigation({ waitUntil: 'commit' }),
      page.mouse.click(point.x, point.y),
    ]))
    await page.getByText('1:Before JS', { exact: true }).waitFor()
    releaseFormScripts()
    await page.waitForFunction(() => document.querySelector('main[data-ready="true"]'))
    await page.unroute('**/*.js*')
    await page.getByRole('textbox', { name: 'Name' }).fill('After JS')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByText('2:After JS', { exact: true }).waitFor()
  })
  await scenario('streaming', async () => {
    console.log('Checking streamed Suspense')
    await visit(`${origin}/stream`, { waitUntil: 'commit' })
    await page.getByText('Waiting for stream', { exact: true }).waitFor()
    await page.getByRole('heading', { name: 'Stream complete' }).waitFor()
    await page.waitForFunction(() => document.querySelectorAll('button[data-ready="true"]').length === 2)
    assert.equal(await page.getByText('After boundary', { exact: true }).count(), 1)
    await page.getByRole('button', { name: 'Count: 0', exact: true }).last().click()
    await page.getByRole('button', { name: 'Count: 1', exact: true }).waitFor()
  })
  if (cacheComponents) await scenario('cache-components', async () => {
    console.log('Checking Cache Components')
    await visit(`${origin}/cached`)
    await page.getByRole('heading', { name: 'Cached content', exact: true }).waitFor()
    await page.getByRole('heading', { name: 'Request content', exact: true }).waitFor()
    await page.waitForFunction(() => document.querySelector('button[data-ready="true"]'))
    await page.getByRole('button', { name: 'Count: 0', exact: true }).click()
    await page.getByRole('button', { name: 'Count: 1', exact: true }).waitFor()
    // Full prefetch captures the JSX owner stack in development. The ordinary
    // automatic-prefetch links above do not exercise that diagnostic call.
    await visit(`${origin}/owner-stack`)
    await page.getByRole('heading', { name: 'Owner stack link', exact: true }).waitFor()
    await page.waitForFunction(() => document.querySelector('button[data-ready="true"]'))
    await page.getByRole('button', { name: 'Count: 0', exact: true }).click()
    await page.getByRole('button', { name: 'Count: 1', exact: true }).waitFor()
    await page.getByRole('link', { name: 'Open target', exact: true }).click()
    await page.getByRole('heading', { name: 'Other page', exact: true }).waitFor()
  })
  await scenario('pages-router', async () => {
    console.log('Checking Pages Router')
    await freshPage()
    await visit(`${origin}/legacy`)
    await page.waitForFunction(() => !!window.next?.router?.isReady)
    assert.equal(await page.evaluate(() => !!globalThis[Symbol.for('@tanstack/redact.ReactSharedInternals')]), !reference, 'The selected renderer must hydrate Pages Router')
    await page.getByRole('button', { name: 'Count: 0', exact: true }).click()
    await page.getByRole('button', { name: 'Count: 1', exact: true }).waitFor()
    await page.getByRole('link', { name: 'Next legacy page' }).click()
    await page.getByRole('heading', { name: 'Other legacy page' }).waitFor()
  })
  if (!production) await scenario('fast-refresh', async () => {
    console.log('Checking Fast Refresh preserves state')
    await visit(origin)
    await page.waitForFunction(() => document.querySelector('button[data-ready="true"]'))
    await page.getByRole('button', { name: 'Count: 0', exact: true }).click()
    const source = resolve(cwd, 'app/counter.jsx')
    const original = await readFile(source, 'utf8')
    try {
      await writeFile(source, original.replace('Count: {count}', 'Clicks: {count}'))
      await page.getByRole('button', { name: 'Clicks: 1', exact: true }).waitFor().catch(async error => { console.error('Refresh buttons:', await page.locator('button').allTextContents(), errors); throw error })
    } finally { await writeFile(source, original) }
    await page.getByRole('button', { name: 'Count: 1', exact: true }).waitFor()
  })
  await checkExtended({ page, context, origin, production, errors, visit, reload, flushErrors, scenario, beforeBoundaryReset, isExpectedBoundaryLog, scenarios: scenarioNames })
  try { await closePage(); assert.deepEqual(errors, [], 'Unexpected browser errors during cleanup') }
  finally { await context.close() }
  assert.ok(scenarios.length > 0, 'At least one scenario must run')
  return { passed: scenarios.every(result => result.passed), scenarios, expectedNavigationCancellations: cancellations.length }
}
