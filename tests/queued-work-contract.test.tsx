import { afterEach, expect, it } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })
function setup() {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  cleanups.push(() => { flushSync(() => root.unmount()); container.remove() })
  return { root, container }
}
it('commits queued child state before a rerendered parent reads its DOM in layout', () => {
  const { root, container } = setup()
  let update!: () => void
  const layouts: string[] = []
  function Child() {
    const [value, setValue] = React.useState(0)
    update = () => setValue(n => n + 1)
    return <p>{value}</p>
  }
  function Parent({ tick }: { tick: number }) {
    const child = React.useMemo(() => <Child />, [])
    React.useLayoutEffect(() => { layouts.push(`${tick}:${container.querySelector('p')?.textContent}`) })
    return child
  }
  flushSync(() => root.render(<Parent tick={0} />))
  flushSync(() => { root.render(<Parent tick={1} />); update() })
  expect(container.textContent).toBe('1')
  expect(layouts).toEqual(['0:0', '1:1'])
})
it('updates a nested context reader without rerendering its cached nonreading wrapper', () => {
  const { root, container } = setup()
  const Context = React.createContext('first')
  let update!: () => void
  let wrapperRenders = 0, wrapperEffects = 0, readerRenders = 0
  function Reader() { readerRenders++; return <p>{React.useContext(Context)}</p> }
  function Wrapper() {
    wrapperRenders++
    React.useLayoutEffect(() => { wrapperEffects++ })
    return <Reader />
  }
  function Parent() {
    const [value, setValue] = React.useState('first')
    update = () => setValue('second')
    const child = React.useMemo(() => <Wrapper />, [])
    return <Context.Provider value={value}>{child}</Context.Provider>
  }
  flushSync(() => root.render(<Parent />))
  flushSync(update)
  expect(container.textContent).toBe('second')
  expect([wrapperRenders, wrapperEffects, readerRenders]).toEqual([1, 1, 2])
})

it('runs queued child layout work before parent layout through a cached nonreader', () => {
  const { root, container } = setup()
  const log: string[] = []
  let update!: () => void
  let wrappers = 0
  function Child() {
    const [value, setValue] = React.useState(0)
    update = () => setValue(n => n + 1)
    React.useLayoutEffect(() => { log.push(`child:${value}`) })
    return <p>{value}</p>
  }
  function Wrapper() { wrappers++; return <Child /> }
  function Parent({ tick }: { tick: number }) {
    const child = React.useMemo(() => <Wrapper />, [])
    React.useLayoutEffect(() => { log.push(`parent:${tick}:${container.textContent}`) })
    return child
  }
  flushSync(() => root.render(<Parent tick={0} />))
  expect(log).toEqual(['child:0', 'parent:0:0'])
  log.length = 0
  flushSync(() => { root.render(<Parent tick={1} />); update() })
  expect(container.textContent).toBe('1')
  expect(wrappers).toBe(1)
  expect(log).toEqual(['child:1', 'parent:1:1'])
})
