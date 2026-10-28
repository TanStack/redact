---
title: Framework Compatibility Matrix
---

Can you replace React with Preact compat or Redact? It depends on the framework, its version, and the features your app uses. We tested the same small applications with native React, Preact **11.1.0**, and Redact **0.2.1** on **October 27, 2026**. On **October 28**, we reran React Router framework SSR with published **Redact 0.2.3** and native React in both modes. Only that row uses 0.2.3; the other rows remain the original versioned results.

**✅ means the fixture passed in development and production. ❌ means at least one required check failed in the tested setup.** An X does not prove that a custom integration is impossible. In particular, the Preact Turbopack rows fail because native React still loads, not because we verified a working Preact replacement and then found an application bug.

All native React controls passed. SSR fixtures check server HTML, preservation of the original DOM during hydration, stateful clicks, navigation without reloading, and browser history. Start also checks a server function; React Router framework mode checks a server loader and form action. Vite rows cover basic client rendering and state updates, not every React API.

| Fixture | React control | Preact 11.1.0 | Redact 0.2.1; SSR row 0.2.3 |
|---|---|---|---|
| Vite 8.3.5 + React 18.3.1 | ✅ | ✅ | ✅ |
| Vite 8.3.5 + React 19.3.1 | ✅ | ✅ | ✅ |
| React Router 8.5.0, data mode + React 19.3.1 | ✅ | ❌ | ✅ |
| React Router 8.5.0, framework SSR + React 19.3.1 | ✅ | ❌ | ✅ |
| TanStack Start 1.169.4 + React 18.3.1 | ✅ | ❌ | ✅ |
| TanStack Start 1.169.4 + React 19.3.1 | ✅ | ❌ | ✅ |
| Next 16.4.3 Pages + React 18.3.1, Webpack | ✅ | ✅ | ✅ |
| Next 16.4.3 Pages + React 19.3.1, Webpack | ✅ | ✅ | ✅ |
| Next 16.4.3 App Router, Webpack | ✅ | ❌ | ✅ |
| Vinext 1.3.0 App Router + React 19.3.1 | ✅ | ❌ | ✅ |
| Next 16.4.3 Pages + React 18.3.1, Turbopack | ✅ | ❌ | ✅ |
| Next 16.4.3 Pages + React 19.3.1, Turbopack | ✅ | ❌ | ✅ |
| Next 16.4.3 App Router, Turbopack | ✅ | ❌ | ✅ |

The separate official `next-plugin-preact` 3.0.7 setup, including its recommended React package aliases, also failed all four Next Pages/App development and production checks. Pages hit a missing `renderToReadableStream`; App production hit a missing `cache`. The passing Pages rows above use browser-only replacement with native React on the server.

## Where the failures happen

**React Router 8.5.0 with Preact:** the framework imports `useOptimistic` internally. Preact compat does not export it, so both the data-mode and framework-mode fixtures fail before interaction. Your own components do not have to use that hook to hit the failure.

**React Router framework mode with Redact:** 0.2.3 passes development and production, including preservation of the server-rendered button, state updates, server form actions, and navigation. Version 0.2.1 replaced the button during production hydration because it did not adopt module-preload links left in the body. That fix is now published. [0.2.3 production result](https://github.com/TanStack/redact/blob/6a2ca15ed0c9453aebf013645381b334fe0fa13d/benchmarks/results/framework-comparison/release-0.2.3/router-framework-redact-production.json), [native React control](https://github.com/TanStack/redact/blob/6a2ca15ed0c9453aebf013645381b334fe0fa13d/benchmarks/results/framework-comparison/release-0.2.3/router-framework-react-production.json).

**TanStack Start with Preact:** the standard Preact Vite preset does not provide the React Refresh runtime Start expects in development. Production builds and sends server HTML, but a pending Promise escapes during client startup and the counter never becomes interactive. This happened in both the React 18 and React 19 fixtures. A custom framework integration was not built to bypass these failures.

**Next App Router with Preact and Webpack:** server HTML arrives, but the browser replacement fails to complete hydration. Development reports an error in Next's link-observer setup; production does not reach an interactive counter. Next Pages with Webpack passes, which is why “Next.js support” needs more than one row.

**Next with Preact and Turbopack:** the tested browser aliases leave native React running. The page appearing to work is not a Preact pass. Redact's dedicated adapter passes the runtime identity check and the application checks.

**Vinext App Router with Preact:** browser-only aliases preserve native React on the server, but client hydration raises a pending Promise and does not become interactive. Native React and Redact pass the same fixture.

[Exact errors, repeat runs, configurations, and raw results](https://github.com/TanStack/redact/blob/6a2ca15ed0c9453aebf013645381b334fe0fa13d/benchmarks/FRAMEWORK_COMPARISON.md).

## A working Vite app does not establish React behavior parity

A separate fixture suspends a transition and a search result. These results hold for both React 18.3.1 and React 19.3.1 in development and production:

| Behavior while new content is suspended | React | Preact compat | Redact |
|---|---|---|---|
| Transition reports pending | ✅ | ❌ | ✅ |
| Transition keeps previous content visible | ✅ | ❌ | ✅ |
| Deferred query keeps previous results visible | ✅ | ❌ | ✅ |

Preact's transition renders the loading fallback and reports pending as `false`. Its deferred-value hook immediately supplies the new value, so the old search results disappear into the loading fallback. React and Redact retain the previous results until the new content is ready.

With React 19, we also executed `useActionState`: React and Redact tracked pending work and committed the result. Preact does not export the hook. These are behavioral checks, separate from simply checking whether an API name exists. [Behavior results](https://github.com/TanStack/redact/blob/6a2ca15ed0c9453aebf013645381b334fe0fa13d/benchmarks/results/framework-comparison/modern.json).

The deeper core fixture also checks context, refs, keyed identity, portals, effects, string SSR, hydration, external stores, and lazy loading. Preact matched those rendering checks, but differed from React in some `react-is` element and context detection checks. That can matter for libraries that inspect React element types. [Core results](https://github.com/TanStack/redact/blob/6a2ca15ed0c9453aebf013645381b334fe0fa13d/benchmarks/results/framework-comparison/core.json).

## What this table does not cover

The baseline covers **78 configurations in Chromium 156 on macOS with Node 24.15.0**. The four React Router follow-up runs use Node 24.22.0 and the same Chromium version. These are small fixtures, not every feature in each framework. They do not establish Firefox or Safari support, hosted deployments, arbitrary component libraries, Fast Refresh state preservation, every streaming and Server Action case, or other framework releases. React Router's optional RSC mode was not tested. No speed or memory ranking follows from these results.

React Router 8.5.0 requires React >=19.2.7, and Vinext 1.3.0 requires React ^19.3.1. Their React 18 combinations are outside their declared support ranges. Next App Router uses its own React build, so we do not label it a React 18 application just because React 18 can be installed for Pages Router.

Next and Vinext retain native React on the server in these replacement tests. Start and React Router use their normal SSR paths with server dependencies bundled to apply the runtime aliases consistently. No missing API was stubbed to make an application pass.

Use these results to narrow your choices, then test your actual app. Preact works in some modern React setups. Redact passes more of these particular framework and behavior checks. Neither is a universal React replacement.

[Reproduce the matrix](https://github.com/TanStack/redact/blob/6a2ca15ed0c9453aebf013645381b334fe0fa13d/scripts/framework-comparison/README.md), [broader API and size comparison](./preact.md), [Redact compatibility limits](./compatibility.md).
