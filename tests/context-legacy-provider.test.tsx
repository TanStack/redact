import { describe, expect, it } from 'vitest'
import { createContext, createElement, useContext } from 'react'
import { renderToString } from 'react-dom/server'

// Keep accepting the older provider marker alongside React 19 contexts.
describe('legacy provider compatibility', () => {
  it('supports legacy provider objects on the server', () => {
    const Context = createContext('default')
    const Provider = { $$typeof: Symbol.for('react.provider'), _context: Context }
    function Reader() { return <b>{useContext(Context)}</b> }
    expect(renderToString(createElement(Provider, { value: 'legacy' }, <Reader />))).toBe('<b>legacy</b>')
    expect(renderToString(<Reader />)).toBe('<b>default</b>')
  })
})
