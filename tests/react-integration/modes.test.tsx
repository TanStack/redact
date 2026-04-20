/**
 * Port of React's `ReactDOMServerIntegrationModes-test.js`. StrictMode and
 * Profiler are transparent wrappers — they render children as-is. Our shim
 * treats them both as Fragment-equivalent.
 *
 * Also ports the simple half of `ReactDOMServerIntegrationObject-test.js`
 * (basic `<object>` with children). The "empty data attribute" case is
 * skipped — React strips empty-string `data` with a dev warning; we keep
 * it, which matches the HTML spec.
 */
import { describe, expect } from 'vitest'
import * as React from 'react'
import { itRenders } from './harness'

describe('ReactDOMServerIntegration / React.StrictMode', () => {
  itRenders('a strict mode with one child', async (render) => {
    const e = await render(
      <React.StrictMode>
        <div>text1</div>
      </React.StrictMode>,
    )
    const parent = e?.parentNode as HTMLElement
    expect((parent.childNodes[0] as HTMLElement).tagName).toBe('DIV')
  })

  itRenders('a strict mode with several children', async (render) => {
    const Header = () => <p>header</p>
    const Footer = () => (
      <React.StrictMode>
        <h2>footer</h2>
        <h3>about</h3>
      </React.StrictMode>
    )
    const e = await render(
      <React.StrictMode>
        <div>text1</div>
        <span>text2</span>
        <Header />
        <Footer />
      </React.StrictMode>,
    )
    const parent = e?.parentNode as HTMLElement
    expect((parent.childNodes[0] as HTMLElement).tagName).toBe('DIV')
    expect((parent.childNodes[1] as HTMLElement).tagName).toBe('SPAN')
    expect((parent.childNodes[2] as HTMLElement).tagName).toBe('P')
    expect((parent.childNodes[3] as HTMLElement).tagName).toBe('H2')
    expect((parent.childNodes[4] as HTMLElement).tagName).toBe('H3')
  })

  itRenders('a nested strict mode', async (render) => {
    const e = await render(
      <React.StrictMode>
        <React.StrictMode>
          <div>text1</div>
        </React.StrictMode>
        <span>text2</span>
        <React.StrictMode>
          <React.StrictMode>
            <React.StrictMode>
              {null}
              <p />
            </React.StrictMode>
            {false}
          </React.StrictMode>
        </React.StrictMode>
      </React.StrictMode>,
    )
    const parent = e?.parentNode as HTMLElement
    expect((parent.childNodes[0] as HTMLElement).tagName).toBe('DIV')
    expect((parent.childNodes[1] as HTMLElement).tagName).toBe('SPAN')
    expect((parent.childNodes[2] as HTMLElement).tagName).toBe('P')
  })

  itRenders('an empty strict mode', async (render) => {
    const e = (await render(
      <div>
        <React.StrictMode />
      </div>,
    )) as HTMLElement
    expect(e.firstChild).toBe(null)
  })
})

describe('ReactDOMServerIntegration / object', () => {
  itRenders('an object with children', async (render) => {
    const e = (await render(
      <object type="video/mp4" data="/example.webm" width={600} height={400}>
        <div>preview</div>
      </object>,
    )) as HTMLObjectElement
    expect(e.outerHTML).toBe(
      '<object type="video/mp4" data="/example.webm" width="600" height="400"><div>preview</div></object>',
    )
  })
})
