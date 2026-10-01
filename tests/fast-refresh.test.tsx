import { createRequire } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'
import { Component, Suspense, forwardRef, lazy, memo, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

// Use the real runtime, including its family/signature and root bookkeeping.
const Refresh = createRequire(import.meta.url)('react-refresh/runtime')
Refresh.injectIntoGlobalHook(globalThis)
let nextID = 0
const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  expect(Refresh._getMountedRootCount()).toBe(0)
})

function family(type: any, signature?: string) {
  const id = `test-${nextID++}`
  function register(next: any, key = signature) {
    if (key !== undefined) Refresh.setSignature(next, key)
    Refresh.register(next, id)
    return next
  }
  register(type)
  return register
}

function setup(initial?: ReactNode, html?: string) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const onUncaughtError = vi.fn(), onCaughtError = vi.fn()
  if (html !== undefined) container.innerHTML = html
  const root = html === undefined
    ? createRoot(container, { onUncaughtError, onCaughtError })
    : hydrateRoot(container, initial, { onUncaughtError, onCaughtError })
  if (html === undefined && initial !== undefined) root.render(initial)
  cleanups.push(() => { root.unmount(); container.remove() })
  return { root, container, onUncaughtError, onCaughtError }
}

function click(container: Element) {
  flushSync(() => container.querySelector('button')!.click())
}

function counter(label: string) {
  return function Counter() {
    const [count, setCount] = useState(0)
    return <button onClick={() => setCount(n => n + 1)}>{label}:{count}</button>
  }
}

it('refreshes mounted roots, preserving state, DOM, and old element references', () => {
  const Before = counter('before'), update = family(Before, 'state')
  const element = <Before />
  const { root, container } = setup(element)
  click(container)
  const button = container.firstChild
  update(counter('after'))
  Refresh.performReactRefresh()
  expect(container.textContent).toBe('after:1')
  expect(container.firstChild).toBe(button)
  root.render(element)
  expect(container.textContent).toBe('after:1')
  click(container)
  expect(container.textContent).toBe('after:2')
})

it('remounts incompatible hook signatures and cleans up the old instance', async () => {
  const cleanup = vi.fn()
  function Before() {
    const [count, setCount] = useState(0)
    useEffect(() => cleanup, [])
    return <button onClick={() => setCount(n => n + 1)}>before:{count}</button>
  }
  const update = family(Before, 'state/effect')
  const { container } = setup(<Before />)
  await Promise.resolve()
  click(container)
  const button = container.firstChild
  update(counter('after'), 'state')
  Refresh.performReactRefresh()
  expect(container.textContent).toBe('after:0')
  expect(container.firstChild).not.toBe(button)
  expect(cleanup).toHaveBeenCalledTimes(1)
})

it('does not let an equal-state reducer bailout swallow a refresh', () => {
  let dispatch = () => {}
  function version(label: string) {
    return function Example() {
      const [, send] = useReducer(n => n, 0)
      dispatch = () => send(undefined)
      return <span>{label}</span>
    }
  }
  const Before = version('before'), update = family(Before, 'reducer')
  const { container } = setup(<Before />)
  dispatch()
  update(version('after'))
  Refresh.performReactRefresh()
  expect(container.textContent).toBe('after')
})

it('mounts the latest implementation when an old reference is used in a new root', () => {
  const Before = counter('before'), update = family(Before)
  const existing = setup(<Before />)
  update(counter('after'))
  Refresh.performReactRefresh()
  const next = setup(<Before />)
  expect(existing.container.textContent).toBe('after:0')
  expect(next.container.textContent).toBe('after:0')
})

it('reruns effects, memo, and callback dependencies but preserves refs and state', async () => {
  const log: string[] = []
  let reference: unknown
  function version(label: string) {
    return function Example() {
      const [count, setCount] = useState(0)
      const ref = useRef({})
      reference ??= ref.current
      expect(ref.current).toBe(reference)
      const value = useMemo(() => label, [])
      const callback = useCallback(() => label, [])
      useLayoutEffect(() => { log.push(`layout ${label}`); return () => { log.push(`unlayout ${label}`) } }, [])
      useEffect(() => { log.push(`effect ${label}`); return () => { log.push(`uneffect ${label}`) } }, [])
      return <button onClick={() => setCount(n => n + 1)}>{value}/{callback()}:{count}</button>
    }
  }
  const Before = version('before'), update = family(Before, 'stable')
  const { container } = setup(<Before />)
  await Promise.resolve()
  click(container)
  update(version('after'))
  Refresh.performReactRefresh()
  await Promise.resolve()
  expect(container.textContent).toBe('after/after:1')
  expect(log).toEqual(['layout before', 'effect before', 'unlayout before', 'layout after', 'uneffect before', 'effect after'])
  click(container)
  await Promise.resolve()
  expect(log).toHaveLength(6)
})

it.each(['memo', 'forwardRef', 'nested'] as const)('refreshes %s wrappers without losing state', kind => {
  function wrap(label: string) {
    const Inner = counter(label)
    return kind === 'memo' ? memo(Inner, () => true)
      : kind === 'forwardRef' ? forwardRef(Inner)
      : memo(memo(forwardRef(Inner), () => true), () => true)
  }
  const Before = wrap('before'), update = family(Before, 'state')
  const { container } = setup(<Before />)
  click(container)
  update(wrap('after'))
  Refresh.performReactRefresh()
  expect(container.textContent).toBe('after:1')
})

it('refreshes an inner family behind an unchanged memo wrapper', () => {
  const Before = counter('before'), update = family(Before, 'state')
  const Wrapped = memo(Before, () => true)
  const { container } = setup(<Wrapped />)
  click(container)
  update(counter('after'))
  Refresh.performReactRefresh()
  expect(container.textContent).toBe('after:1')
})

it('refreshes inner forwardRef and resolved lazy families', async () => {
  const Before = counter('before'), update = family(Before, 'state')
  const Forwarded = forwardRef(Before)
  const Lazy = lazy(() => Promise.resolve({ default: Before }))
  const first = setup(<Forwarded />)
  const second = setup(<Suspense fallback="loading"><Lazy /></Suspense>)
  await vi.waitFor(() => expect(second.container.textContent).toBe('before:0'))
  click(first.container)
  click(second.container)
  update(counter('after'))
  Refresh.performReactRefresh()
  expect(first.container.textContent).toBe('after:1')
  expect(second.container.textContent).toBe('after:1')
})

it('remounts a changed custom-hook signature', () => {
  function useBefore() { return useState(0) }
  Refresh.setSignature(useBefore, 'state')
  function Before() {
    const [count, setCount] = useBefore()
    return <button onClick={() => setCount(n => n + 1)}>before:{count}</button>
  }
  Refresh.setSignature(Before, 'custom', false, () => [useBefore])
  const update = family(Before)
  const { container } = setup(<Before />)
  Refresh.collectCustomHooksForSignature(Before)
  click(container)
  function useAfter() { useRef(null); return useState(0) }
  Refresh.setSignature(useAfter, 'ref/state')
  function After() {
    const [count, setCount] = useAfter()
    return <button onClick={() => setCount(n => n + 1)}>after:{count}</button>
  }
  Refresh.setSignature(After, 'custom', false, () => [useAfter])
  update(After)
  Refresh.performReactRefresh()
  expect(container.textContent).toBe('after:0')
})

it('honors refresh reset directives even when hook signatures match', () => {
  const Before = counter('before'), update = family(Before, 'state')
  const { container } = setup(<Before />)
  click(container)
  const After = counter('after')
  Refresh.setSignature(After, 'state', true)
  update(After)
  Refresh.performReactRefresh()
  expect(container.textContent).toBe('after:0')
})

it('remounts a keyed child once when its parent refreshes in the same batch', () => {
  const Before = counter('before'), updateChild = family(Before, 'state')
  const Parent = () => <><Before key="a" /><i>tail</i></>
  const updateParent = family(Parent)
  const { container } = setup(<Parent />)
  click(container)
  const After = updateChild(counter('after'), 'different-state')
  updateParent(() => <><After key="a" /><i>tail</i></>)
  Refresh.performReactRefresh()
  expect(container.textContent).toBe('after:0tail')
  expect(container.querySelectorAll('button')).toHaveLength(1)
})

it('preserves keyed sibling state when parent and child families change together', () => {
  const Before = counter('before'), updateChild = family(Before, 'state')
  const Parent = () => <><Before key="a" /><Before key="b" /></>
  const updateParent = family(Parent)
  const { container } = setup(<Parent />)
  click(container)
  const After = updateChild(counter('after'))
  updateParent(() => <><After key="b" /><After key="a" /></>)
  Refresh.performReactRefresh()
  expect(container.textContent).toBe('after:0after:1')
})

it('remounts class components and wrapper kind changes', () => {
  class Before extends Component {
    state = { count: 0 }
    render() { return <button onClick={() => this.setState({ count: this.state.count + 1 })}>class:{this.state.count}</button> }
  }
  const update = family(Before)
  const { container } = setup(<Before />)
  click(container)
  update(memo(counter('memo')))
  Refresh.performReactRefresh()
  expect(container.textContent).toBe('memo:0')
  click(container)
  update(counter('function'))
  Refresh.performReactRefresh()
  expect(container.textContent).toBe('function:0')
})

it('recovers a root that failed its first render and supports later root.render calls', () => {
  function Broken(): ReactNode { throw new Error('broken') }
  const update = family(Broken)
  const { root, container, onUncaughtError } = setup(<Broken />)
  expect(onUncaughtError).toHaveBeenCalledTimes(1)
  expect(container.textContent).toBe('')
  const Fixed = update(counter('fixed'))
  Refresh.performReactRefresh()
  expect(container.textContent).toBe('fixed:0')
  root.render(<Fixed />)
  click(container)
  expect(container.textContent).toBe('fixed:1')
})

it('recovers a failed edit, and does not revive an intentionally unmounted root', () => {
  const Before = counter('before'), update = family(Before)
  const { root, container, onUncaughtError } = setup(<Before />)
  update(function Broken(): ReactNode { throw new Error('edit') })
  Refresh.performReactRefresh()
  expect(onUncaughtError).toHaveBeenCalledTimes(1)
  update(counter('fixed'))
  Refresh.performReactRefresh()
  expect(container.textContent).toBe('fixed:0')
  root.unmount()
  update(counter('unmounted'))
  Refresh.performReactRefresh()
  expect(container.textContent).toBe('')
})

it('retries caught errors by remounting the error boundary', () => {
  class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() { return { failed: true } }
    render() { return this.state.failed ? <b>fallback</b> : this.props.children }
  }
  function Broken(): ReactNode { throw new Error('broken') }
  const update = family(Broken)
  const { container, onCaughtError } = setup(<Boundary><Broken /></Boundary>)
  expect(container.textContent).toBe('fallback')
  expect(onCaughtError).toHaveBeenCalledTimes(1)
  update(counter('fixed'))
  Refresh.performReactRefresh()
  expect(container.textContent).toBe('fixed:0')
})

it('refreshes hydrated roots and multiple mounted roots', () => {
  const Before = counter('before'), update = family(Before, 'state')
  const hydrated = setup(<Before />, '<button>before:0</button>')
  const mounted = setup(<Before />)
  click(hydrated.container)
  update(counter('after'))
  Refresh.performReactRefresh()
  expect(hydrated.container.textContent).toBe('after:1')
  expect(mounted.container.textContent).toBe('after:0')
})
