import { afterEach, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { createPortal, flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return { container, render: (element: React.ReactNode) => flushSync(() => root.render(element)), root }
}

it('focuses the committed order on its first focus call during a class snapshot', () => {
  const { render } = setup()
  const ref = React.createRef<any>()
  const seen: string[] = []
  class Probe extends React.Component<{ changed: boolean }> {
    render() { return null }
    getSnapshotBeforeUpdate() {
      ref.current.focusLast()
      seen.push(document.activeElement!.textContent!)
      ref.current.focus()
      seen.push(document.activeElement!.textContent!)
      return null
    }
    componentDidUpdate() {}
  }
  const tree = (changed: boolean) => <><React.Fragment ref={ref}>
    {(changed ? ['c', 'b', 'a'] : ['a', 'b']).map(key => <section key={key}><button>{key}</button></section>)}
  </React.Fragment><Probe changed={changed} /></>
  render(tree(false))
  render(tree(true))
  expect(seen).toEqual(['b', 'a'])
  ref.current.focus()
  expect(document.activeElement!.textContent).toBe('c')
  ref.current.focusLast()
  expect(document.activeElement!.textContent).toBe('a')
})

it('focuses children owned by a Fragment inside a retained Suspense fallback', () => {
  const { render } = setup()
  const ref = React.createRef<any>()
  const pending = new Promise(() => {})
  function Child({ suspend }: { suspend: boolean }) {
    if (suspend) throw pending
    return <button>primary</button>
  }
  const tree = (suspend: boolean) => <React.Suspense fallback={<React.Fragment ref={ref}>
    <button>first fallback</button><section><button>last fallback</button></section>
  </React.Fragment>}><Child suspend={suspend} /></React.Suspense>
  render(tree(false))
  render(tree(true))
  ref.current.focusLast()
  expect(document.activeElement!.textContent).toBe('last fallback')
  ref.current.focus()
  expect(document.activeElement!.textContent).toBe('first fallback')
})

it('exposes a stable instance without adding a DOM wrapper and cleans up the ref', () => {
  const { render, container } = setup()
  const ref = React.createRef<any>()
  render(<React.Fragment ref={ref}><span>A</span><b>B</b></React.Fragment>)
  const instance = ref.current
  expect(instance).toBeTruthy()
  expect(container.innerHTML).toBe('<span>A</span><b>B</b>')
  render(<React.Fragment ref={ref}><em>C</em></React.Fragment>)
  expect(ref.current).toBe(instance)
  expect(instance.getRootNode()).toBe(document)
  render(null)
  expect(ref.current).toBe(null)
  expect(instance.getRootNode()).toBe(instance)
})

it('applies listeners only to first-level hosts, including component and portal children', () => {
  const { render, container } = setup()
  const portal = document.createElement('div')
  document.body.appendChild(portal)
  cleanups.push(() => portal.remove())
  const ref = React.createRef<any>()
  function Child() { return <section><button>nested</button></section> }
  render(<React.Fragment ref={ref}><Child />{createPortal(<button>portal</button>, portal)}</React.Fragment>)
  const targets: EventTarget[] = []
  ref.current.addEventListener('click', (event: Event) => targets.push(event.currentTarget!))
  container.querySelector('button')!.click()
  portal.querySelector('button')!.click()
  expect(targets).toEqual([container.querySelector('section'), portal.firstChild])
  expect((container.firstChild as any).reactFragments.has(ref.current)).toBe(true)
  expect((container.querySelector('button') as any).reactFragments).toBeUndefined()
})

it('updates listeners and ownership when a child component changes without rendering its fragment', () => {
  const { render, container } = setup()
  const ref = React.createRef<any>()
  let update!: (value: boolean) => void
  function Child() {
    const [changed, setChanged] = React.useState(false)
    update = setChanged
    return changed ? <b>B</b> : <span>A</span>
  }
  render(<React.Fragment ref={ref}><Child /></React.Fragment>)
  const listener = vi.fn()
  ref.current.addEventListener('click', listener)
  const previous = container.firstChild as HTMLElement
  flushSync(() => update(true))
  previous.click()
  ;(container.firstChild as HTMLElement).click()
  expect(listener).toHaveBeenCalledTimes(1)
  expect((previous as any).reactFragments.has(ref.current)).toBe(false)
  expect((container.firstChild as any).reactFragments.has(ref.current)).toBe(true)
})

it('normalizes capture options for listener deduplication and removal', () => {
  const { render, container } = setup()
  const ref = React.createRef<any>()
  render(<React.Fragment ref={ref}><button>A</button></React.Fragment>)
  const listener = vi.fn()
  ref.current.addEventListener('click', listener, true)
  ref.current.addEventListener('click', listener, { capture: true })
  ;(container.firstChild as HTMLElement).click()
  expect(listener).toHaveBeenCalledTimes(1)
  ref.current.removeEventListener('click', listener, { capture: true })
  ;(container.firstChild as HTMLElement).click()
  expect(listener).toHaveBeenCalledTimes(1)
})

it('implements once across the whole fragment, including future children', () => {
  const { render, container } = setup()
  const ref = React.createRef<any>()
  const view = (extra: boolean) => <React.Fragment ref={ref}><button>A</button><button>B</button>{extra && <button>C</button>}</React.Fragment>
  render(view(false))
  const listener = vi.fn()
  ref.current.addEventListener('click', listener, { once: true })
  for (const child of container.children) (child as HTMLElement).click()
  render(view(true))
  ;(container.lastChild as HTMLElement).click()
  expect(listener).toHaveBeenCalledTimes(1)
})

it('supports listener objects and AbortSignal across old and new children', () => {
  const { render, container } = setup()
  const ref = React.createRef<any>()
  const controller = new AbortController()
  const listener = { handleEvent: vi.fn() }
  render(<React.Fragment ref={ref}><button>A</button></React.Fragment>)
  ref.current.addEventListener('click', listener, { signal: controller.signal })
  ;(container.firstChild as HTMLElement).click()
  controller.abort()
  render(<React.Fragment ref={ref}><button>A</button><button>B</button></React.Fragment>)
  for (const child of container.children) (child as HTMLElement).click()
  ref.current.addEventListener('click', listener, { signal: controller.signal })
  ;(container.firstChild as HTMLElement).click()
  expect(listener.handleEvent).toHaveBeenCalledTimes(1)
})

it('dispatches once on the fragment and bubbles to its parent with cancellation', () => {
  const { render, container } = setup()
  const ref = React.createRef<any>()
  render(<div><React.Fragment ref={ref}><button>A</button><button>B</button></React.Fragment></div>)
  const calls: string[] = []
  container.firstChild!.addEventListener('custom', () => calls.push('parent'))
  ref.current.addEventListener('custom', (event: Event) => { calls.push('fragment'); event.preventDefault() })
  const html = container.innerHTML
  expect(ref.current.dispatchEvent(new Event('custom', { bubbles: true, cancelable: true }))).toBe(false)
  expect(calls).toEqual(['fragment', 'parent'])
  expect(container.innerHTML).toBe(html)
  calls.length = 0
  ref.current.dispatchEvent(new Event('custom'))
  expect(calls).toEqual(['fragment'])
})

it('handles empty fragment dispatch and getRootNode in a shadow root', () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const root = createRoot(shadow)
  const ref = React.createRef<any>()
  cleanups.push(() => { flushSync(() => root.unmount()); host.remove() })
  flushSync(() => root.render(<React.Fragment ref={ref} />))
  expect(ref.current.getRootNode()).toBe(shadow)
  expect(ref.current.getRootNode({ composed: true })).toBe(document)
  const listener = vi.fn()
  ref.current.addEventListener('custom', listener)
  ref.current.dispatchEvent(new Event('custom'))
  expect(listener).toHaveBeenCalledTimes(1)
  expect(shadow.childNodes.length).toBe(0)
})

it('focuses in depth-first order and blurs only focus within the fragment', () => {
  const { render, container } = setup()
  const ref = React.createRef<any>()
  render(<><button id="outside">outside</button><React.Fragment ref={ref}><section><button disabled>disabled</button><input id="first" /></section><div tabIndex={-1}><input id="last" /></div></React.Fragment></>)
  ref.current.focus({ preventScroll: true })
  expect(document.activeElement).toBe(container.querySelector('#first'))
  ref.current.focusLast()
  expect(document.activeElement).toBe(container.querySelector('#last'))
  ref.current.blur()
  expect(document.activeElement).toBe(document.body)
  ;(container.querySelector('#outside') as HTMLElement).focus()
  ref.current.blur()
  expect(document.activeElement).toBe(container.querySelector('#outside'))
})

it('observes only first-level elements and updates observers on child replacement', () => {
  const { render, container } = setup()
  const ref = React.createRef<any>()
  const observer = { observe: vi.fn(), unobserve: vi.fn() }
  render(<React.Fragment ref={ref}>text<span><i /></span></React.Fragment>)
  const first = container.querySelector('span')!
  ref.current.observeUsing(observer)
  expect(observer.observe.mock.calls).toEqual([[first]])
  render(<React.Fragment ref={ref}>text<b /></React.Fragment>)
  expect(observer.unobserve.mock.calls).toEqual([[first]])
  expect(observer.observe.mock.calls).toEqual([[first], [container.querySelector('b')]])
  ref.current.unobserveUsing(observer)
  expect(observer.unobserve.mock.calls).toEqual([[first], [container.querySelector('b')]])
})

it('maintains overlapping nested fragment ownership and ref cleanup', () => {
  const { render, container } = setup()
  const outer = React.createRef<any>()
  let inner: any
  const cleanup = vi.fn()
  const callback = vi.fn((instance: any) => { inner = instance; return cleanup })
  render(<React.Fragment ref={outer}><React.Fragment ref={callback}><button /></React.Fragment></React.Fragment>)
  const element = container.firstChild as any
  expect(element.reactFragments).toEqual(new Set([inner, outer.current]))
  render(null)
  expect(callback).toHaveBeenCalledTimes(1)
  expect(cleanup).toHaveBeenCalledTimes(1)
  expect(element.reactFragments.size).toBe(0)
})

it('compares direct children, descendants, siblings, ancestors, empty and unmanaged nodes', () => {
  const { render, container } = setup()
  const ref = React.createRef<any>()
  const empty = React.createRef<any>()
  render(<div><i id="before" /><React.Fragment ref={ref}><span id="first"><b id="deep" /></span><span id="last" /></React.Fragment><React.Fragment ref={empty} /><i id="after" /></div>)
  expect(ref.current.compareDocumentPosition(container.querySelector('#first'))).toBe(16)
  expect(ref.current.compareDocumentPosition(container.querySelector('#deep'))).toBe(16)
  expect(ref.current.compareDocumentPosition(container.querySelector('#last'))).toBe(16)
  expect(ref.current.compareDocumentPosition(container.querySelector('#before'))).toBe(2)
  expect(ref.current.compareDocumentPosition(container.querySelector('#after'))).toBe(4)
  expect(ref.current.compareDocumentPosition(container.firstChild)).toBe(10)
  expect(empty.current.compareDocumentPosition(container.querySelector('#before'))).toBe(34)
  expect(empty.current.compareDocumentPosition(container.querySelector('#after'))).toBe(36)
  expect(empty.current.compareDocumentPosition(container.firstChild)).toBe(40)
  const foreign = document.createElement('u')
  container.firstChild!.appendChild(foreign)
  expect(ref.current.compareDocumentPosition(foreign)).toBe(32)
})

it('scrolls all direct hosts in the correct order with empty sibling fallback', () => {
  const { render, container } = setup()
  const ref = React.createRef<any>()
  const empty = React.createRef<any>()
  render(<><React.Fragment ref={ref}><span>A</span><b>B</b></React.Fragment><React.Fragment ref={empty} /><i>C</i></>)
  const calls: Array<[string, boolean | undefined]> = []
  for (const element of container.children) element.scrollIntoView = (top?: boolean | ScrollIntoViewOptions) => calls.push([element.textContent!, top as boolean | undefined])
  ref.current.scrollIntoView()
  expect(calls.splice(0)).toEqual([['B', undefined], ['A', undefined]])
  ref.current.scrollIntoView(false)
  expect(calls.splice(0)).toEqual([['A', false], ['B', false]])
  empty.current.scrollIntoView()
  expect(calls.splice(0)).toEqual([['C', undefined]])
  empty.current.scrollIntoView(false)
  expect(calls.splice(0)).toEqual([['B', false]])
  expect(() => ref.current.scrollIntoView({ block: 'center' })).toThrow()
})

it('returns first-level element and text client rectangles in browser layout order', () => {
  const { render, container } = setup()
  const ref = React.createRef<any>()
  render(<React.Fragment ref={ref}><span>A</span>text<b>B</b></React.Fragment>)
  if (!Range.prototype.getClientRects) return
  const expected: DOMRect[] = []
  for (const child of container.childNodes) {
    if (child.nodeType === 3) {
      const range = document.createRange()
      range.selectNodeContents(child)
      expected.push(...range.getClientRects())
    } else expected.push(...(child as Element).getClientRects())
  }
  const rect = (value: DOMRect) => [value.x, value.y, value.width, value.height]
  expect(ref.current.getClientRects().map(rect)).toEqual(expected.map(rect))
})

it('keeps the same instance across ref replacement and detaches each callback exactly once', () => {
  const { render } = setup()
  const firstCleanup = vi.fn()
  const secondCleanup = vi.fn()
  const first = vi.fn((_instance: any) => firstCleanup)
  const second = vi.fn((_instance: any) => secondCleanup)
  render(<React.Fragment ref={first}><span /></React.Fragment>)
  const instance = first.mock.calls[0]![0]
  render(<React.Fragment ref={second}><span /></React.Fragment>)
  expect(firstCleanup).toHaveBeenCalledTimes(1)
  expect(second).toHaveBeenCalledTimes(1)
  expect(second).toHaveBeenCalledWith(instance)
  render(<React.Fragment><span /></React.Fragment>)
  expect(secondCleanup).toHaveBeenCalledTimes(1)
  render(null)
  expect(firstCleanup).toHaveBeenCalledTimes(1)
  expect(secondCleanup).toHaveBeenCalledTimes(1)
})

it('registers text nodes for events without treating them as observer elements', () => {
  const { render, container } = setup()
  const ref = React.createRef<any>()
  render(<React.Fragment ref={ref}>first<span />last</React.Fragment>)
  const listener = vi.fn()
  ref.current.addEventListener('custom', listener)
  container.firstChild!.dispatchEvent(new Event('custom'))
  container.lastChild!.dispatchEvent(new Event('custom'))
  expect(listener).toHaveBeenCalledTimes(2)
  render(<React.Fragment ref={ref}>changed<i />other</React.Fragment>)
  container.firstChild!.dispatchEvent(new Event('custom'))
  expect(listener).toHaveBeenCalledTimes(3)
})

it('preserves listeners through keyed moves without reattaching once listeners', () => {
  const { render, container } = setup()
  const ref = React.createRef<any>()
  const view = (keys: string[]) => <React.Fragment ref={ref}>{keys.map((key) => <button key={key}>{key}</button>)}</React.Fragment>
  render(view(['a', 'b', 'c']))
  const listener = vi.fn()
  ref.current.addEventListener('click', listener)
  const original = [...container.children]
  render(view(['c', 'b', 'a']))
  expect([...container.children]).toEqual(original.reverse())
  for (const child of container.children) (child as HTMLElement).click()
  expect(listener).toHaveBeenCalledTimes(3)
})

it('sets implementation-specific position for portal-displaced children', () => {
  const { render, container } = setup()
  const ref = React.createRef<any>()
  const portal = document.createElement('div')
  document.body.appendChild(portal)
  cleanups.push(() => portal.remove())
  render(<div><React.Fragment ref={ref}>{createPortal(<span />, portal)}</React.Fragment><i /></div>)
  expect(ref.current.compareDocumentPosition(portal.firstChild)).toBe(32)
  expect(ref.current.getRootNode()).toBe(document)
  expect(ref.current.compareDocumentPosition(container.querySelector('i'))).toBe(32)
})

it('hydrates an instance without replacing server nodes', async () => {
  const container = document.createElement('div')
  container.innerHTML = '<span>A</span><b>B</b>'
  document.body.appendChild(container)
  const original = [...container.childNodes]
  const ref = React.createRef<any>()
  let ready!: () => void
  const mounted = new Promise<void>((resolve) => { ready = resolve })
  function App() {
    React.useLayoutEffect(ready, [])
    return <React.Fragment ref={ref}><span>A</span><b>B</b></React.Fragment>
  }
  const errors: unknown[] = []
  const root = hydrateRoot(container, <App />, { onRecoverableError: (error) => errors.push(error) })
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  await mounted
  expect(errors).toEqual([])
  expect([...container.childNodes]).toEqual(original)
  expect((original[0] as any).reactFragments.has(ref.current)).toBe(true)
  const listener = vi.fn()
  ref.current.addEventListener('click', listener)
  ;(original[0] as HTMLElement).click()
  expect(listener).toHaveBeenCalledTimes(1)
})

it('runs fragment ref cleanup before deleting its DOM children', () => {
  const { render, container } = setup()
  const snapshots: unknown[] = []
  const ref = (instance: any) => () => snapshots.push([
    container.innerHTML,
    instance.getRootNode() === document,
    (container.firstChild as any)?.reactFragments?.has(instance),
  ])
  render(<React.Fragment ref={ref}><span>A</span></React.Fragment>)
  render(null)
  expect(snapshots).toEqual([['<span>A</span>', true, true]])
})

it('removes hidden Activity children from outer fragment listeners and restores them on reveal', () => {
  const { render, container } = setup()
  const ref = React.createRef<any>()
  const view = (mode: 'visible' | 'hidden') => <React.Fragment ref={ref}><React.Activity mode={mode}><button>A</button></React.Activity><button>B</button></React.Fragment>
  render(view('visible'))
  const listener = vi.fn()
  const instance = ref.current
  instance.addEventListener('click', listener)
  const first = container.firstChild as HTMLElement
  render(view('hidden'))
  first.click()
  ;(container.lastChild as HTMLElement).click()
  expect(listener).toHaveBeenCalledTimes(1)
  expect((first as any).reactFragments.has(instance)).toBe(false)
  render(view('visible'))
  expect(container.firstChild).toBe(first)
  first.click()
  expect(listener).toHaveBeenCalledTimes(2)
  expect((first as any).reactFragments.has(instance)).toBe(true)
})

it('delays IntersectionObserver removal to deliver exit records and flushes it on explicit unobserve', async () => {
  const { render, container } = setup()
  const ref = React.createRef<any>()
  const observer = { rootMargin: '0px', observe: vi.fn(), unobserve: vi.fn() }
  render(<React.Fragment ref={ref}><span /></React.Fragment>)
  const element = container.firstChild
  ref.current.observeUsing(observer)
  render(<React.Fragment ref={ref} />)
  expect(observer.unobserve).not.toHaveBeenCalled()
  ref.current.unobserveUsing(observer)
  expect(observer.unobserve.mock.calls).toEqual([[element]])
  if (typeof requestAnimationFrame === 'function') {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    expect(observer.unobserve).toHaveBeenCalledTimes(1)
  }
})

it('does not scroll surviving siblings through a retained unmounted instance', () => {
  const { render, container } = setup()
  const ref = React.createRef<any>()
  render(<><React.Fragment key="fragment" ref={ref}><span /></React.Fragment><button key="button" /></>)
  const instance = ref.current
  const scroll = vi.fn()
  ;(container.lastChild as Element).scrollIntoView = scroll
  render(<><button key="button" /></>)
  instance.scrollIntoView()
  expect(scroll).not.toHaveBeenCalled()
})
