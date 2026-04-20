# React 19 API Surface — Implementation Plan

Goal: API-complete drop-in replacement for `react` + `react-dom` targeting TanStack Start apps (tanstack.com).
Target size: ~8-11KB gzipped client.

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

```
packages/
  core/                   # VDOM types + diff algorithm
  react/                  # 'react' entrypoint
  react-dom/              # 'react-dom' + 'react-dom/client'
  react-dom-server/       # 'react-dom/server'
  jsx-runtime/            # 'react/jsx-runtime' + 'react/jsx-dev-runtime'
  scheduler/              # 'scheduler' shim
  hydration-runtime/      # tiny inline script for boundary reveal + event replay
```

Each exposes the exact package name React uses via `package.json` `name` field so bundler aliases map cleanly:
- `tanstack-dom` → alias plan for consumers
- Individual subpackages use `name: "react"` etc. when installed as replacements (or we publish under a namespace and consumers configure aliases).

---

## Test strategy

1. **Unit tests** — each hook, each export, behavioral contracts
2. **React Testing Library compatibility suite** — ensure RTL works against our shim
3. **Snapshot tests** against real React for identical output on common patterns
4. **Integration** — run TanStack Router's existing test suite with our shim aliased in
5. **E2E** — example Start app, build + hydrate, verify clickability during streaming

---

## Size budget (working targets)

| Package | Target gzip |
|---|---|
| react | 2.0 KB |
| react-dom (client) | 5.0 KB |
| react-dom-server | 3.0 KB (server-only, doesn't count toward client) |
| jsx-runtime | 0.3 KB |
| scheduler | 0.2 KB |
| hydration-runtime | 0.8 KB (inline) |
| **Total client** | **~8-9 KB** |

Server-side weight doesn't matter for the page-weight goal.
