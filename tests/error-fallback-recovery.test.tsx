import { afterEach, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 30))
type Props = { children?: React.ReactNode; fallback: (props: { error: unknown }) => React.ReactNode; onCatch?: (error: unknown) => void; reset?: number }
class Boundary extends React.Component<Props, { error: unknown; reset?: number }> {
  state: { error: unknown; reset?: number } = { error: null }
  static getDerivedStateFromProps(props: Props, state: { reset?: number }) { return state.reset !== props.reset ? { error: null, reset: props.reset } : null }
  static getDerivedStateFromError(error: unknown) { return { error } }
  componentDidCatch(error: unknown) { this.props.onCatch?.(error) }
  render() { const Fallback = this.props.fallback; return this.state.error ? <Fallback error={this.state.error} /> : this.props.children }
}
function setup() {
  const container = document.createElement('div'); document.body.append(container)
  const errors: unknown[] = []
  const root = createRoot(container, { onCaughtError() {}, onUncaughtError: error => errors.push(error) })
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return { container, root, errors, render: (element: React.ReactNode) => flushSync(() => root.render(element)) }
}

it('propagates errors thrown by a fallback to its ancestor instead of recatching them', async () => {
  const { container, render, errors } = setup()
  const caught: unknown[] = []
  const failure = new Error('original failure')
  function Throw(): React.ReactNode { throw failure }
  function Rethrow({ error }: { error: unknown }): React.ReactNode { throw error }
  function Recovered() { return <strong>Recovered</strong> }
  render(<Boundary fallback={Recovered} onCatch={error => caught.push(error)}><Boundary fallback={Rethrow} onCatch={() => caught.push('wrong owner')}><Throw /></Boundary></Boundary>)
  await tick()
  expect(container.textContent).toBe('Recovered')
  expect(caught).toEqual([failure])
  expect(errors).toEqual([])
})

for (const source of ['state', 'store'] as const) {
  it(`commits a suspended error fallback and its catch lifecycle once after a ${source} update through memo`, async () => {
    const { container, render, errors } = setup()
    const events: string[] = []
    const failure = new Error('denied')
    let denied = false, ready = false
    let setDenied!: (value: boolean) => void
    let release!: () => void
    const waiting = new Promise<void>(resolve => { release = () => { ready = true; resolve() } })
    const listeners = new Set<() => void>()
    const subscribe = (callback: () => void) => { listeners.add(callback); return () => { listeners.delete(callback) } }
    const snapshot = () => denied
    function Content() {
      const [state, set] = React.useState(false); setDenied = set
      const external = React.useSyncExternalStore(subscribe, snapshot)
      if (source === 'state' ? state : external) throw failure
      return <article>Private</article>
    }
    function Fallback() {
      if (!ready) throw waiting
      React.useLayoutEffect(() => { events.push('fallback-layout') }, [])
      return <strong>Denied</strong>
    }
    const Stable = React.memo(() => <Content />)
    const Wrapped = React.memo(() => <Boundary fallback={Fallback} onCatch={() => events.push('caught')}><Stable /></Boundary>)
    render(<React.Suspense fallback={<i>Waiting</i>}><Wrapped /></React.Suspense>)
    denied = true
    if (source === 'state') setDenied(true)
    else for (const notify of listeners) notify()
    await tick()
    expect(container.textContent).toContain('Waiting')
    release()
    await tick()
    await vi.waitFor(() => expect(container.textContent).toBe('Denied'))
    expect(events).toEqual(['fallback-layout', 'caught'])
    expect(errors).toEqual([])
  })
}

it('abandons a suspended captured error when the boundary receives reset props', async () => {
  const { container, render, errors } = setup()
  let fail = false
  let update!: () => void
  const caught: unknown[] = []
  const pending = new Promise<void>(() => {})
  function Content() { const [, set] = React.useState(0); update = () => set(value => value + 1); if (fail) throw new Error('old error'); return <b>Healthy</b> }
  function Pending(): React.ReactNode { throw pending }
  const Stable = React.memo(Content)
  const tree = (reset: number) => <React.Suspense fallback={<i>Waiting</i>}><Boundary reset={reset} fallback={Pending} onCatch={error => caught.push(error)}><Stable /></Boundary></React.Suspense>
  render(tree(0)); fail = true; update(); await tick()
  expect(container.textContent).toContain('Waiting')
  fail = false; render(tree(1)); await tick()
  expect(container.textContent).toBe('Healthy')
  expect(caught).toEqual([])
  expect(errors).toEqual([])
})

it('replaces document HTML only after deleting the previous root, while preserving the doctype', async () => {
  const doc = document.implementation.createHTMLDocument('')
  const errors: unknown[] = []
  let fail!: () => void
  function Content() { const [failed, set] = React.useState(false); fail = () => set(true); if (failed) throw new Error('document failed'); return <html><head /><body><main>Healthy</main></body></html> }
  function Fallback() { return <html><head /><body><main>Recovered</main></body></html> }
  doc.documentElement.innerHTML = '<head></head><body><main>Healthy</main></body>'
  const root = hydrateRoot(doc, <Boundary fallback={Fallback}><Content /></Boundary>, { onCaughtError() {}, onUncaughtError: error => errors.push(error) })
  cleanups.push(() => flushSync(() => root.unmount()))
  await tick()
  fail(); await tick()
  await vi.waitFor(() => expect(doc.body.textContent).toBe('Recovered'))
  expect(doc.querySelectorAll('html')).toHaveLength(1)
  expect(doc.doctype).not.toBeNull()
  expect(errors).toEqual([])
})
