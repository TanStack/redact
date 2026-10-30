import { expect, it } from 'vitest'
import { userEvent } from '@vitest/browser/context'
import { createElement as h, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

// Real typing runs microtasks between listeners, which dispatchEvent never does.
it('lets every listener on a controlled input read the typed edit', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const seen: string[] = []
  flushSync(() => root.render(h('input', {
    value: '',
    onChange: (event: any) => seen.push('change ' + event.target.value),
    onInput: (event: any) => seen.push('input ' + event.target.value),
  })))
  const field = container.querySelector('input')!
  try {
    await userEvent.type(field, 'a')
    expect(seen.sort()).toEqual(['change a', 'input a'])
    expect(field.value).toBe('')
  } finally {
    flushSync(() => root.unmount())
    container.remove()
  }
})

it('lets onChange on a checkbox with onInput read the click', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const seen: boolean[] = []
  flushSync(() => root.render(h('input', {
    type: 'checkbox',
    checked: false,
    onInput: () => {},
    onChange: (event: any) => seen.push(event.target.checked),
  })))
  const box = container.querySelector('input')!
  try {
    await userEvent.click(box)
    expect(seen).toEqual([true])
    expect(box.checked).toBe(false)
  } finally {
    flushSync(() => root.unmount())
    container.remove()
  }
})

function render(element: any): [HTMLElement, () => void] {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  flushSync(() => root.render(element))
  return [container, () => { flushSync(() => root.unmount()); container.remove() }]
}

// React restores after its root listener, which runs after the control's own.
it('lets a native listener added after Redact\'s read the typed edit', async () => {
  const seen: string[] = []
  const [container, cleanup] = render(h('input', { value: '', onChange: () => {} }))
  const field = container.querySelector('input')!
  field.addEventListener('input', () => seen.push(field.value))
  try {
    await userEvent.type(field, 'a')
    expect(seen).toEqual(['a'])
    expect(field.value).toBe('')
  } finally { cleanup() }
})

it('keeps an edit that an ancestor\'s onInput accepts', async () => {
  function Form() {
    const [value, setValue] = useState('')
    return h('div', { onInput: (event: any) => setValue(event.target.value) },
      h('input', { value, onChange: () => {} }))
  }
  const [container, cleanup] = render(h(Form))
  const field = container.querySelector('input')!
  try {
    await userEvent.type(field, 'ab')
    expect(field.value).toBe('ab')
  } finally { cleanup() }
})

