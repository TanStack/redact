import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { setProp } from '../packages/redact/src/dom/dom'

class PropElement extends HTMLElement {
  received: unknown[] = []
  #payload: unknown

  get payload(): unknown {
    return this.#payload
  }

  set payload(value: unknown) {
    this.#payload = value
    this.received.push(value)
  }
}

customElements.define('prop-element', PropElement)

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  return container
}

describe('custom element props', () => {
  it('assigns declared properties instead of stringifying them', () => {
    const el = document.createElement('prop-element') as PropElement
    const payload = { value: 1 }
    setProp(el, 'payload', payload, undefined, false)
    expect(el.payload).toBe(payload)
    expect(el.hasAttribute('payload')).toBe(false)
  })

  it('leaves undeclared names, aria and data props as attributes', () => {
    const el = document.createElement('prop-element')
    setProp(el, 'undeclared', 'text', undefined, false)
    setProp(el, 'data-mask', 'on', undefined, false)
    setProp(el, 'aria-label', 'label', undefined, false)
    expect(el.getAttribute('undeclared')).toBe('text')
    expect(el.getAttribute('data-mask')).toBe('on')
    expect(el.getAttribute('aria-label')).toBe('label')
  })

  it('treats dashed SVG and MathML tags as ordinary elements', () => {
    const el = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'annotation-xml')
    setProp(el, 'id', 'x', undefined, false)
    expect(el.getAttribute('id')).toBe('x')
  })

  it('pushes every update through, not just the first', () => {
    const container = setup()
    const root = createRoot(container)
    const first = { count: 1 }
    const second = { count: 2 }
    flushSync(() => root.render(<prop-element payload={first} />))
    const el = container.firstElementChild as PropElement
    flushSync(() => root.render(<prop-element payload={second} />))
    expect(el.received).toEqual([first, second])
  })
})
