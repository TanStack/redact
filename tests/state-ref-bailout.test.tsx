import { afterEach, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, hydrateRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

function probe(name: string) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const stats = { renders: 0, commits: 0, refs: [] as string[], errors: [] as string[] }
  let root: Root | undefined
  const options = {
    onUncaughtError: (error: unknown) => { stats.errors.push(String(error)) },
    onCaughtError: () => {},
  }
  const guard = () => {
    if (++stats.renders > 16) throw new Error('State/ref regression exceeded 16 renders')
  }
  const report = () => {
    if (typeof process !== 'undefined' && process.env?.STATE_REF_TRACE === '1') console.info('STATE_REF_PROBE', JSON.stringify({ name, ...stats, text: container.textContent }))
  }
  cleanups.push(() => { if (root) flushSync(() => root!.unmount()); container.remove() })
  const start = (element: React.ReactNode, hydrate = false) => {
    try {
      flushSync(() => {
        if (hydrate) root = hydrateRoot(container, element, options)
        else { root = createRoot(container, options); root.render(element) }
      })
    } catch (error) { stats.errors.push(String(error)) }
  }
  return { container, stats, guard, report, start }
}

it.each([false, true])('settles inline state-setting refs after detach and reattach, hydration=%s', async hydrate => {
  const { container, stats, guard, report, start } = probe(`inline-ref:hydrate=${hydrate}`)
  function App() {
    guard()
    const [node, setNode] = React.useState<HTMLDivElement | null>(null)
    React.useLayoutEffect(() => { stats.commits++ })
    return <div ref={(value: HTMLDivElement | null) => { stats.refs.push(value ? 'node' : 'null'); setNode(value) }}>{node ? 'attached' : 'empty'}</div>
  }
  if (hydrate) container.innerHTML = '<div>empty</div>'
  const original = container.firstChild
  try {
    start(<App />, hydrate)
    await vi.waitFor(() => expect(stats.errors.length > 0 || container.textContent === 'attached').toBe(true))
    await Promise.resolve()
    expect(stats.errors).toEqual([])
    expect(stats.renders).toBeLessThanOrEqual(3)
    expect(stats.commits).toBe(2)
    expect(container.textContent).toBe('attached')
    if (hydrate) expect(container.firstChild).toBe(original)
  } finally { report() }
})

it.each(['value', 'function'] as const)('does not recommit a layout effect after a state queue returns to its previous value, action=%s', action => {
  const { container, stats, guard, report, start } = probe(`layout-roundtrip:${action}`)
  function App() {
    guard()
    const [value, set] = React.useState(0)
    React.useLayoutEffect(() => {
      stats.commits++
      if (action === 'value') { set(1); set(0) }
      else { set(previous => previous + 1); set(previous => previous - 1) }
    })
    return <b>{value}</b>
  }
  try {
    start(<App />)
    expect(stats.errors).toEqual([])
    expect(stats.renders).toBe(2)
    expect(stats.commits).toBe(1)
    expect(container.textContent).toBe('0')
  } finally { report() }
})

it('does not rerender descendants when a batched state queue returns to its committed value', () => {
  const { container, stats, guard, report, start } = probe('event-roundtrip')
  let set!: React.Dispatch<React.SetStateAction<number>>, descendants = 0
  function Child() { descendants++; return <b>child</b> }
  function App() {
    guard()
    const [, update] = React.useState(0)
    set = update
    React.useLayoutEffect(() => { stats.commits++ })
    return <Child />
  }
  try {
    start(<App />)
    flushSync(() => { set(1); set(0) })
    expect(stats.errors).toEqual([])
    expect(stats.renders).toBe(2)
    expect(stats.commits).toBe(1)
    expect(descendants).toBe(1)
    expect(container.textContent).toBe('child')
  } finally { report() }
})

it.each([false, true])('routes a throwing state updater through its boundary after eager work=%s', eager => {
  const { container, stats, guard, report, start } = probe(`throwing-updater:eager=${eager}`)
  const failure = new Error('updater failed'), caught: unknown[] = []
  let set!: React.Dispatch<React.SetStateAction<number>>
  class Boundary extends React.Component<{ children?: React.ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() { return { failed: true } }
    componentDidCatch(error: unknown) { caught.push(error) }
    render() { return this.state.failed ? <i>fallback</i> : this.props.children }
  }
  function App() {
    guard()
    const [value, update] = React.useState(0)
    set = update
    React.useLayoutEffect(() => { stats.commits++ })
    return <b>{value}</b>
  }
  try {
    start(<Boundary><App /></Boundary>)
    expect(() => flushSync(() => {
      if (eager) set(1)
      set(() => { throw failure })
      set(0)
    })).not.toThrow()
    expect(caught).toEqual([failure])
    expect(stats.errors).toEqual([])
    expect(container.textContent).toBe('fallback')
    flushSync(() => set(3))
    expect(container.textContent).toBe('fallback')
  } finally { report() }
})

it('settles render-phase state updates after an eager marker without losing another changed hook', () => {
  const { container, stats, guard, report, start } = probe('render-phase-after-eager')
  const commits: string[] = []
  let set!: React.Dispatch<React.SetStateAction<number>>
  function App() {
    guard()
    const [value, update] = React.useState(0), [other, updateOther] = React.useState(0)
    set = update
    if (value === 1) { update(0); updateOther(previous => previous + 1) }
    React.useLayoutEffect(() => { stats.commits++; commits.push(`${value}:${other}`) })
    return <b>{value}:{other}</b>
  }
  try {
    start(<App />)
    flushSync(() => set(1))
    expect(container.textContent).toBe('0:1')
    flushSync(() => { set(2); set(0) })
    expect(container.textContent).toBe('0:1')
    expect(commits).toEqual(['0:0', '0:1'])
    expect(stats.errors).toEqual([])
  } finally { report() }
})

it.each(['reducer', 'store', 'context'] as const)('does not let a state round trip hide a simultaneous %s change', source => {
  const { container, stats, guard, report, start } = probe(`mixed-roundtrip:${source}`)
  const Context = React.createContext(0), listeners = new Set<() => void>()
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
  let snapshot = 0, set!: React.Dispatch<React.SetStateAction<number>>, reduce!: React.Dispatch<number>
  let setContext!: React.Dispatch<React.SetStateAction<number>>
  const commits: string[] = []
  function App() {
    guard()
    const [value, update] = React.useState(0), [reduced, dispatch] = React.useReducer((previous: number, action: number) => previous + action, 0)
    set = update; reduce = dispatch
    const external = React.useSyncExternalStore(subscribe, () => snapshot), context = React.useContext(Context)
    const text = `${value}:${reduced}:${external}:${context}`
    React.useLayoutEffect(() => { stats.commits++; commits.push(text) })
    return <b>{text}</b>
  }
  const child = <App />
  function Provider() {
    const [value, update] = React.useState(0)
    setContext = update
    return <Context.Provider value={value}>{child}</Context.Provider>
  }
  try {
    start(<Provider />)
    flushSync(() => {
      set(1); set(0)
      if (source === 'reducer') reduce(3)
      else if (source === 'store') { snapshot = 4; for (const listener of listeners) listener() }
      else setContext(5)
    })
    const expected = source === 'reducer' ? '0:3:0:0' : source === 'store' ? '0:0:4:0' : '0:0:0:5'
    expect(container.textContent).toBe(expected)
    expect(commits).toEqual(['0:0:0:0', expected])
    expect(stats.errors).toEqual([])
  } finally { report() }
})

it.each(['component', 'descendant'] as const)('replays eager state round trips after the %s suspends', async source => {
  const { container, stats, guard, report, start } = probe(`suspense-roundtrip:${source}`)
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  let blocked = false, set!: React.Dispatch<React.SetStateAction<number>>
  const commits: string[] = []
  function Gate({ value }: { value: number }) { if (blocked && value > 0) throw pending; return null }
  function App() {
    guard()
    const [value, update] = React.useState(0)
    set = update
    React.useLayoutEffect(() => {
      stats.commits++
      commits.push(`mount:${value}`)
      return () => { commits.push(`clear:${value}`) }
    }, [value])
    if (source === 'component' && blocked && value > 0) throw pending
    return <><b>{value}</b>{source === 'descendant' ? <Gate value={value} /> : null}</>
  }
  try {
    start(<React.Suspense fallback={<i>fallback</i>}><App /></React.Suspense>)
    const node = container.querySelector('b')!
    blocked = true
    flushSync(() => set(2))
    expect(container.querySelector('i')).not.toBeNull()
    expect(node.textContent).toBe('0')
    flushSync(() => { set(previous => previous + 3); set(previous => previous - 3) })
    expect(node.textContent).toBe('0')
    blocked = false
    release()
    await vi.waitFor(() => expect(container.querySelector('i')).toBeNull())
    expect(container.querySelector('b')).toBe(node)
    expect(node.textContent).toBe('2')
    expect(commits).toEqual(['mount:0', 'clear:0', 'mount:2'])
    expect(stats.errors).toEqual([])
    flushSync(() => { set(3); set(2) })
    expect(commits).toEqual(['mount:0', 'clear:0', 'mount:2'])
  } finally { report() }
})
