import { afterEach, expect, it, vi } from 'vitest'
import { Activity, Component, Suspense, createRef, memo, type ReactNode, type Ref } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanups: (() => void)[] = []
let id = 0
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); document.head.innerHTML = '' })

function setup(kind: 'activity' | 'suspense') {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const pending = new Promise<void>(() => {})
  function Gate({ hidden }: { hidden: boolean }) { if (hidden) throw pending; return null }
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return (children: ReactNode, hidden: boolean) => flushSync(() => root.render(kind === 'activity'
    ? <Activity mode={hidden ? 'hidden' : 'visible'}>{children}</Activity>
    : <Suspense fallback={<i>wait</i>}>{children}<Gate hidden={hidden} /></Suspense>))
}

for (const kind of ['activity', 'suspense'] as const) {
  it(`${kind} restores object and cleanup callback refs on the same managed style resources`, async () => {
    const render = setup(kind)
    const ref = createRef<HTMLStyleElement>()
    const cleanup = vi.fn()
    const callback = vi.fn((node: HTMLStyleElement | null) => node ? cleanup : undefined)
    const resource = <><style href={`retained-${++id}`} precedence="theme" ref={ref}>{'a{}'}</style><style href={`retained-${++id}`} precedence="theme" ref={callback}>{'b{}'}</style></>
    render(resource, false)
    const original = ref.current
    const originalCallback = callback.mock.calls[0]![0]
    expect(original).not.toBeNull()
    render(resource, true)
    await vi.waitFor(() => expect(ref.current).toBeNull())
    expect(original!.isConnected).toBe(true)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledTimes(1)
    render(resource, false)
    expect(ref.current).toBe(original)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback.mock.calls[1]![0]).toBe(originalCallback)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  for (const wrapper of ['direct', 'memo', 'double-memo'] as const) {
    it(`${kind} restores ${wrapper} class refs and mount lifecycles with committed cleanup props and state`, async () => {
      const render = setup(kind)
      const log: string[] = []
      class Child extends Component<{ label: string, ref?: Ref<Child> }, { label: string }> {
        state = { label: '' }
        static getDerivedStateFromProps(props: { label: string }) { return { label: props.label } }
        componentDidMount() { log.push(`mount:${this.props.label}:${this.state.label}`) }
        componentWillUnmount() { log.push(`unmount:${this.props.label}:${this.state.label}`) }
        render() { return <b>{this.props.label}</b> }
      }
      // React accepts class components here; Redact's memo type currently only declares functions.
      const Wrapped: typeof Child = wrapper === 'direct' ? Child : wrapper === 'memo' ? memo(Child as any) as any : memo(memo(Child as any)) as any
      const ref = createRef<Child>()
      render(<Wrapped ref={ref} label="one" />, false)
      const original = ref.current
      render(<Wrapped ref={ref} label="two" />, true)
      await vi.waitFor(() => expect(ref.current).toBeNull())
      expect(log).toEqual(['mount:one:one', 'unmount:one:one'])
      render(<Wrapped ref={ref} label="three" />, false)
      expect(ref.current).toBe(original)
      expect(log).toEqual(['mount:one:one', 'unmount:one:one', 'mount:three:three'])
    })

    it(`${kind} runs ${wrapper} class didMount before reattaching its callback ref`, async () => {
      const render = setup(kind)
      const log: string[] = []
      class Child extends Component<{ ref?: Ref<Child> }> {
        componentDidMount() { log.push('mount') }
        render() { return <b>child</b> }
      }
      const Wrapped: typeof Child = wrapper === 'direct' ? Child : wrapper === 'memo' ? memo(Child as any) as any : memo(memo(Child as any)) as any
      const ref = (node: Child | null) => { log.push(node ? 'ref' : 'clear') }
      const child = <Wrapped ref={ref} />
      render(child, false)
      expect(log).toEqual(['mount', 'ref'])
      render(child, true)
      await vi.waitFor(() => expect(log).toEqual(['mount', 'ref', 'clear']))
      log.length = 0
      render(child, false)
      expect(log).toEqual(['mount', 'ref'])
    })
  }
}
