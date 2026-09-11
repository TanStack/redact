# Context and ref compatibility fixes

Baseline: `aa8730af30298af691e75b2de73b6510200c2ddc`, the source and built package behind Redact 0.1.0. Final client changes: `28d6c36fa11cd27c388098d1d1dd6226f5c04e29`. Final server changes: `035f2ab5ae3424e7680e5cb247890d3fec88a2f7`.

The fixes cover PRs #27 and #28: direct context providers, provider identity, and refs passed through classic element helpers. They also preserve legacy element-level refs and own props named `constructor`, `toString`, and `hasOwnProperty`. Synchronous scheduling and feature downgrades are unchanged.

## Bundle sizes

Production ES2022 ESM bundles, all entry exports retained, measured with the same esbuild and compression settings before and after.

| Built bundle | Before, gzip bytes | After, gzip bytes | Change |
| --- | ---: | ---: | ---: |
| Nano client total | 15,534 | 15,503 | -31 |
| Default client total | 23,311 | 23,301 | -10 |
| Full client total | 28,159 | 28,125 | -34 |
| Server | 8,964 | 8,957 | -7 |

All 20 measured built entries are flat or smaller in both minified and gzip bytes. No size budget was raised. All three combined client bundles also shrink under Brotli. Some isolated feature-stub Brotli bundles grow by 7 to 20 bytes; the source and built measurements are retained in [the complete size comparison](results/pr-compat-sizes.json).

## Factory investigation

The initial ref fix added about 11% to ref-heavy element creation and cloning in a repeated microbenchmark, so it was not accepted as the final implementation. Four alternatives were compared in the same rotated run. Explicit reserved-key comparisons with the existing `hasOwnProperty.call` check won; replacing that check with `Object.hasOwn` was slower on this machine.

| Factory | Before, ns/call | Chosen candidate, ns/call | Paired time change, 95% interval |
| --- | ---: | ---: | --- |
| `createElement`, no ref | 38.2 | 25.3 | -34.2% [-36.3%, -33.6%] |
| `createElement`, with ref | 42.0 | 31.5 | -25.6% [-29.1%, -24.9%] |
| `cloneElement` | 34.2 | 25.7 | -24.7% [-25.0%, -23.8%] |

These are factory microbenchmarks, not whole-app speedups. Each timed batch creates 256 objects and consumes their values, with completed work checked afterward. The identical React control varied from -1.1% to +1.1% in the paired estimates. [All candidates and samples](results/pr-compat-factory-hypotheses.json) are retained, including the rejected versions.

## Final client sweep

The [final 23-workload run](results/pr-compat-final-runtime.json) uses the final client implementation, including the faster prop-copy path. No workload has a 95% interval entirely on the slower side. This is not a formal equivalence test, and reducer-batch timing remains noisy.

| Workload | Paired time change, 95% interval |
| --- | --- |
| Classic keyed rows | -3.9% [-4.2%, -2.5%] |
| Props updates | -2.9% [-3.7%, -1.4%] |
| Deep-tree props | -4.4% [-4.7%, -2.9%] |
| Controlled selects | -4.5% [-5.5%, -3.3%] |
| JSX keyed rows | -0.3% [-1.3%, +1.5%] |
| Context through memo | 0.0% [-1.5%, +0.8%] |
| Hydration | -1.1% [-3.7%, +2.6%] |
| Reducer batches | +0.3% [-8.9%, +14.1%] |

In this mixed-workload run, element factories take 17% to 28% less time and context creation takes 18% less time. Factory results vary with the surrounding workload and should not be presented as universal app speedups.

For 2,400-row clicks, baseline and candidate both have a 1.1 ms median handler-to-commit time. Their p95s are 1.21 and 1.30 ms, respectively. All recorded click durations are 16 ms in both versions, with no long tasks in the event windows. The smaller 240-row case has medians of 0.3 and 0.2 ms, with p95s of 0.3 and 0.4 ms. These sub-millisecond differences sit near the browser timer resolution; they are not exact paint measurements.

Repeated mount/unmount cycles retain no extra DOM nodes or listeners. The median retained-heap delta after the third cycle is 64,348 bytes for both versions, relative to each page's pre-warmup baseline. This measures retained heap, not allocation rate or process memory.

## Server rendering

The [first Node SSR run](results/pr-compat-ssr.json) found a small escaped-text regression: +1.2%, with a 95% interval of [+0.5%, +2.1%]. Moving the existing host-element check before the special-component checks avoids those comparisons for ordinary HTML elements, without adding code or changing their behavior.

The [final server run](results/pr-compat-ssr-host-first.json) tests that exact source against the same baseline. All output checks pass, and no workload has a 95% interval entirely on the slower side.

| Workload | Paired time change, 95% interval |
| --- | --- |
| Clean string render | -0.6% [-2.7%, +2.6%] |
| Escaped string render | -1.1% [-1.3%, -0.6%] |
| Hooks and context | -0.5% [-1.5%, -0.2%] |
| Ready readable stream through EOF | -0.8% [-1.2%, +0.1%] |

These measure renderer work in fresh Node processes, not request latency or server capacity. The client sweep's browser-SSR case predates this final server-only ordering change; the other client workloads use the final client source.

## Correctness

- `pnpm test:pr`: 1,607 passed, 91 existing skips; types, build, published-entry verification, and size budgets pass.
- Chrome core: 356 passed, 3 existing skips. All 29 new direct-provider, ref-prop, and own-prop cases also pass against React 19.3.
- Chrome native transitions: 80 passed on the baseline and twice on the final implementation; the shared React reference cases pass all 77 tests.
- Chrome retained content: 61 passed. Chrome resources: 75 passed. These suites overlap, so their counts are not a unique-test total.
- Vite tests exercise direct, `.Provider`, and legacy provider forms in full and nano builds, including disabled context behavior.

One native test run reported a browser cancellation after its assertions had passed. This also reproduced on the unchanged baseline. Test teardown now unmounts owning roots before skipping or draining browser transitions, allowing the runtime to cancel pending captures itself. No animation-runtime error handling was changed.

Three additional anchor tests were added while reviewing the separately submitted PR #30. That optimization is not included here. At `c85cb147b0d14b5d268461b1dbbc12b5b8c4cd1f`, it reverses two newly visible siblings after portal DOM moves inline beyond the adjacent sibling. The new test expects `one, two, tail` and receives `two, one, tail`; the unchanged renderer passes. The other two cases cover a DOM-owning sibling revealing later content and replacement of a later node without changing the parent child count. Run them with `pnpm exec vitest run --config scripts/child-chain-cache.config.mjs`; `REDACT_TEST_SOURCE` selects an isolated candidate. These are Redact-specific synchronous regression checks, not shared React parity cases. The configuration rejects `REACT_REFERENCE=1` explicitly.

The same PR revision adds 52, 55, and 64 gzip bytes to the nano, default, and full combined clients when applied to this branch. Instrumenting `firstDomNode` also finds the same 20,100, 80,200, and 2,001,000 calls as the unchanged renderer when adding 200, 400, and 2,000 rows after a retained header, with no trailing sibling. `scanned` becomes `null` at the end, then `scanned ?? sibling.sibling` restarts the exhausted scan. Those are call counts, not instrumented timing claims.

## Measurement method

Production bundles, React 19.3 plus an identical React control, five fresh-browser or fresh-process blocks and five rotated rounds per workload. Baseline and candidate use identical iteration counts, and each workload validates completed work. Timing intervals resample whole blocks. Benchmarks run separately from builds and test suites. The final runs used an Apple M5 Pro, Chrome 152.0.7977.83, Node 24.15.0, and esbuild 0.28.0. Raw results retain fixture, runner, source-input, and bundle hashes.

Results describe this machine and these workloads, not every application or device. Intervals are exploratory and are not corrected for multiple comparisons. Handler-to-commit time is not paint time, browser Event Timing is quantized, and absent entries are not zero latency.

The earlier [broad run](results/pr-compat-runtime.json) and [focused follow-up](results/pr-compat-focused.json) record the intermediate implementation before the final prop-copy change. They are investigation evidence, not final-runtime measurements.

## Reproduce the final comparisons

Install the pinned references with `npm ci --prefix benchmarks/reference --ignore-scripts`, then prepare an unchanged source baseline:

```sh
BASELINE=$(mktemp -d)
git archive aa8730af30298af691e75b2de73b6510200c2ddc packages/redact | tar -x -C "$BASELINE"
export EXTRA_NAME=baseline EXTRA_SOURCE="$BASELINE/packages/redact/src" REACT_CONTROL=1 BLOCKS=5 ROUNDS=5

VARIANTS=react,react-control,baseline,current \
WORKLOADS=stable-keyed-rows,jsx-stable-keyed-rows,keyed-reverse,mount-unmount,deep-tree-props,batched-setters,sparse-setters,mixed-depth-setters,props-updates,jsx-props-updates,passive-effects,controlled-selects,null-siblings,hydration,browser-ssr,context-through-memo,create-elements,create-elements-with-ref,clone-elements,create-contexts,reducer-batches,reducer-suspense-updates,reducer-suspense-retries \
OUTPUT=/tmp/pr-compat-client.json node scripts/compare-runtime.mjs

OUTPUT=/tmp/pr-compat-ssr.json node scripts/compare-ssr.mjs
```

Use the commits above for exact source reproduction. `CURRENT_SOURCE` lets either runner measure a frozen source tree without changing the checkout. In the stored SSR runs, the variant named `published` is the older pinned reference package; `baseline`, not `published`, is the pre-fix 0.1.0 comparison.
