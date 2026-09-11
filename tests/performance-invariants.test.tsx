import { expect, it } from 'vitest'
import * as React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { createPortal, flushSync } from 'react-dom'
import { renderToString } from 'react-dom/server'
import { escapeAttr, escapeText } from '../packages/redact/src/server/escape'

it('preserves keyed state and DOM identity through stable updates and structural changes', () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  let serial = 0
  type Row = { id: number; visible: boolean; tag: string }
  let observedStates = new Map<number, number>()
  let previousStates = new Map<number, number>()
  function Item({ row, tick }: { row: Row; tick: number; key?: number }) {
    const [state] = React.useState(() => ++serial)
    observedStates.set(row.id, state)
    return row.visible ? React.createElement(row.tag, { 'data-key': row.id, 'data-state': state }, tick) : null
  }
  let rows: Row[] = Array.from({ length: 20 }, (_, id) => ({ id, visible: true, tag: 'span' }))
  let previous = new Map<number, { node: Element; state: string | null; tag: string }>()
  let nextId = 20
  let seed = 19
  for (let tick = 0; tick < 80; tick++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const index = seed % rows.length
    switch (tick % 6) {
      case 0: break // Same keys and types exercise the fast path.
      case 1: rows = [...rows.slice(1), rows[0]!]; break
      case 2: rows[index] = { ...rows[index]!, visible: !rows[index]!.visible }; break
      case 3: rows[index] = { ...rows[index]!, tag: rows[index]!.tag === 'span' ? 'i' : 'span' }; break
      case 4: rows.splice(index, 1); break
      case 5: rows.splice(index, 0, { id: nextId++, visible: true, tag: 'span' }); break
    }
    observedStates = new Map()
    root.render(<>{rows.map(row => <Item key={row.id} row={row} tick={tick} />)}</>)
    for (const row of rows) {
      if (previousStates.has(row.id)) expect(observedStates.get(row.id)).toBe(previousStates.get(row.id))
    }
    previousStates = observedStates
    const visible = rows.filter(row => row.visible)
    const nodes = [...container.children]
    expect(nodes.map(node => Number(node.getAttribute('data-key')))).toEqual(visible.map(row => row.id))
    const next = new Map<number, { node: Element; state: string | null; tag: string }>()
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!
      const row = visible[i]!
      const old = previous.get(row.id)
      if (old) {
        expect(node.getAttribute('data-state')).toBe(old.state)
        if (old.tag === row.tag) expect(node).toBe(old.node)
      }
      expect(node.textContent).toBe(String(tick))
      next.set(row.id, { node, state: node.getAttribute('data-state'), tag: row.tag })
    }
    previous = next
  }
  root.unmount()
})

it('keeps repeated mixed-depth updates shallow-first and bound to the owning root', () => {
  const container = document.createElement('div')
  const portal = document.createElement('div')
  const other = document.createElement('div')
  const root = createRoot(container)
  const otherRoot = createRoot(other)
  const setters = new Map<string, (value: number) => void>()
  const log: string[] = []
  function Branch({ depth, name }: { depth: number; name: string }): React.ReactNode {
    if (depth) return <Branch depth={depth - 1} name={name} />
    return <Leaf name={name} />
  }
  function Leaf({ name }: { name: string }) {
    const [value, set] = React.useState(0)
    setters.set(name, set)
    log.push(name)
    return <span>{name}:{value}</span>
  }
  root.render(<><Branch depth={12} name="deep" /><Branch depth={2} name="shallow" />{createPortal(<Branch depth={6} name="portal" />, portal)}</>)
  otherRoot.render(<Branch depth={8} name="other" />)
  for (let tick = 1; tick <= 5; tick++) {
    log.length = 0
    flushSync(() => {
      for (const name of ['deep', 'portal', 'shallow', 'other']) setters.get(name)!(tick)
    })
    expect(log).toEqual(['shallow', 'portal', 'deep', 'other'])
    expect(container.textContent).toBe(`deep:${tick}shallow:${tick}`)
    expect(portal.textContent).toBe(`portal:${tick}`)
    expect(other.textContent).toBe(`other:${tick}`)
  }
  root.unmount()
  otherRoot.unmount()
  flushSync(() => setters.get('deep')!(99))
  expect(container.childNodes.length).toBe(0)
})

it.each([8, 1000])('preserves controlled and hydrated multiple-select behavior for %i options', count => {
  const container = document.createElement('div')
  const options = Array.from({ length: count }, (_, i) => <option key={i} value={i}>{i}</option>)
  const tree = (value: Array<string | number>) => <select multiple value={value}>{options}</select>
  container.innerHTML = renderToString(tree([0, '0', count - 1]))
  const original = container.firstChild
  const root = hydrateRoot(container, tree([0, '0', count - 1]))
  const selected = () => [...container.querySelectorAll('option')].filter(o => o.selected).map(o => o.value)
  expect(container.firstChild).toBe(original)
  expect(selected()).toEqual(['0', String(count - 1)])
  root.render(tree([1, 3]))
  container.querySelectorAll('option')[2]!.selected = true
  root.render(tree([1, 3]))
  expect(selected()).toEqual(['1', '3'])
  root.render(tree([]))
  expect(selected()).toEqual([])
  root.unmount()
})

it('keeps SSR escaping byte-identical for clean strings, special characters, and UTF-16', () => {
  const replacements: Record<string, string> = { '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }
  let seed = 123
  for (let i = 0; i < 1000; i++) {
    let value = i % 2 ? 'plain text' : '&"<>'
    for (let j = 0; j < 12; j++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      value += String.fromCharCode(seed % 65536)
    }
    expect(escapeAttr(value)).toBe(value.replace(/[&"<>]/g, c => replacements[c]!))
    expect(escapeText(value)).toBe(value.replace(/[&<>]/g, c => replacements[c]!))
  }
})
