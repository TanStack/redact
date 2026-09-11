import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { escapeAttr, escapeText } from '../packages/redact/src/server/escape'

const entities: Record<string, string> = {
  '&': '&amp;',
  '"': '&quot;',
  '<': '&lt;',
  '>': '&gt;',
}

function check(value: string) {
  expect(escapeAttr(value)).toBe(value.replace(/[&"<>]/g, char => entities[char]!))
  expect(escapeText(value)).toBe(value.replace(/[&<>]/g, char => entities[char]!))
}

describe('server escaping', () => {
  it('coerces public attribute values once before the internal escape scan', () => {
    const hints: string[] = []
    const value = {
      [Symbol.toPrimitive](hint: string) {
        hints.push(hint)
        return '&<>"'.repeat(5)
      },
    }
    const html = renderToString(createElement('div', { 'data-value': value }))
    expect(html).toContain(`data-value="${'&amp;&lt;&gt;&quot;'.repeat(5)}"`)
    expect(hints).toEqual(['string'])
  })

  it('preserves every UTF-16 code unit other than the supported HTML delimiters', () => {
    for (let code = 0; code <= 0xffff; code++) {
      const value = String.fromCharCode(code)
      check(value)
    }
  })

  it('escapes every adjacent delimiter combination without double escaping', () => {
    const alphabet = ['&', '<', '>', '"', "'", 'x', '\ud800', '\udc00']
    check('')
    for (const a of alphabet) for (const b of alphabet) for (const c of alphabet) {
      check(a + b + c)
    }
    check('&amp; &lt; &gt; &quot; &#39;')
  })

  it('preserves clean and escaped spans at every position in long strings', () => {
    const clean = 'hello 世界 🌎 \u0000\n\r\t'.repeat(100)
    check(clean)
    for (const delimiter of ['&', '<', '>', '"']) {
      for (const position of [0, 1, 255, 256, clean.length - 1, clean.length]) {
        check(clean.slice(0, position) + delimiter + clean.slice(position))
      }
    }
    check('&<>"'.repeat(10000))
  })

  it('keeps regex cursor state isolated between text and attribute calls', () => {
    for (let repeat = 0; repeat < 10; repeat++) {
      expect(escapeAttr('"&')).toBe('&quot;&amp;')
      expect(escapeText('"&')).toBe('"&amp;')
      expect(escapeAttr('plain')).toBe('plain')
      expect(escapeText('')).toBe('')
    }
  })
})
