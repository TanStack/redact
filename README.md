# redact

**React, redacted.** A minimal React-19-API-compatible drop-in replacement, **~4× smaller** than canonical React. Shipped as a single `@tanstack/redact` package with subpath exports for the `react` / `react-dom` / `react-dom/server` / `scheduler` / `react/jsx-runtime` shapes. User code keeps its canonical `import { useState } from 'react'` — the swap happens at the bundler level.

- **9.07 KB** gzip at full drop-in parity (vs ~45 KB for React 19)
- **6.75 KB** gzip with every opt-in feature stubbed (`nano` preset)
- **707/707** unit + integration tests passing, SSR + streaming Suspense + hydration included
- Running in production on [tanstack.com](https://tanstack.com) as of 2026-04-20

---

## Quick start

```bash
pnpm add @tanstack/redact@next
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { redact } from '@tanstack/redact/vite'

export default defineConfig({
  plugins: [redact()],
})
```

That's it. The plugin aliases `react` / `react-dom` / `scheduler` across Vite's client + ssr environments. The RSC environment is skipped so `@vitejs/plugin-rsc` keeps using real React for Flight serialization. User-facing imports are unchanged:

```ts
import { useState, Suspense } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
```

### Shrink further with feature flags

Two presets — pick a starting point, flip flags from there:

```ts
redact({ preset: 'full' })        // 9.07 KB — everything on, opt OUT individual features
redact({ preset: 'nano' })        // 6.75 KB — everything off, opt IN what you need
```

Opt out from `full`:

```ts
redact({
  preset: 'full',
  features: {
    hydration: false,                  // SPA only — no SSR
    classComponents: false,            // function components only
  },
})
```

Opt in from `nano`:

```ts
redact({
  preset: 'nano',
  features: {
    context: true,                     // bring back just what you need
    suspense: true,
  },
})
```

Full feature matrix and alternative configuration paths below.

---

## How it works in 30 seconds

`@tanstack/redact/dom` is built as an irreducible core (fiber reconciler, host DOM, core hooks, elements) plus **8 opt-in features** layered on top. Each feature has a `full.ts` (real implementation) and a `stub.ts` (graceful degradation). Features self-register with the reconciler at module load — renderers, type matchers, capability hooks.

Feature selection is a bundler-level concern. The `@tanstack/redact/vite` plugin's `resolveId` hook swaps `features/<name>/index.js` → `features/<name>/stub.js` for features you've flagged off. Stubbed features' full code never enters the module graph, so tree-shaking strips it. No user-code changes. No runtime branching.

---

## Feature flags

### Feature matrix

| Flag | Full behavior | Stub behavior (when `false`) | Savings (gzip) |
|---|---|---|---:|
| `portal` | `createPortal` into alt container | Children render in place, `container` ignored | ~30 B |
| `context` | Provider push/pop + consumer walk | Provider → Fragment; `useContext` returns default | ~80 B |
| `suspense` | Boundary + fallback + streaming hydration | Suspense → Fragment; thenables retry on settle | **~640 B** |
| `memo` | `shallowEqual` prop-equality gate | Passes through every parent render | ~80 B |
| `forwardRef` | Ref forwarded to inner fn | Ref dropped (React 19 "refs as props" still works) | ~70 B |
| `lazy` | Full hydration coordination | Sync-resolvable payloads work; async retries on settle | ~20 B |
| `classComponents` | Full lifecycle + `contextType` + error boundaries | `constructor` + `render` + `setState` only | ~200 B |
| `hydration` | SSR DOM adoption, streaming boundaries, scroll guard, event replay | `hydrateRoot` throws; use `createRoot` for SPA | **~1270 B** |

**Always on** (irreducible core, ~6.7 KB gzip): fiber reconciler with keyed child diffing, host DOM mount/update, `useState` / `useReducer` / `useEffect` / `useLayoutEffect` / `useInsertionEffect` / `useRef` / `useMemo` / `useCallback` / `useId` / `useSyncExternalStore` / `use` (for thenables), native event binding, Fragments, StrictMode/Profiler (aliased to Fragment), element creation + JSX runtime.

### Presets

| Preset | What's on | `react-dom/client` gzip | Intent |
|---|---|---:|---|
| `full` (default) | all 8 features | **9.07 KB** | Drop-in React — opt OUT individual features you don't need |
| **`nano`** | none | **6.75 KB** | Start minimal — opt IN individual features you need |

Two presets, not a spectrum: every app either wants most of React (start from `full`, opt out) or a tight bundle (start from `nano`, opt in). Per-feature overrides merge on top of preset defaults either way.

---

## Configuration

Four ways to configure, depending on your bundler and ergonomics preference.

### 1. Vite plugin (recommended)

`@tanstack/redact/vite`'s `redact()` plugin. Covered in [Quick start](#quick-start) above. Full options:

```ts
interface RedactOptions {
  preset?: 'nano' | 'full'                         // default: 'full'
  features?: {
    portal?: boolean
    context?: boolean
    suspense?: boolean
    memo?: boolean
    forwardRef?: boolean
    lazy?: boolean
    classComponents?: boolean
    hydration?: boolean
  }
  skip?: ReadonlyArray<string>                     // don't alias these specifiers
  resolveFrom?: string                             // override package resolution root
  packageRoots?: Record<string, string>            // explicit package paths
}
```

The plugin also handles Vite-specific wiring: `optimizeDeps.exclude` for the shim packages, `ssr.noExternal` so SSR bundles inline them, and an `enforce: 'pre'` hook ordering so the alias wins over other resolvers.

### 2. Bundler aliases (Webpack / Rollup / esbuild / …)

The package exposes every feature module as a `./features/*` subpath export. Any bundler with a path-alias feature can redirect a feature's `index` to its `stub` to opt the feature out of the bundle.

**Subpath layout:**

```
@tanstack/redact/features/
  portal/ context/ suspense/ memo/ forward-ref/ lazy/ class/ hydration/
    index    ← re-exports from ./full by default
    full     ← real implementation
    stub     ← graceful degradation
```

**Webpack example (stubs hydration + suspense):**

```js
// webpack.config.js
module.exports = {
  resolve: {
    alias: {
      '@tanstack/redact/features/hydration/index':
        '@tanstack/redact/features/hydration/stub',
      '@tanstack/redact/features/suspense/index':
        '@tanstack/redact/features/suspense/stub',
    },
  },
}
```

**Rollup:**

```js
import alias from '@rollup/plugin-alias'

export default {
  plugins: [
    alias({
      entries: [
        {
          find: '@tanstack/redact/features/hydration/index',
          replacement: '@tanstack/redact/features/hydration/stub',
        },
      ],
    }),
  ],
}
```

**esbuild:**

```js
import { build } from 'esbuild'

await build({
  entryPoints: ['src/app.tsx'],
  bundle: true,
  alias: {
    '@tanstack/redact/features/hydration/index':
      '@tanstack/redact/features/hydration/stub',
  },
})
```

**Gotchas:**

- **On-disk folder names vs. config keys**: `forward-ref/` ↔ `forwardRef`, `class/` ↔ `classComponents`. When configuring aliases manually, match the on-disk folder.
- **Single-instance requirement**: `@tanstack/redact` (and any subpath of it) must resolve to **one** installed copy in your app. Mixing source + dist, or two different tarballs, duplicates `ReactSharedInternals` and breaks hooks. The package's `ReactSharedInternals` is stashed on `globalThis` under a registered symbol as a defense-in-depth, but you should still aim for a single copy.
- **Feature interdependencies**: Suspense's full implementation imports hydration helpers. If hydration is stubbed but Suspense is full, the Suspense feature uses hydration's no-op stubs (fine — you're not hydrating). Suspense stubbed + hydration full is also fine (streaming boundaries just won't render fallback UI because `Suspense` maps to Fragment).

### 3. Prebuilt bundle presets (planned)

Not yet shipped. The planned shape:

```ts
import { createRoot } from '@tanstack/redact/dom/nano/client'
```

Zero bundler configuration; useful for script-tag usage, non-bundler Node tools, or users who just want the smallest install without thinking about it.

**Why not yet:** the preset bundle would need its own self-contained `_all.js` built with the right stubs compiled in — stubs can't reliably overlay a module that registers full variants first (registration order matters, last-write-wins). We want to gather real Vite-plugin usage data before deciding which prebuilt configurations are worth publishing. Open an issue with your use case if this unblocks you.

### 4. npm aliases (limited)

`npm:` package aliases in `package.json` work for the top-level `react` mapping but **not** for subpaths — there's no spec-level way to point `react-dom` at a subpath like `@tanstack/redact/dom` purely via `package.json`. So this path only gets you partway:

```jsonc
// package.json — works, but only swaps `react` itself
{
  "dependencies": {
    "react": "npm:@tanstack/redact@next"
  }
}
```

Anything that imports `react-dom`, `react-dom/client`, `react-dom/server`, or `scheduler` will still resolve to the real React in `node_modules` unless your bundler can rewrite those specifiers — at which point you may as well use Path 1 (Vite plugin) or Path 2 (bundler aliases). This is a real trade-off of the single-package layout: the install side is simpler but the no-bundler workflow loses some flexibility versus a multi-package shim. If you need a no-bundler full swap, open an issue with your toolchain and we can publish individual `@tanstack/redact-dom`, `@tanstack/redact-server`, etc. compatibility re-export packages.

---

## Advanced: authoring custom features & bundler plugins

If you're extending the system, writing a bundler plugin for a tool without one, or just curious how the swap works — the internal API surface is exported from `@tanstack/redact/_all`.

### Registration primitives

Feature modules self-register by calling these at module load:

```ts
import {
  registerRenderer,
  registerTypeMatcher,
  registerElementMarker,
  type RenderFn,
  type TypeMatcher,
} from '@tanstack/redact/_all'

// Install a renderer for a FiberTag. Later calls overwrite earlier ones —
// stubs exploit this order-dependence.
function registerRenderer(tag: FiberTag, fn: RenderFn): void

// Add a type matcher. Iterated in registration order during fiber creation,
// after core checks (string → Host, REACT_FRAGMENT_TYPE → Fragment) and
// before the function-vs-class fallback.
type TypeMatcher = (type: any, marker: any) => FiberTag | null
function registerTypeMatcher(m: TypeMatcher): void

// Extend the accepted $$typeof set for child normalization. Default:
// REACT_ELEMENT_TYPE, REACT_LEGACY_ELEMENT_TYPE. Portal adds REACT_PORTAL_TYPE.
function registerElementMarker(sym: symbol): void
```

### Capability hooks

Cross-cutting concerns (thrown-thenable handling, context reads) install via `installCapability`:

```ts
import { installCapability, type Capabilities } from '@tanstack/redact/_all'

interface Capabilities {
  handleSuspended: (fiber: Fiber, thenable: Promise<any>) => void
  readContext: (fiber: Fiber, ctx: any) => any
}

function installCapability<K extends keyof Capabilities>(
  name: K,
  fn: Capabilities[K],
): void
```

Defaults when no feature installs an override:
- `handleSuspended`: retry-on-settle (no boundary stack, no fallback)
- `readContext`: returns `ctx._currentValue` with no provider-tree walk

The full Suspense feature installs a boundary-stack-based `handleSuspended`. The full Context feature installs a walking `readContext`.

### Authoring a custom feature

```ts
// my-feature/full.ts
import {
  FiberTag,
  registerRenderer,
  registerTypeMatcher,
  reconcileChildren,
  childrenToArray,
  type Fiber,
} from '@tanstack/redact/_all'
import { SOME_SYMBOL } from '@tanstack/redact'

function renderMyThing(fiber: Fiber, domParent: Node, anchor: Node | null): void {
  // your render logic
}

registerTypeMatcher((_type, marker) =>
  marker === SOME_SYMBOL ? FiberTag.SomeTag : null,
)
registerRenderer(FiberTag.SomeTag, renderMyThing)
```

```ts
// my-feature/stub.ts
import { FiberTag, registerTypeMatcher } from '@tanstack/redact/_all'
import { SOME_SYMBOL } from '@tanstack/redact'

// Stub: treat my-thing elements as Fragments (children render normally).
registerTypeMatcher((_type, marker) =>
  marker === SOME_SYMBOL ? FiberTag.Fragment : null,
)
```

Pair with an `index.ts` (`export * from './full'`) and let your bundler pick which to import.

### Authoring a bundler plugin

The Vite plugin's core is two `resolveId` cases. Port this pattern to any bundler's resolve hook:

```ts
// Case 1: short specifier from features/index.ts
// Matches `./portal`, `./context`, etc.
if (importer matches /features[/\\]index\.(ts|js)$/) {
  const name = id.match(/^\.\/([a-z-]+)$/)?.[1]
  if (name && flags[name] === false) {
    return resolveFrom(`./${name}/stub`, importer)
  }
}

// Case 2: resolved-path match for hydration
// (imported from reconcile, root, suspense/full, lazy/full)
if (flags.hydration === false && /\/hydration$/.test(id)) {
  const resolved = await resolve(id, importer)
  if (/features[/\\]hydration[/\\]index\.(ts|js)$/.test(resolved)) {
    return resolved.replace(/index\.(ts|js)$/, 'stub.$1')
  }
}
```

Real implementation: [packages/redact/src/vite/index.ts](packages/redact/src/vite/index.ts).

### Verifying your setup

Whichever path you choose, check that stubbed features' full code isn't in your output. Use your bundler's analyzer (rollup-plugin-visualizer, Webpack's bundle-analyzer, etc.) and search for `features/<name>/full.js`. With `hydration: false`, you should NOT see `features/hydration/full.js` or its imports (cursor machinery, event-replay, scroll-guard).

---

## Scope

### Supported

- React 19 element model, JSX (classic + automatic), Fragment, Suspense, Portal, Error boundaries, forwardRef, memo, lazy
- Full hook surface: `useState`, `useReducer`, `useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useMemo`, `useCallback`, `useRef`, `useContext`, `useSyncExternalStore`, `useId`, `useDeferredValue`, `useTransition`, `use` (Context + Promise), `useEffectEvent`
- Class components with full lifecycle (`componentDidMount`/`componentDidUpdate`/`componentWillUnmount`, `contextType`, `shouldComponentUpdate`, `getDerivedStateFromError`, `componentDidCatch`, legacy lifecycles as no-ops)
- SSR via `renderToString` / `renderToReadableStream` / `renderToPipeableStream` — including Suspense boundary streaming with `$RC` reveal + event replay
- Hydration: SSR DOM adoption, deferred hydration for `use(promise)` / lazy, cursor preservation across the synchronous `endHydration`
- Cohabitation with `@vitejs/plugin-rsc`: the Vite plugin deliberately skips the RSC environment so Flight serialization stays on real `react-server-dom`

### Best-effort / subset behavior

- `useTransition` / `useDeferredValue` run synchronously — no priority scheduling
- Scheduler shim is a no-op wrapper around microtasks
- No time slicing, no lane-based work interruption

### Out of scope

- `react-server-dom-*/client` Flight deserializer (TanStack Start uses its own seroval-based codec + `@vitejs/plugin-rsc`)
- React DevTools protocol
- Behavioral 1:1 parity with React under concurrent-mode stress

See [docs/SURFACE.md](./docs/SURFACE.md) for the full React-19 export-by-export audit.

---

## Performance

Measured against TanStack Router + TanStack Start benchmarks (`pnpm nx run @benchmarks/client-nav:test:perf:react`, `@benchmarks/ssr:test:perf:react`):

| Bench | Real React | This shim | Ratio |
|---|---:|---:|---:|
| `client-nav` (router-driven navigation loop) | 34.9 hz | **78.1 hz** | **2.24× faster** |
| `ssr` (request loop) | ~48 hz | **168 hz** | **~3× faster**[^1] |

[^1]: SSR speedup requires a latent `stringifyValue` bug in `@tanstack/router-core` to be patched (exception-throwing in a hot loop was eating 34% of request time regardless of renderer — see `scripts/repro-router-hang.mjs`).

On tanstack.com (full site, not just renderer): Lighthouse perf scores at parity with stock React, consistent FCP wins across desktop/mobile, mild LCP regression on RSC-heavy pages (tied to the shim's Flight-deserialize suspend/resume), CLS/TBT ≈ 0. Full 30-run median breakdown: [tanstack.com/docs/perf/lighthouse-shim-vs-react-2026-04-20.md](https://github.com/TanStack/tanstack.com/blob/main/docs/perf/lighthouse-shim-vs-react-2026-04-20.md).

---

## Development

### Layout

One package, one tree, internal subdirectories per concern:

```
packages/redact/src/
  core/                     VDOM types + symbols (FiberTag, Hook, ReactNode, …)
  react/                    'react' entry: createElement, hooks, context, class,
                            memo, suspense, jsx-runtime, ReactSharedInternals
  dom/                      'react-dom' entry: reconciler, host DOM, root,
                            createPortal, flushSync
    features/               opt-in features (each is an index/full/stub triple)
      portal/  context/  suspense/  memo/
      forward-ref/  lazy/  class/  hydration/
  server/                   'react-dom/server' entry: renderToString,
                            renderToReadableStream, renderToPipeableStream
  scheduler/                'scheduler' shim (no-op microtask wrapper)
  vite/                     redact() Vite plugin: aliases + feature-flag swaps
tests/                      vitest suite — 707 tests
examples/
  ssr-demo/                 full SSR + Suspense streaming smoke app
docs/
  SURFACE.md                React 19 export audit
  SAVINGS_ANALYSIS.md       per-export size savings vs React 19
scripts/
  build.mjs                 per-entry esbuild build (every TS module emitted)
  size.mjs                  per-preset / per-flag gzip report
  size-check.mjs            CI size-budget assertions
  size-analyze.mjs          per-module byte breakdown for a given preset
```

Cross-subdir imports inside `packages/redact/src/` use relative paths
(`../core`, `../react`, etc.). The build emits each TS module as its own
dist file with all relative imports kept literal — that's what preserves the
import-graph boundaries the Vite plugin needs to swap features at consumer
build time.

### Commands

```bash
pnpm install
pnpm build                    # esbuild dist/ + tsc declaration emit
pnpm test                     # vitest suite (707 tests)
pnpm test:types               # tsc --noEmit
pnpm size                     # gzip/brotli per entry + per feature-stub
pnpm size:check               # CI budget assertions (fails on regression)
pnpm --filter ssr-demo dev    # serve http://localhost:5173
```

### Current sizes

Subpath sizes from `pnpm size`. The `react` / `react-dom/client` / `react-dom/server` column names are the user-facing aliases the Vite plugin sets up; under the hood they all resolve into `@tanstack/redact/*`.

| Entry | min | gzip | brotli |
|---|---:|---:|---:|
| `react`              (= `@tanstack/redact`)             | 6.59 KB | 2.65 KB | 2.41 KB |
| `react/jsx-runtime`  (= `@tanstack/redact/jsx-runtime`) | 247 B | 189 B | 178 B |
| `react-dom/client`   (= `@tanstack/redact/dom-client`, `full`) | 26.56 KB | **9.07 KB** | 8.21 KB |
| `react-dom/client`   (= `@tanstack/redact/dom-client`, `nano`) | 18.75 KB | **6.75 KB** | 6.10 KB |
| `react-dom/server`   (= `@tanstack/redact/server`)      | 11.48 KB | 4.59 KB | 4.16 KB |
| **Client total** (`full`: react + react-dom/client + jsx-runtime) | 32.63 KB | **11.18 KB** | 10.14 KB |

Regenerate with `pnpm size`.

---

## Changelog

The project's first 9 alpha versions shipped as separate `@tanstack/react`, `@tanstack/react-dom`, `@tanstack/react-dom-server`, `@tanstack/dom-core`, `@tanstack/scheduler`, and `@tanstack/dom-vite` packages (`0.1.0-alpha.0` … `0.1.0-alpha.9`). Those packages are now deprecated. The project starts fresh as a single `@tanstack/redact` (`0.0.1`+) with subpath exports — the fixes below predate the rename and the package names refer to the previous multi-package layout.

- `@tanstack/redact@0.0.1` — **first release of `@tanstack/redact`**. Consolidates the 6 previously-separate alpha packages into a single package with subpath exports (`./jsx-runtime`, `./dom`, `./dom-client`, `./dom-test-utils`, `./server`, `./scheduler`, `./vite`, `./features/*`, `./_all`). Vite plugin renamed `tanstackDom()` → `redact()`, types `TanStackDom*` → `Redact*`. `ReactSharedInternals` made a `globalThis`-stashed singleton via `Symbol.for` to defend against duplicate package copies under bundlers like Cloudflare's `vite-plugin` that mix `noExternal: true` worker bundling with separate pre-bundled dep copies. New `tests/public-exports.test.ts` snapshot guards every subpath's named-export set against silent link-time drift.
- `react@0.1.0-alpha.8` — added `useEffectEvent` hook (stable callback over a `useInsertionEffect`-refreshed ref). Fixes missing-export errors in consumers using React 19 event handlers.
- `react-dom@0.1.0-alpha.8` — **feature-flag system landed**: 8 opt-in features with stub/full pairs, typed Vite plugin config, `pnpm size:check` CI budget enforcement. `nano` preset ships **6.75 KB gzip** — a 26% reduction from `full`.
- `react-dom@0.1.0-alpha.5` — `useEffect` / `useLayoutEffect` cleanup now runs at effect-run time (in the passive drain) instead of dispatch time. Coalesced renders landing back-to-back before the drain (common with router/store state updates triggered by one user action) no longer leak side-effects into the DOM.
- `react-dom@0.1.0-alpha.4` — `renderFunction`'s deferred-hydration branch now matches `renderLazy`'s ancestor-Suspense guard (`_awaitingLazyHydration`). Fixes duplicate markup on RSC-hydrated subtrees.
- `react-dom-server@0.1.0-alpha.4` — shell + bootstrap emits are buffered into one `TextEncoder.encode` + `ReadableStream.enqueue` instead of per-chunk, cutting Node stream overhead in the SSR CPU profile.
</content>
