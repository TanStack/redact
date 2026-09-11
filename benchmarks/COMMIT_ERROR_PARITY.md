# Commit and transition verification

Historical result. The later [parity expansion](./PARITY_EXPANSION.md) addresses the reducer, resource, CSP, and native image/font gaps recorded here. It has separate source snapshots and measurements, including new regressions.

The [commit optimizations](./COMMIT_OPTIMIZATIONS.md) remain in place. Native transition failures now follow the pinned React behavior in the tested cases. The zero-overhead target is not met: size budgets still fail, have not been raised, and nothing has been published.

Native animation remains opt-in through `redact({ features: { viewTransitions: true } })`. Both Vite presets leave it off, but the shared commit implementation still has a cost when animation is stripped. There is no concurrent scheduler or interruptible background tree. A native capture waits for the browser's update callback; an urgent `flushSync` consumes its prepared work immediately and skips an unready animation.

## Correctness

Recoverable native failures reach `onRecoverableError` with `{ componentStack: null }`. The implementation filters the four exact `InvalidStateError` messages filtered by pinned React. It silences its own canceled transaction, not all abort errors. A synchronous native-start failure falls back without reporting a native error.

Rejected capture consumes the prepared DOM and layout work exactly once, even if the recoverable handler throws, updates synchronously or unmounts the root. A late native update callback cannot repeat that work. Fallback layout effects can schedule another update. Existing recoverable call sites now also supply the required info argument; this does not claim complete component stacks or change caught/uncaught error routing elsewhere.

Fourteen new shared cases cover these paths. The earlier frozen source fails nine of the first eleven, while the corrected source and pinned React pass all fourteen. Chrome currently reports real duplicate names with the generic invalid-state message that React silences. That case verifies silent recovery and a later successful animation; separate controlled failures verify reporting of nonfiltered errors.

Verification on the final source:

- 1,294 ordinary tests pass, with 54 browser-only skips. Skips are not parity passes.
- Chrome: 60 Redact cases and 57 shared React cases pass, both with normal and reduced motion. These include real native animations and controlled failure-ordering cases.
- Type checks and the 75-entry production build pass.
- The earlier optimization also passed 25 shared Fragment cases and 18 shared assembly/reducer/error-boundary cases in Chrome. This follow-up does not change those implementations.

```sh
pnpm test
pnpm test:types
pnpm build
pnpm size:check
pnpm exec vitest run --config scripts/view-transition-browser.config.mjs
REACT_REFERENCE=1 pnpm exec vitest run --config scripts/view-transition-browser.config.mjs
REDUCED_MOTION=1 pnpm exec vitest run --config scripts/view-transition-browser.config.mjs
REDUCED_MOTION=1 REACT_REFERENCE=1 pnpm exec vitest run --config scripts/view-transition-browser.config.mjs
```

The size command is expected to fail. Do not run these checks during performance measurements.

## Size

Standalone gzip bytes, not application totals. The pre-animation source includes the preceding API work; it is not the published package.

| Entry | Pre-animation | First commit split | Optimized before rejection fixes | Final |
|---|---:|---:|---:|---:|
| Full DOM client | 15,269 | 21,157 | 20,850 | 21,087 |
| Native-stripped DOM client | 15,269 | 17,582 | 17,369 | 17,382 |
| Nano DOM client | 8,396 | 10,058 | 9,911 | 9,926 |
| React API | 2,733 | 2,768 | 2,768 | 2,768 |

The final full client saves 70 bytes against the first split but remains 5,818 bytes above pre-animation. Native-stripped saves 200 bytes against the first split and remains 2,113 bytes above pre-animation. Native animation accounts for 3,705 removable bytes in this build. The rejection fixes add 237 bytes to the full client and 13 bytes to native-stripped.

Four additional micro-optimizations were [measured and rejected](./COMMIT_TAIL_CANDIDATES.md), including the 17-byte smaller decoder with an unresolved event-heavy hydration tradeoff.

## Runtime

Five fresh Chrome blocks, five rounds, six frozen variants and 15 completed-work workloads on Apple M5 Pro. Positive values mean more time than pre-animation Redact. Intervals are exploratory 95% block-bootstrap intervals, not adjusted for multiple comparisons.

| Workload | Final vs pre-animation |
|---|---:|
| Stable keyed rows | +0.2% [-0.3%, +2.5%] |
| Automatic-JSX keyed rows | +1.0% [-0.3%, +3.3%] |
| Deep-tree props | +1.5% [-0.5%, +2.9%] |
| Batched setters | +3.2% [-1.7%, +5.3%] |
| Sparse setters | +5.7% [+4.5%, +7.5%] |
| Property updates | +2.4% [+1.9%, +4.6%] |
| Automatic-JSX property updates | +3.6% [+3.4%, +4.2%] |
| Passive effects | +3.2% [+2.4%, +3.8%] |
| Mount/unmount | -21.7% [-21.9%, -20.6%] |
| Hydration | -3.2% [-6.3%, -1.4%] |

The large mount/unmount improvement repeats. Keyed updates are close to baseline, but intervals spanning zero do not prove equivalence. The earlier run's near-zero batched-setter estimate did not repeat as a near-zero point estimate here; the final interval remains wide. Property updates, passive effects and sparse setters retain measured overhead. The identical-React control has a 0.4% median absolute difference, but some wider or nonzero intervals, detailed in the audit.

The rejection fix changes ordinary workload estimates by roughly -0.6% to +0.9% versus the preceding optimized source, apart from hydration. Hydration's -4.7% direct estimate has an interval [-7.3%, +1.1%], and earlier runs varied too. This does not establish that error handling made successful hydration faster.

Against React, the final source remains slower on mount/unmount (+6.7%), hydration (+9.9%), passive effects (+16.0%) and browser SSR (+4.6%). Other workloads are competitive or faster. There is no overall winner score.

The 2,400-row click scenario has a 1.0 ms median handler-to-commit time, matching pre-animation and the preceding optimized source, versus 1.3 ms for React. Across all 720 observed clicks, median and p95 duration are both 16 ms at Chrome's reporting granularity. This is not field INP. Median mounted JS heap increase over the loaded-fixture baseline is 765.4 KiB, versus 748.5 KiB pre-animation and 665.3 KiB for React. Every final unmount leaves zero additional DOM nodes; residual JS is not a leak diagnosis.

The audit verified 2,250 timing samples, 222,750 throughput checks and 197,540,100 completed operations, reconstructed four Redact snapshots and rebuilt all six bundles byte-for-byte. [Full results](./COMMIT_ERROR_PARITY_RESULTS.md), [raw samples](./results/commit-error-parity-cpu1.json), [audit and hashes](./COMMIT_ERROR_PARITY_AUDIT.md), [reproduction](./README.md#native-transitions-and-the-commit-split).

## Remaining gaps

This is not a claim of complete React parity. Image loading/decoding waits remain unimplemented. Native visibility-error filtering is tested, but real tab visibility changes are not. Broader font/navigation resource timing and streamed or hydrated Suspense combinations need more coverage. Redact's existing eager reducer evaluation remains different from React's action rebasing, as documented in the earlier optimization report.

These local fixtures do not establish field INP, site-level performance on tanstack.com or tannerlinsley.com, or animation smoothness across devices. The experiment is not ready to replace the stable size-focused default on the evidence so far.
