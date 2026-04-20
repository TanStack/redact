/**
 * Port of a subset of React's `ReactDOMServerIntegrationAttributes-test.js`.
 * Covers the attribute-mapping surface: string/numeric/boolean props, enum
 * HTML attributes (hidden, download), `className`/`htmlFor` aliasing, special
 * React props (ref/key/children/dangerouslySetInnerHTML), aria/data
 * passthroughs, and HTML entity escaping.
 *
 * Skipped from the upstream file:
 *   - Dev-mode warning assertions (React uses `assertConsoleErrorDev`; we
 *     don't emit dev warnings, so cases that check for specific console
 *     messages won't apply). The expected *rendered output* of those cases
 *     is still here — we just don't count warnings.
 *   - URL-scheme sanitization (`javascript:` etc.) — that's a dev-mode
 *     hardening that's intentionally absent from the shim.
 */
import { describe, expect } from 'vitest'
import * as React from 'react'
import { itRenders } from './harness'

describe('ReactDOMServerIntegration / attributes', () => {
  describe('string properties', () => {
    itRenders('simple numbers', async (render) => {
      const e = (await render(<div width={30} />)) as HTMLElement
      expect(e.getAttribute('width')).toBe('30')
    })

    itRenders('simple strings', async (render) => {
      const e = (await render(<div width={'30'} />)) as HTMLElement
      expect(e.getAttribute('width')).toBe('30')
    })

    itRenders('empty href on anchor', async (render) => {
      const e = (await render(<a href="" />)) as HTMLElement
      expect(e.getAttribute('href')).toBe('')
    })

    itRenders('no string prop with null value', async (render) => {
      const e = (await render(<div width={null as any} />)) as HTMLElement
      expect(e.hasAttribute('width')).toBe(false)
    })
  })

  describe('boolean properties', () => {
    itRenders('boolean prop with true value', async (render) => {
      const e = (await render(<div hidden={true} />)) as HTMLElement
      expect(e.getAttribute('hidden')).toBe('')
    })

    itRenders('boolean prop with false value', async (render) => {
      const e = (await render(<div hidden={false} />)) as HTMLElement
      expect(e.getAttribute('hidden')).toBe(null)
    })

    itRenders('no boolean prop with null value', async (render) => {
      const e = (await render(<div hidden={null as any} />)) as HTMLElement
      expect(e.hasAttribute('hidden')).toBe(false)
    })
  })

  describe('download property (combined boolean/string)', () => {
    itRenders('download prop with true value', async (render) => {
      const e = (await render(<a download={true as any} />)) as HTMLElement
      expect(e.getAttribute('download')).toBe('')
    })

    itRenders('download prop with false value', async (render) => {
      const e = (await render(<a download={false as any} />)) as HTMLElement
      expect(e.getAttribute('download')).toBe(null)
    })

    itRenders('download prop with string value', async (render) => {
      const e = (await render(<a download="myfile" />)) as HTMLElement
      expect(e.getAttribute('download')).toBe('myfile')
    })

    itRenders('download prop with number 0 value', async (render) => {
      const e = (await render(<a download={0 as any} />)) as HTMLElement
      expect(e.getAttribute('download')).toBe('0')
    })

    itRenders('no download prop with null value', async (render) => {
      const e = (await render(<div download={null as any} />)) as HTMLElement
      expect(e.hasAttribute('download')).toBe(false)
    })

    itRenders('no download prop with undefined value', async (render) => {
      const e = (await render(<div download={undefined as any} />)) as HTMLElement
      expect(e.hasAttribute('download')).toBe(false)
    })
  })

  describe('className property', () => {
    itRenders('className prop with string value', async (render) => {
      const e = (await render(<div className="myClassName" />)) as HTMLElement
      expect(e.getAttribute('class')).toBe('myClassName')
    })

    itRenders('className prop with empty string value', async (render) => {
      const e = (await render(<div className="" />)) as HTMLElement
      expect(e.getAttribute('class')).toBe('')
    })

    itRenders('no className prop with null value', async (render) => {
      const e = (await render(<div className={null as any} />)) as HTMLElement
      expect(e.hasAttribute('className')).toBe(false)
    })

    itRenders('className prop when given the alias', async (render) => {
      const e = (await render(<div class="test" />)) as HTMLElement
      expect(e.className).toBe('test')
    })
  })

  describe('htmlFor property', () => {
    itRenders('htmlFor with string value', async (render) => {
      const e = (await render(<div htmlFor="myFor" />)) as HTMLElement
      expect(e.getAttribute('for')).toBe('myFor')
    })

    itRenders('htmlFor with an empty string', async (render) => {
      const e = (await render(<div htmlFor="" />)) as HTMLElement
      expect(e.getAttribute('for')).toBe('')
    })

    itRenders('no htmlFor prop with null value', async (render) => {
      const e = (await render(<div htmlFor={null as any} />)) as HTMLElement
      expect(e.hasAttribute('htmlFor')).toBe(false)
    })
  })

  describe('numeric properties', () => {
    itRenders('positive numeric property with positive value', async (render) => {
      const e = (await render(<input size={2} />)) as HTMLElement
      expect(e.getAttribute('size')).toBe('2')
    })

    itRenders('numeric property with zero value', async (render) => {
      const e = (await render(<ol start={0} />)) as HTMLElement
      expect(e.getAttribute('start')).toBe('0')
    })
  })

  describe('props with special meaning in React', () => {
    itRenders('no children attribute', async (render) => {
      const e = (await render(React.createElement('div', {}, 'foo'))) as HTMLElement
      expect(e.getAttribute('children')).toBe(null)
    })

    itRenders('no key attribute', async (render) => {
      const e = (await render(<div key="foo" />)) as HTMLElement
      expect(e.getAttribute('key')).toBe(null)
    })

    itRenders('no dangerouslySetInnerHTML attribute', async (render) => {
      const e = (await render(
        <div dangerouslySetInnerHTML={{ __html: '<foo />' }} />,
      )) as HTMLElement
      expect(e.getAttribute('dangerouslySetInnerHTML')).toBe(null)
    })
  })

  describe('aria attributes', () => {
    itRenders('simple aria-* attribute', async (render) => {
      const e = (await render(<div aria-label="foo" />)) as HTMLElement
      expect(e.getAttribute('aria-label')).toBe('foo')
    })

    itRenders('aria-* attribute with true value', async (render) => {
      const e = (await render(<div aria-hidden={true} />)) as HTMLElement
      expect(e.getAttribute('aria-hidden')).toBe('true')
    })

    itRenders('aria-* attribute with false value', async (render) => {
      const e = (await render(<div aria-hidden={false} />)) as HTMLElement
      expect(e.getAttribute('aria-hidden')).toBe('false')
    })

    itRenders('aria-* attribute with number value', async (render) => {
      const e = (await render(<div aria-valuenow={2} />)) as HTMLElement
      expect(e.getAttribute('aria-valuenow')).toBe('2')
    })

    itRenders('aria-* attribute with null value', async (render) => {
      const e = (await render(<div aria-label={null as any} />)) as HTMLElement
      expect(e.hasAttribute('aria-label')).toBe(false)
    })
  })

  describe('data-* attributes', () => {
    itRenders('simple data-* attribute', async (render) => {
      const e = (await render(<div data-foo="bar" />)) as HTMLElement
      expect(e.getAttribute('data-foo')).toBe('bar')
    })

    itRenders('data-* attribute with number value', async (render) => {
      const e = (await render(<div data-count={3} />)) as HTMLElement
      expect(e.getAttribute('data-count')).toBe('3')
    })

    itRenders('data-* attribute with null value', async (render) => {
      const e = (await render(<div data-foo={null as any} />)) as HTMLElement
      expect(e.hasAttribute('data-foo')).toBe(false)
    })

    itRenders('data-* attribute with true value', async (render) => {
      const e = (await render(<div data-foo={true} />)) as HTMLElement
      expect(e.getAttribute('data-foo')).toBe('true')
    })
  })

  describe('no-value attributes', () => {
    itRenders('allowFullScreen as allowfullscreen', async (render) => {
      const e = (await render(<div allowFullScreen={true} />)) as HTMLElement
      expect(e.hasAttribute('allowfullscreen')).toBe(true)
    })

    itRenders('autoPlay as autoplay', async (render) => {
      const e = (await render(<video autoPlay={true} />)) as HTMLElement
      expect(e.hasAttribute('autoplay')).toBe(true)
    })
  })

  describe('attribute escaping', () => {
    itRenders('escapes HTML-reserved chars in attribute values', async (render) => {
      const e = (await render(<div title={'<a&b"c'} />)) as HTMLElement
      expect(e.getAttribute('title')).toBe('<a&b"c')
    })
  })

  describe('style property', () => {
    itRenders('style as object', async (render) => {
      const e = (await render(
        <div style={{ color: 'red', marginTop: 4 }} />,
      )) as HTMLElement
      expect(e.style.color).toBe('red')
      expect(e.style.marginTop).toBe('4px')
    })

    itRenders('empty style object', async (render) => {
      const e = (await render(<div style={{}} />)) as HTMLElement
      // Either no style attr or empty cssText — both are acceptable.
      expect(e.getAttribute('style') === null || e.getAttribute('style') === '').toBe(true)
    })
  })
})
