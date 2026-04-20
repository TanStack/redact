import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { renderToReadableStream } from 'react-dom/server'

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let out = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    out += decoder.decode(value, { stream: true })
  }
  out += decoder.decode()
  return out
}

describe('streaming SSR context preservation', () => {
  it('restores provider values when rendering a suspended boundary', async () => {
    const Ctx = React.createContext('default')
    let resolve: (v: string) => void
    const p = new Promise<string>((r) => {
      resolve = r
    })
    function Suspended() {
      const value = React.useContext(Ctx)
      const text = React.use(p)
      return (
        <span id="resolved">
          {value}-{text}
        </span>
      )
    }
    function App() {
      return (
        <div>
          <Ctx.Provider value="outer">
            <React.Suspense fallback={<i>wait</i>}>
              <Suspended />
            </React.Suspense>
          </Ctx.Provider>
        </div>
      )
    }
    const stream = await renderToReadableStream(<App />)
    resolve!('data')
    const html = await streamToString(stream)
    expect(html).toMatch(/<span id="resolved">outer(<!-- -->)?-(<!-- -->)?data<\/span>/)
    await stream.allReady
  })

  it('restores nested providers', async () => {
    const A = React.createContext('A0')
    const B = React.createContext('B0')
    let resolve: (v: string) => void
    const p = new Promise<string>((r) => {
      resolve = r
    })
    function Leaf() {
      const a = React.useContext(A)
      const b = React.useContext(B)
      const t = React.use(p)
      return (
        <span id="leaf">
          {a}/{b}/{t}
        </span>
      )
    }
    function App() {
      return (
        <A.Provider value="A1">
          <B.Provider value="B1">
            <React.Suspense fallback={<i>w</i>}>
              <Leaf />
            </React.Suspense>
          </B.Provider>
        </A.Provider>
      )
    }
    const stream = await renderToReadableStream(<App />)
    resolve!('T')
    const html = await streamToString(stream)
    expect(html).toMatch(/<span id="leaf">A1(<!-- -->)?\/(<!-- -->)?B1(<!-- -->)?\/(<!-- -->)?T<\/span>/)
    await stream.allReady
  })
})
