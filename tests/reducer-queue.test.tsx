import { afterEach, expect, it, vi } from 'vitest'
import { Component, Suspense, createContext, forwardRef, memo, useContext, useLayoutEffect, useReducer, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { Dispatch, ReactNode, SetStateAction } from 'react'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.restoreAllMocks() })

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let mounted = true
  const unmount = () => { if (mounted) { mounted = false; flushSync(() => root.unmount()) } }
  cleanups.push(() => { unmount(); container.remove() })
  return { container, unmount, render: (node: ReactNode) => flushSync(() => root.render(node)) }
}

it.each(['before', 'after'])('uses the next reducer when dispatch happens %s a batched prop change', order => {
  const { container, render } = setup()
  let setFactor!: Dispatch<SetStateAction<number>>, dispatch!: Dispatch<number>
  function Counter({ factor }: { factor: number }) {
    const [value, send] = useReducer((value: number, action: number) => value + action * factor, 1)
    dispatch = send
    return <b>{value}</b>
  }
  function App() {
    const [factor, set] = useState(1); setFactor = set
    return <Counter factor={factor} />
  }
  render(<App />)
  const first = dispatch
  flushSync(() => {
    if (order === 'before') first(2)
    setFactor(10)
    if (order === 'after') first(2)
  })
  expect(container.textContent).toBe('21')
  expect(dispatch).toBe(first)
})

it.each([2, 10])('replays multiple ordered actions with the factor %s selected by a Suspense reveal', factor => {
  const { container, render } = setup()
  const pending = new Promise<void>(() => {})
  let dispatch!: Dispatch<number>
  const Counter = memo(function Counter({ factor }: { factor: number }) {
    const [value, send] = useReducer((value: number, action: number) => value * factor + action, 1)
    dispatch = send
    return <b>{value}</b>
  })
  function Gate({ blocked }: { blocked: boolean }) { if (blocked) throw pending; return null }
  const view = (factor: number, blocked: boolean) => <Suspense fallback={<i>loading</i>}><Counter factor={factor} /><Gate blocked={blocked} /></Suspense>
  render(view(2, false))
  const first = dispatch, primary = container.querySelector('b')!
  render(view(10, true))
  flushSync(() => { first(3); first(4) })
  flushSync(() => first(5))
  expect(primary.textContent).toBe('1')
  expect(primary.style.display).toBe('none')
  render(view(factor, false))
  expect(dispatch).toBe(first)
  expect(container.querySelector('b')).toBe(primary)
  expect(container.textContent).toBe(String(((1 * factor + 3) * factor + 4) * factor + 5))
  render(view(factor, false))
  expect(container.textContent).toBe(String(((1 * factor + 3) * factor + 4) * factor + 5))
})

it('retries queued actions when the suspended promise settles without a new root render', async () => {
  const { container, render } = setup()
  let resolve!: () => void, blocked = true, dispatch!: Dispatch<number>
  const pending = new Promise<void>(done => { resolve = () => { blocked = false; done() } })
  function Counter({ factor }: { factor: number }) {
    const [value, send] = useReducer((value: number, action: number) => value + action * factor, 2)
    dispatch = send
    return <b>{value}</b>
  }
  function Gate({ wait }: { wait: boolean }) { if (wait && blocked) throw pending; return null }
  render(<Suspense fallback={<i>loading</i>}><Counter factor={1} /><Gate wait={false} /></Suspense>)
  render(<Suspense fallback={<i>loading</i>}><Counter factor={10} /><Gate wait /></Suspense>)
  flushSync(() => dispatch(3))
  expect(container.querySelector('b')?.textContent).toBe('2')
  resolve()
  await vi.waitFor(() => expect(container.textContent).toBe('32'))
})

it('keeps useState functional and replacement actions ordered while the primary is suspended', () => {
  const { container, render } = setup()
  const pending = new Promise<void>(() => {})
  let set!: Dispatch<SetStateAction<number>>
  function Counter() { const [value, update] = useState(1); set = update; return <b>{value}</b> }
  function Gate({ blocked }: { blocked: boolean }) { if (blocked) throw pending; return null }
  const view = (blocked: boolean) => <Suspense fallback={<i>loading</i>}><Counter /><Gate blocked={blocked} /></Suspense>
  render(view(false))
  const first = set, primary = container.querySelector('b')!
  render(view(true))
  flushSync(() => { first(value => value + 1); first(10); first(value => value * 3) })
  expect(primary.textContent).toBe('1')
  render(view(false))
  expect(container.textContent).toBe('30')
  expect(set).toBe(first)
})

it('commits only the settled result of render-phase reducer actions', () => {
  const { container, render } = setup()
  const commits: number[] = []
  function Counter({ factor }: { factor: number }) {
    const [value, dispatch] = useReducer((value: number, action: number) => value + action * factor, 0)
    if (value < factor * 2) dispatch(1)
    useLayoutEffect(() => { commits.push(value) })
    return <b>{value}</b>
  }
  render(<Counter factor={3} />)
  expect(container.textContent).toBe('6')
  expect(commits).toEqual([6])
})

it('does not render children or rerun effects when a reducer returns the same state', () => {
  const { container, render } = setup()
  const child = vi.fn(), effect = vi.fn()
  let dispatch!: Dispatch<number>
  function Child() { child(); return <b>stable</b> }
  function Counter() {
    const [, send] = useReducer((value: number) => value, 1); dispatch = send
    useLayoutEffect(effect)
    return <Child />
  }
  render(<Counter />)
  child.mockClear(); effect.mockClear()
  flushSync(() => dispatch(1))
  expect(container.textContent).toBe('stable')
  expect(child).not.toHaveBeenCalled()
  expect(effect).not.toHaveBeenCalled()
})

it('routes reducer errors through the render error boundary instead of throwing from dispatch', () => {
  const { container, render } = setup()
  const error = new Error('reducer failed'), caught = vi.fn()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  let dispatch!: Dispatch<number>
  class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() { return { failed: true } }
    componentDidCatch(value: unknown) { caught(value) }
    render() { return this.state.failed ? <i>failed</i> : this.props.children }
  }
  function Counter() {
    const [value, send] = useReducer((value: number, action: number) => { if (action) throw error; return value }, 0)
    dispatch = send
    return <b>{value}</b>
  }
  render(<Boundary><Counter /></Boundary>)
  expect(() => flushSync(() => dispatch(1))).not.toThrow()
  expect(container.textContent).toBe('failed')
  expect(caught).toHaveBeenCalledWith(error)
})

it('does not invoke reducers or state updaters through retained dispatches after unmount', () => {
  const { container, render, unmount } = setup()
  const reducer = vi.fn((value: number, action: number) => value + action), updater = vi.fn((value: number) => value + 1)
  let dispatch!: Dispatch<number>, set!: Dispatch<SetStateAction<number>>
  function Counter() {
    const [value, send] = useReducer(reducer, 0); dispatch = send
    const [state, update] = useState(0); set = update
    return <b>{value}:{state}</b>
  }
  render(<Counter />)
  unmount()
  flushSync(() => { dispatch(1); set(updater) })
  expect(reducer).not.toHaveBeenCalled()
  expect(updater).not.toHaveBeenCalled()
  expect(container.textContent).toBe('')
})

it('does not replay committed actions when a reducer changes later', () => {
  const { container, render } = setup()
  const init = vi.fn((value: number) => value * 2)
  let dispatch!: Dispatch<number>
  function Counter({ factor }: { factor: number }) {
    const [value, send] = useReducer((value: number, action: number) => value + action * factor, 2, init)
    dispatch = send
    return <b>{value}</b>
  }
  render(<Counter factor={1} />)
  const first = dispatch
  flushSync(() => first(3))
  render(<Counter factor={10} />)
  expect(container.textContent).toBe('7')
  flushSync(() => first(2))
  expect(container.textContent).toBe('27')
  expect(init).toHaveBeenCalledTimes(1)
  expect(dispatch).toBe(first)
})

it('does not discard a batched action that is unchanged under the old reducer but changes under new props', () => {
  const { container, render } = setup()
  let setFactor!: Dispatch<SetStateAction<number>>, dispatch!: Dispatch<number>
  function App() {
    const [factor, set] = useState(0); setFactor = set
    const [value, send] = useReducer((value: number, action: number) => value + action * factor, 1); dispatch = send
    return <b>{value}</b>
  }
  render(<App />)
  flushSync(() => { dispatch(2); setFactor(10) })
  expect(container.textContent).toBe('21')
})

it('does not let a reducer bailout hide a simultaneous useState or external-store change', () => {
  const { container, render } = setup()
  let value = 0, notify = () => {}, set!: Dispatch<SetStateAction<number>>, dispatch!: Dispatch<number>
  const subscribe = (listener: () => void) => { notify = listener; return () => {} }
  function App() {
    const [state, update] = useState(0); set = update
    const [, send] = useReducer((value: number) => value, 0); dispatch = send
    const external = useSyncExternalStore(subscribe, () => value)
    return <b>{state}:{external}</b>
  }
  render(<App />)
  flushSync(() => { dispatch(1); set(2) })
  expect(container.textContent).toBe('2:0')
  flushSync(() => { dispatch(1); value = 3; notify() })
  expect(container.textContent).toBe('2:3')
})

it('keeps stable context and memoized children out of a reducer bailout commit', () => {
  const { container, render } = setup()
  const context = createContext(3), commits = vi.fn(), child = vi.fn()
  let dispatch!: Dispatch<number>
  const Child = memo(function Child() { child(); return <i>child</i> })
  function App() {
    const [, send] = useReducer((value: number) => value, 0); dispatch = send
    const value = useContext(context)
    useLayoutEffect(commits)
    return <b>{value}<Child /></b>
  }
  render(<App />)
  commits.mockClear(); child.mockClear()
  flushSync(() => dispatch(1))
  expect(container.textContent).toBe('3child')
  expect(commits).not.toHaveBeenCalled()
  expect(child).not.toHaveBeenCalled()
})

it('discards render-phase actions from an abandoned suspended attempt', () => {
  const { container, render } = setup()
  const pending = new Promise<void>(() => {})
  function Counter({ bump }: { bump: boolean }) {
    const [value, dispatch] = useReducer((value: number, action: number) => value + action, 0)
    if (bump && value === 0) dispatch(1)
    return <b>{value}</b>
  }
  function Gate({ blocked }: { blocked: boolean }) { if (blocked) throw pending; return null }
  const view = (bump: boolean, blocked: boolean) => <Suspense fallback={<i>loading</i>}><Counter bump={bump} /><Gate blocked={blocked} /></Suspense>
  render(view(false, false))
  render(view(true, true))
  expect(container.querySelector('b')?.textContent).toBe('0')
  render(view(false, false))
  expect(container.textContent).toBe('0')
})

it('settles multiple render-phase actions and forwardRef effects before committing', () => {
  const { container, render } = setup()
  const commits: string[] = []
  const Counter = forwardRef<HTMLDivElement, {}>(function Counter(_props, ref) {
    const [value, dispatch] = useReducer((value: number, action: number) => value + action, 0)
    const [state, set] = useState(0)
    useLayoutEffect(() => { commits.push(`${value}:${state}`) })
    if (value === 0) { dispatch(1); dispatch(2); set(4); set(value => value + 1) }
    return <div ref={ref}>{value}:{state}</div>
  })
  render(<Counter />)
  expect(container.textContent).toBe('3:5')
  expect(commits).toEqual(['3:5'])
})

it('does not rerun unchanged effects after render-phase state settles', () => {
  const { container, render } = setup()
  const stable = vi.fn(), commits: number[] = []
  function Counter({ target }: { target: number }) {
    const [value, set] = useState(0)
    useLayoutEffect(stable, [])
    useLayoutEffect(() => { commits.push(value) }, [value])
    if (value !== target) set(target)
    return <b>{value}</b>
  }
  render(<Counter target={0} />)
  render(<Counter target={3} />)
  expect(container.textContent).toBe('3')
  expect(stable).toHaveBeenCalledTimes(1)
  expect(commits).toEqual([0, 3])
})

it('routes functional useState updater errors through the render error boundary', () => {
  const { container, render } = setup()
  const error = new Error('updater failed'), caught = vi.fn()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  let set!: Dispatch<SetStateAction<number>>
  class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() { return { failed: true } }
    componentDidCatch(value: unknown) { caught(value) }
    render() { return this.state.failed ? <i>failed</i> : this.props.children }
  }
  function Counter() { const [value, update] = useState(0); set = update; return <b>{value}</b> }
  render(<Boundary><Counter /></Boundary>)
  expect(() => flushSync(() => set(() => { throw error }))).not.toThrow()
  expect(container.textContent).toBe('failed')
  expect(caught).toHaveBeenCalledWith(error)
})

it('keeps nested pending primary updates behind their own boundary after the outer boundary reveals', () => {
  const { container, render } = setup()
  const innerPending = new Promise<void>(() => {}), outerPending = new Promise<void>(() => {})
  let dispatch!: Dispatch<number>, updateFallback!: Dispatch<SetStateAction<number>>
  function Counter({ factor }: { factor: number }) {
    const [value, send] = useReducer((value: number, action: number) => value + action * factor, 1); dispatch = send
    return <b>{value}</b>
  }
  function InnerFallback() {
    const [value, set] = useState(0); updateFallback = set
    return <i>inner:{value}</i>
  }
  function Gate({ pending, blocked }: { pending: Promise<void>, blocked: boolean }) { if (blocked) throw pending; return null }
  const view = (factor: number, inner: boolean, outer: boolean) => <Suspense fallback={<em>outer</em>}>
    <Suspense fallback={<InnerFallback />}><Counter factor={factor} /><Gate pending={innerPending} blocked={inner} /></Suspense>
    <Gate pending={outerPending} blocked={outer} />
  </Suspense>
  render(view(1, false, false))
  render(view(10, true, false))
  render(view(10, true, true))
  flushSync(() => dispatch(2))
  expect(container.querySelector('b')?.textContent).toBe('1')
  render(view(10, true, false))
  flushSync(() => { dispatch(3); updateFallback(4) })
  expect(container.querySelector('b')?.textContent).toBe('1')
  expect(container.querySelector('i')?.textContent).toBe('inner:4')
  expect(container.querySelector('em')).toBeNull()
  render(view(10, false, false))
  expect(container.textContent).toBe('51')
})

it.each(['component', 'descendant'])('keeps an action pending when an independently updated %s suspends', source => {
  const { container, render } = setup()
  const pending = new Promise<void>(() => {})
  let dispatch!: Dispatch<number>
  function Gate({ blocked }: { blocked: boolean }) { if (blocked) throw pending; return null }
  function Counter({ factor, blocked }: { factor: number, blocked: boolean }) {
    const [value, send] = useReducer((value: number, action: number) => value + action * factor, 0); dispatch = send
    const suspend = blocked && value > 0
    if (source === 'component' && suspend) throw pending
    return <><b>{value}</b><Gate blocked={source === 'descendant' && suspend} /></>
  }
  const view = (factor: number, blocked: boolean) => <Suspense fallback={<i>loading</i>}><Counter factor={factor} blocked={blocked} /></Suspense>
  render(view(1, true))
  flushSync(() => dispatch(2))
  expect(container.querySelector('i')?.textContent).toBe('loading')
  expect(container.querySelector('b')?.textContent).toBe('0')
  expect(container.querySelector('b')?.style.display).toBe('none')
  render(view(10, false))
  expect(container.textContent).toBe('20')
})
