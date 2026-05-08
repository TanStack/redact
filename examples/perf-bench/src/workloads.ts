// Additional render workloads beyond the canonical RowList × RowCell bench.
// Each is exposed as `window.__bench<Name>` returning {totalMs, ...} so the
// playwright driver can hit it via `page.evaluate(...)`.
//
// All workloads share the same shape:
//   - mount once
//   - run `iterations` flushSync renders
//   - tear down
//   - return totalMs / nodes / etc
//
// The point isn't to crown a winner on every workload — it's to make sure
// fixes targeted at the canonical bench haven't regressed adjacent patterns
// that exercise different parts of the reconciler.
import { createRoot } from '@tanstack/redact/dom-client'
import { jsx } from '@tanstack/redact/jsx-runtime'
import { useRef, useMemo, useState } from '@tanstack/redact'
import { flushSync } from '@tanstack/redact/dom'

// Helper: mount, run N renders, tear down, time the loop.
function timed<P>(
  Component: (p: P) => unknown,
  initialProps: P,
  nextProps: (i: number) => P,
  iterations: number,
) {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;contain:layout style paint;'
  document.body.appendChild(host)
  const root = createRoot(host)
  flushSync(() => root.render(jsx(Component as any, initialProps as any)))
  const start = performance.now()
  for (let i = 1; i <= iterations; i += 1) {
    flushSync(() => root.render(jsx(Component as any, nextProps(i) as any)))
  }
  const totalMs = performance.now() - start
  const nodes = host.querySelectorAll('*').length
  root.unmount()
  host.remove()
  return { iterations, totalMs, nodes }
}

// ---------------------------------------------------------------------------
// 1. KEYED REORDER — forces the slow path's keyed-Map branch.
//    Same item set every iteration, but shuffled. Each item has a stable key.
// ---------------------------------------------------------------------------
function shuffle(seed: number, n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i)
  let s = seed
  for (let i = n - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

function KeyedItem({ id }: { id: number }) {
  return jsx('div', { 'data-key': id, children: id })
}

function KeyedList({ order }: { order: number[] }) {
  return jsx('section', {
    children: order.map((id) => jsx(KeyedItem, { id }, id)),
  })
}

;(window as any).__benchKeyedReorder = ({ iterations = 100, rows = 240 } = {}) =>
  timed(
    KeyedList,
    { order: shuffle(0, rows) },
    (i) => ({ order: shuffle(i, rows) }),
    iterations,
  )

// ---------------------------------------------------------------------------
// 2. MOUNT/UNMOUNT — alternates between empty and full lists. Tests the
//    create/remove path (no fast-path help — every render diverges).
// ---------------------------------------------------------------------------
function MountUnmount({ show, count }: { show: boolean; count: number }) {
  return jsx('section', {
    children: show
      ? Array.from({ length: count }, (_, n) =>
          jsx('div', { 'data-row': n, children: n }, n),
        )
      : null,
  })
}

;(window as any).__benchMountUnmount = ({ iterations = 100, rows = 200 } = {}) =>
  timed(
    MountUnmount,
    { show: true, count: rows },
    (i) => ({ show: i % 2 === 0, count: rows }),
    iterations,
  )

// ---------------------------------------------------------------------------
// 3. DEEP TREE — many levels of Function fibers, one host leaf. Exercises
//    the renderFunction / hooks dispatcher dispatch on every render.
// ---------------------------------------------------------------------------
function Depth({ remaining, tick }: { remaining: number; tick: number }): any {
  if (remaining === 0) {
    return jsx('div', { 'data-leaf': '', children: tick })
  }
  return jsx(Depth, { remaining: remaining - 1, tick })
}

;(window as any).__benchDeepTree = ({ iterations = 100, depth = 60 } = {}) =>
  timed(
    Depth,
    { remaining: depth, tick: 0 },
    (i) => ({ remaining: depth, tick: i }),
    iterations,
  )

// ---------------------------------------------------------------------------
// 4. STATE CHURN — many siblings each holding their own useState; each
//    render flips ALL of them. Measures hook dispatch + setState path
//    (though we drive via top-level rerender so setState isn't fired).
//    Real use of useState would re-enter scheduler; we simulate the cost
//    by re-rendering parent with new tick that propagates as a prop.
// ---------------------------------------------------------------------------
function StateCell({ tick }: { tick: number }) {
  const [x] = useState(0)
  const ref = useRef(0)
  ref.current += 1
  const v = useMemo(() => x + tick, [x, tick])
  return jsx('span', { children: [v, ' ', ref.current] })
}

function StateRow({ rows, tick }: { rows: number; tick: number }) {
  return jsx('section', {
    children: Array.from({ length: rows }, (_, n) => jsx(StateCell, { tick }, n)),
  })
}

;(window as any).__benchStateChurn = ({ iterations = 100, rows = 240 } = {}) =>
  timed(StateRow, { rows, tick: 0 }, (i) => ({ rows, tick: i }), iterations)
