# tanstack-react

A minimal, API-compatible React drop-in replacement targeting TanStack Start apps.

**Status:** `0.1.0-alpha.6` published to npm under `next`, running in production on [tanstack.com](https://tanstack.com) as of 2026-04-20. 677/677 unit + integration tests passing. End-to-end SSR demo streams Suspense boundaries and reveals them via the inline `$RC` runtime.

```bash
pnpm install
pnpm test                         # unit + integration tests
pnpm size                         # bundle-size report
pnpm --filter ssr-demo dev        # serve http://localhost:5173
```

## Current size

| Entry               |     gzip |    brotli |
| ------------------- | -------: | --------: |
| `react`             |  2.22 KB |   2.02 KB |
| `react/jsx-runtime` |    189 B |     180 B |
| `react-dom/client`  |  8.65 KB |   7.82 KB |
| **Client total**    | **10.40 KB** | **9.40 KB** |
| `react-dom/server`  |  4.54 KB |   4.12 KB (server-only) |

React 19's full client bundle is ≈ 45 KB gzip — this is roughly **4× smaller**, at the cost of concurrent-mode/scheduler depth under stress (see [Scope](#scope)).

## Performance

Measured against TanStack Router + TanStack Start benchmarks (`pnpm nx run @benchmarks/client-nav:test:perf:react`, `@benchmarks/ssr:test:perf:react`):

| Bench | Real React | Shim | Ratio |
| --- | -: | -: | -: |
| `client-nav` (router-driven navigation loop) | 34.9 hz | **78.1 hz** | **2.24× faster** |
| `ssr` (request loop) | ~48 hz | **168 hz** | **~3× faster**[^1] |

[^1]: SSR speedup requires a latent `stringifyValue` bug in `@tanstack/router-core` to be patched (exception-throwing in a hot loop was eating 34% of request time regardless of renderer — see the shim's `scripts/repro-router-hang.mjs` for a reproducer).

On tanstack.com itself (full site, including router + store + app code, not just the React portion): Lighthouse perf scores at parity with stock React, consistent FCP wins across desktop/mobile, mild LCP regression on RSC-heavy pages (tied to the shim's Flight-deserialize suspend/resume), CLS/TBT ≈ 0. Full 30-run median breakdown: [`tanstack.com/docs/perf/lighthouse-shim-vs-react-2026-04-20.md`](https://github.com/TanStack/tanstack.com/blob/main/docs/perf/lighthouse-shim-vs-react-2026-04-20.md).

## Goal

Satisfy `react` / `react-dom` / `react-dom/server` / `react/jsx-runtime` / `scheduler` imports used by TanStack Router + Start, at a fraction of the bundle size. ~10 KB gzipped client is the current reality.

## Scope

### Supported

- React 19 element model, JSX (classic + automatic), Fragment, Suspense, Portal, Error boundaries, forwardRef, memo, lazy
- Full hook surface: `useState`, `useReducer`, `useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useMemo`, `useCallback`, `useRef`, `useContext`, `useSyncExternalStore`, `useId`, `useDeferredValue`, `useTransition`, `use` (Context + Promise)
- Class components (`componentDidMount`/`componentDidUpdate`/`componentWillUnmount`, `contextType`, legacy lifecycles as no-ops)
- SSR via `renderToString` / `renderToReadableStream` / `renderToPipeableStream` — including Suspense boundary streaming with `$RC` reveal + event replay
- Hydration: adoption of SSR DOM, deferred-hydration for `use(promise)` / lazy with cursor preservation across the synchronous `endHydration`
- Cohabitation with `@vitejs/plugin-rsc`: `@tanstack/dom-vite` deliberately skips the RSC Vite environment so Flight serialization stays on real `react-server-dom`

### Best-effort / subset behavior

- `useTransition` / `useDeferredValue` run synchronously — no priority scheduling
- Scheduler shim is a no-op wrapper around microtasks
- No time slicing, no lane-based work interruption

### Out of scope

- `react-server-dom-*/client` Flight deserializer (TanStack Start uses its own seroval-based codec + `@vitejs/plugin-rsc`)
- React DevTools protocol
- Behavioral 1:1 parity with React under concurrent-mode stress

See [`docs/SURFACE.md`](./docs/SURFACE.md) for the full React-19 export-by-export audit and implementation plan.

## Layout

```
packages/
  core/                   VDOM types + diff
  react/                  'react' entrypoint
  react-dom/              'react-dom' + 'react-dom/client'
  react-dom-server/       'react-dom/server' (renderToString/Stream)
  jsx-runtime/            'react/jsx-runtime' + 'react/jsx-dev-runtime'
  scheduler/              'scheduler' shim
  dom-vite/               Vite plugin: aliases react/react-dom/scheduler/etc. → shim
  hydration-runtime/      inline client runtime (boundary reveal, event replay)
tests/                    vitest suite with aliases pointing at workspace packages
examples/
  ssr-demo/               full SSR + Suspense streaming smoke app
  dom-jsx-playground/     legacy direct-to-DOM JSX experiment (reference only)
docs/
  SURFACE.md              React 19 export audit and implementation plan
  SAVINGS_ANALYSIS.md     per-export size savings vs React 19
scripts/
  repro-router-hang.mjs   reproducer for the router's Date.now() loadedAt bug
  prof-ssr.mjs            drives N SSR requests for CPU-profile capture
  analyze-cpuprofile.mjs  top-N self-time frames from a .cpuprofile
  bucket-cpuprofile.mjs   categorizes .cpuprofile (shim / router / node / native)
```

## Consuming

Two patterns for swapping React in a consumer app:

**Via Vite plugin (recommended):**

```bash
npm install -D @tanstack/dom-vite@next
```

```ts
// vite.config.ts
import { tanstackDom } from '@tanstack/dom-vite'

export default defineConfig({
  plugins: [tanstackDom(), /* ... */],
})
```

The plugin aliases `react`, `react-dom`, `react-dom/client`, `react-dom/server`, `react/jsx-runtime`, and `scheduler` across the client + ssr Vite environments. It deliberately skips the `rsc` environment so `@vitejs/plugin-rsc` keeps using real React for Flight serialization. Runtime-specific server variants (`react-dom/server.edge`, `.node`, `.bun`, `.browser`, `react-dom/static.*`) aren't in the default map — alias those manually at top-level `resolve.alias` in consuming apps if needed (see [tanstack.com's vite.config.ts](https://github.com/TanStack/tanstack.com/blob/main/vite.config.ts) for a full example).

**Via npm aliases (no bundler plugin):**

```jsonc
{
  "dependencies": {
    "react":            "npm:@tanstack/react@next",
    "react-dom":        "npm:@tanstack/react-dom@next",
    "scheduler":        "npm:@tanstack/scheduler@next"
  }
}
```

## Recent fixes

- `react-dom@0.1.0-alpha.5` — `useEffect` / `useLayoutEffect` cleanup now runs at effect-run time (in the passive drain) instead of dispatch time. Coalesced renders that land back-to-back before the drain (common with router/store state updates triggered by a single user action) no longer leak side-effects into the DOM.
- `react-dom@0.1.0-alpha.4` — `renderFunction`'s deferred-hydration branch now matches `renderLazy`'s ancestor-Suspense guard (`_awaitingLazyHydration`). Fixes duplicate markup on RSC-hydrated subtrees.
- `react-dom-server@0.1.0-alpha.4` — shell + bootstrap emits are buffered into one `TextEncoder.encode` + `ReadableStream.enqueue` instead of per-chunk, cutting Node stream overhead in the SSR CPU profile.
