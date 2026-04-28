// Unified entry exposing both top-level public API (createRoot, hydrateRoot,
// createPortal, …) and the registration primitives that custom features and
// custom bundler plugins need to hook into the reconciler. Reachable as
// `@tanstack/redact/_all` via the package's subpath exports. Single-instance
// state for things like the hydration CLAIMED WeakSet, scheduler queue,
// dispatcher H slot, etc. is preserved because every public entry funnels
// through this module.

// Side-effect import: registers all opt-in features (renderers, type matchers,
// element markers) with the reconciler. A vite plugin may alias individual
// feature modules to ./features/<name>/stub to strip them from the bundle.
import './features'

// Top-level public API (mirrors the surface of /, /dom, /dom-client).
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

// Registration primitives — needed by custom features
// (`registerRenderer`, `registerTypeMatcher`, `registerElementMarker`) and by
// anything that wants to override a cross-cutting concern like Suspense's
// `handleSuspended` or Context's `readContext` (`installCapability`). The
// built-in features in `./features/*/{full,stub}.ts` use these via relative
// imports; external authors reach them through this entry. Order-of-
// registration matters: later calls overwrite earlier ones.
export {
  registerRenderer,
  registerTypeMatcher,
  registerElementMarker,
  installCapability,
  reconcileChildren,
  childrenToArray,
} from './reconcile'
export type {
  RenderFn,
  TypeMatcher,
  Capabilities,
} from './reconcile'

// Core types most custom features need.
export { FiberTag } from '../core'
export type { Fiber, FiberRoot, ReactNode, ReactElement } from '../core'
