import { afterEach, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.restoreAllMocks() })

function setup() {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return { container, render: (node: React.ReactNode) => flushSync(() => root.render(node)) }
}

it('runs class snapshots after every render and before any sibling DOM mutation', () => {
  const { container, render } = setup()
  const log: unknown[] = []
  let instance!: Counter
  class Counter extends React.Component<{ label: string }, { value: number }> {
    state = { value: 0 }
    constructor(props: { label: string }) { super(props); instance = this }
    render() { log.push('render'); return <b>{this.props.label}:{this.state.value}</b> }
    getSnapshotBeforeUpdate(props: { label: string }, state: { value: number }) {
      const snapshot = { dom: container.textContent, label: props.label, value: state.value }
      log.push(snapshot)
      return snapshot
    }
    componentDidUpdate(_props: { label: string }, _state: { value: number }, snapshot: unknown) {
      log.push(['commit', container.textContent, snapshot])
    }
  }
  function Following({ text }: { text: string }) { log.push('following'); return <i>{text}</i> }
  const tree = (label: string) => <><div>{label}</div><Counter label={label} /><Following text={label} /></>
  render(tree('old'))
  log.length = 0
  flushSync(() => { instance.setState({ value: 1 }); render(tree('next')) })
  const snapshot = { dom: 'oldold:0old', label: 'old', value: 0 }
  expect(log).toEqual(['render', 'following', snapshot, ['commit', 'nextnext:1next', snapshot]])
})

it('keeps Activity effects, refs and live display connected until snapshots finish', () => {
  const { container, render } = setup()
  const ref = React.createRef<HTMLDivElement>()
  const log: string[] = []
  function Child() {
    React.useLayoutEffect(() => () => { log.push('cleanup') }, [])
    return <div ref={ref}>retained</div>
  }
  class Probe extends React.Component<{ hidden: boolean }> {
    render() { return null }
    getSnapshotBeforeUpdate() {
      log.push(`snapshot:${ref.current?.style.display}:${container.textContent}`)
      return null
    }
    componentDidUpdate() {}
  }
  const tree = (hidden: boolean) => <><React.Activity mode={hidden ? 'hidden' : 'visible'}><Child /></React.Activity><Probe hidden={hidden} /></>
  render(tree(false))
  const node = ref.current!
  render(tree(true))
  expect(log).toEqual(['snapshot::retained', 'cleanup'])
  expect(node.style.display).toBe('none')
  expect(ref.current).toBeNull()
})

it('detaches the committed ref when an Activity hides while its ref changes', () => {
  const { render } = setup()
  const first = React.createRef<HTMLDivElement>()
  const second = React.createRef<HTMLDivElement>()
  const tree = (hidden: boolean, ref: React.Ref<HTMLDivElement>) => <React.Activity mode={hidden ? 'hidden' : 'visible'}><div ref={ref}>child</div></React.Activity>
  render(tree(false, first))
  const node = first.current
  render(tree(true, second))
  expect(first.current).toBeNull()
  expect(second.current).toBeNull()
  render(tree(false, second))
  expect(first.current).toBeNull()
  expect(second.current).toBe(node)
})

it('advances committed class state through a shouldComponentUpdate bailout', () => {
  const { render } = setup()
  const observed: number[] = []
  let instance!: Counter
  class Counter extends React.Component<{ skip: boolean }, { value: number }> {
    state = { value: 0 }
    constructor(props: { skip: boolean }) { super(props); instance = this }
    shouldComponentUpdate(props: { skip: boolean }) { return !props.skip }
    render() { return <b>{this.state.value}</b> }
    getSnapshotBeforeUpdate(_props: { skip: boolean }, state: { value: number }) { observed.push(state.value); return null }
    componentDidUpdate() {}
  }
  render(<Counter skip />)
  flushSync(() => instance.setState({ value: 1 }))
  expect(observed).toEqual([])
  render(<Counter skip={false} />)
  expect(observed).toEqual([1])
})

it('commits changed class refs even when shouldComponentUpdate returns false', () => {
  const { render } = setup()
  class Counter extends React.Component<{ ref?: React.Ref<Counter> }> {
    shouldComponentUpdate() { return false }
    render() { return <b>child</b> }
  }
  const first = React.createRef<Counter>()
  const second = React.createRef<Counter>()
  render(<Counter ref={first} />)
  const instance = first.current
  render(<Counter ref={second} />)
  expect(first.current).toBeNull()
  expect(second.current).toBe(instance)
})

it('discards partial primary DOM updates and effects when a sibling suspends', async () => {
  const { container, render } = setup()
  const log: string[] = []
  let ready = false
  let resolve!: () => void
  const pending = new Promise<void>(done => { resolve = done })
  function Sibling({ value }: { value: string }) {
    React.useLayoutEffect(() => { log.push(value) }, [value])
    return <b>{value}</b>
  }
  function Pending({ suspend }: { suspend: boolean }) {
    if (suspend && !ready) throw pending
    return <span>ready</span>
  }
  const tree = (value: string, suspend: boolean) => <React.Suspense fallback={<i>fallback</i>}>
    <section><Sibling value={value} /><Pending suspend={suspend} /></section>
  </React.Suspense>
  render(tree('old', false))
  const primary = container.querySelector('section')!
  log.length = 0
  render(tree('new', true))
  expect(primary.textContent).toBe('oldready')
  expect(primary.style.display).toBe('none')
  expect(container.querySelector('i')?.textContent).toBe('fallback')
  expect(log).toEqual([])
  ready = true
  resolve()
  await vi.waitFor(() => expect(container.querySelector('i')).toBeNull())
  expect(primary.textContent).toBe('newready')
  expect(log).toEqual(['new'])
})

it('defers hydration form initialization until component rendering finishes', () => {
  const container = document.createElement('div')
  container.innerHTML = '<input value="server"><span>reader</span>'
  document.body.append(container)
  const observed: string[] = []
  function Reader() {
    observed.push(container.querySelector('input')!.defaultValue)
    return <span>reader</span>
  }
  let root!: ReturnType<typeof hydrateRoot>
  flushSync(() => { root = hydrateRoot(container, <><input defaultValue="client" /><Reader /></>) })
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  expect(observed).toEqual(['server'])
  expect(container.querySelector('input')!.defaultValue).toBe('client')
})

it('discards failed sibling layout work before an error boundary commits its fallback', () => {
  const { container, render } = setup()
  const log: string[] = []
  class Boundary extends React.Component<{ children?: React.ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() { return { failed: true } }
    componentDidCatch() { log.push('caught:' + container.textContent) }
    render() { return this.state.failed ? <i>fallback</i> : this.props.children }
  }
  function Sibling() {
    React.useLayoutEffect(() => { log.push('failed layout') }, [])
    return <b>discarded</b>
  }
  function Broken(): React.ReactNode { throw new Error('broken') }
  render(<Boundary><Sibling /><Broken /></Boundary>)
  expect(container.textContent).toBe('fallback')
  expect(log).toEqual(['caught:fallback'])
})

it('reads the committed Fragment host view during class snapshots', () => {
  const { render } = setup()
  const ref = React.createRef<React.FragmentInstance>()
  const observed: number[][] = []
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    return [new DOMRect(Number(this.getAttribute('data-x')), 0, 1, 1)] as unknown as DOMRectList
  })
  class Probe extends React.Component<{ updated: boolean }> {
    render() { return null }
    getSnapshotBeforeUpdate() { observed.push(ref.current!.getClientRects().map(rect => rect.x)); return null }
    componentDidUpdate() {}
  }
  const tree = (updated: boolean) => <><React.Fragment ref={ref}>
    {updated ? <><i data-x="2" /><i data-x="3" /></> : <b data-x="1" />}
  </React.Fragment><Probe updated={updated} /></>
  render(tree(false))
  render(tree(true))
  expect(observed).toEqual([[1]])
  expect(ref.current!.getClientRects().map(rect => rect.x)).toEqual([2, 3])
})

it('keeps Fragment reads on committed DOM while the browser update callback is pending', async () => {
  const { render } = setup()
  if (!globalThis.CSS) {
    vi.stubGlobal('CSS', { escape: (value: string) => value })
    cleanups.push(() => vi.unstubAllGlobals())
  }
  const ref = React.createRef<React.FragmentInstance>()
  const descriptor = Object.getOwnPropertyDescriptor(document, 'startViewTransition')
  let nativeUpdate: (() => unknown) | undefined
  let finish!: () => void
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value(options: { update: () => unknown }) {
      nativeUpdate = options.update
      return {
        ready: new Promise<void>(() => {}),
        updateCallbackDone: Promise.resolve(),
        finished: new Promise<void>(resolve => { finish = resolve }),
        skipTransition() { finish() },
      }
    },
  })
  cleanups.push(() => {
    if (descriptor) Object.defineProperty(document, 'startViewTransition', descriptor)
    else delete (document as Partial<Document>).startViewTransition
  })
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    return [new DOMRect(Number(this.getAttribute('data-x')), 0, 1, 1)] as unknown as DOMRectList
  })
  let update!: (value: boolean) => void
  function App() {
    const [changed, set] = React.useState(false)
    update = set
    return <React.ViewTransition name="fragment-phase"><React.Fragment ref={ref}>
      {changed ? <i data-x="2">next</i> : <b data-x="1">old</b>}
    </React.Fragment></React.ViewTransition>
  }
  render(<App />)
  React.startTransition(() => update(true))
  await vi.waitFor(() => expect(nativeUpdate).toBeTypeOf('function'))
  expect(ref.current!.getClientRects().map(rect => rect.x)).toEqual([1])
  flushSync(() => {})
  expect(ref.current!.getClientRects().map(rect => rect.x)).toEqual([2])
  nativeUpdate!()
})

it('catches independently scheduled child render errors in its nearest class boundary', () => {
  const { container, render } = setup()
  const log: string[] = []
  let set!: (value: boolean) => void
  class Boundary extends React.Component<{ children?: React.ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() { return { failed: true } }
    componentDidCatch() { log.push('caught') }
    render() { return this.state.failed ? <i>fallback</i> : this.props.children }
  }
  function Child() {
    const [failed, update] = React.useState(false)
    set = update
    if (failed) throw new Error('child update')
    return <b>child</b>
  }
  render(<Boundary><Child /></Boundary>)
  flushSync(() => set(true))
  expect(container.textContent).toBe('fallback')
  expect(log).toEqual(['caught'])
})
