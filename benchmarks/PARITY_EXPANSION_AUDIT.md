# Parity expansion measurement audit

The [ordinary workload result](./results/parity-expansion-cpu1.json) passed the independent statistics and in-memory bundle rebuild audit. Both Redact snapshots reconstructed from the pinned package with byte-identical package metadata, and every bundle matched its recorded hash.

Verified: 15 workloads, five fresh-browser blocks, five rounds, 1,500 timing samples, 140,400 throughput correctness checks, 95,810,500 completed operations, 480 trusted clicks with 480 observed entries, and 60 retained-memory cycles.

| Artifact | SHA-256 |
|---|---|
| Ordinary workload result | `c514c337ded7cc065c953efefaed4c52c1fddd7ba5c3a0d5f4772f51e4fd0dd1` |
| Reducer workload result | `4264e10f1e509e03b075d3b325e4e5061db5226f363f8695539cce584f770a6c` |
| Expanded source patch | `5484157173fc71e19e7d21713ab33337fab0610c049327c3e3d22515071a674b` |
| Expanded source tree | `3a6a684608a0a1c05bb7038200341beb3355374cf23a7bea3c9f701314d31ba8` |

```sh
BASELINE_PATCHES='{"before-expansion":"benchmarks/commit-error-parity.patch","current":"benchmarks/parity-expansion.patch"}' \
  node scripts/audit-runtime-results.mjs benchmarks/results/parity-expansion-cpu1.json --rebuild
BASELINE_PATCHES='{"current":"benchmarks/parity-expansion.patch"}' \
  node scripts/audit-runtime-results.mjs benchmarks/results/parity-expansion-reducers-cpu1.json --rebuild
```

If temporary sources are gone, reconstruct them with `scripts/prepare-perf-baseline.mjs` and supply the matching paths through `SOURCE_OVERRIDES`. Do not run audits or builds alongside timings.

The identical-React control has a 0.5% median absolute difference across workloads. Its largest point difference is -2.4% on deep-tree updates, with a wide interval from -13.5% to +13.0%. Small effects still need repeat confirmation. The audit establishes reproducibility of the recorded data and calculations, not whole-site performance or complete API parity.

The [focused reducer result](./results/parity-expansion-reducers-cpu1.json) also passes. It adds 225 timing samples, 2,250 reported correctness checks, and 57,722,400 dispatched actions across three workloads. All three bundles rebuilt byte-for-byte and the same expanded source reconstructed. Its identical-React control has a 0.5% median absolute difference, with the largest point difference +0.8% on retries and interval -0.6% to +1.2%. It contains no additional interaction or memory measurements.
