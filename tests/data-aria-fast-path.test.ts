import { expect, it } from 'vitest'
import { setProp } from '../packages/redact/src/dom/dom'

for (const svg of [false, true]) {
  const element = () => svg
    ? document.createElementNS('http://www.w3.org/2000/svg', 'g')
    : document.createElement('div')
  for (const name of ['data-value', 'aria-label', 'data-MixedCase']) {
    it(`preserves ${svg ? 'SVG' : 'HTML'} ${name} stringification and removal`, () => {
      const el = element()
      for (const value of [true, false, 0, '', 'a<&']) {
        setProp(el, name, value, undefined, svg)
        expect(el.getAttribute(name)).toBe(String(value))
      }
      for (const value of [null, undefined]) {
        setProp(el, name, 'present', undefined, svg)
        setProp(el, name, value, 'present', svg)
        expect(el.hasAttribute(name)).toBe(false)
      }
    })
  }
  it(`coerces ${svg ? 'SVG' : 'HTML'} data values exactly once with the default hint`, () => {
    const hints: string[] = []
    const el = element()
    setProp(el, 'data-value', { [Symbol.toPrimitive](hint: string) { hints.push(hint); return 'value' } }, undefined, svg)
    expect(hints).toEqual(['default'])
    expect(el.getAttribute('data-value')).toBe('value')
  })
  it(`retains generic handling for bare prefixes and similar ${svg ? 'SVG' : 'HTML'} names`, () => {
    const el = element()
    for (const name of ['data-', 'aria-', 'Data-value', 'draggable', 'ariaLabel']) {
      setProp(el, name, false, undefined, svg)
      expect(el.getAttribute(name.toLowerCase())).toBe(name === 'draggable' ? 'false' : null)
    }
  })
}
