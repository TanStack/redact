import { afterEach, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'

const cleanup: Array<() => void> = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  vi.restoreAllMocks()
})

function setup() {
  const container = document.createElement('div')
  const root = createRoot(container)
  cleanup.push(() => root.unmount())
  return { container, root }
}

it('mounts single host and text children before the stable tail without moving that tail', () => {
  const { container, root } = setup()
  function Item({ mode }: { mode: number }) {
    return mode === 0 ? null : mode === 1 ? <span>host</span> : 'text'
  }
  const view = (mode: number) => <><Item mode={mode} /><b>tail</b></>
  root.render(view(0))
  const tail = container.lastChild
  const insert = vi.spyOn(container, 'insertBefore')
  for (const mode of [1, 2, 0, 2, 1, 0]) {
    root.render(view(mode))
    expect(container.textContent).toBe(`${mode === 1 ? 'host' : mode === 2 ? 'text' : ''}tail`)
    expect(container.lastChild).toBe(tail)
  }
  expect(insert.mock.calls.every(([node]) => node !== tail)).toBe(true)
})

it('repairs a single host moved past its anchor between renders', () => {
  const { container, root } = setup()
  const ref = React.createRef<HTMLSpanElement>()
  function Empty() { return null }
  function Item({ visible, repair }: { visible: boolean; repair: boolean }) {
    return visible ? <><span ref={ref}>item</span>{!repair && <Empty />}</> : null
  }
  const view = (visible: boolean, repair = false) => <><Item visible={visible} repair={repair} /><b>tail</b></>
  root.render(view(false))
  const tail = container.lastChild
  root.render(view(true))
  container.appendChild(ref.current!)
  expect(container.textContent).toBe('tailitem')
  root.render(view(true, true))
  expect(container.textContent).toBe('itemtail')
  expect(container.lastChild).toBe(tail)
})

it('restores a single host moved into another parent between renders', () => {
  const { container, root } = setup()
  const other = document.createElement('div')
  const ref = React.createRef<HTMLSpanElement>()
  function Empty() { return null }
  root.render([<span key="item" ref={ref}>item</span>, <Empty key="empty" />])
  other.appendChild(ref.current!)
  expect(container.childNodes.length).toBe(0)
  root.render([<span key="item" ref={ref}>item</span>])
  expect(container.textContent).toBe('item')
  expect(other.childNodes.length).toBe(0)
})

it('preserves a foreign node between a single host and its anchor', () => {
  const { container, root } = setup()
  const foreign = document.createElement('i')
  foreign.textContent = 'foreign'
  const ref = {
    get current(): HTMLSpanElement | null { return null },
    set current(node: HTMLSpanElement | null) { if (node) node.after(foreign) },
  }
  function Item({ visible }: { visible: boolean }) { return visible ? <span ref={ref}>item</span> : null }
  const view = (visible: boolean) => <><Item visible={visible} /><b>tail</b></>
  root.render(view(false))
  const tail = container.lastChild
  root.render(view(true))
  expect(container.textContent).toBe('itemforeigntail')
  expect(container.lastChild).toBe(tail)
  expect(container.childNodes[1]).toBe(foreign)
})

it('preserves a foreign trailing node when the single host has a null anchor', () => {
  const { container, root } = setup()
  const foreign = document.createComment('foreign')
  const ref = {
    get current(): HTMLSpanElement | null { return null },
    set current(node: HTMLSpanElement | null) { if (node) node.after(foreign) },
  }
  root.render(<span ref={ref}>item</span>)
  expect(container.firstChild?.textContent).toBe('item')
  expect(container.lastChild).toBe(foreign)
})

it('does not treat one fragment or portal child as one host node', () => {
  const { container, root } = setup()
  const portal = document.createElement('div')
  function Item({ visible }: { visible: boolean }) {
    return visible ? <><span>first</span>{createPortal(<i>portal</i>, portal)}<span>second</span></> : null
  }
  const view = (visible: boolean) => <><Item visible={visible} /><b>tail</b></>
  root.render(view(false))
  const tail = container.lastChild
  for (let cycle = 0; cycle < 3; cycle++) {
    root.render(view(true))
    expect(container.textContent).toBe('firstsecondtail')
    expect(container.lastChild).toBe(tail)
    expect(portal.textContent).toBe('portal')
    root.render(view(false))
    expect(container.textContent).toBe('tail')
    expect(portal.childNodes.length).toBe(0)
  }
})
