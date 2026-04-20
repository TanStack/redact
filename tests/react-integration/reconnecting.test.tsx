/**
 * Port of React's `ReactDOMServerIntegrationReconnecting-test.js`. Tests
 * hydration across mismatched/matched SSR → client trees. Two helpers:
 *
 *   - `expectMarkupMatch(server, client)`: render server on server, hydrate
 *     with client tree, assert no recoverable errors.
 *   - `expectMarkupMismatch(server, client)`: same flow, assert at least one
 *     recoverable error.
 *
 * Our shim's hydration accepts server-side attributes/text as authoritative
 * (no dev-mode attribute-value diffing) so it only emits mismatch errors for
 * STRUCTURAL differences: wrong tag, missing/extra DOM nodes. Upstream
 * attribute/style/text-value mismatch tests are marked "we don't detect" —
 * they'd need dev-mode diffing we intentionally don't ship. The ~9.9 KB
 * gzip budget is built on exactly this kind of "trust SSR" choice.
 */
import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'

async function expectMarkupMatch(
  serverElement: React.ReactNode,
  clientElement: React.ReactNode,
): Promise<void> {
  const markup = renderToString(serverElement as any)
  const container = document.createElement('div')
  container.innerHTML = markup
  document.body.appendChild(container)
  const errors: unknown[] = []
  hydrateRoot(container, clientElement as any, {
    onRecoverableError: (e: unknown) => errors.push(e),
  })
  await Promise.resolve()
  document.body.removeChild(container)
  expect(errors.length).toBe(0)
}

async function expectMarkupMismatch(
  serverElement: React.ReactNode,
  clientElement: React.ReactNode,
): Promise<void> {
  const markup = renderToString(serverElement as any)
  const container = document.createElement('div')
  container.innerHTML = markup
  document.body.appendChild(container)
  const errors: unknown[] = []
  hydrateRoot(container, clientElement as any, {
    onRecoverableError: (e: unknown) => errors.push(e),
  })
  await Promise.resolve()
  document.body.removeChild(container)
  expect(errors.length).toBeGreaterThanOrEqual(1)
}

describe('ReactDOMServerIntegrationReconnecting / matches', () => {
  describe('different component implementations render the same markup', () => {
    class ES6Class extends React.Component<{ id: string }> {
      render() {
        return <div id={this.props.id} />
      }
    }
    const Pure: React.FC<{ id: string }> = (props) => <div id={props.id} />
    const bare = <div id="foobarbaz" />

    it('ES6 Class → ES6 Class', () =>
      expectMarkupMatch(
        <ES6Class id="foobarbaz" />,
        <ES6Class id="foobarbaz" />,
      ))
    it('ES6 Class → Pure Component', () =>
      expectMarkupMatch(
        <ES6Class id="foobarbaz" />,
        <Pure id="foobarbaz" />,
      ))
    it('ES6 Class → Bare Element', () =>
      expectMarkupMatch(<ES6Class id="foobarbaz" />, bare))
    it('Pure Component → ES6 Class', () =>
      expectMarkupMatch(
        <Pure id="foobarbaz" />,
        <ES6Class id="foobarbaz" />,
      ))
    it('Pure Component → Pure Component', () =>
      expectMarkupMatch(<Pure id="foobarbaz" />, <Pure id="foobarbaz" />))
    it('Pure Component → Bare Element', () =>
      expectMarkupMatch(<Pure id="foobarbaz" />, bare))
    it('Bare Element → ES6 Class', () =>
      expectMarkupMatch(bare, <ES6Class id="foobarbaz" />))
    it('Bare Element → Pure Component', () =>
      expectMarkupMatch(bare, <Pure id="foobarbaz" />))
    it('Bare Element → Bare Element', () => expectMarkupMatch(bare, bare))
  })

  it('number child and string version of number match', () =>
    expectMarkupMatch(<div>{2}</div>, <div>2</div>))

  it('empty component equivalent to empty text child', () => {
    class Empty extends React.Component {
      render() {
        return null
      }
    }
    return expectMarkupMatch(
      <div>
        <Empty />
      </div>,
      <div>{''}</div>,
    )
  })
})

describe('ReactDOMServerIntegrationReconnecting / structural mismatches', () => {
  it('different root element types', () =>
    expectMarkupMismatch(<div />, <span />))

  it('different element types of children', () =>
    expectMarkupMismatch(
      <div>
        <div />
      </div>,
      <div>
        <span />
      </div>,
    ))

  it('missing children on client', () =>
    expectMarkupMismatch(
      <div>
        <div />
      </div>,
      <div />,
    ))

  it('added children on client', () =>
    expectMarkupMismatch(
      <div />,
      <div>
        <div />
      </div>,
    ))

  it('fewer root children', () =>
    expectMarkupMismatch(<span key="a" />, [
      <span key="a" />,
      <span key="b" />,
    ]))

  it('empty-component vs real DOM node at same slot', () => {
    class Empty extends React.Component {
      render() {
        return null
      }
    }
    return expectMarkupMismatch(
      <div>
        <span />
      </div>,
      <div>
        <Empty />
      </div>,
    )
  })
})
