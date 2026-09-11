# Commit split measurement audit

The completed [runtime result](./results/commit-split-final-cpu1.json) passed `scripts/audit-runtime-results.mjs --rebuild`. The audit has its own statistics implementation, separate from the runner's `benchmarks/stats.mjs`.

Verified: 15 workloads, five independent browser blocks, five rounds, 1,875 throughput samples, 234,750 correctness checks, 134,955,250 completed operations, 600 interaction samples with 600 observed click entries, and 75 retained-memory cycles. Both React variants have identical bundle bytes. Every recorded source input, fixture, runner, statistics module and reference lock hash matches. Rebuilt bundles match their recorded hashes and sizes.

The three baseline patches reconstruct identical source trees. Their parent package metadata matches structurally, including conditional-export ordering, but its JSON formatting and ordinary field order differ from the published package. This does not change the rebuilt bundle bytes.

| Artifact | SHA-256 |
|---|---|
| Completed result | `f7a777bd766bb4696439213e1419b0e890661b2cdbde9a8a503db6ec9e219a33` |
| Pre-animation patch | `1fbd5cdd1a31f6e137cea6ba9e56d54cd3d2fac17dc8ad5a8ce5db14f8b353d8` |
| Commit split patch | `185661dbc5621321aaffc17771363b057e7c9066663c36927bd89d26a6076e93` |
| Native-stripped patch | `7d7787287341f75bd416ec258892805045c13ab65cf7dde8fc62ccadb0a5fa68` |

Reproduce while the recorded source directories are available:

```sh
BASELINE_PATCHES='{"pre-animation":"benchmarks/pre-view-transitions.patch","current":"benchmarks/commit-split.patch","native-stripped":"benchmarks/commit-split-native-stripped.patch"}' \
  node scripts/audit-runtime-results.mjs benchmarks/results/commit-split-final-cpu1.json --rebuild
```

If the temporary source directories are gone, reconstruct them with the commands in the [benchmark guide](./README.md#native-transitions-and-the-commit-split), then pass their source paths through `SOURCE_OVERRIDES` using the same three variant names. Do not run rebuilding or audits alongside timing measurements.

The audit verifies measurement integrity, not cross-device repeatability, complete React parity, site performance or animation smoothness. The identical-React control's median absolute difference is 0.4%; its largest pooled difference is 1.3%. The sparse-setter control interval extends to -5.1%, so small differences still need repeat confirmation.
