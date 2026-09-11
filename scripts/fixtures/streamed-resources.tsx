import { Suspense, use } from 'react'
import { renderToReadableStream } from 'react-dom/server'

export async function resourceStream(id: string, mode = 'load') {
  let releaseA!: () => void, releaseB!: () => void
  const a = new Promise<void>(resolve => { releaseA = resolve })
  const b = new Promise<void>(resolve => { releaseB = resolve })
  function First() {
    use(a)
    return <><link rel="stylesheet" href={`/blocked.css?run=${id}`} precedence="theme" media={mode === 'unmatched' ? 'print' : undefined} /><style href={`inline-${id}`} precedence="base" nonce="stream-style">{'#content-a{border-top-width:7px;border-top-style:solid}'}</style><div id="content-a">first ready</div></>
  }
  function Second() { use(b); return <div id="content-b">second ready</div> }
  const stream = await renderToReadableStream(<html><head><style href={`base-${id}`} precedence="base" nonce="stream-style">{'#content-a{color:rgb(1, 2, 3)}'}</style></head><body>
    <Suspense fallback={<div id="fallback-a">first loading</div>}><First /></Suspense>
    <Suspense fallback={<div id="fallback-b">second loading</div>}><Second /></Suspense>
  </body></html>, { nonce: { script: 'stream-script', style: 'stream-style' } })
  return { stream, releaseA, releaseB }
}
