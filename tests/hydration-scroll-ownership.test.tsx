import { expect, it, vi } from 'vitest'
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
it('leaves application scroll restoration available immediately after hydration and a scroll event', async () => {
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const element = document.createElement('div')
  element.innerHTML = '<p>Ready</p>'
  document.body.append(element)
  const root = hydrateRoot(element, <p>Ready</p>)
  await new Promise(resolve => setTimeout(resolve, 30))
  expect(window.scrollTo).toBe(scrollTo)
  window.dispatchEvent(new Event('scroll'))
  window.scrollTo(0, 123)
  expect(scrollTo).toHaveBeenCalledWith(0, 123)
  flushSync(() => root.unmount())
  element.remove()
  vi.restoreAllMocks()
})
