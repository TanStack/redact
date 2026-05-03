import './features'

export { createRoot, hydrateRoot } from './root'
export type { Root, RootOptions } from './root'

// Default export — real React's `react-dom/client` is named-only too, but
// bundlers synthesize a default from the CJS `module.exports` object.
// Redact ships pure ESM, so without an explicit default, strict bundlers
// (rolldown, modern Vite) reject `import ReactDOM from 'react-dom/client'`.
import { createRoot, hydrateRoot } from './root'
export default {
  createRoot,
  hydrateRoot,
}
