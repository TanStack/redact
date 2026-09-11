# Commit split optimization

This records the optimization before the final native rejection fixes. The [verification follow-up](./COMMIT_ERROR_PARITY.md) contains the latest source, correctness checks and size measurements. The timings below remain evidence for the frozen pre-rejection source.

This follows the [first native ViewTransition implementation](../docs/VIEW_TRANSITION_EXPERIMENT.md). It keeps synchronous scheduling and prepared commits. Native animation remains opt-in, the published package is unchanged, and size budgets have not been raised.

## Implementation

Ordinary commits reuse a cleared work plan without sharing an active plan with reentrant commits. Text changes use compact records. Changed host properties commit in one batch, preserving input type, event, value and radio-group ordering. Empty effect passes and established reducer hooks avoid allocating deferred-work closures.

New, detached host elements assemble their children before insertion. Existing hosts, user-owned detached roots and portal targets still wait for commit. A boundary checkpoint remembers the new parent's direct children so abandoned Suspense or error work cannot leak into its committed fallback.

The pass also removes unused native mutation tracking, duplicate class error handling, a separate committed-class-state map and repeated Fragment descendant collection. Fragment focus still uses committed order during snapshots, including retained Suspense fallback instances.

Two native timing gaps are fixed: navigation is captured before mutation, and temporary capture styles restore at passive flush, including an urgent early flush, rather than at `ready`.

Suspense now retries changed primary children while an earlier promise remains pending. This fixes a retained hidden dispatch leaving the fallback stuck. Eager reducer evaluation remains an existing Redact difference: React can rebase a queued action with a new reducer, while Redact has already evaluated that action synchronously. Separate tests document this difference instead of counting it as shared parity.

## Verification

- 1,291 ordinary tests pass. The 40 browser-only skips are not parity passes.
- Native Chrome: 46 Redact cases and 43 shared React cases pass, with both normal and reduced motion.
- Fragment refs: 25 shared Chrome cases pass on each renderer.
- Detached assembly, reducer identity and wrapped error boundaries: 18 shared Chrome cases pass on each renderer.
- Type checks and the 75-entry production build pass. Size checks still fail.

The detached-assembly optimization initially leaked abandoned children. Four new tests reproduced that failure in an earlier candidate; the corrected implementation and pinned React pass all nine assembly cases. The rejected lazy-queue experiment increased gzip size and was not adopted.

A [follow-up comparison](./COMMIT_TAIL_CANDIDATES.md) rejected four more micro-optimizations. None consistently recovered the remaining overhead, and the smaller mutation decoder left an unresolved event-heavy hydration tradeoff.

```sh
pnpm test
pnpm test:types
pnpm build
pnpm size:check
pnpm exec vitest run --config scripts/commit-optimizations-browser.config.mjs
REACT_REFERENCE=1 pnpm exec vitest run --config scripts/commit-optimizations-browser.config.mjs
pnpm exec vitest run --config scripts/fragment-refs-browser.config.mjs
REACT_REFERENCE=1 pnpm exec vitest run --config scripts/fragment-refs-browser.config.mjs
pnpm exec vitest run --config scripts/view-transition-browser.config.mjs
REACT_REFERENCE=1 pnpm exec vitest run --config scripts/view-transition-browser.config.mjs
REDUCED_MOTION=1 pnpm exec vitest run --config scripts/view-transition-browser.config.mjs
REDUCED_MOTION=1 REACT_REFERENCE=1 pnpm exec vitest run --config scripts/view-transition-browser.config.mjs
```

Do not run these checks alongside performance measurements.

## Size

Standalone gzip bytes, not application totals. The pre-animation source already includes the preceding API work; it is not the published package.

| Entry | Pre-animation | First commit split | Optimized |
|---|---:|---:|---:|
| Full DOM client | 15,269 | 21,157 | 20,850 |
| Native-stripped DOM client | 15,269 | 17,582 | 17,369 |
| Nano DOM client | 8,396 | 10,058 | 9,911 |
| React API | 2,733 | 2,768 | 2,768 |

The full client saves 307 bytes against the first split, but remains 5,581 bytes above pre-animation. Stripping native animation removes 3,481 bytes; the shared commit implementation still adds 2,100 bytes. This does not meet the zero-size-regression target.

## Runtime

Five fresh Chrome blocks, five rounds per block, six variants and 15 workloads on Apple M5 Pro. Both columns use the same pre-animation baseline within this run. Positive values mean more completed-work time.

| Workload | First split vs pre-animation | Optimized vs pre-animation, 95% interval |
|---|---:|---:|
| Stable keyed rows | +7.2% | -0.6% [-1.6%, +1.7%] |
| Automatic-JSX keyed rows | +8.7% | +0.1% [-1.8%, +1.0%] |
| Deep-tree props | +4.4% | +0.6% [-1.4%, +1.6%] |
| Batched setters | +8.2% | -0.1% [-1.5%, +2.8%] |
| Sparse setters | +17.2% | +5.9% [+4.7%, +6.2%] |
| Property updates | +6.1% | +2.4% [+2.0%, +3.6%] |
| Automatic-JSX property updates | +5.7% | +2.7% [+2.0%, +3.4%] |
| Passive effects | +9.9% | +3.6% [+2.4%, +5.1%] |
| Mount/unmount | -12.2% | -20.7% [-21.2%, -19.3%] |
| Hydration | +0.2% | -0.1% [-1.2%, +2.4%] |

Several intervals include zero, but that is not proof of exact equivalence. Sparse setters, property updates and passive effects retain measured overhead. The older run's hydration regression did not reproduce for the first-split control here, so this run does not establish that the optimization fixed hydration performance.

Against React, the optimized source remains slower on mount/unmount (+6.7%), hydration (+12.5%), passive effects (+13.2%) and browser SSR (+5.7%), while other workloads are competitive or faster. There is no overall winner score. The control median absolute difference is 0.4%, with wide intervals on some workloads; use the full results rather than treating small percentages as universal speedups.

The 2,400-row click scenario has a 1.0 ms median handler-to-commit time for the optimized source, matching pre-animation, versus 1.1 ms for React. All observed click durations have 16 ms median and p95 at Chrome's reporting granularity. This is not field INP. Median mounted JS heap increase over the loaded-fixture baseline is 762.3 KiB, versus 748.5 KiB pre-animation and 758.1 KiB for the first split. Every final unmount leaves zero additional DOM nodes; JS residuals are not a leak diagnosis.

[Full results](./COMMIT_OPTIMIZATIONS_RESULTS.md), [raw samples](./results/commit-optimized-final-cpu1.json), [independent audit](./COMMIT_OPTIMIZATIONS_AUDIT.md), [reproduction](./README.md#native-transitions-and-the-commit-split).

## Remaining scope

Passing these cases is not complete React parity. Image resource waits remain unimplemented. Native rejection reporting, hidden-document behavior, broader font/resource timing and streamed or hydrated Suspense combinations still need work. The detached-fallback Fragment focus cases are now covered, but that is not a proof of every retained-tree traversal.

The browser suite exercises real animations and includes natural-completion style restoration. It does not establish visual smoothness or site-level performance on tanstack.com or tannerlinsley.com. There is no concurrent scheduler or interruptible render tree in this implementation.
