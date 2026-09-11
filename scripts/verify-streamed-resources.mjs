import { build } from 'esbuild'
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const directory = '/tmp/redact-streamed-resource-fixtures'
mkdirSync(directory, { recursive: true })
const require = createRequire(import.meta.url)
const variants = (process.env.VARIANTS || 'react,redact').split(',')
const modules = new Map(), runs = new Map(), sheets = new Map()
for (const variant of variants) {
  const paths = variant === 'react' ? {
    react: resolve('benchmarks/reference/node_modules/react/index.js'),
    'react/jsx-runtime': resolve('benchmarks/reference/node_modules/react/jsx-runtime.js'),
    'react-dom/server': resolve('benchmarks/reference/node_modules/react-dom/server.browser.js'),
  } : Object.fromEntries(Object.entries({ react: 'react/index.ts', 'react/jsx-runtime': 'react/jsx-runtime.ts', 'react-dom/server': 'server/index.ts' })
    .map(([name, path]) => [name, resolve(process.env.REDACT_SOURCE || 'packages/redact/src', path)]))
  const outfile = resolve(directory, `${variant}.cjs`)
  await build({ entryPoints: ['scripts/fixtures/streamed-resources.tsx'], outfile, bundle: true, format: 'cjs', platform: 'node', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'renderer', setup(b) { b.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, args => ({ path: paths[args.path] })) } }],
  })
  modules.set(variant, require(outfile))
}
const css = '#content-a{color:rgb(7, 8, 9)}'
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost')
  if (url.pathname === '/blocked.css') {
    response.setHeader('content-type', 'text/css')
    sheets.set(url.searchParams.get('run'), response)
    return
  }
  const variant = url.searchParams.get('variant'), id = url.searchParams.get('run')
  if (!modules.has(variant)) { response.writeHead(404).end(); return }
  const run = await modules.get(variant).resourceStream(id, url.searchParams.get('mode'))
  runs.set(id, run)
  response.setHeader('content-type', 'text/html')
  response.setHeader('content-security-policy', "script-src 'nonce-stream-script'; style-src 'nonce-stream-style' 'self'")
  const reader = run.stream.getReader()
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; response.write(value) } }
  finally { response.end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
let failed = 0
try {
  for (const variant of variants) for (const mode of ['load', 'error', 'unmatched']) {
    const id = `${variant}-${mode}-${Date.now()}`
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(String(error)))
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}/?variant=${variant}&run=${id}&mode=${mode}`, { waitUntil: 'commit' })
      await page.locator('#fallback-a').waitFor({ state: 'visible' })
      const requested = page.waitForRequest(request => request.url().includes('/blocked.css'))
      runs.get(id).releaseA()
      await requested
      if (mode !== 'unmatched') assert.equal(await page.locator('#fallback-a').isVisible(), true)
      else await page.locator('#content-a').waitFor({ state: 'visible' })
      runs.get(id).releaseB()
      let independent = true
      try { await page.locator('#content-b').waitFor({ state: 'visible', timeout: 2500 }) }
      catch { independent = false }
      for (let count = 0; !sheets.has(id) && count < 100; count++) await new Promise(resolve => setTimeout(resolve, 10))
      assert.ok(sheets.has(id), 'stylesheet request arrived')
      if (mode === 'error') sheets.get(id).writeHead(404)
      sheets.get(id).end(mode === 'error' ? '' : css)
      sheets.delete(id)
      if (mode === 'error') {
        await page.waitForFunction(() => {
          const comments = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT)
          for (let comment = comments.nextNode(); comment; comment = comments.nextNode()) {
            if (/^\$(?:!|E)/.test(comment.data)) return true
          }
          return false
        })
        assert.equal(await page.locator('#fallback-a').isVisible(), true)
        assert.equal(await page.locator('#content-a').isVisible(), false)
        assert.equal(independent, true, 'unrelated boundary reveals while CSS fails')
        assert.deepEqual(errors, [])
        console.log(`PASS ${variant} failed stylesheet preserves fallback and independent reveal`)
        continue
      }
      await page.locator('#content-a').waitFor({ state: 'visible' })
      const result = await page.evaluate(() => ({
        color: getComputedStyle(document.querySelector('#content-a')).color,
        border: getComputedStyle(document.querySelector('#content-a')).borderTopWidth,
        bodyResources: document.body.querySelectorAll('link[data-precedence],style[data-precedence]').length,
        precedence: Array.from(document.head.querySelectorAll('[data-precedence]'), node => node.getAttribute('data-precedence')),
        styleNonces: Array.from(document.head.querySelectorAll('style[data-precedence]'), node => node.nonce),
        scriptNonces: Array.from(document.querySelectorAll('script'), node => node.nonce),
      }))
      assert.equal(result.color, mode === 'unmatched' ? 'rgb(1, 2, 3)' : 'rgb(7, 8, 9)')
      assert.equal(result.border, '7px')
      assert.equal(result.bodyResources, 0)
      assert.deepEqual(result.precedence, ['base', 'base', 'theme'])
      assert.deepEqual(result.styleNonces, ['stream-style', 'stream-style'])
      assert.ok(result.scriptNonces.length > 0)
      assert.ok(result.scriptNonces.every(nonce => nonce === 'stream-script'))
      assert.deepEqual(errors, [])
      assert.equal(independent, true, 'unrelated boundary reveals while CSS is pending')
      console.log(`PASS ${variant} ${mode} stylesheet, inline style, precedence and independent reveal`)
    } catch (error) { failed++; console.error(`FAIL ${variant} ${mode}`, error.message, JSON.stringify(errors)) }
    finally {
      sheets.get(id)?.end(css)
      sheets.delete(id)
      runs.get(id)?.releaseA(); runs.get(id)?.releaseB()
      await page.close()
    }
  }
} finally {
  await browser.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
process.exit(failed ? 1 : 0)
