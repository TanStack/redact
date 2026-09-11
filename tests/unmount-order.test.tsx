import { expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

it('runs cleanup against intact DOM and removes only the outer host, matching React', () => {
  const events: string[] = []
  const tag = 'redact-unmount-order-probe'
  if (!customElements.get(tag)) {
    customElements.define(tag, class extends HTMLElement {
      disconnectedCallback() { this.dispatchEvent(new Event('probe-disconnected')) }
    })
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let section: HTMLElement | null = null
  const sectionRef = {
    get current() { return section },
    set current(node: HTMLElement | null) {
      if (!node && section) events.push(`section-ref:${section.isConnected}:${section.childNodes.length}`)
      section = node
    },
  }
  function Child() {
    React.useLayoutEffect(() => () => { events.push(`effect-cleanup:${container.childNodes.length}`) }, [])
    return <section ref={sectionRef}>
      <span ref={(node: HTMLSpanElement | null) => {
        if (node) return () => { events.push(`span-cleanup:${node.isConnected}:${node.childNodes.length}`) }
      }}>text</span>
      {React.createElement(tag, null)}
    </section>
  }
  const removeChild = Node.prototype.removeChild
  let spy: { mockRestore(): void } | undefined
  try {
    flushSync(() => root.render(<Child />))
    container.querySelector(tag)!.addEventListener('probe-disconnected', () => events.push('custom-disconnected'))
    spy = vi.spyOn(Node.prototype, 'removeChild').mockImplementation(function (this: Node, node: Node) {
      events.push(`remove:${node.nodeName}`)
      return removeChild.call(this, node)
    })
    flushSync(() => root.render(null))
    expect(events).toEqual([
      'effect-cleanup:1',
      'section-ref:true:2',
      'span-cleanup:true:1',
      'remove:SECTION',
      'custom-disconnected',
    ])
    expect(container.childNodes.length).toBe(0)
  } finally {
    spy?.mockRestore()
    flushSync(() => root.unmount())
    container.remove()
  }
})
