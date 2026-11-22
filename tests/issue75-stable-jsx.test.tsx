import { expect, it } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
it('retains stable JSX work while descendant state and context can still update', () => {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  const Context = React.createContext('first')
  let parent!: () => void, child!: () => void, changeContext!: () => void
  let renders = 0, effects = 0
  function Child() {
    renders++
    const [value, setValue] = React.useState(0)
    const context = React.useContext(Context)
    child = () => setValue(n => n + 1)
    React.useLayoutEffect(() => { effects++ })
    return <p>{context}:{value}</p>
  }
  function Wrapper() { return <Child /> }
  function App() {
    const [value, setValue] = React.useState(0), [context, setContext] = React.useState('first')
    parent = () => setValue(n => n + 1)
    changeContext = () => setContext('second')
    const stable = React.useMemo(() => <Wrapper />, [])
    return <Context.Provider value={context}><span>{value}</span>{stable}</Context.Provider>
  }
  try {
    flushSync(() => root.render(<App />))
    for (let i = 0; i < 5; i++) flushSync(parent)
    expect([renders, effects]).toEqual([1, 1])
    flushSync(child)
    expect(container.querySelector('p')!.textContent).toBe('first:1')
    expect([renders, effects]).toEqual([2, 2])
    flushSync(changeContext)
    expect(container.querySelector('p')!.textContent).toBe('second:1')
    expect([renders, effects]).toEqual([3, 3])
  } finally { flushSync(() => root.unmount()); container.remove() }
})
