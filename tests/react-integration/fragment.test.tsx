/**
 * Port of React's `ReactDOMServerIntegrationFragment-test.js`.
 */
import { describe, expect } from 'vitest'
import * as React from 'react'
import { itRenders } from './harness'

describe('ReactDOMServerIntegration / React.Fragment', () => {
  itRenders('a fragment with one child', async (render) => {
    const e = await render(
      <>
        <div>text1</div>
      </>,
    )
    const parent = e?.parentNode as HTMLElement
    expect((parent.childNodes[0] as HTMLElement).tagName).toBe('DIV')
  })

  itRenders('a fragment with several children', async (render) => {
    const Header = () => <p>header</p>
    const Footer = () => (
      <>
        <h2>footer</h2>
        <h3>about</h3>
      </>
    )
    const e = await render(
      <>
        <div>text1</div>
        <span>text2</span>
        <Header />
        <Footer />
      </>,
    )
    const parent = e?.parentNode as HTMLElement
    expect((parent.childNodes[0] as HTMLElement).tagName).toBe('DIV')
    expect((parent.childNodes[1] as HTMLElement).tagName).toBe('SPAN')
    expect((parent.childNodes[2] as HTMLElement).tagName).toBe('P')
    expect((parent.childNodes[3] as HTMLElement).tagName).toBe('H2')
    expect((parent.childNodes[4] as HTMLElement).tagName).toBe('H3')
  })

  itRenders('a nested fragment', async (render) => {
    const e = await render(
      <>
        <>
          <div>text1</div>
        </>
        <span>text2</span>
        <>
          <>
            <>
              {null}
              <p />
            </>
            {false}
          </>
        </>
      </>,
    )
    const parent = e?.parentNode as HTMLElement
    expect((parent.childNodes[0] as HTMLElement).tagName).toBe('DIV')
    expect((parent.childNodes[1] as HTMLElement).tagName).toBe('SPAN')
    expect((parent.childNodes[2] as HTMLElement).tagName).toBe('P')
  })

  itRenders('an empty fragment', async (render) => {
    expect(
      (
        (await render(
          <div>
            <React.Fragment />
          </div>,
        )) as HTMLElement
      ).firstChild,
    ).toBe(null)
  })
})
