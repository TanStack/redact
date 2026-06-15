import { renderToReadableStream } from 'react-dom/server'
import App from './App'

export async function render(url?: string): Promise<ReadableStream<Uint8Array>> {
  const stream = await renderToReadableStream(<App url={url} />)
  return stream
}
