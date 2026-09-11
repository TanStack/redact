import { afterEach, describe, expect, it } from 'vitest'
import * as React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToString } from 'react-dom/server'

const roots: Array<ReturnType<typeof createRoot>> = []

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  return { container, root }
}

afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
  document.body.replaceChildren()
})

describe('React 19.3 DOM compatibility', () => {
  // https://github.com/react/react/pull/36148
  it.each([true, false, 'true', 'false', 1, 0])('handles credentialless=%s as a boolean attribute in DOM and SSR', (value) => {
    const vnode = <iframe credentialless={value} />
    const { container, root } = setup()
    root.render(vnode)
    const check = (element: Element) => {
      expect(element.getAttribute('credentialless')).toBe(value ? '' : null)
    }
    check(container.firstElementChild!)
    const serverContainer = document.createElement('div')
    serverContainer.innerHTML = renderToString(vnode)
    check(serverContainer.firstElementChild!)
    const hydrated = hydrateRoot(serverContainer, vnode)
    roots.push(hydrated)
    flushSync(() => {})
    check(serverContainer.firstElementChild!)
    flushSync(() => root.render(<iframe credentialless={false} />))
    expect(container.firstElementChild!.hasAttribute('credentialless')).toBe(false)
  })

  // https://github.com/react/react/pull/35921
  it('uses mask-type for SVG maskType on mount, update, and the server', () => {
    const { container, root } = setup()
    const vnode = <svg><mask maskType="alpha" /></svg>
    root.render(vnode)
    const mask = container.querySelector('mask')!
    expect(mask.getAttribute('mask-type')).toBe('alpha')
    expect(mask.hasAttribute('masktype')).toBe(false)
    expect(renderToString(vnode)).toContain('mask-type="alpha"')
    flushSync(() => root.render(<svg><mask maskType="luminance" /></svg>))
    expect(mask.getAttribute('mask-type')).toBe('luminance')
    flushSync(() => root.render(<svg><mask /></svg>))
    expect(mask.hasAttribute('mask-type')).toBe(false)
  })

  // https://github.com/react/react/pull/37389
  it('preserves source, oldState, and newState on toggle events', () => {
    const { container, root } = setup()
    const events: any[] = []
    root.render(<><button /><div onToggle={(event: any) => events.push(event)} /></>)
    const source = container.querySelector('button')!
    const target = container.querySelector('div')!
    const event = new Event('toggle', { bubbles: false })
    Object.assign(event, { source, oldState: 'closed', newState: 'open' })
    target.dispatchEvent(event)
    expect(events).toHaveLength(1)
    expect(events[0].source).toBe(source)
    expect(events[0].oldState).toBe('closed')
    expect(events[0].newState).toBe('open')
    expect(events[0].nativeEvent).toBe(event)
  })

  // https://github.com/react/react/pull/35590
  it('preserves submitter on submit events', () => {
    const { container, root } = setup()
    const events: any[] = []
    root.render(<form onSubmit={(event: any) => { event.preventDefault(); events.push(event) }}><button /></form>)
    const submitter = container.querySelector('button')!
    const event = new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter })
    submitter.dispatchEvent(event)
    expect(events).toHaveLength(1)
    expect(events[0].submitter).toBe(submitter)
    expect(events[0].nativeEvent).toBe(event)
    expect(event.defaultPrevented).toBe(true)
  })

  // https://github.com/react/react/pull/34621
  it.each(['FullscreenChange', 'FullscreenError'])('supports on%s capture and bubble handlers', (name) => {
    const { container, root } = setup()
    const calls: string[] = []
    root.render(React.createElement('div', {
      ['on' + name + 'Capture']: () => calls.push('capture'),
      ['on' + name]: () => calls.push('bubble'),
    }, <span />))
    container.querySelector('span')!.dispatchEvent(new Event(name.toLowerCase(), { bubbles: true }))
    expect(calls).toEqual(['capture', 'bubble'])
  })

  // https://github.com/react/react/pull/36949
  it.each(['div', 'custom-content'])('keeps existing %s children when the innerHTML string is unchanged', (tag) => {
    const { container, root } = setup()
    root.render(React.createElement(tag, { dangerouslySetInnerHTML: { __html: '<span>before</span>' } }))
    const host = container.firstElementChild!
    const child = host.firstChild
    flushSync(() => root.render(React.createElement(tag, { dangerouslySetInnerHTML: { __html: '<span>before</span>' } })))
    expect(host.firstChild).toBe(child)
    flushSync(() => root.render(React.createElement(tag, { dangerouslySetInnerHTML: { __html: '<span>after</span>' } })))
    expect(host.firstChild).not.toBe(child)
    expect(host.innerHTML).toBe('<span>after</span>')
  })
})
