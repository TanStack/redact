import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal, flushSync } from 'react-dom'

describe('child-chain anchor invalidation', () => {
  it('rechecks moved portal DOM beyond more than one empty sibling', () => {
    const container = document.createElement('div')
    const portalContainer = document.createElement('div')
    const root = createRoot(container)
    function First({ active }: { active: boolean }) {
      if (active && portalContainer.firstChild) {
        container.insertBefore(portalContainer.firstChild, container.lastChild)
      }
      return null
    }
    function Middle({ active, label }: { active: boolean; label: string }) {
      return active ? <span>{label}</span> : null
    }
    function Portal() { return createPortal(<span>portal</span>, portalContainer) }
    function Tree({ active }: { active: boolean }) {
      return <><First active={active} /><Middle active={active} label="one" /><Middle active={active} label="two" /><Portal /><b>tail</b></>
    }
    try {
      root.render(<Tree active={false} />)
      const tail = container.lastChild
      root.render(<Tree active />)
      expect(Array.from(container.children, node => node.textContent).filter(text => text !== 'portal')).toEqual(['one', 'two', 'tail'])
      expect(container.lastChild).toBe(tail)
    } finally {
      root.unmount()
    }
  })

  it('rechecks later siblings when an earlier DOM-owning sibling reveals one', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    let reveal!: (visible: boolean) => void
    let nested = false
    function First({ active }: { active: boolean }) {
      if (active && !nested) {
        nested = true
        flushSync(() => reveal(true))
      }
      return <i>first</i>
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
    try {
      root.render(<Tree active={false} />)
      const first = container.firstChild
      const tail = container.lastChild
      root.render(<Tree active />)
      expect(container.textContent).toBe('firstmiddlelatertail')
      expect(container.firstChild).toBe(first)
      expect(container.lastChild).toBe(tail)
    } finally {
      root.unmount()
    }
  })

  it('rechecks replaced sibling DOM when the parent child count is unchanged', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    let replace!: (replaced: boolean) => void
    let nested = false
    function First({ active }: { active: boolean }) {
      if (active && !nested) {
        nested = true
        flushSync(() => replace(true))
      }
      return null
    }
    function Middle({ active }: { active: boolean }) {
      return active ? <span>middle</span> : null
    }
    function Later() {
      const [replaced, setReplaced] = React.useState(false)
      replace = setReplaced
      return replaced ? <i>later</i> : <span>later</span>
    }
    function Tree({ active }: { active: boolean }) {
      return <><First active={active} /><Middle active={active} /><Later /><b>tail</b></>
    }
    try {
      root.render(<Tree active={false} />)
      const tail = container.lastChild
      root.render(<Tree active />)
      expect(Array.from(container.children, node => node.tagName)).toEqual(['SPAN', 'I', 'B'])
      expect(container.textContent).toBe('middlelatertail')
      expect(container.lastChild).toBe(tail)
    } finally {
      root.unmount()
    }
  })
})
