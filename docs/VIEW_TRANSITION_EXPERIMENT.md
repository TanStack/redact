# Native ViewTransition experiment

The [ship review](../benchmarks/SHIP_RESULTS.md) supersedes the historical size budgets and release verdict below. Native animation remains opt-in, with the same browser-coordinated commit timing and documented limits.

This records the first verified commit-split implementation. The [optimization follow-up](../benchmarks/COMMIT_OPTIMIZATIONS.md) contains the newer source, timing fixes, tests and size measurements. The results below remain historical evidence for the first split.

The [final verification](../benchmarks/COMMIT_ERROR_PARITY.md) also fixes native rejection reporting and reentrant fallback commits, with fresh tests and size measurements.

Native animation now uses a synchronous render/commit split. It is opt-in through `redact({ features: { viewTransitions: true } })`; both Vite presets leave it off. Direct full DOM entrypoints include it. The shared commit split also affects builds with native transitions disabled, so the flag does not remove the entire size or runtime cost. Existing size budgets have not been raised.

Rendering produces a prepared commit without a separate dry render. Ordinary updates apply that commit synchronously. Animated updates prepare the next tree and run class snapshots before the browser captures the old DOM, then apply the prepared mutations inside the native update callback. There is no concurrent scheduler, interruptible rendering, time slicing or background tree. Suspense retries and render-phase updates can still require another render.

`startTransition` callbacks still run immediately and `useTransition` still reports `false` for pending. Animation does change when the DOM commits: native capture requires waiting for the browser callback. `flushSync` before native readiness consumes the prepared work exactly once and skips animation. After readiness, urgent updates leave the existing animation running, matching the pinned React cases. Unsupported browsers keep synchronous commits.

The implementation covers enter, exit, update and shared-element transitions; type-selected CSS; animation handles and callback cleanup; multiple hosts, nested ownership and same-document portals; queued transitions and multiple roots. Suspense reveals start a fresh animation scope instead of inheriting an earlier transition's types. `useDeferredValue` remains an identity downgrade, not an independent animation trigger.

Class `getSnapshotBeforeUpdate` observes the old DOM and receives committed previous props/state as arguments. Insertion effects follow DOM mutation. Animation refs/layout work waits for newly discovered font loading, bounded at 500 ms, and passive effects wait for completion unless another update requires them earlier. Removed host trees remain intact for cleanup and retained external references, only their outer host is physically removed.

## Evidence

Chrome's real `document.startViewTransition` and generated pseudo-element animations are tested, not mocked snapshots:

The original outgoing `share="none"` and old-only shared-class failures are fixed through pre-mutation classification, not hidden replacement captures. The shared cases also cover class snapshot timing, old keyed order during render, controlled properties, insertion/ref/layout ordering, error rollback, pre-ready cancellation, queued updates, unmount during capture, post-ready updates, exit passive cleanup and reduced-motion CSS.

React's outgoing-only `onShare` callback differs from its current documentation. The shared test follows the pinned runtime, not the prose.

The ordinary suite passes 1,259 tests across 76 files, with 36 browser-only cases skipped. Those skips are not parity passes. Types and the 75-entry production build pass. Five new cases pass both Redact and pinned React for queued updates in removed subtrees, rollback of planned deletion, and memo/lazy class state restoration after suspension.

Final Chrome runs pass 42/42 native/phase/scheduling cases on Redact and 39/39 shared cases on pinned React 19.3, both with normal motion and reduced motion. Fragment refs pass 23/23 on each renderer in Chrome.

Reproduce from the repository root:

```sh
pnpm exec vitest run --config scripts/view-transition-browser.config.mjs
REACT_REFERENCE=1 pnpm exec vitest run --config scripts/view-transition-browser.config.mjs
REDUCED_MOTION=1 pnpm exec vitest run --config scripts/view-transition-browser.config.mjs
REDUCED_MOTION=1 REACT_REFERENCE=1 pnpm exec vitest run --config scripts/view-transition-browser.config.mjs
pnpm exec vitest run --config scripts/fragment-refs-browser.config.mjs
pnpm exec vitest run --config scripts/pending-deletion.config.mjs
REACT_REFERENCE=1 pnpm exec vitest run --config scripts/pending-deletion.config.mjs
pnpm test
pnpm test:types
pnpm build
pnpm size:check
```

Do not run performance measurements alongside these checks.

## Size

Standalone gzip bytes, not application totals:

| Entry | Before native animation | Commit split and native animation | Change |
|---|---:|---:|---:|
| Full DOM client | 15,269 | 21,157 | +5,888 |
| DOM client with native transitions stripped | 15,269 | 17,582 | +2,313 |
| Nano DOM client | 8,396 | 10,058 | +1,662 |
| React API | 2,733 | 2,768 | +35 |

The full DOM client grows 38.6%; the native-stripped client still grows 15.1%. These increases include shared commit and lifecycle correctness work, not just animation. Native transitions can remove 3,575 bytes when stripped from this implementation. The size check fails, and no budgets were raised to accept the increase.

## Runtime measurements

Five fresh Chrome blocks, five timed rounds per block, 15 completed-work workloads on Apple M5 Pro. Production bundles include an identical React control, whose median absolute difference across workloads was 0.4%. Positive values below mean more time:

| Workload | Versus pre-animation Redact, 95% interval | Versus React |
|---|---:|---:|
| Mount/unmount | -13.6% [-15.0%, -12.7%] | +15.7% |
| Stable keyed rows | +7.8% [+6.3%, +9.4%] | +4.1% |
| Automatic-JSX keyed rows | +7.7% [+6.5%, +11.3%] | -2.0% |
| Deep-tree props | +5.1% [+4.1%, +12.1%] | -27.6% |
| Batched setters | +8.1% [+7.3%, +9.0%] | -20.5% |
| Sparse setters | +14.7% [+12.2%, +17.5%] | -70.3% |
| Hydration | +8.6% [+6.6%, +9.7%] | +21.8% |
| Controlled selects | +1.1% [-1.6%, +2.8%] | -6.6% |

Most of this overhead remains when native animation is stripped. That points to the shared commit split, not just carrying the optional animation coordinator. Mount/unmount benefits from removing only the outer host while preserving its descendant DOM. These workloads do not isolate every individual change, and the intervals are exploratory, not adjusted for multiple comparisons.

Both click scenarios have 16 ms median and p95 observed event durations across renderers at Chrome's reporting granularity. On the 2,400-row scenario, median handler-to-commit time is 1.1 ms for both Redact variants and the pre-animation baseline, versus 1.4 ms for React. This does not establish equal field responsiveness. The full client retains 758.1 KiB above the loaded-fixture baseline while mounted, versus 748.5 KiB before animation work. Every renderer leaves zero additional DOM nodes after the final unmount; retained JS residuals are not a leak diagnosis.

The independent audit recomputed all statistics, verified 1,875 timing samples and 600 click observations, reconstructed all three Redact snapshots, and rebuilt every measured bundle byte-for-byte. [Full results](../benchmarks/COMMIT_SPLIT_RESULTS.md), [audit and hashes](../benchmarks/COMMIT_SPLIT_AUDIT.md), [reproduction](../benchmarks/README.md#native-transitions-and-the-commit-split).

The early screening result measures an older implementation. The interrupted five-block run is marked incomplete and is not final evidence.

## Limits

Passing the differential cases does not establish complete React compatibility. Image loading/decoding waits are not implemented; full font/navigation resource timing and streamed or hydrated Suspense reveal combinations are not verified. Cross-document portals are excluded from a document's capture. Native rejection, hidden-document and duplicate-name paths need more coverage. The Fragment implementation has an older detached-Suspense-fallback traversal gap that this work does not claim to resolve.

The browser tests check real running animations, then usually skip to completion to keep the suite bounded. They do not measure visual smoothness, long natural-completion sequences or animation behavior on tanstack.com and tannerlinsley.com. They verify final restoration of author styles, not identical restoration timing at every intermediate promise boundary.

The animation architecture works without concurrent rendering, but the size growth and update overhead do not justify adopting this as the size-focused default yet. Native animation remains opt-in; the shared core changes still need an explicit acceptance decision before release. The published implementation is unchanged.

Sources: [React ViewTransition](https://react.dev/reference/react/ViewTransition), [React transition types](https://react.dev/reference/react/addTransitionType), [native update callback](https://drafts.csswg.org/css-view-transitions-1/#call-the-update-callback), [captured transition classes](https://www.w3.org/TR/css-view-transitions-2/#capture-the-view-transition-class).
