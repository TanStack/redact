import { renderToReadableStream } from 'react-dom/server'
import App from './App'

export async function render(): Promise<ReadableStream<Uint8Array>> {
  const stream = await renderToReadableStream(<App />)
  return stream
}
