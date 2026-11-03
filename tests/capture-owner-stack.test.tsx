import { afterEach, describe, expect, it } from 'vitest'
import React, { captureOwnerStack, useEffect, useLayoutEffect, useInsertionEffect } from '@tanstack/redact'
import { createRoot, hydrateRoot } from '@tanstack/redact/dom-client'
import { act } from '@tanstack/redact/dom-test-utils'
import { devToolsMetadata } from '../packages/redact/src/core/devtools'

const roots: Array<ReturnType<typeof createRoot>> = []
afterEach(async () => {
  await act(() => { for (const root of roots.splice(0)) root.unmount() })
  document.body.innerHTML = ''
})

function mount(element: any, options?: any) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container, options)
  roots.push(root)
  return { root, container }
}

describe('captureOwnerStack', () => {
  it('exports the same callable on named and default React imports', () => {
    expect(React.captureOwnerStack).toBe(captureOwnerStack)
    expect(captureOwnerStack()).toBeNull()
  })

  it('tracks creators without requiring DevTools and excludes forwarding parents', async () => {
    expect(devToolsMetadata.enabled).toBe(false)
    const stacks: Array<string | null> = []
    function Leaf() {
      const capture = React.captureOwnerStack
      if (!capture) throw new Error('Missing development captureOwnerStack export')
      stacks.push(capture())
      return <span>leaf</span>
    }
    function Creator() { return <div><Leaf /></div> }
    function Forwarder({ children }: any) { return <section>{children}</section> }
    function App() { return <Forwarder><Creator /></Forwarder> }
    const { root } = mount(<App />)
    await act(() => root.render(<App />))
    expect(stacks).not.toHaveLength(0)
    for (const stack of stacks) {
      expect(stack).toContain('at Creator')
      expect(stack).toContain('at App')
      expect(stack).not.toMatch(/at (Leaf|Forwarder|div|section)(?:\s|$)/)
    }
    expect(captureOwnerStack()).toBeNull()
  })

  it('provides callback owners and restores context after effects and events', async () => {
    const values: Record<string, string | null> = {}
    function Child() {
      useInsertionEffect(() => { values.insertion = captureOwnerStack() }, [])
      useLayoutEffect(() => { values.layout = captureOwnerStack() }, [])
      useEffect(() => { values.effect = captureOwnerStack(); return () => { values.cleanup = captureOwnerStack() } }, [])
      return <button onClick={() => { values.event = captureOwnerStack() }}>capture</button>
    }
    function Parent() { return <Child /> }
    const { root, container } = mount(<Parent />)
    await act(() => root.render(<Parent />))
    expect(values.insertion).toContain('at Parent')
    expect(values.layout).toContain('at Parent')
    expect(values.effect).toContain('at Parent')
    expect(captureOwnerStack()).toBeNull()
    await act(() => container.querySelector('button')!.click())
    expect(values.event).toContain('at Child')
    expect(values.event).toContain('at Parent')
    expect(captureOwnerStack()).toBeNull()
    await act(() => root.render(null))
    expect(values.cleanup).toContain('at Parent')
    expect(captureOwnerStack()).toBeNull()
  })
  it('preserves the failed component creators in root and boundary error handlers', () => {
    const values: Record<string, string | null> = {}
    function Broken(): any { throw new Error('owner stack failure') }
    function Parent() { return <Broken /> }
    const { root } = mount(null, { onUncaughtError() { values.uncaught = captureOwnerStack() } })
    root.render(<Parent />)
    expect(values.uncaught).toContain('at Parent')
    expect(captureOwnerStack()).toBeNull()

    class Boundary extends React.Component<{ children?: any }, { failed: boolean }> {
      state = { failed: false }
      static getDerivedStateFromError() { return { failed: true } }
      componentDidCatch() { values.boundary = captureOwnerStack() }
      render() { return this.state.failed ? null : this.props.children }
    }
    function Creator() { return <Boundary><Broken /></Boundary> }
    const caught = mount(null, { onCaughtError() { values.caught = captureOwnerStack() } })
    caught.root.render(<Creator />)
    expect(values.caught).toContain('at Creator')
    expect(values.caught).not.toContain('at Boundary')
    expect(values.boundary).toBe(values.caught)
    expect(captureOwnerStack()).toBeNull()
  })

  it('exposes creators during recoverable hydration errors', () => {
    const values: Array<string | null> = []
    function App() { return <div>client</div> }
    const container = document.createElement('div')
    container.innerHTML = '<p>server</p>'
    document.body.append(container)
    const root = hydrateRoot(container, <App />, { onRecoverableError() { values.push(captureOwnerStack()) } })
    roots.push(root)
    expect(values.some(stack => stack?.includes('at App'))).toBe(true)
    expect(captureOwnerStack()).toBeNull()
  })

  it('formats Firefox and WebKit source frames for stack consumers', () => {
    let stack: string | null = null
    function Child() {
      const fiber = devToolsMetadata.current
      const metadata = fiber && devToolsMetadata.fibers.get(fiber)
      if (!metadata) throw new Error('Missing element owner metadata')
      const previous = metadata.stack
      const source = new Error()
      source.stack = 'Parent@http://fixture.test/app.tsx:10:2'
      metadata.stack = source
      try { stack = captureOwnerStack() } finally { metadata.stack = previous }
      return null
    }
    function Parent() { return <Child /> }
    const { root } = mount(<Parent />)
    root.render(<Parent />)
    expect(stack).toContain('at Parent (http://fixture.test/app.tsx:10:2)')
  })

})
