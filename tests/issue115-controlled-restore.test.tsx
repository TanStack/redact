import { afterEach, expect, it } from 'vitest'
import { act, createElement as h, useState } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToString } from 'react-dom/server'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

function mount(element: any): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  flushSync(() => root.render(element))
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return container
}

async function hydrate(element: any): Promise<HTMLElement> {
  const container = document.createElement('div')
  container.innerHTML = renderToString(element)
  document.body.appendChild(container)
  const root = hydrateRoot(container, element)
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  await settle()
  return container
}

// Updates from an event handler flush in a microtask, as do restores.
const settle = () => new Promise(resolve => setTimeout(resolve))

const type = async (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
}

const click = async (input: HTMLInputElement) => {
  input.click()
  await settle()
}

function Digits({ tag = 'input', seen = [] }: { tag?: string, seen?: string[] }) {
  const [value, setValue] = useState('')
  return h(tag, {
    value,
    onChange: (event: any) => {
      seen.push(event.target.value)
      if (/^\d*$/.test(event.target.value)) setValue(event.target.value)
    },
  })
}

it.each(['input', 'textarea'])('restores a controlled %s value that onChange rejected', async tag => {
  const seen: string[] = []
  const field = mount(h(Digits, { tag, seen })).firstChild as HTMLInputElement
  await type(field, '1')
  await type(field, '1a')
  expect(field.value).toBe('1')
  await type(field, 'abc')
  expect(field.value).toBe('1')
  expect(seen).toEqual(['1', '1a', 'abc'])
  // The restored value is the renderer's, so blur reports no change.
  field.dispatchEvent(new Event('change', { bubbles: true }))
  await settle()
  expect(seen).toEqual(['1', '1a', 'abc'])
})

it('restores after updates that flushSync renders', async () => {
  const field = mount(h(Digits)).firstChild as HTMLInputElement
  for (const value of ['1', '1a']) {
    field.value = value
    flushSync(() => field.dispatchEvent(new Event('input', { bubbles: true })))
  }
  await settle()
  expect(field.value).toBe('1')
})

function Text() {
  const [value, setValue] = useState('ac')
  return h('input', { value, onChange: (event: any) => setValue(event.target.value) })
}

it('keeps the caret of an accepted edit', async () => {
  const field = mount(h(Text)).firstChild as HTMLInputElement
  field.value = 'abc'
  field.setSelectionRange(2, 2)
  field.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
  expect(field.value).toBe('abc')
  expect(field.selectionStart).toBe(2)
})

it('lets onChangeCapture and onChange both read the typed value', async () => {
  const seen: string[] = []
  const field = mount(h('input', {
    value: '',
    onChangeCapture: (event: any) => seen.push('capture ' + event.target.value),
    onChange: (event: any) => seen.push('bubble ' + event.target.value),
  })).firstChild as HTMLInputElement
  await type(field, 'a')
  expect(seen).toEqual(['capture a', 'bubble a'])
  expect(field.value).toBe('')
})

it('restores a value rejected by onChangeCapture alone', async () => {
  const field = mount(h('input', { value: 'x', onChangeCapture: () => {} })).firstChild as HTMLInputElement
  await type(field, 'xy')
  expect(field.value).toBe('x')
})

it('keeps an equivalent spelling of a controlled number', async () => {
  const field = mount(h('input', { type: 'number', value: 1, onChange: () => {} })).firstChild as HTMLInputElement
  await type(field, '1.0')
  expect(field.value).toBe('1.0')
  await type(field, '2')
  expect(field.value).toBe('1')
})

it('leaves an uncontrolled input alone', async () => {
  const field = mount(h('input', { defaultValue: '', onChange: () => {} })).firstChild as HTMLInputElement
  await type(field, 'a')
  expect(field.value).toBe('a')
})

it.each([false, true])('restores checked=%s on a checkbox when onChange ignores the click', async checked => {
  const seen: boolean[] = []
  const box = mount(h('input', {
    type: 'checkbox',
    checked,
    onChange: (event: any) => seen.push(event.target.checked),
  })).firstChild as HTMLInputElement
  await click(box)
  expect(seen).toEqual([!checked])
  expect(box.checked).toBe(checked)
})

it('restores the checked radio of a group when onChange ignores the click', async () => {
  const container = mount(h('div', null,
    h('input', { type: 'radio', name: 'size', value: 's', checked: true, onChange: () => {} }),
    h('input', { type: 'radio', name: 'size', value: 'm', checked: false, onChange: () => {} }),
  ))
  const [small, medium] = [...container.querySelectorAll('input')] as [HTMLInputElement, HTMLInputElement]
  await click(medium)
  expect(small.checked).toBe(true)
  expect(medium.checked).toBe(false)
})

it('follows a radio group that onChange accepts', async () => {
  function Sizes() {
    const [size, setSize] = useState('s')
    return h('div', null, ['s', 'm'].map(value => h('input', {
      key: value, type: 'radio', name: 'size', value,
      checked: size === value,
      onChange: (event: any) => setSize(event.target.value),
    })))
  }
  const [small, medium] = [...mount(h(Sizes)).querySelectorAll('input')] as [HTMLInputElement, HTMLInputElement]
  await click(medium)
  expect(small.checked).toBe(false)
  expect(medium.checked).toBe(true)
})

it('restores after updates that act renders, keeping the caret', async () => {
  const digits = mount(h(Digits)).firstChild as HTMLInputElement
  for (const value of ['1', '1a']) {
    await act(async () => {
      digits.value = value
      digits.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  expect(digits.value).toBe('1')
  const text = mount(h(Text)).firstChild as HTMLInputElement
  await act(async () => {
    text.value = 'abc'
    text.setSelectionRange(2, 2)
    text.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(text.selectionStart).toBe(2)
})

it.each(['input', 'textarea'])('restores a hydrated %s', async tag => {
  const field = (await hydrate(h(Digits, { tag }))).firstChild as HTMLInputElement
  await type(field, 'a')
  expect(field.value).toBe('')
  await type(field, '1')
  expect(field.value).toBe('1')
})

it('restores a hydrated radio group', async () => {
  const container = await hydrate(h('div', null,
    h('input', { type: 'radio', name: 'size', value: 's', checked: true, onChange: () => {} }),
    h('input', { type: 'radio', name: 'size', value: 'm', checked: false, onChange: () => {} }),
  ))
  const [small, medium] = [...container.querySelectorAll('input')] as [HTMLInputElement, HTMLInputElement]
  await click(medium)
  expect(small.checked).toBe(true)
  expect(medium.checked).toBe(false)
})

it('restores a value rejected by onInput alone', async () => {
  const field = mount(h('input', { value: 'x', onInput: () => {} })).firstChild as HTMLInputElement
  await type(field, 'xy')
  expect(field.value).toBe('x')
})

it('restores a controlled select when onChange ignores the choice', async () => {
  const select = mount(h('select', { value: 'a', onChange: () => {} },
    h('option', { value: 'a' }, 'A'),
    h('option', { value: 'b' }, 'B'),
  )).firstChild as HTMLSelectElement
  select.value = 'b'
  select.dispatchEvent(new Event('change', { bubbles: true }))
  await settle()
  expect(select.value).toBe('a')
})
