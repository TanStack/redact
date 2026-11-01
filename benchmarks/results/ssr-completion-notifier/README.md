# Counted SSR completion

Repeated Promise.race calls over all remaining boundary tasks add work whenever a streamed Suspense boundary settles. The ECMAScript [PerformPromiseRace algorithm](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-performpromiserace) visits every input and invokes its then method. That motivates replacing repeated scans with a pending count and one waiter. Resolving that waiter with the settled task preserves sink-error rejection.

The production candidate also uses a fixed private suspension record, omits the unused fallback copy, and updates the pending thenable in place on retry. No application authoring or public API changes. Baseline: `37c051c9`, Node 24.22.0 on macOS arm64.

## Current-main results

Two fresh-process timing series, each with five independent blocks and three balanced rounds, compare completed streams with identical HTML hashes, byte counts and chunk counts. An independently bundled identical baseline is the control. These are workload-specific results, not a general SSR speed claim.

| Staggered boundaries | First time change | Repeat time change |
| --- | ---: | ---: |
| 8 | -6.64% | -7.69% |
| 32 | -20.95% | -20.89% |
| 128 | -36.79% | -36.36% |
| 512 | -49.98% | -50.11% |

At 128 boundaries, two independent allocation series, each five samples per variant, report 28.74% and 28.90% fewer sampled bytes. Identical controls differ by +0.12% and -0.26%. Sampling includes collected objects and uses a 4 KiB interval. This is allocation pressure, not retained heap. Completed-stream probes retain the streams but release all twelve captured payloads in every run, three runs per variant.

Ordinary Node string-ready, stream-ready and stream-delayed workloads remain near their identical controls. Firefox and WebKit also show no material regression relative to the identical control. Short ready-rendering cases are noisy: Firefox stream-ready is +3.20% against baseline while the control is +6.92%; WebKit stream-ready is +1.69% while its control is +3.39%. WebKit root-retry is unchanged against baseline while its control is -2.53%. Do not interpret these as precise small wins or losses. Raw block samples and bootstrap intervals are in `data/summary.json`.

## Gates and negative findings

2,009 tests pass, 91 skipped. Types, build verification, all existing absolute size budgets, and the separate zero-growth React compatibility size gate pass. Chrome, Firefox and WebKit completion traces match baseline, including abort, boundary errors, reverse completion, reentrant SSR and throwing output sinks. Added regressions cover nested registration during completion and captured context across a second suspension.

Source and built server gzip are 8,957 and 8,953 bytes, versus baseline 8,975 and 8,974. React 18 and 19 compatibility server bundles shrink 157 minified bytes and 28 gzip bytes across all three profiles. Brotli shrinks 16 bytes for React 19 and 9 for React 18. Client bundles are unchanged. No budgets were raised.

The notifier alone passed absolute caps but failed the zero-growth CI gate by 4 gzip bytes. Removing only the unused fallback field fixed gzip but still grew React 19 Brotli by 9 bytes. Both incomplete compositions are rejected for delivery. The fixed-record composition passes every size metric. No unrelated local SSR or lifecycle experiments are included.

## Reproduce

From this revision with dependencies installed, use Node 24.22.0. Set `RD_ROOT` to a new temporary directory and keep it exported for all commands:

```sh
export RD_ROOT=/tmp/redact-completion-reproduction
node benchmarks/results/ssr-completion-notifier/prepare.mjs
node benchmarks/results/ssr-completion-notifier/timing.mjs
node benchmarks/results/ssr-completion-notifier/timing-repeat.mjs
node benchmarks/results/ssr-completion-notifier/allocation.mjs
node benchmarks/results/ssr-completion-notifier/allocation-repeat.mjs
node benchmarks/results/ssr-completion-notifier/broad.mjs
ENGINES=firefox,webkit node benchmarks/results/ssr-completion-notifier/browsers.mjs
node benchmarks/results/ssr-completion-notifier/browser-semantics.mjs
node benchmarks/results/ssr-completion-notifier/retention.mjs
```

Run these sequentially with no other benchmarks, tests or builds active. Browser checks require Playwright browsers and Chrome. Raw results include input hashes, per-block timing and allocation samples. Original heap profiles remain in the archived research evidence, with hashes recorded alongside the results.

Decision: adopt the fixed-record composition for delivery. Local gates are complete. PR #123 still requires CI and review, then merge and the normal Changesets release. It is not yet merged or released.

Raw heap profiles are retained in the shared `benchmarks/results/rd-notifier-delivery` research archive; `data/heap-profile-hashes.json` identifies them. Public sample summaries and reproducible profiling scripts are included here.
