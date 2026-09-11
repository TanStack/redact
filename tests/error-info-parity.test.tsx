import { afterEach, expect, it, vi } from 'vitest'
import { Component, ViewTransition, startTransition, useEffect, useInsertionEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const onCaughtError = vi.fn(), onUncaughtError = vi.fn(), onRecoverableError = vi.fn()
  const root = createRoot(container, { onCaughtError, onUncaughtError, onRecoverableError })
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return { container, root, onCaughtError, onUncaughtError, onRecoverableError }
}

it('reports caught render errors to the root and boundary with the source component stack', () => {
  const { root, container, onCaughtError, onUncaughtError, onRecoverableError } = setup()
  const error = new Error('render failed')
  const caught = vi.fn()
  class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() { return { failed: true } }
    componentDidCatch = caught
    render() { return this.state.failed ? <b>recovered</b> : this.props.children }
  }
  function Broken(): ReactNode { throw error }
  function Parent() { return <Boundary><Broken /></Boundary> }
  flushSync(() => root.render(<Parent />))
  expect(container.textContent).toBe('recovered')
  expect(onCaughtError).toHaveBeenCalledTimes(1)
  expect(onCaughtError.mock.calls[0]![0]).toBe(error)
  const info = onCaughtError.mock.calls[0]![1]
  expect(info.componentStack).toContain('Broken')
  expect(info.componentStack).toContain('Boundary')
  expect(info.componentStack).toContain('Parent')
  expect(info.errorBoundary).toBeInstanceOf(Boundary)
  expect(caught).toHaveBeenCalledTimes(1)
  expect(caught.mock.calls[0]![0]).toBe(error)
  expect(caught.mock.calls[0]![1].componentStack).toBe(info.componentStack)
  expect(onUncaughtError).not.toHaveBeenCalled()
  expect(onRecoverableError).not.toHaveBeenCalled()
})

it('reports uncaught render errors with their source component stack', () => {
  const { root, onCaughtError, onUncaughtError, onRecoverableError } = setup()
  const error = new Error('uncaught render')
  function Broken(): ReactNode { throw error }
  function Parent() { return <Broken /> }
  flushSync(() => root.render(<Parent />))
  expect(onUncaughtError).toHaveBeenCalledTimes(1)
  expect(onUncaughtError.mock.calls[0]![0]).toBe(error)
  expect(onUncaughtError.mock.calls[0]![1].componentStack).toContain('Broken')
  expect(onUncaughtError.mock.calls[0]![1].componentStack).toContain('Parent')
  expect(onCaughtError).not.toHaveBeenCalled()
  expect(onRecoverableError).not.toHaveBeenCalled()
})

it('reports a throwing onCaughtError separately and still calls componentDidCatch', () => {
  const { root, container, onCaughtError, onUncaughtError } = setup()
  const renderError = new Error('render failed'), callbackError = new Error('callback failed')
  const caught = vi.fn(), reports: Array<() => void> = []
  const timeout = vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback: any) => {
    reports.push(callback)
    return 0 as any
  })
  class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() { return { failed: true } }
    componentDidCatch = caught
    render() { return this.state.failed ? <b>recovered</b> : this.props.children }
  }
  function Broken(): ReactNode { throw renderError }
  onCaughtError.mockImplementation(() => { throw callbackError })
  try {
    flushSync(() => root.render(<Boundary><Broken /></Boundary>))
  } finally { timeout.mockRestore() }
  expect(container.textContent).toBe('recovered')
  expect(onCaughtError).toHaveBeenCalledTimes(1)
  expect(onCaughtError.mock.calls[0]![0]).toBe(renderError)
  expect(caught).toHaveBeenCalledTimes(1)
  expect(caught.mock.calls[0]![0]).toBe(renderError)
  expect(onUncaughtError).not.toHaveBeenCalled()
  expect(reports).toHaveLength(1)
  expect(reports[0]).toThrow(callbackError)
})

it('still reports a fatal layout error when a later layout callback replaces the root', async () => {
  const { root, container, onUncaughtError } = setup()
  const error = new Error('first layout')
  function Broken() {
    useLayoutEffect(() => { throw error }, [])
    return <i>broken</i>
  }
  function Replacement() {
    useLayoutEffect(() => { root.render(<strong>healthy</strong>) }, [])
    return <i>replace</i>
  }
  flushSync(() => root.render(<><Broken /><Replacement /></>))
  await vi.waitFor(() => expect(onUncaughtError).toHaveBeenCalledTimes(1))
  expect(onUncaughtError.mock.calls[0]![0]).toBe(error)
  expect(container.textContent).toBe('healthy')
})

it.each(['layout', 'passive'] as const)('routes a caught %s effect error through its boundary', async kind => {
  const { root, container, onCaughtError, onUncaughtError, onRecoverableError } = setup()
  const error = new Error(kind)
  class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() { return { failed: true } }
    render() { return this.state.failed ? <b>recovered</b> : this.props.children }
  }
  function Broken() {
    const use = kind === 'layout' ? useLayoutEffect : useEffect
    use(() => { throw error }, [])
    return <i>before</i>
  }
  flushSync(() => root.render(<Boundary><Broken /></Boundary>))
  await vi.waitFor(() => expect(container.textContent).toBe('recovered'))
  expect(onCaughtError).toHaveBeenCalledTimes(1)
  expect(onCaughtError.mock.calls[0]![0]).toBe(error)
  expect(onCaughtError.mock.calls[0]![1].componentStack).toContain('Broken')
  expect(onUncaughtError).not.toHaveBeenCalled()
  expect(onRecoverableError).not.toHaveBeenCalled()
})

it.each(['layout', 'passive'] as const)('routes an uncaught %s effect error to onUncaughtError', async kind => {
  const { root, container, onCaughtError, onUncaughtError, onRecoverableError } = setup()
  const error = new Error(kind)
  function Broken() {
    const use = kind === 'layout' ? useLayoutEffect : useEffect
    use(() => { throw error }, [])
    return <i>before</i>
  }
  flushSync(() => root.render(<Broken />))
  await vi.waitFor(() => expect(onUncaughtError).toHaveBeenCalledTimes(1))
  expect(onUncaughtError.mock.calls[0]![0]).toBe(error)
  expect(onUncaughtError.mock.calls[0]![1].componentStack).toContain('Broken')
  expect(onCaughtError).not.toHaveBeenCalled()
  expect(onRecoverableError).not.toHaveBeenCalled()
  expect(container.childNodes).toHaveLength(0)
})

it.each(['layout', 'passive', 'insertion', 'ref', 'unmount'] as const)('routes %s cleanup errors to the nearest retained boundary', async kind => {
  const { root, container, onCaughtError, onUncaughtError, onRecoverableError } = setup()
  const error = new Error(`${kind} cleanup`)
  const innerCaught = vi.fn(), outerCaught = vi.fn()
  class Outer extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() { return { failed: true } }
    componentDidCatch = outerCaught
    render() { return this.state.failed ? <b>recovered</b> : this.props.children }
  }
  class Inner extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() { return { failed: true } }
    componentDidCatch = innerCaught
    render() { return this.state.failed ? <b>wrong boundary</b> : this.props.children }
  }
  class Unmount extends Component {
    componentWillUnmount() { throw error }
    render() { return <i>before</i> }
  }
  function Broken() {
    const use = kind === 'passive' ? useEffect : kind === 'insertion' ? useInsertionEffect : useLayoutEffect
    use(() => kind === 'ref' || kind === 'unmount' ? undefined : () => { throw error }, [])
    return kind === 'unmount' ? <Unmount /> : <i ref={kind === 'ref' ? () => () => { throw error } : undefined}>before</i>
  }
  const view = (show: boolean) => <Outer>{show ? <Inner><Broken /></Inner> : <span>next</span>}</Outer>
  flushSync(() => root.render(view(true)))
  await Promise.resolve()
  flushSync(() => root.render(view(false)))
  await vi.waitFor(() => expect(container.textContent).toBe('recovered'))
  expect(innerCaught).not.toHaveBeenCalled()
  expect(outerCaught).toHaveBeenCalledTimes(1)
  expect(onCaughtError).toHaveBeenCalledTimes(1)
  expect(onCaughtError.mock.calls[0]![0]).toBe(error)
  expect(onUncaughtError).not.toHaveBeenCalled()
  expect(onRecoverableError).not.toHaveBeenCalled()
})

it.each(['layout', 'passive', 'insertion', 'ref', 'unmount'] as const)('clears the root for an uncaught %s cleanup error', async kind => {
  const { root, container, onCaughtError, onUncaughtError, onRecoverableError } = setup()
  const error = new Error(`${kind} cleanup`)
  class Unmount extends Component {
    componentWillUnmount() { throw error }
    render() { return <i>before</i> }
  }
  function Broken() {
    const use = kind === 'passive' ? useEffect : kind === 'insertion' ? useInsertionEffect : useLayoutEffect
    use(() => kind === 'ref' || kind === 'unmount' ? undefined : () => { throw error }, [])
    return kind === 'unmount' ? <Unmount /> : <i ref={kind === 'ref' ? () => () => { throw error } : undefined}>before</i>
  }
  flushSync(() => root.render(<Broken />))
  await Promise.resolve()
  flushSync(() => root.render(<span>next</span>))
  await vi.waitFor(() => expect(onUncaughtError).toHaveBeenCalledTimes(1))
  expect(container.childNodes).toHaveLength(0)
  expect(onUncaughtError.mock.calls[0]![0]).toBe(error)
  expect(onCaughtError).not.toHaveBeenCalled()
  expect(onRecoverableError).not.toHaveBeenCalled()
})

it.each(['layout', 'passive', 'insertion'] as const)('routes a retained %s cleanup failure through its boundary', async kind => {
  const { root, container, onCaughtError, onRecoverableError } = setup()
  const error = new Error(`${kind} update cleanup`)
  const effects: number[] = []
  class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() { return { failed: true } }
    render() { return this.state.failed ? <b>recovered</b> : this.props.children }
  }
  function Broken({ value }: { value: number }) {
    const use = kind === 'passive' ? useEffect : kind === 'insertion' ? useInsertionEffect : useLayoutEffect
    use(() => { effects.push(value); return () => { if (!value) throw error } }, [value])
    return <i>{value}</i>
  }
  flushSync(() => root.render(<Boundary><Broken value={0} /></Boundary>))
  await Promise.resolve()
  flushSync(() => root.render(<Boundary><Broken value={1} /></Boundary>))
  await vi.waitFor(() => expect(container.textContent).toBe('recovered'))
  expect(onCaughtError.mock.calls[0]![0]).toBe(error)
  expect(onRecoverableError).not.toHaveBeenCalled()
})

it.each(['render', 'layout'] as const)('allows an uncaught %s error handler to render a healthy replacement after clearing the root', async kind => {
  const { root, container, onUncaughtError, onCaughtError } = setup()
  const observed: string[] = []
  const error = new Error(kind)
  function Broken(): ReactNode {
    useLayoutEffect(() => { if (kind === 'layout') throw error }, [])
    if (kind === 'render') throw error
    return <i>broken</i>
  }
  onUncaughtError.mockImplementation(() => {
    observed.push(container.textContent!)
    root.render(<strong>healthy</strong>)
  })
  flushSync(() => root.render(<Broken />))
  await vi.waitFor(() => expect(container.textContent).toBe('healthy'))
  expect(observed).toEqual([''])
  expect(onUncaughtError).toHaveBeenCalledTimes(1)
  expect(onCaughtError).not.toHaveBeenCalled()
})

it('allows a caught error handler to replace the root without stale fallback commits', async () => {
  const { root, container, onCaughtError, onUncaughtError } = setup()
  class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() { return { failed: true } }
    render() { return this.state.failed ? <b>fallback</b> : this.props.children }
  }
  function Broken(): ReactNode { throw new Error('render') }
  onCaughtError.mockImplementation(() => root.render(<strong>healthy</strong>))
  flushSync(() => root.render(<Boundary><Broken /></Boundary>))
  await vi.waitFor(() => expect(container.textContent).toBe('healthy'))
  expect(onCaughtError).toHaveBeenCalledTimes(1)
  expect(onUncaughtError).not.toHaveBeenCalled()
})

it('does not commit siblings or effects from a render that fails without a boundary', () => {
  const { root, container, onUncaughtError } = setup()
  const events: string[] = []
  function Sibling({ value }: { value: string }) {
    useLayoutEffect(() => { events.push(`layout:${value}`); return () => { events.push(`cleanup:${value}:${container.textContent}`) } }, [value])
    return <span ref={(element: HTMLSpanElement | null) => { if (element) events.push(`ref:${value}`) }}>{value}</span>
  }
  function Broken(): ReactNode { throw new Error('render') }
  flushSync(() => root.render(<Sibling value="old" />))
  events.length = 0
  flushSync(() => root.render(<><Sibling value="new" /><Broken /></>))
  expect(container.childNodes).toHaveLength(0)
  expect(events).toEqual(['cleanup:old:old'])
  expect(onUncaughtError).toHaveBeenCalledTimes(1)
})

it('clears preexisting container markup when the first render fails', () => {
  const { root, container, onUncaughtError } = setup()
  container.innerHTML = '<p>server content</p>'
  function Broken(): ReactNode { throw new Error('first render') }
  flushSync(() => root.render(<Broken />))
  expect(container.childNodes).toHaveLength(0)
  expect(onUncaughtError).toHaveBeenCalledTimes(1)
})

it('unmounts the committed class tree after an aborted structural update', () => {
  const { root, container, onUncaughtError } = setup()
  const events: string[] = []
  class Child extends Component<{ value: string; key?: string }> {
    componentWillUnmount() { events.push(`unmount:${this.props.value}:${container.textContent}`) }
    render() { return <i>{this.props.value}</i> }
  }
  function Broken(): ReactNode { throw new Error('structural failure') }
  flushSync(() => root.render(<><Child key="a" value="old a" /><Child key="b" value="old b" /></>))
  flushSync(() => root.render(<><Child key="b" value="new b" /><Child key="c" value="new c" /><Broken /></>))
  expect(container.childNodes).toHaveLength(0)
  expect(events).toEqual(['unmount:old a:old aold b', 'unmount:old b:old b'])
  expect(onUncaughtError).toHaveBeenCalledTimes(1)
})

it('preserves old host properties for cleanup after an aborted descendant update', () => {
  const { root, container, onUncaughtError } = setup()
  const events: string[] = []
  function Child({ value, fail }: { value: string; fail: boolean }) {
    useLayoutEffect(() => () => { events.push(container.querySelector('input')!.value) }, [])
    return <><input value={value} readOnly /><Sibling value={value} />{fail ? <Broken /> : null}</>
  }
  function Sibling({ value }: { value: string }) { return value ? <span>{value}</span> : null }
  function Broken(): ReactNode { throw new Error('descendant failure') }
  flushSync(() => root.render(<Child value="old" fail={false} />))
  flushSync(() => root.render(<Child value="new" fail />))
  expect(container.childNodes).toHaveLength(0)
  expect(events).toEqual(['old'])
  expect(onUncaughtError).toHaveBeenCalledTimes(1)
})

it.each([false, true])('routes subscription cleanup failures through the boundary, removing=%s', async removing => {
  const { root, container, onCaughtError, onRecoverableError } = setup()
  const error = new Error('unsubscribe')
  class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() { return { failed: true } }
    render() { return this.state.failed ? <b>recovered</b> : this.props.children }
  }
  const first = () => () => { throw error }
  const second = () => () => {}
  function Child({ next }: { next: boolean }) {
    const value = useSyncExternalStore(next ? second : first, () => 1)
    return <i>{value}</i>
  }
  flushSync(() => root.render(<Boundary><Child next={false} /></Boundary>))
  flushSync(() => root.render(<Boundary>{removing ? null : <Child next />}</Boundary>))
  await vi.waitFor(() => expect(container.textContent).toBe('recovered'))
  expect(onCaughtError).toHaveBeenCalledTimes(1)
  expect(onCaughtError.mock.calls[0]![0]).toBe(error)
  expect(onRecoverableError).not.toHaveBeenCalled()
})

it.runIf(!!document.startViewTransition)('clears an uncaught native-transition render failure without committing its prepared effects', async () => {
  const { root, container, onUncaughtError } = setup()
  const layouts: number[] = []
  let set!: (value: number) => void
  function Broken(): ReactNode { throw new Error('native preparation') }
  function App() {
    const [value, update] = useState(0); set = update
    useLayoutEffect(() => { layouts.push(value) }, [value])
    return <ViewTransition name="failed-preparation"><div>{value}{value ? <Broken /> : null}</div></ViewTransition>
  }
  flushSync(() => root.render(<App />))
  startTransition(() => set(1))
  await vi.waitFor(() => expect(onUncaughtError).toHaveBeenCalledTimes(1))
  expect(container.childNodes).toHaveLength(0)
  expect(layouts).toEqual([0])
  flushSync(() => root.render(<strong>healthy</strong>))
  expect(container.textContent).toBe('healthy')
})

it('reports an uncaught hydration retry error without leaking its internal capture', async () => {
  const container = document.createElement('div')
  container.innerHTML = '<i>server content</i>'
  document.body.appendChild(container)
  const onUncaughtError = vi.fn(), error = new Error('hydration render')
  let root: ReturnType<typeof hydrateRoot> | undefined
  cleanups.push(() => { if (root) flushSync(() => root!.unmount()); container.remove() })
  function Broken(): ReactNode { throw error }
  expect(() => { root = hydrateRoot(container, <Broken />, { onUncaughtError, onRecoverableError: () => {} }) }).not.toThrow()
  await vi.waitFor(() => expect(onUncaughtError).toHaveBeenCalledTimes(1))
  expect(onUncaughtError.mock.calls[0]![0]).toBe(error)
  expect(onUncaughtError.mock.calls[0]![1].componentStack).toContain('Broken')
  expect(container.childNodes).toHaveLength(0)
})
