import { createRoot, hydrateRoot } from '@tanstack/redact/dom-client'
import { jsx } from '@tanstack/redact/jsx-runtime'
import { useState, useLayoutEffect, useEffect } from '@tanstack/redact'
import { flushSync } from '@tanstack/redact/dom'
import { renderToString } from '@tanstack/redact/server'

function host() {
  const node = document.createElement('div')
  node.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;contain:layout style paint;'
  document.body.appendChild(node)
  return node
}

// Unlike the original state-churn workload, these call the actual setters.
;(window as any).__benchScheduledState = ({ iterations = 100, rows = 240, sparse = false, depth = 8, mixed = false } = {}) => {
  const setters: Array<(value: number) => void> = []
  function Cell({ index }: { index: number }) {
    const [value, setValue] = useState(0)
    setters[index] = setValue
    return jsx('span', { 'data-cell': index, children: value })
  }
  function Branch({ level, index }: { level: number; index: number }): any {
    return level ? jsx(Branch, { level: level - 1, index }) : jsx(Cell, { index })
  }
  const node = host()
  const root = createRoot(node)
  root.render(jsx('section', { children: Array.from({ length: rows }, (_, index) => jsx(Branch, { level: depth + (mixed ? (index % 5) * 4 : 0), index }, index)) }))
  const start = performance.now()
  for (let tick = 1; tick <= iterations; tick++) {
    flushSync(() => {
      if (sparse) setters[tick % rows]!(tick)
      else for (const setValue of setters) setValue(tick)
    })
  }
  const totalMs = performance.now() - start
  const nodes = node.querySelectorAll('[data-cell]').length
  if (nodes !== rows) throw new Error('Scheduled state lost nodes')
  for (const cell of node.querySelectorAll<HTMLElement>('[data-cell]')) {
    const index = Number(cell.dataset.cell)
    const lastTick = sparse ? iterations - ((iterations - index) % rows + rows) % rows : iterations
    if (cell.textContent !== String(Math.max(0, lastTick))) throw new Error('Scheduled state lost updates')
  }
  root.unmount()
  node.remove()
  return { totalMs, nodes }
}

;(window as any).__benchDomProps = ({ iterations = 100, rows = 200 } = {}) => {
  function Row({ index, tick }: { index: number; tick: number }) {
    return jsx('div', {
      className: tick % 2 ? 'odd active' : 'even',
      title: `row ${index}:${tick}`,
      'data-value': tick,
      'aria-hidden': tick % 2 === 0,
      style: { width: tick + 10, opacity: (tick % 10) / 10, backgroundColor: tick % 2 ? 'red' : 'blue', '--tick': tick },
      onClick: () => index + tick,
      children: tick,
    })
  }
  function App({ tick }: { tick: number }) {
    return jsx('section', { children: Array.from({ length: rows }, (_, index) => jsx(Row, { index, tick }, index)) })
  }
  const node = host()
  const root = createRoot(node)
  root.render(jsx(App, { tick: 0 }))
  const start = performance.now()
  for (let tick = 1; tick <= iterations; tick++) root.render(jsx(App, { tick }))
  const totalMs = performance.now() - start
  const nodes = node.querySelectorAll('[data-value]').length
  if (nodes !== rows || node.querySelector('[data-value]')?.getAttribute('data-value') !== String(iterations)) throw new Error('Incorrect DOM props')
  root.unmount()
  node.remove()
  return { totalMs, nodes }
}

;(window as any).__benchEffects = async ({ iterations = 100, rows = 120 } = {}) => {
  let creates = 0
  let cleanups = 0
  const effect = () => { creates++; return () => { cleanups++ } }
  function Cell({ tick }: { tick: number }) {
    useLayoutEffect(effect, [tick])
    useEffect(effect, [tick])
    return jsx('span', { children: tick })
  }
  function App({ tick }: { tick: number }) {
    return jsx('section', { children: Array.from({ length: rows }, (_, i) => jsx(Cell, { tick }, i)) })
  }
  const node = host()
  const root = createRoot(node)
  root.render(jsx(App, { tick: 0 }))
  await Promise.resolve()
  const start = performance.now()
  for (let tick = 1; tick <= iterations; tick++) {
    root.render(jsx(App, { tick }))
    await Promise.resolve()
  }
  const totalMs = performance.now() - start
  root.unmount()
  node.remove()
  if (creates !== 2 * rows * (iterations + 1) || cleanups !== creates) throw new Error('Effect order/count changed')
  return { totalMs, creates, cleanups }
}

function ServerTree({ rows, escaped = true }: { rows: number; escaped?: boolean }) {
  return jsx('section', { children: Array.from({ length: rows }, (_, i) => jsx('div', {
    className: 'row', title: escaped ? `row "${i}" & <value>` : `row ${i}`, 'data-row': i,
    style: { color: 'red', padding: i % 10 }, children: escaped ? `value ${i} < & >` : `value ${i}`,
  }, i)) })
}

;(window as any).__benchServer = ({ iterations = 100, rows = 240, escaped = true } = {}) => {
  const tree = jsx(ServerTree, { rows, escaped })
  const start = performance.now()
  let html = ''
  for (let i = 0; i < iterations; i++) html = renderToString(tree)
  const totalMs = performance.now() - start
  if (escaped && (!html.includes('&amp;') || !html.includes('&lt;'))) throw new Error('Server escaping changed')
  return { totalMs, length: html.length }
}

;(window as any).__benchHydrate = ({ iterations = 50, rows = 200 } = {}) => {
  const tree = jsx(ServerTree, { rows })
  const html = renderToString(tree)
  let totalMs = 0
  for (let i = 0; i < iterations; i++) {
    const node = host()
    node.innerHTML = html
    const original = node.firstChild
    const start = performance.now()
    const root = hydrateRoot(node, tree)
    totalMs += performance.now() - start
    if (node.firstChild !== original || node.querySelectorAll('[data-row]').length !== rows) throw new Error('Hydration did not preserve nodes')
    root.unmount()
    node.remove()
  }
  return { totalMs, nodes: rows }
}

;(window as any).__benchSelect = ({ iterations = 100, rows = 1000 } = {}) => {
  const node = host()
  const root = createRoot(node)
  const options = Array.from({ length: rows }, (_, i) => jsx('option', { value: i, children: `Option ${i}` }, i))
  const values = [0, 1].map(parity => Array.from({ length: rows / 2 }, (_, i) => i * 2 + parity))
  const render = (tick: number) => root.render(jsx('select', { multiple: true, value: values[tick % 2], children: options }))
  render(0)
  const start = performance.now()
  for (let i = 1; i <= iterations; i++) render(i)
  const totalMs = performance.now() - start
  const select = node.firstChild as HTMLSelectElement
  for (let i = 0; i < rows; i++) if (select.options[i]!.selected !== (i % 2 === iterations % 2)) throw new Error('Incorrect selected option')
  root.unmount()
  node.remove()
  return { totalMs, nodes: rows }
}

;(window as any).__benchNullRun = ({ iterations = 100, rows = 1200 } = {}) => {
  function Cell({ index, tick }: { index: number; tick: number }) {
    return index === tick % rows ? jsx('span', { children: tick }) : null
  }
  function App({ tick }: { tick: number }) {
    return jsx('section', { children: [
      ...Array.from({ length: rows }, (_, index) => jsx(Cell, { index, tick }, index)),
      jsx('b', { children: 'tail' }, 'tail'),
    ] })
  }
  const node = host()
  const root = createRoot(node)
  root.render(jsx(App, { tick: 0 }))
  const start = performance.now()
  for (let tick = 1; tick <= iterations; tick++) root.render(jsx(App, { tick }))
  const totalMs = performance.now() - start
  if (node.textContent !== `${iterations}tail`) throw new Error('Incorrect null-run DOM order')
  root.unmount()
  node.remove()
  return { totalMs, nodes: 2 }
}

;(window as any).__benchEventMount = ({ iterations = 200, rows = 200 } = {}) => {
  const node = host()
  const root = createRoot(node)
  const change = () => {}
  const tree = jsx('section', { children: Array.from({ length: rows }, (_, i) => jsx('input', {
    onChange: change, onFocus: change, onBlur: change, type: i % 2 ? 'text' : 'checkbox',
    className: 'field', 'data-index': i, defaultValue: 'value',
  }, i)) })
  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    root.render(tree)
    root.render(null)
  }
  const totalMs = performance.now() - start
  if (node.childNodes.length) throw new Error('Unmount left nodes')
  root.unmount()
  node.remove()
  return { totalMs, nodes: 0 }
}
