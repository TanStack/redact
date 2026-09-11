import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import * as commit from '../packages/redact/src/dom/commit'

const cleanup: Array<() => void> = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const fn of cleanup.splice(0)) fn()
})

function fixture(element: React.ReactNode) {
  const container = document.createElement('div')
  container.innerHTML = renderToString(element)
  document.body.appendChild(container)
  const original = container.firstChild
  const errors: unknown[] = []
  const hydrate = (client = element) => {
    const root = hydrateRoot(container, client, { onRecoverableError: error => errors.push(error) })
    cleanup.push(() => { root.unmount(); container.remove() })
    return { original, errors, container }
  }
  return { hydrate }
}

describe('hydration attribute comparison', () => {
  it('adopts data, aria and enumerated attributes without scratch elements', () => {
    const { hydrate } = fixture(
      <div data-count={0} data-empty="" data-enabled={false} aria-hidden={false}
        contentEditable={false} draggable={true} spellCheck={false} />,
    )
    const create = vi.spyOn(document, 'createElement')
    const mutation = vi.spyOn(commit, 'queueMutation')
    const property = vi.spyOn(commit, 'queueProp')
    const { original, errors, container } = hydrate()
    expect(errors).toEqual([])
    expect(container.firstChild).toBe(original)
    expect(create).not.toHaveBeenCalled()
    expect(mutation).not.toHaveBeenCalled()
    expect(property).not.toHaveBeenCalled()
    expect((original as Element).getAttribute('data-enabled')).toBe('false')
  })

  it('keeps SVG attribute names and boolean string values', () => {
    const { hydrate } = fixture(<svg data-count={3} aria-hidden={true}><g data-state="&<>" /></svg>)
    const create = vi.spyOn(document, 'createElementNS')
    const { original, errors, container } = hydrate()
    expect(errors).toEqual([])
    expect(container.firstChild).toBe(original)
    expect(create).not.toHaveBeenCalled()
  })

  it.each(['data-state', 'aria-label', 'contentEditable'])('still rejects a mismatched %s', name => {
    const server = React.createElement('div', { [name]: 'first' })
    const client = React.createElement('div', { [name]: 'second' })
    const { original, errors, container } = fixture(server).hydrate(client)
    expect(errors.length).toBeGreaterThan(0)
    expect(container.firstChild).not.toBe(original)
  })

  it('distinguishes missing attributes from empty strings and false', () => {
    const { errors } = fixture(<div />).hydrate(<div data-empty="" aria-hidden={false} />)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('keeps bare data and aria prefixes on the normal attribute path', () => {
    const container = document.createElement('div')
    container.innerHTML = '<div data-=""></div>'
    const original = container.firstChild
    const errors: unknown[] = []
    const root = hydrateRoot(container, React.createElement('div', { 'data-': true, 'aria-': false }), {
      onRecoverableError: error => errors.push(error),
    })
    cleanup.push(() => root.unmount())
    expect(errors).toEqual([])
    expect(container.firstChild).toBe(original)
    expect((original as Element).getAttribute('data-')).toBe('')
    expect((original as Element).hasAttribute('aria-')).toBe(false)
  })

  it('preserves the setter primitive hint and coerces each data value once', () => {
    const container = document.createElement('div')
    container.innerHTML = '<div data-state="matching"></div>'
    const original = container.firstChild
    const hints: string[] = []
    const value = {
      [Symbol.toPrimitive](hint: string) {
        hints.push(hint)
        return hint === 'default' ? 'matching' : 'different'
      },
    }
    const errors: unknown[] = []
    const root = hydrateRoot(container, React.createElement('div', { 'data-state': value }), {
      onRecoverableError: error => errors.push(error),
    })
    cleanup.push(() => root.unmount())
    expect(errors).toEqual([])
    expect(container.firstChild).toBe(original)
    expect(hints).toEqual(['default'])
  })
})
