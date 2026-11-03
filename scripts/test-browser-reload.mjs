import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { chromium, firefox, webkit } from 'playwright'
import { reloadDocument } from './browser-reload.mjs'

const requests = new Map()
const server = createServer((request, response) => {
  if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return }
  const url = new URL(request.url, 'http://localhost')
  const key = url.search, count = (requests.get(key) || 0) + 1
  requests.set(key, count)
  const mode = url.searchParams.get('mode')
  const script = mode === 'interrupted' ? "let scheduled=false;addEventListener('beforeunload',()=>{if(!scheduled){scheduled=true;setTimeout(()=>location.reload(),50)}})" :
    mode === 'canceled' ? "addEventListener('beforeunload',event=>{event.preventDefault();event.returnValue=''})" : ''
  if (mode === 'redirected' && count > 1) {
    response.writeHead(302, { location: '/?engine=' + url.searchParams.get('engine') + '&mode=target' }); response.end(); return
  }
  setTimeout(() => {
    response.writeHead(mode.startsWith('server-error') && count > 1 ? 500 : 200, { 'content-type': 'text/html' })
    response.end(`<h1>Document ${count}</h1><button>Activate</button><script>${script}</script>`)
  }, mode === 'interrupted' && count > 1 ? 300 : 0)
})
server.listen(0, '127.0.0.1'); await once(server, 'listening')
const types = { chromium, firefox, webkit }
const engines = process.env.PLAYWRIGHT_BROWSER ? [process.env.PLAYWRIGHT_BROWSER] : Object.keys(types)
try {
  for (const engine of engines) {
    const browser = await types[engine].launch({ headless: true })
    try {
      for (const mode of ['normal', 'interrupted', 'canceled', 'server-error', 'redirected', 'missing-response-event', 'server-error-missing-response-event']) {
        const page = await browser.newPage()
        page.setDefaultTimeout(1500)
        await page.goto(`http://127.0.0.1:${server.address().port}/?engine=${engine}&mode=${mode}`)
        const previous = await page.evaluate(() => performance.timeOrigin)
        // Reproduce a missing Playwright response event while the real browser
        // still loads a document. URL, time origin and HTTP status remain real.
        const reloadPage = mode.includes('missing-response-event') ? new Proxy(page, {
          get(target, key) {
            if (key === 'on' || key === 'off') return (event, listener) => {
              if (event !== 'response') target[key](event, listener)
              return target
            }
            const value = Reflect.get(target, key)
            return typeof value === 'function' ? value.bind(target) : value
          },
        }) : page
        if (mode === 'canceled') {
          await page.getByRole('button').click()
          let dismissed = false
          page.once('dialog', async dialog => { dismissed = true; await dialog.dismiss() })
          await assert.rejects(reloadDocument(reloadPage, { timeout: 1500 }))
          assert.equal(dismissed, true)
          assert.equal(await page.evaluate(() => performance.timeOrigin), previous)
        } else if (mode.startsWith('server-error')) await assert.rejects(reloadDocument(reloadPage), /received 500/)
        else if (mode === 'redirected') await assert.rejects(reloadDocument(reloadPage), /preserve the current URL/)
        else {
          await reloadDocument(reloadPage)
          assert.notEqual(await page.evaluate(() => performance.timeOrigin), previous)
          await page.getByRole('heading', { name: mode === 'interrupted' ? 'Document 3' : 'Document 2', exact: true }).waitFor()
        }
        await page.close()
        console.log(`PASS ${engine}: ${mode} reload`)
      }
    } finally { await browser.close() }
  }
} finally { server.closeAllConnections(); await new Promise(done => server.close(done)) }
