import { afterEach, expect, it } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let mounted = true
  const unmount = () => { if (mounted) { mounted = false; flushSync(() => root.unmount()) } }
  cleanups.push(() => { unmount(); container.remove() })
  return { container, root, unmount, render: (element: React.ReactNode) => flushSync(() => root.render(element)) }
}

it.each(['props', 'state'])('keeps unchanged fallback work and hidden DOM untouched during retries after %s suspension', source => {
  const { container, render } = setup()
  const pending = new Promise<void>(() => {})
  const dispatches: React.Dispatch<number>[] = []
  let setGate!: React.Dispatch<React.SetStateAction<boolean>>
  let fallbackRenders = 0, fallbackLayouts = 0
  const primaryLayouts: string[] = []
  function Counter({ id, factor }: { id: number, factor: number }) {
    const [value, dispatch] = React.useReducer((previous: number, action: number) => previous * 2 + action * factor, id)
    dispatches[id] = dispatch
    React.useLayoutEffect(() => {
      primaryLayouts.push(`${id}:${value}`)
      return () => { primaryLayouts.push(`clear:${id}:${value}`) }
    }, [value])
    return <b>{value}</b>
  }
  function Gate({ blocked }: { blocked: boolean }) {
    const [local, set] = React.useState(false)
    setGate = set
    if (blocked || local) throw pending
    return null
  }
  function Fallback() {
    fallbackRenders++
    React.useLayoutEffect(() => { fallbackLayouts++ })
    return <i>pending</i>
  }
  const fallback = <Fallback />
  const view = (blocked: boolean, factor = 1) => <React.Suspense fallback={fallback}>
    <section style={{ display: 'inline-flex' }}><Counter id={0} factor={factor} /><Counter id={1} factor={factor} /><Gate blocked={blocked} /></section>
  </React.Suspense>
  render(view(false))
  const primary = container.querySelector('section')!
  const nodes = [...container.querySelectorAll('b')]
  const originalDispatches = [...dispatches]
  if (source === 'state') flushSync(() => setGate(true))
  else render(view(true))
  const fallbackNode = container.querySelector('i')
  expect(primary.style.display).toBe('none')
  expect(fallbackRenders).toBe(1)
  const observer = new MutationObserver(() => {})
  observer.observe(primary, { attributes: true, attributeFilter: ['style'] })
  try {
    flushSync(() => { for (const dispatch of dispatches) { dispatch(1); dispatch(2) } })
    flushSync(() => { for (const dispatch of dispatches) dispatch(3) })
    expect(container.querySelector('i')).toBe(fallbackNode)
    expect([...container.querySelectorAll('b')]).toEqual(nodes)
    expect(nodes.map(node => node.textContent)).toEqual(['0', '1'])
    expect(primary.style.display).toBe('none')
    expect(observer.takeRecords()).toHaveLength(0)
    expect(fallbackRenders).toBe(1)
    expect(fallbackLayouts).toBe(1)
    expect(primaryLayouts).toEqual(['0:0', '1:1', 'clear:0:0', 'clear:1:1'])
    expect(dispatches).toEqual(originalDispatches)
  } finally { observer.disconnect() }
  flushSync(() => { if (source === 'state') setGate(false); render(view(false, 4)) })
  expect(container.querySelector('i')).toBeNull()
  expect(container.querySelector('section')).toBe(primary)
  expect(primary.style.display).toBe('inline-flex')
  expect(nodes.map(node => node.textContent)).toEqual(['44', '52'])
  expect(primaryLayouts).toEqual(['0:0', '1:1', 'clear:0:0', 'clear:1:1', '0:44', '1:52'])
})

it.each(['fallback-first', 'primary-first'])('flushes an independently dirty fallback descendant during a hidden retry queued %s', order => {
  const { container, render } = setup()
  const pending = new Promise<void>(() => {})
  let primaryDispatch!: React.Dispatch<number>, fallbackDispatch!: React.Dispatch<number>
  let shellRenders = 0, leafRenders = 0
  const commits: number[] = []
  function Primary() {
    const [value, dispatch] = React.useReducer((previous: number, action: number) => previous * 2 + action, 0)
    primaryDispatch = dispatch
    return <b>{value}</b>
  }
  function Leaf() {
    const [value, dispatch] = React.useReducer((previous: number, action: number) => previous * 2 + action, 0)
    fallbackDispatch = dispatch
    leafRenders++
    React.useLayoutEffect(() => {
      expect(container.querySelector('i')?.textContent).toBe(String(value))
      commits.push(value)
    }, [value])
    return <i>{value}</i>
  }
  const MemoShell = React.memo(() => <Leaf />)
  function Fallback() { shellRenders++; return <MemoShell /> }
  function Gate({ blocked }: { blocked: boolean }) { if (blocked) throw pending; return null }
  const fallback = <Fallback />
  const view = (blocked: boolean) => <React.Suspense fallback={fallback}><section><Primary /><Gate blocked={blocked} /></section></React.Suspense>
  render(view(false)); render(view(true))
  const node = container.querySelector('i')
  flushSync(() => {
    const updatePrimary = () => { primaryDispatch(3); primaryDispatch(4) }
    const updateFallback = () => { fallbackDispatch(1); fallbackDispatch(2) }
    if (order === 'primary-first') { updatePrimary(); updateFallback() }
    else { updateFallback(); updatePrimary() }
  })
  expect(container.querySelector('i')).toBe(node)
  expect(node?.textContent).toBe('4')
  expect(shellRenders).toBe(1)
  expect(leafRenders).toBe(2)
  expect(commits).toEqual([0, 4])
  expect(container.querySelector('section')?.style.display).toBe('none')
  render(view(false))
  expect(container.textContent).toBe('10')
  flushSync(() => fallbackDispatch(9))
  expect(container.textContent).toBe('10')
})

it.each([false, true])('updates context through a stable fallback without reexecuting nonreaders, with queued state=%s', withState => {
  const { container, root, render } = setup()
  const Context = React.createContext('default')
  const pending = new Promise<void>(() => {})
  const counts = { shell: 0, memo: 0, reader: 0, sibling: 0 }
  const shieldedLayouts: string[] = []
  let dispatch!: React.Dispatch<number>
  function Pending() { throw pending }
  const Reader = React.memo(() => {
    counts.reader++
    const value = React.useContext(Context)
    const [count, send] = React.useReducer((previous: number, action: number) => previous * 2 + action, 0)
    dispatch = send
    return <i>{value}:{count}</i>
  }, () => true)
  const Shielded = React.memo(() => {
    const value = React.useContext(Context)
    React.useLayoutEffect(() => { shieldedLayouts.push(value) }, [value])
    return <b>{value}</b>
  })
  function Sibling() { counts.sibling++; return <span>static</span> }
  const MemoShell = React.memo(() => {
    counts.memo++
    return <><Reader /><Context.Provider value="inner"><Shielded /></Context.Provider><Sibling /></>
  })
  function Shell() { counts.shell++; return <MemoShell /> }
  const fallback = <Shell />, children = <Pending />
  const view = (value: string) => <Context.Provider value={value}><React.Suspense fallback={fallback}>{children}</React.Suspense></Context.Provider>
  render(view('one'))
  const node = container.querySelector('i')
  flushSync(() => {
    if (withState) { dispatch(1); dispatch(2) }
    root.render(view('two'))
  })
  expect(container.querySelector('i')).toBe(node)
  expect(node?.textContent).toBe(`two:${withState ? 4 : 0}`)
  expect(container.querySelector('b')?.textContent).toBe('inner')
  expect(counts).toEqual({ shell: 1, memo: 1, reader: 2, sibling: 1 })
  expect(shieldedLayouts).toEqual(['inner'])
})

it('updates changed fallback props while retaining fallback state and DOM', () => {
  const { container, render } = setup()
  const pending = new Promise<void>(() => {})
  let set!: React.Dispatch<React.SetStateAction<number>>
  const commits: string[] = []
  function Pending({ version }: { version: number }) { void version; throw pending }
  function Fallback({ label }: { label: string }) {
    const [count, update] = React.useState(0)
    set = update
    React.useLayoutEffect(() => { commits.push(`${label}:${count}`) })
    return <i>{label}:{count}</i>
  }
  render(<React.Suspense fallback={<Fallback label="one" />}><Pending version={1} /></React.Suspense>)
  const node = container.querySelector('i')
  flushSync(() => set(3))
  render(<React.Suspense fallback={<Fallback label="two" />}><Pending version={2} /></React.Suspense>)
  expect(container.querySelector('i')).toBe(node)
  expect(node?.textContent).toBe('two:3')
  expect(commits).toEqual(['one:0', 'one:3', 'two:3'])
})

it('retains an unchanged initial-mount fallback across unsuccessful new-children retries', () => {
  const { container, render } = setup()
  const pending = new Promise<void>(() => {})
  let set!: React.Dispatch<React.SetStateAction<number>>, renders = 0
  const commits: number[] = []
  function Pending({ version }: { version: number }) { void version; throw pending }
  function Fallback() {
    const [value, update] = React.useState(0)
    set = update
    renders++
    React.useLayoutEffect(() => { commits.push(value) })
    return <i>{value}</i>
  }
  const fallback = <Fallback />
  const view = (version: number) => <React.Suspense fallback={fallback}><Pending version={version} /></React.Suspense>
  render(view(0))
  const node = container.querySelector('i')
  flushSync(() => set(3))
  render(view(1)); render(view(2))
  expect(container.querySelector('i')).toBe(node)
  expect(node?.textContent).toBe('3')
  expect(renders).toBe(2)
  expect(commits).toEqual([0, 3])
})

it('keeps Activity hide and reveal connected to a stable retained fallback', () => {
  const { container, render } = setup()
  const pending = new Promise<void>(() => {})
  let dispatch!: React.Dispatch<number>
  const primaryLayouts: string[] = [], fallbackLayouts: string[] = []
  function Primary() {
    React.useLayoutEffect(() => { primaryLayouts.push('mount'); return () => { primaryLayouts.push('clear') } }, [])
    return <b>primary</b>
  }
  function Fallback() {
    const [value, send] = React.useReducer((previous: number, action: number) => previous * 2 + action, 0)
    dispatch = send
    React.useLayoutEffect(() => {
      fallbackLayouts.push(`mount:${value}`)
      return () => { fallbackLayouts.push(`clear:${value}`) }
    }, [value])
    return <i>{value}</i>
  }
  function Gate({ blocked }: { blocked: boolean }) { if (blocked) throw pending; return null }
  const fallback = <Fallback />
  const view = (mode: 'visible' | 'hidden', blocked: boolean) => <React.Activity mode={mode}>
    <React.Suspense fallback={fallback}><section><Primary /><Gate blocked={blocked} /></section></React.Suspense>
  </React.Activity>
  render(view('visible', false)); render(view('visible', true))
  const node = container.querySelector('i')
  render(view('hidden', true))
  flushSync(() => { dispatch(1); dispatch(2) })
  render(view('visible', true))
  expect(container.querySelector('i')).toBe(node)
  expect(node?.textContent).toBe('4')
  expect(node?.style.display).not.toBe('none')
  expect(container.querySelector('section')?.style.display).toBe('none')
  expect(primaryLayouts).toEqual(['mount', 'clear'])
  expect(fallbackLayouts).toEqual(['mount:0', 'clear:0', 'mount:4'])
  render(view('visible', false))
  expect(container.querySelector('i')).toBeNull()
  expect(primaryLayouts).toEqual(['mount', 'clear', 'mount'])
  expect(fallbackLayouts).toEqual(['mount:0', 'clear:0', 'mount:4', 'clear:4'])
})

it('replays inner fallback actions after its outer retained primary reveals', () => {
  const { container, render } = setup()
  const inner = new Promise<void>(() => {}), outer = new Promise<void>(() => {})
  let dispatch!: React.Dispatch<number>
  const layouts: string[] = []
  function Fallback({ factor }: { factor: number }) {
    const [value, send] = React.useReducer((previous: number, action: number) => previous * 2 + action * factor, 0)
    dispatch = send
    React.useLayoutEffect(() => {
      layouts.push(`mount:${value}`)
      return () => { layouts.push(`clear:${value}`) }
    }, [value])
    return <i>{value}</i>
  }
  function Gate({ blocked, pending }: { blocked: boolean, pending: Promise<void> }) { if (blocked) throw pending; return null }
  const innerFallback = <Fallback factor={1} />, outerFallback = <em>outer</em>
  const view = (blocked: boolean) => <React.Suspense fallback={outerFallback}>
    <section><React.Suspense fallback={innerFallback}><Gate blocked={true} pending={inner} /></React.Suspense><Gate blocked={blocked} pending={outer} /></section>
  </React.Suspense>
  render(view(false))
  const node = container.querySelector('i'), primary = container.querySelector('section')
  render(view(true))
  flushSync(() => { dispatch(1); dispatch(2) })
  expect(node?.textContent).toBe('0')
  expect(primary?.style.display).toBe('none')
  expect(container.querySelector('em')?.textContent).toBe('outer')
  expect(layouts).toEqual(['mount:0', 'clear:0'])
  render(view(false))
  expect(container.querySelector('i')).toBe(node)
  expect(node?.textContent).toBe('4')
  expect(primary?.style.display).not.toBe('none')
  expect(container.querySelector('em')).toBeNull()
  expect(layouts).toEqual(['mount:0', 'clear:0', 'mount:4'])
})
