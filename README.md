# tanstack-dom

A minimal, API-compatible React drop-in replacement targeting TanStack Start apps.

**Status:** Working prototype. 39/39 unit tests passing. End-to-end SSR demo streams Suspense boundaries and reveals them via our inline `$RC` runtime.

```bash
pnpm install
pnpm test                         # unit + integration tests
pnpm size                         # bundle-size report
pnpm --filter ssr-demo dev        # serve http://localhost:5173
```

## Current size (v0)

| Entry                          |   gzip |  vs React 19 |
| ------------------------------ | -----: | -----------: |
| `react`                        | 2.2 KB |          ~30% |
| `react-dom/client`             | 6.2 KB |          ~15% |
| `react/jsx-runtime`            |  181 B |          ~50% |
| **Client total**               | **7.9 KB** | **~18%** |
| `react-dom/server`             | 3.6 KB | server-only, doesn't count |

React 19 full client bundle ≈ 45KB gzip. This is roughly 2x Preact, at the cost of a real React 19 API surface.

## Goal

Deliver a runtime that satisfies `react` / `react-dom` / `react-dom/server` / `react/jsx-runtime` / `scheduler` imports used by TanStack Router + Start, at a fraction of the bundle size — target ~8-11KB gzipped client.

Non-goals:
- Behavioral 1:1 parity with React under stress (concurrent scheduling, time slicing, priority inversion)
- `react-server-dom-*/client` Flight deserializer (Start uses its own seroval-based codec)
- React DevTools protocol

See [`docs/SURFACE.md`](./docs/SURFACE.md) for the full export-by-export implementation plan.

## Layout

```
packages/
  core/                   VDOM types + diff
  react/                  'react'  entrypoint
  react-dom/              'react-dom' + 'react-dom/client'
  react-dom-server/       'react-dom/server'
  jsx-runtime/            'react/jsx-runtime' + 'react/jsx-dev-runtime'
  scheduler/              'scheduler' shim
  hydration-runtime/      inline client runtime (boundary reveal, event replay)
tests/                    vitest suite with aliases pointing at workspace packages
examples/
  dom-jsx-playground/     legacy direct-to-DOM JSX experiment (reference only)
docs/
  SURFACE.md              React 19 export audit and implementation plan
```

## Consuming

Two patterns for swapping React in a consumer app:

**Via npm aliases (zero code change):**
```jsonc
{
  "dependencies": {
    "react":     "npm:@tanstack/react@^0",
    "react-dom": "npm:@tanstack/react-dom@^0",
    "scheduler": "npm:@tanstack/scheduler@^0"
  }
}
```

**Via Vite plugin (planned):**
```ts
import { tanstackDom } from '@tanstack/dom-vite'
export default { plugins: [tanstackDom()] }
```
