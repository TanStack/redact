/**
 * Regressions around memo + state-triggered rerenders and zombie rerenders.
 *
 * 1. `React.memo`-wrapped components must re-render when their own hook state
 *    changes, even if their props are unchanged. Previously `renderMemo` ran
 *    the prop-equality gate on all rerenders — so a `useSyncExternalStore`
 *    notification on a memo component (e.g., TanStack Router's `Outlet`,
 *    `Match`, `MatchInner`) bailed, and route content never updated after
 *    navigation even though the URL had changed.
 *
 * 2. `rerenderFiber` must skip fibers that were unmounted between scheduling
 *    and flush. When a shallow-first flush unmounts a deeper pending fiber,
 *    the deeper fiber's slot in `root.pending` still points at it; running
 *    its render after unmount mounts fresh DOM into the old (still-attached)
 *    parent. Visible as previous-route content lingering after nav because
 *    the old LibraryLandingPage rerendered into its stale parent.
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
}

function makeStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next) => {
      value = next
      listeners.forEach((l) => l())
    },
    subscribe: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}

describe('React.memo + state-triggered rerender', () => {
  it('re-renders a memo component when its useSyncExternalStore fires, even with unchanged props', async () => {
    const container = setup()
    const store = makeStore(0)
    let impl = 0
    const Inner = React.memo(function Inner() {
      impl++
      const v = React.useSyncExternalStore(store.subscribe, store.get)
      return <span>v={v}</span>
    })
    function App() {
      return <Inner />
    }
    const root = createRoot(container)
    root.render(<App />)
    await Promise.resolve()
    expect(container.querySelector('span')!.textContent).toBe('v=0')
    const initialCalls = impl

    store.set(42)
    await Promise.resolve()
    expect(container.querySelector('span')!.textContent).toBe('v=42')
    expect(impl).toBeGreaterThan(initialCalls)
  })

  it('still bails when a parent re-renders with shallow-equal props (no state change)', async () => {
    const container = setup()
    let childImpl = 0
    const Child = React.memo(function Child({ n }: { n: number }) {
      childImpl++
      return <span>n={n}</span>
    })
    function Parent({ version }: { version: number }) {
      // Parent re-renders on `version` change but always passes n={1} to child.
      return (
        <div>
          <i>v={version}</i>
          <Child n={1} />
        </div>
      )
    }
    const root = createRoot(container)
    root.render(<Parent version={1} />)
    await Promise.resolve()
    expect(childImpl).toBe(1)
    root.render(<Parent version={2} />)
    await Promise.resolve()
    // Child props unchanged — memo bails (this is the normal path; the
    // state-triggered bypass must not affect parent-triggered renders).
    expect(childImpl).toBe(1)
  })

  it('nested memo: child state rerender does not bypass grandchild memo', async () => {
    const container = setup()
    const store = makeStore('a')
    let grandImpl = 0
    const Grand = React.memo(function Grand({ label }: { label: string }) {
      grandImpl++
      return <span>{label}</span>
    })
    const Child = React.memo(function Child() {
      const v = React.useSyncExternalStore(store.subscribe, store.get)
      // Pass a stable label to Grand so it can bail.
      void v
      return <Grand label="stable" />
    })
    function App() {
      return <Child />
    }
    createRoot(container).render(<App />)
    await Promise.resolve()
    expect(grandImpl).toBe(1)

    store.set('b')
    await Promise.resolve()
    // Child re-runs (state change), but Grand's label didn't change — memo bails.
    expect(grandImpl).toBe(1)
  })
})

describe('rerenderFiber skips unmounted fibers', () => {
  it('does not mount DOM when a pending fiber was unmounted between scheduling and flush', async () => {
    // Simulate the route-nav shape: a parent that re-renders and replaces its
    // child subtree. The OLD child's store fires between its unmount and the
    // pending flush — previously the flush ran the zombie fiber, mounting a
    // duplicate DOM node into the (still-attached) old parent.
    const container = setup()
    const store = makeStore(0)
    let leafMounts = 0
    let leafUnmounts = 0

    function Leaf() {
      // Each store tick triggers a rerender of this fiber (from useSyncExternalStore).
      const v = React.useSyncExternalStore(store.subscribe, store.get)
      React.useEffect(() => {
        leafMounts++
        return () => {
          leafUnmounts++
        }
      }, [])
      return <a data-testid="leaf">{v}</a>
    }

    function App({ show }: { show: boolean }) {
      return <div data-testid="host">{show ? <Leaf /> : <b>other</b>}</div>
    }

    const root = createRoot(container)
    root.render(<App show={true} />)
    await Promise.resolve()
    expect(container.querySelectorAll('a[data-testid="leaf"]').length).toBe(1)
    expect(leafMounts).toBe(1)

    // Swap Leaf out, then fire the store. Without the rerenderFiber zombie
    // guard, the pending Leaf would rerender and re-append an <a> into #host.
    root.render(<App show={false} />)
    await Promise.resolve()
    expect(leafUnmounts).toBe(1)
    expect(container.querySelectorAll('a[data-testid="leaf"]').length).toBe(0)

    // Simulate the race: queue an update on the leaf fiber via store, then
    // verify no zombie DOM appears. (Fiber is already unmounted so the
    // scheduleUpdate guard drops it; this test mostly guards that the
    // behavior holds end-to-end without requiring the inner flag to be set.)
    store.set(1)
    await Promise.resolve()
    expect(container.querySelectorAll('a[data-testid="leaf"]').length).toBe(0)
    // The <b>other</b> host must still be the single child.
    const host = container.querySelector('[data-testid="host"]')!
    expect(host.childElementCount).toBe(1)
    expect(host.firstElementChild!.tagName).toBe('B')
  })
})
