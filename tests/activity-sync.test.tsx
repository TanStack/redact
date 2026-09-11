import { expect, it } from 'vitest'
import { Activity, createElement, useState } from '@tanstack/redact'
import { createRoot } from '@tanstack/redact/dom-client'
import { flushSync } from '@tanstack/redact/dom'

it('prerenders hidden Activity updates synchronously instead of using background priority', () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  let update!: (value: number) => void
  function Child() {
    const [value, set] = useState(1)
    update = set
    return createElement('b', null, value)
  }
  try {
    flushSync(() => root.render(createElement(Activity, { mode: 'hidden' }, createElement(Child, null))))
    expect(container.querySelector('b')!.textContent).toBe('1')
    expect(container.querySelector('b')!.style.display).toBe('none')
    flushSync(() => update(2))
    expect(container.querySelector('b')!.textContent).toBe('2')
    expect(container.querySelector('b')!.style.display).toBe('none')
  } finally { flushSync(() => root.unmount()) }
})
