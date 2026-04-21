/**
 * Event handlers receive an event that exposes `.nativeEvent`.
 *
 * React wraps events in a SyntheticEvent whose `.nativeEvent` property
 * points to the raw underlying Event. Many libraries rely on this shape:
 *
 *   - react-instantsearch's SearchBox reads `event.nativeEvent.isComposing`
 *     to decide whether to call refine() — without the alias it throws a
 *     TypeError inside the onChange handler, the call is swallowed, and
 *     no search ever runs.
 *   - Several UI kits (DnD libraries, floating-ui integrations) read
 *     `event.nativeEvent.shiftKey` / `.metaKey` for keyboard modifier
 *     routing.
 *
 * The shim doesn't build a full SyntheticEvent layer — it hands handlers
 * the raw DOM Event, but aliases `e.nativeEvent = e` so these access
 * patterns don't throw. This test locks that contract down.
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

describe('event handlers — SyntheticEvent shape', () => {
  it('onChange event exposes .nativeEvent', () => {
    const container = setup()
    let captured: any = null
    function App() {
      const [v, setV] = React.useState('')
      return (
        <input
          id="i"
          value={v}
          onChange={(e: any) => {
            captured = e
            setV(e.target.value)
          }}
        />
      )
    }
    createRoot(container).render(<App />)
    const input = container.querySelector('#i') as HTMLInputElement
    flushSync(() => {
      input.value = 'a'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(captured).not.toBeNull()
    expect(captured.nativeEvent).toBeDefined()
    // `event.nativeEvent.isComposing` must not throw (react-instantsearch
    // relies on this); the value may be false on a synthetic dispatch.
    expect(() => captured.nativeEvent.isComposing).not.toThrow()
  })

  it('onClick event exposes .nativeEvent', () => {
    const container = setup()
    let captured: any = null
    function App() {
      return <button onClick={(e: any) => (captured = e)}>go</button>
    }
    createRoot(container).render(<App />)
    const btn = container.querySelector('button') as HTMLButtonElement
    flushSync(() => btn.click())
    expect(captured).not.toBeNull()
    expect(captured.nativeEvent).toBeDefined()
    expect(() => captured.nativeEvent.shiftKey).not.toThrow()
  })

  it('onKeyDown event exposes .nativeEvent', () => {
    const container = setup()
    let captured: any = null
    function App() {
      return <input id="k" onKeyDown={(e: any) => (captured = e)} />
    }
    createRoot(container).render(<App />)
    const input = container.querySelector('#k') as HTMLInputElement
    flushSync(() =>
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
      ),
    )
    expect(captured).not.toBeNull()
    expect(captured.nativeEvent).toBeDefined()
    expect(captured.nativeEvent.metaKey).toBe(true)
  })
})
