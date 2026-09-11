# Final measurement audit

All three final result files pass. No input, rebuilt-bundle, completed-work count, output, or statistical mismatch was found. Raw measurements were unchanged, and this audit ran no new timing experiments.

| Recorded run | Workloads | Variants | Timed samples | Recorded checks |
|---|---:|---:|---:|---:|
| [Chrome ordinary](./results/ship-final-cpu1.audit.json) | 16 | 6 | 2,400 | 348,150 |
| [Chrome reducers](./results/ship-final-reducers-cpu1.audit.json) | 3 | 5 | 375 | 3,750 |
| [Node SSR](./results/ship-final-node-ssr.audit.json) | 4 | 5 | 500 | 136,500 |

Each run has five independent process/browser blocks and five measured rounds per block. Recorded checks are fixture counters, not a count of every underlying assertion.

## What was verified

- Every recorded input hash, fixture/runner/statistics/reference-lock hash, input-manifest hash, and production bundle hash. React and its control have identical bundles and inputs. Saved patches reconstruct all declared source baselines; the default package rebuilds to the same 249 dist files. Package metadata is semantically identical, including export/import condition order. Final/default package JSON has different top-level formatting/key order, not different values.
- Exact fixture-derived operations, checks, renders, commits and calibration counts. Reducer samples contain 120,972,000 row reducer actions, 42,048,000 committed-row DOM checks, 52,750 completed fallback reveals, 105,500 hidden-primary checks and 125 independently triggered suspensions. Order-sensitive final reducer values also match. [Detailed counters](./results/ship-final-counts.audit.json).
- All 720 trusted-click records completed their handler, layout and passive effects and validated 950,400 rows. There are 719 observed Event Timing click entries; the absent entry remains absent, not zero. All 90 memory cycles return DOM node, document and listener counts to their own baseline after unmount. This does not prove zero retained JS memory.
- All medians, p95s, ranges, paired log-time changes and 95% whole-block bootstrap intervals were independently recomputed without importing the measurement statistics helper. Calibration, warmup and untimed verification are excluded from reported samples.
- Node SSR uses the recorded Node production CJS build settings and 25 distinct child-process identities. Its five bundles rebuild byte-for-byte. The audit separately renders 55 distinct final/calibration/digit-width outputs without calling the timed workload loop. HTML hashes, independently constructed expectation hashes, parsed text/attributes/order, unique hook IDs, full stream EOF, character totals, chunk counts and hook/component counts match all 500 samples and 20 calibration records.

## Report spot-check

[SHIP_RESULTS.md](./SHIP_RESULTS.md) matches the underlying records: deep-tree, batched-setter and sparse-setter changes versus expansion are -25.65998%, -16.66667% and -16.75627%. Default-package Suspense retries are +124.80916% versus React. The stated gzip sizes are 20,134 bytes for the default DOM client, 23,310 for the default full-export client bundle, and 69,162 for React. All 83 source and 249 dist hashes in the size record match disk. This was a numeric/input spot-check of the size record, not a new size experiment.

These are finite synthetic measurements, not a compatibility or whole-app speed guarantee. The identical-React control has small nonzero intervals in two reducer workloads, and the ordinary mixed-depth control interval reaches +10.0%. Small differences need caution; intervals are not corrected for multiple comparisons. SSR escaping and generated IDs can serialize differently while passing the same semantic expectations.

## Reproduce the audit

Run only when performance measurements are stopped:

```sh
BASELINE_PATCHES='{"current":"benchmarks/ship-final.patch","expanded":"benchmarks/parity-expansion.patch","default-package":"benchmarks/ship-default.patch","before-expansion":"benchmarks/commit-error-parity.patch"}' node scripts/audit-runtime-results.mjs benchmarks/results/ship-final-cpu1.json --rebuild
BASELINE_PATCHES='{"current":"benchmarks/ship-final.patch","expanded":"benchmarks/parity-expansion.patch","default-package":"benchmarks/ship-default.patch"}' node scripts/audit-runtime-results.mjs benchmarks/results/ship-final-reducers-cpu1.json --rebuild
node benchmarks/audit-ship-final-details.mjs
```

The commands require the recorded inputs or matching frozen-path overrides for the browser audit. [The independent detail audit](./audit-ship-final-details.mjs) prints the exact counters, SSR rebuild/output checks, recomputed statistics and report spot-checks. Saved JSON artifacts include the raw-result hashes and audit source hash.
