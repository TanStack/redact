import { expect, it } from 'vitest'
import { Component, PureComponent, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToString } from 'react-dom/server'
for (const Base of [Component, PureComponent]) {
 it(`supports ES5 subclasses of ${Base.name} on the client and server`, () => {
  function Legacy(this: any, props: any) { Base.call(this, props); this.state = { count: 1 } }
  Legacy.prototype = Object.create(Base.prototype)
  Legacy.prototype.constructor = Legacy
  Legacy.prototype.render = function() { return h('p', null, this.props.label + ' ' + this.state.count) }
  const element = h(Legacy, { label: 'legacy' })
  expect(renderToString(element)).toContain('legacy 1')
  const container = document.createElement('div'), root = createRoot(container)
  try { flushSync(() => root.render(element)); expect(container.textContent).toBe('legacy 1') }
  finally { flushSync(() => root.unmount()) }
 })
}
it('gives each function-constructed instance its own mutable fields', () => {
 const first = new Component({}), second = new Component({})
 expect(first.state).not.toBe(second.state); expect(first.refs).not.toBe(second.refs)
 expect(first).toBeInstanceOf(Component)
 expect(new PureComponent({})).toBeInstanceOf(Component)
})
