# redact

**React, redacted.** A small React-compatible runtime with synchronous rendering. One Vite plugin replaces the React, DOM, server, scheduler, and JSX entrypoints. Your application's imports stay unchanged.

The goal is React's APIs and everyday behavior without concurrent scheduling, not a different component model. The intentional differences are in the [compatibility table](#compatibility).

These APIs are included in Redact 0.1.0. Comparisons use pinned React 19.3.0 and were recorded September 11, 2026. The benchmark reports retain the exact measured source snapshots and build inputs.

## Quick start

```bash
pnpm add @tanstack/redact
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { redact } from '@tanstack/redact/vite'

export default defineConfig({
  plugins: [redact()],
})
```

Keep importing from React:

```ts
import { useState, Suspense } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
```

The plugin handles client and SSR builds. It leaves the RSC environment on real React so `@vitejs/plugin-rsc` can keep owning Server Component serialization.

## Bundle size

Production ESM bundles retaining all exports from the React, JSX, DOM, and DOM-client entries:

| Runtime | Gzip bytes | Compared with React |
|---|---:|---:|
| React 19.3.0 | 69,162 | Reference |
| Redact, default Vite configuration | 23,311 | 66.3% smaller |
| Redact, native animation enabled | 28,159 | 59.3% smaller |

These are runtime bundles, not whole applications. Redact is measured from the [0.1.0 release build](./benchmarks/results/release-0.1.0-sizes.json). Real apps tree-shake differently, and the runtimes have different scheduling capabilities.

Standalone Redact entries, measured separately:

| Entry / configuration | Gzip bytes |
|---|---:|
| DOM client, default Vite features | 20,139 |
| DOM client, native animation enabled | 24,991 |
| DOM client, `nano` preset | 12,466 |
| React API entry | 2,764 |
| Server entry | 8,964 |

These entries overlap, so their sizes are not additive. `nano` removes behavior and is not a full-compatibility preset. The expanded API surface is larger than earlier Redact, not a size reduction over previous releases. [Exact configurations, inputs, and historical comparisons](./benchmarks/SHIP_RESULTS.md#size).

## Performance

Production microbenchmarks on an Apple M5 Pro, Chrome 152, without CPU throttling: five fresh-browser blocks, five rounds each. Redact uses the built package with default Vite features. Synchronous flushes ensure updates complete before timing stops.

These timings use the frozen pre-release snapshot, before the final hydration-recovery cleanup was merged from 0.0.21. That cleanup passed the release tests; the timing experiments were not repeated.

Times are median averages per completed workload batch in **milliseconds**, not per component. Negative percentages mean less time. Percentages use paired measurements, not division of the rounded medians.

| Browser workload | React ms | Redact ms | Redact time vs React |
|---|---:|---:|---:|
| Sparse state updates | 0.009 | 0.002 | -71.9% |
| Mixed-depth state updates | 0.227 | 0.093 | -59.1% |
| Keyed list reversal | 0.161 | 0.112 | -30.3% |
| Context through memo | 0.073 | 0.052 | -29.1% |
| Deep-tree prop updates | 0.012 | 0.010 | -22.4% |
| Batched state updates | 0.050 | 0.041 | -19.7% |
| Null-heavy child lists | 0.094 | 0.083 | -14.2% |
| Stable keyed rows, automatic JSX | 0.050 | 0.043 | -11.6% |
| Controlled selects | 0.142 | 0.132 | -7.6% |
| Prop updates, automatic JSX | 0.237 | 0.226 | -3.8% |
| Prop updates, classic JSX | 0.249 | 0.243 | -2.3% |
| Stable keyed rows, classic JSX | 0.045 | 0.046 | No clear difference |
| Mount and unmount | 0.149 | 0.162 | +7.5% |
| Reducer batches | 0.051 | 0.055 | +7.9% |
| String SSR in the browser | 0.038 | 0.043 | +10.4% |
| Hydration | 0.182 | 0.227 | +21.4% |
| Passive effects | 0.024 | 0.032 | +27.0% |
| Reducer updates under Suspense | 0.051 | 0.076 | +49.6% |
| Suspense retry cycles | 0.117 | 0.268 | +124.8% |

The largest ratio, Suspense retries, is about **0.15 ms of extra work per cycle** here. A cycle covers 96 components, 192 reducer actions, hiding, retrying, revealing, and shared correctness checks. It does not mean interactions feel 2.25 times slower. Larger trees, repeated retries, and slower devices can make the difference matter.

### Server rendering

Separate Node 24 measurements use production source bundles, five fresh-process blocks, and the same checked output. They exclude package startup, network latency, and streaming waterfalls.

| Server workload | React ms | Redact ms | Redact time vs React |
|---|---:|---:|---:|
| Fully-ready readable stream | 0.175 | 0.088 | -49.4% |
| String SSR with hooks/context | 0.076 | 0.053 | -30.5% |
| String SSR, clean text | 0.057 | 0.053 | -6.9% |
| String SSR, escaped text | 0.126 | 0.124 | No clear difference |

### Interactions and memory

Separate 2,400-row fixtures use normal scheduling for clicks and forced garbage collection for retained heap:

| Measurement | React | Redact, default |
|---|---:|---:|
| Click handler to committed DOM, median / p95 | 1.5 / 1.6 ms | 1.2 / 1.3 ms |
| Mounted retained JS heap, median | 666.4 KiB | 762.5 KiB |
| Extra DOM nodes after final unmount | 0 | 0 |

Handler-to-commit is not paint latency or field INP; retained heap is not allocation rate or proof of no leaks. Observed click durations were browser-rounded to 16 ms for both; one Redact event entry was absent, not zero.

An identical-React control measured 0.5% median absolute variation across browser workloads, with wider uncertainty in some cases. Small differences need caution. These results do not establish whole-app speedups, behavior under concurrent input, or mobile/Safari/Firefox performance. [All intervals and measurements](./benchmarks/SHIP_MEASUREMENTS.md), [independent audit](./benchmarks/SHIP_AUDIT.md).

## Compatibility

This is the default Vite configuration. API availability is not a promise of every React behavior, especially concurrent behavior.

| Area | Redact behavior |
|---|---|
| Core rendering | JSX, hooks (including `use`, `useEffectEvent`, `useId`, and `useSyncExternalStore`), context, refs, memo, lazy, portals, error boundaries, and modern class lifecycles. Legacy class lifecycles are no-ops. |
| DOM and forms | Controlled inputs, reset defaults, event handling, and preservation of edits during hydration have shared React tests. |
| Suspense and hydration | Fallbacks, retained primary DOM, retries, streaming boundaries, and event replay. No priority scheduling. |
| `Activity` | Retains hidden DOM/state and disconnects effects, refs, and subscriptions. Insertion effects stay connected. Hidden work is synchronous, not background priority. |
| Fragment refs | Stable DOM instances with events, focus, geometry, observers, scrolling, and portal/visibility tracking. |
| Transitions | `useTransition` / `startTransition` run work synchronously. Pending stays false; `useDeferredValue` returns its input. No time slicing or interruptible renders. |
| `useActionState` | Returns the initial state, a no-op dispatch, and `false`. It does not run the action. |
| `useOptimistic`, `useFormStatus` | No optimistic overlay; the optimistic setter is a no-op. Form status stays idle. |
| View transitions | `ViewTransition` preserves state; `addTransitionType` does not animate by default. Native snapshots/styles/callbacks are experimental and opt-in. Animated commits wait for the browser snapshot callback, without a concurrent scheduler. |
| Browser-only rendering | `browser()` requests a server-to-client Suspense fallback; `onBrowserBailout` reports it separately from errors. `use(browser())` returns `undefined` on the client. |
| Resource APIs | Preload/preinit/preconnect/DNS hints and declarative styles/scripts, with document/ShadowRoot ownership and streamed stylesheet coverage. |
| SSR | `renderToString`, `renderToStaticMarkup`, readable and pipeable streams. Full Fizz prerender/resume APIs are not implemented. |
| Caching | `cache` returns its function, `cacheSignal` returns `null`, and `unstable_useCacheRefresh` is a stable client no-op. Invoking a server refresh throws. Client/DOM-server rendering is uncached. |
| React Compiler | The `react/compiler-runtime` memo-cache entrypoint is implemented and aliased. This is not validation of every compiler output pattern. |
| Server Components / Flight | Kept on upstream React in the RSC environment, not reimplemented by Redact. |
| Debugging | `StrictMode` / `Profiler` render children without double invocation or profiling. `useDebugValue` is a no-op. React DevTools and Fast Refresh internals are not implemented. |

Native animation is not exhaustive visual parity. Production animation, hidden-tab behavior, broader resource/navigation races, and Safari/Firefox remain unverified. [API details](./docs/REACT_19_3_SUPPORT.md), [upstream audit](./docs/REACT_19_3_AUDIT.md), [native animation limits](./docs/VIEW_TRANSITION_EXPERIMENT.md).

## Feature flags

`redact()` uses the `full` preset: all optional features enabled **except native animation**. Turn off only behavior your app does not need:

```ts
redact({ features: { hydration: false, classComponents: false } })
redact({ features: { viewTransitions: true } }) // experimental animation
redact({ preset: 'nano', features: { context: true } })
```

`nano` starts with every optional feature off. Overrides merge with the preset. Feature savings overlap and are not additive.

<details>
<summary>What each disabled feature removes</summary>

| Flag | Behavior when `false` |
|---|---|
| `activity` | Hidden children unmount and lose state. |
| `fragmentRefs` | No Fragment DOM instance. |
| `viewTransitions` | No native snapshots or animation callbacks; the boundary retains state. |
| `portal` | Children render in place, not into the target container. |
| `context` | Providers do not propagate values; reads return the default. |
| `suspense` | No fallback UI; thrown thenables still retry on settlement. |
| `memo` | No prop-equality bailout. |
| `forwardRef` | No wrapper forwarding; ordinary ref props still work. |
| `lazy` | Only already-synchronous payloads resolve. |
| `classComponents` | Constructor, render, and setState only; no lifecycles or error boundaries. |
| `hydration` | `hydrateRoot` throws; use `createRoot`. |

</details>

## Verification

`pnpm test:ci` passes 1,569 tests, type checking, the built-package verifier, and all 19 source/dist size budgets. The 91 ordinary-suite skips are not passes. Native Node import order, NodeNext declarations, development/production behavior, and actual Vite feature selection are checked.

The separate Chrome gate passes 1,266 case executions across Redact and React, including repeated suites/motion modes, not 1,266 unique behaviors. Seven declared exclusions remain: six Node-only stream executions and one known React Activity hydration failure. [Chrome ledger](./benchmarks/SHIP_CHROME_FINAL.md).

| Real app | Published Redact 0.1.0 result |
|---|---|
| tanstack.com | Production build, 503 tests, 5 local Worker routes, navigation/history, controls, portals, and mobile checks pass. Deployed preview works; production upgrade awaits required review. |
| tannerlinsley.com | Upgraded in production. Normal build prerenders all 10 pages; 8 live routes and browser interactions pass with no browser errors. Existing mobile header overflow remains. |

These are integration checks, not site-speed measurements or coverage of authenticated flows. [Published-package and deployment evidence](./benchmarks/RELEASE_0_1_0_SITES.md), [earlier renderer controls](./benchmarks/SHIP_SITE_INTEGRATION.md).

## Releases

1. Run `pnpm changeset` for a package change and commit the release note with your PR.
2. Merge the PR into `main`. The Release workflow opens or updates `ci: Version Packages` with the new version and changelog.
3. Review that version PR, approve its checks if GitHub requests it, and merge after they pass. The workflow tests, builds, publishes to npm's `latest` tag, and creates a GitHub release.

Publishing uses npm trusted publishing, not a stored npm token. No local publish or hand-edited version bump is needed. [Release configuration](./.github/workflows/release.yml), [contributor details](./.changeset/README.md).

## Development

```bash
pnpm install
pnpm test:ci                 # tests, types, build/import checks, size budgets
pnpm size                    # built-package sizes per entry and feature
pnpm --filter ssr-demo dev
```

[Advanced configuration and internals](./docs/DEVELOPMENT.md), [benchmark reproduction](./benchmarks/README.md), [full ship review](./benchmarks/SHIP_RESULTS.md), [Projecting React](https://tannerlinsley.com/posts/projecting-react).
