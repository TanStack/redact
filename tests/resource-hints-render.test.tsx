import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRef, Suspense, use } from 'react'
import { flushSync, preinit, preload } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'

const roots: Root[] = []
let id = 0
function mount(node: any) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  flushSync(() => root.render(node))
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) flushSync(() => root.unmount())
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('resource hints with declarative resources', () => {
  it('reuses a preinitialized stylesheet when the same resource is rendered', () => {
    const href = `/reused-${++id}.css`
    preinit(href, { as: 'style', precedence: 'theme' })
    const original = document.querySelector(`link[href="${href}"]`)
    const root = mount(<><link rel="stylesheet" href={href} precedence="theme" /><b>ready</b></>)
    expect(document.querySelectorAll(`link[href="${href}"]`)).toHaveLength(1)
    expect(document.querySelector(`link[href="${href}"]`)).toBe(original)
    flushSync(() => root.unmount())
    roots.pop()
    expect(original?.isConnected).toBe(true)
  })

  it('reuses a preinitialized async script when that resource is rendered', () => {
    const src = `/reused-${++id}.js`
    preinit(src, { as: 'script' })
    const original = document.querySelector(`script[src="${src}"]`)
    const root = mount(<script src={src} async />)
    expect(document.querySelectorAll(`script[src="${src}"]`)).toHaveLength(1)
    expect(document.querySelector(`script[src="${src}"]`)).toBe(original)
    flushSync(() => root.unmount())
    roots.pop()
    expect(original?.isConnected).toBe(true)
  })

  it('adopts matching preload options when rendering an async script', () => {
    const src = `/adopted-${++id}.js`
    preload(src, { as: 'script', crossOrigin: 'use-credentials', integrity: 'sha256-test', referrerPolicy: 'no-referrer' })
    mount(<script src={src} async />)
    const script = document.querySelector(`script[src="${src}"]`)!
    expect(script.getAttribute('crossorigin')).toBe('use-credentials')
    expect(script.getAttribute('integrity')).toBe('sha256-test')
    expect(script.getAttribute('referrerpolicy')).toBe('no-referrer')
  })

  it('shares repeated declarative resources and retains them after unmount', () => {
    const src = `/shared-${++id}.js`
    const first = createRef<HTMLScriptElement>(), second = createRef<HTMLScriptElement>()
    const root = mount(<><script src={src} async ref={first} /><script src={src} async ref={second} /></>)
    expect(document.querySelectorAll(`script[src="${src}"]`)).toHaveLength(1)
    expect(first.current).toBe(second.current)
    const script = first.current!
    expect(script.parentNode).toBe(document.head)
    flushSync(() => root.unmount())
    roots.pop()
    expect(script.isConnected).toBe(true)
    expect(first.current).toBeNull()
    expect(second.current).toBeNull()
  })

  it('keeps the first committed resource props while updating refs', () => {
    const src = `/stable-${++id}.js`
    const first = vi.fn(), second = vi.fn()
    const root = mount(<script src={src} async integrity="first" ref={first} />)
    const node = document.querySelector(`script[src="${src}"]`)
    flushSync(() => root.render(<script src={src} async integrity="second" ref={second} />))
    expect(document.querySelector(`script[src="${src}"]`)).toBe(node)
    expect(node?.getAttribute('integrity')).toBe('first')
    expect(first.mock.calls.map(call => call[0])).toEqual([node, null])
    expect(second.mock.calls.map(call => call[0])).toEqual([node])
  })

  it('retains the original ref node when href and ref change on the same fiber, matching React', () => {
    const first = `/first-${++id}.css`, second = `/second-${id}.css`
    document.head.innerHTML = `<link rel="stylesheet" href="${first}" data-precedence="theme"><link rel="stylesheet" href="${second}" data-precedence="theme">`
    const firstRef = createRef<HTMLLinkElement>(), secondRef = createRef<HTMLLinkElement>()
    const root = mount(<link rel="stylesheet" href={first} precedence="theme" ref={firstRef} />)
    const original = firstRef.current
    flushSync(() => root.render(<link rel="stylesheet" href={second} precedence="theme" ref={secondRef} />))
    // React acquires the new resource, but keeps this fiber's original stateNode.
    expect(secondRef.current).toBe(original)
    expect(firstRef.current).toBeNull()
    expect(original?.isConnected).toBe(true)
    expect(document.querySelector(`link[href="${second}"]`)?.isConnected).toBe(true)
  })

  it('retains a stable object ref on the original resource when only href changes', () => {
    const first = `/stable-first-${++id}.css`, second = `/stable-second-${id}.css`
    document.head.innerHTML = `<link rel="stylesheet" href="${first}" data-precedence="theme"><link rel="stylesheet" href="${second}" data-precedence="theme">`
    const ref = createRef<HTMLLinkElement>()
    const root = mount(<link rel="stylesheet" href={first} precedence="theme" ref={ref} />)
    const original = ref.current
    flushSync(() => root.render(<link rel="stylesheet" href={second} precedence="theme" ref={ref} />))
    expect(ref.current).toBe(original)
  })

  it('attaches a ref to the new resource after a key remount', () => {
    const first = `/keyed-first-${++id}.css`, second = `/keyed-second-${id}.css`
    document.head.innerHTML = `<link rel="stylesheet" href="${first}" data-precedence="theme"><link rel="stylesheet" href="${second}" data-precedence="theme">`
    const ref = createRef<HTMLLinkElement>()
    const root = mount(<link key="first" rel="stylesheet" href={first} precedence="theme" ref={ref} />)
    const original = ref.current
    flushSync(() => root.render(<link key="second" rel="stylesheet" href={second} precedence="theme" ref={ref} />))
    expect(ref.current?.getAttribute('href')).toBe(second)
    expect(ref.current).not.toBe(original)
  })

  it('hoists and deduplicates inline styles without emitting href or precedence attributes', () => {
    const href = `inline-${++id}`
    const first = createRef<HTMLStyleElement>(), second = createRef<HTMLStyleElement>()
    mount(<><style href={href} precedence="theme" ref={first}>{'body { color: red }'}</style><style href={href} precedence="theme" ref={second}>ignored</style></>)
    expect(first.current).toBe(second.current)
    expect(first.current?.parentNode).toBe(document.head)
    expect(first.current?.getAttribute('data-href')).toBe(href)
    expect(first.current?.getAttribute('data-precedence')).toBe('theme')
    expect(first.current?.hasAttribute('href')).toBe(false)
    expect(first.current?.hasAttribute('precedence')).toBe(false)
    expect(first.current?.textContent).toBe('body { color: red }')
  })

  it.each([
    { disabled: false },
    { disabled: true },
    { itemProp: 'stylesheet' },
    { onLoad: () => {} },
    { onError: () => {} },
  ])('keeps a stylesheet with explicit ownership props local: %j', props => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const href = `/local-${++id}.css`
    mount(<link rel="stylesheet" href={href} precedence="theme" {...props} />)
    const link = document.querySelector(`link[href="${href}"]`)!
    expect(link.parentNode).not.toBe(document.head)
    expect(document.head.querySelector(`link[href="${href}"]`)).toBeNull()
  })

  it.each([{ async: false }, { async: true, onLoad: () => {} }, { async: true, itemProp: 'script' }])('keeps a non-shareable script local: %j', props => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const src = `/local-${++id}.js`
    mount(<script src={src} {...props} />)
    expect(document.querySelector(`script[src="${src}"]`)!.parentNode).not.toBe(document.head)
  })

  it('does not hoist resources from SVG content', () => {
    const href = `/svg-${++id}.css`
    mount(<svg><link rel="stylesheet" href={href} precedence="theme" /></svg>)
    const link = document.querySelector(`link[href="${href}"]`)!
    expect(link.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(link.parentElement?.tagName).toBe('svg')
  })

  it('does not insert resources from an abandoned suspended render', () => {
    const src = `/abandoned-${++id}.js`, href = `/abandoned-${id}.css`
    const pending = new Promise<void>(() => {})
    function Child() { use(pending); return null }
    mount(<Suspense fallback={<i>loading</i>}><script src={src} async /><style href={href} precedence="theme">body {'{color:red}'}</style><Child /></Suspense>)
    expect(document.querySelector(`script[src="${src}"]`)).toBeNull()
    expect(document.querySelector(`style[data-href="${href}"]`)).toBeNull()
    expect(document.body.textContent).toBe('loading')
  })
})
