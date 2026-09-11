import { afterEach, expect, it, vi } from 'vitest'
import React, { ViewTransition, Activity, addTransitionType, cache, cacheSignal, unstable_useCacheRefresh, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToString } from 'react-dom/server'
import type { ReactNode } from 'react'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })
function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return { container, render: (node: ReactNode) => flushSync(() => root.render(node)) }
}

it('exposes the new APIs through named and default React imports', () => {
  expect(ViewTransition).toBe(Symbol.for('react.view_transition'))
  expect(Activity).toBe(Symbol.for('react.activity'))
  expect(React.ViewTransition).toBe(ViewTransition)
  expect(React.Activity).toBe(Activity)
  expect(React.addTransitionType).toBe(addTransitionType)
  expect(React.cacheSignal).toBe(cacheSignal)
  expect(React.unstable_useCacheRefresh).toBe(unstable_useCacheRefresh)
})

it('preserves state and DOM through synchronous ViewTransition updates without animation callbacks', () => {
  const { container, render } = setup()
  let set!: (value: number) => void
  const animated = vi.fn()
  function Child({ label }: { label: string }) {
    const [value, update] = useState(0)
    set = update
    return <button>{label}:{value}</button>
  }
  const view = (label: string) => <ViewTransition name="example" onEnter={animated} onUpdate={animated} onExit={animated}><Child label={label} /></ViewTransition>
  render(view('one'))
  const button = container.firstChild
  flushSync(() => set(2))
  render(view('two'))
  expect(container.firstChild).toBe(button)
  expect(container.textContent).toBe('two:2')
  expect(animated).not.toHaveBeenCalled()
  expect((button as HTMLElement).style.viewTransitionName).toBe('')
})

it('keeps ViewTransition a distinct component boundary from Fragment', () => {
  const { container, render } = setup()
  let set!: (value: number) => void
  function Child() {
    const [value, update] = useState(0)
    set = update
    return <span>{value}</span>
  }
  render(<ViewTransition><Child /></ViewTransition>)
  flushSync(() => set(4))
  render(<React.Fragment><Child /></React.Fragment>)
  expect(container.textContent).toBe('0')
})

it('accepts transition types without changing synchronous state commits', () => {
  const { container, render } = setup()
  let set!: (value: number) => void
  function Child() { const [n, update] = useState(0); set = update; return <span>{n}</span> }
  render(<Child />)
  addTransitionType('outside')
  flushSync(() => { addTransitionType('inside'); set(3) })
  expect(container.textContent).toBe('3')
})

it('has no cache signal or memoization in the client/DOM server entry', () => {
  expect(cacheSignal()).toBe(null)
  const compute = vi.fn(() => cacheSignal())
  const cached = cache(compute)
  function Child() { expect(cached()).toBe(null); expect(cached()).toBe(null); return <span>ready</span> }
  const { render } = setup()
  render(<Child />)
  expect(compute).toHaveBeenCalledTimes(2)
  compute.mockClear()
  expect(renderToString(<Child />)).toContain('ready')
  expect(compute).toHaveBeenCalledTimes(2)
})

it('keeps a stable cache refresh callback and preserves uncached client state', () => {
  const { container, render } = setup()
  let set!: (value: number) => void
  let refresh!: () => void
  const effects = vi.fn()
  function Child() {
    const [value, update] = useState(0)
    set = update
    refresh = unstable_useCacheRefresh()
    React.useLayoutEffect(effects, [])
    return <span>{value}</span>
  }
  render(<Child />)
  const first = refresh
  flushSync(() => set(2))
  expect(refresh).toBe(first)
  flushSync(refresh)
  expect(container.textContent).toBe('2')
  expect(effects).toHaveBeenCalledTimes(1)
})

it('rejects useCacheRefresh outside rendering and invoking a server refresh', () => {
  expect(() => unstable_useCacheRefresh()).toThrow()
  function Child() { const refresh = unstable_useCacheRefresh(); expect(refresh).toBeTypeOf('function'); expect(refresh).toThrow(); return <span /> }
  expect(renderToString(<Child />)).toContain('span')
})
