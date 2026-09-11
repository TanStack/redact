# Redact 0.1.0 release validation

Validated September 11, 2026 after merging the published 0.0.21 hydration-recovery fix into the expanded synchronous runtime.

`pnpm test:ci` passed 1,569 tests with 91 skips, TypeScript checks, native ESM and NodeNext declaration checks, source/dist consumer checks, and all 19 size budgets for both source and built output. The benchmark statistics suite passed its three tests.

`pnpm exec vitest run --config scripts/parity-final-core-browser.config.mjs` passed 327 cases in Chrome 152, with the same three Node-only stream exclusions. The five hydration-recovery lifecycle cases were added as Redact contract checks, not new React comparison claims. The first browser attempt could not import `react-dom/test-utils`; adding that missing test alias fixed the harness without changing the assertions.

The README's 34 numeric rows and 23 local links were checked against the saved measurements. All eight tables fit its 390px mobile preview.

The only runtime change after the [frozen benchmark snapshot](./SHIP_RESULTS.md) is retiring the abandoned root before hydration recovery. Without it, the published regression for committed subscriptions and portals failed. With it, all five published regressions passed in jsdom and Chrome. The newer commit-phase implementation already prevents abandoned effects, refs, and class lifecycles from mounting, so the older lifecycle implementation was not reintroduced.

The [release size record](./results/release-0.1.0-sizes.json) includes source and dist file hashes. Default combined client size is 23,311 gzip bytes, one byte above the frozen benchmark. Performance timings remain those of the frozen snapshot, not a new timing run of the release.

The [earlier full parity gate](./SHIP_CHROME_FINAL.md) and [site controls](./SHIP_SITE_INTEGRATION.md) remain historical evidence with their original inputs and limitations. Published-package site verification is recorded separately after publication.
