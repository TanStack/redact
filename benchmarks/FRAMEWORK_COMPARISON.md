# React, Preact compat, and Redact framework checks

Baseline recorded October 27, 2026. React Router follow-up recorded October 28, 2026. This is a compatibility study, not a speed benchmark.

**Baseline: 78 framework configurations ran: 26 per runtime. All 26 native React controls passed. Preact passed 8; Redact passed 25.** These counts describe the selected fixtures, not percentages of framework compatibility. A separate 12-run core comparison and 12-run behavior comparison cover both React versions in development and production.

**Published fix:** Four additional React Router framework runs (React and Redact 0.2.3, development and production) all pass, including original DOM identity. The generated matrix selects these four records and retains the other baseline results, giving React 26, Preact 8, and Redact 26 passing configurations. This is a mixed-version evidence table, not a full 0.2.3 rerun. See [follow-up provenance and reproduction](./results/framework-comparison/release-0.2.3/README.md).

[Public comparison](../docs/framework-comparison.md), [generated table](./results/framework-comparison/matrix.md), [complete framework results](./results/framework-comparison/matrix.json), [core results](./results/framework-comparison/core.json), [behavior results](./results/framework-comparison/modern.json), [versions](./results/framework-comparison/versions.json), [reproduction instructions and fixtures](../scripts/framework-comparison/README.md).

## Version scope

- React 18.3.1 and React 19.3.1, with separate installed dependency trees. Next App Router uses its own bundled React build, observed as `19.3.0-canary-278794d7-20261002` in the development control.
- Preact 11.1.0, `preact-render-to-string` 6.8.2, and `@preact/preset-vite` 2.10.6.
- Published `@tanstack/redact` 0.2.1, using the Vite, Next, or Vinext adapter as appropriate.
- Vite 8.3.5, React plugin 6.1.2, TanStack Start 1.169.4, TanStack Router 1.170.46, React Router 8.5.0, Next 16.4.3, Vinext 1.3.0, and RSC plugin 0.5.38.
- Node 24.15.0, macOS, headless Playwright Chromium 156.0.8078.4. No Firefox, Safari, Workers, hosted deployment, or additional framework-release runs are claimed here.

React Router 8.5.0 requires React >=19.2.7. Vinext 1.3.0 requires React ^19.3.1. Their React 18 combinations are outside the declared support ranges, not Redact or Preact failures. Start and Next Pages were tested with both React 18 and React 19. Next App Router's internally selected React build is not labeled a React 18 test merely because the app could install React 18.

The older Next and Vinext coverage reports contain broader tests of Redact. Those are separate experiments, not Preact results, and were not added to this study's pass count.

## What a pass requires

Both development and production must pass. Production must build. SSR fixtures must return the expected HTML and preserve the original server-rendered button when hydration completes. The browser must use the requested runtime. Clicks must update state. Routing fixtures must navigate without a document reload and handle browser history. Start must execute its server function. React Router framework mode must execute its server loader and form action. Uncaught browser errors fail the run.

The fixture configuration hash is recorded for each run. The report rejects missing records, mismatched development/production configuration hashes, and failed native controls. A thrown error does not stop later runtime configurations from running.

## Findings and failure evidence

### Plain Vite: baseline apps work, behavioral parity is separate

All runtimes passed the small Vite fixtures under React 18 and React 19. In the deeper core checks, Preact also matched DOM state updates, keyed identity, refs, portals, hydration node adoption, external-store updates and eventual cleanup, and lazy loading. It differed in `react-is` protocol checks: context provider/consumer detection under React 18, and element/JSX/clone as well as context detection under React 19. The tests retain the app's installed `react-is`, not a replacement implementation.

Do not turn those results into “Preact cannot run React 19 apps.” The basic apps passed. Conversely, do not turn a working counter into full React compatibility.

The behavior fixture deliberately suspends a transition and a deferred search result. React and Redact display `true0` while the transition is pending, then `false1`. Preact displays `falseLoading`, then `false1`. For the deferred query, React and Redact display `beta:alpha` while loading, then `beta:beta`; Preact displays `beta:Loading`, then `beta:beta`. These are visible behavior differences.

`useActionState` executed and tracked pending state in React 19 and Redact. Preact lacks that export. Availability checks also found no `useOptimistic`, `Activity`, or `ViewTransition` in Preact. Availability is not a behavior test for those latter APIs. React 18 is not required to export newer React 19 APIs.

### React Router 8.5.0: Preact fails before application interaction

Both data mode and framework SSR import `useOptimistic` from React internally. Preact compat does not export it. The optimizer/build reports a missing export from `react-router/dist/development/lib/components.js`; production has the equivalent error. Even the basic application cannot start. This is a framework dependency, not an application component deliberately importing an unsupported hook.

[Data-mode development log](./results/framework-comparison/router-data-preact-development.log), [production log](./results/framework-comparison/router-data-preact-production.log), [framework development log](./results/framework-comparison/router-framework-preact-development.log), [framework production log](./results/framework-comparison/router-framework-preact-production.log).

Redact passes data mode and development framework mode. Production framework mode builds, renders, updates state, submits the server action, and navigates, but **replaces the original server button during hydration**. The old node is disconnected; the replacement has the same visible text. No uncaught browser error announces that replacement. The stricter gate fails. The React control preserves the node. A separate repeat reproduced both outcomes.

[Redact production result](./results/framework-comparison/router-framework-redact-production.json), [independent repeat](./results/framework-comparison/repeat/router-framework-redact-production.json), [React repeat control](./results/framework-comparison/repeat/router-framework-react-production.json). This records the historical 0.2.1 failure. The published 0.2.3 follow-up below supersedes this row.

### TanStack Start: Preact does not complete the tested client startup

React and Redact pass the React 18 and React 19 fixtures in both modes, including server DOM adoption, a server function, and navigation.

With Preact's Vite preset, development serves HTML but fails to load the client startup modules: Start requires `/@react-refresh`, which the Preact preset does not supply. Production builds and serves HTML, but an uncaught pending Promise is observed and hydration does not become interactive. The server-rendered counter remains at zero.

[React 19 development log](./results/framework-comparison/start-preact-development.log), [production browser result](./results/framework-comparison/start-preact-production.json), [React 18 production result](./results/framework-comparison/start18-preact-production.json).

The fixture bundles TanStack server packages so external Node imports cannot silently keep using native React. An earlier global `ssr.noExternal: true` experiment exposed a CommonJS shim loading issue and was replaced with targeted TanStack package bundling. No framework code or missing React behavior was patched. These failures establish that the tested preset integration is not a drop-in success. They do not prove a custom Start client entry or future integration could never work.

### Next Pages with Webpack: Preact works in the tested scope

All three runtimes pass with React 18 and React 19: `getServerSideProps`, server DOM adoption, stateful clicks, client navigation, and history. Server rendering stays on native React. The Preact browser replacement is verified using its vnode shape. This is a real positive result, not native React accidentally passing under a Preact label.

[React 19 Preact development](./results/framework-comparison/next-pages-preact-development.json), [production](./results/framework-comparison/next-pages-preact-production.json), [React 18 production](./results/framework-comparison/next-pages18-preact-production.json).

### Next App Router with Webpack: the Preact replacement fails startup

Native React and Redact pass the same App Router fixture in development and production. Preact returns server HTML but does not finish hydration. Development reports a `MutationObserver.observe` error from Next's `app-link-gc.js` during `app-index.js` hydration. Production never reaches the effect that marks the counter interactive.

[Development result and stack](./results/framework-comparison/next-app-preact-development.json), [production result](./results/framework-comparison/next-app-preact-production.json).

Top-level React aliases alone originally left Next's bundled React in use. That result was rejected. The final Webpack fixture uses browser-only module replacement for both ordinary and Next-compiled React requests, with native server React retained. This is configuration, not a replacement Flight implementation.

### Next Turbopack: ordinary Preact aliases do not establish a replacement

React and Redact pass all three tested Turbopack combinations. Preact's browser-conditional `resolveAlias` configuration leaves native React in the browser for both Pages and App Router. The runtime identity check fails in development and production. A functioning page in this setup is **not evidence of functioning Preact**.

[Pages React 19 identity](./results/framework-comparison/next-pages-preact-development-turbopack.json), [Pages React 18 identity](./results/framework-comparison/next-pages18-preact-development-turbopack.json), [App Router identity](./results/framework-comparison/next-app-preact-development-turbopack.json).

The table reports this setup as a failed replacement. It does not claim to have run and disproved every possible Preact Turbopack adapter. Redact's dedicated integration does more than ordinary aliases.

### Vinext App Router: Preact does not finish hydration

Native React and Redact pass development and production. Browser-only Preact aliases use ESM exports and keep SSR and Flight native. Both Preact runs serve HTML but raise an uncaught pending Promise and never make the counter interactive.

[Development result](./results/framework-comparison/vinext-preact-development.json), [production result](./results/framework-comparison/vinext-preact-production.json). An initial CommonJS-path alias was corrected before these final runs; that setup error is not the claimed compatibility failure.

## Limits on the conclusion

These results support a versioned table of tested setups. They do not support “Preact cannot run modern React apps,” “Redact supports every framework feature,” or “there is no possible custom integration.” They also do not establish runtime speed, memory use, arbitrary third-party library support, HMR preservation, production deployment support, or complete streaming/Server Action coverage.

Next App Router's fixture covers RSC page output, client hydration, and navigation, not an exhaustive Server Actions or caching matrix. React Router's separate RSC mode is untested. A single checkmark must remain attached to this scope and these versions.
