# Counted SSR completion

Repeated Promise.race scans visit every outstanding boundary task whenever a streamed Suspense boundary settles. The ECMAScript [PerformPromiseRace algorithm](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-performpromiserace) motivates replacing those repeated scans with a pending count and a wake signal. A one-slot box stores the first rejection reason separately from that signal. Consuming its value releases the error, and the empty box prevents later failures from being stored.

The candidate also uses a fixed private suspension record, removes an unused fallback copy and updates the pending thenable in place on retry. No public API or application authoring changes. Baseline: `37c051c9`, Node 24.22.0 on macOS arm64. Exact source hashes are included in `data/source-hashes.json`.

## Repeated measurements

Each timing series uses five independent blocks and three balanced rounds with an independently bundled identical control. Completed HTML hashes, byte counts and chunk counts match. These are workload-specific results, not a general SSR speed claim.

| Staggered boundaries | First time change | Repeat time change |
| --- | ---: | ---: |
| 8 | -9.58% | -9.10% |
| 32 | -20.29% | -24.35% |
| 128 | -36.10% | -36.71% |
| 512 | -50.50% | -49.66% |

At 128 boundaries, two independent allocation series use five samples per variant and a 4 KiB sampling interval, including collected objects. This measures allocation pressure, not retained heap.

- notifier-staggered-allocation: candidate -29.09%, identical control -0.03%.
- notifier-repeat-allocation: candidate -28.94%, identical control -0.02%.

Ordinary-workload results below include identical controls. Short cases are noisy, so these estimates should not be interpreted as precise small wins or losses. Firefox string-ready is +3.49% against baseline while its control is +1.37%; its 95% block interval spans -2.74% to +20.27%, so this short case does not establish a precise cost. Raw block samples and bootstrap intervals are in `data/summary.json`.

| Engine/workload | Candidate time change | Identical control |
| --- | ---: | ---: |
| Node / stream-delayed | -2.22% | 1.10% |
| Node / string-ready | 0.09% | 0.33% |
| Node / stream-ready | 0.23% | 0.88% |
| firefox / stream-delayed | -1.07% | -1.31% |
| firefox / stream-ready | -3.15% | 2.33% |
| firefox / string-ready | 3.49% | 1.37% |
| firefox / string-fallback | -0.80% | 2.52% |
| firefox / root-retry | -5.92% | -0.55% |
| webkit / stream-delayed | -3.03% | 1.20% |
| webkit / stream-ready | 0.00% | -1.49% |
| webkit / string-ready | -1.64% | 0.00% |
| webkit / string-fallback | 0.95% | -0.48% |
| webkit / root-retry | 1.39% | 0.00% |

## Compatibility, memory and size

2,014 tests pass, 91 skipped. Types, build verification, all absolute size budgets and the separate zero-growth React compatibility size gate pass. All 15 sink-failure release spacings match baseline in Chrome, Firefox and WebKit. Regression tests also cover nested registration during completion, context captured across retries, aborts, reentrant SSR and throwing sinks.

The failed-stream retention probe runs three fresh processes per variant across eight release spacings. Error events match baseline, and each retained handle retains only the first error, as baseline does. A second three-process probe confirms original recoverable errors are released across all eight spacings, with matching error events. The completed-success probe retains twelve streams and releases every captured payload in each of three repeats per variant.

Source server gzip is 8,978 bytes versus baseline 8,975, a 3-byte increase; built server gzip is 8,973 versus 8,974. The unchanged cap is 8,989. React 19/18 compatibility server bundles save 110 minified bytes and 2 gzip bytes; Brotli is unchanged for React 19 and 4 bytes smaller for React 18 across all three profiles. Clients are unchanged. No budgets were raised.

## Rejected revisions

The notifier-only implementation failed the zero-growth gzip gate by 4 bytes. Removing only the unused fallback field still grew React 19 Brotli by 9 bytes. Composing the fixed private suspension record passed size gates. Review then found that resolving a wake with the settled task could swallow a second sink failure at promise-chain spacings 0 and 1. A separate buffer fixed the traces, but clearing it let a later rejection retain a second error. That revision failed the repeated memory probe and was rejected. Permanently latching the task fixed ordinary-error retention but retained original recoverable errors after streamHtml transformed them. That revision was also rejected. Consumed-marker encodings passed behavior but exceeded a Brotli gate by 5 to 15 bytes. The current one-slot box releases its value on consumption while its empty state prevents recapture. It allocates one box and one rejected promise only on the failure path.

Contended preflights and conservatively excluded timing attempts are archived separately and do not contribute to these results. Raw heap profiles and their hashes are preserved in the shared `benchmarks/results/rd-notifier-failurebox` archive.

## Reproduce

Use Node 24.22.0 with repository dependencies installed and a fresh output directory. Run sequentially with no overlapping tests, builds or benchmarks. Browser checks require Playwright browsers and Chrome.

```sh
export RD_ROOT=/tmp/redact-completion-reproduction
node benchmarks/results/ssr-completion-notifier/prepare.mjs
node benchmarks/results/ssr-completion-notifier/review-comparison.mjs
node benchmarks/results/ssr-completion-notifier/error-retention.mjs
node benchmarks/results/ssr-completion-notifier/recoverable-error-retention.mjs
node benchmarks/results/ssr-completion-notifier/browser-semantics.mjs
node benchmarks/results/ssr-completion-notifier/timing.mjs
node benchmarks/results/ssr-completion-notifier/timing-repeat.mjs
node benchmarks/results/ssr-completion-notifier/allocation.mjs
node benchmarks/results/ssr-completion-notifier/allocation-repeat.mjs
node benchmarks/results/ssr-completion-notifier/broad.mjs
ENGINES=firefox,webkit node benchmarks/results/ssr-completion-notifier/browsers.mjs
node benchmarks/results/ssr-completion-notifier/retention.mjs
```

Decision: local validation complete, adopt for delivery. PR #123 still requires CI and review on the corrected head, then merge and the normal Changesets release. It has not merged or released.
