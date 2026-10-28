---
id: next
title: Next.js
---

Use `withRedact` to run Redact in the browser while Next.js keeps React for server rendering and Server Components.

```js
// next.config.mjs
import { withRedact } from '@tanstack/redact/next'

export default withRedact({
  // Your existing Next.js options
})
```

Keep `react` and `react-dom` installed. Keep importing from `react`, `react-dom`, and Next.js as usual. Do not set `jsxImportSource` to Redact in a Next.js app, the server still needs React's JSX runtime.

The adapter accepts stable Next.js 15.5 and 16.0 through 16.4 releases. It rejects prereleases and untested minor versions. The release matrix pins 15.5.28, 16.0.11, 16.1.7, 16.2.12, 16.3.8, and 16.4.3. It uses the full Redact runtime, so Vite feature presets do not apply.

The stable release requires the complete matrix to pass. [Current release evidence](https://github.com/TanStack/redact/blob/main/benchmarks/NEXT_COVERAGE.md). The adapter now includes a development cache correction for Next 16.2, so that fix does not require a separate Next release.

## Bundlers

The wrapper configures both Turbopack and Webpack. Use the normal `next dev` and `next build` commands for Turbopack, or add `--webpack` for Webpack.

Webpack replaces browser imports through `NormalModuleReplacementPlugin`. Turbopack's built-in App Router React aliases override user aliases, so the integration uses browser-only loader rules on the resolved React entry files. Neither path rewrites server imports or replaces the Flight implementation.

On Next 16.2, a browser development loader corrects debug-channel cache detection. A zero transfer size only indicates a cached response once decoded body bytes exist. This preserves debug-channel replay while preventing an unfinished Firefox stream from triggering a reload. The correction is scoped to that module and version, leaves installed Next files intact, and does not run in production.

Existing Next.js options, Webpack configuration callbacks, and unrelated Turbopack rules are preserved. Custom transforms of React's own entry files can conflict with this integration.

## Coverage

`pnpm test:next` tests the packed package in 162 configurations. Next 16 runs with Cache Components both enabled and disabled. All six pinned releases run in Chromium, Firefox, and WebKit with Turbopack and Webpack, in development and production. Next 15.5.28 and 16.4.3 also run standalone and static-export builds with a base path and trailing slashes. [Results and reproduction details](https://github.com/TanStack/redact/blob/main/benchmarks/NEXT_COVERAGE.md).

Every run records the packed package, fixture, and suite fingerprints, browser versions, and each scenario result. Missing configurations, mixed packages, and incomplete scenarios fail the combined report. Both PR checks and release publication require that report to pass.

The gate covers:

- App Router and Pages Router rendering and navigation.
- Server DOM adoption, with identity checks for buttons and inputs.
- React-compatible `useId` values across nested arrays, empty slots, Suspense, multiple IDs per component, and deep trees.
- Client state, effects, metadata updates, and browser back navigation.
- Direct Server Action calls and forms using `useActionState`.
- Pending form status, optimistic updates, and successful form resets.
- Submission before JavaScript loads, followed by hydration of the returned state and another client submission.
- Streamed Suspense content and interactive revealed components.
- Promises passed from Server Components and read with `use()`, hydrated without replacing the server DOM.
- Cache Components with partial prerendering and request-time content.
- Fast Refresh that preserves state through a source edit and its reversal in both development bundlers.
- Params, queries, push, replace, back, forward, refresh, retained layouts, redirects, rewrites, and not-found boundaries.
- Loading boundaries and cancellation of pending server renders, including a later completion of the abandoned render.
- Parallel and intercepting routes, including modal navigation followed by a hard load.
- Cache invalidation, HTTP-only cookies, bound actions, uploads, FormData, submitter overrides, and action redirects.
- Dynamic imports, Image, Script, CSS, context through portals, Pages SSR, static props, and shallow routing.
- Render and action error boundaries with reset.
- Assertions that Redact runs in the browser while server React stays native.

Unit tests also cover queued and overlapping actions, action scopes shared across renderer copies, rejection, optimistic rebasing, controlled form resets, submitter overrides, canceled submissions, pending boundary removal and updates, nested stream markers, hydration retries, and Flight resource hints. A separate gate runs 61 Redact regressions in each browser engine, covering actions, suspended transitions and deferred updates, uncontrolled selects, nested transitions inside `flushSync`, input events, lazy wrappers, promised children, pending roots, and document-shell recovery.

The built full-client runtime total measures 27,921 bytes gzip against its pre-integration limit of 28,183. The default Vite total measures 23,304 against 23,335. All 38 source/dist size gates pass with Node 24.22.0 from `.nvmrc`. These totals measure the runtime, not a whole Next.js application. [Measurements](https://github.com/TanStack/redact/blob/main/benchmarks/results/framework-release-sizes.json).

## Scope

The adapter depends on Next's compiled React entry points and React's HTML/Flight protocols. Those can change between releases. The matrix covers the listed releases and deployment modes, it does not establish compatibility with untested releases or deployment adapters. Known framework/browser failures remain failures in the gate and are recorded alongside native React controls in the coverage report.

Async actions have pending state, queued results, and optimistic rollback. Hidden Activity trees can suspend without holding a visible route transition open. Suspended transitions retain committed content, and `useDeferredValue` retains stale results. Each rendering pass remains synchronous, without React's time slicing or interruptible component renders.

Next.js continues to own server rendering, Server Components, action transport, and cache behavior. Redact handles the browser renderer. The gate does not replace application-specific tests for authentication, cache invalidation, or deployment behavior.

## Run the example

From this repository:

```sh
pnpm install
pnpm build
pnpm example:next
```

Install the browser engines and run the complete gate:

```sh
pnpm exec playwright install chromium firefox webkit
pnpm test:next
```

The local gate uses isolated packed fixtures and runs modes sequentially within each fixture. PR CI runs 44 server jobs and ten deployment jobs, each with all three browser engines, followed by a combined completeness check. For a single development run against the example, use `pnpm test:next:dev`. Individual modes are available through `node scripts/test-next.mjs`, with `--webpack`, `--production`, and `--standalone`. `NEXT_TEST_DIR` selects an isolated fixture and `NEXT_TEST_BROWSERS` selects diagnostic browsers. Partial runs do not satisfy the complete matrix report.
