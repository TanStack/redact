/**
 * Port of React's `ReactDOMServerIntegrationBasic-test.js`. See harness.tsx
 * for the strategy matrix — every `itRenders` case runs 4 times.
 */
import { describe } from 'vitest'
import * as React from 'react'
import { itRenders } from './harness'

const TEXT_NODE_TYPE = 3

describe('ReactDOMServerIntegration / basic rendering', () => {
  itRenders('a blank div', async (render) => {
    const e = (await render(<div />)) as HTMLElement
    expect(e.tagName).toBe('DIV')
  })

  itRenders('a self-closing tag', async (render) => {
    const e = (await render(<br />)) as HTMLElement
    expect(e.tagName).toBe('BR')
  })

  itRenders('a self-closing tag as a child', async (render) => {
    const e = (await render(
      <div>
        <br />
      </div>,
    )) as HTMLElement
    expect(e.childNodes.length).toBe(1)
    expect((e.firstChild as HTMLElement).tagName).toBe('BR')
  })

  itRenders('a string', async (render) => {
    const e = (await render('Hello')) as Text
    expect(e.nodeType).toBe(TEXT_NODE_TYPE)
    expect(e.nodeValue).toMatch('Hello')
  })

  itRenders('a number', async (render) => {
    const e = (await render(42)) as Text
    expect(e.nodeType).toBe(TEXT_NODE_TYPE)
    expect(e.nodeValue).toMatch('42')
  })

  itRenders('an array with one child', async (render) => {
    const e = await render([<div key={1}>text1</div>])
    const parent = e?.parentNode as HTMLElement
    expect((parent.childNodes[0] as HTMLElement).tagName).toBe('DIV')
  })

  itRenders('an array with several children', async (render) => {
    const Header = () => <p>header</p>
    const Footer = () => [<h2 key={1}>footer</h2>, <h3 key={2}>about</h3>]
    const e = await render([
      <div key={1}>text1</div>,
      <span key={2}>text2</span>,
      <Header key={3} />,
      <Footer key={4} />,
    ])
    const parent = e?.parentNode as HTMLElement
    expect((parent.childNodes[0] as HTMLElement).tagName).toBe('DIV')
    expect((parent.childNodes[1] as HTMLElement).tagName).toBe('SPAN')
    expect((parent.childNodes[2] as HTMLElement).tagName).toBe('P')
    expect((parent.childNodes[3] as HTMLElement).tagName).toBe('H2')
    expect((parent.childNodes[4] as HTMLElement).tagName).toBe('H3')
  })

  itRenders('a nested array', async (render) => {
    const e = await render([
      [<div key={1}>text1</div>],
      <span key={1}>text2</span>,
      [[[null, <p key={1} />], false]],
    ])
    const parent = e?.parentNode as HTMLElement
    expect((parent.childNodes[0] as HTMLElement).tagName).toBe('DIV')
    expect((parent.childNodes[1] as HTMLElement).tagName).toBe('SPAN')
    expect((parent.childNodes[2] as HTMLElement).tagName).toBe('P')
  })

  itRenders('an iterable', async (render) => {
    const threeDivIterable = {
      [Symbol.iterator]: function () {
        let i = 0
        return {
          next: function () {
            if (i++ < 3) {
              return { value: <div key={i} />, done: false }
            }
            return { value: undefined, done: true }
          },
        }
      },
    }
    const e = await render(threeDivIterable as any)
    const parent = e?.parentNode as HTMLElement
    expect(parent.childNodes.length).toBe(3)
    expect((parent.childNodes[0] as HTMLElement).tagName).toBe('DIV')
    expect((parent.childNodes[1] as HTMLElement).tagName).toBe('DIV')
    expect((parent.childNodes[2] as HTMLElement).tagName).toBe('DIV')
  })

  itRenders('emptyish values', async (render) => {
    const e = (await render(0)) as Text
    expect(e.nodeType).toBe(TEXT_NODE_TYPE)
    expect(e.nodeValue).toMatch('0')

    expect(((await render(<div>{''}</div>)) as HTMLElement).textContent).toBe('')

    expect(await render([])).toBe(null)
    expect(await render(false)).toBe(null)
    expect(await render(true)).toBe(null)
    expect(await render([[[false]], undefined])).toBe(null)
  })
})

// Re-export vitest's `expect` so these React-ported files can use the global-
// style `expect(...)` without importing it in every case.
import { expect } from 'vitest'
