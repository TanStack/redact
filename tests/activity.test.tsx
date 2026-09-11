import { afterEach, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
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
const settle = () => new Promise(resolve => setTimeout(resolve, 30))
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

it('preserves state and browser-owned input state across hide and reveal', async () => {
  const { container, render } = setup()
  let setCount!: React.Dispatch<React.SetStateAction<number>>
  function Child() {
    const [count, set] = React.useState(1)
    setCount = set
    return <section><b>{count}</b><input defaultValue="initial" /></section>
  }
  const tree = (mode: 'visible' | 'hidden') => <React.Activity mode={mode}><Child /></React.Activity>
  render(tree('visible'))
  const section = container.querySelector('section')!
  const input = container.querySelector('input')!
  input.value = 'user edit'
  flushSync(() => setCount(7))
  render(tree('hidden'))
  await settle()
  expect(section.style.display).toBe('none')
  expect(section.isConnected).toBe(true)
  render(tree('visible'))
  expect(container.querySelector('section')).toBe(section)
  expect(container.querySelector('input')).toBe(input)
  expect(section.style.display).toBe('')
  expect(section.textContent).toBe('7')
  expect(input.value).toBe('user edit')
})

it('disconnects effects and refs once, and reconnects the latest hidden render', async () => {
  const { container, render, unmount } = setup()
  const log: string[] = []
  const ref = (node: HTMLElement | null) => { log.push(node ? 'ref' : 'unref') }
  function Child({ value }: { value: number }) {
    React.useLayoutEffect(() => { log.push('layout:' + value); return () => { log.push('unlayout:' + value) } }, [])
    React.useEffect(() => { log.push('passive:' + value); return () => { log.push('unpassive:' + value) } }, [])
    return <b ref={ref}>{value}</b>
  }
  const tree = (mode: 'visible' | 'hidden', value: number) => <React.Activity mode={mode}><Child value={value} /></React.Activity>
  render(tree('visible', 1))
  await settle()
  expect(log.slice().sort()).toEqual(['layout:1', 'passive:1', 'ref'])
  log.length = 0
  render(tree('hidden', 2))
  await settle()
  expect(log.slice().sort()).toEqual(['unlayout:1', 'unpassive:1', 'unref'])
  log.length = 0
  render(tree('hidden', 3))
  await settle()
  expect(log).toEqual([])
  render(tree('visible', 4))
  await settle()
  expect(log.slice().sort()).toEqual(['layout:4', 'passive:4', 'ref'])
  expect(container.textContent).toBe('4')
  log.length = 0
  render(tree('hidden', 4))
  await settle()
  log.length = 0
  unmount()
  expect(log).toEqual([])
})

it('prerenders initially hidden children without effects or refs', async () => {
  const { container, render } = setup()
  const log: string[] = []
  const ref = React.createRef<HTMLDivElement>()
  function Child() {
    React.useLayoutEffect(() => { log.push('layout') }, [])
    React.useEffect(() => { log.push('passive') }, [])
    return <div ref={ref}>prepared</div>
  }
  render(<React.Activity mode="hidden"><Child /></React.Activity>)
  await vi.waitFor(() => expect(container.querySelector('div')).not.toBeNull())
  expect(container.querySelector('div')!.style.display).toBe('none')
  expect(ref.current).toBeNull()
  expect(log).toEqual([])
  const node = container.firstChild
  render(<React.Activity><Child /></React.Activity>)
  await settle()
  expect(container.firstChild).toBe(node)
  expect(ref.current).toBe(node)
  expect(log.slice().sort()).toEqual(['layout', 'passive'])
})

it('blanks direct text and restores text and changed display styles', async () => {
  const { container, render } = setup()
  const tree = (mode: 'visible' | 'hidden', value: string, display: string) => <React.Activity mode={mode}>
    {value}<span style={{ display }}>{value}</span>
  </React.Activity>
  render(tree('visible', 'first', 'inline'))
  const text = container.firstChild
  const span = container.querySelector('span')!
  render(tree('hidden', 'second', 'grid'))
  await settle()
  expect(text!.nodeValue).toBe('')
  expect(span.style.display).toBe('none')
  render(tree('visible', 'third', 'flex'))
  expect(container.firstChild).toBe(text)
  expect(text!.nodeValue).toBe('third')
  expect(span.style.display).toBe('flex')
})

it('keeps nested hidden activities disconnected when an outer activity reveals', async () => {
  const { container, render } = setup()
  const effects: string[] = []
  function Child({ name }: { name: string }) {
    React.useLayoutEffect(() => { effects.push(name); return () => { effects.push('off:' + name) } }, [])
    return <b data-name={name}>{name}</b>
  }
  const tree = (outer: 'visible' | 'hidden', inner: 'visible' | 'hidden') => <React.Activity mode={outer}>
    <Child name="outer" /><React.Activity mode={inner}><Child name="inner" /></React.Activity>
  </React.Activity>
  render(tree('visible', 'visible'))
  effects.length = 0
  render(tree('hidden', 'hidden'))
  await settle()
  expect(effects.slice().sort()).toEqual(['off:inner', 'off:outer'])
  effects.length = 0
  render(tree('visible', 'hidden'))
  await settle()
  expect(effects).toEqual(['outer'])
  expect((container.querySelector('[data-name="inner"]') as HTMLElement).style.display).toBe('none')
  render(tree('visible', 'visible'))
  expect(effects).toEqual(['outer', 'inner'])
})

it('hides portal content and disconnects its effects without destroying its DOM', async () => {
  const { render } = setup()
  const portal = document.createElement('aside')
  document.body.appendChild(portal)
  cleanups.push(() => portal.remove())
  const log: string[] = []
  function Child() {
    React.useLayoutEffect(() => { log.push('on'); return () => { log.push('off') } }, [])
    return createPortal(<b>portal</b>, portal)
  }
  const tree = (mode: 'visible' | 'hidden') => <React.Activity mode={mode}><section><Child /></section></React.Activity>
  render(tree('visible'))
  const node = portal.firstChild as HTMLElement
  render(tree('hidden'))
  await settle()
  expect(node.style.display).toBe('none')
  expect(node.isConnected).toBe(true)
  expect(log).toEqual(['on', 'off'])
  render(tree('visible'))
  expect(portal.firstChild).toBe(node)
  expect(node.style.display).toBe('')
  expect(log).toEqual(['on', 'off', 'on'])
})

it('disconnects class lifecycles without discarding the instance or state', async () => {
  const { render, container, unmount } = setup()
  const log: string[] = []
  const ref = React.createRef<Child>()
  class Child extends React.Component<{ ref?: React.Ref<Child> }> {
    state = { count: 1 }
    componentDidMount() { log.push('mount') }
    componentWillUnmount() { log.push('unmount') }
    componentDidUpdate() { log.push('update') }
    render() { return <b>{this.state.count}</b> }
  }
  const tree = (mode: 'visible' | 'hidden') => <React.Activity mode={mode}><Child ref={ref} /></React.Activity>
  render(tree('visible'))
  const instance = ref.current!
  flushSync(() => instance.setState({ count: 5 }))
  log.length = 0
  render(tree('hidden'))
  await settle()
  expect(log).toEqual(['unmount'])
  expect(ref.current).toBeNull()
  render(tree('visible'))
  expect(ref.current).toBe(instance)
  expect(container.textContent).toBe('5')
  expect(log).toEqual(['unmount', 'mount'])
  render(tree('hidden'))
  await settle()
  log.length = 0
  unmount()
  expect(log).toEqual([])
})

it('does not call unmount lifecycle for initially hidden class instances', async () => {
  const { render, container, unmount } = setup()
  const log: string[] = []
  class Child extends React.Component {
    componentDidMount() { log.push('mount') }
    componentWillUnmount() { log.push('unmount') }
    render() { return <b>hidden</b> }
  }
  render(<React.Activity mode="hidden"><Child /></React.Activity>)
  await vi.waitFor(() => expect(container.querySelector('b')).not.toBeNull())
  unmount()
  expect(log).toEqual([])
})

it('keeps insertion effects active while layout and passive effects are disconnected', async () => {
  const { render } = setup()
  const log: string[] = []
  function Child({ value }: { value: number }) {
    React.useInsertionEffect(() => { log.push('insert:' + value); return () => { log.push('remove:' + value) } }, [value])
    return <b>{value}</b>
  }
  const tree = (mode: 'visible' | 'hidden', value: number) => <React.Activity mode={mode}><Child value={value} /></React.Activity>
  render(tree('visible', 1))
  render(tree('hidden', 1))
  await settle()
  expect(log).toEqual(['insert:1'])
  render(tree('hidden', 2))
  await settle()
  expect(log).toEqual(['insert:1', 'remove:1', 'insert:2'])
  render(tree('visible', 2))
  expect(log).toEqual(['insert:1', 'remove:1', 'insert:2'])
})

it('disconnects external store subscriptions while hidden and reconnects current state', async () => {
  const { render, container } = setup()
  let value = 1
  const listeners = new Set<() => void>()
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
  function Child() { return <b>{React.useSyncExternalStore(subscribe, () => value)}</b> }
  const tree = (mode: 'visible' | 'hidden') => <React.Activity mode={mode}><Child /></React.Activity>
  render(tree('visible'))
  expect(listeners.size).toBe(1)
  render(tree('hidden'))
  await settle()
  expect(listeners.size).toBe(0)
  value = 7
  render(tree('visible'))
  expect(listeners.size).toBe(1)
  expect(container.textContent).toBe('7')
})

it('does not activate an outer Suspense fallback for hidden prerendering', async () => {
  const { container, render } = setup()
  const pending = new Promise<void>(() => {})
  function Child() { throw pending }
  render(<React.Suspense fallback={<i>loading</i>}><span>visible</span><React.Activity mode="hidden"><Child /></React.Activity></React.Suspense>)
  await settle()
  expect(container.querySelector('i')).toBeNull()
  expect(container.querySelector('span')!.style.display).toBe('')
})

it('hydrates an omitted hidden subtree without consuming a visible sibling', async () => {
  const container = document.createElement('div')
  container.innerHTML = '<span>visible</span>'
  document.body.appendChild(container)
  const original = container.firstChild
  const errors: unknown[] = []
  const root = hydrateRoot(container, <><React.Activity mode="hidden"><b>prepared</b></React.Activity><span>visible</span></>, {
    onRecoverableError: error => errors.push(error),
  })
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  await vi.waitFor(() => expect(container.querySelector('b')).not.toBeNull())
  expect(errors).toEqual([])
  expect(container.querySelector('span')).toBe(original)
  expect(container.querySelector('b')!.style.display).toBe('none')
})

it('keeps state-driven hidden updates invisible, including new host children', async () => {
  const { render, container } = setup()
  let setValue!: React.Dispatch<React.SetStateAction<number>>
  const log: number[] = []
  function Child() {
    const [value, set] = React.useState(0)
    setValue = set
    React.useLayoutEffect(() => { log.push(value) }, [value])
    return value ? <strong style={{ display: 'grid' }}>{value}</strong> : <b>empty</b>
  }
  render(<React.Activity mode="hidden"><Child /></React.Activity>)
  await vi.waitFor(() => expect(setValue).toBeTypeOf('function'))
  flushSync(() => setValue(3))
  await vi.waitFor(() => expect(container.querySelector('strong')).not.toBeNull())
  expect(container.querySelector('strong')!.style.display).toBe('none')
  expect(log).toEqual([])
  render(<React.Activity><Child /></React.Activity>)
  expect(container.querySelector('strong')!.style.display).toBe('grid')
  expect(log).toEqual([3])
})

it('does not replay stale passive effects across back-to-back hide and reveal commits', async () => {
  const { render } = setup()
  const log: string[] = []
  function Child({ value }: { value: number }) {
    React.useEffect(() => { log.push('on:' + value); return () => { log.push('off:' + value) } }, [value])
    return <b>{value}</b>
  }
  const tree = (mode: 'visible' | 'hidden', value: number) => <React.Activity mode={mode}><Child value={value} /></React.Activity>
  render(tree('visible', 1))
  render(tree('hidden', 2))
  render(tree('visible', 3))
  await settle()
  expect(log.filter(value => value === 'on:3')).toHaveLength(1)
  expect(log.filter(value => value === 'on:2')).toHaveLength(0)
  expect(log.at(-1)).toBe('on:3')
})

it('detaches and restores imperative handles while keeping the component state', async () => {
  const { render } = setup()
  const ref = React.createRef<{ get: () => number }>()
  function Child() {
    const [value] = React.useState(7)
    React.useImperativeHandle(ref, () => ({ get: () => value }), [])
    return <b>{value}</b>
  }
  render(<React.Activity><Child /></React.Activity>)
  expect(ref.current!.get()).toBe(7)
  render(<React.Activity mode="hidden"><Child /></React.Activity>)
  await settle()
  expect(ref.current).toBeNull()
  render(<React.Activity><Child /></React.Activity>)
  expect(ref.current!.get()).toBe(7)
})

it('reattaches host callback refs before parent layout effects on reveal', async () => {
  const { render } = setup()
  let element: HTMLElement | null = null
  const ref = (node: HTMLElement | null) => { element = node }
  const observations: boolean[] = []
  function Child() {
    React.useLayoutEffect(() => { observations.push(element !== null) }, [])
    return <b ref={ref}>child</b>
  }
  render(<React.Activity><Child /></React.Activity>)
  render(<React.Activity mode="hidden"><Child /></React.Activity>)
  await settle()
  expect(element).toBeNull()
  observations.length = 0
  render(<React.Activity><Child /></React.Activity>)
  expect(observations).toEqual([true])
})

it('does not reveal a still-suspended primary tree when its Activity becomes visible', async () => {
  const { render, container } = setup()
  const pending = new Promise<void>(() => {})
  function Child({ suspended }: { suspended: boolean }) {
    if (suspended) throw pending
    return <b>primary</b>
  }
  const tree = (mode: 'visible' | 'hidden', suspended: boolean) => <React.Activity mode={mode}>
    <React.Suspense fallback={<i>fallback</i>}><Child suspended={suspended} /></React.Suspense>
  </React.Activity>
  render(tree('visible', false))
  const primary = container.querySelector('b')!
  render(tree('visible', true))
  expect(primary.style.display).toBe('none')
  render(tree('hidden', true))
  await settle()
  render(tree('visible', true))
  expect(primary.style.display).toBe('none')
  expect(container.querySelector('i')!.style.display).toBe('')
})

for (const kind of ['function', 'memo', 'forwardRef', 'class'] as const) {
  it(`preserves committed descendants when a hidden ${kind} component suspends`, async () => {
    const { render, container } = setup()
    const pending = new Promise<void>(() => {})
    let mounts = 0
    function Leaf() {
      const [value] = React.useState(() => ++mounts)
      return <b>{value}</b>
    }
    function Child({ suspended }: { suspended: boolean }) {
      if (suspended) throw pending
      return <Leaf />
    }
    class ClassChild extends React.Component<{ suspended: boolean }> {
      render() { return Child(this.props) }
    }
    const Wrapped = kind === 'memo' ? React.memo(Child)
      : kind === 'forwardRef' ? React.forwardRef<HTMLElement, { suspended: boolean }>((props, _ref) => Child(props))
        : kind === 'class' ? ClassChild : Child
    const tree = (mode: 'visible' | 'hidden', suspended: boolean) => <React.Activity mode={mode}><Wrapped suspended={suspended} /></React.Activity>
    render(tree('visible', false))
    const node = container.querySelector('b')!
    render(tree('hidden', true))
    await settle()
    expect(node.isConnected).toBe(true)
    expect(node.style.display).toBe('none')
    render(tree('visible', false))
    expect(container.querySelector('b')).toBe(node)
    expect(node.textContent).toBe('1')
    expect(mounts).toBe(1)
  })
}

it('restores display after a hidden update suspends and finishes after reveal', async () => {
  const { render, container } = setup()
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  let ready = false
  function Child({ suspended }: { suspended: boolean }) {
    if (suspended && !ready) throw promise
    return <b style={{ display: 'inline' }}>primary</b>
  }
  const tree = (mode: 'visible' | 'hidden', suspended: boolean) => <React.Activity mode={mode}>
    <React.Suspense fallback={<i>fallback</i>}><Child suspended={suspended} /></React.Suspense>
  </React.Activity>
  render(tree('visible', false))
  const node = container.querySelector('b')!
  render(tree('hidden', true))
  await settle()
  render(tree('visible', true))
  expect(container.querySelector('i')).not.toBeNull()
  ready = true
  resolve()
  await vi.waitFor(() => expect(container.querySelector('i')).toBeNull())
  expect(container.querySelector('b')).toBe(node)
  expect(node.style.display).toBe('inline')
})

it('keeps a suspended primary ref and layout effect disconnected until it resumes', async () => {
  const { render } = setup()
  const ref = React.createRef<HTMLElement>()
  const log: string[] = []
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  let ready = false
  function Child({ suspended }: { suspended: boolean }) {
    React.useLayoutEffect(() => { log.push('on'); return () => { log.push('off') } }, [])
    if (suspended && !ready) throw promise
    return <b ref={ref}>primary</b>
  }
  const tree = (mode: 'visible' | 'hidden', suspended: boolean) => <React.Activity mode={mode}>
    <React.Suspense fallback={<i>fallback</i>}><Child suspended={suspended} /></React.Suspense>
  </React.Activity>
  render(tree('visible', false))
  render(tree('visible', true))
  render(tree('hidden', true))
  await settle()
  log.length = 0
  render(tree('visible', true))
  expect(ref.current).toBeNull()
  expect(log).toEqual([])
  ready = true
  resolve()
  await vi.waitFor(() => expect(ref.current).not.toBeNull())
  expect(log).toEqual(['on'])
})

it('cleans up layout effects that share their cleanup function with an insertion effect', async () => {
  const { render, unmount } = setup()
  let cleaned = 0
  const cleanup = () => { cleaned++ }
  function Child() {
    React.useInsertionEffect(() => cleanup, [])
    React.useLayoutEffect(() => cleanup, [])
    return <b>shared</b>
  }
  render(<React.Activity><Child /></React.Activity>)
  render(<React.Activity mode="hidden"><Child /></React.Activity>)
  await settle()
  expect(cleaned).toBe(1)
  render(<React.Activity><Child /></React.Activity>)
  expect(cleaned).toBe(1)
  unmount()
  expect(cleaned).toBe(3)
})

it('preserves layout cleanup order when insertion effects share a cleanup function', async () => {
  const { render } = setup()
  const log: string[] = []
  const shared = () => { log.push('shared') }
  function Child() {
    React.useLayoutEffect(() => shared, [])
    React.useLayoutEffect(() => () => { log.push('middle') }, [])
    React.useInsertionEffect(() => shared, [])
    return <b>ordered</b>
  }
  render(<React.Activity><Child /></React.Activity>)
  render(<React.Activity mode="hidden"><Child /></React.Activity>)
  await settle()
  expect(log).toEqual(['shared', 'middle'])
})
