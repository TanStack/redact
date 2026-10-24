import { afterEach, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, hydrateRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { renderToString } from 'react-dom/server'

const roots: Root[] = []
const containers: Element[] = []
afterEach(() => {
  for (const root of roots.splice(0)) flushSync(() => root.unmount())
  for (const container of containers.splice(0)) container.remove()
  vi.restoreAllMocks()
})
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 30))
function container(markup: string) {
  const element = document.createElement('div')
  element.innerHTML = markup
  document.body.append(element)
  containers.push(element)
  return element
}

it('preserves HTML-parser SVG casing during hydration and later updates', async () => {
  const tree = (units: string) => <svg viewBox="0 0 10 10"><defs><filter id="filter" filterUnits={units}><feGaussianBlur stdDeviation="2" /></filter><linearGradient id="gradient" gradientUnits={units} gradientTransform="rotate(45)" /><clipPath id="clip" clipPathUnits={units}><path d="M0 0" /></clipPath></defs><path clipPath="url(#clip)" strokeWidth={2}/></svg>
  const element = container(renderToString(tree('userSpaceOnUse')))
  const original = element.querySelector('clipPath')!
  const errors: unknown[] = []
  const root = hydrateRoot(element, tree('userSpaceOnUse'), { onRecoverableError: error => errors.push(error) })
  roots.push(root)
  await tick()
  expect(element.querySelector('clipPath')).toBe(original)
  expect(errors).toEqual([])
  expect(element.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 10 10')
  expect(element.querySelector('linearGradient')!.getAttribute('gradientUnits')).toBe('userSpaceOnUse')
  expect(element.querySelector('linearGradient')!.getAttribute('gradientTransform')).toBe('rotate(45)')
  expect(original.getAttribute('clipPathUnits')).toBe('userSpaceOnUse')
  expect(original.hasAttribute('clip-path-units')).toBe(false)
  flushSync(() => root.render(tree('objectBoundingBox')))
  expect(original.getAttribute('clipPathUnits')).toBe('objectBoundingBox')
  expect(element.querySelector('linearGradient')!.getAttribute('gradientUnits')).toBe('objectBoundingBox')
  expect(element.querySelector('filter')!.getAttribute('filterUnits')).toBe('objectBoundingBox')
  expect(element.querySelector('feGaussianBlur')!.getAttribute('stdDeviation')).toBe('2')
  expect(element.querySelector('svg > path')!.getAttribute('stroke-width')).toBe('2')
})

it('does not instantiate custom elements while normalizing opaque hydration markup', async () => {
  let constructions = 0
  const name = 'hydration-probe-' + Math.random().toString(36).slice(2)
  customElements.define(name, class extends HTMLElement { constructor() { super(); constructions++ } })
  const markup = `<${name}></${name}>`
  const tree = <section dangerouslySetInnerHTML={{ __html: markup }} />
  const element = container(renderToString(tree))
  const original = element.firstChild
  expect(constructions).toBe(1)
  const errors: unknown[] = []
  roots.push(hydrateRoot(element, tree, { onRecoverableError: error => errors.push(error) }))
  await tick()
  expect(constructions).toBe(1)
  expect(element.firstChild).toBe(original)
  expect(errors).toEqual([])
})

it('keeps matching opaque stylesheet nodes intact during head hydration', async () => {
  const tree = <html><head><style dangerouslySetInnerHTML={{ __html: '.example { color: red; }' }} /></head><body><p>Ready</p></body></html>
  const doc = document.implementation.createHTMLDocument('')
  doc.documentElement.innerHTML = '<head><style>.example { color: red; }</style></head><body><p>Ready</p></body>'
  const style = doc.querySelector('style')!
  const original = style.firstChild
  const records: MutationRecord[] = []
  const observer = new MutationObserver(next => records.push(...next))
  observer.observe(style, { childList: true, characterData: true, subtree: true })
  const errors: unknown[] = []
  const root = hydrateRoot(doc, tree, { onRecoverableError: error => errors.push(error) })
  roots.push(root)
  await tick()
  records.push(...observer.takeRecords())
  observer.disconnect()
  expect(style.firstChild).toBe(original)
  expect(records).toEqual([])
  expect(errors).toEqual([])
})


const nativeBrowser = typeof navigator !== 'undefined' && !navigator.userAgent.includes('jsdom')
it.skipIf(!nativeBrowser)('does not fetch offscreen lazy images while probing hydration attributes', async () => {
  const url = new URL('/__hydration_probe_image_' + Math.random().toString(36).slice(2) + '.png', location.href).href
  const tree = <img src={url} loading="lazy" alt="Offscreen" style={{ position: 'absolute', top: '100000px' }} />
  const element = container(renderToString(tree))
  await tick()
  const errors: unknown[] = []
  roots.push(hydrateRoot(element, tree, { onRecoverableError: error => errors.push(error) }))
  await new Promise<void>(resolve => setTimeout(resolve, 200))
  expect(performance.getEntriesByName(url)).toHaveLength(0)
  expect(errors).toEqual([])
})

it('still reports genuinely different opaque markup after inert normalization', async () => {
  const element = container('<section><b>Server</b></section>')
  const errors: unknown[] = []
  roots.push(hydrateRoot(element, <section dangerouslySetInnerHTML={{ __html: '<i>Client</i>' }} />, { onRecoverableError: error => errors.push(error) }))
  await tick()
  expect(errors.length).toBeGreaterThan(0)
  expect(element.innerHTML).toContain('<i>Client</i>')
})

for (const suppressed of [false, true]) {
  it(`preserves opaque head recovery policy with suppressed=${suppressed}`, async () => {
    const doc = document.implementation.createHTMLDocument('')
    doc.documentElement.innerHTML = '<head><style>.server{color:red}</style></head><body><p>Ready</p></body>'
    const original = doc.querySelector('style')!
    const errors: unknown[] = []
    roots.push(hydrateRoot(doc, <html><head><style suppressHydrationWarning={suppressed} dangerouslySetInnerHTML={{ __html: '.client{color:blue}' }}/></head><body><p>Ready</p></body></html>, { onRecoverableError: error => errors.push(error) }))
    await tick()
    expect(doc.querySelector('style')).toBe(original)
    expect(original.textContent).toBe(suppressed ? '.server{color:red}' : '.client{color:blue}')
    expect(errors).toHaveLength(suppressed ? 0 : 1)
  })
}


it.skipIf(!nativeBrowser)('preserves opaque noscript fallback and neighboring interactive DOM during hydration', async () => {
  let fallbackRenders = 0
  function Fallback() {
    fallbackRenders++
    return <div>Enable JavaScript</div>
  }
  function App() {
    const [count, setCount] = React.useState(0)
    return <div><noscript><Fallback /></noscript><button onClick={() => setCount(count + 1)}>{count}</button></div>
  }
  const element = container(renderToString(<App />))
  expect(fallbackRenders).toBe(1)
  const fallback = element.querySelector('noscript')!.firstChild!
  expect(fallback.nodeType).toBe(Node.TEXT_NODE)
  const button = element.querySelector('button')!
  const errors: unknown[] = []
  roots.push(hydrateRoot(element, <App />, { onRecoverableError: error => errors.push(error) }))
  await tick()
  expect(fallbackRenders).toBe(1)
  expect(element.querySelector('noscript')!.firstChild).toBe(fallback)
  expect(element.querySelector('button')).toBe(button)
  flushSync(() => button.click())
  expect(button.textContent).toBe('1')
  expect(fallbackRenders).toBe(1)
  expect(element.querySelector('noscript')!.firstChild).toBe(fallback)
  expect(errors).toEqual([])
})

it('does not render noscript child components on client mount or update', () => {
  function Fallback(): React.ReactNode {
    throw new Error('noscript fallback rendered on the client')
  }
  const element = container('')
  const root = createRoot(element)
  roots.push(root)
  flushSync(() => root.render(<noscript><Fallback /></noscript>))
  const fallback = element.querySelector('noscript')!
  expect(fallback.childNodes).toHaveLength(0)
  flushSync(() => root.render(<noscript><Fallback key="next" /></noscript>))
  expect(element.querySelector('noscript')).toBe(fallback)
  expect(fallback.childNodes).toHaveLength(0)
})
