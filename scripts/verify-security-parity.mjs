import { build } from 'esbuild'
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const cases = {
  'trusted-client': '',
  'trusted-hydration': '<section><b>trusted &amp; safe</b></section>',
  'trusted-table-hydration': '<table><tbody><tr><td>trusted</td></tr></tbody></table>',
  'trusted-svg-hydration': '<svg><text>trusted</text></svg>',
  'trusted-iframe-client': '',
  'trusted-iframe-hydration': '<iframe srcdoc="&lt;b&gt;trusted &amp;amp; safe&lt;/b&gt;"></iframe>',
  'nonce-hydration': '<div id="nonce-target" nonce="parity-test">nonce content</div>',
  'nonce-head-hydration': '',
}
const variants = (process.env.VARIANTS || 'react,redact').split(',')
const sources = {
  'react/jsx-runtime': 'react/jsx-runtime.ts', react: 'react/index.ts',
  'react-dom': 'dom/index.ts', 'react-dom/client': 'dom/client.ts',
}
const bundles = new Map()
for (const variant of variants) {
  const paths = Object.fromEntries(Object.entries(sources).map(([name, path]) => [name,
    variant === 'react' ? resolve('benchmarks/reference/node_modules', name + (name.includes('/') ? '.js' : '/index.js'))
      : resolve(process.env.REDACT_SOURCE || 'packages/redact/src', path),
  ]))
  const result = await build({
    entryPoints: ['scripts/fixtures/security-parity.tsx'], bundle: true, write: false,
    format: 'iife', platform: 'browser', target: 'es2022',
    define: { 'process.env.NODE_ENV': JSON.stringify(process.env.MODE || 'development') },
    plugins: [{ name: 'renderer', setup(b) { b.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, args => ({ path: paths[args.path] })) } }],
  })
  bundles.set(variant, result.outputFiles[0].text)
}
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost')
  const variant = url.searchParams.get('variant')
  if (url.pathname === '/fixture.js') {
    response.setHeader('content-type', 'text/javascript')
    response.end(bundles.get(variant))
  } else {
    response.setHeader('content-type', 'text/html')
    response.setHeader('content-security-policy', "script-src 'nonce-parity-test'; require-trusted-types-for 'script'; trusted-types redact-parity")
    const head = url.searchParams.get('case') === 'nonce-head-hydration' ? '<style id="nonce-head-target" nonce="parity-test">p {color:red}</style>' : ''
    response.end(`<!doctype html><html><head>${head}</head><body><div id="root">${cases[url.searchParams.get('case')] || ''}</div><script nonce="parity-test" src="/fixture.js?variant=${variant}"></script></body></html>`)
  }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
let failed = 0
try {
  for (const variant of variants) for (const kind of Object.keys(cases)) {
    const page = await browser.newPage()
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(String(error)))
    await page.goto(`http://127.0.0.1:${server.address().port}/?variant=${variant}&case=${kind}`)
    const result = await page.evaluate(kind => window.verifySecurityParity(kind), kind)
    try {
      assert.equal(result.committed, true)
      assert.deepEqual(result.errors, [])
      assert.deepEqual(pageErrors, [])
      assert.equal(result.thrown, undefined)
      if (!kind.endsWith('client')) assert.equal(result.sameNode, true)
      assert.equal(result.text, kind.endsWith('client') ? 'updated & safe' : kind === 'nonce-head-hydration' ? 'p {color:red}' : kind === 'nonce-hydration' ? 'nonce content' : kind === 'trusted-hydration' || kind.includes('iframe') ? 'trusted & safe' : 'trusted')
      if (kind.startsWith('nonce')) {
        assert.equal(result.nonce, 'parity-test')
        assert.equal(result.nonceAttribute, '')
      }
      console.log(`PASS ${variant} ${kind}`)
    } catch (error) {
      failed++
      console.error(`FAIL ${variant} ${kind}`, JSON.stringify({ result, pageErrors }), error.message)
    }
    await page.close()
  }
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
}
if (failed) process.exitCode = 1
