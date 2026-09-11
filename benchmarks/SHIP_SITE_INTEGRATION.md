# Site integration gate

Scope correction from the [published 0.1.0 checks](./RELEASE_0_1_0_SITES.md): Tanner's normal production build passes and prerenders all 10 pages on both 0.0.12 and 0.1.0. The prerender startup failures recorded below are specific to the isolated harness, not the site's normal build. The original results and inputs are retained.

Completed 2026-09-11 UTC against the final explicit-import packaged build. TanStack passes. Tanner's runtime checks pass, with two failures also present in both controls: Vite prerender startup and mobile header overflow. [Commands, hashes, results, and artifact paths](./results/ship-site-integration.json).

| Site | Renderer | Production build | Worker SSR | Browser result |
|---|---|---|---|---|
| tanstack.com | Final packaged Redact 0.0.20 | Pass | 5/5 | Pass |
| tanstack.com | Published Redact 0.0.19 | Pass | 5/5 | Pass |
| tanstack.com | React 19.2.3 | Pass | 5/5 | Pass |
| tannerlinsley.com | Final packaged Redact 0.0.20 | Compiles, prerender fails | 8/8 | Interactions pass, overflow fails |
| tannerlinsley.com | Published Redact 0.0.12 | Compiles, prerender fails | 8/8 | Interactions pass, overflow fails |
| tannerlinsley.com | React 19.2.5 | Compiles, prerender fails | 8/8 | Interactions pass, overflow fails |

These six latest/control browser runs recorded zero page errors and zero console errors. The JSON also retains the two earlier current-build runs unchanged. React controls use each application's installed React version, not the separate pinned React 19.3 test fixture.

TanStack checks cover hydration, theme changes, navigation and history without document reload, blog pagination, controlled search and reset, a Radix portal menu, URL-backed filters, and mobile navigation. Tanner checks cover hydration, post navigation, canonical and structured data, appearance filters and history, theme changes, and About navigation.

## Remaining failures

Tanner's unchanged production build compiles both targets, then Vite's prerender adapter fails to start its Worker and returns HTTP 500 for `/`. Final Redact, published Redact, and React reproduce it. The emitted Worker starts through installed Miniflare with its complete ESModule/CompiledWasm module list, without removing imports or changing emitted code. This verifies local Worker rendering, not successful prerendering. The adapter's underlying startup error remains unresolved.

At a 390px viewport, Tanner's document, body, and header are each 454px wide on all three renderers. The strict assertion remains enabled, so `worker-smoke` exits 1. No app CSS was changed.

An earlier local Redact snapshot looped during TanStack hydration before any interaction, producing 16,058 loop-guard errors. Both controls passed. The same smoke passes after the callback-ref/state bailout fix and on the final snapshot. The ledger preserves the failed snapshot's hash and evidence.

## Snapshot and reproduction

Both final sites use Redact dist SHA-256 `f92b0ce0d529588d4fe7963a886b7ac9dd13073afb87d6d44e3d358eaf1dff50`, with Vite plugin SHA-256 `f0665834805725c71c6415e3d1a6a5409707e990082281487df8af1c09e12d3f`. This snapshot includes the NODE_ENV preservation fix, ShadowRoot script scope fence, explicit packaged import paths, and optional element-props type correction. The previous package's hashes and complete run records remain in the ledger.

From the Redact repository:

```sh
node scripts/verify-tanstack-site.mjs build /tmp/redact-tanstack-site-3CGilU
node scripts/verify-tanstack-site.mjs smoke /tmp/redact-tanstack-site-3CGilU
node scripts/verify-tanner-site.mjs build /tmp/redact-tanner-site-o4PN22
node scripts/verify-tanner-site.mjs worker-smoke /tmp/redact-tanner-site-o4PN22
```

Each harness's `prepare`, `prepare-published`, or `prepare-react` command creates a fresh isolated snapshot and prints its path. Tanner retains its nano preset and six explicit features. TanStack retains its default preset and existing aliases. Original app code and dependencies were not changed or installed. Final read-only Git checks show TanStack clean, and Tanner with no tracked changes plus one excluded, unread `.claude/settings.local.json` file.

The runs use Chrome 152, Node 24.15.0, temporary caches and outputs, existing dependency links, no env files, and blocked outbound services, analytics, and edge images. Authentication, production databases, external assets, Cloudflare edge behavior, other browsers, and application performance are outside this gate. Logs and screenshots are temporary; the JSON retains the results and hashes.
