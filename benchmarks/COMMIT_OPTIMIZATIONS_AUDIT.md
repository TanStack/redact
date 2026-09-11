# Commit optimization measurement audit

The [completed result](./results/commit-optimized-final-cpu1.json) passed `scripts/audit-runtime-results.mjs --rebuild`. The audit independently recomputed the statistics, verified source and fixture hashes, reconstructed four Redact snapshots and rebuilt all six measured bundles byte-for-byte.

Verified: 15 workloads, five fresh-browser blocks, five rounds, 2,250 timing samples, 261,900 correctness checks, 171,791,250 completed operations, 720 clicks with 720 observed event entries, and 90 retained-memory cycles.

| Artifact | SHA-256 |
|---|---|
| Completed result | `aca8b54481737711e630434161780ee0713651628d2dd53aca09bd55824b8e38` |
| Optimized source patch | `dde5e0056fbfae0c0526334bb1103b9e53c129bcd6bc8927dacf4c966fa9016e` |
| Optimized native-stripped patch | `7653227c2197c7c3953031054500ca78070183f3396a3ae6185b82a93ff0b574` |

The optimized snapshots retain byte-identical reference package metadata. The older pre-animation and first-split snapshots retain semantically identical metadata, including conditional-export order; only formatting and ordinary field order differ.

```sh
BASELINE_PATCHES='{"pre-animation":"benchmarks/pre-view-transitions.patch","first-split":"benchmarks/commit-split.patch","current":"benchmarks/commit-optimized.patch","native-stripped":"benchmarks/commit-optimized-native-stripped.patch"}' \\
  node scripts/audit-runtime-results.mjs benchmarks/results/commit-optimized-final-cpu1.json --rebuild
```

If the temporary source directories are gone, reconstruct them using the [benchmark guide](./README.md#native-transitions-and-the-commit-split), then pass their paths through `SOURCE_OVERRIDES` using the same variant names. Do not run audits or rebuilding alongside timings.

The identical-React control's median absolute difference is 0.4%, and its largest pooled difference is 1.7%. Some control intervals are much wider: deep-tree props reaches +13.6%, mixed-depth setters +17.0%, and sparse setters +6.0%. This audit establishes measurement integrity, not cross-device repeatability, exact equivalence, whole-app responsiveness or complete React parity.
