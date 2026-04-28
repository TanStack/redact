# React 19 API Surface — `@tanstack/redact`

API-complete drop-in replacement for `react` + `react-dom` targeting TanStack Start apps (tanstack.com). Shipped as `@tanstack/redact@0.0.1`. Client total: **11.18 KB gzip** (full preset) / **9.40 KB gzip** (nano preset, with feature flags off).

## Legend

- **real** — full implementation; behavior matches React closely
- **basic** — simplified implementation; covers common path, may diverge on edge cases
- **stub** — API exists, returns sensible no-op value (no behavior)
- **alias** — re-exports another symbol (e.g., `useInsertionEffect` → `useLayoutEffect`)
- **skip** — not exported; project doesn't need it (raise error if hit)

Each entry: `symbol — tier — rationale / notes`

---

## `react`

### Hooks

| Export | Tier | Notes |
|---|---|---|
| `useState` | real | Standard, supports updater fn + lazy init |
| `useEffect` | real | Async after commit; cleanup on re-run/unmount |
| `useLayoutEffect` | real | Sync after DOM mutation, before paint |
| `useRef` | real | Stable mutable container |
| `useMemo` | real | Deps-based memoization |
| `useCallback` | real | Alias of `useMemo(() => fn, deps)` |
| `useContext` | real | Context subscription with bailout |
| `useImperativeHandle` | real | Ref forwarding for class-like handles |
| `useReducer` | real | State machine form of useState |
| `useDebugValue` | stub | No-op (DevTools hook) |
| `useId` | basic | Monotonic counter, SSR-stable. Not deterministic across reorderings — but Start doesn't use it |
| `use` | real | Promise + Context unwrap. Needed for `useAwaited` |
| `useTransition` | stub | `[false, fn => fn()]` |
| `useDeferredValue` | stub | Identity |
| `useInsertionEffect` | alias | → `useLayoutEffect` |
| `useSyncExternalStore` | basic | Subscribe + getSnapshot; tearing allowed (Router uses `@tanstack/react-store` anyway) |
| `useActionState` | stub | `[initial, noop, false]` |
| `useFormStatus` | stub | `{ pending: false, data: null, method: null, action: null }` |
| `useOptimistic` | stub | `[state, fn => fn()]` — no optimistic overlay |

### Components

| Export | Tier | Notes |
|---|---|---|
| `Fragment` | real | Renders children flat |
| `Suspense` | real | Boundary with fallback; integrates with `use()` and thrown promises |
| `StrictMode` | stub | Renders children; no double-invoke |
| `Profiler` | stub | Renders children |

### Class Components

| Export | Tier | Notes |
|---|---|---|
| `Component` | real | `this.setState`, lifecycle, `getDerivedStateFromError`, `componentDidCatch`. CatchBoundary depends on this |
| `PureComponent` | basic | `Component` + shallow-equal `shouldComponentUpdate` |

### Element & Ref APIs

| Export | Tier | Notes |
|---|---|---|
| `createElement` | real | Classic runtime + cloneElement path |
| `cloneElement` | real | |
| `isValidElement` | real | Used by Start's slotUsageSanitizer |
| `createRef` | real | `{ current: null }` |
| `forwardRef` | real | |
| `memo` | real | Shallow compare, optional custom `areEqual` |
| `lazy` | real | Suspense-integrated dynamic import |
| `createContext` | real | Default value, `.Provider`, `.Consumer`, `displayName` |
| `startTransition` | stub | `fn()` sync |

### Misc

| Export | Tier | Notes |
|---|---|---|
| `Children.map` / `forEach` / `count` / `toArray` / `only` | basic | Simple iteration over children |
| `cache` | stub | Identity `fn => fn` (no memoization) |
| `version` | real | `"19.2.3"` to satisfy version checks |
| `act` | stub | `act(fn)` → `await fn()` |

### RSC-specific (server-only, unlikely to ship client)

| Export | Tier | Notes |
|---|---|---|
| `createServerContext` | skip | Experimental, not used |
| `taintUniqueValue`, `taintObjectReference` | stub | No-op |

---

## `react/jsx-runtime`, `react/jsx-dev-runtime`

| Export | Tier | Notes |
|---|---|---|
| `jsx`, `jsxs`, `jsxDEV` | real | Element creation for modern transform |
| `Fragment` | real | Re-export |

---

## `react-dom`

| Export | Tier | Notes |
|---|---|---|
| `flushSync` | real | Used by Router's Link before navigation |
| `createPortal` | basic | Render children into different DOM node |
| `findDOMNode` | skip | Deprecated, unused |
| `unstable_batchedUpdates` | basic | Batch within callback |
| `preconnect`, `prefetchDNS`, `preload`, `preinit`, `preinitModule`, `preloadModule` | stub | No-op |
| `version` | real | `"19.2.3"` |

---

## `react-dom/client`

| Export | Tier | Notes |
|---|---|---|
| `createRoot` | real | Returns `{ render, unmount }` |
| `hydrateRoot` | real | With event replay + per-boundary hydration + mismatch recovery |

Root options we support:
- `onRecoverableError` — called for hydration mismatches
- `onCaughtError` / `onUncaughtError` — called for error boundaries
- `identifierPrefix` — prefix for useId
- `nonce` — for inline scripts

---

## `react-dom/server`

| Export | Tier | Notes |
|---|---|---|
| `renderToString` | real | Non-streaming SSR |
| `renderToStaticMarkup` | basic | Strip hydration markers |
| `renderToReadableStream` | real | Web Streams; `signal`, `nonce`, `progressiveChunkSize`, `bootstrapScripts`, `bootstrapModules`, `onError` |
| `renderToPipeableStream` | real | Node streams; `onShellReady`, `onShellError`, `onAllReady`, `onError`, `nonce`, `bootstrapScripts`, `bootstrapModules`, `progressiveChunkSize` |
| `version` | real | |

SSR stream must:
- Emit Suspense boundary markers compatible with our client hydration runtime
- Support `stream.allReady` promise (for bot requests)
- Inject bootstrap scripts at end of shell
- Handle thrown promises → render fallback, continue, queue resolved subtree for later emission

---

## `react-server-dom-*/client` (browser)

**Not implemented directly.** Start's `@tanstack/react-start-rsc/flight.ts` owns `createFromReadableStream` / `createFromFetch` and routes to virtual modules controlled by Start's Vite plugin. Our shim only needs to cooperate (provide real `Suspense` + `use()` integration so the deserialized tree renders).

If Start ever moves to React's real Flight wire format, we'd add:
- `createFromFetch`
- `createFromReadableStream`
- `encodeReply` (for server actions)

Estimated cost if added later: ~3KB gzipped.

---

## `react-dom/test-utils`

| Export | Tier | Notes |
|---|---|---|
| `act` | stub | `act(fn)` → `await fn()` |
| Rest | skip | Test utilities not needed |

---

## `scheduler`

Peer dep that React imports. We ship our own micro-scheduler (~200 bytes) that implements:
- `unstable_scheduleCallback(priority, fn)` → `queueMicrotask(fn)` or `setTimeout(fn, 0)` based on priority tier
- `unstable_cancelCallback(handle)`
- `unstable_shouldYield()` → false (no time slicing)
- `unstable_now()` → `performance.now()`

---

## Internals (`react/internals`, `ReactSharedInternals`)

React and react-dom coordinate via `ReactSharedInternals` (current dispatcher, batched updates tracker). We expose a compatible shape so third-party libs that dig into internals don't crash — minimum fields:
- `H` — current hook dispatcher
- `T` — current transition (null)
- `S` — onStartTransition callback (null)

---

## Explicitly not supported

- Concurrent rendering (time slicing, work loops with yield)
- Selective hydration with priority scheduling (we do basic progressive hydration + event replay, no priority boosting beyond "the clicked boundary")
- React DevTools protocol (DevTools won't attach)
- React Compiler output (`react/compiler-runtime` — we may add a no-op `c` function later if needed)
- Server Actions via Flight `encodeReply` (Start uses its own serverFn system)

---

## Package layout

A single `@tanstack/redact` package with subpath exports. Each subpath maps to a React-shape specifier the Vite plugin (or your own bundler aliases) rewrites:

```
packages/redact/
  src/
    core/                 # VDOM types + symbols (FiberTag, Hook, ReactNode, …)
    react/                # 'react'                  → @tanstack/redact
    dom/                  # 'react-dom'              → @tanstack/redact/dom
                          # 'react-dom/client'       → @tanstack/redact/dom-client
                          # 'react-dom/test-utils'   → @tanstack/redact/dom-test-utils
      features/           # opt-in features (each is index/full/stub triple)
        portal/  context/  suspense/  memo/
        forward-ref/  lazy/  class/  hydration/
    server/               # 'react-dom/server'       → @tanstack/redact/server
    scheduler/            # 'scheduler'              → @tanstack/redact/scheduler
    vite/                 # redact() Vite plugin     → @tanstack/redact/vite
  package.json            # subpath exports for all of the above + ./features/* + ./_all
```

Bundler aliases are wired up by the `redact()` Vite plugin (or manually for non-Vite bundlers). User code keeps its canonical `import { useState } from 'react'` — the swap happens at the bundler level, never at the source level.

---

## Test strategy

1. **Unit tests** — each hook, each export, behavioral contracts
2. **React Testing Library compatibility suite** — ensure RTL works against our shim
3. **Snapshot tests** against real React for identical output on common patterns
4. **Integration** — run TanStack Router's existing test suite with our shim aliased in
5. **E2E** — example Start app, build + hydrate, verify clickability during streaming

---

## Size (shipped)

Numbers from `pnpm size` against `@tanstack/redact@0.0.1`. The user-facing column names are the React-shape aliases the Vite plugin sets up.

| Subpath | min | gzip | brotli |
|---|---:|---:|---:|
| `react` | 6.59 KB | **2.65 KB** | 2.41 KB |
| `react/jsx-runtime` | 247 B | 189 B | 178 B |
| `react-dom/client` (`full`) | 26.56 KB | **9.07 KB** | 8.21 KB |
| `react-dom/client` (`nano`) | 18.75 KB | **6.75 KB** | 6.10 KB |
| `react-dom/server` | 11.48 KB | 4.59 KB | 4.16 KB |
| **Client total** (`full`: react + react-dom/client + jsx-runtime) | 32.63 KB | **11.18 KB** | 10.14 KB |

Server-side weight doesn't count toward the page-weight goal. Per-feature gzip deltas (for sizing individual feature flags) live in [SAVINGS_ANALYSIS.md](./SAVINGS_ANALYSIS.md).
