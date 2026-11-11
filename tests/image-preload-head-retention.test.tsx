import { expect, it } from 'vitest'
import { Suspense } from 'react'
import { renderToReadableStream, renderToString } from 'react-dom/server'

function Page({ children }: { children?: any }) {
  return <html><head /><body>{children}</body></html>
}

it('keeps metadata discovered before a later child throws in the document head', () => {
  function Broken(): null { throw new Error('later child') }
  const html = renderToString(<Page><Suspense fallback={<p>fallback</p>}>
    <meta name="viewport" content="before-error" /><Broken />
  </Suspense></Page>)
  expect(html.slice(0, html.indexOf('</head>'))).toContain('content="before-error"')
  expect(html.match(/content="before-error"/g)).toHaveLength(1)
})

it.each([1, 2])('keeps %s authored metadata occurrence in the first streamed head', async count => {
  let release!: () => void
  let ready = false
  const pending = new Promise<void>(resolve => { release = () => { ready = true; resolve() } })
  function Late() { if (!ready) throw pending; return <p>ready</p> }
  const stream = await renderToReadableStream(<Page><Suspense fallback={<p>wait</p>}>
    {Array.from({ length: count }, (_, i) => <meta key={i} name="viewport" content="before-suspend" />)}
    <Late />
  </Suspense></Page>)
  const reader = stream.getReader(), decoder = new TextDecoder()
  try {
    const shell = decoder.decode((await reader.read()).value)
    expect(shell.slice(0, shell.indexOf('</head>')).match(/content="before-suspend"/g)).toHaveLength(count)
    release()
    let html = shell
    for (;;) { const next = await reader.read(); if (next.done) break; html += decoder.decode(next.value) }
    expect(html.match(/content="before-suspend"/g)).toHaveLength(count)
  } finally { release(); await reader.cancel() }
})
