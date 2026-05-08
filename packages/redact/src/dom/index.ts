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

export const __DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = {
  d: {
    f() {},
    r() {},
    D() {},
    C() {},
    L() {},
    m() {},
    X() {},
    S() {},
    M() {},
  },
  p: 0,
  findDOMNode: null,
}

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
  __DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
  version: '19.2.3',
}
