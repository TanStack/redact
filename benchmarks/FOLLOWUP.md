# Compatibility and performance follow-up

This records the first follow-up snapshot. The [next pass](./HYDRATION_UNMOUNT.md) fixes the input-hydration gap described below and removes an unwanted render during unmount. Its measurements use a new frozen baseline; the results here remain unchanged.

September 9, 2026. The four confirmed context/Suspense and number-input failures are fixed. Three optional optimizations are retained: a direct initial-mount path, fewer hydration attribute probes, and cheaper server escaping. The public API and synchronous scheduling contract are unchanged.

## Measured changes

Compared with the source before this follow-up, using production bundles on an Apple M5 Pro, Chrome 152 and Node 24.15. Each experiment has five independent blocks and five timed rounds per block. Negative changes mean less time.

| Workload | Time change | 95% interval |
|---|---:|---:|
| Hydration | -26.2% | -31.9% to -21.4% |
| Subtree mount/unmount | -6.5% | -6.9% to -5.7% |
| Escape-heavy Node SSR | -20.3% | -20.7% to -19.0% |
| Batched state setters | +5.3% | +2.9% to +10.5% |
| Keyed reversal | +3.4% | +0.1% to +4.5% |

The separate correctness-only comparison isolates the optional optimizations. They reduce mount/unmount time by 8.4% and hydration time by 24.2%, with no clear change in the three tested setter workloads. This supports keeping those optimizations; it does not erase the total update regressions above.

Against React 19.3, context propagation through memo takes 33.8% less time in the new fixture, while checking consumer render counts and skipped wrapper renders. The old runtime cannot participate because it fails that behavior. Redact also remains faster in several state-update fixtures, but mount/unmount still takes 59.3% more time than React in the main run. Hydration is much closer, not demonstrated faster than React. Trusted-click observations show no overall latency improvement.

These are workload results, not whole-app claims. The identical-React control's median absolute difference is 0.4% in the main browser run and 1.2% in Node. Intervals are exploratory and not adjusted for multiple comparisons. This follow-up does not rerun the real sites, mobile hardware, CPU slowdown or memory measurements. [All measurements and raw samples](./PARITY_RESULTS.md).

## Bundle cost

Standalone minified production entrypoints, gzip bytes. These are not whole-app bundle sizes.

| Source | DOM client | Server |
|---|---:|---:|
| Before follow-up | 10,704 | 5,406 |
| Correctness fixes only | 11,240 | 5,406 |
| Fixes and optimizations | 11,287 | 5,442 |

The client increase is 583 bytes: 536 for correctness and 47 for the optional speedups. Server escaping adds 36 bytes. Size budgets were deliberately raised to cover the compatibility repairs, not kept at their old values and reported as unchanged.

Actual Vite builds also verify feature removal. Context peer imports now honor the context option, and the forward-ref/class directory mapping honors `forwardRef` and `classComponents` in full and nano builds.

## Verification and remaining gaps

- 1,000 tests across 54 files pass. Types, production build and size checks pass.
- The same 19 upstream/context cases pass on Redact and pinned React 19.3.
- The same 23 input cases pass on both runtimes in jsdom and real Chrome.
- Three benchmark statistics tests pass. Both comparison snapshots can be reconstructed from the pinned published package.
- An independent audit verified all four complete datasets, 2,575 throughput samples, 480 interaction samples and matching source/fixture/runner hashes. The three browser experiments use the same current bundle hash.

One important hydration gap remains: editing an input before hydration can cause Redact to replace it and lose the edit. Its separate reproducer intentionally fails on Redact and passes on React. New React APIs such as Fragment refs, ViewTransition and `browser()` are audited, not implemented. Other server cancellation and browser-security cases still need work. [Compatibility audit](../docs/REACT_19_3_AUDIT.md).

Nothing is committed or published by this follow-up.
