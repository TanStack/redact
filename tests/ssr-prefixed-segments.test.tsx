import { afterEach, expect, it, vi } from 'vitest'
import { Suspense, createElement as h } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToReadableStream, renderToString } from 'react-dom/server'

const roots: Array<{ unmount(): void }> = []
afterEach(() => { for (const root of roots.splice(0)) root.unmount(); document.body.innerHTML = '' })
function gate() {
  let resolve!: () => void, ready = false
  const promise = new Promise<void>(r => { resolve = r })
  return { read() { if (!ready) throw promise }, resolve() { ready = true; resolve() } }
}
function install(html: string) {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  for (const script of container.querySelectorAll('script')) new Function(script.textContent!)()
  return container
}

it.each([undefined, '', 'app-', ':R'])('uses the same transport prefix in string and stream shells (prefix %s)', async prefix => {
  const pending = gate()
  function Async() { pending.read(); return <span>ready</span> }
  const tree = <Suspense fallback={null}><Async /></Suspense>
  const options = prefix === undefined ? {} : { identifierPrefix: prefix }
  const marker = `id="${prefix ?? ''}B:0"`
  expect(renderToString(tree, options)).toContain(marker)
  const stream = await renderToReadableStream(tree, options)
  pending.resolve()
  expect(await new Response(stream).text()).toContain(marker)
})

it('addresses a failed streamed boundary with its prefixed transport ID', async () => {
  const pending = gate(), error = new Error('failed segment'), onError = vi.fn()
  function Async(): never { pending.read(); throw error }
  const stream = await renderToReadableStream(<Suspense fallback={null}><Async /></Suspense>, { identifierPrefix: 'failure-', onError })
  pending.resolve()
  expect(await new Response(stream).text()).toContain('$RB("failure-B:0",1)')
  expect(onError).toHaveBeenCalledWith(error)
})

it('emits prefixed hexadecimal boundary/segment IDs and two-ID $RC calls', async () => {
  const pending = gate(), prefix = 'modern-js-'
  function Async({ index }: { index: number }) { pending.read(); return <span>{index}</span> }
  const tree = <main>{Array.from({ length: 18 }, (_, index) => <Suspense key={index} fallback={<i>loading</i>}><Async index={index} /></Suspense>)}</main>
  const stream = await renderToReadableStream(tree, { identifierPrefix: prefix })
  pending.resolve()
  const html = await new Response(stream).text()
  for (let id = 0; id < 18; id++) {
    const hex = id.toString(16)
    expect(html).toContain(`id="modern-js-B:${hex}"`)
    expect(html).toContain(`id="modern-js-S:${hex}"`)
    expect(html).toContain(`$RC("modern-js-B:${hex}","modern-js-S:${hex}")`)
  }
  const container = install(html), main = container.firstElementChild, error = vi.fn()
  roots.push(hydrateRoot(container, tree, { identifierPrefix: prefix, onRecoverableError: error }))
  expect(error).not.toHaveBeenCalled()
  expect(container.firstElementChild).toBe(main)
  expect(container.querySelectorAll('span')).toHaveLength(18)
})

it('keeps prefixes isolated for two streams revealed after both shells arrive', async () => {
  const a = gate(), b = gate()
  function Async({ pending, label }: { pending: ReturnType<typeof gate>; label: string }) { pending.read(); return <span>{label}</span> }
  const one = await renderToReadableStream(<Suspense fallback={null}><Async pending={a} label="one" /></Suspense>, { identifierPrefix: 'one-' })
  const two = await renderToReadableStream(<Suspense fallback={null}><Async pending={b} label="two" /></Suspense>, { identifierPrefix: 'two-' })
  const ra = one.getReader(), rb = two.getReader(), decoder = new TextDecoder()
  const ca = install(decoder.decode((await ra.read()).value)), cb = install(decoder.decode((await rb.read()).value))
  a.resolve(); b.resolve()
  for (const [reader, container] of [[ra, ca], [rb, cb]] as const) {
    let html = ''
    for (;;) { const { done, value } = await reader.read(); if (done) break; html += decoder.decode(value) }
    const transport = document.createElement('div'); transport.innerHTML = html
    const scripts = [...transport.querySelectorAll('script')]
    while (transport.firstChild) container.appendChild(transport.firstChild)
    for (const script of scripts) new Function(script.textContent!)()
  }
  expect(ca.querySelector('span')!.textContent).toBe('one')
  expect(cb.querySelector('span')!.textContent).toBe('two')
})

it('finds a prefixed hexadecimal placeholder when hydration precedes reveal', async () => {
  const pending = gate(), prefix = 'modern-js-'
  function Async() { pending.read(); return <button>ready</button> }
  const tree = <main>{Array.from({ length: 10 }, (_, index) => <Suspense key={index} fallback={null}><span>{index}</span></Suspense>)}<Suspense fallback={<i>loading</i>}><Async /></Suspense></main>
  const stream = await renderToReadableStream(tree, { identifierPrefix: prefix }), reader = stream.getReader(), decoder = new TextDecoder()
  const container = install(decoder.decode((await reader.read()).value)), main = container.firstElementChild, error = vi.fn()
  roots.push(hydrateRoot(container, tree, { identifierPrefix: prefix, onRecoverableError: error }))
  expect(container.querySelector('[id="modern-js-B:a"]')).not.toBeNull()
  pending.resolve()
  let html = ''
  for (;;) { const { done, value } = await reader.read(); if (done) break; html += decoder.decode(value) }
  const transport = document.createElement('div'); transport.innerHTML = html
  const scripts = [...transport.querySelectorAll('script')]
  while (transport.firstChild) container.appendChild(transport.firstChild)
  for (const script of scripts) new Function(script.textContent!)()
  expect(error).not.toHaveBeenCalled()
  expect(container.firstElementChild).toBe(main)
  expect(container.querySelector('button')!.textContent).toBe('ready')
})

it('uses recognized $RR stylesheet instructions and safely escapes transport prefixes', async () => {
  const pending = gate()
  function Async() { pending.read(); return <><link rel="stylesheet" href="/late.css" precedence="default" /><span>ready</span></> }
  const prefix = 'quote-"</script><script>throw 1</script>&'
  const tree = <main>{Array.from({ length: 10 }, (_, index) => <Suspense key={index} fallback={null}><span>{index}</span></Suspense>)}<Suspense fallback={<i>loading</i>}><Async /></Suspense></main>
  const stream = await renderToReadableStream(tree, { identifierPrefix: prefix, nonce: 'test-nonce' })
  pending.resolve()
  const html = await new Response(stream).text()
  const boundaryId = `${prefix}B:a`, segmentId = `${prefix}S:a`
  const scriptId = (id: string) => JSON.stringify(id).replace(/</g, '\\u003c')
  expect(html).not.toContain('</script><script>throw 1')
  expect(html).toContain(`$RR(${scriptId(boundaryId)},${scriptId(segmentId)},`)
  expect(html).toContain('nonce="test-nonce"')
  expect(html).toContain('\\u003c/script>')

  const container = install(html)
  const boundary = document.getElementById(boundaryId)!
  const segment = document.getElementById(segmentId) as HTMLDivElement
  const ready = segment.querySelector('span')!
  const stylesheet = document.head.querySelector<HTMLLinkElement>('link[href="/late.css"]')!
  try {
    expect(stylesheet).not.toBeNull()
    // Let an incorrectly ungated $RR promise reveal before checking the fallback.
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.getElementById(boundaryId)).toBe(boundary)
    expect(boundary.textContent).toBe('loading')
    expect(segment.hidden).toBe(true)
    expect(ready.parentElement).toBe(segment)
    expect(container.querySelector('i')!.textContent).toBe('loading')

    stylesheet.dispatchEvent(new Event('load'))
    await vi.waitFor(() => {
      expect(document.getElementById(boundaryId)).toBeNull()
      expect(document.getElementById(segmentId)).toBeNull()
      expect(container.querySelector('i')).toBeNull()
      expect(ready.parentElement).toBe(container.querySelector('main'))
      expect(ready.textContent).toBe('ready')
    })
  } finally {
    stylesheet?.remove()
  }
})
