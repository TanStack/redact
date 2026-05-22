import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'

function setup() {
  const c = document.createElement('div')
  document.body.appendChild(c)
  return c
}

async function flush(n = 10) {
  for (let i = 0; i < n; i++) await Promise.resolve()
}

// Mirrors the TanStack Router navigation scenario in tanstack.com:
// - A scrollable container is rendered as part of route A's committed tree.
// - The user scrolls the container.
// - The user navigates to route B, which suspends while loading.
// - The route swap should preserve route A's DOM (incl. scroll state) until
//   the new route is ready (React's Suspense semantics: hide-not-unmount when
//   re-suspending an already-committed boundary).
// Redact today calls unmountAllChildren on suspend, destroying the scrollable's
// DOM node and its scrollTop. After resolve, fresh DOM is mounted at scrollTop=0.
describe('Suspense preserves committed DOM across a re-suspension', () => {
  it('keeps the same scrollable DOM node when Suspense suspends after initial commit', async () => {
    const container = setup()

    // Phase 1: resolved promise so children commit immediately.
    let pending: { promise: Promise<void>; resolve: () => void } | null = null
    let throwNext = false

    function Maybe() {
      if (throwNext) {
        if (!pending) {
          let resolve!: () => void
          const promise = new Promise<void>((r) => (resolve = r))
          pending = { promise, resolve }
        }
        throw pending.promise
      }
      return <span data-testid="maybe">ready</span>
    }

    function App() {
      return (
        <React.Suspense fallback={<i data-testid="fallback">loading</i>}>
          <div
            data-testid="scrollable"
            style={{ overflow: 'auto', height: '50px' }}
          >
            <div style={{ height: '1000px' }}>tall content</div>
          </div>
          <Maybe />
        </React.Suspense>
      )
    }

    const root = createRoot(container)
    root.render(<App />)
    await flush()

    const firstScrollable = container.querySelector(
      '[data-testid="scrollable"]',
    ) as HTMLElement
    expect(firstScrollable).toBeTruthy()
    expect(container.querySelector('[data-testid="maybe"]')).toBeTruthy()

    // Simulate a user scroll.
    firstScrollable.scrollTop = 800
    expect(firstScrollable.scrollTop).toBe(800)

    // Phase 2: trigger a re-render where Maybe now suspends.
    throwNext = true
    root.render(<App />)
    await flush()

    // React's behavior: scrollable stays in DOM (possibly hidden), scrollTop preserved.
    const duringSuspendScrollable = container.querySelector(
      '[data-testid="scrollable"]',
    ) as HTMLElement | null

    expect(
      duringSuspendScrollable,
      'scrollable should remain in the DOM while Suspense waits',
    ).toBe(firstScrollable)

    // Phase 3: resolve the suspended work.
    throwNext = false
    pending!.resolve()
    await flush(30)

    const afterResolveScrollable = container.querySelector(
      '[data-testid="scrollable"]',
    ) as HTMLElement
    expect(afterResolveScrollable).toBe(firstScrollable)
    expect(afterResolveScrollable.scrollTop).toBe(800)
    expect(container.querySelector('[data-testid="maybe"]')).toBeTruthy()
  })

  // The TanStack Router navigation case: route swap re-renders the boundary
  // with a *new* child component (different type) that suspends. The committed
  // sibling subtree — the docs sidebar — must survive the suspension cycle so
  // its scrollTop is intact when the new route content commits.
  it('preserves a sibling scrollable when the swapped-in child suspends', async () => {
    const container = setup()

    let lazyResolve: (mod: { default: () => any }) => void
    const Lazy = React.lazy(
      () =>
        new Promise<{ default: () => any }>((r) => {
          lazyResolve = r
        }),
    )

    function RouteA() {
      return <span data-testid="route-a">route A</span>
    }

    function App({ route }: { route: 'A' | 'B' }) {
      return (
        <React.Suspense fallback={<i data-testid="fallback">loading</i>}>
          <div
            data-testid="scrollable"
            style={{ overflow: 'auto', height: '50px' }}
          >
            <div style={{ height: '1000px' }}>sidebar</div>
          </div>
          {route === 'A' ? <RouteA /> : <Lazy />}
        </React.Suspense>
      )
    }

    const root = createRoot(container)
    root.render(<App route="A" />)
    await flush()

    const scrollable = container.querySelector(
      '[data-testid="scrollable"]',
    ) as HTMLElement
    scrollable.scrollTop = 800
    expect(container.querySelector('[data-testid="route-a"]')).toBeTruthy()

    // "Navigate" — child component type swaps to a lazy import that suspends.
    root.render(<App route="B" />)
    await flush()

    expect(container.querySelector('[data-testid="fallback"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="scrollable"]')).toBe(
      scrollable,
    )
    expect(scrollable.scrollTop).toBe(800)

    // Resolve the lazy import.
    lazyResolve!({ default: () => <b data-testid="route-b">route B</b> })
    await flush(30)

    expect(container.querySelector('[data-testid="fallback"]')).toBeNull()
    expect(container.querySelector('[data-testid="route-b"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="scrollable"]')).toBe(
      scrollable,
    )
    expect(scrollable.scrollTop).toBe(800)
  })

  // Re-suspension after a successful render — focus survives.
  it('preserves focus on an input across a sibling suspension', async () => {
    const container = setup()

    let pending: { promise: Promise<void>; resolve: () => void } | null = null
    let throwNext = false

    function Maybe() {
      if (throwNext) {
        if (!pending) {
          let resolve!: () => void
          const promise = new Promise<void>((r) => (resolve = r))
          pending = { promise, resolve }
        }
        throw pending.promise
      }
      return <span data-testid="maybe">ready</span>
    }

    function App() {
      return (
        <React.Suspense fallback={<i>loading</i>}>
          <input data-testid="focusable" />
          <Maybe />
        </React.Suspense>
      )
    }

    const root = createRoot(container)
    root.render(<App />)
    await flush()

    const input = container.querySelector(
      '[data-testid="focusable"]',
    ) as HTMLInputElement
    input.focus()
    expect(document.activeElement).toBe(input)

    throwNext = true
    root.render(<App />)
    await flush()

    expect(container.querySelector('[data-testid="focusable"]')).toBe(input)
    // The input survived; focus survives with it (it's just hidden via display:none).
    expect(document.activeElement).toBe(input)

    throwNext = false
    pending!.resolve()
    await flush(30)

    expect(container.querySelector('[data-testid="focusable"]')).toBe(input)
  })
})
