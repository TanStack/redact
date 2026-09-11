import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
const onChange = () => {}

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  cleanups.push(() => {
    flushSync(() => root.unmount())
    container.remove()
  })
  return {
    container,
    render(props: Record<string, any>) {
      flushSync(() => root.render(<form><input onChange={onChange} {...props} /></form>))
      return container.querySelector('input')!
    },
  }
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.restoreAllMocks()
})

describe('number input value and reset semantics', () => {
  it.each([false, true])('syncs controlled defaults while focused=%s', (focused) => {
    const { render } = setup()
    const input = render({ type: 'number', value: '1' })
    if (focused) input.focus()
    render({ type: 'number', value: '2' })
    expect(input.value).toBe('2')
    expect(input.defaultValue).toBe('2')
    input.blur()
    expect(input.defaultValue).toBe('2')
    input.value = '9'
    input.form!.reset()
    expect(input.value).toBe('2')
  })

  it.each(['0.0', '1.00', '1e2', '-0'])('preserves equivalent numeric spelling %s', (spelling) => {
    const { render } = setup()
    const input = render({ type: 'number', value: spelling })
    input.focus()
    render({ type: 'number', value: Number(spelling) })
    expect(input.value).toBe(spelling)
    expect(input.defaultValue).toBe(spelling)
    input.blur()
    input.form!.reset()
    expect(input.value).toBe(spelling)
  })

  it('keeps equivalent user spelling when the controlled prop does not change', () => {
    const { render } = setup()
    const input = render({ type: 'number', value: 0 })
    input.value = '0.0'
    render({ type: 'number', value: 0 })
    expect(input.value).toBe('0.0')
    expect(input.defaultValue).toBe('0.0')
  })

  it('uses an explicit string value exactly instead of treating both strings as numbers', () => {
    const { render } = setup()
    const input = render({ type: 'number', value: '0.0' })
    render({ type: 'number', value: '0' })
    expect([input.value, input.defaultValue]).toEqual(['0', '0'])
  })

  it('restores a changed user value when the controlled prop does not change', () => {
    const { render } = setup()
    const input = render({ type: 'number', value: 2 })
    input.value = '9'
    render({ type: 'number', value: 2 })
    expect(input.value).toBe('2')
    expect(input.defaultValue).toBe('2')
  })

  it('distinguishes numeric zero from an empty number input', () => {
    const { render } = setup()
    const input = render({ type: 'number', value: '' })
    render({ type: 'number', value: 0 })
    expect(input.value).toBe('0')
    expect(input.defaultValue).toBe('0')
    render({ type: 'number', value: '' })
    expect(input.value).toBe('')
    expect(input.defaultValue).toBe('')
  })

  it.each([false, true])('updates uncontrolled reset defaults without changing the live value, dirty=%s', (dirty) => {
    const { render } = setup()
    const input = render({ type: 'number', defaultValue: '1.00' })
    if (dirty) input.value = '8.00'
    render({ type: 'number', defaultValue: '2.00' })
    expect(input.value).toBe(dirty ? '8.00' : '1.00')
    expect(input.defaultValue).toBe('2.00')
    input.form!.reset()
    expect(input.value).toBe('2.00')
    render({ type: 'number' })
    expect(input.defaultValue).toBe('')
  })

  it('switches between controlled and uncontrolled without clearing the live value', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { render } = setup()
    const input = render({ type: 'number', defaultValue: '1.00' })
    input.value = '2.00'
    render({ type: 'number', value: 2 })
    expect(input.value).toBe('2.00')
    expect(input.defaultValue).toBe('2.00')
    render({ type: 'number' })
    expect(input.value).toBe('2.00')
    expect(input.defaultValue).toBe('2.00')
    render({ type: 'number', defaultValue: '3.00' })
    expect(input.value).toBe('2.00')
    input.form!.reset()
    expect(input.value).toBe('3.00')
  })

  it('uses value over defaultValue regardless of prop order', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { render } = setup()
    const input = render({ value: 1, defaultValue: 8, type: 'number' })
    expect([input.value, input.defaultValue]).toEqual(['1', '1'])
    render({ defaultValue: 9, value: 2, type: 'number' })
    expect([input.value, input.defaultValue]).toEqual(['2', '2'])
  })

  it('applies type changes before comparing the value regardless of prop order', () => {
    const { render } = setup()
    const input = render({ value: '1.00', type: 'text' })
    render({ value: 1, type: 'number' })
    expect([input.value, input.defaultValue]).toEqual(['1.00', '1.00'])
    render({ value: 1, type: 'text' })
    expect([input.value, input.defaultValue]).toEqual(['1', '1'])
  })

  it('has the final value and reset default when the ref attaches', () => {
    const { render } = setup()
    let seen: string[] = []
    render({ value: '1.00', type: 'number', ref: (input: HTMLInputElement | null) => {
      if (input) seen = [input.type, input.value, input.defaultValue]
    } })
    expect(seen).toEqual(['number', '1.00', '1.00'])
  })

  it.each(['text', 'number'])('keeps value/defaultValue semantics when an input starts empty, type=%s', (type) => {
    const { render } = setup()
    const input = render({ type })
    render({ type, defaultValue: '2' })
    expect([input.value, input.defaultValue]).toEqual(['2', '2'])
    input.value = '3'
    render({ type, defaultValue: '4' })
    expect([input.value, input.defaultValue]).toEqual(['3', '4'])
    input.form!.reset()
    expect(input.value).toBe('4')
  })

  it.each(['text', 'number'])('does not mark an initially empty defaultValue dirty, type=%s', (type) => {
    const { render } = setup()
    const input = render({ type, defaultValue: '' })
    render({ type, defaultValue: '2' })
    expect([input.value, input.defaultValue]).toEqual(['2', '2'])
  })

  it.each(['submit', 'reset'])('preserves the native %s label when value is absent', (type) => {
    const { render } = setup()
    const input = render({ type, defaultValue: 'ignored' })
    expect(input.hasAttribute('value')).toBe(false)
    render({ type, value: 'custom' })
    expect(input.value).toBe('custom')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render({ type })
    expect(input.hasAttribute('value')).toBe(false)
  })

  it('retains the server node and value on matching hydration', async () => {
    const container = document.createElement('div')
    container.innerHTML = '<input type="number" value="1.00">'
    document.body.appendChild(container)
    const input = container.firstChild as HTMLInputElement
    const errors: unknown[] = []
    let mounted!: () => void
    const ready = new Promise<void>((resolve) => { mounted = resolve })
    function App() {
      React.useLayoutEffect(mounted, [])
      return <input type="number" value="1.00" onChange={onChange} />
    }
    const root = hydrateRoot(container, <App />, { onRecoverableError: (error) => errors.push(error) })
    cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
    await ready
    expect(container.firstChild).toBe(input)
    expect([input.value, input.defaultValue]).toEqual(['1.00', '1.00'])
    expect(errors).toEqual([])
  })
})
