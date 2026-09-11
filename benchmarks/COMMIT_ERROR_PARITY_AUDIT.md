# Final commit measurement audit

The [completed result](./results/commit-error-parity-cpu1.json) passed `scripts/audit-runtime-results.mjs --rebuild`. Statistics were independently recomputed, all source and tooling hashes matched, four Redact snapshots reconstructed, and all six measured bundles rebuilt byte-for-byte.

Verified: 15 workloads, five fresh-browser blocks, five rounds, 2,250 timing samples, 222,750 throughput correctness checks, 197,540,100 completed operations, 720 trusted clicks with 720 observed entries, and 90 retained-memory cycles.

| Artifact | SHA-256 |
|---|---|
| Completed result | `4c4c8b220b82fa252f2bfec465c16d1992da89a145a21cba201ddb0e9f5b16bb` |
| Final source patch | `291b859d4c005fb6f96c65e76bc22e3954aa612c750593fb19b2a4e1289bda64` |
| Final native-stripped patch | `a999cd8a9674977671305ae02293df3966b8b06157f30b7a6c921d954bb32636` |

Final, native-stripped and pre-rejection snapshots retain byte-identical reference package metadata. Pre-animation retains semantically identical metadata, including conditional-export order; formatting and ordinary field order differ.

```sh
BASELINE_PATCHES='{"pre-animation":"benchmarks/pre-view-transitions.patch","pre-rejection":"benchmarks/commit-optimized.patch","current":"benchmarks/commit-error-parity.patch","native-stripped":"benchmarks/commit-error-parity-native-stripped.patch"}' \
  node scripts/audit-runtime-results.mjs benchmarks/results/commit-error-parity-cpu1.json --rebuild
```

If temporary snapshots are gone, reconstruct them with the [benchmark guide](./README.md#native-transitions-and-the-commit-split) and pass their paths through `SOURCE_OVERRIDES` using the same variant names. Do not run audits or builds alongside timings.

The identical-React control has a 0.4% median absolute difference across workloads. Its largest paired difference is +2.9% on sparse setters, with interval [-5.0%, +5.0%]. Mixed-depth setters reach +8.3% at the upper interval bound. Even identical React has a +1.2% passive-effect estimate, with interval [+0.7%, +3.2%]. Small changes need repeat confirmation, not a claim of exact equivalence.

This audit establishes measurement integrity. It does not establish complete React parity, zero overhead, field responsiveness, cross-device repeatability or animation smoothness.
