import { afterEach, describe, expect, it } from 'vitest'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'

const roots: Root[] = []
function setup() {
  const container = document.createElement('div')
  const root = createRoot(container)
  roots.push(root)
  return { container, root }
}

afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
})

describe('React 19.3 core behavior audit', () => {
  it('accepts omitted props when creating or cloning an element', () => {
    const element = React.createElement('div')
    expect(element.props).toEqual({})
    const clone = React.cloneElement(element)
    expect(clone.type).toBe('div')
    expect(clone.props).toEqual({})
    expect(clone).not.toBe(element)
  })

  // https://github.com/react/react/pull/34831
  for (const wrapper of ['plain', 'memo', 'forwardRef', 'memo(forwardRef)']) {
    it(`useEffectEvent reads committed prop updates through ${wrapper}`, () => {
      const { root } = setup()
      const listeners = new Set<() => number>()
      function Component({ value }: { value: number }) {
        const event = React.useEffectEvent(() => value)
        React.useLayoutEffect(() => {
          listeners.add(event)
          return () => { listeners.delete(event) }
        }, [])
        return null
      }
      const Wrapped = wrapper === 'plain' ? Component
        : wrapper === 'memo' ? React.memo(Component)
        : wrapper === 'forwardRef' ? React.forwardRef<unknown, { value: number }>(Component)
        : React.memo(React.forwardRef<unknown, { value: number }>(Component))
      root.render(<Wrapped value={1} />)
      expect([...listeners].map((listener) => listener())).toEqual([1])
      root.render(<Wrapped value={2} />)
      expect([...listeners].map((listener) => listener())).toEqual([2])
    })
  }

  // https://github.com/react/react/pull/34906 affects upstream debug metadata.
  it('lazy renders the resolved default export', async () => {
    const { root, container } = setup()
    const Lazy = React.lazy(async () => ({ default: () => <span>default</span>, named: () => <b>named</b> }))
    root.render(<React.Suspense fallback={<i>loading</i>}><Lazy /></React.Suspense>)
    for (let i = 0; i < 5; i++) await Promise.resolve()
    flushSync(() => {})
    expect(container.textContent).toBe('default')
  })
})
