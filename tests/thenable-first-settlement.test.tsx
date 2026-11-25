import { act, createElement as h, use } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'

it('keeps the first fulfillment from a user supplied thenable like Promise resolution does', async () => {
  const thenable = Object.assign(Promise.resolve('unused'), { then(resolve: (value: string) => void) { resolve('first'); resolve('second') } })
  expect(await Promise.resolve({ then: thenable.then })).toBe('first')
  function Read() { return h('p', null, use(thenable)) }
  const container = document.createElement('div'), root = createRoot(container)
  try {
    await act(() => root.render(h(Read)))
    expect(container.textContent).toBe('first')
  } finally { await act(() => root.unmount()) }
})
