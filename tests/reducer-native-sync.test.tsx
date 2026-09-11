import { afterEach, expect, it, vi } from 'vitest'
import { ViewTransition, startTransition, useLayoutEffect, useReducer, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { Dispatch, SetStateAction } from 'react'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('consumes a prepared reducer commit once before an urgent dispatch uses new props', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  if (!globalThis.CSS) vi.stubGlobal('CSS', { escape: (value: string) => value })
  const descriptor = Object.getOwnPropertyDescriptor(document, 'startViewTransition')
  let nativeUpdate!: () => unknown, finish!: () => void
  const skip = vi.fn(() => finish())
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value(options: { update: () => unknown }) {
      nativeUpdate = options.update
      return {
        ready: new Promise<void>(() => {}),
        updateCallbackDone: Promise.resolve(),
        finished: new Promise<void>(resolve => { finish = resolve }),
        skipTransition: skip,
      }
    },
  })
  cleanups.push(() => {
    if (descriptor) Object.defineProperty(document, 'startViewTransition', descriptor)
    else delete (document as Partial<Document>).startViewTransition
  })
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(() => [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList)
  const commits: number[] = []
  let dispatch!: Dispatch<number>, setFactor!: Dispatch<SetStateAction<number>>
  function Counter({ factor }: { factor: number }) {
    const [value, send] = useReducer((value: number, action: number) => value + action * factor, 0); dispatch = send
    useLayoutEffect(() => { commits.push(value) }, [value])
    return <ViewTransition name="reducer-prepared"><b>{value}</b></ViewTransition>
  }
  function App() { const [factor, set] = useState(1); setFactor = set; return <Counter factor={factor} /> }
  flushSync(() => root.render(<App />))
  const first = dispatch
  startTransition(() => first(1))
  await vi.waitFor(() => expect(nativeUpdate).toBeTypeOf('function'))
  expect(container.textContent).toBe('0')
  expect(commits).toEqual([0])
  flushSync(() => { first(2); setFactor(10) })
  expect(container.textContent).toBe('21')
  expect(commits).toEqual([0, 1, 21])
  expect(dispatch).toBe(first)
  expect(skip).toHaveBeenCalledTimes(1)
  await nativeUpdate()
  expect(container.textContent).toBe('21')
  expect(commits).toEqual([0, 1, 21])
})
