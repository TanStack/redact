import { hydrateRoot } from 'react-dom/client'

// Not called: without `features.hydration`, hydrateRoot throws.
export function hydrateApp(container: Element) {
  // Error: the returned root is unusable. The call itself is also marked deprecated.
  const root = hydrateRoot(container, <p>Server-rendered HTML</p>)
  root.unmount()
}
