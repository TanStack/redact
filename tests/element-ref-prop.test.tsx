import { afterEach, describe, expect, it } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const cleanups: Array<() => void> = []
function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  cleanups.push(() => {
    flushSync(() => root.unmount())
    container.remove()
  })
  return { container, render: (node: React.ReactNode) => flushSync(() => root.render(node)) }
}
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

function Child(props: { id?: string; ref?: React.Ref<HTMLSpanElement> }) {
  return <span {...props} />
}

describe('ref as a prop', () => {
  it('keeps ref in props on createElement', () => {
    const ref = React.createRef<HTMLSpanElement>()
    expect(React.createElement(Child, { ref }).props.ref).toBe(ref)
  })

  it('keeps ref in props on cloneElement', () => {
    const ref = React.createRef<HTMLSpanElement>()
    const clone = React.cloneElement(<Child />, { ref })
    expect(clone.props.ref).toBe(ref)
  })

  it('leaves the original ref alone when cloning without one', () => {
    const ref = React.createRef<HTMLSpanElement>()
    const clone = React.cloneElement(<Child ref={ref} />, { id: 'cloned' })
    expect(clone.props.ref).toBe(ref)
    expect(clone.props.id).toBe('cloned')
  })

  it('forwards a cloned ref through a function component to the host node', () => {
    const { render, container } = setup()
    const ref = React.createRef<HTMLSpanElement>()
    render(React.cloneElement(<Child />, { ref, id: 'cloned' }))
    expect(ref.current).toBe(container.querySelector('#cloned'))
  })
})
