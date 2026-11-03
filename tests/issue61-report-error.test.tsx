import { afterEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

afterEach(() => vi.unstubAllGlobals())

it.each([false, true])('keeps the original uncaught error when reportError exists: %s', available => {
  const original = new Error('the render failure')
  const queued: Array<() => void> = []
  const delayed: Array<() => void> = []
  const report = vi.fn()
  vi.stubGlobal('reportError', available ? report : undefined)
  // Remove the binding entirely to cover hosts without this optional API.
  if (!available) delete (globalThis as any).reportError
  vi.stubGlobal('queueMicrotask', (callback: () => void) => queued.push(callback))
  vi.stubGlobal('setTimeout', (callback: () => void) => delayed.push(callback))
  const container = document.createElement('div')
  const root = createRoot(container)
  function Broken(): never { throw original }
  flushSync(() => root.render(createElement(Broken)))
  if (available) expect(report).toHaveBeenCalledWith(original)
  else {
    const errors: unknown[] = []
    for (const callback of queued) { try { callback() } catch (error) { errors.push(error) } }
    expect(errors).toEqual([original])
    expect(delayed).toHaveLength(0)
  }
  flushSync(() => root.unmount())
})
