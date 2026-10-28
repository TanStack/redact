import { afterEach, expect, it, vi } from 'vitest'
import { Suspense, useLayoutEffect, useState } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToReadableStream } from 'react-dom/server'
import { BOUNDARY_REVEAL_RUNTIME } from '../packages/redact/src/server/bootstrap-script'

const cleanup: Array<() => void> = []
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose()
  ;(window as any).$RE_stop?.()
  for (const name of ['$RH', '$RC', '$RL', '$RR', '$RB', '$RE_q', '$RE_stop', '__pendingReveals']) delete (window as any)[name]
  vi.unstubAllGlobals()
})

it.each(['keep', 'replace', 'retarget', 'unmount'])('owns a pending stream range through %s and its late reveal', async action => {
  let ready = false, resolve!: () => void
  const pending = new Promise<void>(yes => { resolve = () => { ready = true; yes() } })
  const effect = vi.fn()
  function Child() {
    if (!ready) throw pending
    const [count, setCount] = useState(0)
    useLayoutEffect(effect, [])
    return <button onClick={() => setCount(n => n + 1)}>READY{count}</button>
  }
  const tree = <main><Suspense fallback={<i>LOADING</i>}><Child /></Suspense><em>STAYS</em></main>
  const stream = await renderToReadableStream(tree)
  const reader = stream.getReader()
  const shell = new TextDecoder().decode((await reader.read()).value)
  const container = document.createElement('div')
  container.innerHTML = shell
  document.body.append(container)
  cleanup.push(() => container.remove())
  // Expose only the existing private registry; keep registration/reveal control flow unchanged.
  for (const script of container.querySelectorAll('script')) new Function(script.textContent!.replace('var c={},r=new Map;', 'var c=window.__pendingReveals={},r=new Map;'))()
  const registrations = (window as any).__pendingReveals as Record<string, () => void>
  const root = hydrateRoot(container, tree)
  const sibling = container.querySelector('em')
  expect(Object.keys(registrations)).toEqual(['0'])
  expect(container.querySelector('i')?.textContent).toBe('LOADING')
  if (action === 'replace') {
    flushSync(() => root.render(<main><strong>REPLACEMENT</strong><em>STAYS</em></main>))
    cleanup.push(() => root.unmount())
    expect(container.querySelector('em')).toBe(sibling)
  } else if (action === 'retarget') {
    flushSync(() => root.render(<main><Suspense fallback={<i>LOADING</i>}><strong>REPLACEMENT</strong></Suspense><em>STAYS</em></main>))
    cleanup.push(() => root.unmount())
    expect(container.querySelector('em')).toBe(sibling)
  } else if (action === 'unmount') flushSync(() => root.unmount())
  else cleanup.push(() => root.unmount())
  if (action !== 'keep') {
    expect(container.querySelector('i, template')).toBeNull()
    expect(Object.keys(registrations)).toEqual([])
  }
  resolve()
  let tail = ''
  for (;;) { const chunk = await reader.read(); if (chunk.done) break; tail += new TextDecoder().decode(chunk.value) }
  const transport = document.createElement('div')
  transport.innerHTML = tail
  document.body.append(transport)
  cleanup.push(() => transport.remove())
  const serverButton = transport.querySelector('button')
  for (const script of transport.querySelectorAll('script')) new Function(script.textContent!)()
  await Promise.resolve()
  expect(Object.keys(registrations)).toEqual([])
  expect(transport.querySelector('[id^="S:"]')).toBeNull()
  if (action === 'keep') {
    await vi.waitFor(() => expect(effect).toHaveBeenCalledTimes(1))
    expect(container.querySelector('button')).toBe(serverButton)
    flushSync(() => serverButton!.click())
    expect(serverButton!.textContent).toBe('READY1')
  } else {
    expect(effect).not.toHaveBeenCalled()
    expect(container.querySelector('button,i,template')).toBeNull()
    expect(container.querySelector('main')?.textContent ?? '').toBe(action === 'unmount' ? '' : 'REPLACEMENTSTAYS')
  }
})

it('does not retry a deleted pending boundary when its registered reveal callback fires', () => {
  let reveal!: () => void
  vi.stubGlobal('$RH', (_id: string, callback: () => void) => { reveal = callback })
  const container = document.createElement('div')
  container.innerHTML = '<!--$?0--><div id="B:0"><i>LOADING</i></div><!--/$-->'
  document.body.append(container)
  cleanup.push(() => container.remove())
  const effect = vi.fn()
  function Child() { effect(); return <b>READY</b> }
  const root = hydrateRoot(container, <Suspense fallback={<i>LOADING</i>}><Child /></Suspense>)
  flushSync(() => root.render(<strong>REPLACEMENT</strong>))
  reveal()
  expect(effect).not.toHaveBeenCalled()
  expect(container.innerHTML).toBe('<strong>REPLACEMENT</strong>')
  root.unmount()
})

it('does not let a retired subscription dispose a newer registration for the same boundary', () => {
  const container = document.createElement('div')
  container.innerHTML = '<div id="B:0"></div><div id="S:0"><b>ready</b></div>'
  document.body.append(container)
  cleanup.push(() => container.remove())
  const first = vi.fn(), second = vi.fn()
  new Function(BOUNDARY_REVEAL_RUNTIME)()
  const dispose = (window as any).$RH(0, first)
  ;(window as any).$RH(0, second)
  expect(dispose).toBeTypeOf('function')
  dispose()
  ;(window as any).$RC(0)
  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledTimes(1)
})
