# Rejected commit micro-optimizations

All four candidates were rejected. None consistently closes the remaining overhead in the [verified optimization](./COMMIT_OPTIMIZATIONS.md). The working runtime retains its mutation tape, transition map and effect-array draining.

Five fresh Chrome blocks, five rounds, seven completed-work workloads, frozen Redact and identical React controls. Positive values mean more time than frozen Redact. These are paired changes with exploratory 95% block-bootstrap intervals, not adjusted for multiple comparisons.

| Workload | Two-kind mutation tape | Empty-map guard | Root transition field | Effect-array transfer |
|---|---:|---:|---:|---:|
| Stable keyed rows | +0.5% [+0.2, +0.5] | 0.0% [-0.6, +0.3] | 0.0% [-2.2, +1.2] | +0.8% [-1.0, +4.4] |
| Hydration | +0.2% [-1.3, +1.7] | +1.3% [-3.4, +2.6] | -2.0% [-4.3, -1.7] | -2.8% [-4.7, +0.9] |
| JSX property updates | +0.6% [-1.5, +1.5] | +0.6% [-0.3, +1.4] | -0.2% [-0.8, +1.0] | +0.4% [-0.3, +1.4] |
| Batched setters | +0.9% [+0.2, +3.6] | -0.5% [-1.0, +0.5] | -0.8% [-1.4, +2.1] | +0.2% [-1.4, +4.8] |
| Passive effects | +0.2% [-2.5, +1.2] | -0.2% [-1.0, +1.0] | +1.0% [-0.2, +2.4] | +0.6% [-1.3, +1.6] |
| Sparse setters | +0.3% [-0.2, +1.7] | -0.3% [-1.8, +1.3] | 0.0% [-1.6, +0.7] | +0.2% [-0.7, +1.0] |
| Property updates | -0.2% [-2.9, +1.9] | -0.5% [-1.3, +1.1] | -0.2% [-2.4, +1.3] | -0.4% [-1.1, +3.0] |
| Standalone client gzip change | -17 bytes | 0 bytes | +19 bytes | +3 bytes |

The root-field candidate's hydration result does not establish a broad win. It does not improve sparse setters and adds state and bytes. The other candidates mostly show small changes inside uncertainty intervals. An interval crossing zero is not proof of equivalence. The control's paired changes range from -1.2% to +2.0%, with the widest control interval on hydration, [-2.8%, +7.1%].

## Hydration allocation check

The two-kind tape replaces hydration property records with closures. A separate five-block, five-round fixture checks this tradeoff using identical 300-button server markup with either no handlers or four handlers per button.

Static hydration measured -4.3% [-7.4%, -0.6%], but event-heavy hydration measured +4.1% [-2.8%, +8.8%]. React-control differences were +2.1% [-0.7%, +6.0%] and +2.5% [-5.5%, +7.3%]. This is not evidence of a free size win.

All 200 timed batches completed: 21,900 hydrated roots, 6,679,500 checks and 13,920,000 validated callbacks. Every server host was adopted, every root rendered and ran its passive effect once, and unmount removed all owned DOM. No browser errors occurred. All four bundles rebuilt byte-for-byte, and source, fixture, runner, statistics and reference-lock hashes matched.

This fixture measures hydration through passive-effect delivery. SSR, setup, callback dispatch, validation and unmount are outside timing, but their allocations can affect later natural GC. It does not cover hydration event replay, mismatches, forms or streaming, and its React ratios are not a general performance score.

## Audit and reproduction

The seven-way run passed `audit-runtime-results.mjs --rebuild`: 1,225 timing samples, 140,525 checks, 111,734,875 completed operations, five reconstructed Redact snapshots and seven byte-identical bundles. It contains no interaction or retained-memory measurements.

| Result | SHA-256 |
|---|---|
| [Seven-way comparison](./results/commit-tail-candidates.json) | `92e31f717b9fec5a248253cddfa664079805724c2b4125cb00abd6280ab12ec4` |
| [Hydration allocation check](./results/hydration-events-two-kind.json) | `763f53ecc85998eb14c622d0247c4acce77b1c8ca79a44ced3242ff7677c75f0` |

The source patches are `commit-optimized.patch` for frozen Redact and `commit-tail-{two-kind,empty-marks,root-marks,effect-drain}.patch` for the rejected candidates. Reconstruct their `src` directories using `prepare-perf-baseline.mjs` as described in the [benchmark guide](./README.md#native-transitions-and-the-commit-split).

```sh
BLOCKS=5 ROUNDS=5 PHASES=throughput \
  WORKLOADS=sparse-setters,batched-setters,passive-effects,props-updates,jsx-props-updates,stable-keyed-rows,hydration \
  REACT_CONTROL=1 CURRENT_SOURCE=/tmp/redact-commit-optimized-final/src \
  CANDIDATE_SOURCES='{"two-kind":"/tmp/redact-commit-two-kind/src","empty-marks":"/tmp/redact-commit-empty-marks/src","root-marks":"/tmp/redact-commit-root-marks/src","effect-drain":"/tmp/redact-commit-effect-drain/src"}' \
  VARIANTS=react,react-control,current,two-kind,empty-marks,root-marks,effect-drain \
  OUTPUT=benchmarks/results/commit-tail-candidates.json node scripts/compare-runtime.mjs

BASELINE_PATCHES='{"current":"benchmarks/commit-optimized.patch","two-kind":"benchmarks/commit-tail-two-kind.patch","empty-marks":"benchmarks/commit-tail-empty-marks.patch","root-marks":"benchmarks/commit-tail-root-marks.patch","effect-drain":"benchmarks/commit-tail-effect-drain.patch"}' \
  node scripts/audit-runtime-results.mjs benchmarks/results/commit-tail-candidates.json --rebuild

BLOCKS=5 ROUNDS=5 OUTPUT=benchmarks/results/hydration-events-two-kind.json \
  node scripts/compare-hydration-events.mjs
```

Do not run correctness checks, builds or audits alongside timings.
