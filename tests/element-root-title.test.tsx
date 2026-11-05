import { expect, it } from 'vitest'
import { act } from 'react'
import { createPortal } from 'react-dom'
import { createRoot, hydrateRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'

it('places an element-root title before the shell and restores the shell through removal and remount', async () => {
  const doc = new DOMParser().parseFromString('<!doctype html><html><head><title>Shell</title></head><body><div id="root"></div></body></html>', 'text/html')
  const container = doc.getElementById('root')!
  const shell = doc.querySelector('title')!
  let root = createRoot(container)
  try {
    await act(() => root.render(<main><title>First</title></main>))
    const title = doc.head.querySelector('title')!
    expect(doc.title).toBe('First')
    expect(title.nextElementSibling).toBe(shell)
    expect(container.querySelector('title')).toBeNull()

    await act(() => root.render(<main><title>Second</title></main>))
    expect(doc.title).toBe('Second')
    expect(doc.head.querySelector('title')).toBe(title)
    expect(shell.textContent).toBe('Shell')

    await act(() => root.render(<main />))
    expect(doc.title).toBe('Shell')
    expect(shell.parentNode).toBe(doc.head)
    await act(() => root.render(<main><title>Third</title></main>))
    expect(doc.title).toBe('Third')
    await act(() => root.unmount())
    expect(doc.title).toBe('Shell')
    expect(doc.head.querySelector('title')).toBe(shell)

    root = createRoot(container)
    await act(() => root.render(<title>Remounted</title>))
    expect(doc.title).toBe('Remounted')
    expect(shell.parentNode).toBe(doc.head)
  } finally {
    await act(() => root.unmount())
  }
  expect(doc.title).toBe('Shell')
  expect(doc.head.querySelector('title')).toBe(shell)
})

it('adopts an inline server title from an element root and moves it ahead of the shell', async () => {
  const doc = new DOMParser().parseFromString('<!doctype html><html><head><title>Shell</title></head><body><div id="root"><main><title>Page</title><p>Content</p></main></div></body></html>', 'text/html')
  const container = doc.getElementById('root')!
  const shell = doc.head.querySelector('title')!
  const inlineTitle = container.querySelector('title')!
  const main = container.querySelector('main')!
  const errors: unknown[] = []
  let root!: Root
  await act(() => {
    root = hydrateRoot(container, <main><title>Page</title><p>Content</p></main>, {
      onRecoverableError: error => errors.push(error),
    })
  })
  try {
    expect(errors).toEqual([])
    expect(container.querySelector('main')).toBe(main)
    expect(doc.head.querySelector('title')).toBe(inlineTitle)
    expect(doc.title).toBe('Page')
    expect(shell.parentNode).toBe(doc.head)
  } finally {
    await act(() => root.unmount())
  }
  expect(doc.title).toBe('Shell')
  expect(doc.head.querySelector('title')).toBe(shell)
})

it('uses the root owner document and leaves other metadata in the element root', async () => {
  const doc = new DOMParser().parseFromString('<!doctype html><html><head><title>Other shell</title></head><body><div></div></body></html>', 'text/html')
  const container = doc.body.firstElementChild!
  const globalTitle = document.title
  const root = createRoot(container)
  try {
    await act(() => root.render(<><title>Other document</title><meta name="local" content="yes" /></>))
    expect(doc.title).toBe('Other document')
    expect(doc.head.querySelector('title')?.ownerDocument).toBe(doc)
    expect(document.title).toBe(globalTitle)
    expect(container.querySelector('meta[name="local"]')).not.toBeNull()
  } finally {
    await act(() => root.unmount())
  }
  expect(doc.title).toBe('Other shell')
})

it('does not hoist itemProp, SVG, or portal titles, but hoists HTML inside foreignObject', async () => {
  const doc = new DOMParser().parseFromString('<!doctype html><html><head><title>Shell</title></head><body><div id="root"></div><div id="portal"></div></body></html>', 'text/html')
  const container = doc.getElementById('root')!, portal = doc.getElementById('portal')!
  const root = createRoot(container)
  try {
    await act(() => root.render(<>
      <title itemProp="name">Item</title>
      <svg><title>SVG</title></svg>
      {createPortal(<title>Portal</title>, portal)}
    </>))
    expect(doc.title).toBe('Shell')
    expect(container.querySelector('title[itemprop="name"]')?.textContent).toBe('Item')
    expect(container.querySelector('svg title')?.textContent).toBe('SVG')
    expect(portal.querySelector('title')?.textContent).toBe('Portal')

    await act(() => root.render(<svg><foreignObject><div><title>HTML</title></div></foreignObject></svg>))
    expect(doc.title).toBe('HTML')
    expect(container.querySelector('title')).toBeNull()
  } finally {
    await act(() => root.unmount())
  }
  expect(doc.title).toBe('Shell')
})

it('does not hoist a title from an SVG root', async () => {
  const doc = new DOMParser().parseFromString('<!doctype html><html><head><title>Shell</title></head><body><svg xmlns="http://www.w3.org/2000/svg"></svg></body></html>', 'text/html')
  const container = doc.querySelector('svg')!
  const root = createRoot(container)
  try {
    await act(() => root.render(<title>SVG root</title>))
    expect(doc.title).toBe('Shell')
    expect(container.querySelector('title')?.textContent).toBe('SVG root')
  } finally {
    await act(() => root.unmount())
  }
})
