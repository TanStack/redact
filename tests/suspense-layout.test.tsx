import { afterEach, expect, it, vi } from 'vitest'
import { Activity, Component, Suspense, createRef, useEffect, useInsertionEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { Dispatch, ReactNode, Ref, SetStateAction } from 'react'

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

it('disconnects stable layout effects and refs while preserving passive and insertion effects', async () => {
  const { container, render, unmount } = setup()
  const pending = new Promise<void>(() => {})
  const layout: string[] = [], passive: string[] = [], insertion: string[] = [], refs: string[] = []
  const ref = (node: HTMLElement | null) => { refs.push(node ? 'set' : 'clear') }
  function Child({ label }: { label: string }) {
    useLayoutEffect(() => { layout.push(label); return () => { layout.push('clear:' + label) } }, [])
    useEffect(() => { passive.push(label); return () => { passive.push('clear:' + label) } }, [])
    useInsertionEffect(() => { insertion.push(label); return () => { insertion.push('clear:' + label) } }, [])
    return <b ref={ref}>{label}</b>
  }
  function Gate({ blocked }: { blocked: boolean }) { if (blocked) throw pending; return null }
  const view = (label: string, blocked: boolean) => <Suspense fallback={<i>loading</i>}><Child label={label} /><Gate blocked={blocked} /></Suspense>
  render(view('one', false))
  await vi.waitFor(() => expect(passive).toEqual(['one']))
  const primary = container.querySelector('b')
  render(view('two', true))
  expect(layout).toEqual(['one', 'clear:one'])
  expect(refs).toEqual(['set', 'clear'])
  expect(passive).toEqual(['one'])
  expect(insertion).toEqual(['one'])
  render(view('three', false))
  expect(container.querySelector('b')).toBe(primary)
  expect(layout).toEqual(['one', 'clear:one', 'three'])
  expect(refs).toEqual(['set', 'clear', 'set'])
  expect(passive).toEqual(['one'])
  expect(insertion).toEqual(['one'])
  unmount()
  expect(layout).toEqual(['one', 'clear:one', 'three', 'clear:three'])
  expect(refs).toEqual(['set', 'clear', 'set', 'clear'])
  await vi.waitFor(() => expect(passive).toEqual(['one', 'clear:one']))
})

it.each(['parent', 'state'])('disconnects object refs and callback-ref cleanups when hidden by %s work', source => {
  const { container, render } = setup()
  const pending = new Promise<void>(() => {})
  const object = createRef<HTMLElement>(), callback = vi.fn(() => cleanup), cleanup = vi.fn(), layout = vi.fn(), teardown = vi.fn()
  let set!: Dispatch<SetStateAction<boolean>>
  function Child({ blocked }: { blocked: boolean }) {
    const [wait, update] = useState(false); set = update
    useLayoutEffect(() => { layout(); return teardown }, [])
    if (source === 'state' && wait) throw pending
    return <><b ref={object}>value</b><span ref={callback}>other</span><Gate blocked={blocked} /></>
  }
  function Gate({ blocked }: { blocked: boolean }) { if (blocked) throw pending; return null }
  const view = (blocked: boolean) => <Suspense fallback={<i>loading</i>}><Child blocked={blocked} /></Suspense>
  render(view(false))
  const primary = object.current
  if (source === 'state') flushSync(() => set(true))
  else render(view(true))
  expect(container.querySelector('i')?.textContent).toBe('loading')
  expect(object.current).toBeNull()
  expect(callback).toHaveBeenCalledTimes(1)
  expect(cleanup).toHaveBeenCalledTimes(1)
  expect(teardown).toHaveBeenCalledTimes(1)
  if (source === 'state') flushSync(() => set(false))
  else render(view(false))
  expect(object.current).toBe(primary)
  expect(callback).toHaveBeenCalledTimes(2)
  expect(cleanup).toHaveBeenCalledTimes(1)
  expect(layout).toHaveBeenCalledTimes(2)
})

it('does not repeat layout or ref teardown when a hidden primary unmounts', () => {
  const { render, unmount } = setup()
  const pending = new Promise<void>(() => {})
  const teardown = vi.fn(), cleanup = vi.fn(), callback = vi.fn(() => cleanup)
  function Child() { useLayoutEffect(() => teardown, []); return <b ref={callback}>value</b> }
  function Gate({ blocked }: { blocked: boolean }) { if (blocked) throw pending; return null }
  const view = (blocked: boolean) => <Suspense fallback={<i>loading</i>}><Child /><Gate blocked={blocked} /></Suspense>
  render(view(false))
  render(view(true))
  expect(teardown).toHaveBeenCalledTimes(1)
  expect(cleanup).toHaveBeenCalledTimes(1)
  unmount()
  expect(teardown).toHaveBeenCalledTimes(1)
  expect(cleanup).toHaveBeenCalledTimes(1)
})

it('reconnects class layout lifecycles and refs without remounting the instance', () => {
  const { render, unmount } = setup()
  const pending = new Promise<void>(() => {})
  const mounted = vi.fn(), unmounted = vi.fn(), updated = vi.fn(), snapshot = vi.fn(() => null)
  const ref = createRef<Child>()
  class Child extends Component<{ label: string, ref?: Ref<Child> }> {
    componentDidMount() { mounted(this.props.label) }
    componentWillUnmount() { unmounted(this.props.label) }
    componentDidUpdate() { updated() }
    getSnapshotBeforeUpdate() { return snapshot() }
    render() { return <b>{this.props.label}</b> }
  }
  function Gate({ blocked }: { blocked: boolean }) { if (blocked) throw pending; return null }
  const view = (label: string, blocked: boolean) => <Suspense fallback={<i>loading</i>}><Child ref={ref} label={label} /><Gate blocked={blocked} /></Suspense>
  render(view('one', false))
  const instance = ref.current
  render(view('two', true))
  expect(ref.current).toBeNull()
  expect(unmounted.mock.calls).toEqual([['one']])
  expect(snapshot).not.toHaveBeenCalled()
  render(view('three', false))
  expect(ref.current).toBe(instance)
  expect(mounted.mock.calls).toEqual([['one'], ['three']])
  expect(updated).not.toHaveBeenCalled()
  expect(snapshot).not.toHaveBeenCalled()
  unmount()
  expect(unmounted.mock.calls).toEqual([['one'], ['three']])
})

it('keeps external-store subscriptions live while Suspense hides layout effects', () => {
  const { container, render } = setup()
  const pending = new Promise<void>(() => {})
  let value = 0, notify = () => {}
  const unsubscribe = vi.fn(), subscribe = vi.fn((listener: () => void) => { notify = listener; return unsubscribe })
  function Child() { const state = useSyncExternalStore(subscribe, () => value); return <b>{state}</b> }
  function Gate({ blocked }: { blocked: boolean }) { if (blocked) throw pending; return null }
  const view = (blocked: boolean) => <Suspense fallback={<i>loading</i>}><Child /><Gate blocked={blocked} /></Suspense>
  render(view(false))
  render(view(true))
  expect(unsubscribe).not.toHaveBeenCalled()
  flushSync(() => { value = 3; notify() })
  render(view(false))
  expect(container.textContent).toBe('3')
  expect(subscribe).toHaveBeenCalledTimes(1)
})

it('does not reconnect an inner hidden primary when an outer boundary reveals', () => {
  const { render } = setup()
  const inner = new Promise<void>(() => {}), outer = new Promise<void>(() => {})
  const mounted = vi.fn(), teardown = vi.fn()
  function Child() { useLayoutEffect(() => { mounted(); return teardown }, []); return <b>child</b> }
  function Gate({ blocked, pending }: { blocked: boolean, pending: Promise<void> }) { if (blocked) throw pending; return null }
  const view = (innerBlocked: boolean, outerBlocked: boolean) => <Suspense fallback={<em>outer</em>}>
    <Suspense fallback={<i>inner</i>}><Child /><Gate blocked={innerBlocked} pending={inner} /></Suspense>
    <Gate blocked={outerBlocked} pending={outer} />
  </Suspense>
  render(view(false, false)); render(view(true, false)); render(view(true, true))
  expect(teardown).toHaveBeenCalledTimes(1)
  render(view(true, false))
  expect(mounted).toHaveBeenCalledTimes(1)
  render(view(false, false))
  expect(mounted).toHaveBeenCalledTimes(2)
})

it('coordinates layout and passive reconnects when Activity wraps a suspended primary', async () => {
  const { render } = setup()
  const pending = new Promise<void>(() => {})
  const layout = vi.fn(), unlayout = vi.fn(), passive = vi.fn(), unpassive = vi.fn()
  function Child() {
    useLayoutEffect(() => { layout(); return unlayout }, [])
    useEffect(() => { passive(); return unpassive }, [])
    return <b>child</b>
  }
  function Gate({ blocked }: { blocked: boolean }) { if (blocked) throw pending; return null }
  const view = (mode: 'visible' | 'hidden', blocked: boolean) => <Activity mode={mode}><Suspense fallback={<i>loading</i>}><Child /><Gate blocked={blocked} /></Suspense></Activity>
  render(view('visible', false))
  await vi.waitFor(() => expect(passive).toHaveBeenCalledTimes(1))
  render(view('visible', true))
  expect(unlayout).toHaveBeenCalledTimes(1)
  expect(unpassive).not.toHaveBeenCalled()
  render(view('hidden', true))
  await vi.waitFor(() => expect(unpassive).toHaveBeenCalledTimes(1))
  expect(unlayout).toHaveBeenCalledTimes(1)
  render(view('visible', true))
  expect(layout).toHaveBeenCalledTimes(1)
  render(view('visible', false))
  expect(layout).toHaveBeenCalledTimes(2)
  await vi.waitFor(() => expect(passive).toHaveBeenCalledTimes(2))
})

it('tears down parent layout effects before child refs and hides DOM afterward', () => {
  const { render } = setup()
  const pending = new Promise<void>(() => {})
  const log: string[] = []
  let node: HTMLElement | null = null
  const ref = (element: HTMLElement | null) => { node = element; log.push(element ? 'ref:set' : 'ref:clear') }
  function Child() {
    useLayoutEffect(() => { log.push('child'); return () => { log.push(`child:clear:${node?.style.display}`) } }, [])
    return <b ref={ref}>child</b>
  }
  function Parent() {
    useLayoutEffect(() => { log.push('parent'); return () => { log.push(`parent:clear:${node?.style.display}`) } }, [])
    return <Child />
  }
  function Gate({ blocked }: { blocked: boolean }) { if (blocked) throw pending; return null }
  const view = (blocked: boolean) => <Suspense fallback={<i>loading</i>}><Parent /><Gate blocked={blocked} /></Suspense>
  render(view(false)); render(view(true)); render(view(false))
  expect(log).toEqual(['ref:set', 'child', 'parent', 'parent:clear:', 'child:clear:', 'ref:clear', 'ref:set', 'child', 'parent'])
})

it('reconnects retained and newly inserted layout effects in final tree order', () => {
  const { render } = setup()
  const pending = new Promise<void>(() => {})
  const log: string[] = []
  const refs = [() => { log.push('ref:a') }, () => { log.push('ref:b') }]
  function Child({ name, index }: { name: string, index: number, key?: string }) {
    useLayoutEffect(() => { log.push(name) }, [])
    return <b ref={refs[index]}>{name}</b>
  }
  function Parent({ expanded }: { expanded: boolean }) {
    useLayoutEffect(() => { log.push('parent') }, [])
    return <div><Child key="a" name="a" index={0} />{expanded && <Child key="b" name="b" index={1} />}</div>
  }
  function Gate({ blocked }: { blocked: boolean }) { if (blocked) throw pending; return null }
  const view = (expanded: boolean, blocked: boolean) => <Suspense fallback={<i>loading</i>}><Parent expanded={expanded} /><Gate blocked={blocked} /></Suspense>
  render(view(false, false)); render(view(false, true)); log.length = 0
  render(view(true, false))
  expect(log).toEqual(['ref:a', 'a', 'ref:b', 'b', 'parent'])
})

it('does not reconnect layout work from an inner reveal that an outer suspension abandons', () => {
  const { render } = setup()
  const inner = new Promise<void>(() => {}), outer = new Promise<void>(() => {})
  const layout: string[] = [], refs: string[] = []
  const ref = (node: HTMLElement | null) => { refs.push(node ? 'set' : 'clear') }
  function Child({ label }: { label: string }) { useLayoutEffect(() => { layout.push(label) }, []); return <b ref={ref}>{label}</b> }
  function Gate({ blocked, pending }: { blocked: boolean, pending: Promise<void> }) { if (blocked) throw pending; return null }
  const view = (label: string, innerBlocked: boolean, outerBlocked: boolean) => <Suspense fallback={<em>outer</em>}>
    <Suspense fallback={<i>inner</i>}><Child label={label} /><Gate blocked={innerBlocked} pending={inner} /></Suspense>
    <Gate blocked={outerBlocked} pending={outer} />
  </Suspense>
  render(view('one', false, false)); render(view('two', true, false)); render(view('three', false, true))
  expect(layout).toEqual(['one'])
  expect(refs).toEqual(['set', 'clear'])
  render(view('four', false, false))
  expect(layout).toEqual(['one', 'four'])
  expect(refs).toEqual(['set', 'clear', 'set'])
})

it('routes disappearing layout cleanup errors to the surrounding error boundary once', () => {
  const { container, render } = setup()
  const pending = new Promise<void>(() => {}), error = new Error('disappear failed'), caught = vi.fn(), cleanup = vi.fn(() => { throw error })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() { return { failed: true } }
    componentDidCatch(error: unknown) { caught(error) }
    render() { return this.state.failed ? <strong>failed</strong> : this.props.children }
  }
  function Child() { useLayoutEffect(() => cleanup, []); return <b>child</b> }
  function Gate({ blocked }: { blocked: boolean }) { if (blocked) throw pending; return null }
  const view = (blocked: boolean) => <Boundary><Suspense fallback={<i>loading</i>}><Child /><Gate blocked={blocked} /></Suspense></Boundary>
  render(view(false)); render(view(true))
  expect(container.textContent).toBe('failed')
  expect(cleanup).toHaveBeenCalledTimes(1)
  expect(caught).toHaveBeenCalledWith(error)
})
