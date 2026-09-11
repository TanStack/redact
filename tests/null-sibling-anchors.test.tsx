import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal, flushSync } from 'react-dom'

describe('null-sibling DOM order', () => {
  it('keeps several newly visible siblings before the stable tail', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    function Item({ id, visible }: { id: number; visible: boolean; key?: number }) {
      return visible ? <span>{id}</span> : null
    }
    function Tree({ visible }: { visible: boolean }) {
      return <>{Array.from({ length: 40 }, (_, i) => <Item key={i} id={i} visible={visible} />)}<b>tail</b></>
    }
    root.render(<Tree visible={false} />)
    const tail = container.lastChild
    root.render(<Tree visible />)
    expect(Array.from(container.children).map((node) => node.textContent)).toEqual([
      ...Array.from({ length: 40 }, (_, i) => String(i)), 'tail',
    ])
    expect(container.lastChild).toBe(tail)
    root.unmount()
  })

  it('rechecks after an earlier sibling synchronously updates a later sibling', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    let reveal!: (visible: boolean) => void
    let nested = false
    function First({ active }: { active: boolean }) {
      if (active && !nested) {
        nested = true
        flushSync(() => reveal(true))
      }
      return null
    }
    function Middle({ active }: { active: boolean }) {
      return active ? <span>middle</span> : null
    }
    function Later() {
      const [visible, setVisible] = React.useState(false)
      reveal = setVisible
      return visible ? <span>later</span> : null
    }
    function Tree({ active }: { active: boolean }) {
      return <><First active={active} /><Middle active={active} /><Later /><b>tail</b></>
    }
    root.render(<Tree active={false} />)
    root.render(<Tree active />)
    expect(container.textContent).toBe('middlelatertail')
    root.unmount()
  })

  it('does not skip a portal whose DOM is moved inline between sibling renders', () => {
    const container = document.createElement('div')
    const portalContainer = document.createElement('div')
    const root = createRoot(container)
    function First({ active }: { active: boolean }) {
      if (active && portalContainer.firstChild) {
        container.insertBefore(portalContainer.firstChild, container.lastChild)
      }
      return null
    }
    function Middle({ active }: { active: boolean }) {
      return active ? <span>middle</span> : null
    }
    function Portal() {
      return createPortal(<span>portal</span>, portalContainer)
    }
    function Tree({ active }: { active: boolean }) {
      return <><First active={active} /><Middle active={active} /><Portal /><b>tail</b></>
    }
    root.render(<Tree active={false} />)
    root.render(<Tree active />)
    // Portal reconciliation may put its node back into its own container.
    // The middle node must still precede whichever inline tail remains.
    expect(container.firstChild?.textContent).toBe('middle')
    expect(container.lastChild?.textContent).toBe('tail')
    root.unmount()
  })
})
