---
title: Redact vs Preact
---

[Current three-way comparison: speed, capabilities, and size](./comparison.md).

Preact is the smaller choice. Redact is worth considering when you want to keep more of modern React's behavior, including pending transitions, deferred results, form actions, optimistic updates, and hidden state. That extra behavior costs bytes. Neither runtime provides React's interruptible concurrent rendering.

This comparison checks Preact **11.0.2**, including `preact/compat`, against Redact main at commit `6a6bea7`, version **0.2.0**, on **October 26, 2026**. It is not a claim about every Preact release or every published Redact version. The [research record](https://github.com/TanStack/redact/blob/6a2ca15ed0c9453aebf013645381b334fe0fa13d/benchmarks/PREACT_COMPARISON.md) includes sources, measurements, and checks.

For current framework results, see the [tested compatibility matrix](./framework-comparison.md). It checks Preact 11.1.0 and Redact 0.2.1, with a published 0.2.3 React Router SSR follow-up, across React 18, React 19, Vite, React Router, TanStack Start, Next.js, and Vinext. The API and size snapshot below uses the earlier pinned versions above.

## What are you replacing?

Preact has its own component runtime, hooks, tools, and ecosystem. For existing React code, `preact/compat` adds APIs and adjusts behavior. Comparing Redact with bare Preact would leave out the layer most React migrations actually need. Preact's Vite preset can configure React aliases, so keeping existing imports is not unique to Redact. [Preact setup](https://preactjs.com/guide/v11/getting-started/).

Redact implements React-shaped entrypoints directly. Its Vite plugin replaces React, DOM, JSX, server, and scheduler imports. The default preset includes optional behavior except native view-transition animation. Feature flags can remove behavior, but disabling a feature can change what your app does. [Setup](./quick-start.md), [feature flags](./feature-flags.md).

## Compatibility that changes what users see

These are implementation differences, not just matching export names. Preact entries below refer to 11.0.2 with compat enabled.

| Behavior | Redact, default Vite configuration | Preact 11.0.2 with compat |
|---|---|---|
| Components, hooks, context, memo, lazy, refs, error boundaries | Supported | Supported |
| `use`, `useEffectEvent`, `useId`, `useSyncExternalStore` | Implemented | Exported and implemented, not Redact-only features |
| `useTransition` | Tracks pending work and retains committed content while a transition suspends | Returns `false` for pending; its transition callback runs immediately |
| `useDeferredValue` | Can retain the previous value while the new result suspends | Returns the incoming value |
| `useActionState`, `useOptimistic`, `useFormStatus` | Action queues, pending form state, optimistic rebasing and rollback | Not exported by compat |
| `Activity` | Retains hidden DOM and state while disconnecting effects, refs, and subscriptions; insertion effects stay connected | Not exported by compat |
| Fragment refs | DOM instance with focus, geometry, event, observer, and visibility support | No React Fragment-instance API in the inspected implementation |
| `ViewTransition` | Boundary retains state; native animation requires an experimental opt-in | Not exported by compat |
| `useInsertionEffect` | Separate insertion-effect handling | Alias of `useLayoutEffect` |
| Legacy class lifecycles | No-ops | Legacy lifecycle support remains |
| Concurrent rendering | No time slicing or interruptible component renders | No React concurrent scheduler |

Preact evidence: pinned [compat exports](https://github.com/preactjs/preact/blob/11.0.2/compat/src/index.js), [compat hooks](https://github.com/preactjs/preact/blob/11.0.2/compat/src/hooks.js), [component diffing](https://github.com/preactjs/preact/blob/11.0.2/src/diff/index.js). Redact's [compatibility guide](./compatibility.md) covers limitations beyond this table.

For example, consider a search field whose results suspend while data loads. With Redact, `useDeferredValue(query)` can keep the previous results visible while the input shows the new query. Preact's implementation returns the new query immediately, so that hook does not retain the old results. You can build a different loading strategy in Preact, but the same React code does not provide the same behavior merely because the hook exists.

Redact still renders each pass synchronously. A long component render can block input. Retaining old content while data loads is different from interrupting expensive CPU work, and Redact does not promise the latter.

Redact also omits deprecated root APIs such as `ReactDOM.render`, `ReactDOM.hydrate`, `unmountComponentAtNode`, and public `findDOMNode`. Preact compat retains those exports. Older apps may therefore fit Preact better even when Redact covers more recent behavior. Redact's Vite plugin adapts React 18 element and context markers, with pinned checks across React 18 and 19 versions; that detection does not apply to direct imports or the Next.js adapter. [Pinned Redact compatibility](https://github.com/TanStack/redact/blob/6a6bea7cf2a39ea9609b0c13667c9890e0594e57/docs/compatibility.md).

## Bundle size

Measured with esbuild 0.28.0, production browser ESM, an ES2022 target, minification, and gzip. Each row bundles its entries together with all named exports retained. Server code, debug tools, and Signals are excluded.

| Runtime and entries | Gzip bytes |
|---|---:|
| Preact 11.0.2 core | 5,029 |
| Preact 11.0.2 core, hooks, and JSX | 7,026 |
| Preact 11.0.2 compat, JSX, and client | 11,179 |
| Redact React, JSX, DOM, and client, default Vite features | 23,315 |
| Redact same entries, native animation enabled | 27,912 |

The migration-oriented comparison is **11,179 vs 23,315 bytes**, about 12.1 kB more gzip for Redact in this fixture. This is the price of different runtime implementations and behavior, not proof that each feature accounts for a particular number of bytes.

These are runtime retention fixtures, not application downloads. Real apps tree-shake different APIs and have different chunk boundaries. The Preact measurements use the published package; Redact uses an archive of the pinned main commit. They do not replace the [published Redact release measurements](./performance.md). The rows use the same bundler settings but do not offer identical functionality.

Redact's `nano` preset removes features such as hydration, context, and normal Suspense fallback behavior. It is not a full-compatibility size comparison. Standalone entry sizes overlap and must not be added together. [Raw results and reproduction script](https://github.com/TanStack/redact/blob/6a2ca15ed0c9453aebf013645381b334fe0fa13d/benchmarks/PREACT_COMPARISON.md#bundle-size).

## Events and forms

Preact uses browser events and documents that events do not bubble through portals along the component tree. Compat maps common React conventions such as `onChange` and `onDoubleClick`; those differences in bare Preact are not reasons to reject compat. [Preact's documented differences](https://preactjs.com/guide/v11/differences-to-react/).

Redact also uses native events with compatibility additions, including `nativeEvent`. It has tests for controlled input restoration, focus/blur ordering, and form actions. That does not establish complete React SyntheticEvent parity or a portal-event advantage over Preact. Test the actual event behavior your component libraries depend on.

The stronger distinction is React's action model. Redact implements action queues, pending form status, optimistic rollback, and form resets. Those action hooks are absent from Preact 11.0.2's compat exports. A Preact app can still submit forms and manage async state, but it needs its own approach for those behaviors.

## Server rendering and hydration

Both offer server rendering and hydration. Preact's separate `preact-render-to-string` package supports strings, asynchronous string rendering, and readable and pipeable streams. It is incorrect to say that Preact has no streaming SSR. [Preact server rendering](https://preactjs.com/guide/v11/server-side-rendering/).

Preact 11 includes Hydration 2.0. Do not carry forward Preact 10's async hydration limitations as blanket claims about Preact 11. [Preact 11 upgrade guide](https://preactjs.com/guide/v11/upgrade-guide/).

Redact supports streaming boundaries, hydration recovery, and event replay, but does not implement the full Fizz prerender/resume APIs. Server Components and Flight stay on upstream React in the RSC environment. Redact is not an independent replacement for the React server stack. Its `cache` is a passthrough and its client cache-refresh hook is a no-op. [Full API limits](./compatibility.md).

Redact has dedicated [Next.js](./next.md) and [Vinext](./vinext.md) integrations and pinned coverage matrices. Those integrations are experimental, and their checks do not prove arbitrary version support. Preact's `createRoot` and `hydrateRoot` wrappers alone do not establish equivalent framework support. The follow-up [framework matrix](./framework-comparison.md) runs native React, Preact, and Redact against the same pinned fixtures, including separate Next Pages, App Router, Webpack, and Turbopack checks. Its checkmarks apply to that tested scope, not every framework feature.

## Development tools and ecosystem

Preact has its own DevTools and debug warnings, plus a Vite preset that wires them up. Redact supports Fast Refresh with `@vitejs/plugin-react` and connects to the official React DevTools backend in development, including inspection, edits, and commit profiling. Its adapter uses React's private protocol, so future backend changes need fresh checks. DevTools code is removed from production. [Redact DevTools evidence](https://github.com/TanStack/redact/blob/6a6bea7cf2a39ea9609b0c13667c9890e0594e57/docs/devtools-implementation-status.md). [Preact debugging](https://preactjs.com/guide/v11/debugging/).

Preact also offers Signals with direct reactive DOM updates. Redact follows React's hooks and rendering model and does not provide Preact's Signals integration. The separate React Signals adapter is not evidence of native Preact integration working unchanged in Redact. [Preact Signals](https://preactjs.com/guide/v11/signals/).

Redact implements and aliases `react/compiler-runtime`, with generated-output tests, but does not claim support for every compiler output pattern. Preact 11.0.2 does not publish that entrypoint. Compiler-generated apps need an explicit compatibility check.

Redact's `StrictMode` and `Profiler` render children without React's development double invocation or profiling. Preact compat aliases `StrictMode` to `Fragment` too. Neither should be treated as a way to preserve all of React's debugging behavior.

## Speed and memory

The [three-way performance comparison](./comparison.md) measures five synchronous list workloads with React 19.3.1, Redact 0.2.1, and Preact 11.1.0. React wins several operations, Redact wins keyed reversal, and no runtime wins everything. Those measurements use newer versions than this API snapshot. We have not measured comparative memory use, and smaller downloads do not establish faster updates.

A useful app comparison needs matching output and behavior, production builds, normal user interactions, hydration, updates, unmounting, and retained memory. Test on the browsers and devices you support. If one runtime skips the pending state or effect lifecycle being measured, a shorter timing is not equivalent work.

## Which should you choose?

Choose Redact when your React app needs the transition, action, or hidden-state behaviors above, you can accept a larger runtime than Preact, and your integration passes its checks. Its pitch is preserving more of that React behavior while removing concurrent scheduling.

Choose Preact when download size matters more, your app fits its compatibility layer, or you want its Preact tooling and Signals ecosystem. An existing Preact app that works well has no automatic reason to switch.

Keep React when you need interruptible concurrent rendering, full React scheduling and profiling behavior, or framework behavior that neither alternative has validated for your app.

For a migration, start with Redact's default preset, keep your React imports, and exercise forms, loading states, portals, hydration, error boundaries, and third-party components. Compare your production bundles before disabling features. [Installation](./installation.md), [integration checks](./verification.md).
