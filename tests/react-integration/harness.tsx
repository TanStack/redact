/**
 * Shim-side port of React's `ReactDOMServerIntegrationTestUtils` — the same
 * `itRenders(desc, testFn)` matrix React uses to exercise SSR + hydration
 * across four render strategies. Ported because it's the highest-value
 * external test corpus that touches zero React internals: each strategy
 * feeds the same React element through a different public-API path and
 * asserts on the resulting DOM.
 *
 * Strategies:
 *   - server string render   (`renderToString`)
 *   - server stream render   (`renderToReadableStream`)
 *   - client clean render    (`createRoot` into a fresh container)
 *   - hydrate on server HTML (`renderToString` → `hydrateRoot`)
 *
 * Diverges from React's harness in two places:
 *   - `clientCleanRender` / `hydrateOnServerString` await a microtask tick
 *     after render/hydrate so passive effects flush before assertions; our
 *     shim defers useEffect via queueMicrotask, matching real React.
 *   - The "bad markup" variant is omitted — mismatch recovery has its own
 *     dedicated tests and the per-case error-count plumbing would clutter
 *     this file.
 */
import { it, expect } from 'vitest'
import * as React from 'react'
import { renderToString, renderToReadableStream } from 'react-dom/server'
import { createRoot, hydrateRoot } from 'react-dom/client'
import type { ReactNode } from 'react'

type RenderFn = (element: ReactNode, expectedErrorCount?: number) => Promise<Node | null>

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let out = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    out += decoder.decode(value, { stream: true })
  }
  return out + decoder.decode()
}

function containerFromMarkup(markup: string): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = markup
  return container
}

async function serverRender(element: ReactNode): Promise<Node | null> {
  const markup = renderToString(element as any)
  return containerFromMarkup(markup).firstChild
}

async function streamRender(element: ReactNode): Promise<Node | null> {
  const stream = await renderToReadableStream(element as any)
  const markup = await streamToString(stream)
  await stream.allReady
  return containerFromMarkup(markup).firstChild
}

async function clientCleanRender(element: ReactNode): Promise<Node | null> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  try {
    createRoot(container).render(element as any)
    await Promise.resolve()
    return container.firstChild
  } finally {
    document.body.removeChild(container)
  }
}

async function hydrateOnServerString(element: ReactNode): Promise<Node | null> {
  const markup = renderToString(element as any)
  const container = containerFromMarkup(markup)
  document.body.appendChild(container)
  try {
    const serverNode = container.firstChild
    hydrateRoot(container, element as any)
    await Promise.resolve()
    const clientNode = container.firstChild
    // Server and client nodes should be the same — hydration shouldn't recreate
    // DOM when markup matches.
    if (serverNode && clientNode) {
      expect(clientNode).toBe(serverNode)
    }
    return clientNode
  } finally {
    document.body.removeChild(container)
  }
}

/**
 * Run `testFn` under all four render strategies. `testFn` receives a `render`
 * function that returns the first DOM child produced for the given element.
 */
export function itRenders(desc: string, testFn: (render: RenderFn) => Promise<void>): void {
  it(`renders ${desc} with server string render`, () => testFn(serverRender))
  it(`renders ${desc} with server stream render`, () => testFn(streamRender))
  it(`renders ${desc} with client clean render`, () => testFn(clientCleanRender))
  it(`renders ${desc} hydrating on server string`, () => testFn(hydrateOnServerString))
}

// Exported by identity so tests can discriminate between render strategies.
// React's own harness does this to branch on "is there a `<!-- -->` between
// adjacent text nodes?" — server/stream/hydrate preserve that separator,
// client clean render does not.
export { serverRender, streamRender, clientCleanRender, hydrateOnServerString, React }

// --- small DOM assertion helpers lifted from React's harness -----------------

export const TEXT_NODE_TYPE = 3

export function expectNode(node: Node | null | undefined, type: number, value: string): void {
  expect(node).not.toBe(null)
  expect(node!.nodeType).toBe(type)
  expect(node!.nodeValue).toMatch(value)
}

export function expectTextNode(node: Node | null | undefined, text: string): void {
  expectNode(node, TEXT_NODE_TYPE, text)
}
