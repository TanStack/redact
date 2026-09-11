import { afterEach, describe, expect, it } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToString } from 'react-dom/server'

const cleanups: Array<() => void> = []
function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return { container, render: (node: React.ReactNode) => flushSync(() => root.render(node)) }
}
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

describe('React 19 ref props in classic element helpers', () => {
  it.each([
    { name: 'undefined', ref: undefined },
    { name: 'null', ref: null },
    { name: 'object', ref: React.createRef() },
    { name: 'callback', ref: () => {} },
  ])('keeps the supplied $name ref in props', ({ ref }) => {
    const config = { ref, id: 'original' }
    const element = React.createElement('div', config)
    expect(element.props).toStrictEqual(config)
    expect(element.props).not.toBe(config)
    expect(React.cloneElement(element).props).toEqual(config)
  })

  it.each(['omitted', 'undefined', 'null', 'replacement'])('handles %s refs when cloning without mutating the source', mode => {
    const original = React.createRef()
    const replacement = React.createRef()
    const element = React.createElement('div', { ref: original, id: 'original' })
    const config = mode === 'omitted' ? { id: 'cloned' } : { id: 'cloned', ref: mode === 'null' ? null : mode === 'undefined' ? undefined : replacement }
    const clone = React.cloneElement(element, config)
    expect(clone.props.ref).toBe(mode === 'null' ? null : mode === 'replacement' ? replacement : original)
    expect(clone.props.id).toBe('cloned')
    expect(element.props).toEqual({ ref: original, id: 'original' })
  })

  it('does not promote an inherited ref into props', () => {
    const config = Object.assign(Object.create({ ref: React.createRef() }), { id: 'own' })
    expect(React.createElement('div', config).props).toEqual({ id: 'own' })
    const original = React.createRef()
    expect(React.cloneElement(React.createElement('div', { ref: original }), config).props.ref).toBe(original)
  })

  it('reads an own ref getter once when creating an element', () => {
    const ref = React.createRef()
    let reads = 0
    const element = React.createElement('div', { get ref() { reads++; return ref } })
    expect(element.props.ref).toBe(ref)
    expect(reads).toBe(1)
  })

  it.each(['function', 'memo', 'forwardRef'])('attaches and replaces cloned refs through a %s component', mode => {
    const { container, render } = setup()
    const received: unknown[] = []
    function Button(props: { ref?: React.Ref<HTMLButtonElement> }) {
      received.push(props.ref)
      return <button {...props}>trigger</button>
    }
    const Component = mode === 'memo' ? React.memo(Button) : mode === 'forwardRef'
      ? React.forwardRef<HTMLButtonElement>((props, ref) => <Button {...props} ref={ref} />) : Button
    const template = React.createElement(Component)
    const first = React.createRef<HTMLButtonElement>()
    const second = React.createRef<HTMLButtonElement>()
    render(React.cloneElement(template, { ref: first }))
    const button = container.querySelector('button')
    expect(first.current).toBe(button)
    expect(button?.hasAttribute('ref')).toBe(false)
    render(React.cloneElement(template, { ref: second }))
    expect(first.current).toBe(null)
    expect(second.current).toBe(button)
    expect(received).toEqual([first, second])
    render(React.cloneElement(template, { ref: null }))
    expect(second.current).toBe(null)
    expect(container.querySelector('button')).toBe(button)
  })

  it('supports a render-prop trigger attaching native listeners with ref cleanup', () => {
    const { container, render } = setup()
    const calls: string[] = []
    function Button(props: { ref?: React.Ref<HTMLButtonElement> }) { return <button {...props}>trigger</button> }
    const ref = (node: HTMLButtonElement | null) => {
      if (!node) return
      const onClick = () => calls.push('click')
      node.addEventListener('click', onClick)
      calls.push('attach')
      return () => { node.removeEventListener('click', onClick); calls.push('cleanup') }
    }
    function Trigger({ element }: { element: React.ReactElement }) { return React.cloneElement(element, { ref }) }
    render(<Trigger element={<Button />} />)
    const button = container.querySelector('button')!
    button.click()
    render(null)
    button.click()
    expect(calls).toEqual(['attach', 'click', 'cleanup'])
  })

  it('passes cloned refs to server function components without invoking or serializing them', () => {
    let calls = 0
    const ref = () => { calls++ }
    function Child(props: { ref?: React.Ref<HTMLSpanElement> }) {
      expect(props.ref).toBe(ref)
      return <span {...props}>server</span>
    }
    expect(renderToString(React.cloneElement(React.createElement(Child), { ref }))).toBe('<span>server</span>')
    expect(calls).toBe(0)
  })
})
