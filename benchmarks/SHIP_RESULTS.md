# Redact ship review

This pre-release review recommended the default Vite configuration for the documented synchronous contract. It keeps the expanded React 19.3 API surface without concurrent scheduling. Native ViewTransition animation remains experimental and opt-in. The measurements below are the frozen evidence for the 0.1.0 release.

The full release gate passes: `pnpm test:ci`, 1,564 unit/integration tests, type checking, the built-package verifier, and source/dist size budgets. The 91 ordinary-suite skips are not passes. The separate [Chrome gate](./SHIP_CHROME_FINAL.md) passes 1,266 case executions across Redact and pinned React, with seven documented exclusions and no new exclusions. Counts include overlapping suites and motion-mode repeats.

## Fixes that changed the release decision

- State updates that leave a batch unchanged no longer cause another commit. This fixes the real TanStack.com hydration loop caused by callback refs writing `null` and then the same DOM node. Thirteen shared cases cover refs, layout updates, throwing updaters, mixed hooks, and Suspense replay. [Regression evidence](./STATE_REF_BAILOUT.md).
- Hook effects are staged only when needed. Failed attempts restore dependencies, and unchanged-state bailouts do not publish discarded effects. Suspense checkpoints journal queue changes instead of copying accumulated prefixes; hook snapshots use one flat array per fiber.
- Repeated Suspense failures no longer repeat the first-hide lifecycle/DOM walk. Unchanged retained fallbacks can avoid redundant work while preserving hidden queued updates and changed context. An inner Suspense boundary now captures correctly inside hidden Activity.
- Activity reconnects resource refs and wrapped-class lifecycles correctly. Styles use the correct document or ShadowRoot, including portals, while scripts retain document ownership. Shared browser tests check actual CSS isolation and loading.
- Library builds preserve the consumer's development/production choice. Emitted imports and declarations use explicit ESM paths. Native Node import order, shared dispatcher state, NodeNext types, and four actual Vite feature combinations pass. The build reproduces 249 files byte-for-byte in a temporary package. Optional `createElement` and `cloneElement` props also work in declarations.

## Size

Standalone production ESM entrypoints, gzip bytes. Historical columns are source builds. The built-package column is measured separately, not substituted into historical comparisons. [All configurations and hashes](./results/ship-sizes.json).

| Configuration | Before expansion, source | Expanded, source | Final, source | Final built package |
|---|---:|---:|---:|---:|
| Default Vite DOM client | 17,382 | 19,637 | 19,879 | 20,134 |
| Full DOM client, native animation included | 21,087 | 24,459 | 24,684 | 24,981 |
| Nano DOM client | 9,926 | 11,974 | 12,236 | 12,466 |
| React API entry | 2,768 | 2,768 | 2,768 | 2,764 |
| Server entry | 6,410 | 9,031 | 8,961 | 8,964 |

Stabilization adds 242 bytes to the comparable default source configuration and 225 to the full source client. It does not erase the expansion's size cost. The new budgets deliberately accept that API/lifecycle cost, with 25 bytes above the larger source/dist measurement for each of 19 configurations. Missing budgets fail the gate.

Retaining all exports from the React, JSX, DOM, and DOM-client entries gives 23,310 gzip bytes for Redact's default feature selection, versus 69,162 for pinned React 19.3.0. With native animation included, Redact is 28,158 bytes. This is a controlled full-export bundle, not a whole application, and the runtimes have the documented scheduling differences. Real applications tree-shake differently.

## Performance

Five independent Chrome blocks and five rounds compare identical fixtures, with an identical-React control. Tests, builds, profiles, and other benchmarks were stopped during timing. The ordinary run includes 16 workloads, trusted clicks, and retained-memory cycles; a separate run covers three reducer/Suspense workloads. [Complete measurements and intervals](./SHIP_MEASUREMENTS.md), [independent audit](./SHIP_AUDIT.md).

Full source compared with the earlier expansion, negative means less time:

| Workload | Time change | 95% block interval |
|---|---:|---:|
| Deep-tree updates | -25.7% | -27.1% to -24.9% |
| Batched setters | -16.7% | -17.8% to -15.6% |
| Sparse setters | -16.8% | -17.3% to -15.8% |
| Null-heavy trees | -15.4% | -15.8% to -14.8% |
| Context through memo | -13.8% | -16.0% to -12.7% |
| Passive effects | -12.9% | -13.1% to -12.7% |
| Suspense retry cycles | -8.3% | -8.9% to -7.5% |

Most large expansion regressions are recovered, not eliminated. Against the source before expansion, deep updates still take 5.6% more time, batched setters 6.8%, sparse setters 6.6%, passive effects 7.9%, and hydration 5.3%. The new correctness behavior remains in those comparisons.

The built default feature selection compared with React shows both strengths and weaknesses:

| Workload | Time change vs React | 95% block interval |
|---|---:|---:|
| Sparse setters | -71.9% | -72.3% to -71.1% |
| Mixed-depth setters | -59.1% | -62.0% to -54.9% |
| Keyed reversal | -30.3% | -30.7% to -30.1% |
| Deep-tree updates | -22.4% | -23.0% to -6.4% |
| Mount/unmount | +7.5% | +6.4% to +8.5% |
| Hydration | +21.4% | +19.7% to +25.1% |
| Passive effects | +27.0% | +24.7% to +28.3% |
| Reducer batches | +7.9% | +5.4% to +9.2% |
| Reducer updates under Suspense | +49.6% | +43.9% to +68.0% |
| Suspense retry cycles | +124.8% | +121.9% to +135.1% |

Suspense retry time is still about 2.25 times React's paired time. Earlier profiles identified rollback snapshots and repeated failed attempts; those paths remain in this implementation. The earlier eager reducer is not a valid faster baseline for that workload because it fails the retry contract. No concurrent scheduler or larger alternate-tree architecture was added.

The default-package benchmark uses a frozen package built with the native feature's default stub, not a complete Vite application. Actual Vite selection is checked separately in the package and site gates. The identical-React control's median absolute difference is 0.5% in both Chrome runs. Its ordinary mixed-update interval reaches +10%, so small effects should not be generalized. Intervals are exploratory and not corrected for multiple comparisons.

At 2,400 rows, default Redact's median handler-to-commit time is 1.2 ms versus React's 1.5 ms. Observed click durations are 16 ms at Chrome's reporting granularity, with one absent event entry rather than a fabricated zero. Mounted retained JS heap is 762.5 KiB versus React's 666.4 KiB. Final unmounts leave no extra DOM nodes. These are not field INP or allocation-rate measurements.

The separate Node comparison uses source bundles and five process blocks. Fully-ready readable streams take 49.4% less time than React, hooks/context string rendering 30.5% less, and clean strings 6.9% less. Escaped strings are not a clear win, their interval crosses zero. Package startup, streaming waterfalls, request latency, and server capacity are not measured.

## Site gate and limits

The [final built-package site gate](./SHIP_SITE_INTEGRATION.md) passes TanStack.com's production build, five Worker SSR routes, and browser interactions with no page or console errors. Tanner's eight SSR routes and runtime interactions pass with no browser errors. Its prerender-adapter failure and 454px header in a 390px viewport also occur with published Redact and React. Those app issues remain unresolved; original app files were not changed.

Native animation stays opt-in because this is not exhaustive animation parity. Hidden-tab behavior, native production animation, Safari/Firefox, physical mobile hardware, broader navigation/resource races, and the full Fizz prerender/resume surface are not established by this pass. The known pinned-React Activity hydration case remains an explicit comparison gap. Concurrent scheduling, action/optimistic downgrades, and upstream RSC ownership are unchanged.

## Reproduce

Run `pnpm test:ci`, then use the commands in the Chrome and site ledgers for their separate gates. `node scripts/record-ship-sizes.mjs` regenerates the size record. Do not run timing experiments alongside these checks.

The measured source snapshots are [final](./ship-final.patch), [default native stub](./ship-default.patch), [expanded](./parity-expansion.patch), and [before expansion](./commit-error-parity.patch). Reconstruct with `BASELINE_PATCH=path node scripts/prepare-perf-baseline.mjs`. Build a reconstructed package with `BUILD_PACKAGE_ROOT=its-parent-directory node scripts/build.mjs`; retain its package metadata and directory layout.

Use `CURRENT_SOURCE` for final source, `EXTRA_SOURCE`/`EXTRA_NAME=before-expansion` for the earlier baseline, and `CANDIDATE_SOURCES` for `expanded` and `default-package` (the latter points to reconstructed `dist`). The exact workload names, block counts, fixture/runner hashes, and every input hash are in the raw results. [Runner options](./README.md).
