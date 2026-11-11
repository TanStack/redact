import { afterEach, expect, it, vi } from 'vitest'
import { Suspense, createElement as h, useLayoutEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { hydrateRoot } from 'react-dom/client'
import { renderToReadableStream, renderToString } from 'react-dom/server'

const roots: Array<{ unmount(): void }> = []
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
  ;(window as any).$RE_stop?.()
  for (const name of ['$RH', '$RC', '$RR', '$RB', '$RE_q', '$RE_stop']) delete (window as any)[name]
  document.body.innerHTML = ''
})
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

it.each(['before hydration', 'after first hydration'])('keeps pending roots interactive when the second shell arrives %s', async arrival => {
  const a = gate(), b = gate(), effects = vi.fn(), error = vi.fn()
  function Async({ pending, label }: { pending: ReturnType<typeof gate>; label: string }) {
    pending.read()
    const [count, setCount] = useState(0)
    useLayoutEffect(() => { effects(label) }, [])
    return <button onClick={() => setCount(n => n + 1)}>{label}{count}</button>
  }
  const ta = <Suspense fallback={null}><Async pending={a} label="one" /></Suspense>
  const tb = <Suspense fallback={null}><Async pending={b} label="two" /></Suspense>
  const one = await renderToReadableStream(ta, { identifierPrefix: 'one-' })
  const two = await renderToReadableStream(tb, { identifierPrefix: 'two-' })
  const ra = one.getReader(), rb = two.getReader(), decoder = new TextDecoder()
  const ca = install(decoder.decode((await ra.read()).value))
  let cb: HTMLDivElement
  if (arrival === 'before hydration') cb = install(decoder.decode((await rb.read()).value))
  roots.push(hydrateRoot(ca, ta, { identifierPrefix: 'one-', onRecoverableError: error }))
  if (arrival === 'after first hydration') cb = install(decoder.decode((await rb.read()).value))
  roots.push(hydrateRoot(cb!, tb, { identifierPrefix: 'two-', onRecoverableError: error }))
  expect(effects).not.toHaveBeenCalled()
  a.resolve(); b.resolve()
  for (const [reader, container] of [[ra, ca], [rb, cb!]] as const) {
    let html = ''
    for (;;) { const { done, value } = await reader.read(); if (done) break; html += decoder.decode(value) }
    const transport = document.createElement('div'); transport.innerHTML = html
    const scripts = [...transport.querySelectorAll('script')]
    const serverButton = transport.querySelector('button')!
    while (transport.firstChild) container.appendChild(transport.firstChild)
    for (const script of scripts) new Function(script.textContent!)()
    expect(container.querySelector('button')).toBe(serverButton)
  }
  await vi.waitFor(() => expect(effects.mock.calls).toEqual([['one'], ['two']]))
  for (const [container, label] of [[ca, 'one'], [cb!, 'two']] as const) {
    const button = container.querySelector('button')!
    expect(button.textContent).toBe(label + '0')
    flushSync(() => button.click())
    expect(container.querySelector('button')).toBe(button)
    expect(button.textContent).toBe(label + '1')
  }
  expect(error).not.toHaveBeenCalled()
})

it('finds a prefixed hexadecimal placeholder when hydration precedes reveal', async () => {
  const pending = gate(), prefix = 'modern-js-'
  const effect = vi.fn()
  function Async() {
    pending.read()
    const [count, setCount] = useState(0)
    useLayoutEffect(effect, [])
    return <button onClick={() => setCount(n => n + 1)}>ready{count}</button>
  }
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
  const serverButton = transport.querySelector('button')!
  while (transport.firstChild) container.appendChild(transport.firstChild)
  for (const script of scripts) new Function(script.textContent!)()
  expect(error).not.toHaveBeenCalled()
  expect(container.firstElementChild).toBe(main)
  await vi.waitFor(() => expect(effect).toHaveBeenCalledTimes(1))
  const button = container.querySelector('button')!
  expect(button).toBe(serverButton)
  expect(button.textContent).toBe('ready0')
  flushSync(() => button.click())
  expect(button.textContent).toBe('ready1')
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

it('captures a later stream click after the first root has hydrated', async () => {
  const pending = gate(), error = vi.fn()
  function Counter({ label }: { label: string }) {
    const [count, setCount] = useState(0)
    return <button onClick={() => setCount(n => n + 1)}>{label}{count}</button>
  }
  function Async() { pending.read(); return <span>ready</span> }
  const firstTree = <Suspense fallback={null}><Async /></Suspense>
  const first = await renderToReadableStream(firstTree, { identifierPrefix: 'first-' })
  const ra = first.getReader(), decoder = new TextDecoder()
  const ca = install(decoder.decode((await ra.read()).value))
  roots.push(hydrateRoot(ca, firstTree, { identifierPrefix: 'first-', onRecoverableError: error }))

  const laterTree = <main><Counter label="later" /><Suspense fallback={null}><Async /></Suspense></main>
  const later = await renderToReadableStream(laterTree, { identifierPrefix: 'later-' })
  const rb = later.getReader()
  const cb = install(decoder.decode((await rb.read()).value))
  const button = cb.querySelector('button')!
  button.click()
  const queue = (window as any).$RE_q
  expect(queue).toHaveLength(1)
  expect(button.textContent).toBe('later0')

  flushSync(() => roots.push(hydrateRoot(cb, laterTree, { identifierPrefix: 'later-', onRecoverableError: error })))
  expect(cb.querySelector('button')).toBe(button)
  expect(button.textContent).toBe('later1')
  expect(queue).toHaveLength(0)
  expect(error).not.toHaveBeenCalled()
  pending.resolve()
  for (const reader of [ra, rb]) while (!(await reader.read()).done) {}
})

it('discards a deleted boundary segment when its late stylesheet fails', async () => {
  const pending = gate(), effect = vi.fn(), error = vi.fn()
  function Async() {
    pending.read()
    useLayoutEffect(effect, [])
    return <><link rel="stylesheet" href="/deleted-late.css" precedence="default" /><button>obsolete</button></>
  }
  const tree = <main><Suspense fallback={<i>loading</i>}><Async /></Suspense><em>stays</em></main>
  const stream = await renderToReadableStream(tree, { identifierPrefix: 'deleted-' })
  const reader = stream.getReader(), decoder = new TextDecoder()
  const container = install(decoder.decode((await reader.read()).value))
  const root = hydrateRoot(container, tree, { identifierPrefix: 'deleted-', onRecoverableError: error })
  roots.push(root)
  flushSync(() => root.render(<section><strong>replacement</strong><em>stays</em></section>))
  expect(document.getElementById('deleted-B:0')).toBeNull()
  pending.resolve()
  let tail = ''
  for (;;) { const chunk = await reader.read(); if (chunk.done) break; tail += decoder.decode(chunk.value) }
  const transport = document.createElement('div'); transport.innerHTML = tail
  const scripts = [...transport.querySelectorAll('script')]
  while (transport.firstChild) container.appendChild(transport.firstChild)
  for (const script of scripts) new Function(script.textContent!)()
  const segment = document.getElementById('deleted-S:0')!
  const stylesheet = document.head.querySelector<HTMLLinkElement>('link[href="/deleted-late.css"]')!
  try {
    expect(segment).not.toBeNull()
    expect(segment.querySelector('button')?.textContent).toBe('obsolete')
    expect(stylesheet).not.toBeNull()
    stylesheet.dispatchEvent(new Event('error'))
    await vi.waitFor(() => expect(document.getElementById('deleted-S:0')).toBeNull())
    expect(segment.isConnected).toBe(false)
    expect(container.querySelector('section')?.textContent).toBe('replacementstays')
    expect(container.querySelector('button')).toBeNull()
    expect(effect).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  } finally {
    stylesheet?.remove()
  }
})
