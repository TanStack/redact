/**
 * Port of React's `ReactDOMServerIntegrationInput`, `Checkbox`, and
 * `Textarea` tests. Covers the form-control surface where React has subtle
 * value/defaultValue and checked/defaultChecked semantics.
 *
 * Matches React's behavior under `disableInputAttributeSyncing=true` — the
 * feature-flag mode which simply passes `value`/`checked` through to the
 * `.value`/`.checked` DOM properties without syncing them to attributes.
 * Our shim's IDL-attribute handling is in that mode by design. The
 * non-flagged React path adds extra attribute mirroring for legacy form
 * libraries; we don't replicate that.
 */
import { describe, expect } from 'vitest'
import * as React from 'react'
import { itRenders } from './harness'

describe('ReactDOMServerIntegration / input (checkbox)', () => {
  itRenders('a checkbox that is checked with an onChange', async (render) => {
    const e = (await render(
      <input type="checkbox" checked={true} onChange={() => {}} />,
    )) as HTMLInputElement
    expect(e.checked).toBe(true)
  })

  itRenders('a checkbox that is checked with readOnly', async (render) => {
    const e = (await render(
      <input type="checkbox" checked={true} readOnly={true} />,
    )) as HTMLInputElement
    expect(e.checked).toBe(true)
  })

  itRenders('a checkbox with defaultChecked', async (render) => {
    const e = (await render(
      <input type="checkbox" defaultChecked={true} />,
    )) as HTMLInputElement
    expect(e.checked).toBe(true)
    expect(e.getAttribute('defaultChecked')).toBe(null)
  })

  itRenders('checked overrides defaultChecked', async (render) => {
    const e = (await render(
      <input
        type="checkbox"
        checked={true}
        defaultChecked={false}
        readOnly={true}
      />,
    )) as HTMLInputElement
    expect(e.checked).toBe(true)
    expect(e.getAttribute('defaultChecked')).toBe(null)
  })
})

describe('ReactDOMServerIntegration / input (text)', () => {
  itRenders('an input with a value and an onChange', async (render) => {
    const e = (await render(
      <input value="foo" onChange={() => {}} />,
    )) as HTMLInputElement
    expect(e.value).toBe('foo')
  })

  itRenders('an input with a value and readOnly', async (render) => {
    const e = (await render(
      <input value="foo" readOnly={true} />,
    )) as HTMLInputElement
    expect(e.value).toBe('foo')
  })

  itRenders('an input with a defaultValue', async (render) => {
    const e = (await render(<input defaultValue="foo" />)) as HTMLInputElement
    expect(e.value).toBe('foo')
    expect(e.getAttribute('defaultValue')).toBe(null)
  })

  itRenders('an input value overrides defaultValue', async (render) => {
    const e = (await render(
      <input value="foo" defaultValue="bar" readOnly={true} />,
    )) as HTMLInputElement
    expect(e.value).toBe('foo')
    expect(e.getAttribute('defaultValue')).toBe(null)
  })
})

describe('ReactDOMServerIntegration / textarea', () => {
  itRenders('a textarea with a value and an onChange', async (render) => {
    const e = (await render(
      <textarea value="foo" onChange={() => {}} />,
    )) as HTMLTextAreaElement
    // textarea stores its value as a child text node, not a `value` attribute.
    expect(e.getAttribute('value')).toBe(null)
    expect(e.value).toBe('foo')
  })

  itRenders('a textarea with a value of undefined', async (render) => {
    const e = (await render(
      <textarea value={undefined} />,
    )) as HTMLTextAreaElement
    expect(e.getAttribute('value')).toBe(null)
    expect(e.value).toBe('')
  })

  itRenders('a textarea with a value and readOnly', async (render) => {
    const e = (await render(
      <textarea value="foo" readOnly={true} />,
    )) as HTMLTextAreaElement
    expect(e.getAttribute('value')).toBe(null)
    expect(e.value).toBe('foo')
  })

  itRenders('a textarea with a defaultValue', async (render) => {
    const e = (await render(
      <textarea defaultValue="foo" />,
    )) as HTMLTextAreaElement
    expect(e.getAttribute('value')).toBe(null)
    expect(e.getAttribute('defaultValue')).toBe(null)
    expect(e.value).toBe('foo')
  })

  itRenders('a textarea value overrides defaultValue', async (render) => {
    const e = (await render(
      <textarea value="foo" defaultValue="bar" readOnly={true} />,
    )) as HTMLTextAreaElement
    expect(e.getAttribute('value')).toBe(null)
    expect(e.getAttribute('defaultValue')).toBe(null)
    expect(e.value).toBe('foo')
  })
})
