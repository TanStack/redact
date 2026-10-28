# React and Redact client bundles

Measured October 25, 2026 with the same counter component, controlled input, and CSS in four single-route apps. Each pair changes only the renderer integration. The landing page uses these measurements, with one shared scale for all eight bars.

| Framework      |    React | Redact default | Unused features disabled | Saved by default |
| -------------- | -------: | -------------: | -----------------------: | ---------------: |
| TanStack Start | 109.3 KB |        62.3 KB |                  59.8 KB |   47.0 KB, 43.0% |
| Vite           |  68.3 KB |        20.1 KB |                  12.6 KB |   48.1 KB, 70.5% |
| Vinext         | 138.1 KB |        98.8 KB |            Not available |   39.3 KB, 28.5% |
| Next.js        | 175.6 KB |       139.9 KB |            Not available |   35.7 KB, 20.4% |

These are starter app measurements. A larger app has its own routes, dependencies, and chunk layout, so its percentage will differ. The separate [Vinext benchmark](https://github.com/TanStack/redact/blob/main/benchmarks/VINEXT_BENCHMARKS.md) measures a larger workload over six rounds and saves 39.4 KB, or 25.4%.

## What the numbers include

Each file is compressed separately with Node's default `gzipSync`, then the sizes are added. We count all emitted client JavaScript and CSS, including lazy chunks and framework polyfills. KB means 1,000 bytes. These totals are not the download for a single navigation. HTML, inline scripts and Flight payloads, images, source maps, and server output are excluded.

Start and Vite use Redact's Vite integration. Start sets `ssr.noExternal: true` in all three builds. This lets Vite transform React imports inside server dependencies as well as application code. Without it, Node can load an external dependency with native React alongside application code using Redact. Vinext uses the maintained integration in both modes, with `renderer: 'react'` or `renderer: 'redact'`, so both builds receive the same platform corrections. Next.js uses `withRedact` with Turbopack. Vinext and Next.js keep native React on the server and use the full Redact runtime, without feature presets. The React and default Redact pairs use default settings. Application code, dependencies, and minifier settings stay the same in every variant.

This is one clean production build per variant, measuring bytes rather than speed. All ten builds were opened in the browser and checked for client startup, a counter update, a controlled input update, and the expected renderer. All seven Start, Vinext, and Next.js variants were also checked for server-rendered content before JavaScript ran. See [browser checks](./browser-checks.json) and [server checks](./server-checks.json).

## Optional features

The lighter green segment shows the bytes removed by disabling features this demo does not use. The lower endpoints are specific to this app. The headline savings compare the default Redact build with React.

Start disables Activity, Fragment refs, and portals. Hydration, context, Suspense, memoization, forwarded refs, lazy components, and class components, including error boundaries, stay enabled:

```ts
redact({
  features: { activity: false, fragmentRefs: false, portal: false },
})
```

The client-rendered Vite counter needs none of the optional features, so its smaller build uses:

```ts
redact({ preset: 'nano' })
```

Keep the features your application and dependencies use. Both configurations are recorded in `results.json` and reproduced by `measure.mjs`. Bar labels round up to whole KB; bar lengths use exact bytes.

## Versions and source

- React and React DOM 19.3.1 in every app.
- TanStack Start 1.168.60 and Router 1.170.41.
- Vite 8.3.5, React plugin 6.1.2, and RSC plugin 0.5.38.
- Vinext 1.3.0 and Next.js 16.4.3.
- Node 24.22.0, macOS arm64.
- Published [@tanstack/redact 0.2.0](https://www.npmjs.com/package/@tanstack/redact/v/0.2.0), installed from npm with the exact version pinned. Tarball SHA-256: `f96146af80a5c1e0a0e66ef9b981311b7c23e63c9fb25f40ca823084a351f23c`.

[Published package checks](./published-package-checks.json) verify npm's tarball integrity, all exports, and byte-for-byte agreement of 451 source, built, and vendor files with the measured release candidate. Those same files were used for the separate six-round Vinext benchmark. All other dependency versions and integrity hashes are unchanged.

[Raw results](./results.json) include every emitted file's size and SHA-256, package versions, component and CSS hashes, and the dependency lockfile hash. The [Redact landing page](https://tanstack.com/redact/latest#bundle-sizes) uses the exact byte totals to calculate KB, percentages, and bar lengths.

## Reproduce

This fixture is independent of the Redact workspace and pins the published package. Its npm lockfile belongs to the fixture only.

Use a new directory and copy this folder's `package.json` and `package-lock.json` into it. Then run with Node 24.22.0:

```sh
npm ci --no-audit --no-fund
npm pack @tanstack/redact@0.2.0 --ignore-scripts
mv tanstack-redact-0.2.0.tgz redact.tgz
node /path/to/measure.mjs "$PWD"
node /path/to/serve.mjs "$PWD"
```

`measure.mjs` generates every fixture from source, builds React and default Redact for each framework, adds the smaller Start and Vite builds, records `results.json`, and preserves all ten builds. `serve.mjs` opens local production previews on ports 4380 through 4389, in the order Start, Vite, Vinext, and Next.js. Each framework serves React, default Redact, then its smaller build when available. The small Node HTTP bridge for Start and Vite is only a preview harness and is not part of the measured output.
