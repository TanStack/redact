import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import * as commit from '../packages/redact/src/dom/commit'

const cleanup: Array<() => void> = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const fn of cleanup.splice(0)) fn()
})

function fixture(element: React.ReactNode) {
  const container = document.createElement('div')
  container.innerHTML = renderToString(element)
  document.body.appendChild(container)
  const original = container.firstChild
  const errors: unknown[] = []
  const hydrate = (client = element) => {
    const root = hydrateRoot(container, client, { onRecoverableError: error => errors.push(error) })
    cleanup.push(() => { root.unmount(); container.remove() })
    return { original, errors, container }
  }
  return { hydrate }
}

describe('hydration attribute comparison', () => {
  it('adopts data, aria and enumerated attributes without scratch elements', () => {
    const { hydrate } = fixture(
      <div data-count={0} data-empty="" data-enabled={false} aria-hidden={false}
        contentEditable={false} draggable={true} spellCheck={false} />,
    )
    const create = vi.spyOn(document, 'createElement')
    const mutation = vi.spyOn(commit, 'queueMutation')
    const property = vi.spyOn(commit, 'queueProp')
    const { original, errors, container } = hydrate()
    expect(errors).toEqual([])
    expect(container.firstChild).toBe(original)
    expect(create).not.toHaveBeenCalled()
    expect(mutation).not.toHaveBeenCalled()
    expect(property).not.toHaveBeenCalled()
    expect((original as Element).getAttribute('data-enabled')).toBe('false')
  })

  it.each(['src', 'srcSet'])('still detects a mismatched img %s', name => {
    const { errors } = fixture(React.createElement('img', { [name]: '/first' }))
      .hydrate(React.createElement('img', { [name]: '/second' }))
    expect(errors.length).toBeGreaterThan(0)
  })

  it('keeps SVG attribute names and boolean string values', () => {
    const { hydrate } = fixture(<svg data-count={3} aria-hidden={true}><g data-state="&<>" /></svg>)
    const create = vi.spyOn(document, 'createElementNS')
    const { original, errors, container } = hydrate()
    expect(errors).toEqual([])
    expect(container.firstChild).toBe(original)
    expect(create).not.toHaveBeenCalled()
  })

  it.each(['data-state', 'aria-label', 'contentEditable'])('still rejects a mismatched %s', name => {
    const server = React.createElement('div', { [name]: 'first' })
    const client = React.createElement('div', { [name]: 'second' })
    const { original, errors, container } = fixture(server).hydrate(client)
    expect(errors.length).toBeGreaterThan(0)
    expect(container.firstChild).not.toBe(original)
  })

  it('distinguishes missing attributes from empty strings and false', () => {
    const { errors } = fixture(<div />).hydrate(<div data-empty="" aria-hidden={false} />)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('keeps bare data and aria prefixes on the normal attribute path', () => {
    const container = document.createElement('div')
    container.innerHTML = '<div data-=""></div>'
    const original = container.firstChild
    const errors: unknown[] = []
    const root = hydrateRoot(container, React.createElement('div', { 'data-': true, 'aria-': false }), {
      onRecoverableError: error => errors.push(error),
    })
    cleanup.push(() => root.unmount())
    expect(errors).toEqual([])
    expect(container.firstChild).toBe(original)
    expect((original as Element).getAttribute('data-')).toBe('')
    expect((original as Element).hasAttribute('aria-')).toBe(false)
  })

  it('preserves the setter primitive hint and coerces each data value once', () => {
    const container = document.createElement('div')
    container.innerHTML = '<div data-state="matching"></div>'
    const original = container.firstChild
    const hints: string[] = []
    const value = {
      [Symbol.toPrimitive](hint: string) {
        hints.push(hint)
        return hint === 'default' ? 'matching' : 'different'
      },
    }
    const errors: unknown[] = []
    const root = hydrateRoot(container, React.createElement('div', { 'data-state': value }), {
      onRecoverableError: error => errors.push(error),
    })
    cleanup.push(() => root.unmount())
    expect(errors).toEqual([])
    expect(container.firstChild).toBe(original)
    expect(hints).toEqual(['default'])
  })

  it.each([
    { tag: 'img', attr: 'src', props: { src: '/image.gif' } },
    { tag: 'img', attr: 'srcset', props: { srcSet: '/image.gif 1x' } },
    { tag: 'input', attr: 'src', props: { type: 'image', src: '/button.gif' } },
    { tag: 'video', attr: 'poster', props: { poster: '/poster.gif' } },
    { tag: 'video', attr: 'src', props: { preload: 'auto', src: '/video.mp4' } },
    { tag: 'audio', attr: 'src', props: { preload: 'auto', src: '/audio.mp3' } },
    { tag: 'image', attr: 'href', props: { href: '/svg-image.gif' } },
    { tag: 'object', attr: 'data', props: { data: '/embedded.html' } },
    { tag: 'link', attr: 'href', props: { rel: 'preload', as: 'image', href: '/preload.gif' } },
    { tag: 'table', attr: 'background', props: { background: '/background.gif' } },
  ])('compares $tag $attr without assigning a resource URL in the active document', ({ tag, attr, props }) => {
    const child = React.createElement(tag, props)
    const tree = tag === 'image' ? React.createElement('svg', null, child) : child
    const { hydrate } = fixture(tree)
    const writes: Array<{ element: Element; name: string }> = []
    const setAttribute = Element.prototype.setAttribute
    vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function(this: Element, name: string, value: string) {
      writes.push({ element: this, name })
      setAttribute.call(this, name, value)
    })
    const { original, errors, container } = hydrate()
    expect(errors).toEqual([])
    expect(container.firstChild).toBe(original)
    const matchingWrites = writes.filter(write => write.name === attr)
    expect(matchingWrites.filter(write => write.element.ownerDocument.defaultView !== null)).toEqual([])
    expect(matchingWrites).toEqual([])
  })

  it('keeps native string coercion for resource attributes', () => {
    const hints: string[] = []
    const value = {
      [Symbol.toPrimitive](hint: string) {
        hints.push(hint)
        return hint === 'string' ? '/matching.gif' : '/wrong.gif'
      },
    }
    const { hydrate } = fixture(React.createElement('img', { src: value }))
    hints.length = 0
    const { original, errors, container } = hydrate()
    expect(errors).toEqual([])
    expect(container.firstChild).toBe(original)
    expect(hints).toEqual(['string'])
  })

  it('retains native property normalization where it is needed', () => {
    const { original, errors, container } = fixture(React.createElement('progress', { value: 2 }))
      .hydrate(React.createElement('progress', { value: '2.0' }))
    expect(errors).toEqual([])
    expect(container.firstChild).toBe(original)
  })

  it('retains boolean attribute normalization', () => {
    const { original, errors, container } = fixture(React.createElement('div', { hidden: true }))
      .hydrate(React.createElement('div', { hidden: 'hidden' }))
    expect(errors).toEqual([])
    expect(container.firstChild).toBe(original)
  })

  it('rejects inline event attributes even when the client supplies the same invalid handler', () => {
    const container = document.createElement('div')
    container.innerHTML = '<button onclick="alert(1)">x</button>'
    const errors: unknown[] = []
    const root = hydrateRoot(container, React.createElement('button', { onClick: 'alert(1)' }, 'x'), { onRecoverableError: e => errors.push(e) })
    cleanup.push(() => root.unmount())
    expect(errors.length).toBeGreaterThan(0)
    expect(container.querySelector('button')!.hasAttribute('onclick')).toBe(false)
  })

  it('normalizes expected HTML in the original owner document', () => {
    const { hydrate } = fixture(<div dangerouslySetInnerHTML={{ __html: '<img src=/nested.gif><p>&amp;</p>' }} />)
    const setter = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')?.set
    if (!setter) throw new Error('Expected the native innerHTML setter')
    const documents: Document[] = []
    vi.spyOn(Element.prototype, 'innerHTML', 'set').mockImplementation(function(this: Element, html: string) {
      documents.push(this.ownerDocument)
      setter.call(this, html)
    })
    const { original, errors, container } = hydrate()
    expect(errors).toEqual([])
    expect(container.firstChild).toBe(original)
    expect(documents.length).toBeGreaterThan(0)
    expect(documents.every(doc => doc === document)).toBe(true)
  })

  it('still detects different raw HTML inside noscript', () => {
    const { errors } = fixture(<div dangerouslySetInnerHTML={{ __html: '<noscript><p>first</p></noscript>' }} />)
      .hydrate(<div dangerouslySetInnerHTML={{ __html: '<noscript><p>second</p></noscript>' }} />)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('does not upgrade custom-element probes or invoke attribute callbacks', () => {
    let constructors = 0
    let changes = 0
    const tag = 'redact-hydration-probe-callbacks'
    customElements.define(tag, class extends HTMLElement {
      static observedAttributes = ['label', 'style']
      constructor() { super(); constructors++ }
      attributeChangedCallback() { changes++ }
    })
    const { hydrate } = fixture(React.createElement(tag, { label: 'matching', style: { color: 'red' } }))
    constructors = changes = 0
    const { original, errors, container } = hydrate()
    expect(errors).toEqual([])
    expect(container.firstChild).toBe(original)
    expect(constructors).toBe(0)
    expect(changes).toBe(0)
  })

})

it('adopts the server-rendered omission of a false class', () => {
  const { hydrate } = fixture(<div className={false as any} />)
  const { original, errors, container } = hydrate()
  expect(errors).toEqual([])
  expect(container.firstChild).toBe(original)
  expect((original as Element).getAttribute('class')).toBeNull()
})
