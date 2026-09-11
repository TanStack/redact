import { expect, it } from 'vitest'
import { cloneElement, createElement, createRef, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

it('preserves legacy element-level refs while accepting modern ref overrides', () => {
  const original = createRef<HTMLButtonElement>()
  const replacement = createRef<HTMLButtonElement>()
  const legacy = {
    ...createElement('button', { children: 'legacy' }),
    $$typeof: Symbol.for('react.element'),
    ref: original,
  } as ReactElement
  const container = document.createElement('div')
  const root = createRoot(container)
  try {
    flushSync(() => root.render(cloneElement(legacy, { ref: undefined })))
    const button = container.querySelector('button')
    expect(original.current).toBe(button)
    expect(cloneElement(legacy).ref).toBe(original)
    flushSync(() => root.render(cloneElement(legacy, { ref: replacement })))
    expect(original.current).toBe(null)
    expect(replacement.current).toBe(button)
    flushSync(() => root.render(cloneElement(legacy, { ref: null })))
    expect(replacement.current).toBe(null)
    expect(container.querySelector('button')).toBe(button)
  } finally { flushSync(() => root.unmount()) }
})
