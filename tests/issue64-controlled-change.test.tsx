import { afterEach, expect, it } from 'vitest'
import { createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

it.each(['input', 'textarea'])('does not report a renderer-written %s value as a blur change', tag => {
  const container = document.createElement('div')
  const root = createRoot(container)
  cleanups.push(() => flushSync(() => root.unmount()))
  const bubble: string[] = [], capture: string[] = []
  const render = (value: string) => flushSync(() => root.render(h(tag, {
    value,
    onChange: (event: any) => bubble.push(event.target.value),
    onChangeCapture: (event: any) => capture.push(event.target.value),
  })))
  render('')
  const field = container.firstChild as HTMLInputElement
  field.value = 'a'
  field.dispatchEvent(new Event('input', { bubbles: true }))
  render('filled')
  field.dispatchEvent(new Event('change', { bubbles: true }))
  expect(bubble).toEqual(['a'])
  expect(capture).toEqual(['a'])
  // A write outside the renderer must still be visible to native change.
  field.value = 'external'
  field.dispatchEvent(new Event('change', { bubbles: true }))
  expect(bubble).toEqual(['a', 'external'])
  expect(capture).toEqual(['a', 'external'])
})
