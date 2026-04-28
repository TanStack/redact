export { renderToString, renderToStaticMarkup } from './renderToString'
export { renderToReadableStream, renderToPipeableStream } from './stream'
export type {
  StreamOptions,
  PipeableOptions,
  PipeableHandle,
  ReadableStreamResult,
} from './stream'
export { BOUNDARY_REVEAL_RUNTIME } from './bootstrap-script'

export const version = '19.2.3'

// Default export — React's real `react-dom/server` ships one, and TanStack
// Router's SSR code does `import ReactDOMServer from 'react-dom/server'` and
// reads `.renderToReadableStream` off the default.
import { renderToString, renderToStaticMarkup } from './renderToString'
import { renderToReadableStream, renderToPipeableStream } from './stream'
import { BOUNDARY_REVEAL_RUNTIME } from './bootstrap-script'
export default {
  renderToString,
  renderToStaticMarkup,
  renderToReadableStream,
  renderToPipeableStream,
  BOUNDARY_REVEAL_RUNTIME,
  version: '19.2.3',
}
