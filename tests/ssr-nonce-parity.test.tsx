// @vitest-environment node
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { Suspense, use } from 'react'
import { renderToReadableStream } from 'react-dom/server'

const { JSDOM } = createRequire(import.meta.url)('jsdom')
const nonce = 'nonce" data-injected="yes & <value>'

async function text(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader(), decoder = new TextDecoder()
  let html = ''
  for (;;) { const { value, done } = await reader.read(); if (done) break; html += decoder.decode(value, { stream: true }) }
  return html + decoder.decode()
}

function check(html: string, sources: string[] = []) {
  const dom = new JSDOM(html)
  try {
    const scripts = Array.from(dom.window.document.querySelectorAll('script')) as HTMLScriptElement[]
    expect(scripts.length).toBeGreaterThan(0)
    for (const script of scripts) expect(script.nonce).toBe(nonce)
    expect(dom.window.document.querySelector('[data-injected]')).toBeNull()
    for (const source of sources) expect(scripts.some(script => script.getAttribute('src') === source)).toBe(true)
  } finally { dom.window.close() }
}

it('escapes bootstrap nonce and script URLs without changing their values', async () => {
  const script = '/main.js?x=" data-injected="yes&y=<value>'
  const module = '/module.js?x=" data-injected="yes&y=<value>'
  const stream = await renderToReadableStream(<div>ready</div>, {
    nonce, bootstrapScriptContent: 'void 0', bootstrapScripts: [script], bootstrapModules: [module],
  })
  check(await text(stream), [script, module])
})

it.each(['reveal', 'abort'] as const)('escapes nonce on the streamed %s script', async mode => {
  let resolve!: () => void
  const pending = new Promise<void>(wake => { resolve = wake })
  function Child() { use(pending); return <b>ready</b> }
  const controller = new AbortController()
  const stream = await renderToReadableStream(<div><Suspense fallback={<i>loading</i>}><Child /></Suspense></div>, {
    nonce, signal: controller.signal, onError() {},
  })
  const reader = stream.getReader(), decoder = new TextDecoder()
  let html = decoder.decode((await reader.read()).value)
  if (mode === 'abort') controller.abort(new Error('stop'))
  else resolve()
  for (;;) { const { value, done } = await reader.read(); if (done) break; html += decoder.decode(value, { stream: true }) }
  check(html + decoder.decode())
})
