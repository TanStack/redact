import { afterEach, describe, expect, it } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal, flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const unmount = () => flushSync(() => root.unmount())
  cleanups.push(() => { unmount(); container.remove() })
  return { container, unmount, render: (node: React.ReactNode) => flushSync(() => root.render(node)) }
}
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

describe('context updates through memo and Suspense', () => {
  it('updates a fallback behind memo while preserving its DOM', () => {
    const { render, container } = setup()
    const Context = React.createContext('default')
    const pending = new Promise<void>(() => {})
    function Pending() { throw pending }
    function Fallback() { return <span>{React.useContext(Context)}</span> }
    const Boundary = React.memo(() => <React.Suspense fallback={<Fallback />}><Pending /></React.Suspense>)
    render(<Context.Provider value="first"><Boundary /></Context.Provider>)
    const fallback = container.firstChild
    render(<Context.Provider value="second"><Boundary /></Context.Provider>)
    expect(container.textContent).toBe('second')
    expect(container.firstChild).toBe(fallback)
  })

  it('retries initially suspended content through multiple memo ancestors', () => {
    const { render, container } = setup()
    const Context = React.createContext(false)
    const pending = new Promise<void>(() => {})
    function Content() {
      if (!React.useContext(Context)) throw pending
      return <span>ready</span>
    }
    const Boundary = React.memo(() => <React.Suspense fallback={<i>loading</i>}><Content /></React.Suspense>)
    const Outer = React.memo(() => <Boundary />)
    render(<Context.Provider value={false}><Outer /></Context.Provider>)
    expect(container.textContent).toBe('loading')
    render(<Context.Provider value={true}><Outer /></Context.Provider>)
    expect(container.textContent).toBe('ready')
  })

  it('preserves fallback state, refs, effects and sibling order across failed retries', () => {
    const { render, container, unmount } = setup()
    const Context = React.createContext(0)
    const pending = new Promise<void>(() => {})
    const log: string[] = []
    let setCount!: React.Dispatch<React.SetStateAction<number>>
    const ref = (node: HTMLElement | null) => { log.push(node ? 'ref' : 'unref') }
    function Content() {
      if (React.useContext(Context) < 2) throw pending
      return <b>ready</b>
    }
    function Fallback() {
      const [count, set] = React.useState(0)
      setCount = set
      React.useLayoutEffect(() => { log.push('mount'); return () => { log.push('cleanup') } }, [])
      return <i ref={ref}>loading {count}</i>
    }
    const tree = (value: number) => <Context.Provider value={value}>
      <span>before</span><React.Suspense fallback={<Fallback />}><Content /></React.Suspense><span>after</span>
    </Context.Provider>
    render(tree(0))
    const fallback = container.querySelector('i')
    flushSync(() => setCount(7))
    render(tree(1))
    expect(container.textContent).toBe('beforeloading 7after')
    expect(container.querySelector('i')).toBe(fallback)
    expect(log.slice().sort()).toEqual(['mount', 'ref'])
    render(tree(2))
    expect(container.textContent).toBe('beforereadyafter')
    expect(log.filter(value => value === 'cleanup')).toHaveLength(1)
    expect(log.filter(value => value === 'unref')).toHaveLength(1)
    unmount()
    expect(container.childNodes).toHaveLength(0)
  })

  it('does not invalidate consumers shielded by a nested provider', () => {
    const { render, container } = setup()
    const Context = React.createContext('default')
    const values: string[] = []
    const Consumer = React.memo(() => {
      const value = React.useContext(Context)
      React.useLayoutEffect(() => { values.push(value) }, [value])
      return <span>{value}</span>
    })
    const Inner = React.memo(() => <Context.Provider value="inner"><Consumer /></Context.Provider>)
    const tree = (value: string) => <Context.Provider value={value}><Inner /></Context.Provider>
    render(tree('first'))
    render(tree('second'))
    expect(container.textContent).toBe('inner')
    expect(values).toEqual(['inner'])
  })

  it('uses Object.is for provider updates and leaves nonconsuming memo siblings alone', () => {
    const { render, container } = setup()
    const Context = React.createContext(NaN)
    let readers = 0
    let siblings = 0
    const Reader = React.memo(() => { readers++; return <span>{Object.is(React.useContext(Context), -0) ? '-0' : 'other'}</span> })
    const Sibling = React.memo(() => { siblings++; return null })
    const tree = (value: number) => <Context.Provider value={value}><Reader /><Sibling /></Context.Provider>
    render(tree(NaN))
    render(tree(NaN))
    expect(readers).toBe(1)
    render(tree(0))
    render(tree(-0))
    expect(container.textContent).toBe('-0')
    expect(readers).toBe(3)
    expect(siblings).toBe(1)
  })

  it('unmounts a visible fallback and ignores its old pending promise', async () => {
    const { render, container, unmount } = setup()
    let resolve!: () => void
    const pending = new Promise<void>(r => { resolve = r })
    const log: string[] = []
    function Content() { throw pending }
    function Fallback() {
      React.useLayoutEffect(() => () => { log.push('cleanup') }, [])
      return <i>loading</i>
    }
    render(<React.Suspense fallback={<Fallback />}><Content /></React.Suspense>)
    unmount()
    resolve()
    await Promise.resolve()
    expect(log).toEqual(['cleanup'])
    expect(container.childNodes).toHaveLength(0)
  })

  it('does not invoke equal-props memo wrappers or their effects to reach a consumer', () => {
    const { render, container } = setup()
    const Context = React.createContext('first')
    const counts = { outer: 0, inner: 0, reader: 0, effect: 0, sibling: 0 }
    const Reader = React.memo(() => { counts.reader++; return <b>{React.useContext(Context)}</b> }, () => true)
    const Sibling = React.memo(() => { counts.sibling++; return <i>sibling</i> })
    const Inner = React.memo(() => {
      counts.inner++
      React.useLayoutEffect(() => { counts.effect++ })
      return <><Reader /><Sibling /></>
    }, () => true)
    const Outer = React.memo(() => { counts.outer++; return <section><Inner /></section> })
    const tree = (value: string) => <Context.Provider value={value}><Outer /></Context.Provider>
    render(tree('first'))
    render(tree('second'))
    expect(container.textContent).toBe('secondsibling')
    expect(counts).toEqual({ outer: 1, inner: 1, reader: 2, effect: 1, sibling: 1 })
  })

  it('removes a conditional context dependency when a component stops reading it', () => {
    const { render, container } = setup()
    const Context = React.createContext('first')
    let renders = 0
    let stop!: () => void
    const Reader = React.memo(() => {
      renders++
      const [reading, setReading] = React.useState(true)
      stop = () => setReading(false)
      return <b>{reading ? React.use(Context) : 'stopped'}</b>
    })
    const Outer = React.memo(() => <Reader />)
    const tree = (value: string) => <Context.Provider value={value}><Outer /></Context.Provider>
    render(tree('first'))
    flushSync(stop)
    const previous = renders
    render(tree('second'))
    expect(container.textContent).toBe('stopped')
    expect(renders).toBe(previous)
  })

  it('reveals preserved primary siblings when context changes before the pending promise settles', () => {
    const { render, container } = setup()
    const Context = React.createContext(0)
    const pending = new Promise<void>(() => {})
    function Content() {
      const value = React.useContext(Context)
      if (value === 1) throw pending
      return <b>{value}</b>
    }
    const tree = (value: number) => <Context.Provider value={value}>
      <React.Suspense fallback={<i>loading</i>}>
        <div data-preserved="yes" style={{ height: 50, width: 100, overflow: 'auto' }}><div style={{ height: 200 }} /></div>
        <Content />
      </React.Suspense>
      <span>after</span>
    </Context.Provider>
    render(tree(0))
    const preserved = container.querySelector('[data-preserved]') as HTMLElement
    preserved.scrollTop = 42
    expect(preserved.scrollTop).toBe(42)
    render(tree(1))
    expect(preserved.style.display).toBe('none')
    render(tree(2))
    expect(container.querySelector('[data-preserved]')).toBe(preserved)
    expect(preserved.style.display).toBe('')
    expect(preserved.scrollTop).toBe(42)
    expect(container.textContent).toBe('2after')
  })

  it('does not commit effects from discarded primary attempts', () => {
    const { render, container } = setup()
    const Context = React.createContext(0)
    const pending = new Promise<void>(() => {})
    const effects: number[] = []
    function Content() {
      const value = React.useContext(Context)
      React.useLayoutEffect(() => { effects.push(value) }, [value])
      if (value < 2) throw pending
      return <b>ready</b>
    }
    const tree = (value: number) => <Context.Provider value={value}>
      <React.Suspense fallback={<i>loading</i>}><Content /></React.Suspense>
    </Context.Provider>
    render(tree(0))
    render(tree(1))
    expect(effects).toEqual([])
    render(tree(2))
    expect(container.textContent).toBe('ready')
    expect(effects).toEqual([2])
  })

  it('updates contextType through memo and shouldComponentUpdate(false)', () => {
    const { render, container } = setup()
    const Context = React.createContext('first')
    class Reader extends React.Component {
      static contextType = Context
      declare context: string
      shouldComponentUpdate() { return false }
      render() { return <b>{this.context}</b> }
    }
    const Outer = React.memo(() => <Reader />)
    const tree = (value: string) => <Context.Provider value={value}><Outer /></Context.Provider>
    render(tree('first'))
    render(tree('second'))
    expect(container.textContent).toBe('second')
  })

  it('does not retain successful primary context reads after a local conditional unsubscribe', () => {
    const { render } = setup()
    const Context = React.createContext('first')
    let stop!: () => void
    let siblingRenders = 0
    function Reader() {
      const [reading, setReading] = React.useState(true)
      stop = () => setReading(false)
      return <b>{reading ? React.use(Context) : 'stopped'}</b>
    }
    function Sibling() { siblingRenders++; return <i>sibling</i> }
    const Outer = React.memo(() => <React.Suspense fallback="loading"><Reader /><Sibling /></React.Suspense>)
    const tree = (value: string) => <Context.Provider value={value}><Outer /></Context.Provider>
    render(tree('first'))
    flushSync(stop)
    const previous = siblingRenders
    render(tree('second'))
    expect(siblingRenders).toBe(previous)
  })

  it('keeps newly replaced primary hosts hidden after another failed context retry', () => {
    const { render, container } = setup()
    const Context = React.createContext(0)
    const pending = new Promise<void>(() => {})
    function Primary() {
      const value = React.useContext(Context)
      return value >= 2 ? <section>primary</section> : <div>primary</div>
    }
    function Pending() {
      const value = React.useContext(Context)
      if (value === 1 || value === 2) throw pending
      return null
    }
    const tree = (value: number) => <Context.Provider value={value}>
      <React.Suspense fallback={<i>loading</i>}><Primary /><Pending /></React.Suspense>
    </Context.Provider>
    render(tree(0))
    render(tree(1))
    render(tree(2))
    // React may retain the old committed host until reveal, Redact may already
    // reconcile its hidden tree. Either way no primary host can become visible.
    for (const node of container.querySelectorAll('div,section')) {
      expect((node as HTMLElement).style.display).toBe('none')
    }
    expect(container.querySelector('i')?.textContent).toBe('loading')
    render(tree(3))
    expect(container.querySelector('section')?.style.display).toBe('')
    expect(container.querySelector('i')).toBeNull()
  })

  it('does not use a portal host as the placement anchor for a context consumer', () => {
    const { render, container } = setup()
    const Context = React.createContext(false)
    const portal = document.createElement('aside')
    const Reader = React.memo(() => React.useContext(Context) ? <b>reader</b> : <i>reader</i>)
    const Outer = React.memo(() => <><Reader />{createPortal(<strong>portal</strong>, portal)}<span>end</span></>)
    const tree = (value: boolean) => <Context.Provider value={value}><Outer /></Context.Provider>
    render(tree(false))
    render(tree(true))
    expect(container.textContent).toBe('readerend')
    expect(portal.textContent).toBe('portal')
  })

  it('finds a later in-flow anchor beyond null and portal siblings of an ancestor', () => {
    const { render, container } = setup()
    const Context = React.createContext(false)
    const portal = document.createElement('aside')
    const Reader = React.memo(() => React.useContext(Context) ? <b>reader</b> : null)
    const Empty = () => null
    const Group = React.memo(() => <Reader />)
    const Outer = React.memo(() => <><Group /><Empty />{createPortal(<i>portal</i>, portal)}<span>end</span></>)
    const tree = (value: boolean) => <Context.Provider value={value}><Outer /></Context.Provider>
    render(tree(false))
    render(tree(true))
    expect(container.textContent).toBe('readerend')
    expect(portal.textContent).toBe('portal')
  })
})
