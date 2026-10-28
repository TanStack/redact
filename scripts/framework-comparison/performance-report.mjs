import {readFileSync,writeFileSync} from 'node:fs';
const root='benchmarks/results/framework-comparison/';
const data=JSON.parse(readFileSync(root+'performance-repeat.json'));
const first=JSON.parse(readFileSync(root+'performance.json'));
const matrix=JSON.parse(readFileSync(root+'matrix.json'));
const router=matrix.rows.find(row=>row.name==='router-framework');
if (!router?.results.redact.passed || !router.results.react.passed) throw Error('Published hydration follow-up must pass before generating this summary');
const names={mount:'Mount and unmount 500 rows',props:'Update 500 row props',state:'Update state across 500 rows',reorder:'Reverse 500 keyed rows','insert-remove':'Add or remove 250 rows'};
const runtimes=['react','redact','preact'];
if(data.samples.length!==105||first.samples.length!==105)throw Error('Incomplete runs');
for(const d of [data,first])for(const s of d.samples)if(!(s.ms>0))throw Error('Invalid timing');
const lines=[`---
title: React vs Redact vs Preact
---

| Measured or tested | React 19.3.1 | Redact¹ | Preact compat 11.1.0 |
|---|---:|---:|---:|
| Overall speed score, five list workloads¹ | 100 | ${Math.round(data.scores.redact)} | ${Math.round(data.scores.preact)} |
| Test bundle, gzip² | ${(data.sizes.react/1024).toFixed(1)} KiB | ${(data.sizes.redact/1024).toFixed(1)} KiB | ${(data.sizes.preact/1024).toFixed(1)} KiB |
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

Higher is faster, React = 100. This is a score for five synchronous list workloads, not whole-app performance. It is the geometric mean of React time divided by each runtime's time, with equal weight per workload. The two runs scored React 100, Redact ${Math.round(first.scores.redact)} and ${Math.round(data.scores.redact)}, Preact ${Math.round(first.scores.preact)} and ${Math.round(data.scores.preact)}. Those are repeat results, not confidence intervals.

² The same production benchmark application, including its checks, bundled with each runtime and gzipped. These are tree-shaken application bundles, not each runtime's complete API surface. Redact uses its default Vite configuration. Next and Vinext keep native React on the server.

³ The tested Preact Turbopack aliases left native React loaded, so they did not produce a working Preact replacement.

## Speed by operation

Median milliseconds per completed operation in the repeat run, lower is faster. Every operation uses 500 rows except insertion, which alternates between 500 and 750.

| Operation | React ms | Redact ms | Preact ms |
|---|---:|---:|---:|`];
for(const [key,label] of Object.entries(names))lines.push(`| ${label} | ${runtimes.map(r=>data.medians[key][r].toFixed(3)).join(' | ')} |`);
lines.push(`
React was faster on props, state, and insertion/removal. Redact was faster on reversal. React and Preact were close on mounting. This suite does not support a blanket claim that Redact is faster.

Measured October 27, 2026 on ${data.machine}, Chromium ${data.browser}, Node ${data.node}, without CPU throttling. Each run uses seven fresh browser blocks, rotates runtime order, warms up each workload 20 times, then times 200 operations. The repeat verifies committed row counts, text, and retained keyed DOM identity during warmup, then checks final DOM and unmount cleanup. Timing uses synchronous flushes and excludes the assertions. It includes DOM mutation, not layout or paint.

These tests do not measure startup, memory, SSR, hydration speed, transitions, responsiveness under competing work, mobile devices, Firefox, or Safari. Missing React behavior is shown in the capability rows and does not earn a speed bonus.

[Benchmark source and commands](https://github.com/TanStack/redact/tree/main/scripts/framework-comparison), [first run](https://github.com/TanStack/redact/blob/main/benchmarks/results/framework-comparison/performance.json), [repeat run](https://github.com/TanStack/redact/blob/main/benchmarks/results/framework-comparison/performance-repeat.json), [API and size details](./preact.md).
`);
writeFileSync('docs/comparison.md',lines.join('\n'));
