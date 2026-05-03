/**
 * Regression: createRoot must clear pre-existing children of the container on
 * the initial commit (matching real React's `clearContainer` semantics), but
 * must NOT re-clear on subsequent renders (which would tear down the React
 * tree just rendered).
 *
 * Without the first-render clear, an app that ships a `<div id="root"><div
 * id="splash">…</div></div>` placeholder will stack the splash markup behind
 * the React tree until React happens to overdraw the same coordinates —
 * commonly observed as a splash logo persisting after mount.
 *
 * Without the firstRender gate, every re-render would wipe the reconciled DOM
 * leaving fibers pointing at detached nodes; subsequent renders would update
 * detached DOM and the screen would go blank.
 */
import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'

function setup() {
  const c = document.createElement('div')
  document.body.appendChild(c)
  return c
}

describe('createRoot container clearing', () => {
  it('clears pre-existing children on the first render', () => {
    const container = setup()
    container.innerHTML = '<span>kept?</span>'
    expect(container.querySelector('span')?.textContent).toBe('kept?')

    const root = createRoot(container)
    root.render(<div id="app">react</div>)

    expect(container.querySelector('span')).toBeNull()
    expect(container.innerHTML).toBe('<div id="app">react</div>')
  })

  it('does not re-clear on subsequent renders (preserves reconciled DOM)', () => {
    const container = setup()
    const root = createRoot(container)
    root.render(<div id="first">first</div>)

    const firstDiv = container.querySelector('#first') as HTMLDivElement
    expect(firstDiv).toBeInstanceOf(HTMLDivElement)
    expect(firstDiv.textContent).toBe('first')

    root.render(<div id="first">updated</div>)

    // The same DOM node was reused (reconciler updated text in place); a
    // second clearContainer would have detached it and rendered nothing.
    expect(container.querySelector('#first')).toBe(firstDiv)
    expect(firstDiv.textContent).toBe('updated')
    expect(container.innerHTML).toBe('<div id="first">updated</div>')
  })
})
