---
title: React vs Redact vs Preact
---

| Measured or tested | React 19.3.1 | Redact¹ | Preact compat 11.1.0 |
|---|---:|---:|---:|
| Overall speed score, five list workloads¹ | 100 | 78 | 73 |
| Test bundle, gzip² | 66.3 KiB | 19.8 KiB | 7.1 KiB |
| Basic Vite client app, React 18 and 19 fixtures | ✅ | ✅ | ✅ |
| Pending transitions and deferred results | ✅ | ✅ | ❌ |
| React 19 action state | ✅ | ✅ | ❌ |
| TanStack Start, React 18 and 19 fixtures | ✅ | ✅ | ❌ |
| React Router data mode | ✅ | ✅ | ❌ |
| React Router SSR, Redact 0.2.3 | ✅ | ✅ | ❌ |
| Next Pages, Webpack, native React server | ✅ | ✅ | ✅ |
| Next App Router, Webpack | ✅ | ✅ | ❌ |
| Next Pages and App Router, Turbopack | ✅ | ✅ | ❌³ |
| Vinext App Router | ✅ | ✅ | ❌ |

✅ passed the tested fixture, ❌ failed the tested setup, not proof that every possible integration fails. Framework versions and failures are in the [full matrix](./framework-comparison.md).

¹ Performance, size, and the original compatibility runs use Redact 0.2.1. Only React Router SSR was rerun with published 0.2.3, on October 28. The performance numbers below have not been remeasured for 0.2.3.

Higher is faster, React = 100. This is a score for five synchronous list workloads, not whole-app performance. It is the geometric mean of React time divided by each runtime's time, with equal weight per workload. The two runs scored React 100, Redact 80 and 78, Preact 78 and 73. Those are repeat results, not confidence intervals.

² The same production benchmark application, including its checks, bundled with each runtime and gzipped. These are tree-shaken application bundles, not each runtime's complete API surface. Redact uses its default Vite configuration. Next and Vinext keep native React on the server.

³ The tested Preact Turbopack aliases left native React loaded, so they did not produce a working Preact replacement.

## Speed by operation

Median milliseconds per completed operation in the repeat run, lower is faster. Every operation uses 500 rows except insertion, which alternates between 500 and 750.

| Operation | React ms | Redact ms | Preact ms |
|---|---:|---:|---:|
| Mount and unmount 500 rows | 0.371 | 0.421 | 0.366 |
| Update 500 row props | 0.128 | 0.218 | 0.197 |
| Update state across 500 rows | 0.112 | 0.210 | 0.200 |
| Reverse 500 keyed rows | 0.398 | 0.253 | 0.473 |
| Add or remove 250 rows | 0.189 | 0.282 | 0.285 |

React was faster on props, state, and insertion/removal. Redact was faster on reversal. React and Preact were close on mounting. This suite does not support a blanket claim that Redact is faster.

Measured October 27, 2026 on Apple M5 Pro, Chromium 156.0.8078.4, Node v24.15.0, without CPU throttling. Each run uses seven fresh browser blocks, rotates runtime order, warms up each workload 20 times, then times 200 operations. The repeat verifies committed row counts, text, and retained keyed DOM identity during warmup, then checks final DOM and unmount cleanup. Timing uses synchronous flushes and excludes the assertions. It includes DOM mutation, not layout or paint.

These tests do not measure startup, memory, SSR, hydration speed, transitions, responsiveness under competing work, mobile devices, Firefox, or Safari. Missing React behavior is shown in the capability rows and does not earn a speed bonus.

[Benchmark source and commands](https://github.com/TanStack/redact/tree/6a2ca15ed0c9453aebf013645381b334fe0fa13d/scripts/framework-comparison), [first run](https://github.com/TanStack/redact/blob/6a2ca15ed0c9453aebf013645381b334fe0fa13d/benchmarks/results/framework-comparison/performance.json), [repeat run](https://github.com/TanStack/redact/blob/6a2ca15ed0c9453aebf013645381b334fe0fa13d/benchmarks/results/framework-comparison/performance-repeat.json), [API and size details](./preact.md).
