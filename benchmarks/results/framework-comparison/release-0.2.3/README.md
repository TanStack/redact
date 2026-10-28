# Published 0.2.3 hydration follow-up

On October 28, 2026, React Router 8.5.0 framework SSR passed with native React 19.3.1 and published Redact 0.2.3 in development and production. Each run checked server HTML, original button identity during hydration, runtime identity, state, a server form action, navigation/history, and uncaught browser errors. Node 24.22.0 and Chromium 156.0.8078.4 on macOS.

The fixture and its Vite config are unchanged from the baseline. Dependencies come from the baseline locked installation, with only Redact replaced by the published npm tarball. No local Redact source is used. The package provenance is in `package.json`; the config SHA-256 in each result matches the baseline. Original 0.2.1 failures remain in the parent directory.

To reproduce in a separate baseline dependency installation, follow `scripts/framework-comparison/README.md`, then install `@tanstack/redact@0.2.3` in that installation, retaining the other locked versions. Run:

```sh
MATRIX_ROOT=/tmp/redact-framework-shipped MATRIX_CASES=router-framework MATRIX_RUNTIMES=react,redact MATRIX_OUT=benchmarks/results/framework-comparison/release-0.2.3 node scripts/framework-comparison/run.mjs
node scripts/framework-comparison/report.mjs
node scripts/framework-comparison/performance-report.mjs
```

The generated table selects these four records in place of the baseline React Router React/Redact records. The other 74 records and all performance measurements remain their original versioned snapshots. This does not establish a fresh full-matrix or performance run for 0.2.3.
