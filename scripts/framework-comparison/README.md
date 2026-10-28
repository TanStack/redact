# Framework comparison fixtures

These fixtures compare actual runtime behavior, not API names alone. Read [the findings](../../benchmarks/FRAMEWORK_COMPARISON.md) before using a checkmark in product copy.

## Run

Use Node 24.15.0. The lockfiles pin framework dependencies and the two React installations. The scripts default to `/tmp/redact-framework-matrix`; set `MATRIX_ROOT` to use another location. Install the React 18 tree separately so its framework internals resolve React 18, not a React 19 copy from a parent project.

```sh
mkdir -p /tmp/redact-framework-matrix/react18
cp scripts/framework-comparison/dependencies/package*.json /tmp/redact-framework-matrix/
cp scripts/framework-comparison/dependencies/react18/package*.json /tmp/redact-framework-matrix/react18/
npm ci --prefix /tmp/redact-framework-matrix --ignore-scripts --no-audit --no-fund
npm ci --prefix /tmp/redact-framework-matrix/react18 --ignore-scripts --no-audit --no-fund
/tmp/redact-framework-matrix/node_modules/.bin/playwright install chromium
node scripts/framework-comparison/prepare.mjs
MATRIX_CASES=vite18,vite19,router-data,router-framework,start,start18,next-pages,next-pages18,next-app,vinext node scripts/framework-comparison/run.mjs
MATRIX_VARIANT=-turbopack MATRIX_BUNDLER=turbopack MATRIX_CASES=next-pages,next-pages18,next-app node scripts/framework-comparison/run.mjs
node scripts/framework-comparison/core.mjs
node scripts/framework-comparison/modern.mjs
node scripts/framework-comparison/report.mjs
```

`prepare.mjs` owns and overwrites these test directories. Do not point it at an application you want to keep. `run.mjs` clears each generated fixture's build output before each run. It records failures and continues so a failed Preact build cannot omit the React or Redact control. `report.mjs` requires all 78 framework results, matching configuration hashes between development and production, and passing native controls. Check the generated matrix for runtime failures, not just the report command's exit code.

Filter with `MATRIX_CASES`, `MATRIX_RUNTIMES`, and `MATRIX_MODES`. `MATRIX_PORT` chooses the starting port; `MATRIX_OUT` chooses an output directory for repeat experiments. Concurrent runs must use separate fixture directories and ports. Turbopack fixtures have their own directories because Next build output cannot be shared with a concurrent Webpack run.

## What is tested

- Production builds and local development startup.
- Expected server HTML for SSR frameworks, followed by browser hydration.
- Identity of the original server-rendered button after hydration.
- Actual browser runtime using the element shape, preventing an alias that leaves native React in place from passing.
- Stateful clicks, client navigation without document reload, and browser history.
- Start's server function and React Router framework mode's loader and form action.
- A separate core fixture checks context, refs, keyed identity, portals, cleanup, string SSR, hydration, external stores, lazy loading, and `react-is` compatibility. Adapted from Redact's React 18 consumer fixture at upstream commit 6a6bea7cf2a39ea9609b0c13667c9890e0594e57. An asynchronous cleanup checkpoint accommodates normal effect timing differences.
- A separate behavior fixture checks pending transitions, retained deferred results, action-state execution, and API availability. React 19 APIs that are absent from React 18 are not requirements for React 18 comparisons.

## Configuration

Vite uses each runtime's standard plugin: `@preact/preset-vite` or `@tanstack/redact/vite`. Start bundles the `@tanstack/*` server packages so external Node imports do not bypass the selected runtime. React Router bundles `react-router` for the same reason and uses its own React transform rather than adding a duplicate refresh transform.

Next keeps native React on the server. Preact's Webpack fixture replaces React browser requests, including Next's compiled React copies, using Webpack's module replacement API. A top-level alias alone left native React in App Router and was rejected by the identity check. Turbopack uses browser-conditional `resolveAlias`; those mappings did not replace native React in the checked release. Redact uses its published `withRedact` integration.

Vinext keeps native React for SSR and Flight. Preact uses browser-only aliases to its ESM exports. Redact uses its published Vinext adapter. No missing React API is stubbed and no framework behavior is patched out to obtain a pass.

These are finite Chromium fixtures. They do not cover every dependency, browser, hosting adapter, framework release, route feature, or interaction. React Router's optional RSC mode is not the same as its standard SSR framework mode and is not tested here.

## Three-way performance table

After installing the locked dependencies above:

```sh
node scripts/framework-comparison/performance.mjs
PERFORMANCE_OUT=benchmarks/results/framework-comparison/performance-repeat.json node scripts/framework-comparison/performance.mjs
node scripts/framework-comparison/performance-report.mjs
```

This generates `docs/comparison.md`. Both runs use published packages, not the local working tree. Five common synchronous list workloads get equal weight in a geometric mean speed score, React = 100. Seven fresh Chromium blocks rotate runtime order, with 20 warmup operations and 200 measured operations per workload. Correctness assertions happen outside timing. Gzip sizes include the same benchmark and checks. The saved first run predates additional warmup identity checks, which explains its slightly smaller bundle. The report uses repeat-run size and timings and shows both scores.

## Official Preact Next adapter follow-up

The four additional results in `benchmarks/results/framework-comparison/official-preact` are separate from the 78-case matrix. Install `dependencies/official-preact` into `$MATRIX_ROOT/official-preact`, run `prepare-official-preact.mjs`, then:

```sh
MATRIX_TOOLS_ROOT=/tmp/redact-framework-matrix MATRIX_ROOT=/tmp/redact-framework-matrix/official-preact MATRIX_CASES=next-pages,next-app MATRIX_RUNTIMES=preact MATRIX_OUT=benchmarks/results/framework-comparison/official-preact node scripts/framework-comparison/run.mjs
```

All four failed. Unlike the browser-only Pages integration, this plugin replaces server React too. Pages lacks `renderToReadableStream`; App production fails on missing `cache`. Exact errors are retained in the logs.

## Published hydration fix

The baseline lockfiles and performance runs remain pinned to Redact 0.2.1. The generated matrix substitutes four published-package React Router runs from October 28 for the React and Redact framework SSR row. See [0.2.3 provenance and reproduction](../../benchmarks/results/framework-comparison/release-0.2.3/README.md). Run `report.mjs` before `performance-report.mjs` to regenerate the matrix and summary. Do not relabel the historical timing or size results as 0.2.3.
