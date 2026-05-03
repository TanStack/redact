/**
 * Port of React's `ReactDOMServerIntegrationSelect-test.js`. Covers the
 * `<select value>`/`<select defaultValue>` semantics where the selected
 * option is derived from the select's value prop rather than a direct
 * attribute.
 *
 * Skipped from upstream:
 *   - `itThrowsWhenRendering` for invalid children + dangerouslySetInnerHTML
 *     combinations (they check dev-mode invariants we don't produce).
 *   - `dangerouslySetInnerHTML` option semantics — not commonly hit in
 *     real apps and fragile under hydration.
 */
import { describe, expect } from 'vitest'
import * as React from 'react'
import { itRenders } from './harness'

const options = [
  <option key={1} value="foo" id="foo">
    Foo
  </option>,
  <option key={2} value="bar" id="bar">
    Bar
  </option>,
  <option key={3} value="baz" id="baz">
    Baz
  </option>,
]

function expectSelectValue(element: HTMLSelectElement, selected: string | string[]): void {
  const selectedList = Array.isArray(selected) ? selected : [selected]
  expect(element.getAttribute('value')).toBe(null)
  expect(element.getAttribute('defaultValue')).toBe(null)
  ;['foo', 'bar', 'baz'].forEach((value) => {
    const expectedSelected = selectedList.indexOf(value) !== -1
    const option = element.querySelector(`#${value}`) as HTMLOptionElement
    expect(option.selected).toBe(expectedSelected)
  })
}

describe('ReactDOMServerIntegration / select', () => {
  itRenders('a select with a value and an onChange', async (render) => {
    const e = (await render(
      <select value="bar" onChange={() => {}}>
        {options}
      </select>,
    )) as HTMLSelectElement
    expectSelectValue(e, 'bar')
  })

  itRenders('a select with a value and readOnly', async (render) => {
    const e = (await render(
      <select value="bar" readOnly={true}>
        {options}
      </select>,
    )) as HTMLSelectElement
    expectSelectValue(e, 'bar')
  })

  itRenders('a select with multiple values and an onChange', async (render) => {
    const e = (await render(
      <select value={['bar', 'baz']} multiple={true} onChange={() => {}}>
        {options}
      </select>,
    )) as HTMLSelectElement
    expectSelectValue(e, ['bar', 'baz'])
  })

  itRenders('a select with a defaultValue', async (render) => {
    const e = (await render(
      <select defaultValue="bar">{options}</select>,
    )) as HTMLSelectElement
    expectSelectValue(e, 'bar')
  })

  itRenders('a select value overriding defaultValue', async (render) => {
    const e = (await render(
      <select value="bar" defaultValue="baz" readOnly={true}>
        {options}
      </select>,
    )) as HTMLSelectElement
    expectSelectValue(e, 'bar')
  })

  itRenders('a select option with flattened children', async (render) => {
    const e = (await render(
      <select value="bar" readOnly={true}>
        <option value="bar">A {'B'}</option>
      </select>,
    )) as HTMLSelectElement
    const option = e.options[0]!
    expect(option.textContent).toBe('A B')
    expect(option.value).toBe('bar')
    expect(option.selected).toBe(true)
  })

  itRenders('a select option with text content as value', async (render) => {
    const e = (await render(
      <select value="A B" readOnly={true}>
        <option>A {'B'}</option>
      </select>,
    )) as HTMLSelectElement
    const option = e.options[0]!
    expect(option.value).toBe('A B')
    expect(option.selected).toBe(true)
  })

  itRenders('a boolean true select value matches the string "true"', async (render) => {
    const e = (await render(
      <select value={true as any} readOnly={true}>
        <option value="first">First</option>
        <option value="true">True</option>
      </select>,
    )) as HTMLSelectElement
    expect((e.firstChild as HTMLOptionElement).selected).toBe(false)
    expect((e.lastChild as HTMLOptionElement).selected).toBe(true)
  })

  itRenders('a missing select value does not match the string "undefined"', async (render) => {
    const e = (await render(
      <select readOnly={true}>
        <option value="first">First</option>
        <option value="undefined">Undefined</option>
      </select>,
    )) as HTMLSelectElement
    // Browser default: first option is selected when no value is controlled.
    expect((e.firstChild as HTMLOptionElement).selected).toBe(true)
    expect((e.lastChild as HTMLOptionElement).selected).toBe(false)
  })
})
