import { lazy } from 'react'

// Editor hint: `lazy` is marked deprecated while the feature is off.
const LazyPanel = lazy(() => import('./lazy-panel'))

// Not rendered on the page: without `features.lazy`, async lazy() throws.
export function LazyDemo() {
  // Error: the lazy() result is not a component while the feature is off.
  return <LazyPanel />
}
