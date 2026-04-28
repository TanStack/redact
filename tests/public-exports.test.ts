/**
 * Public API surface lock-in.
 *
 * Why this test exists: it catches the class of bug where you add a function
 * to a sub-module (e.g. `react/hooks.ts`) but forget to add it to the
 * subpath's top-level `index.ts` re-export block. The function exists, types
 * check, the build succeeds — but consumers importing the package by name
 * get a silent `SyntaxError: does not provide an export named 'X'` at
 * module-link time, which is invisible to runtime descriptive errors.
 *
 * The snapshots are intentionally exhaustive and inline. Any deliberate
 * change to a subpath's public API requires updating the corresponding
 * snapshot, which forces the diff to surface in code review.
 */
import { describe, it, expect } from 'vitest'

import * as redact from '@tanstack/redact'
import * as redactJsxRuntime from '@tanstack/redact/jsx-runtime'
import * as redactDom from '@tanstack/redact/dom'
import * as redactDomClient from '@tanstack/redact/dom-client'
import * as redactDomTestUtils from '@tanstack/redact/dom-test-utils'
import * as redactServer from '@tanstack/redact/server'

const surface = (mod: Record<string, unknown>): Array<string> =>
  Object.keys(mod).sort()

describe('public API surface', () => {
  it('@tanstack/redact', () => {
    expect(surface(redact)).toMatchInlineSnapshot(`
      [
        "Children",
        "Component",
        "Fragment",
        "Profiler",
        "PureComponent",
        "REACT_CONSUMER_TYPE",
        "REACT_CONTEXT_TYPE",
        "REACT_FORWARD_REF_TYPE",
        "REACT_LAZY_TYPE",
        "REACT_MEMO_TYPE",
        "REACT_PORTAL_TYPE",
        "REACT_PROFILER_TYPE",
        "REACT_PROVIDER_TYPE",
        "REACT_STRICT_MODE_TYPE",
        "REACT_SUSPENSE_TYPE",
        "ReactSharedInternals",
        "StrictMode",
        "Suspense",
        "act",
        "cache",
        "cloneElement",
        "createContext",
        "createElement",
        "createRef",
        "default",
        "forwardRef",
        "isValidElement",
        "lazy",
        "memo",
        "startTransition",
        "taintObjectReference",
        "taintUniqueValue",
        "use",
        "useActionState",
        "useCallback",
        "useContext",
        "useDebugValue",
        "useDeferredValue",
        "useEffect",
        "useEffectEvent",
        "useFormStatus",
        "useId",
        "useImperativeHandle",
        "useInsertionEffect",
        "useLayoutEffect",
        "useMemo",
        "useOptimistic",
        "useReducer",
        "useRef",
        "useState",
        "useSyncExternalStore",
        "useSyncExternalStoreWithSelector",
        "useTransition",
        "version",
      ]
    `)
  })

  it('@tanstack/redact/jsx-runtime', () => {
    expect(surface(redactJsxRuntime)).toMatchInlineSnapshot(`
      [
        "Fragment",
        "jsx",
        "jsxDEV",
        "jsxs",
      ]
    `)
  })

  it('@tanstack/redact/dom', () => {
    expect(surface(redactDom)).toMatchInlineSnapshot(`
      [
        "createPortal",
        "default",
        "flushSync",
        "preconnect",
        "prefetchDNS",
        "preinit",
        "preinitModule",
        "preload",
        "preloadModule",
        "unstable_batchedUpdates",
        "version",
      ]
    `)
  })

  it('@tanstack/redact/dom-client', () => {
    expect(surface(redactDomClient)).toMatchInlineSnapshot(`
      [
        "createRoot",
        "hydrateRoot",
      ]
    `)
  })

  it('@tanstack/redact/dom-test-utils', () => {
    expect(surface(redactDomTestUtils)).toMatchInlineSnapshot(`
      [
        "act",
      ]
    `)
  })

  it('@tanstack/redact/server', () => {
    expect(surface(redactServer)).toMatchInlineSnapshot(`
      [
        "BOUNDARY_REVEAL_RUNTIME",
        "default",
        "renderToPipeableStream",
        "renderToReadableStream",
        "renderToStaticMarkup",
        "renderToString",
        "version",
      ]
    `)
  })
})

describe('aliased shim names — what `redact()` claims to provide', () => {
  /**
   * The Vite plugin aliases `use-sync-external-store/shim/with-selector` →
   * `@tanstack/redact`, promising consumers that the module exposes
   * `useSyncExternalStoreWithSelector`. Likewise for the bare
   * `use-sync-external-store` paths. If `@tanstack/redact` ever drops these
   * names, every router/store user breaks at link time. This test guards
   * the contract.
   */
  it('exposes hooks needed by use-sync-external-store/shim/* aliases', () => {
    expect(redact).toHaveProperty('useSyncExternalStore')
    expect(redact).toHaveProperty('useSyncExternalStoreWithSelector')
    expect(typeof (redact as any).useSyncExternalStore).toBe('function')
    expect(typeof (redact as any).useSyncExternalStoreWithSelector).toBe(
      'function',
    )
  })
})
