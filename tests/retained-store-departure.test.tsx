import { afterEach, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 30))

it('retries queued retained subscribers through the boundary after their replacement suspends', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const errors: unknown[] = []
  const root = createRoot(container, { onCaughtError: error => errors.push(error), onUncaughtError: error => errors.push(error) })
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  let current = 'home'
  let record: { name: string } | undefined = { name: 'Home' }
  let ready = false
  let release!: () => void
  const waiting = new Promise<void>(resolve => { release = () => { ready = true; resolve() } })
  const parentListeners = new Set<() => void>()
  const childListeners = new Set<() => void>()
  const subscribeParent = (callback: () => void) => { parentListeners.add(callback); return () => { parentListeners.delete(callback) } }
  const subscribeChild = (callback: () => void) => { childListeners.add(callback); return () => { childListeners.delete(callback) } }
  const getCurrent = () => current
  const getRecord = () => record
  const Home = React.memo(function Home() {
    const value = React.useSyncExternalStore(subscribeChild, getRecord)
    return <p id="home">{value!.name}</p>
  })
  function Next() { if (!ready) throw waiting; return <p id="next">Next</p> }
  function Routes() {
    const selected = React.useSyncExternalStore(subscribeParent, getCurrent)
    return <React.Suspense fallback={<i>Pending</i>}>{selected === 'home' ? <Home /> : <Next />}</React.Suspense>
  }
  flushSync(() => root.render(<Routes />))
  expect(container.textContent).toBe('Home')
  // Both subscriptions are queued before the ancestor retains its old primary.
  current = 'next'
  for (const notify of parentListeners) notify()
  record = undefined
  for (const notify of childListeners) notify()
  await tick()
  expect(errors).toEqual([])
  expect(container.textContent).toContain('Pending')
  release()
  await tick()
  await vi.waitFor(() => expect(container.querySelector('#next')?.textContent).toBe('Next'))
  expect(container.querySelector('#home')).toBeNull()
  expect(errors).toEqual([])
})
