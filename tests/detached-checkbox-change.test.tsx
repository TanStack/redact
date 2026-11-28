import { afterEach, expect, it } from 'vitest'
import { act, createElement as h, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

// Browsers fire no `change` for a checkbox or radio clicked outside a
// document. React listens for `click` there, so onChange still runs.
const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

function mount(element: any, attached = false): HTMLElement {
  const container = document.createElement('div')
  if (attached) document.body.appendChild(container)
  const root = createRoot(container)
  flushSync(() => root.render(element))
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return container
}

// Updates from an event handler flush in a microtask, as do restores.
const settle = () => new Promise(resolve => setTimeout(resolve))

const click = async (input: Element) => {
  (input as HTMLElement).click()
  await settle()
}

function Checkbox({ seen, accept = true }: { seen: boolean[], accept?: boolean }) {
  const [checked, setChecked] = useState(false)
  return h('input', {
    type: 'checkbox',
    checked,
    onChange: (event: any) => {
      seen.push(event.target.checked)
      if (accept) setChecked(event.target.checked)
    },
  })
}

function Radios({ seen, accept = true, controlled = true, initial = 'a' }: { seen: string[], accept?: boolean, controlled?: boolean, initial?: string }) {
  const [value, setValue] = useState(initial)
  return h('div', null, ['a', 'b'].map(key => h('input', {
    key,
    type: 'radio',
    name: 'detached',
    value: key,
    ...(controlled ? { checked: value === key } : { defaultChecked: initial === key }),
    onChange: () => {
      seen.push(key)
      if (accept) setValue(key)
    },
  })))
}

it.each([false, true])('calls onChange once per checkbox click (attached: %s)', async attached => {
  const seen: boolean[] = []
  const input = mount(h(Checkbox, { seen }), attached).firstChild as HTMLInputElement
  await click(input)
  expect(input.checked).toBe(true)
  await click(input)
  expect(input.checked).toBe(false)
  expect(seen).toEqual([true, false])
})

it.each([false, true])('restores a checkbox that onChange rejected (attached: %s)', async attached => {
  const seen: boolean[] = []
  const input = mount(h(Checkbox, { seen, accept: false }), attached).firstChild as HTMLInputElement
  await click(input)
  expect(seen).toEqual([true])
  expect(input.checked).toBe(false)
})

it('keeps an accepted detached checkbox click under act', async () => {
  const seen: boolean[] = []
  const input = mount(h(Checkbox, { seen })).firstChild as HTMLInputElement
  await act(() => input.click())
  expect(seen).toEqual([true])
  expect(input.checked).toBe(true)
})

it.each([false, true])('calls onChange only when a controlled radio becomes checked (attached: %s)', async attached => {
  const seen: string[] = []
  const [a, b] = [...mount(h(Radios, { seen }), attached).querySelectorAll('input')] as [HTMLInputElement, HTMLInputElement]
  await click(a)
  await click(b)
  await click(b)
  await click(a)
  expect(seen).toEqual(['b', 'a'])
  expect([a.checked, b.checked]).toEqual([true, false])
})

it.each([false, true])('calls onChange only when an uncontrolled radio becomes checked (attached: %s)', async attached => {
  const seen: string[] = []
  const [a, b] = [...mount(h(Radios, { seen, controlled: false }), attached).querySelectorAll('input')] as [HTMLInputElement, HTMLInputElement]
  await click(a)
  await click(b)
  await click(a)
  await click(a)
  expect(seen).toEqual(['b', 'a'])
})

it.each([false, true])('restores a radio group that onChange rejected (attached: %s)', async attached => {
  const seen: string[] = []
  const [a, b] = [...mount(h(Radios, { seen, accept: false }), attached).querySelectorAll('input')] as [HTMLInputElement, HTMLInputElement]
  await click(b)
  expect(seen).toEqual(['b'])
  expect([a.checked, b.checked]).toEqual([true, false])
})

it('runs onChangeCapture before onChange on a detached checkbox', async () => {
  const seen: string[] = []
  const container = mount(h('input', {
    type: 'checkbox',
    onChange: () => seen.push('bubble'),
    onChangeCapture: () => seen.push('capture'),
  }))
  await click(container.firstChild as Element)
  expect(seen).toEqual(['capture', 'bubble'])
})

it('calls onChange for a label click on a detached checkbox', async () => {
  const seen: boolean[] = []
  const container = mount(h('label', null, h('input', { type: 'checkbox', onChange: (event: any) => seen.push(event.target.checked) }), 'Label'))
  await click(container.firstChild as Element)
  expect(seen).toEqual([true])
})

it('does not call onChange for an attached checkbox click that onClick prevents', async () => {
  const seen: string[] = []
  const input = mount(h('input', {
    type: 'checkbox',
    onChange: () => seen.push('change'),
    onClick: (event: any) => { seen.push('click'); event.preventDefault() },
  }), true).firstChild as HTMLInputElement
  await click(input)
  expect(seen).toEqual(['click'])
  expect(input.checked).toBe(false)
})

// React reads the change from the click, which preventDefault does not stop.
it('calls onChange for a detached checkbox click that onClick prevents', async () => {
  const seen: string[] = []
  const input = mount(h('input', {
    type: 'checkbox',
    onClick: (event: any) => { seen.push('click'); event.preventDefault() },
    onChange: (event: any) => seen.push('change ' + event.target.checked),
  })).firstChild as HTMLInputElement
  await click(input)
  expect(seen).toEqual(['click', 'change true'])
  expect(input.checked).toBe(false)
})

it('keeps onChange on a native change event of a detached checkbox', async () => {
  const seen: boolean[] = []
  const input = mount(h('input', { type: 'checkbox', onChange: (event: any) => seen.push(event.target.checked) })).firstChild as HTMLInputElement
  input.checked = true
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await settle()
  expect(seen).toEqual([true])
})

it('ignores clicks after a detached checkbox becomes a text input', async () => {
  let setType!: (type: string) => void
  const seen: string[] = []
  function App() {
    const [type, set] = useState('checkbox')
    setType = set
    return h('input', { type, onChange: (event: any) => seen.push(event.target.type) })
  }
  const input = mount(h(App)).firstChild as HTMLInputElement
  await click(input)
  flushSync(() => setType('text'))
  await click(input)
  expect(seen).toEqual(['checkbox'])
})
