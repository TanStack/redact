/**
 * Regression: useSyncExternalStore must unsubscribe on unmount.
 *
 * Previously the dispatcher stashed the unsubscribe in `hook.cleanup` but
 * never registered it in `fiber.cleanups`, so `unmountFiber` never ran it.
 * The store kept a live reference to `forceUpdate`; any subsequent
 * notification called `scheduleUpdate(fiber)` on the now-unmounted fiber,
 * which walked the stale `.parent` pointer and mounted a fresh copy of the
 * subtree's DOM into the old host parent. Visible in tanstack.com as
 * extra Log-In buttons accumulating in the navbar after navigation.
 */
import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'

function setup() {
  const c = document.createElement('div')
  document.body.appendChild(c)
  return c
}

type Store<T> = {
  get: () => T
  set: (next: T) => void
  subscribe: (cb: () => void) => () => void
  subscriberCount: () => number
}

function makeStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next: T) => {
      value = next
      listeners.forEach((l) => l())
    },
    subscribe: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    subscriberCount: () => listeners.size,
  }
}

describe('useSyncExternalStore cleanup on unmount', () => {
  it('runs unsubscribe when parent stops rendering child', async () => {
    const container = setup()
    const store = makeStore(0)
    function Child() {
      const v = React.useSyncExternalStore(store.subscribe, store.get)
      return <span>{v}</span>
    }
    function App({ show }: { show: boolean }) {
      return <div>{show ? <Child /> : null}</div>
    }
    const root = createRoot(container)
    root.render(<App show={true} />)
    await Promise.resolve()
    expect(store.subscriberCount()).toBe(1)
    root.render(<App show={false} />)
    await Promise.resolve()
    expect(store.subscriberCount()).toBe(0)
  })

  it('runs unsubscribe on root.unmount', async () => {
    const container = setup()
    const store = makeStore('a')
    function Leaf() {
      const v = React.useSyncExternalStore(store.subscribe, store.get)
      return <span>{v}</span>
    }
    const root = createRoot(container)
    root.render(<Leaf />)
    await Promise.resolve()
    expect(store.subscriberCount()).toBe(1)
    root.unmount()
    expect(store.subscriberCount()).toBe(0)
  })

  it('store notifications after unmount do not resurrect DOM', async () => {
    // This is the exact shape of the tanstack.com leak: a subscribed child
    // is unmounted, then the store fires. With the bug, `scheduleUpdate`
    // was invoked on the zombie fiber; `rerenderFiber` walked its stale
    // `.parent` and re-appended the child's DOM into the old host.
    const container = setup()
    const store = makeStore(0)
    function Badge() {
      const v = React.useSyncExternalStore(store.subscribe, store.get)
      return <a aria-label="badge">{v}</a>
    }
    function App({ show }: { show: boolean }) {
      return (
        <div id="host">
          <span>keep</span>
          {show ? <Badge /> : null}
        </div>
      )
    }
    const root = createRoot(container)
    root.render(<App show={true} />)
    await Promise.resolve()

    const host = container.querySelector('#host')!
    expect(host.querySelectorAll('a[aria-label="badge"]').length).toBe(1)

    root.render(<App show={false} />)
    await Promise.resolve()
    expect(host.querySelectorAll('a[aria-label="badge"]').length).toBe(0)

    // Fire the store after unmount. With the bug, this schedules the dead
    // Badge fiber, which re-renders and inserts a new <a> into #host via
    // the stale .parent pointer. With the fix, forceUpdate was unsubscribed
    // when the fiber was unmounted, so nothing fires; the defensive
    // scheduleUpdate guard catches any remaining stray callers.
    store.set(1)
    await Promise.resolve()
    expect(host.querySelectorAll('a[aria-label="badge"]').length).toBe(0)
    expect(host.querySelector('span')!.textContent).toBe('keep')
  })

  it('still fires forceUpdate while mounted', async () => {
    const container = setup()
    const store = makeStore(10)
    function View() {
      const v = React.useSyncExternalStore(store.subscribe, store.get)
      return <span>v={v}</span>
    }
    const root = createRoot(container)
    root.render(<View />)
    await Promise.resolve()
    expect(container.querySelector('span')!.textContent).toBe('v=10')

    store.set(20)
    await Promise.resolve()
    expect(container.querySelector('span')!.textContent).toBe('v=20')
  })
})
