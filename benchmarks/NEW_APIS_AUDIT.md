# New API measurement audit

Audited September 10, 2026. [Full run](./results/new-apis-cpu1.json), SHA-256 `2b6c63b07dbe78553409bb10262585a6fe52513b736e8842b9210ab0a6df6573`.

The 16-workload run passed independent verification across four renderers, five browser blocks and five timed rounds per workload.

| Recorded work | Verified count |
|---|---:|
| Throughput samples | 1,600 |
| Throughput correctness checks | 130,100 |
| Completed workload operations | 129,016,800 |
| Interaction samples / checks | 480 / 960 |
| Observed click entries | 480 |
| Memory cycles | 60 |

Every recorded source input, fixture, runner, statistics module and reference lock hash matched. All four fixture bundles rebuilt to their recorded bytes and compressed sizes. React and its control were byte-identical. Sample counts, iteration counts, completed work and check counts matched across renderers. Independently recalculated medians, p95s, paired comparisons, block-bootstrap intervals, interaction summaries and memory deltas matched.

Both source baselines reconstructed exactly from the pinned published package:

| Snapshot | Source files | Source manifest SHA-256 |
|---|---:|---|
| Before new APIs | 61 | `34ffdb265e00e4a2b2071ee09788175ce3522b733b49d936980a24ba83e18f3e` |
| API-complete, before queue guard | 70 | `ffe220ead5080bfaa99b896ee6782b800069134849981a3a164be54b24b12313` |

The corresponding patches are [pre-new-apis.patch](./pre-new-apis.patch) and [new-apis-before-guard.patch](./new-apis-before-guard.patch). Package metadata also matches. The API-complete snapshot has different package.json whitespace and ordinary field ordering, but identical parsed values and resolution-sensitive export/import ordering.

The full run's `current` means the API-complete snapshot before the queue guard. After working-tree changes, the audit reads its frozen source through `SOURCE_OVERRIDES`. Original module identities, recorded input paths, expected hashes and bundle-byte checks remain unchanged.

```sh
SOURCE_OVERRIDES='{"current":"/tmp/redact-api-complete-before-guard/src"}' \
BASELINE_PATCHES='{"before-new-apis":"benchmarks/pre-new-apis.patch","current":"benchmarks/new-apis-before-guard.patch"}' \
node scripts/audit-runtime-results.mjs benchmarks/results/new-apis-cpu1.json --rebuild
```

The [audit script](../scripts/audit-runtime-results.mjs) does not import the runner's statistics implementation. This verifies the recorded measurements and calculations, not cross-device repeatability, whole-app performance or full React compatibility.

## Queue guard follow-up

The [focused run](./results/new-apis-queue-guard-cpu1.json) also passed the same hash, bundle, reconstruction and independent statistics checks. SHA-256: `63c49edab8aabc862e9d8660feee78e3dd9b71b5c8f1f9210f7622cc6e6dd8ac`.

Five renderers, eight workloads, five browser blocks and five rounds produced 1,000 throughput samples, 302,000 correctness checks and 75,142,500 completed operations. This run did not measure interactions or memory.

The only runtime source difference from `api-before-guard` is commit queue bookkeeping in `dom/reconcile.ts`. Independent standalone builds measured full client growth from 15,213 to 15,269 gzip bytes, **56 bytes**. Raw size grew from 42,728 to 42,822 bytes. Server output stayed at 16,483 raw and 6,410 gzip bytes. These standalone sizes are separate from the larger fixture bundles in the measurement JSON.

```sh
BASELINE_PATCHES='{"before-new-apis":"benchmarks/pre-new-apis.patch","api-before-guard":"benchmarks/new-apis-before-guard.patch"}' \
node scripts/audit-runtime-results.mjs benchmarks/results/new-apis-queue-guard-cpu1.json --rebuild
```
