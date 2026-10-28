# Preact comparison research

Checked October 26, 2026. Public copy: [comparison](../docs/preact.md). Homepage section: `src/components/landing/RedactLanding.tsx` in tanstack.com.

The October 27 follow-up adds [executed framework and behavior comparisons](./FRAMEWORK_COMPARISON.md) using newer published packages. This document preserves the original API and size research.

## Scope and versions

- Preact npm latest resolved to **11.0.2**. Downloaded that exact npm tarball and inspected its source and distributed modules. The existing local Preact checkout is 10.29.1, so it was not used for current claims.
- Redact's current main is **6a6bea7cf2a39ea9609b0c13667c9890e0594e57**, package version **0.2.0**. Its source was archived into a temporary directory for measurement without replacing this workspace's changes.
- This workspace is based on `62b81c1c6e0aa38e06ad70bc72d650f739730314` with extensive existing changes. Its older docs say React DevTools is absent. Current main implements DevTools, so that older claim was rejected.
- Browser engines, CPU timings, memory, and paired framework applications were not benchmarked here. No Preact speed or memory ranking is supported.

## Evidence ledger

| Claim | Primary evidence | Conclusion |
|---|---|---|
| Preact pending/deferred behavior | [11.0.2 compat hooks](https://github.com/preactjs/preact/blob/11.0.2/compat/src/hooks.js); executable probes below | Pending is always false; deferred values are returned unchanged; transition callbacks execute immediately |
| Modern action and visibility API gaps | [11.0.2 compat exports](https://github.com/preactjs/preact/blob/11.0.2/compat/src/index.js); package export map and probes | No `useActionState`, `useOptimistic`, `useFormStatus`, `Activity`, or `ViewTransition` compat export |
| APIs both offer | Same export inventory and runtime probes | `use`, `useEffectEvent`, `useId`, and `useSyncExternalStore` must not be sold as exclusive |
| Insertion effects | Compat hooks above | Preact aliases insertion effects to layout effects |
| React legacy APIs | [Preact compat exports](https://github.com/preactjs/preact/blob/11.0.2/compat/src/index.js), [Redact compatibility](https://github.com/TanStack/redact/blob/6a6bea7cf2a39ea9609b0c13667c9890e0594e57/docs/compatibility.md) | Preact retains legacy APIs absent from Redact; this is not a one-directional compatibility ranking |
| Redact transition retention, actions, Activity, Fragment refs | [Pinned compatibility](https://github.com/TanStack/redact/blob/6a6bea7cf2a39ea9609b0c13667c9890e0594e57/docs/compatibility.md); local focused tests below | Concrete additional behavior, with synchronous scheduling limits |
| Preact events | [v11 differences](https://preactjs.com/guide/v11/differences-to-react/); package compat render implementation | Compat already normalizes common event names; native events remain; no blanket synthetic-event advantage claimed for Redact |
| SSR | [v11 SSR](https://preactjs.com/guide/v11/server-side-rendering/); package `compat/server.mjs` | Preact has string, async string, readable and pipeable stream rendering through its separate server renderer |
| Hydration | [v11 upgrade guide](https://preactjs.com/guide/v11/upgrade-guide/) | Preact 11 includes Hydration 2.0; old v10 limitations are not current evidence |
| Debugging | [Preact debugging](https://preactjs.com/guide/v11/debugging/), [Redact DevTools implementation](https://github.com/TanStack/redact/blob/6a6bea7cf2a39ea9609b0c13667c9890e0594e57/docs/devtools-implementation-status.md) | Both have component debugging; Redact integrates official React DevTools in development, with protocol and production limitations |
| Signals | [Preact Signals](https://preactjs.com/guide/v11/signals/) | Separate native integration and direct DOM updates are a Preact ecosystem distinction |
| Compiler | Preact package exports; Redact compiler-runtime entry and tests | Redact has a memo-cache entry; Preact package lacks `compiler-runtime`; neither fact proves every compiled app works |

## Bundle size

[Raw JSON](./results/preact-comparison-sizes.json) records minified, gzip, and Brotli bytes, tool versions, and the Redact revision. Each fixture uses `export *` from the listed entries, matching the repository's existing retained-export size method. Entries are bundled together, not added. This is not API-equivalent work or an app benchmark. Preact is bundled from published ESM; Redact is bundled from pinned TypeScript source. Compression and target settings match.

Reproduce from the Redact repository, with Node 24 and its installed esbuild dependency:

```sh
mkdir -p /tmp/redact-preact-comparison
npm pack preact@11.0.2 --pack-destination /tmp/redact-preact-comparison
mkdir -p /tmp/redact-preact-comparison/preact
tar -xzf /tmp/redact-preact-comparison/preact-11.0.2.tgz -C /tmp/redact-preact-comparison/preact
mkdir -p /tmp/redact-preact-comparison/redact
git archive 6a6bea7cf2a39ea9609b0c13667c9890e0594e57 packages/redact | tar -x -C /tmp/redact-preact-comparison/redact
REDACT_REVISION=6a6bea7cf2a39ea9609b0c13667c9890e0594e57 \
SIZE_PACKAGE_ROOT=/tmp/redact-preact-comparison/redact/packages/redact \
node scripts/compare-preact-size.mjs /tmp/redact-preact-comparison/preact/package
node scripts/probe-preact-compat.mjs /tmp/redact-preact-comparison/preact/package
```

The source size harness is [compare-preact-size.mjs](../scripts/compare-preact-size.mjs), using [measure-size.mjs](../scripts/measure-size.mjs) for Redact. Feature selection follows that harness's default Vite fixture. The `nano` row is retained in raw results for inspection but excluded from the public comparison table because it is a standalone DOM entry with removed behavior.

## Validation performed

- Preact executable probes passed against the distributed 11.0.2 module, bundled to resolve the unpacked package's self-imports. They verify callback order, fixed pending state, deferred identity, insertion/layout identity, absent action/visibility exports, and present shared hook exports. These are implementation probes, not a mounted cross-renderer app test.
- Local Redact command: `pnpm --filter tests test transition-retention actions activity fragment-refs compiler-runtime event-parity synthetic-event-shape`. **100 tests passed in 11 files.** This validates the existing working tree, not a rerun of main's whole test suite. Current-main claims were separately checked against its pinned source and compatibility documentation.
- Current-main DevTools evidence reports 17 shared scenarios plus six integration tests. Those results belong to the upstream implementation record; they were not rerun here.

- Homepage preview checked in Chromium at 1440 × 1000 and 390 × 844. The comparison heading, paragraph, and link render without horizontal overflow. The link resolves to `/redact/latest/docs/preact`; the docs must ship with the homepage change. Screenshots were inspected and no redundant copy was added to the section.
- Navigation JSON, relative documentation links, script syntax, and changed-file whitespace checks passed.

## Claims intentionally excluded

- Redact is smaller or faster than Preact.
- Preact has no Suspense, streaming, hydration, modern hooks, or React import aliases.
- Redact is completely React-compatible or implements React's concurrent scheduler.
- React DevTools is missing from current Redact.
- Preact cannot work with a particular framework merely because we did not run its matrix.
- An npm package's unpacked size, Preact's headline core size, and an all-exports Redact bundle are interchangeable measurements.

Before updating the page, resolve the new package versions, rerun the probes and sizes, check newly added compat exports, and review changes to both projects' hydration, actions, scheduling, compiler, and DevTools support.
