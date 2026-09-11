import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRef, Suspense, use, type ReactNode } from 'react'
import { createPortal, flushSync, preinit, preinitModule, preload, preloadModule } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'

const native = typeof window !== 'undefined' && !navigator.userAgent.includes('jsdom')
const nodes: Element[] = []
const globals: string[] = []
const roots: Root[] = []
let sequence = 0
function key() {
  const name = `__resource_hint_${Date.now()}_${sequence++}`
  globals.push(name)
  return name
}
function script(name: string, module = false) {
  return 'data:text/javascript,' + encodeURIComponent(`globalThis[${JSON.stringify(name)}] = (globalThis[${JSON.stringify(name)}] || 0) + 1;${module ? 'export {}' : ''}`)
}
function resource(href: string, tag: string) {
  const node = Array.from(document.head.querySelectorAll(tag)).find(node => node.getAttribute(tag === 'script' ? 'src' : 'href') === href)!
  expect(node).toBeDefined()
  nodes.push(node)
  return node
}
function loaded(node: Element) {
  return new Promise<void>((resolve, reject) => {
    node.addEventListener('load', () => resolve(), { once: true })
    node.addEventListener('error', () => reject(new Error('Resource failed to load')), { once: true })
  })
}

function mount(container: Element | DocumentFragment, children: ReactNode) {
  const root = createRoot(container)
  roots.push(root)
  flushSync(() => root.render(children))
  return root
}

function shadowContainer() {
  const host = document.createElement('div')
  document.body.append(host)
  nodes.push(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const container = document.createElement('main')
  shadow.append(container)
  return { shadow, container }
}

afterEach(() => {
  for (const root of roots.splice(0)) flushSync(() => root.unmount())
  for (const node of nodes.splice(0)) node.remove()
  for (const name of globals.splice(0)) delete (globalThis as any)[name]
})

describe.runIf(native)('resource hints in Chrome', () => {
  it('executes a preinitialized classic script once, including after removal', async () => {
    const name = key(), href = script(name)
    preinit(href, { as: 'script' })
    const node = resource(href, 'script')
    const ready = loaded(node)
    preinit(href, { as: 'script' })
    await ready
    expect((globalThis as any)[name]).toBe(1)
    node.remove()
    preinit(href, { as: 'script' })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect((globalThis as any)[name]).toBe(1)
    expect(Array.from(document.scripts).some(node => node.src === href)).toBe(false)
  })

  it('executes a preinitialized ES module with module parsing', async () => {
    const name = key(), href = script(name, true)
    preinitModule(href)
    const node = resource(href, 'script')
    await loaded(node)
    expect(node.getAttribute('type')).toBe('module')
    expect((globalThis as any)[name]).toBe(1)
  })

  it('fetches a classic preload without executing it, then executes preinit', async () => {
    const name = key(), href = script(name)
    preload(href, { as: 'script' })
    await loaded(resource(href, 'link'))
    expect((globalThis as any)[name]).toBeUndefined()
    preinit(href, { as: 'script' })
    await loaded(resource(href, 'script'))
    expect((globalThis as any)[name]).toBe(1)
  })

  it('fetches a module preload without evaluating the module', async () => {
    const name = key(), href = script(name, true)
    preloadModule(href)
    await loaded(resource(href, 'link'))
    expect((globalThis as any)[name]).toBeUndefined()
    preinitModule(href)
    await loaded(resource(href, 'script'))
    expect((globalThis as any)[name]).toBe(1)
  })

  it('applies stylesheet precedence grouping to the actual browser cascade', async () => {
    const name = key()
    const css = (color: string) => 'data:text/css,' + encodeURIComponent(`.${name} { color: ${color}; }`)
    const high1 = css('red'), low = css('blue'), high2 = css('green')
    preinit(high1, { as: 'style', precedence: 'high' })
    const first = loaded(resource(high1, 'link'))
    preinit(low, { as: 'style', precedence: 'low' })
    const second = loaded(resource(low, 'link'))
    preinit(high2, { as: 'style', precedence: 'high' })
    const third = loaded(resource(high2, 'link'))
    await Promise.all([first, second, third])
    const element = document.createElement('p')
    element.className = name
    document.body.append(element)
    nodes.push(element)
    expect(getComputedStyle(element).color).toBe('rgb(0, 0, 255)')
  })

  it('does not execute a preinitialized script twice when it is rendered later', async () => {
    const name = key(), href = script(name)
    preinit(href, { as: 'script' })
    await loaded(resource(href, 'script'))
    const container = document.createElement('div')
    document.body.append(container)
    nodes.push(container)
    const root = createRoot(container)
    roots.push(root)
    flushSync(() => root.render(<script src={href} async />))
    await new Promise(resolve => setTimeout(resolve, 30))
    expect((globalThis as any)[name]).toBe(1)
    expect(Array.from(document.scripts).filter(node => node.src === href)).toHaveLength(1)
  })

  it('does not execute a script from an abandoned suspended render', async () => {
    const name = key(), href = script(name)
    const pending = new Promise<void>(() => {})
    function Child() { use(pending); return null }
    const container = document.createElement('div')
    document.body.append(container)
    nodes.push(container)
    const root = createRoot(container)
    roots.push(root)
    flushSync(() => root.render(<Suspense fallback={<i>waiting</i>}><script src={href} async /><Child /></Suspense>))
    await new Promise(resolve => setTimeout(resolve, 30))
    expect((globalThis as any)[name]).toBeUndefined()
    expect(Array.from(document.scripts).some(node => node.src === href)).toBe(false)
    expect(container.textContent).toBe('waiting')
  })

  it('applies declarative inline styles from the head and retains them after unmount', () => {
    const name = key()
    const container = document.createElement('div')
    document.body.append(container)
    nodes.push(container)
    const root = createRoot(container)
    roots.push(root)
    flushSync(() => root.render(<><style href={name} precedence="theme">{`.${name} { color: rgb(10, 20, 30) }`}</style><p className={name}>styled</p></>))
    const style = document.head.querySelector(`style[data-href="${name}"]`)!
    nodes.push(style)
    expect(style).toBeDefined()
    expect(getComputedStyle(container.querySelector('p')!).color).toBe('rgb(10, 20, 30)')
    flushSync(() => root.unmount())
    roots.pop()
    expect(style.isConnected).toBe(true)
  })

  it('keeps computed inline CSS isolated across the document and shadow roots, including portals', () => {
    const name = key(), first = shadowContainer(), second = shadowContainer()
    const container = document.createElement('div')
    document.body.append(container)
    nodes.push(container)
    const documentRef = createRef<HTMLStyleElement>(), firstRef = createRef<HTMLStyleElement>(), secondRef = createRef<HTMLStyleElement>()
    mount(container, <>
      <style href={name} precedence="theme" ref={documentRef}>{`.${name} { color: rgb(10, 20, 30) }`}</style>
      <p className={name}>document</p>
      {createPortal(<section>
        <style href={name} precedence="theme" ref={secondRef}>{`.${name} { color: rgb(70, 80, 90) }`}</style>
        <p className={name}>portal</p>
      </section>, second.container)}
    </>)
    const direct = mount(first.container, <section>
      <style href={name} precedence="theme" ref={firstRef}>{`.${name} { color: rgb(40, 50, 60) }`}</style>
      <p className={name}>direct</p>
    </section>)
    const sibling = document.createElement('aside')
    first.shadow.append(sibling)
    const repeatedRef = createRef<HTMLStyleElement>()
    const repeated = mount(sibling, <style href={name} precedence="theme" ref={repeatedRef}>{`.${name} { color: black }`}</style>)
    const style = firstRef.current!
    nodes.push(documentRef.current!)
    expect(documentRef.current?.parentNode).toBe(document.head)
    expect(style.parentNode).toBe(first.shadow)
    expect(secondRef.current?.parentNode).toBe(second.shadow)
    expect(new Set([documentRef.current, style, secondRef.current]).size).toBe(3)
    expect(repeatedRef.current).toBe(style)
    expect(first.shadow.querySelectorAll('style[data-precedence]')).toHaveLength(1)
    expect(getComputedStyle(container.querySelector('p')!).color).toBe('rgb(10, 20, 30)')
    expect(getComputedStyle(first.shadow.querySelector('p')!).color).toBe('rgb(40, 50, 60)')
    expect(getComputedStyle(second.shadow.querySelector('p')!).color).toBe('rgb(70, 80, 90)')
    for (const root of [direct, repeated]) {
      flushSync(() => root.unmount())
      roots.splice(roots.indexOf(root), 1)
    }
    const retained = document.createElement('p')
    retained.className = name
    first.shadow.append(retained)
    expect(style.isConnected).toBe(true)
    expect(getComputedStyle(retained).color).toBe('rgb(40, 50, 60)')
  })

  it('loads a shadow-local stylesheet in each shadow root even when the document preinitialized its URL', async () => {
    const name = key(), first = shadowContainer(), second = shadowContainer()
    const href = 'data:text/css,' + encodeURIComponent(`.${name} { border-top: 7px solid rgb(12, 34, 56) }`)
    preinit(href, { as: 'style', precedence: 'theme' })
    const outside = resource(href, 'link')
    await loaded(outside)
    const firstRef = createRef<HTMLLinkElement>(), secondRef = createRef<HTMLLinkElement>()
    const root = mount(first.container, <section>
      <link rel="stylesheet" href={href} precedence="theme" ref={firstRef} />
      <p className={name}>first</p>
    </section>)
    mount(second.container, <section>
      <link rel="stylesheet" href={href} precedence="theme" ref={secondRef} />
      <p className={name}>second</p>
    </section>)
    await vi.waitFor(() => {
      expect(firstRef.current?.parentNode).toBe(first.shadow)
      expect(secondRef.current?.parentNode).toBe(second.shadow)
      expect(getComputedStyle(first.shadow.querySelector('p')!).borderTopWidth).toBe('7px')
      expect(getComputedStyle(second.shadow.querySelector('p')!).borderTopWidth).toBe('7px')
    })
    const style = firstRef.current!
    expect(new Set([outside, style, secondRef.current]).size).toBe(3)
    expect(outside.parentNode).toBe(document.head)
    expect(first.shadow.querySelectorAll('link[rel="stylesheet"]')).toHaveLength(1)
    expect(second.shadow.querySelectorAll('link[rel="stylesheet"]')).toHaveLength(1)
    flushSync(() => root.unmount())
    roots.splice(roots.indexOf(root), 1)
    const retained = document.createElement('p')
    retained.className = name
    first.shadow.append(retained)
    expect(style.isConnected).toBe(true)
    expect(getComputedStyle(retained).borderTopWidth).toBe('7px')
    expect(getComputedStyle(retained).borderTopColor).toBe('rgb(12, 34, 56)')
  })
})
