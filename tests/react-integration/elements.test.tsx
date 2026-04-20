/**
 * Port of React's `ReactDOMServerIntegrationElements-test.js`. Covers the
 * most-used element/children rendering surface: text/number children, the
 * `<!-- -->` separator for adjacent text nodes, null/false children, SVG and
 * MathML namespaces, void elements, custom elements, and
 * `dangerouslySetInnerHTML` in its many forms.
 *
 * Skipped from upstream:
 *   - `<nonstandard>` tag dev-mode warning (we don't warn on unknown tags).
 *   - `xlinkHref` → `xlink:href` namespaced attribute. Our shim writes `xlinkHref`
 *     as `xlink:href` only on the SSR path; the client adoption path would
 *     need a namespaced-attribute map that doesn't exist yet. Keeping the
 *     simpler SSR attribute-only case would test only half the matrix and
 *     mislead; dropped for now.
 */
import { describe, expect } from 'vitest'
import * as React from 'react'
import {
  itRenders,
  serverRender,
  streamRender,
  hydrateOnServerString,
  expectTextNode,
  TEXT_NODE_TYPE,
} from './harness'

/** True when the markup went through SSR (and therefore has `<!-- -->` text
 * separators between adjacent text children). */
function isServerPath(render: unknown): boolean {
  return (
    render === serverRender ||
    render === streamRender ||
    render === hydrateOnServerString
  )
}

describe('ReactDOMServerIntegration / elements', () => {
  describe('text children', () => {
    itRenders('a div with text', async (render) => {
      const e = (await render(<div>Text</div>)) as HTMLElement
      expect(e.tagName).toBe('DIV')
      expect(e.childNodes.length).toBe(1)
      expect(e.firstChild!.nodeType).toBe(TEXT_NODE_TYPE)
      expect(e.firstChild!.nodeValue).toBe('Text')
    })

    itRenders('a div with text with flanking whitespace', async (render) => {
      const e = (await render(<div>{'  Text '}</div>)) as HTMLElement
      expect(e.childNodes.length).toBe(1)
      expectTextNode(e.childNodes[0], '  Text ')
    })

    itRenders('a div with an empty text child', async (render) => {
      const e = (await render(<div>{''}</div>)) as HTMLElement
      expect(e.childNodes.length).toBe(0)
    })

    itRenders('a div with multiple empty text children', async (render) => {
      const e = (await render(
        <div>
          {''}
          {''}
          {''}
        </div>,
      )) as HTMLElement
      expect(e.childNodes.length).toBe(0)
      expect(e.textContent).toBe('')
    })

    itRenders('a div with text sibling to a node', async (render) => {
      const e = (await render(
        <div>
          Text<span>More Text</span>
        </div>,
      )) as HTMLElement
      expect(e.childNodes.length).toBe(2)
      const spanNode = e.childNodes[1] as HTMLElement
      expectTextNode(e.childNodes[0], 'Text')
      expect(spanNode.tagName).toBe('SPAN')
      expect(spanNode.childNodes.length).toBe(1)
      expect(spanNode.firstChild!.nodeValue).toBe('More Text')
    })

    itRenders('a leading blank child with a text sibling', async (render) => {
      const e = (await render(<div>{''}foo</div>)) as HTMLElement
      expect(e.childNodes.length).toBe(1)
      expectTextNode(e.childNodes[0], 'foo')
    })

    itRenders('a trailing blank child with a text sibling', async (render) => {
      const e = (await render(<div>foo{''}</div>)) as HTMLElement
      expect(e.childNodes.length).toBe(1)
      expectTextNode(e.childNodes[0], 'foo')
    })

    itRenders('an element with two text children', async (render) => {
      const e = (await render(
        <div>
          {'foo'}
          {'bar'}
        </div>,
      )) as HTMLElement
      if (isServerPath(render)) {
        // `<!-- -->` separator between adjacent text nodes — required by
        // React's hydration algorithm so the browser's parser doesn't merge
        // adjacent text runs into one text node.
        expect(e.childNodes.length).toBe(3)
        expectTextNode(e.childNodes[0], 'foo')
        expectTextNode(e.childNodes[2], 'bar')
      } else {
        expect(e.childNodes.length).toBe(2)
        expectTextNode(e.childNodes[0], 'foo')
        expectTextNode(e.childNodes[1], 'bar')
      }
    })

    itRenders('a component returning text node between two text nodes', async (render) => {
      const B = () => 'b'
      const e = (await render(
        <div>
          {'a'}
          <B />
          {'c'}
        </div>,
      )) as HTMLElement
      if (isServerPath(render)) {
        expect(e.childNodes.length).toBe(5)
        expectTextNode(e.childNodes[0], 'a')
        expectTextNode(e.childNodes[2], 'b')
        expectTextNode(e.childNodes[4], 'c')
      } else {
        expect(e.childNodes.length).toBe(3)
        expectTextNode(e.childNodes[0], 'a')
        expectTextNode(e.childNodes[1], 'b')
        expectTextNode(e.childNodes[2], 'c')
      }
    })
  })

  describe('number children', () => {
    itRenders('a number as single child', async (render) => {
      const e = (await render(<div>{3}</div>)) as HTMLElement
      expect(e.textContent).toBe('3')
    })

    itRenders('zero as single child', async (render) => {
      const e = (await render(<div>{0}</div>)) as HTMLElement
      expect(e.textContent).toBe('0')
    })

    itRenders('an element with number and text children', async (render) => {
      const e = (await render(
        <div>
          {'foo'}
          {40}
        </div>,
      )) as HTMLElement
      if (isServerPath(render)) {
        expect(e.childNodes.length).toBe(3)
        expectTextNode(e.childNodes[0], 'foo')
        expectTextNode(e.childNodes[2], '40')
      } else {
        expect(e.childNodes.length).toBe(2)
        expectTextNode(e.childNodes[0], 'foo')
        expectTextNode(e.childNodes[1], '40')
      }
    })
  })

  describe('null, false, and undefined children', () => {
    itRenders('null single child as blank', async (render) => {
      const e = (await render(<div>{null}</div>)) as HTMLElement
      expect(e.childNodes.length).toBe(0)
    })

    itRenders('false single child as blank', async (render) => {
      const e = (await render(<div>{false}</div>)) as HTMLElement
      expect(e.childNodes.length).toBe(0)
    })

    itRenders('undefined single child as blank', async (render) => {
      const e = (await render(<div>{undefined}</div>)) as HTMLElement
      expect(e.childNodes.length).toBe(0)
    })

    itRenders('a null component children as empty', async (render) => {
      const NullComponent = () => null
      const e = (await render(
        <div>
          <NullComponent />
        </div>,
      )) as HTMLElement
      expect(e.childNodes.length).toBe(0)
    })

    itRenders('null children as blank', async (render) => {
      const e = (await render(<div>{null}foo</div>)) as HTMLElement
      expect(e.childNodes.length).toBe(1)
      expectTextNode(e.childNodes[0], 'foo')
    })

    itRenders('false children as blank', async (render) => {
      const e = (await render(<div>{false}foo</div>)) as HTMLElement
      expect(e.childNodes.length).toBe(1)
      expectTextNode(e.childNodes[0], 'foo')
    })

    itRenders('null and false children together as blank', async (render) => {
      const e = (await render(
        <div>
          {false}
          {null}foo{null}
          {false}
        </div>,
      )) as HTMLElement
      expect(e.childNodes.length).toBe(1)
      expectTextNode(e.childNodes[0], 'foo')
    })

    itRenders('only null and false children as blank', async (render) => {
      const e = (await render(
        <div>
          {false}
          {null}
          {null}
          {false}
        </div>,
      )) as HTMLElement
      expect(e.childNodes.length).toBe(0)
    })
  })

  describe('elements with implicit namespaces', () => {
    itRenders('an svg element', async (render) => {
      const e = (await render(<svg />)) as SVGElement
      expect(e.childNodes.length).toBe(0)
      expect(e.tagName).toBe('svg')
      expect(e.namespaceURI).toBe('http://www.w3.org/2000/svg')
    })

    itRenders('svg child element with an attribute', async (render) => {
      const e = (await render(<svg viewBox="0 0 0 0" />)) as SVGElement
      expect(e.tagName).toBe('svg')
      expect(e.namespaceURI).toBe('http://www.w3.org/2000/svg')
      expect(e.getAttribute('viewBox')).toBe('0 0 0 0')
    })

    itRenders('svg element with a mixed case name', async (render) => {
      const e = (await render(
        <svg>
          <filter>
            <feMorphology />
          </filter>
        </svg>,
      )) as SVGElement
      const feMorphology = (e.firstChild as Element).firstChild as Element
      expect(feMorphology.childNodes.length).toBe(0)
      expect(feMorphology.tagName).toBe('feMorphology')
      expect((feMorphology as SVGElement).namespaceURI).toBe('http://www.w3.org/2000/svg')
    })
  })

  describe('void / custom / misc elements', () => {
    itRenders('an img', async (render) => {
      const e = (await render(<img />)) as HTMLElement
      expect(e.childNodes.length).toBe(0)
      expect(e.nextSibling).toBe(null)
      expect(e.tagName).toBe('IMG')
    })

    itRenders('a button', async (render) => {
      const e = (await render(<button />)) as HTMLElement
      expect(e.childNodes.length).toBe(0)
      expect(e.tagName).toBe('BUTTON')
    })

    itRenders('a custom element with text', async (render) => {
      const e = (await render(
        <custom-element {...({} as any)}>Text</custom-element>,
      )) as HTMLElement
      expect(e.tagName).toBe('CUSTOM-ELEMENT')
      expect(e.childNodes.length).toBe(1)
      expect(e.firstChild!.nodeValue).toBe('Text')
    })
  })

  describe('dangerouslySetInnerHTML', () => {
    itRenders('dangerouslySetInnerHTML number', async (render) => {
      const parent = (await render(
        <div>
          <span dangerouslySetInnerHTML={{ __html: 0 as any }} />
        </div>,
      )) as HTMLElement
      const e = parent.firstChild as HTMLElement
      expect(e.childNodes.length).toBe(1)
      expect(e.firstChild!.nodeType).toBe(TEXT_NODE_TYPE)
      expect(e.textContent).toBe('0')
    })

    itRenders('dangerouslySetInnerHTML text string', async (render) => {
      const parent = (await render(
        <div>
          <span dangerouslySetInnerHTML={{ __html: 'hello' }} />
        </div>,
      )) as HTMLElement
      const e = parent.firstChild as HTMLElement
      expect(e.childNodes.length).toBe(1)
      expect(e.firstChild!.nodeType).toBe(TEXT_NODE_TYPE)
      expect(e.textContent).toBe('hello')
    })

    itRenders('dangerouslySetInnerHTML element string', async (render) => {
      const e = (await render(
        <div dangerouslySetInnerHTML={{ __html: "<span id='child'/>" }} />,
      )) as HTMLElement
      expect(e.childNodes.length).toBe(1)
      const child = e.firstChild as HTMLElement
      expect(child.tagName).toBe('SPAN')
      expect(child.getAttribute('id')).toBe('child')
    })

    itRenders('dangerouslySetInnerHTML set to null', async (render) => {
      const e = (await render(
        <div dangerouslySetInnerHTML={{ __html: null as any }} />,
      )) as HTMLElement
      expect(e.childNodes.length).toBe(0)
    })
  })
})
