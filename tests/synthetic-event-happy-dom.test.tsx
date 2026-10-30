// @vitest-environment happy-dom
/**
 * happy-dom defines Event fields such as `type`, `target` and `currentTarget`
 * as non-enumerable class accessors. Synthetic events must still expose them,
 * or controlled inputs never see `e.target.value` in happy-dom test suites.
 */
import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

function setup() {
  const c = document.createElement('div')
  document.body.appendChild(c)
  return c
}

describe('synthetic events in happy-dom', () => {
  it('keeps the base Event fields happy-dom does not enumerate', () => {
    expect(Object.keys(Event.prototype)).not.toContain('target')
    const container = setup()
    let captured: any = null
    function App() {
      const [v, setV] = React.useState('')
      return (
        <input
          value={v}
          onChange={(e: any) => {
            captured = e
            setV(e.target.value)
          }}
        />
      )
    }
    flushSync(() => createRoot(container).render(<App />))
    const input = container.querySelector('input')!
    flushSync(() => {
      input.value = 'a'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(captured.type).toBe('input')
    expect(captured.target).toBe(input)
    expect(captured.bubbles).toBe(true)
    expect(captured.composedPath()[0]).toBe(input)
    expect(input.value).toBe('a')
  })

  it('reads subclass fields and currentTarget on a bubbled click', () => {
    const container = setup()
    let captured: any = null
    let currentTarget: unknown = null
    function App() {
      return (
        <div
          onClick={(e: any) => {
            captured = e
            currentTarget = e.currentTarget
          }}
        >
          <button>go</button>
        </div>
      )
    }
    flushSync(() => createRoot(container).render(<App />))
    const button = container.querySelector('button')!
    flushSync(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))
    })
    expect(captured.type).toBe('click')
    expect(captured.target).toBe(button)
    expect(currentTarget).toBe(container.firstChild)
    expect(captured.shiftKey).toBe(true)
  })
})
