import { afterEach, expect, it, vi } from 'vitest'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'

let root: Root | undefined
afterEach(() => {
  if (root) flushSync(() => root!.unmount())
  root = undefined
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

it.each([false, true])('retains original stylesheet ownership when eligibility changes from shared=%s', shared => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const container = document.createElement('div')
  document.head.innerHTML = `<link rel="stylesheet" href="/ownership-${shared}.css" data-precedence="theme">`
  document.body.append(container)
  root = createRoot(container)
  const attached: Element[] = [], detached: Element[] = []
  const ref = (node: Element | null) => {
    if (!node) throw new Error('Cleanup-returning refs must not receive null')
    attached.push(node)
    return () => { detached.push(node) }
  }
  const render = (isShared: boolean) => flushSync(() => root!.render(
    <link rel="stylesheet" href={`/ownership-${shared}.css`} precedence="theme" disabled={isShared ? undefined : false} ref={ref} />,
  ))
  render(shared)
  const original = attached[0]!
  expect(original.parentNode).toBe(shared ? document.head : container)
  render(!shared)
  expect(attached).toEqual([original])
  expect(detached).toEqual([])
  expect(original.parentNode).toBe(shared ? document.head : container)
  expect(container.querySelectorAll('link')).toHaveLength(shared ? 0 : 1)
  flushSync(() => root!.unmount())
  root = undefined
  expect(detached).toEqual([original])
  expect(original.isConnected).toBe(shared)
})
