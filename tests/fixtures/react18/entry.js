import * as React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { flushSync, createPortal } from 'react-dom'
import * as ReactIs from 'react-is'
import { jsx } from 'react/jsx-runtime'
import { renderToString } from 'react-dom/server.browser'

const h = React.createElement
const tick = () => new Promise(resolve => setTimeout(resolve, 30))
globalThis.react18Result = (async () => {
  const context = React.createContext('default')
  const result = {
    // Compare the protocol major. Redact's existing React 19 version string
    // describes its API target, not the installed reference patch version.
    version: React.version.split('.')[0],
    element: ReactIs.isElement(h('span')),
    provider: ReactIs.isContextProvider(h(context.Provider)),
    consumer: ReactIs.isContextConsumer(h(context.Consumer)),
    valid: React.isValidElement(h('span')),
    jsx: ReactIs.isElement(jsx('span', {})),
    clone: ReactIs.isElement(React.cloneElement(h('span'), { title: 'clone' })),
  }
  result.ssr = renderToString(h(context.Provider, { value: 'server' },
    h(context.Consumer, null, value => h('button', null, value))))
  const container = document.getElementById('root')
  const portal = document.getElementById('portal')
  const ref = React.createRef()
  let update
  const events = []
  const Child = React.memo(React.forwardRef(function Child(_, ref) {
    const value = React.useContext(context)
    React.useImperativeHandle(ref, () => ({ value }), [value])
    return h('b', null, value)
  }))
  function App() {
    const [value, setValue] = React.useState(0)
    update = setValue
    React.useLayoutEffect(() => { events.push(`mount:${value}`); return () => events.push(`cleanup:${value}`) }, [value])
    return h(context.Provider, { value: `value:${value}` },
      h(Child, { ref }),
      h(context.Consumer, null, value => h('i', null, value)),
      h('button', { onClick: () => setValue(v => v + 1) }, value),
      createPortal(h('span', null, value), portal),
      [1, 2, 3].slice().sort((a, b) => value ? b - a : a - b).map(n => h('em', { key: n }, n)))
  }
  const root = createRoot(container)
  flushSync(() => root.render(h(App)))
  result.initial = container.innerHTML
  result.ref = ref.current.value
  const keyed = container.querySelector('em')
  flushSync(() => update(1))
  result.updated = container.innerHTML
  result.keyPreserved = container.querySelectorAll('em')[2] === keyed
  result.updatedRef = ref.current.value
  container.querySelector('button').click()
  await tick()
  result.clicked = container.textContent
  result.portal = portal.innerHTML
  flushSync(() => root.unmount())
  result.cleaned = ref.current === null && portal.innerHTML === ''
  result.effects = events
  container.innerHTML = '<button>server</button>'
  const serverNode = container.firstChild
  let clicked = false
  const hydrated = hydrateRoot(container, h('button', { onClick: () => { clicked = true } }, 'server'))
  await tick()
  container.firstChild.click()
  result.hydration = { reused: container.firstChild === serverNode, clicked }
  flushSync(() => hydrated.unmount())
  container.innerHTML = '<output>server</output>'
  const storeServerNode = container.firstChild
  const hydrationSnapshots = []
  function HydratingStore() {
    const value = React.useSyncExternalStore(() => () => {}, () => 'client', () => 'server')
    hydrationSnapshots.push(value)
    return h('output', null, value)
  }
  const storeHydrationRoot = hydrateRoot(container, h(HydratingStore))
  await tick()
  result.storeHydration = {
    snapshots: hydrationSnapshots,
    text: container.textContent,
    reused: container.firstChild === storeServerNode,
  }
  flushSync(() => storeHydrationRoot.unmount())
  const storeListeners = new Set()
  let snapshot = 'initial'
  function Store() {
    const value = React.useSyncExternalStore(listener => {
      storeListeners.add(listener)
      return () => storeListeners.delete(listener)
    }, () => snapshot, () => 'server')
    return h('output', null, value)
  }
  const storeRoot = createRoot(container)
  flushSync(() => storeRoot.render(h(Store)))
  await tick()
  flushSync(() => { snapshot = 'changed'; storeListeners.forEach(listener => listener()) })
  result.store = container.textContent
  flushSync(() => storeRoot.unmount())
  result.storeCleaned = storeListeners.size === 0
  let resolveLazy
  const Lazy = React.lazy(() => new Promise(resolve => { resolveLazy = resolve }))
  const lazyRoot = createRoot(container)
  flushSync(() => lazyRoot.render(h(React.Suspense, { fallback: h('span', null, 'loading') }, h(Lazy))))
  result.fallback = container.textContent
  resolveLazy({ default: () => h('strong', null, 'loaded') })
  for (let i = 0; i < 40 && container.textContent !== 'loaded'; i++) await tick()
  result.lazy = container.textContent
  flushSync(() => lazyRoot.unmount())
  return result
})()
