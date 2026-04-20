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

describe('Suspense + use()', () => {
  it('renders fallback then real content', async () => {
    const container = setup()
    let resolve: (v: string) => void
    const promise = new Promise<string>((r) => {
      resolve = r
    })
    function Inner() {
      const v = React.use(promise)
      return <span>{v}</span>
    }
    function App() {
      return (
        <React.Suspense fallback={<span>loading</span>}>
          <Inner />
        </React.Suspense>
      )
    }
    createRoot(container).render(<App />)
    expect(container.innerHTML).toBe('<span>loading</span>')
    resolve!('done')
    await flush()
    expect(container.innerHTML).toBe('<span>done</span>')
  })

  it('lazy component suspends', async () => {
    const container = setup()
    let resolveMod: (v: { default: () => any }) => void
    const LazyOne = React.lazy(
      () =>
        new Promise<{ default: () => any }>((r) => {
          resolveMod = r
        }),
    )
    function App() {
      return (
        <React.Suspense fallback={<i>load</i>}>
          <LazyOne />
        </React.Suspense>
      )
    }
    createRoot(container).render(<App />)
    expect(container.innerHTML).toBe('<i>load</i>')
    resolveMod!({ default: () => <b>ok</b> })
    await flush()
    expect(container.innerHTML).toBe('<b>ok</b>')
  })

  // Regression: a lazy-loaded component that on mount immediately updates its
  // own state via useEffect must re-render with the new state. On tanstack.com
  // this is `ParentSize`: mounts with {0,0}, measures the container in a
  // useEffect, calls setSize({real w, real h}). The chart only renders when
  // size.width > 0. If the post-effect setState re-render doesn't fire, the
  // chart never appears.
  it('lazy component whose useEffect setState triggers re-render', async () => {
    const container = setup()
    let resolveMod: (v: { default: () => any }) => void
    const promise = new Promise<{ default: () => any }>((r) => {
      resolveMod = r
    })
    const Lazy = React.lazy(() => promise)

    function Measured() {
      const [size, setSize] = React.useState({ w: 0 })
      React.useEffect(() => {
        setSize({ w: 42 })
      }, [])
      return <span>{size.w}</span>
    }

    function App() {
      return (
        <React.Suspense fallback={<i>load</i>}>
          <Lazy />
        </React.Suspense>
      )
    }
    createRoot(container).render(<App />)
    expect(container.innerHTML).toBe('<i>load</i>')
    resolveMod!({ default: Measured })
    await flush(30)
    expect(container.innerHTML).toBe('<span>42</span>')
  })

  // Regression: a lazy inside a React.memo ancestor whose props haven't
  // changed gets its post-resolution update dropped. Our flushPending used to
  // filter out dirty fibers with dirty ancestors to avoid redundant work, but
  // when the ancestor is a Memo that bails on equal props, the ancestor's
  // render never cascades to the descendant and the scheduled update is lost
  // forever. Fix: keep all dirty fibers in the flush queue (sorted by depth)
  // and let rerenderFiber's own dirty-check dedupe. Mirrors tanstack.com's
  // /stats/npm where the Suspense sits under a `React.memo(Match)` — the
  // chart's `state.suspended=false` from the resolution handler never
  // triggered a re-render, and the fallback stayed on screen forever.
  it('lazy resolution under a React.memo ancestor still re-renders', async () => {
    const container = setup()
    let resolveMod: (v: { default: () => any }) => void
    const Lazy = React.lazy(
      () =>
        new Promise<{ default: () => any }>((r) => {
          resolveMod = r
        }),
    )
    const Memoed = React.memo(function Memoed({ stable }: { stable: number }) {
      return (
        <React.Suspense fallback={<i>load</i>}>
          <Lazy />
        </React.Suspense>
      )
    })
    let bump: () => void = () => {}
    function App() {
      const [_, setN] = React.useState(0)
      bump = () => setN((n) => n + 1)
      // `stable` never changes across re-renders → Memo's shallowEqual returns
      // true and renderMemo early-exits, which was silently dropping dirty
      // descendants' pending renders.
      return <Memoed stable={1} />
    }
    createRoot(container).render(<App />)
    expect(container.innerHTML).toBe('<i>load</i>')
    // Kick a parent render so Memo encounters equal props (no-op cascade).
    bump()
    await flush()
    resolveMod!({ default: () => <b>ok</b> })
    await flush(30)
    expect(container.innerHTML).toBe('<b>ok</b>')
  })

  // Regression: same post-effect setState pattern, but the state-using
  // component is nested several levels below the lazy boundary. This mirrors
  // tanstack.com more closely — Lazy → NPMStatsChart → ParentSize.
  it('nested component inside lazy updates state via useEffect', async () => {
    const container = setup()
    let resolveMod: (v: { default: () => any }) => void
    const promise = new Promise<{ default: () => any }>((r) => {
      resolveMod = r
    })
    const Lazy = React.lazy(() => promise)

    function Inner() {
      const [w, setW] = React.useState(0)
      React.useEffect(() => {
        setW(42)
      }, [])
      return <span>{w}</span>
    }
    function Outer() {
      return (
        <div>
          <Inner />
        </div>
      )
    }
    function App() {
      return (
        <React.Suspense fallback={<i>load</i>}>
          <Lazy />
        </React.Suspense>
      )
    }
    createRoot(container).render(<App />)
    resolveMod!({ default: Outer })
    await flush(30)
    expect(container.innerHTML).toBe('<div><span>42</span></div>')
  })
})
