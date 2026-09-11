import { expect, it } from 'vitest'
import { setProp } from '../packages/redact/src/dom/dom'

it('preserves string values for class and for aliases, including SVG', () => {
  for (const svg of [false, true]) {
    const el = svg ? document.createElementNS('http://www.w3.org/2000/svg', 'g') : document.createElement('label')
    for (const [name, attribute] of [['class', 'class'], ['className', 'class'], ['htmlFor', 'for']] as const) {
      setProp(el, name, false, undefined, svg)
      expect(el.getAttribute(attribute)).toBe('false')
      setProp(el, name, true, false, svg)
      expect(el.getAttribute(attribute)).toBe('true')
      setProp(el, name, null, true, svg)
      expect(el.getAttribute(attribute)).toBe(name === 'className' && !svg ? '' : null)
    }
  }
})

it('normalizes boolean aliases without changing generic and string booleans', () => {
  const el = document.createElement('script')
  for (const name of ['noModule', 'autoFocus', 'hidden']) {
    for (const value of [true, 'yes', 1, false, 0, null]) {
      setProp(el, name, value, undefined, false)
      expect(el.getAttribute(name.toLowerCase())).toBe(value ? '' : null)
    }
  }
  setProp(el, 'contentEditable', false, undefined, false)
  expect(el.getAttribute('contenteditable')).toBe('false')
  setProp(el, 'custom', true, undefined, false)
  expect(el.getAttribute('custom')).toBe('')
  setProp(el, 'custom', false, true, false)
  expect(el.hasAttribute('custom')).toBe(false)
})

it('updates, rebinds and removes capture and bubble handlers independently', () => {
  const el = document.createElement('input')
  const calls: string[] = []
  const install = (suffix: string) => {
    setProp(el, 'onChangeCapture', () => calls.push('capture' + suffix), undefined, false)
    setProp(el, 'onChange', () => calls.push('change' + suffix), undefined, false)
    setProp(el, 'onInput', () => calls.push('input' + suffix), undefined, false)
  }
  install('1')
  el.dispatchEvent(new Event('input'))
  expect(calls.splice(0)).toEqual(['capture1', 'change1', 'input1'])
  install('2')
  el.dispatchEvent(new Event('input'))
  expect(calls.splice(0)).toEqual(['capture2', 'change2', 'input2'])
  el.type = 'checkbox'
  install('3')
  el.dispatchEvent(new Event('input'))
  expect(calls.splice(0)).toEqual(['input3'])
  el.dispatchEvent(new Event('change'))
  expect(calls.splice(0)).toEqual(['capture3', 'change3'])
  setProp(el, 'onChangeCapture', null, undefined, false)
  el.dispatchEvent(new Event('change'))
  expect(calls.splice(0)).toEqual(['change3'])
  setProp(el, 'onChange', null, undefined, false)
  el.dispatchEvent(new Event('change'))
  expect(calls).toEqual([])
})
