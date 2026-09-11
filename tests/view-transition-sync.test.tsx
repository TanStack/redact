import { afterEach, expect, it, vi } from 'vitest'
import { ViewTransition, startTransition, useState, useTransition } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { ReactNode } from 'react'

const native = typeof document.startViewTransition === 'function' ? document.startViewTransition.bind(document) : undefined
const transitions: ViewTransition[] = []
const cleanups: Array<() => void> = []
afterEach(async () => {
  for (const transition of transitions.splice(0)) { transition.skipTransition(); await transition.finished.catch(() => {}) }
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.restoreAllMocks()
})
function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return { container, render: (node: ReactNode) => flushSync(() => root.render(node)) }
}
function observeNative(afterStart?: () => void) {
  return vi.spyOn(document, 'startViewTransition').mockImplementation((options: any) => {
    const transition = native!(options)
    transition.ready.catch(() => {})
    transitions.push(transition)
    afterStart?.()
    return transition
  })
}
async function until(check: () => boolean) { await vi.waitFor(() => expect(check()).toBe(true), { timeout: 4000, interval: 10 }) }

it('keeps transition callbacks immediate and useTransition pending false', async () => {
  const { container, render } = setup()
  let set!: (value: number) => void, transition!: (callback: () => void) => void
  const pending: boolean[] = [], called: string[] = []
  function App() {
    const [value, update] = useState(0); set = update
    const [isPending, begin] = useTransition(); transition = begin; pending.push(isPending)
    return <ViewTransition><div>{value}</div></ViewTransition>
  }
  if (native) observeNative()
  render(<App />)
  transition(() => { called.push('hook'); set(1) })
  startTransition(() => { called.push('export'); set(2) })
  expect(called).toEqual(['hook', 'export'])
  await until(() => container.textContent === '2')
  expect(pending.every(value => value === false)).toBe(true)
})

it.runIf(!!native)('commits exactly once when flushSync interrupts before native snapshots complete', async () => {
  const { container, render } = setup()
  let set!: (value: number | ((value: number) => number)) => void
  const updated = vi.fn(), committed: number[] = []
  function App() {
    const [value, update] = useState(0); set = update
    committed.push(value)
    return <ViewTransition name="before-snapshot" onUpdate={updated}><div>{value}</div></ViewTransition>
  }
  render(<App />)
  observeNative(() => queueMicrotask(() => {
    flushSync(() => set(value => value + 1))
    expect(container.textContent).toBe('2')
  }))
  startTransition(() => set(1))
  await until(() => transitions.length === 1)
  await transitions[0]!.finished
  expect(container.textContent).toBe('2')
  expect(committed.filter(value => value === 2)).toHaveLength(1)
  expect(updated).not.toHaveBeenCalled()
})

it.runIf(!!native)('coordinates two roots in one native document transition', async () => {
  const first = setup(), second = setup()
  const setters: Array<(value: number) => void> = []
  const callbacks = [vi.fn(), vi.fn()]
  function App({ index }: { index: number }) {
    const [value, set] = useState(0); setters[index] = set
    return <ViewTransition name={`root-${index}`} onUpdate={callbacks[index]}><div>{value}</div></ViewTransition>
  }
  first.render(<App index={0} />); second.render(<App index={1} />)
  const observed = observeNative()
  startTransition(() => { setters[0]!(1); setters[1]!(1) })
  await until(() => transitions.length === 1)
  await transitions[0]!.ready
  await until(() => callbacks.every(callback => callback.mock.calls.length === 1))
  expect(first.container.textContent).toBe('1')
  expect(second.container.textContent).toBe('1')
  expect(observed).toHaveBeenCalledTimes(1)
  const pseudos = document.getAnimations().map(animation => (animation.effect as KeyframeEffect).pseudoElement)
  expect(pseudos).toContain('::view-transition-new(root-0)')
  expect(pseudos).toContain('::view-transition-new(root-1)')
})
