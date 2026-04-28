// Side-effect import: registers opt-in features (Portal, etc.) with the
// reconciler. A vite plugin may alias individual feature modules to their
// stub variants to strip them from the bundle.
import './features'

export { flushSync, batchedUpdates as unstable_batchedUpdates } from './root'
export { createPortal } from './portal'

// Resource hints — stubs
export function preconnect(_href: string, _opts?: any): void {}
export function prefetchDNS(_href: string): void {}
export function preload(_href: string, _opts?: any): void {}
export function preinit(_href: string, _opts?: any): void {}
export function preloadModule(_href: string, _opts?: any): void {}
export function preinitModule(_href: string, _opts?: any): void {}

export const version = '19.2.3'

// Required by React's default export consumers
import { flushSync, batchedUpdates } from './root'
import { createPortal } from './portal'
export default {
  flushSync,
  unstable_batchedUpdates: batchedUpdates,
  createPortal,
  preconnect,
  prefetchDNS,
  preload,
  preinit,
  preloadModule,
  preinitModule,
  version: '19.2.3',
}
