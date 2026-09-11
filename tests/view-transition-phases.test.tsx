import { afterEach, describe, expect, it, vi } from 'vitest'
import React, { Component, ViewTransition, createRef, startTransition, useEffect, useInsertionEffect, useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { ReactNode } from 'react'

const cleanups: Array<() => void> = []
const nativeTransitions: globalThis.ViewTransition[] = []
const releaseNativeWaits: Array<() => void> = []
afterEach(async () => {
  for (const release of releaseNativeWaits.splice(0)) release()
  for (const transition of nativeTransitions.splice(0)) {
    transition.skipTransition()
    await transition.finished.catch(() => {})
  }
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.restoreAllMocks()
})
function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return { container, render: (node: ReactNode) => flushSync(() => root.render(node)) }
}

it('keeps live keyed order unchanged until the complete next tree renders', () => {
  const { container, render } = setup()
  const seen: string[] = []
  function Read() { seen.push(container.textContent!); return null }
  const view = (items: string[]) => <>{items.map(item => <div key={item}>{item}</div>)}<Read /></>
  render(view(['a', 'b', 'c']))
  const b = container.children[1]
  seen.length = 0
  render(view(['c', 'b', 'd']))
  expect(seen).toEqual(['abc'])
  expect(container.textContent).toBe('cbd')
  expect(container.children[1]).toBe(b)
})

it('does not expose new controlled properties or attributes during sibling rendering', () => {
  const { container, render } = setup()
  const ref = createRef<HTMLInputElement>()
  const seen: unknown[] = []
  function Read() { if (ref.current) seen.push([ref.current.value, ref.current.checked, ref.current.getAttribute('data-value')]); return null }
  const view = (value: string, checked: boolean) => <><input ref={ref} value={value} checked={checked} readOnly data-value={value} /><Read /></>
  render(view('old', false)); seen.length = 0
  render(view('new', true))
  expect(seen).toEqual([['old', false, 'old']])
  expect(ref.current?.value).toBe('new')
  expect(ref.current?.checked).toBe(true)
  expect(container.querySelector('input')?.getAttribute('data-value')).toBe('new')
})

it('runs insertion effects after mutation but before new refs and layout effects', () => {
  const { container, render } = setup()
  const ref = createRef<HTMLDivElement>()
  const events: string[] = []
  function App() {
    useInsertionEffect(() => { events.push(`insertion:${container.textContent}:${ref.current === null}`) }, [])
    useLayoutEffect(() => { events.push(`layout:${container.textContent}:${ref.current === container.firstChild}`) }, [])
    return <div ref={ref}>mounted</div>
  }
  render(<App />)
  expect(events).toEqual(['insertion:mounted:true', 'layout:mounted:true'])
})

it('does not leak partially prepared host updates into an error fallback render', () => {
  const { container, render } = setup()
  const observed: string[] = []
  class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() { return { failed: true } }
    componentDidCatch() {}
    render() {
      if (this.state.failed) { observed.push(container.textContent!); return <strong>fallback</strong> }
      return this.props.children
    }
  }
  function Break({ fail }: { fail: boolean }) { if (fail) throw Error('phase failure'); return <span>safe</span> }
  const view = (fail: boolean) => <Boundary><div>{fail ? 'new' : 'old'}</div><Break fail={fail} /></Boundary>
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  render(view(false))
  render(view(true))
  expect(observed.length).toBeGreaterThan(0)
  expect(observed.every(value => value === 'oldsafe')).toBe(true)
  expect(container.textContent).toBe('fallback')
  errors.mockRestore()
})

it('preserves removed host subtrees and runs parent cleanup before descendant refs', () => {
  const { container, render } = setup()
  const events: string[] = []
  let retained!: HTMLDivElement
  function Child() {
    useLayoutEffect(() => () => { events.push(`layout:${retained.textContent}`) }, [])
    return <div ref={(element: HTMLDivElement | null) => {
      if (element) retained = element
      return () => { events.push(`outer-ref:${retained.textContent}`) }
    }}><span ref={() => () => { events.push(`inner-ref:${retained.textContent}`) }}>child</span></div>
  }
  render(<Child />)
  const child = retained.firstChild
  render(null)
  expect(events).toEqual(['layout:child', 'outer-ref:child', 'inner-ref:child'])
  expect(container.textContent).toBe('')
  expect(retained.isConnected).toBe(false)
  expect(retained.firstChild).toBe(child)
  expect(retained.textContent).toBe('child')
})

describe.runIf(!!document.startViewTransition)('native capture timing', () => {
  function nativeSetup() {
    const native = document.startViewTransition.bind(document)
    vi.spyOn(document, 'startViewTransition').mockImplementation((options: any) => {
      const transition = native(options)
      transition.ready.catch(() => {})
      nativeTransitions.push(transition)
      return transition
    })
    const style = document.createElement('style')
    style.textContent = '::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation-duration: .5s; }'
    document.head.appendChild(style)
    cleanups.push(() => style.remove())
    return setup()
  }

  async function launched(update: () => void) {
    startTransition(update)
    await vi.waitFor(() => expect(nativeTransitions).toHaveLength(1))
    return nativeTransitions[0]!
  }

  it.each([false, true])('restores author capture styles at the passive boundary, urgent=%s', async urgent => {
    const { container, render } = nativeSetup()
    const events: string[] = []
    let set!: (value: number) => void
    const styles = () => {
      const element = container.firstElementChild as HTMLElement
      return `${element.style.viewTransitionName}:${element.style.viewTransitionClass}`
    }
    function Child({ value }: { value: number }) {
      useEffect(() => { events.push(`passive:${value}:${styles()}`) }, [value])
      return <div style={{ viewTransitionName: 'author-name', viewTransitionClass: 'author-class' }}>{value}</div>
    }
    function App() {
      const [value, update] = useState(0); set = update
      return <ViewTransition name="capture-timing" update="capture-class" onUpdate={() => {
        events.push(`callback:${styles()}`)
        return () => { events.push(`cleanup:${styles()}`) }
      }}><Child value={value} /></ViewTransition>
    }
    render(<App />)
    events.length = 0
    const transition = await launched(() => set(1))
    await transition.ready
    await vi.waitFor(() => expect(events).toContain('callback:capture-timing:capture-class'))
    expect(styles()).toBe('capture-timing:capture-class')
    expect(events.some(event => event.startsWith('passive:1:'))).toBe(false)
    if (urgent) {
      flushSync(() => set(2))
      expect(container.textContent).toBe('2')
      expect(styles()).toBe('author-name:author-class')
      expect(events).toContain('passive:1:author-name:author-class')
      expect(events.some(event => event.startsWith('cleanup:'))).toBe(false)
    }
    await transition.finished
    await vi.waitFor(() => expect(events).toContain('cleanup:author-name:author-class'))
    expect(styles()).toBe('author-name:author-class')
    expect(events.indexOf('passive:1:author-name:author-class')).toBeLessThan(events.indexOf('cleanup:author-name:author-class'))
    expect(events.filter(event => event.startsWith('cleanup:'))).toHaveLength(1)
  })

  it.each([false, true])('waits for the navigation captured before mutation, replaced=%s', async replaced => {
    const { render } = nativeSetup()
    const original = Object.getOwnPropertyDescriptor(window, 'navigation')
    let resolveBefore!: () => void
    let resolveAfter!: () => void
    const before = { finished: new Promise<void>(resolve => { resolveBefore = resolve }) }
    const after = { finished: new Promise<void>(resolve => { resolveAfter = resolve }) }
    const navigation: { transition: typeof before | null } = { transition: before }
    Object.defineProperty(window, 'navigation', { configurable: true, value: navigation })
    releaseNativeWaits.push(() => { resolveBefore(); resolveAfter() })
    cleanups.unshift(() => {
      if (original) Object.defineProperty(window, 'navigation', original)
      else delete (window as any).navigation
    })
    let set!: (value: number) => void
    let layout = false
    function App() {
      const [value, update] = useState(0); set = update
      useLayoutEffect(() => {
        if (value) { navigation.transition = replaced ? after : null; layout = true }
      }, [value])
      return <ViewTransition name="navigation-timing"><div>{value}</div></ViewTransition>
    }
    render(<App />)
    const transition = await launched(() => set(1))
    let committed = false
    transition.updateCallbackDone.then(() => { committed = true })
    await vi.waitFor(() => expect(layout).toBe(true))
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(committed).toBe(false)
    resolveBefore()
    await vi.waitFor(() => expect(committed).toBe(true))
    await transition.ready
    resolveAfter()
  })
})
