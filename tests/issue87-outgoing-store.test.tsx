import { expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

it.each([false, true])('keeps the outgoing page on its snapshot while replacement suspends, transition=%s', async transition => {
  const container = document.body.appendChild(document.createElement('div'))
  const errors: unknown[] = []
  const root = createRoot(container, { onCaughtError: e => errors.push(e), onUncaughtError: e => errors.push(e) })
  let page = 'a'
  const listeners = new Set<() => void>()
  const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
  const snapshot = () => page
  const seen: string[] = []
  let resolve!: (value: { default: () => React.ReactNode }) => void
  const waiting = new Promise<{ default: () => React.ReactNode }>(r => { resolve = r })
  const Next = React.lazy(() => waiting)
  function Outgoing() {
    const value = React.useSyncExternalStore(subscribe, snapshot, snapshot)
    seen.push(value)
    if (value !== 'a') throw new Error('outgoing snapshot changed')
    return <p>page a</p>
  }
  function App() {
    const value = React.useSyncExternalStore(subscribe, snapshot, snapshot)
    return <React.Suspense fallback={<i>loading</i>}>{value === 'a' ? <Outgoing /> : <Next />}</React.Suspense>
  }
  try {
    flushSync(() => root.render(<App />))
    await new Promise(r => setTimeout(r, 15))
    const update = () => { page = 'b'; for (const notify of listeners) notify() }
    if (transition) React.startTransition(update)
    else update()
    await new Promise(r => setTimeout(r, 30))
    expect(errors).toEqual([])
    expect(seen.every(value => value === 'a')).toBe(true)
    resolve({ default: () => <p>page b</p> })
    await vi.waitFor(() => expect(container.textContent).toBe('page b'), { timeout: 1500 })
    expect(errors).toEqual([])
  } finally {
    flushSync(() => root.unmount())
    container.remove()
  }
})
