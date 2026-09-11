# Redact 0.1.0 publication and site verification

Verified September 11, 2026. [Machine-readable record](./results/release-0.1.0-sites.json).

## Published package

`@tanstack/redact@0.1.0` is available on npm, and `latest` points to it. Both sites' installed packages match all 83 source hashes and 249 built-file hashes in the [release size record](./results/release-0.1.0-sizes.json).

- [Changes PR #24](https://github.com/TanStack/redact/pull/24), merge `4225bb7d0d43269444d2f2b299eb400904235b65`.
- [Version PR #25](https://github.com/TanStack/redact/pull/25), merge `953c4c9b69ddfa8f2d27566191a251efdf8c5a95`.
- [Successful publish run](https://github.com/TanStack/redact/actions/runs/34640595555), using npm trusted publishing.
- [GitHub release](https://github.com/TanStack/redact/releases/tag/%40tanstack/redact%400.1.0).

The version PR's bot-triggered check needed GitHub workflow approval. It ran successfully after approval, before merge. No checks or branch protections were bypassed.

## tanstack.com

[Upgrade PR #1253](https://github.com/TanStack/tanstack.com/pull/1253) changes only `package.json` and `pnpm-lock.yaml`, from 0.0.21 to 0.1.0. Its head is `4f147de29cc4d76a5b65ba695ff14890244a5d23`, based on `f2f65d1e96ffb9c001af7d050f63f2c562ca4ef5`. The work uses an isolated worktree so concurrent Markdown and landing-page edits in the shared checkout remain untouched.

`pnpm test` passed content generation, TypeScript, lint, and 503 unit tests, with 2 skips. The production build passed. The local Chrome smoke passed all five Worker routes and six interaction groups: hydration/theme, navigation/history without reload, pagination, controlled search/reset, Radix portals/URL filters, and mobile navigation/overflow. Page and console errors were empty. The same build and smoke also passed on 0.0.21.

All seven PR checks are green. The [Cloudflare preview](https://e8ca00b4-tanstack-com.thetanstack.workers.dev) passed live checks for home rendering, theme changes, blog navigation, search/reset, and the Query topic menu, with no captured warnings or errors. The theme button's next-mode label differs from the actual system-dependent cycle on both the preview and current production, an existing site-label issue.

The required Website Maintainers review is still pending. The production site has not been upgraded through this PR.

## tannerlinsley.com

[Upgrade PR #23](https://github.com/tannerlinsley/tannerlinsley.com/pull/23) changes only `package.json` and `package-lock.json`, from 0.0.12 to 0.1.0. It merged as `fa7885506d0bb80ea164424e1219446be5426ca2`. The site's nano preset and six explicit feature overrides are unchanged.

Both versions passed the normal type check and production build, including all 10 prerender pages and sitemap generation. This corrects the earlier interpretation of the isolated harness failure. The harness still fails during prerender Worker startup, including with the normal Vite config loader, but the actual site's build succeeds. The isolated setup's underlying failure is not resolved.

`prepare-built` snapshots the normal build output without changing emitted code, checks its full file hash, and runs the existing Worker/browser assertions against that output. All eight route checks and four browser interaction groups passed, with no page or console errors. The strict mobile assertion remains enabled and fails: the header is 454px wide at a 390px viewport, matching the older Redact and React controls. The smoke command therefore exits 1; this is not reported as a fully green layout test.

The [production Cloudflare build](https://dash.cloudflare.com/144575f7380700ae3ca2076ac0168566/workers/services/view/tannerlinsley/production/builds/4b4d7975-5c55-4796-bf1b-a8f41eb6343e) succeeded for the exact merge commit, producing Worker version `78cfd6be-01b1-4042-bf66-4d54dbbf2a7a`. The live entry bundle changed from `index-CSJpmMx8.js` to `index-BT4HMfyi.js` after deployment.

All eight public production routes returned their expected status and content length, including RSS and the expected 404. Live browser checks passed Writing/post navigation, the post's canonical URL and single BlogPosting record, Talk/Podcast filters and browser history, all three theme modes, and About rendering. No captured warnings or errors. The live browser's viewport override did not apply, so the mobile measurements above are from local Chrome, not a production mobile-browser claim.

## Reproduction and limits

From the Redact repository, after installing the locked published dependency in each site:

```sh
SITE_SOURCE=/path/to/tanstack.com node scripts/verify-tanstack-site.mjs prepare-published
node scripts/verify-tanstack-site.mjs build /tmp/redact-tanstack-site-...
node scripts/verify-tanstack-site.mjs smoke /tmp/redact-tanstack-site-...
```

For Tanner, run `npm run typecheck` and `npm run build` in the site first, then:

```sh
node scripts/verify-tanner-site.mjs prepare-built
node scripts/verify-tanner-site.mjs worker-smoke /tmp/redact-tanner-site-...
```

Local smokes exclude env files and block external services, analytics, and remote images. Live checks use public pages only. Authentication, production writes, exhaustive browser compatibility, and site performance are outside this verification. The JSON retains commands, hashes, temporary artifact paths, and the remaining failures.
