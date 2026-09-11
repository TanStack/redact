import { afterEach, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createPortal, flushSync, preinit, preload } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'

const roots: Root[] = [], containers: Element[] = []
let nextId = 0
const href = () => `shadow-resource-${++nextId}`
function mount(container: Element | DocumentFragment, children: React.ReactNode) {
  const root = createRoot(container)
  roots.push(root)
  flushSync(() => root.render(children))
  return root
}
function unmount(root: Root) {
  roots.splice(roots.indexOf(root), 1)
  flushSync(() => root.unmount())
}
function shadow() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  containers.push(host)
  const root = host.attachShadow({ mode: 'open' })
  const container = document.createElement('main')
  root.appendChild(container)
  return { host, root, container }
}
function lightContainer() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  containers.push(container)
  return container
}
afterEach(() => {
  for (const root of roots.splice(0)) flushSync(() => root.unmount())
  for (const container of containers.splice(0)) container.remove()
  for (const style of document.head.querySelectorAll('style[data-href^="shadow-resource-"]')) style.remove()
  for (const link of document.head.querySelectorAll('link[href*="shadow-resource-"]')) link.remove()
})

it.each(['shadow-root', 'nested-container'])('hoists declarative inline styles into the containing shadow root from %s', target => {
  const tree = shadow(), name = href(), ref = React.createRef<HTMLStyleElement>()
  mount(target === 'shadow-root' ? tree.root : tree.container, <section>
    <style href={name} precedence="theme" ref={ref}>{'.target { color: red }'}</style>
    <b className="target">inside</b>
  </section>)
  const style = ref.current
  expect(style?.parentNode).toBe(tree.root)
  expect(style?.getRootNode()).toBe(tree.root)
  expect(style?.getAttribute('data-href')).toBe(name)
  expect(style?.getAttribute('data-precedence')).toBe('theme')
  expect(style?.hasAttribute('href')).toBe(false)
  expect(style?.hasAttribute('precedence')).toBe(false)
  expect(tree.root.querySelector('section > style')).toBeNull()
  expect(document.head.querySelector(`style[data-href="${name}"]`)).toBeNull()
})

it('deduplicates inline styles across independent React roots in one shadow root and retains them after unmount', () => {
  const tree = shadow(), name = href()
  const secondContainer = document.createElement('aside')
  tree.root.appendChild(secondContainer)
  const first = React.createRef<HTMLStyleElement>(), repeated = React.createRef<HTMLStyleElement>(), second = React.createRef<HTMLStyleElement>()
  const firstRoot = mount(tree.container, <>
    <style href={name} precedence="theme" ref={first}>first</style>
    <style href={name} precedence="theme" ref={repeated}>ignored</style>
  </>)
  const secondRoot = mount(secondContainer, <style href={name} precedence="theme" ref={second}>also ignored</style>)
  const node = first.current
  expect(node?.parentNode).toBe(tree.root)
  expect(first.current).toBe(repeated.current)
  expect(first.current).toBe(second.current)
  expect(tree.root.querySelectorAll(`style[data-href="${name}"]`)).toHaveLength(1)
  expect(node?.textContent).toBe('first')
  unmount(firstRoot); unmount(secondRoot)
  expect(node?.isConnected).toBe(true)
  expect(node?.parentNode).toBe(tree.root)
  expect(first.current).toBeNull()
  expect(second.current).toBeNull()
})

it('isolates the same inline style href between the document and two shadow roots', () => {
  const firstTree = shadow(), secondTree = shadow(), name = href()
  const light = React.createRef<HTMLStyleElement>(), first = React.createRef<HTMLStyleElement>(), second = React.createRef<HTMLStyleElement>()
  mount(lightContainer(), <style href={name} precedence="theme" ref={light}>document</style>)
  mount(firstTree.container, <style href={name} precedence="theme" ref={first}>first shadow</style>)
  mount(secondTree.container, <style href={name} precedence="theme" ref={second}>second shadow</style>)
  expect(light.current?.parentNode).toBe(document.head)
  expect(first.current?.parentNode).toBe(firstTree.root)
  expect(second.current?.parentNode).toBe(secondTree.root)
  expect(new Set([light.current, first.current, second.current]).size).toBe(3)
  expect([light.current?.textContent, first.current?.textContent, second.current?.textContent]).toEqual(['document', 'first shadow', 'second shadow'])
})

it.each(['shadow-root', 'nested-container'])('uses a portal target shadow root for inline style ownership, target=%s', target => {
  const tree = shadow(), name = href(), ref = React.createRef<HTMLStyleElement>()
  const Context = React.createContext('default')
  function Content() { return <b>{React.useContext(Context)}</b> }
  mount(lightContainer(), <Context.Provider value="from parent">{createPortal(<section>
    <style href={name} precedence="theme" ref={ref}>portal style</style><Content />
  </section>, target === 'shadow-root' ? tree.root : tree.container)}</Context.Provider>)
  expect(ref.current?.parentNode).toBe(tree.root)
  expect(ref.current?.getRootNode()).toBe(tree.root)
  expect(tree.root.querySelector('b')?.textContent).toBe('from parent')
  expect(document.head.querySelector(`style[data-href="${name}"]`)).toBeNull()
})

it('shares inline style ownership between a direct root and a portal into the same shadow root', () => {
  const tree = shadow(), name = href()
  const portalContainer = document.createElement('aside')
  tree.root.appendChild(portalContainer)
  const direct = React.createRef<HTMLStyleElement>(), portal = React.createRef<HTMLStyleElement>()
  mount(tree.container, <style href={name} precedence="theme" ref={direct}>direct</style>)
  mount(lightContainer(), createPortal(<style href={name} precedence="theme" ref={portal}>ignored</style>, portalContainer))
  expect(direct.current?.parentNode).toBe(tree.root)
  expect(portal.current).toBe(direct.current)
  expect(tree.root.querySelectorAll(`style[data-href="${name}"]`)).toHaveLength(1)
  expect(portal.current?.textContent).toBe('direct')
})

it('groups precedence only within the owning shadow root', () => {
  const tree = shadow(), global = href(), first = href(), base = href(), second = href()
  mount(lightContainer(), <style href={global} precedence="theme">document</style>)
  mount(tree.container, <>
    <style href={first} precedence="theme">first</style>
    <style href={base} precedence="base">base</style>
    <style href={second} precedence="theme">second</style>
  </>)
  expect([...tree.root.querySelectorAll('style[data-precedence]')].map(node => node.getAttribute('data-href'))).toEqual([first, second, base])
  expect([...document.head.querySelectorAll('style[data-href^="shadow-resource-"]')].map(node => node.getAttribute('data-href'))).toEqual([global])
})

it('adopts a matching existing inline style from its shadow root without borrowing the document copy', () => {
  const tree = shadow(), name = href(), ref = React.createRef<HTMLStyleElement>()
  const existing = document.createElement('style'), outside = document.createElement('style')
  for (const style of [existing, outside]) {
    style.setAttribute('data-href', name)
    style.setAttribute('data-precedence', 'theme')
  }
  existing.textContent = 'shadow existing'; outside.textContent = 'document existing'
  tree.root.insertBefore(existing, tree.container)
  document.head.appendChild(outside)
  mount(tree.container, <style href={name} precedence="theme" ref={ref}>ignored</style>)
  expect(ref.current).toBe(existing)
  expect(tree.root.querySelectorAll(`style[data-href="${name}"]`)).toHaveLength(1)
  expect(existing.textContent).toBe('shadow existing')
  expect(outside.textContent).toBe('document existing')
})

function stylesheet(name: string) {
  const link = document.createElement('link')
  link.setAttribute('rel', 'stylesheet')
  link.setAttribute('href', name)
  link.setAttribute('data-precedence', 'theme')
  return link
}

async function finishStylesheet(root: ShadowRoot, name: string, ref: React.RefObject<HTMLLinkElement | null>) {
  // jsdom does not load external CSS. Supply network completion explicitly;
  // these assertions concern ownership, not React's commit deferral.
  for (const link of document.head.querySelectorAll(`link[href="${name}"]`)) link.dispatchEvent(new Event('load'))
  await vi.waitFor(() => expect(root.querySelector(`link[rel="stylesheet"][href="${name}"]`)).not.toBeNull())
  const link = root.querySelector(`link[rel="stylesheet"][href="${name}"]`)!
  link.dispatchEvent(new Event('load'))
  await vi.waitFor(() => expect(ref.current).toBe(link))
}

it('adopts an existing external stylesheet from its owning shadow root', () => {
  const tree = shadow(), name = `/${href()}.css`, ref = React.createRef<HTMLLinkElement>()
  const existing = stylesheet(name)
  tree.root.insertBefore(existing, tree.container)
  mount(tree.container, <section><link rel="stylesheet" href={name} precedence="theme" ref={ref} /><b>ready</b></section>)
  expect(ref.current).toBe(existing)
  expect(ref.current?.parentNode).toBe(tree.root)
  expect(tree.root.querySelectorAll(`link[rel="stylesheet"][href="${name}"]`)).toHaveLength(1)
  expect(document.head.querySelector(`link[rel="stylesheet"][href="${name}"]`)).toBeNull()
})

it('keeps separate existing external stylesheet instances in separate shadow roots', () => {
  const firstTree = shadow(), secondTree = shadow(), name = `/${href()}.css`
  const first = stylesheet(name), second = stylesheet(name)
  firstTree.root.insertBefore(first, firstTree.container)
  secondTree.root.insertBefore(second, secondTree.container)
  const firstRef = React.createRef<HTMLLinkElement>(), secondRef = React.createRef<HTMLLinkElement>()
  mount(firstTree.container, <link rel="stylesheet" href={name} precedence="theme" ref={firstRef} />)
  mount(secondTree.container, <link rel="stylesheet" href={name} precedence="theme" ref={secondRef} />)
  expect(firstRef.current).toBe(first)
  expect(secondRef.current).toBe(second)
  expect(firstRef.current).not.toBe(secondRef.current)
})

it('adopts a preexisting document stylesheet before a shadow-local copy, matching React', () => {
  const tree = shadow(), name = `/${href()}.css`, ref = React.createRef<HTMLLinkElement>()
  const outside = stylesheet(name), inside = stylesheet(name)
  document.head.appendChild(outside)
  tree.root.insertBefore(inside, tree.container)
  mount(tree.container, <link rel="stylesheet" href={name} precedence="theme" ref={ref} />)
  expect(ref.current).toBe(outside)
  expect(inside.parentNode).toBe(tree.root)
})

it('creates an external stylesheet within a shadow root when none exists', async () => {
  const tree = shadow(), name = `/${href()}.css`, ref = React.createRef<HTMLLinkElement>()
  mount(tree.container, <section><link rel="stylesheet" href={name} precedence="theme" ref={ref} /><b>ready</b></section>)
  await finishStylesheet(tree.root, name, ref)
  expect(ref.current?.parentNode).toBe(tree.root)
  expect(ref.current?.getAttribute('href')).toBe(name)
  expect(document.head.querySelector(`link[rel="stylesheet"][href="${name}"]`)).toBeNull()
})

it('keeps preinitialized document stylesheets separate from newly declared shadow stylesheets', async () => {
  const tree = shadow(), name = `/${href()}.css`, ref = React.createRef<HTMLLinkElement>()
  preinit(name, { as: 'style', precedence: 'theme' })
  const outside = document.head.querySelector(`link[rel="stylesheet"][href="${name}"]`)
  mount(tree.container, <link rel="stylesheet" href={name} precedence="theme" ref={ref} />)
  await finishStylesheet(tree.root, name, ref)
  expect(outside).not.toBeNull()
  expect(ref.current?.parentNode).toBe(tree.root)
  expect(ref.current).not.toBe(outside)
  expect(outside?.parentNode).toBe(document.head)
})

it('adopts document-scoped preload options without moving hints into shadow roots', async () => {
  const tree = shadow(), name = `/${href()}.css`, ref = React.createRef<HTMLLinkElement>()
  preload(name, { as: 'style', crossOrigin: 'use-credentials', referrerPolicy: 'no-referrer' })
  mount(tree.container, <link rel="stylesheet" href={name} precedence="theme" ref={ref} />)
  await finishStylesheet(tree.root, name, ref)
  expect(ref.current?.parentNode).toBe(tree.root)
  expect(ref.current?.getAttribute('crossorigin')).toBe('use-credentials')
  expect(ref.current?.getAttribute('referrerpolicy')).toBe('no-referrer')
  expect(document.head.querySelectorAll(`link[rel="preload"][href="${name}"]`)).toHaveLength(1)
  expect(tree.root.querySelector('link[rel="preload"]')).toBeNull()
})
