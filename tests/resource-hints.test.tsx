import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLayoutEffect } from 'react'
import {
  flushSync,
  preconnect,
  prefetchDNS,
  preinit,
  preinitModule,
  preload,
  preloadModule,
} from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'

let sequence = 0
const url = () => `https://resource.test/${++sequence}`
const attrs = (node: Element) => Object.fromEntries(Array.from(node.attributes, ({ name, value }) => [name, value]))
const head = () => Array.from(document.head.querySelectorAll('link,script,style'))
const roots: Root[] = []

// Chrome's test page starts with runner resources, unlike the jsdom fixture.
beforeEach(() => { document.head.innerHTML = '' })

afterEach(() => {
  for (const root of roots.splice(0)) flushSync(() => root.unmount())
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('resource hint APIs', () => {
  it('creates and deduplicates DNS and connection hints independently', () => {
    const href = url()
    expect(prefetchDNS(href)).toBeUndefined()
    prefetchDNS(href)
    expect(preconnect(href)).toBeUndefined()
    preconnect(href)
    expect(head().map(attrs)).toEqual([
      { rel: 'dns-prefetch', href },
      { rel: 'preconnect', href },
    ])
  })

  it('normalizes connection credentials and keeps distinct fetch modes', () => {
    const href = url()
    preconnect(href)
    preconnect(href, { crossOrigin: 'anonymous' })
    preconnect(href, { crossOrigin: 'invalid' } as any)
    preconnect(href, { crossOrigin: 'use-credentials' })
    preconnect(href, { crossOrigin: 'use-credentials' })
    expect(head().map(attrs)).toEqual([
      { rel: 'preconnect', href },
      { rel: 'preconnect', href, crossorigin: '' },
      { rel: 'preconnect', href, crossorigin: 'use-credentials' },
    ])
  })

  it('keeps connection and preload identities separate while adopting only matching resource options', () => {
    const href = url()
    for (let attempt = 0; attempt < 2; attempt++) {
      prefetchDNS(href)
      preconnect(href, { crossOrigin: 'use-credentials' })
      preload(href, { as: 'fetch', crossOrigin: 'use-credentials' })
      preload(href, { as: 'script', crossOrigin: 'anonymous', integrity: 'script' })
      preinit(href, { as: 'script' })
    }
    expect(head().map(attrs)).toEqual([
      { rel: 'dns-prefetch', href },
      { rel: 'preconnect', href, crossorigin: 'use-credentials' },
      { rel: 'preload', as: 'fetch', href, crossorigin: 'use-credentials' },
      { rel: 'preload', as: 'script', href, crossorigin: '', integrity: 'script' },
      { src: href, async: '', crossorigin: '', integrity: 'script' },
    ])
  })

  it('reuses connection hints already in the document', () => {
    const href = url()
    document.head.innerHTML = `<link rel="dns-prefetch" href="${href}"><link rel="preconnect" href="${href}" crossorigin="use-credentials">`
    prefetchDNS(href)
    preconnect(href)
    preconnect(href, { crossOrigin: 'use-credentials' })
    expect(head()).toHaveLength(2)
  })

  it('does not read unsupported preconnect option keys', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const href = url()
    preconnect(href, { get ['']() { throw new Error('unsupported option') } } as any)
    expect(head().map(attrs)).toEqual([{ rel: 'preconnect', href }])
  })

  it('preloads with supported string attributes only', () => {
    const href = url()
    expect(preload(href, {
      as: 'fetch', crossOrigin: 'use-credentials', integrity: 'sha256-first', nonce: 'secret',
      type: 'application/json', fetchPriority: 'high', referrerPolicy: 'no-referrer',
      media: '(min-width: 800px)', ignored: 'no', onLoad: () => {},
    } as any)).toBeUndefined()
    expect(head().map(attrs)).toEqual([{
      rel: 'preload', href, as: 'fetch', crossorigin: 'use-credentials', integrity: 'sha256-first',
      nonce: 'secret', type: 'application/json', fetchpriority: 'high', referrerpolicy: 'no-referrer', media: '(min-width: 800px)',
    }])
  })

  it('forces anonymous font requests even when credentials are requested', () => {
    const href = url()
    preload(href, { as: 'font', crossOrigin: 'use-credentials' })
    expect(attrs(head()[0]!)).toEqual({ rel: 'preload', href, as: 'font', crossorigin: '' })
  })

  it('ignores non-string optional attributes without coercing them', () => {
    const href = url()
    const forbidden = { toString() { throw new Error('must not coerce options') } }
    preload(href, { as: 'fetch', crossOrigin: forbidden, integrity: 1, nonce: forbidden, type: false, fetchPriority: forbidden, referrerPolicy: forbidden } as any)
    expect(attrs(head()[0]!)).toEqual({ rel: 'preload', href, as: 'fetch' })
  })

  it('keeps the first preload options and deduplicates after removal', () => {
    const href = url()
    preload(href, { as: 'script', integrity: 'first' })
    preload(href, { as: 'script', integrity: 'second' })
    expect(head()).toHaveLength(1)
    expect(head()[0]!.getAttribute('integrity')).toBe('first')
    head()[0]!.remove()
    preload(href, { as: 'script' })
    expect(head()).toHaveLength(0)
  })

  it('treats non-script resource destinations independently', () => {
    const href = url()
    preload(href, { as: 'fetch' })
    preload(href, { as: 'image' })
    preload(href, { as: 'style' })
    expect(head().map(node => node.getAttribute('as'))).toEqual(['fetch', 'image', 'style'])
  })

  it('deduplicates responsive images by srcset and sizes, without a fallback href', () => {
    const first = url(), second = url()
    const imageSrcSet = `${first} 1x, ${second} 2x`
    preload(first, { as: 'image', imageSrcSet, imageSizes: '100vw' })
    preload(second, { as: 'image', imageSrcSet, imageSizes: '100vw' })
    preload(first, { as: 'image', imageSrcSet, imageSizes: '50vw' })
    expect(head().map(attrs)).toEqual([
      { rel: 'preload', as: 'image', imagesrcset: imageSrcSet, imagesizes: '100vw' },
      { rel: 'preload', as: 'image', imagesrcset: imageSrcSet, imagesizes: '50vw' },
    ])
  })

  it('reuses existing preload tags and async scripts or stylesheets', () => {
    const image = url(), script = url(), style = url()
    document.head.innerHTML = `<link rel="preload" as="image" href="${image}"><script async src="${script}"></script><link rel="stylesheet" href="${style}">`
    preload(image, { as: 'image' })
    preload(script, { as: 'script' })
    preload(style, { as: 'style' })
    expect(head()).toHaveLength(3)
  })

  it('does not confuse ordinary scripts with async resources', () => {
    const href = url()
    document.head.innerHTML = `<script src="${href}"></script>`
    preload(href, { as: 'script' })
    expect(head()).toHaveLength(2)
    expect(attrs(head()[1]!)).toEqual({ rel: 'preload', as: 'script', href })
  })

  it('preinitializes classic scripts immediately with filtered options', () => {
    const href = url()
    expect(preinit(href, { as: 'script', nonce: 'secret', integrity: 'sha256-test', crossOrigin: 'anonymous', fetchPriority: 'high', referrerPolicy: 'no-referrer' } as any)).toBeUndefined()
    preinit(href, { as: 'script', nonce: 'other' })
    expect(head().map(attrs)).toEqual([{
      src: href, async: '', nonce: 'secret', integrity: 'sha256-test', crossorigin: '', fetchpriority: 'high',
    }])
  })

  it('does not execute a preinitialized script again after its node is removed', () => {
    const href = url()
    preinit(href, { as: 'script' })
    head()[0]!.remove()
    preinit(href, { as: 'script' })
    preinitModule(href)
    expect(head()).toHaveLength(0)
  })

  it('preinitializes stylesheets with default precedence and no unsupported nonce', () => {
    const href = url()
    preinit(href, { as: 'style', nonce: 'not-forwarded', crossOrigin: 'use-credentials', integrity: 'sha256-style', fetchPriority: 'low' })
    preinit(href, { as: 'style', precedence: 'other' })
    expect(head().map(attrs)).toEqual([{
      rel: 'stylesheet', href, 'data-precedence': 'default', crossorigin: 'use-credentials', integrity: 'sha256-style', fetchpriority: 'low',
    }])
  })

  it('groups stylesheet precedence by first appearance, not by its label', () => {
    const high1 = url(), low = url(), high2 = url(), last = url()
    preinit(high1, { as: 'style', precedence: 'high' })
    preinit(low, { as: 'style', precedence: 'low' })
    preinit(high2, { as: 'style', precedence: 'high' })
    preinit(last, { as: 'style', precedence: 'custom' })
    expect(head().map(node => node.getAttribute('href'))).toEqual([high1, high2, low, last])
  })

  it('respects existing managed style groups and leaves unrelated head nodes in place', () => {
    const first = url(), second = url()
    document.head.innerHTML = '<meta name="test" content="before"><style data-precedence="theme">body { color: red }</style><meta name="after">'
    preinit(first, { as: 'style', precedence: 'theme' })
    preinit(second, { as: 'style', precedence: 'last' })
    expect(Array.from(document.head.children, node => node.tagName)).toEqual(['META', 'STYLE', 'LINK', 'LINK', 'META'])
    expect(head().map(node => node.getAttribute('href'))).toEqual([null, first, second])
  })

  it('inserts the first stylesheet ahead of unrelated head nodes', () => {
    document.head.innerHTML = '<meta name="test"><title>test</title>'
    preinit(url(), { as: 'style' })
    expect(document.head.firstElementChild?.tagName).toBe('LINK')
  })

  it('adopts script preload integrity and request options unless explicitly replaced', () => {
    const href = url()
    preload(href, { as: 'script', crossOrigin: 'use-credentials', integrity: 'preloaded', referrerPolicy: 'no-referrer', nonce: 'not-adopted', fetchPriority: 'low' })
    preinit(href, { as: 'script', crossOrigin: 'anonymous', fetchPriority: 'high' })
    expect(attrs(head()[1]!)).toEqual({ src: href, async: '', crossorigin: '', integrity: 'preloaded', referrerpolicy: 'no-referrer', fetchpriority: 'high' })
  })

  it('adopts stylesheet preload request options but not integrity or nonce', () => {
    const href = url()
    preload(href, { as: 'style', crossOrigin: 'use-credentials', integrity: 'not-adopted', referrerPolicy: 'no-referrer', nonce: 'not-adopted' })
    preinit(href, { as: 'style' })
    const style = document.head.querySelector('link[rel="stylesheet"]')!
    expect(attrs(style)).toEqual({ rel: 'stylesheet', href, 'data-precedence': 'default', crossorigin: 'use-credentials', referrerpolicy: 'no-referrer' })
  })

  it('preloads modules with an implicit script destination and accepted options', () => {
    const href = url()
    preloadModule(href, { as: 'script', crossOrigin: 'anonymous', integrity: 'sha256-module', nonce: 'secret', fetchPriority: 'high' } as any)
    preloadModule(href)
    expect(head().map(attrs)).toEqual([{ rel: 'modulepreload', href, crossorigin: '', integrity: 'sha256-module', nonce: 'secret', fetchpriority: 'high' }])
  })

  it('shares deduplication between classic and module script preloads', () => {
    const first = url(), second = url()
    preload(first, { as: 'script' })
    preloadModule(first)
    preloadModule(second)
    preload(second, { as: 'script' })
    expect(head().map(node => node.getAttribute('rel'))).toEqual(['preload', 'modulepreload'])
  })

  it('preinitializes modules and adopts matching module preload options', () => {
    const href = url()
    preloadModule(href, { crossOrigin: 'use-credentials', integrity: 'preloaded', nonce: 'not-adopted' })
    preinitModule(href, { nonce: 'module-nonce', fetchPriority: 'high' } as any)
    preinitModule(href)
    preinit(href, { as: 'script' })
    expect(attrs(head()[1]!)).toEqual({ src: href, type: 'module', async: '', crossorigin: 'use-credentials', integrity: 'preloaded', nonce: 'module-nonce', fetchpriority: 'high' })
    expect(head()).toHaveLength(2)
  })

  it('suppresses preloads after matching resources have been initialized', () => {
    const script = url(), module = url(), style = url()
    preinit(script, { as: 'script' })
    preinitModule(module)
    preinit(style, { as: 'style' })
    preload(script, { as: 'script' })
    preloadModule(module)
    preload(style, { as: 'style' })
    expect(head()).toHaveLength(3)
  })

  it('supports selector-sensitive URL characters without duplicate nodes', () => {
    const href = `${url()}?q="[value]\\x\nend`
    prefetchDNS(href)
    prefetchDNS(href)
    preload(href, { as: 'script' })
    preload(href, { as: 'script' })
    preinit(href, { as: 'script' })
    expect(head()).toHaveLength(3)
    expect(head()[0]!.getAttribute('href')).toBe(href)
    expect(head()[2]!.getAttribute('src')).toBe(href)
  })

  it('blocks javascript resource URLs at the DOM sink', () => {
    const href = '\tJaVa\nScRiPt:alert(1)'
    const blocked = "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')"
    preload(href, { as: 'script' })
    preinit(href, { as: 'script' })
    expect(head().map(node => node.getAttribute(node.tagName === 'SCRIPT' ? 'src' : 'href'))).toEqual([blocked, blocked])
  })

  it('works during render, layout effects and events, and persists after unmount', () => {
    const renderURL = url(), effectURL = url(), eventURL = url()
    function App() {
      preload(renderURL, { as: 'fetch' })
      useLayoutEffect(() => preconnect(effectURL), [])
      return <button onClick={() => prefetchDNS(eventURL)}>load</button>
    }
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)
    flushSync(() => root.render(<App />))
    container.querySelector('button')!.click()
    flushSync(() => root.unmount())
    roots.pop()
    expect(head().map(node => node.getAttribute('href'))).toEqual([renderURL, effectURL, eventURL])
  })

  it('ignores empty or invalid arguments instead of making malformed requests', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const bad of ['', null, undefined, 1, {}, () => {}]) {
      prefetchDNS(bad as any)
      preconnect(bad as any)
      preload(bad as any, { as: 'script' })
      preinit(bad as any, { as: 'style' })
      preloadModule(bad as any)
      preinitModule(bad as any)
    }
    preload(url(), null as any)
    preload(url(), { as: '' } as any)
    preinit(url(), { as: 'image' } as any)
    preinitModule(url(), { as: 'style' } as any)
    expect(head()).toHaveLength(0)
  })
})
