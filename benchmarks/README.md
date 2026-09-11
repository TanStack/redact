# Runtime comparison

The [ship review](./SHIP_RESULTS.md) is the current result. Earlier reports retain their original snapshots and API surface.

These benchmarks compare pinned React 19.3.0, published Redact 0.0.20, and the working-tree Redact implementation. An optional reconstructed snapshot measures the code before the performance pass, after the preceding size cleanup.

## Run

```sh
npm ci --prefix benchmarks/reference --ignore-scripts
node scripts/compare-runtime.mjs
```

For the full comparison with an identical React control and the earlier source snapshot:

```sh
BASELINE=$(node scripts/prepare-perf-baseline.mjs)
REACT_CONTROL=1 EXTRA_SOURCE="$BASELINE" node scripts/compare-runtime.mjs
```

The reference dependencies have their own lockfile and do not change the main workspace dependencies. Chrome must be installed. Do not run builds, tests or other benchmarks concurrently. Keep the machine plugged in and otherwise idle. Run again on another machine/browser before generalizing the result.

`BLOCKS`, `ROUNDS`, `TARGET_MS`, `INTERACTIONS`, `CPU_RATE`, `INTERACTION_ROWS`, `WORKLOADS`, `PHASES` and `OUTPUT` select the measurement. `HEADED=1` uses a visible browser. Defaults are five fresh-browser blocks, five timed rounds per workload, 80 ms calibration target, twelve clicks per scenario per block, and no CPU slowdown. `WORKLOADS` is a comma-separated list of exact names. Phases are `throughput`, `interaction`, and `memory`.

`EXTRA_NAME` labels an `EXTRA_SOURCE` snapshot, defaulting to `pre-performance`. `VARIANTS` optionally selects browser renderers by name and must include `react,current`. The opt-in `context-through-memo` workload requires context propagation that published Redact lacks, so run it with `VARIANTS=react,current` (plus `react-control` when `REACT_CONTROL=1`). It is excluded from the default workload list.

`CURRENT_SOURCE` can point the `current` renderer at a frozen source instead of the working tree. `CANDIDATE_SOURCES` accepts a JSON object mapping additional renderer names to source or built-package directories, letting independent candidates share one randomized run. The runner selects `.ts` source entries or `.js` built entries and records that choice. Names must be unique lowercase names containing letters, digits or hyphens, starting with a letter. Input hashes identify snapshots; a `CURRENT_SOURCE` override does not inherit the working package's version label.

## Native transitions and the commit split

The [experiment notes](../docs/VIEW_TRANSITION_EXPERIMENT.md) describe the synchronous render/commit implementation and its compatibility limits. Reconstruct the measured variants from the pinned published package:

```sh
PRE_ANIMATION=$(BASELINE_PATCH=benchmarks/pre-view-transitions.patch node scripts/prepare-perf-baseline.mjs)
CURRENT=$(BASELINE_PATCH=benchmarks/commit-split.patch node scripts/prepare-perf-baseline.mjs)
STRIPPED=$(BASELINE_PATCH=benchmarks/commit-split-native-stripped.patch node scripts/prepare-perf-baseline.mjs)
BLOCKS=5 ROUNDS=5 REACT_CONTROL=1 \
  EXTRA_SOURCE="$PRE_ANIMATION" EXTRA_NAME=pre-animation \
  CURRENT_SOURCE="$CURRENT" \
  CANDIDATE_SOURCES="{\"native-stripped\":\"$STRIPPED\"}" \
  VARIANTS=react,react-control,pre-animation,current,native-stripped \
  OUTPUT=benchmarks/results/commit-split-repeat-cpu1.json \
  node scripts/compare-runtime.mjs
```

`native-stripped` changes only the native feature's export to its stub. It measures that feature selection, not an exact production Vite application's bundle. All variants still run the same completed-work checks. This comparison measures ordinary workload overhead, not animation smoothness or site-level performance.

`scripts/save-perf-baseline.mjs SOURCE OUTPUT.patch` saves new source snapshots in the format consumed by `prepare-perf-baseline.mjs`, checking that their package metadata matches the pinned reference. Keep the parent `package.json` beside each source tree so side-effect metadata remains intact.

The [parity expansion](./PARITY_EXPANSION.md) compares the next compatibility pass with the completed commit-error source. Run these sequentially:

```sh
BEFORE=$(BASELINE_PATCH=benchmarks/commit-error-parity.patch node scripts/prepare-perf-baseline.mjs)
CURRENT=$(BASELINE_PATCH=benchmarks/parity-expansion.patch node scripts/prepare-perf-baseline.mjs)
REACT_CONTROL=1 EXTRA_SOURCE="$BEFORE" EXTRA_NAME=before-expansion CURRENT_SOURCE="$CURRENT" VARIANTS=react,react-control,before-expansion,current OUTPUT=benchmarks/results/parity-expansion-repeat-cpu1.json node scripts/compare-runtime.mjs
REACT_CONTROL=1 CURRENT_SOURCE="$CURRENT" VARIANTS=react,react-control,current WORKLOADS=reducer-batches,reducer-suspense-updates,reducer-suspense-retries PHASES=throughput OUTPUT=benchmarks/results/parity-expansion-reducers-repeat-cpu1.json node scripts/compare-runtime.mjs
```

The three reducer workloads are opt-in. They check intermediate committed DOM, per-row effect lifecycles, order-sensitive actions, and every suspend/reveal cycle. The historical eager-reducer implementation cannot pass the retry workload and is intentionally excluded from that comparison. Shared validation work is included in timings, and `operations` counts dispatched actions, not commits.

The [commit optimization follow-up](./COMMIT_OPTIMIZATIONS.md) compares the optimized source against both the pre-animation source and the first verified split:

```sh
PRE_ANIMATION=$(BASELINE_PATCH=benchmarks/pre-view-transitions.patch node scripts/prepare-perf-baseline.mjs)
FIRST=$(BASELINE_PATCH=benchmarks/commit-split.patch node scripts/prepare-perf-baseline.mjs)
CURRENT=$(BASELINE_PATCH=benchmarks/commit-optimized.patch node scripts/prepare-perf-baseline.mjs)
STRIPPED=$(BASELINE_PATCH=benchmarks/commit-optimized-native-stripped.patch node scripts/prepare-perf-baseline.mjs)
BLOCKS=5 ROUNDS=5 REACT_CONTROL=1 \
  EXTRA_SOURCE="$PRE_ANIMATION" EXTRA_NAME=pre-animation \
  CURRENT_SOURCE="$CURRENT" \
  CANDIDATE_SOURCES="{\"first-split\":\"$FIRST\",\"native-stripped\":\"$STRIPPED\"}" \
  VARIANTS=react,react-control,pre-animation,current,first-split,native-stripped \
  OUTPUT=benchmarks/results/commit-optimized-repeat-cpu1.json \
  node scripts/compare-runtime.mjs
```

Frozen sources must retain their package layout: `package.json` beside a directory named `src`. The package's `sideEffects` paths depend on that layout. The runner rejects builds that remove bare side-effect imports rather than timing an incomplete runtime.

The [final verification](./COMMIT_ERROR_PARITY.md) adds native rejection and reentrant fallback fixes. Its comparison keeps the preceding optimized source as an additional control:

```sh
PRE_ANIMATION=$(BASELINE_PATCH=benchmarks/pre-view-transitions.patch node scripts/prepare-perf-baseline.mjs)
PRE_REJECTION=$(BASELINE_PATCH=benchmarks/commit-optimized.patch node scripts/prepare-perf-baseline.mjs)
CURRENT=$(BASELINE_PATCH=benchmarks/commit-error-parity.patch node scripts/prepare-perf-baseline.mjs)
STRIPPED=$(BASELINE_PATCH=benchmarks/commit-error-parity-native-stripped.patch node scripts/prepare-perf-baseline.mjs)
BLOCKS=5 ROUNDS=5 REACT_CONTROL=1 \
  EXTRA_SOURCE="$PRE_ANIMATION" EXTRA_NAME=pre-animation \
  CURRENT_SOURCE="$CURRENT" \
  CANDIDATE_SOURCES="{\"pre-rejection\":\"$PRE_REJECTION\",\"native-stripped\":\"$STRIPPED\"}" \
  VARIANTS=react,react-control,pre-animation,current,pre-rejection,native-stripped \
  OUTPUT=benchmarks/results/commit-error-parity-repeat-cpu1.json \
  node scripts/compare-runtime.mjs
```

The [rejected micro-candidates](./COMMIT_TAIL_CANDIDATES.md) include a separate event-heavy hydration safety fixture. Retain their raw results and patches when testing further ideas; they are not release candidates.

```sh
CPU_RATE=4 INTERACTION_ROWS=240,2400,10000 OUTPUT=benchmarks/results/react-comparison-cpu4.json node scripts/compare-runtime.mjs
node scripts/compare-ssr.mjs
node --test benchmarks/stats.test.mjs
```

The initial measurements are in [RESULTS.md](./RESULTS.md). The [follow-up summary](./FOLLOWUP.md) covers the compatibility repairs and targeted optimizations, with [full follow-up measurements](./PARITY_RESULTS.md). Regenerate the initial report from the three saved comparison files with:

```sh
node scripts/report-runtime.mjs
```

The pre-parity snapshot includes the first performance pass and the bounded React 19.3 attribute/stream fixes. Reconstruct it from the pinned package with `BASELINE_PATCH=benchmarks/pre-parity.patch node scripts/prepare-perf-baseline.mjs`, then pass the printed path as `EXTRA_SOURCE` with `EXTRA_NAME=before-parity`. `REPORT_OUTPUT` writes a separate report when explicit result files are passed to the report generator.

Reproduce the four follow-up experiments sequentially, with no other testing or benchmarking running:

```sh
BEFORE=$(BASELINE_PATCH=benchmarks/pre-parity.patch node scripts/prepare-perf-baseline.mjs)
CORRECTNESS=$(BASELINE_PATCH=benchmarks/correctness-only.patch node scripts/prepare-perf-baseline.mjs)
REACT_CONTROL=1 EXTRA_SOURCE="$BEFORE" EXTRA_NAME=before-parity VARIANTS=react,react-control,before-parity,current PHASES=throughput,interaction OUTPUT=benchmarks/results/parity-performance-cpu1.json node scripts/compare-runtime.mjs
REACT_CONTROL=1 VARIANTS=react,react-control,current WORKLOADS=context-through-memo PHASES=throughput OUTPUT=benchmarks/results/parity-context-cpu1.json node scripts/compare-runtime.mjs
REACT_CONTROL=1 EXTRA_SOURCE="$BEFORE" EXTRA_NAME=before-parity OUTPUT=benchmarks/results/parity-node-ssr.json node scripts/compare-ssr.mjs
REACT_CONTROL=1 EXTRA_SOURCE="$CORRECTNESS" EXTRA_NAME=correctness-only VARIANTS=react,react-control,correctness-only,current WORKLOADS=mixed-depth-setters,mount-unmount,batched-setters,sparse-setters,hydration PHASES=throughput OUTPUT=benchmarks/results/parity-optional-optimizations.json node scripts/compare-runtime.mjs
REPORT_OUTPUT=benchmarks/PARITY_RESULTS.md node scripts/report-runtime.mjs benchmarks/results/parity-performance-cpu1.json benchmarks/results/parity-context-cpu1.json benchmarks/results/parity-node-ssr.json benchmarks/results/parity-optional-optimizations.json
```

The correctness-only snapshot contains the runtime compatibility fixes but excludes the mount, hydration-probe and escaping optimizations. It is a measurement baseline, not a release candidate. The commands overwrite the named result files, so choose different `OUTPUT` paths to retain the recorded experiments.

The [hydration and unmount pass](./HYDRATION_UNMOUNT.md) starts from that completed follow-up. Its browser experiment includes all 15 default workloads, context-through-memo, trusted clicks and retained-memory checks:

```sh
BEFORE=$(BASELINE_PATCH=benchmarks/pre-hydration-unmount.patch node scripts/prepare-perf-baseline.mjs)
REACT_CONTROL=1 EXTRA_SOURCE="$BEFORE" EXTRA_NAME=before-fixes VARIANTS=react,react-control,before-fixes,current WORKLOADS=mount-unmount,hydration,batched-setters,mixed-depth-setters,sparse-setters,keyed-reverse,controlled-selects,props-updates,jsx-props-updates,stable-keyed-rows,jsx-stable-keyed-rows,deep-tree-props,null-siblings,passive-effects,browser-ssr,context-through-memo OUTPUT=benchmarks/results/hydration-unmount-cpu1.json node scripts/compare-runtime.mjs
REPORT_OUTPUT=benchmarks/HYDRATION_UNMOUNT_RESULTS.md node scripts/report-runtime.mjs benchmarks/results/hydration-unmount-cpu1.json
```

The mount/unmount fixture now records component render counts as well as mount/cleanup effects. Historical runtimes remain measurable even if they render extra times during removal; that discrepancy is reported, not counted as equivalent behavior. The shared removal tests separately enforce the expected render count.

`scripts/profile-runtime.mjs` captures diagnostic Chrome CPU profiles for hydration and mount/unmount. It keeps function names readable and includes fixture setup, checks and teardown, so its sample weights are hotspot clues, not the production comparison timings. Set `SOURCE`, `WORKLOADS`, `ITERATIONS` and `OUTPUT` as needed; profiles default to `/tmp/redact-profiles`.

The [control-update pass](./CONTROL_RESTORE.md) compares the preceding runtime, control fixes alone, and control fixes with two small optimizations in the same run:

```sh
BEFORE=$(BASELINE_PATCH=benchmarks/pre-control-restore.patch node scripts/prepare-perf-baseline.mjs)
CORRECTNESS=$(BASELINE_PATCH=benchmarks/control-correctness-only.patch node scripts/prepare-perf-baseline.mjs)
REACT_CONTROL=1 EXTRA_SOURCE="$BEFORE" EXTRA_NAME=before-controls CANDIDATE_SOURCES="{\"correctness-only\":\"$CORRECTNESS\"}" VARIANTS=react,react-control,before-controls,correctness-only,current WORKLOADS=mount-unmount,hydration,batched-setters,mixed-depth-setters,sparse-setters,keyed-reverse,controlled-selects,props-updates,jsx-props-updates,stable-keyed-rows,jsx-stable-keyed-rows,deep-tree-props,null-siblings,passive-effects,browser-ssr,context-through-memo OUTPUT=benchmarks/results/control-restore-cpu1.json node scripts/compare-runtime.mjs
REACT_CONTROL=1 EXTRA_SOURCE="$BEFORE" EXTRA_NAME=before-controls CANDIDATE_SOURCES="{\"correctness-only\":\"$CORRECTNESS\"}" VARIANTS=react,react-control,before-controls,correctness-only,current WORKLOADS=mount-unmount,hydration,jsx-props-updates,stable-keyed-rows PHASES=throughput OUTPUT=benchmarks/results/control-restore-repeat-cpu1.json node scripts/compare-runtime.mjs
REPORT_OUTPUT=benchmarks/CONTROL_RESTORE_RESULTS.md node scripts/report-runtime.mjs benchmarks/results/control-restore-cpu1.json benchmarks/results/control-restore-repeat-cpu1.json
```

Both snapshots reconstruct from the pinned published package and retain its original package layout. `control-correctness-only.patch` excludes only the data/aria setter branch relocation and direct single-child placement shortcut added in this pass. The earlier `correctness-only.patch` belongs to the preceding experiment and is not interchangeable.

The [new API pass](../docs/REACT_19_3_SUPPORT.md) compares against the completed control-update pass, with all new features enabled. The full run measures the API-complete source before the small commit-queue guard; the focused run measures that guard separately:

```sh
BEFORE=$(BASELINE_PATCH=benchmarks/pre-new-apis.patch node scripts/prepare-perf-baseline.mjs)
API=$(BASELINE_PATCH=benchmarks/new-apis-before-guard.patch node scripts/prepare-perf-baseline.mjs)
CURRENT_SOURCE="$API" REACT_CONTROL=1 EXTRA_SOURCE="$BEFORE" EXTRA_NAME=before-new-apis VARIANTS=react,react-control,before-new-apis,current WORKLOADS=mount-unmount,hydration,batched-setters,mixed-depth-setters,sparse-setters,keyed-reverse,controlled-selects,props-updates,jsx-props-updates,stable-keyed-rows,jsx-stable-keyed-rows,deep-tree-props,null-siblings,passive-effects,browser-ssr,context-through-memo OUTPUT=benchmarks/results/new-apis-cpu1.json node scripts/compare-runtime.mjs
REACT_CONTROL=1 EXTRA_SOURCE="$BEFORE" EXTRA_NAME=before-new-apis CANDIDATE_SOURCES="{\"api-before-guard\":\"$API\"}" VARIANTS=react,react-control,before-new-apis,api-before-guard,current WORKLOADS=stable-keyed-rows,jsx-stable-keyed-rows,deep-tree-props,controlled-selects,mount-unmount,hydration,passive-effects,batched-setters PHASES=throughput OUTPUT=benchmarks/results/new-apis-queue-guard-cpu1.json node scripts/compare-runtime.mjs
REPORT_OUTPUT=benchmarks/NEW_APIS_RESULTS.md node scripts/report-runtime.mjs benchmarks/results/new-apis-cpu1.json benchmarks/results/new-apis-queue-guard-cpu1.json
```

These existing workloads measure the cost of carrying the new APIs, not the relative speed of Activity, Fragment instance operations or browser-only server boundaries.

## What the measurements mean

- Completed-work throughput uses the same production fixture and iteration counts for every renderer. Mounts and synchronous updates use `flushSync` on both sides. This measures forced commit cost, not normal React scheduling. Separate automatic-JSX cases check that `createElement` overhead does not determine the result. Fixture work is included; root creation, setup and final teardown are excluded. The mount/unmount case measures subtree cycles inside an existing root, not page startup. Neither renderer uses React Compiler here.
- State cases call actual setters. Effect cases wait for the final passive effect. Hydration waits for an effect, rejects recoverable errors, and verifies that every row DOM node was adopted. Final DOM, state and effect checks happen outside the timed section.
- Normal-scheduling scenarios use automatic JSX and trusted clicks, without `flushSync` in the handler. Handler-to-commit and handler-to-next-rAF are distinct from paint latency. DOM validation happens after observation so it does not inflate paint measurements.
- Browser Event Timing provides observed click durations, rounded by the browser. Entries below its reporting threshold can be absent. Missing values are unavailable, not zero. These scripted clicks are not field INP and do not measure responsiveness to input arriving during unrelated work.
- Memory uses separate pages and forced GC after mount/unmount. It reports JS heap and DOM counters, not allocation rate, process RSS, a leak verdict, or a mobile-device memory budget. Warmup/JIT caches can remain after unmount.
- `browser-ssr` runs serialization in Chrome. It is not a Node or edge-server throughput measurement. Use the separate Node SSR runner for server measurements.

Calibration runs before measurement and chooses one iteration count per workload. Renderer order rotates through a seeded permutation, workload order is shuffled, and each outer block starts a new browser. Natural GC remains enabled in timing samples. CPU slowdown is a sensitivity test, not an emulation of a particular phone.

Results retain raw samples, versions, environment, bundle/input hashes and correctness diagnostics. Throughput summaries are milliseconds per iteration, which is a whole batch for setter cases. Their p95 is a percentile of batch averages, not individual-update tail latency. `observedTaskDurationMs` includes Playwright instrumentation and is diagnostic only.

Time differences use paired log ratios with a 95% bootstrap interval that resamples whole browser blocks. The interval describes this experiment, not all applications. It is omitted when there are fewer than three independent blocks. These exploratory intervals are not corrected for testing multiple workloads. Inspect the identical React control and repeat suspicious results rather than discarding unfavorable samples.

There is no combined winner score. A renderer may improve state updates while losing on initial mount or hydration. Browser frame timing may hide a measurable execution-time advantage.

## Upstream compatibility

The [React 19.3 audit](../docs/REACT_19_3_AUDIT.md) records implemented fixes and remaining gaps. Fixed upstream cases live in the default regression suite. Remaining opt-in failing cases are separate from performance workloads and the passing default suite.
