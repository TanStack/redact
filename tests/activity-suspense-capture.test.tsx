import { afterEach, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return { container, render: (node: React.ReactNode) => flushSync(() => root.render(node)) }
}

it('keeps a nested hidden Activity from activating the Suspense outside that Activity', async () => {
  const { container, render } = setup()
  const pending = new Promise<void>(() => {})
  function Pending() { throw pending }
  const view = (outer: 'hidden' | 'visible', inner: 'hidden' | 'visible') => <React.Activity mode={outer}>
    <React.Suspense fallback={<i>fallback</i>}>
      <span>primary</span><React.Activity mode={inner}><Pending /></React.Activity>
    </React.Suspense>
  </React.Activity>
  render(view('hidden', 'hidden'))
  await vi.waitFor(() => expect(container.querySelector('span')).not.toBeNull())
  const primary = container.querySelector('span')!
  expect(container.querySelector('i')).toBeNull()
  render(view('visible', 'hidden'))
  expect(container.querySelector('span')).toBe(primary)
  expect(primary.style.display).toBe('')
  expect(container.querySelector('i')).toBeNull()
  render(view('visible', 'visible'))
  expect(primary.style.display).toBe('none')
  expect(container.querySelector('i')?.textContent).toBe('fallback')
})

it('isolates a hidden state-driven suspension until that Activity becomes visible', async () => {
  const { container, render } = setup()
  const pending = new Promise<void>(() => {})
  let set!: React.Dispatch<React.SetStateAction<boolean>>
  function Child() {
    const [blocked, update] = React.useState(false)
    set = update
    if (blocked) throw pending
    return <b>child</b>
  }
  const view = (mode: 'hidden' | 'visible') => <React.Suspense fallback={<i>fallback</i>}>
    <span>primary</span><React.Activity mode={mode}><Child /></React.Activity>
  </React.Suspense>
  render(view('visible'))
  const primary = container.querySelector('span')!, child = container.querySelector('b')!
  render(view('hidden'))
  flushSync(() => set(true))
  await new Promise(resolve => setTimeout(resolve, 30))
  expect(container.querySelector('i')).toBeNull()
  expect(primary.style.display).toBe('')
  expect(child.isConnected).toBe(true)
  expect(child.style.display).toBe('none')
  render(view('visible'))
  expect(primary.style.display).toBe('none')
  expect(container.querySelector('i')?.textContent).toBe('fallback')
})

it('keeps an outer fallback when a nested fallback suspends inside hidden Activity', () => {
  const { container, render } = setup()
  const primaryPending = new Promise<void>(() => {}), fallbackPending = new Promise<void>(() => {})
  let set!: React.Dispatch<React.SetStateAction<number>>
  function Primary({ blocked }: { blocked: boolean }) { if (blocked) throw primaryPending; return <b>primary</b> }
  function InnerFallback({ blocked }: { blocked: boolean }) { if (blocked) throw fallbackPending; return <i>inner</i> }
  function OuterFallback() {
    const [value, update] = React.useState(0)
    set = update
    return <em>{value}</em>
  }
  const fallback = <OuterFallback />
  const view = (mode: 'hidden' | 'visible', blocked: boolean, innerBlocked = blocked) => <React.Activity mode={mode}>
    <React.Suspense fallback={fallback}>
      <React.Suspense fallback={<InnerFallback blocked={innerBlocked} />}><Primary blocked={blocked} /></React.Suspense>
    </React.Suspense>
  </React.Activity>
  render(view('visible', false))
  render(view('visible', true))
  const outer = container.querySelector('em')!
  expect(outer).not.toBeNull()
  render(view('hidden', true))
  flushSync(() => set(4))
  render(view('visible', true))
  expect(container.querySelector('em')).toBe(outer)
  expect(outer.textContent).toBe('4')
  expect(outer.style.display).toBe('')
  expect(container.querySelector('i')).toBeNull()
  render(view('visible', true, false))
  expect(container.querySelector('em')).toBeNull()
  expect(container.querySelector('i')?.textContent).toBe('inner')
})

it('reveals only the inner fallback after initially hidden prerendering', async () => {
  const { container, render } = setup()
  const pending = new Promise<void>(() => {})
  const ref = React.createRef<HTMLElement>()
  const effects: string[] = []
  function Pending() { throw pending }
  function Fallback() {
    React.useLayoutEffect(() => { effects.push('layout') }, [])
    React.useEffect(() => { effects.push('passive') }, [])
    return <i ref={ref}>inner</i>
  }
  const view = (mode: 'hidden' | 'visible') => <React.Suspense fallback={<em>outer</em>}>
    <span>visible</span><React.Activity mode={mode}>
      <React.Suspense fallback={<Fallback />}><Pending /></React.Suspense>
    </React.Activity>
  </React.Suspense>
  render(view('hidden'))
  await new Promise(resolve => setTimeout(resolve, 30))
  expect(container.querySelector('em')).toBeNull()
  expect(ref.current).toBeNull()
  expect(effects).toEqual([])
  render(view('visible'))
  expect(container.querySelector('em')).toBeNull()
  expect(container.querySelector('i')?.textContent).toBe('inner')
  expect(ref.current).toBe(container.querySelector('i'))
  await vi.waitFor(() => expect(effects).toEqual(['layout', 'passive']))
})
