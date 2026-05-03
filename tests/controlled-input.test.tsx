/**
 * Controlled-input behavior — parity with React.
 *
 * React's `onChange` on text-like <input>/<textarea> fires on every
 * keystroke (i.e. is wired to the native `input` event, not `change`).
 * The native `change` event only fires on blur/enter, which makes
 * controlled inputs in DocSearch-style search modals appear dead: the
 * user types, nothing re-renders, no results show up.
 *
 * These tests lock that contract down so we don't regress it again.
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

function dispatchInput(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
}

describe('controlled inputs — onChange semantics', () => {
  it('onChange on text input fires on each keystroke (native input event)', () => {
    const container = setup()
    const changes: Array<string> = []
    function App() {
      const [v, setV] = React.useState('')
      return (
        <input
          id="search"
          value={v}
          onChange={(e: any) => {
            changes.push((e.target as HTMLInputElement).value)
            setV((e.target as HTMLInputElement).value)
          }}
        />
      )
    }
    createRoot(container).render(<App />)
    const input = container.querySelector('#search') as HTMLInputElement

    flushSync(() => dispatchInput(input, 'h'))
    flushSync(() => dispatchInput(input, 'he'))
    flushSync(() => dispatchInput(input, 'hel'))

    expect(changes).toEqual(['h', 'he', 'hel'])
    expect(input.value).toBe('hel')
  })

  it('onChange on textarea fires on each keystroke', () => {
    const container = setup()
    const changes: Array<string> = []
    function App() {
      const [v, setV] = React.useState('')
      return (
        <textarea
          id="ta"
          value={v}
          onChange={(e: any) => {
            changes.push((e.target as HTMLTextAreaElement).value)
            setV((e.target as HTMLTextAreaElement).value)
          }}
        />
      )
    }
    createRoot(container).render(<App />)
    const ta = container.querySelector('#ta') as HTMLTextAreaElement

    flushSync(() => dispatchInput(ta, 'a'))
    flushSync(() => dispatchInput(ta, 'ab'))

    expect(changes).toEqual(['a', 'ab'])
  })

  it('onInput on text input still fires on input event', () => {
    const container = setup()
    const inputs: Array<string> = []
    function App() {
      return (
        <input
          id="search"
          defaultValue=""
          onInput={(e: any) => {
            inputs.push((e.target as HTMLInputElement).value)
          }}
        />
      )
    }
    createRoot(container).render(<App />)
    const input = container.querySelector('#search') as HTMLInputElement

    dispatchInput(input, 'x')
    dispatchInput(input, 'xy')

    expect(inputs).toEqual(['x', 'xy'])
  })

  it('onChange AND onInput can coexist on the same text input', () => {
    const container = setup()
    const changes: Array<string> = []
    const inputs: Array<string> = []
    function App() {
      return (
        <input
          id="both"
          defaultValue=""
          onChange={(e: any) => changes.push((e.target as HTMLInputElement).value)}
          onInput={(e: any) => inputs.push((e.target as HTMLInputElement).value)}
        />
      )
    }
    createRoot(container).render(<App />)
    const input = container.querySelector('#both') as HTMLInputElement

    dispatchInput(input, 'z')

    expect(changes).toEqual(['z'])
    expect(inputs).toEqual(['z'])
  })

  it('onChange on checkbox fires on native change event (click)', () => {
    const container = setup()
    let fires = 0
    function App() {
      const [checked, setChecked] = React.useState(false)
      return (
        <input
          id="cb"
          type="checkbox"
          checked={checked}
          onChange={(e: any) => {
            fires++
            setChecked((e.target as HTMLInputElement).checked)
          }}
        />
      )
    }
    createRoot(container).render(<App />)
    const cb = container.querySelector('#cb') as HTMLInputElement

    flushSync(() => cb.click())
    expect(fires).toBe(1)
    expect(cb.checked).toBe(true)
  })

  it('onChange on radio fires on native change event (click)', () => {
    const container = setup()
    let fires = 0
    function App() {
      const [v, setV] = React.useState('a')
      return (
        <>
          <input
            id="ra"
            type="radio"
            name="g"
            checked={v === 'a'}
            onChange={() => {
              fires++
              setV('a')
            }}
          />
          <input
            id="rb"
            type="radio"
            name="g"
            checked={v === 'b'}
            onChange={() => {
              fires++
              setV('b')
            }}
          />
        </>
      )
    }
    createRoot(container).render(<App />)
    const rb = container.querySelector('#rb') as HTMLInputElement
    flushSync(() => rb.click())
    expect(fires).toBe(1)
    expect(rb.checked).toBe(true)
  })

  it('onChange on select fires on native change event', () => {
    const container = setup()
    const changes: Array<string> = []
    function App() {
      const [v, setV] = React.useState('a')
      return (
        <select
          id="s"
          value={v}
          onChange={(e: any) => {
            const next = (e.target as HTMLSelectElement).value
            changes.push(next)
            setV(next)
          }}
        >
          <option value="a">a</option>
          <option value="b">b</option>
          <option value="c">c</option>
        </select>
      )
    }
    createRoot(container).render(<App />)
    const sel = container.querySelector('#s') as HTMLSelectElement

    sel.value = 'b'
    flushSync(() => sel.dispatchEvent(new Event('change', { bubbles: true })))

    expect(changes).toEqual(['b'])
  })

  it('controlled value is written back after user types (re-render wins)', () => {
    const container = setup()
    function App() {
      const [v, setV] = React.useState('')
      return (
        <input
          id="ctrl"
          value={v.toUpperCase()}
          onChange={(e: any) => setV((e.target as HTMLInputElement).value)}
        />
      )
    }
    createRoot(container).render(<App />)
    const input = container.querySelector('#ctrl') as HTMLInputElement

    flushSync(() => dispatchInput(input, 'foo'))
    expect(input.value).toBe('FOO')
  })
})
