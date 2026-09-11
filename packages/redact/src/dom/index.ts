// Side-effect import: registers opt-in features (Portal, etc.) with the
// reconciler. A vite plugin may alias individual feature modules to their
// stub variants to strip them from the bundle.
import './features'

export { flushSync, batchedUpdates as unstable_batchedUpdates } from './root'
export { createPortal } from './portal'
export { browser } from '../core/browser'
export type { BrowserToken } from '../core/browser'

import { preconnect, prefetchDNS, preload, preinit, preloadModule, preinitModule } from './resource-hints'
export { preconnect, prefetchDNS, preload, preinit, preloadModule, preinitModule }

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
import { browser } from '../core/browser'
export default {
  flushSync,
  unstable_batchedUpdates: batchedUpdates,
  createPortal,
  browser,
  preconnect,
  prefetchDNS,
  preload,
  preinit,
  preloadModule,
  preinitModule,
  __DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
  version: '19.2.3',
}
