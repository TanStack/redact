import { expect, it } from 'vitest'
import { createContext, createElement as h, Suspense, useContext } from 'react'
import { renderToReadableStream } from 'react-dom/server'

it('keeps sibling payloads and captured context distinct across a second suspension', async () => {
  const C = createContext('root')
  let firstDone = false, secondDone = false
  let releaseFirst!: () => void, releaseSecond!: () => void, sawSecond!: () => void
  const first = new Promise<void>(resolve => { releaseFirst = () => { firstDone = true; resolve() } })
  const second = new Promise<void>(resolve => { releaseSecond = () => { secondDone = true; resolve() } })
  const enteredSecond = new Promise<void>(resolve => { sawSecond = resolve })
  function Child({ name }: { name: string }) {
    if (!firstDone) throw first
    if (name === 'a' && !secondDone) { sawSecond(); throw second }
    return h('b', null, name + ':' + useContext(C))
  }
  const stream = await renderToReadableStream(h('main', null,
    h(C.Provider, { value: 'one' }, h(Suspense, { fallback: 'wait-a' }, h(Child, { name: 'a' }))),
    h(C.Provider, { value: 'two' }, h(Suspense, { fallback: 'wait-b' }, h(Child, { name: 'b' }))),
  ))
  const reader = stream.getReader(), decoder = new TextDecoder()
  let html = decoder.decode((await reader.read()).value)
  const draining = (async () => { for (;;) { const chunk = await reader.read(); if (chunk.done) break; html += decoder.decode(chunk.value) } })()
  releaseFirst()
  await enteredSecond
  releaseSecond()
  await draining
  await stream.allReady
  expect(html).toContain('<b>a:one</b>')
  expect(html).toContain('<b>b:two</b>')
  expect(html.match(/<b>a:one<\/b>/g)).toHaveLength(1)
  expect(html.match(/<b>b:two<\/b>/g)).toHaveLength(1)
  expect((C as any)._currentValue).toBe('root')
})
