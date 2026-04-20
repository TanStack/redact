// Internal unified entry. Builds into a single `dist/all.js` so every
// public entry (index, client, test-utils) can re-export from the same
// module, guaranteeing ONE copy of internals like the hydration CLAIMED
// WeakSet, scheduler state, dispatcher H slot, etc.
export { flushSync, batchedUpdates as unstable_batchedUpdates } from './root'
export { createRoot, hydrateRoot } from './root'
export type { Root, RootOptions } from './root'
export { createPortal } from './portal'
export { act } from './test-utils'

// Resource hints — stubs
export function preconnect(_href: string, _opts?: any): void {}
export function prefetchDNS(_href: string): void {}
export function preload(_href: string, _opts?: any): void {}
export function preinit(_href: string, _opts?: any): void {}
export function preloadModule(_href: string, _opts?: any): void {}
export function preinitModule(_href: string, _opts?: any): void {}

export const version = '19.2.3'
