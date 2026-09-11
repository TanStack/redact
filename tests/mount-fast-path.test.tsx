import { afterEach, expect, it } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'

const cleanup: Array<() => void> = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
})

it('repairs external DOM moves after mounting a sibling group before an existing tail', () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  cleanup.push(() => root.unmount())
  const ref = React.createRef<HTMLSpanElement>()
  function Empty() { return null }
  function Group({ visible, repair }: { visible: boolean; repair: boolean }) {
    return visible ? <>
      <span ref={ref}>first</span>
      <span>second</span>
      {!repair && <Empty />}
    </> : null
  }
  const view = (visible: boolean, repair = false) => <><Group visible={visible} repair={repair} /><b>tail</b></>
  root.render(view(false))
  const tail = container.lastChild
  root.render(view(true))
  container.appendChild(ref.current!)
  expect(container.textContent).toBe('secondtailfirst')
  root.render(view(true, true))
  expect(container.textContent).toBe('firstsecondtail')
  expect(container.lastChild).toBe(tail)
})

it('keeps nested fragments and portal children separate on first mount and remount', () => {
  const container = document.createElement('div')
  const portal = document.createElement('div')
  const root = createRoot(container)
  cleanup.push(() => root.unmount())
  function Group({ visible }: { visible: boolean }) {
    return visible ? <>
      <><span>first</span>{null}<span>second</span></>
      {createPortal(<><i>portal one</i><i>portal two</i></>, portal)}
      <span>third</span>
    </> : null
  }
  const view = (visible: boolean) => <><Group visible={visible} /><b>tail</b></>
  root.render(view(false))
  const tail = container.lastChild
  for (let cycle = 0; cycle < 3; cycle++) {
    root.render(view(true))
    expect(container.textContent).toBe('firstsecondthirdtail')
    expect(portal.textContent).toBe('portal oneportal two')
    expect(container.lastChild).toBe(tail)
    root.render(view(false))
    expect(container.textContent).toBe('tail')
    expect(portal.childNodes.length).toBe(0)
  }
})
