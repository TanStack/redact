import { afterEach, expect, it } from 'vitest'
import { userEvent } from '@vitest/browser/context'
import { createElement as h, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

function mount(element: any, attached: boolean): HTMLElement {
  const container = document.createElement('div')
  if (attached) document.body.appendChild(container)
  const root = createRoot(container)
  flushSync(() => root.render(element))
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return container
}

const settle = () => new Promise(resolve => setTimeout(resolve))

function Form({ seen, accept }: { seen: string[], accept: boolean }) {
  const [checked, setChecked] = useState(false)
  const [value, setValue] = useState('a')
  return h('div', null,
    h('input', {
      type: 'checkbox',
      checked,
      onChange: (event: any) => {
        seen.push('checkbox ' + event.target.checked)
        if (accept) setChecked(event.target.checked)
      },
    }),
    ['a', 'b'].map(key => h('input', {
      key,
      type: 'radio',
      name: 'browser-' + accept,
      checked: value === key,
      onChange: () => {
        seen.push('radio ' + key)
        if (accept) setValue(key)
      },
    })),
    h('input', {
      type: 'checkbox',
      onChange: () => seen.push('prevented'),
      onClick: (event: any) => event.preventDefault(),
    }),
  )
}

for (const accept of [true, false]) {
  it(`handles real clicks on attached controls (accept: ${accept})`, async () => {
    const seen: string[] = []
    const [checkbox, a, b, prevented] = [...mount(h(Form, { seen, accept }), true).querySelectorAll('input')] as [HTMLInputElement, HTMLInputElement, HTMLInputElement, HTMLInputElement]
    for (const input of [checkbox, a, b, b, prevented]) {
      await userEvent.click(input)
      await settle()
    }
    expect(seen).toEqual(accept
      ? ['checkbox true', 'radio b']
      : ['checkbox true', 'radio b', 'radio b'])
    expect([checkbox.checked, a.checked, b.checked, prevented.checked]).toEqual(accept
      ? [true, false, true, false]
      : [false, true, false, false])
  })

  // Browsers fire no change event here, so onChange comes from the click.
  it(`handles clicks on detached controls (accept: ${accept})`, async () => {
    const seen: string[] = []
    const container = mount(h(Form, { seen, accept }), false)
    const native: string[] = []
    container.addEventListener('change', () => native.push('change'))
    const [checkbox, a, b] = [...container.querySelectorAll('input')] as [HTMLInputElement, HTMLInputElement, HTMLInputElement]
    for (const input of [checkbox, a, b, b]) {
      input.click()
      await settle()
    }
    expect(native).toEqual([])
    expect(seen).toEqual(accept
      ? ['checkbox true', 'radio b']
      : ['checkbox true', 'radio b', 'radio b'])
    expect([checkbox.checked, a.checked, b.checked]).toEqual(accept
      ? [true, false, true]
      : [false, true, false])
  })
}
