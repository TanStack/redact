// Local clone of Steve Faulkner's render bench so we can measure redact
// source-tree changes against the same workload in real Chrome.
import { createRoot } from '@tanstack/redact/dom-client'
import '@tanstack/redact/_all'
import { jsx } from '@tanstack/redact/jsx-runtime'
import { useRef, useMemo } from '@tanstack/redact'
import { flushSync } from '@tanstack/redact/dom'

function RowCell({ index, tick }: { index: number; tick: number }) {
  const ref = useRef(0)
  ref.current += 1
  const value = useMemo(() => {
    let n = index * 17 + tick
    for (let e = 0; e < 14; e += 1) n = (n * 31 + e + tick) % 9973
    return n
  }, [index, tick])
  return jsx('div', {
    'data-bench-row': '',
    'data-value': String(value),
    children: [value, ' ', ref.current],
  })
}

function RowList({ rows, tick }: { rows: number; tick: number }) {
  return jsx('section', {
    children: Array.from({ length: rows }, (_, n) => jsx(RowCell, { index: n, tick }, n)),
  })
}

;(window as any).__runReactRenderBenchmark = async ({
  iterations = 120,
  rows = 480,
}: { iterations?: number; rows?: number } = {}) => {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;contain:layout style paint;'
  document.body.appendChild(host)
  const root = createRoot(host)
  flushSync(() => root.render(jsx(RowList, { rows, tick: 0 })))
  const start = performance.now()
  for (let n = 1; n <= iterations; n += 1) {
    flushSync(() => root.render(jsx(RowList, { rows, tick: n })))
  }
  const totalMs = performance.now() - start
  const nodes = host.querySelectorAll('[data-bench-row]').length
  root.unmount()
  host.remove()
  return { iterations, rows, totalMs, hz: (iterations / totalMs) * 1000, nodes }
}

// Render a tiny status UI so the preview panel isn't blank.
const root = createRoot(document.getElementById('root')!)
root.render(jsx('div', { children: 'redact perf bench — call window.__runReactRenderBenchmark()' }))
