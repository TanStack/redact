import { expect, it } from 'vitest'
import { userEvent } from '@vitest/browser/context'
import { createElement as h } from 'react'
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
