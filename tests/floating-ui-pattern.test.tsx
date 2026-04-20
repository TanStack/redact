/**
 * Regression: `getHostParent` returned `undefined` for descendants of a
 * Portal, because Portal fibers don't store their container on `.dom` or
 * `.stateNode` — the container lives in `fiber.pendingProps.container`.
 *
 * This broke `rerenderFiber` on any Portal descendant: once a Floating-UI /
 * Radix DropdownMenu's `computePosition(...).then(...)` called
 * `ReactDOM.flushSync(() => setData(...))`, the subsequent `rerenderFiber`
 * on the popper wrapper resolved `domParent = undefined` via `getHostParent`,
 * and the next `renderHost` crashed silently on
 * `(domParent as Element).namespaceURI` — so the popper wrapper's
 * `style.transform` never updated from its `translate(0, -200%)` "hidden
 * while measuring" default. User-visible as dropdowns/tooltips being stuck
 * off-screen after opening.
 */
import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal, flushSync } from 'react-dom'

function setup() {
  const c = document.createElement('div')
  document.body.appendChild(c)
  return c
}

function useLatestRef<T>(value: T): { current: T } {
  const ref = React.useRef<T>(value)
  React.useLayoutEffect(() => {
    ref.current = value
  })
  return ref
}

describe('Floating-UI-style useFloating pattern', () => {
  it('matches exact useFloating hook sequence and ref-callback flow', async () => {
    const container = setup()
    let thenFires = 0
    let guardPasses = 0
    let isMountedAtThen: boolean[] = []

    function useFloating() {
      const [data, setData] = React.useState({ x: 0, y: 0, isPositioned: false })
      const [middleware, setMiddleware] = React.useState<any[]>([])
      void setMiddleware
      const [_reference, _setReference] = React.useState<HTMLElement | null>(null)
      const [_floating, _setFloating] = React.useState<HTMLElement | null>(null)
      const setReference = React.useCallback(
        (node: HTMLElement | null) => {
          if (node !== referenceRef.current) {
            referenceRef.current = node
            _setReference(node)
          }
        },
        [],
      )
      const setFloating = React.useCallback(
        (node: HTMLElement | null) => {
          if (node !== floatingRef.current) {
            floatingRef.current = node
            _setFloating(node)
          }
        },
        [],
      )
      const referenceEl = _reference
      const floatingEl = _floating
      const referenceRef = React.useRef<HTMLElement | null>(null)
      const floatingRef = React.useRef<HTMLElement | null>(null)
      const dataRef = React.useRef(data)
      const whileElementsMountedRef = useLatestRef<any>(undefined)
      void whileElementsMountedRef
      const platformRef = useLatestRef<any>(undefined)
      void platformRef
      const openRef = useLatestRef<any>(undefined)
      void openRef
      const update = React.useCallback(() => {
        if (!referenceRef.current || !floatingRef.current) return
        Promise.resolve({ x: 999, y: 777 }).then((computed) => {
          thenFires++
          const fullData = { ...computed, isPositioned: openRef.current !== false }
          isMountedAtThen.push(isMountedRef.current)
          if (isMountedRef.current && dataRef.current.x !== fullData.x) {
            guardPasses++
            dataRef.current = fullData
            flushSync(() => setData(fullData))
          }
        })
      }, [])
      React.useLayoutEffect(() => {
        // openRef effect equivalent
      }, [])
      const isMountedRef = React.useRef(false)
      React.useLayoutEffect(() => {
        isMountedRef.current = true
        return () => {
          isMountedRef.current = false
        }
      }, [])
      React.useLayoutEffect(() => {
        if (referenceEl) referenceRef.current = referenceEl
        if (floatingEl) floatingRef.current = floatingEl
        if (referenceEl && floatingEl) update()
      }, [referenceEl, floatingEl, update])
      return { data, setReference, setFloating }
    }

    function App() {
      const { data, setReference, setFloating } = useFloating()
      return (
        <div>
          <button ref={setReference}>trigger</button>
          <span ref={setFloating}>
            x={data.x} y={data.y} pos={data.isPositioned ? 'yes' : 'no'}
          </span>
        </div>
      )
    }

    createRoot(container).render(<App />)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(thenFires).toBeGreaterThan(0)
    expect(isMountedAtThen.every((b) => b === true)).toBe(true)
    expect(guardPasses).toBeGreaterThan(0)
    expect(container.querySelector('span')!.textContent).toContain('x=999')
  })

  it('re-renders a Portal descendant when its own state updates (getHostParent on Portal)', async () => {
    // Tight repro: a component inside a portal that updates its own state
    // from a Promise.then (no refs, no guards) — relies solely on
    // rerenderFiber → getHostParent resolving a Portal container.
    const container = setup()
    const portalHost = document.createElement('div')
    document.body.appendChild(portalHost)

    function Badge() {
      const [n, setN] = React.useState(0)
      React.useEffect(() => {
        Promise.resolve(42).then((v) => {
          flushSync(() => setN(v))
        })
      }, [])
      return <span data-testid="badge">n={n}</span>
    }

    function App() {
      return <div>{createPortal(<Badge />, portalHost)}</div>
    }

    createRoot(container).render(<App />)
    for (let i = 0; i < 10; i++) await Promise.resolve()

    expect(portalHost.querySelector('[data-testid="badge"]')!.textContent).toBe(
      'n=42',
    )
    document.body.removeChild(portalHost)
  })

  it('exercises the pattern through a Portal (Radix.DropdownMenu.Portal shape)', async () => {
    // Same pattern but content rendered via portal
    const container = setup()
    const portalHost = document.createElement('div')
    portalHost.id = 'portal-host'
    document.body.appendChild(portalHost)
    let thenFires = 0
    let isMountedAtThen: boolean[] = []

    function PopperContent() {
      const [data, setData] = React.useState({ x: 0, y: 0 })
      const [floating, setFloating] = React.useState<HTMLElement | null>(null)
      const floatingRef = React.useRef<HTMLElement | null>(null)
      const dataRef = React.useRef(data)
      const isMountedRef = React.useRef(false)
      React.useLayoutEffect(() => {
        isMountedRef.current = true
        return () => {
          isMountedRef.current = false
        }
      }, [])
      React.useLayoutEffect(() => {
        if (!floating) return
        Promise.resolve({ x: 500, y: 600 }).then((v) => {
          thenFires++
          isMountedAtThen.push(isMountedRef.current)
          if (isMountedRef.current && dataRef.current.x !== v.x) {
            dataRef.current = v
            flushSync(() => setData(v))
          }
        })
      }, [floating])
      const setFloatingCB = React.useCallback((node: HTMLElement | null) => {
        if (node !== floatingRef.current) {
          floatingRef.current = node
          setFloating(node)
        }
      }, [])
      return (
        <div ref={setFloatingCB} data-testid="popper">
          x={data.x},y={data.y}
        </div>
      )
    }

    function App() {
      return (
        <div>
          <span>trigger</span>
          {createPortal(<PopperContent />, portalHost)}
        </div>
      )
    }

    createRoot(container).render(<App />)
    for (let i = 0; i < 10; i++) await Promise.resolve()

    expect(thenFires).toBeGreaterThan(0)
    expect(isMountedAtThen.every((b) => b === true)).toBe(true)
    expect(portalHost.querySelector('[data-testid="popper"]')!.textContent).toBe(
      'x=500,y=600',
    )

    document.body.removeChild(portalHost)
  })
})
