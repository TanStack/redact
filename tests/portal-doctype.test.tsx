/**
 * Regressions:
 *
 * 1. Portal elements were silently dropped by `pushChildren` because its
 *    element-type guard only accepted REACT_ELEMENT_TYPE /
 *    REACT_LEGACY_ELEMENT_TYPE — portals carry REACT_PORTAL_TYPE as their
 *    `$$typeof`. `fiberFromChild` also bucketed them wrong (it read
 *    `element.type.$$typeof`, but for a portal `element.type` is the
 *    REACT_PORTAL_TYPE symbol and has no `$$typeof`). Together, portals
 *    never rendered — every Radix/Floating-UI dropdown, dialog, or tooltip
 *    silently vanished.
 *
 * 2. SSR didn't emit `<!DOCTYPE html>`. Without the doctype, browsers use
 *    "BackCompat" (quirks) mode — `document.documentElement.clientHeight`
 *    returns content height instead of viewport height, CSS sizing breaks,
 *    and viewport-relative positioning (Floating UI middleware, sticky
 *    elements) collapses.
 */
import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import { renderToString } from 'react-dom/server'

function setup() {
  const c = document.createElement('div')
  document.body.appendChild(c)
  return c
}

describe('createPortal renders into target container', () => {
  it('mounts portal children into the supplied container', async () => {
    const container = setup()
    const portalHost = document.createElement('section')
    portalHost.id = 'portal-host'
    document.body.appendChild(portalHost)

    function App() {
      return (
        <div data-testid="app-root">
          <span>in-tree</span>
          {createPortal(<em data-testid="portal-child">portaled</em>, portalHost)}
        </div>
      )
    }
    createRoot(container).render(<App />)
    await Promise.resolve()

    // In-tree child rendered into `container`
    const appRoot = container.querySelector('[data-testid="app-root"]')!
    expect(appRoot.querySelector('span')?.textContent).toBe('in-tree')
    // Portal child rendered into the portal host (NOT in the root container)
    expect(portalHost.querySelector('em[data-testid="portal-child"]')?.textContent).toBe(
      'portaled',
    )
    expect(container.querySelector('em[data-testid="portal-child"]')).toBeNull()

    document.body.removeChild(portalHost)
  })

  it('unmounts portal children when the parent stops rendering them', async () => {
    const container = setup()
    const portalHost = document.createElement('section')
    document.body.appendChild(portalHost)

    function App({ show }: { show: boolean }) {
      return (
        <div>{show ? createPortal(<b data-testid="p">x</b>, portalHost) : null}</div>
      )
    }
    const root = createRoot(container)
    root.render(<App show={true} />)
    await Promise.resolve()
    expect(portalHost.querySelector('[data-testid="p"]')).not.toBeNull()

    root.render(<App show={false} />)
    await Promise.resolve()
    expect(portalHost.querySelector('[data-testid="p"]')).toBeNull()

    document.body.removeChild(portalHost)
  })

  it('renders portal alongside sibling elements correctly', async () => {
    // Repro shape of Radix DropdownMenu: a Trigger element in the tree, plus
    // a Content element rendered via portal into document.body.
    const container = setup()
    const portalHost = document.createElement('section')
    document.body.appendChild(portalHost)

    function DropdownMenu() {
      return (
        <>
          <button data-testid="trigger">toggle</button>
          {createPortal(
            <div role="menu" data-testid="menu">
              <a data-testid="item">item</a>
            </div>,
            portalHost,
          )}
        </>
      )
    }
    createRoot(container).render(<DropdownMenu />)
    await Promise.resolve()

    expect(container.querySelector('[data-testid="trigger"]')).not.toBeNull()
    expect(portalHost.querySelector('[role="menu"]')).not.toBeNull()
    expect(portalHost.querySelectorAll('[data-testid="item"]').length).toBe(1)

    document.body.removeChild(portalHost)
  })
})

describe('SSR emits <!DOCTYPE html> for html roots', () => {
  it('prepends a DOCTYPE when the root element is <html>', () => {
    function Doc() {
      return (
        <html lang="en">
          <head>
            <title>hi</title>
          </head>
          <body>
            <main>ok</main>
          </body>
        </html>
      )
    }
    const html = renderToString(<Doc />)
    // Must start with doctype — otherwise browser uses quirks mode and
    // documentElement.clientHeight (used by Floating-UI etc.) returns
    // content height instead of viewport height, breaking overlays.
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('<html')
    expect(html).toContain('<main>ok</main>')
  })

  it('does not prepend a DOCTYPE for non-html roots', () => {
    const html = renderToString(<div>not a doc</div>)
    expect(html.startsWith('<!DOCTYPE html>')).toBe(false)
    expect(html.startsWith('<div')).toBe(true)
  })
})
