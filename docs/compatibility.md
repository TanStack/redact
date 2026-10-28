---
title: Compatibility
---

React's APIs and behavior are the reference for Redact. The default Vite configuration uses synchronous rendering, so some APIs behave differently from React's concurrent implementation. These are runtime tradeoffs, not recommendations to change how React works.

For React 18 apps, the Vite plugin detects the installed React version and adapts element and context markers at build time, so checks from libraries such as `react-is` keep working. No extra plugin option or runtime version check is needed. React 19 runtime code is unchanged.

Packed-package Chromium checks compare React 18.0.0, 18.2.0, 18.3.1, 19.0.0, and 19.3.1 against Redact in development and production bundles, covering `createRoot`, SSR, hydration, refs, context, portals, lazy loading, and external stores. Run a version with `REACT_VERSION=18.3.1 pnpm test:react18`. `pnpm test:compatibility:size` compares each React target against the same target built from `origin/main` and rejects increases in minified, gzip, or Brotli size across the full, default, and nano profiles.

Use `createRoot` and `hydrateRoot` from `react-dom/client`. The deprecated `ReactDOM.render`, `ReactDOM.hydrate`, `unmountComponentAtNode`, and public `findDOMNode` exports aren't implemented. React 18 detection applies to the Vite integration, not direct imports or the Next.js adapter. The synchronous scheduling and debugging differences below still apply.

| Area | Redact behavior |
|---|---|
| Core rendering | JSX, hooks (including `use`, `useEffectEvent`, `useId`, and `useSyncExternalStore`), context, refs, memo, lazy, portals, error boundaries, and modern class lifecycles. Legacy class lifecycles are no-ops. |
| DOM and forms | Controlled inputs, reset defaults, event handling, and preservation of edits during hydration have shared React tests. |
| Suspense and hydration | Fallbacks, retained primary DOM, retries, streaming boundaries, and event replay. No priority scheduling. |
| `Activity` | Retains hidden DOM/state and disconnects effects, refs, and subscriptions. Insertion effects stay connected. Hidden work is synchronous, not background priority. |
| Fragment refs | Stable DOM instances with events, focus, geometry, observers, scrolling, and portal/visibility tracking. |
| Transitions | `useTransition` retains committed content and pending state while work suspends. `useDeferredValue` retains stale results. Rendering passes stay synchronous, without time slicing or interruptible component renders. |
| `useActionState` | Queues actions against the previous result, tracks pending actions, and sends failures to error boundaries. |
| `useOptimistic`, `useFormStatus` | Optimistic updates rebase on current state and roll back when their action finishes. Form descendants receive pending status and submitted data. |
| View transitions | `ViewTransition` preserves state; `addTransitionType` does not animate by default. Native snapshots/styles/callbacks are experimental and opt-in. Animated commits wait for the browser snapshot callback, without a concurrent scheduler. |
| Browser-only rendering | `browser()` requests a server-to-client Suspense fallback; `onBrowserBailout` reports it separately from errors. `use(browser())` returns `undefined` on the client. |
| Resource APIs | Preload/preinit/preconnect/DNS hints and declarative styles/scripts, with document/ShadowRoot ownership and streamed stylesheet coverage. |
| SSR | `renderToString`, `renderToStaticMarkup`, readable and pipeable streams. Full Fizz prerender/resume APIs are not implemented. |
| Caching | `cache` returns its function, `cacheSignal` returns `null`, and `unstable_useCacheRefresh` is a stable client no-op. Invoking a server refresh throws. Client/DOM-server rendering is uncached. |
| React Compiler | The `react/compiler-runtime` memo-cache entrypoint is implemented and aliased. This is not validation of every compiler output pattern. |
| Server Components / Flight | Kept on upstream React in the RSC environment, not reimplemented by Redact. |
| Debugging | Fast Refresh preserves state for compatible edits. React DevTools supports component and hook inspection, edits, owners, error and Suspense controls, and commit profiling in development. `useDebugValue` labels appear in DevTools. All DevTools code is removed in production. `StrictMode` still avoids double invocation, and the `<Profiler>` callback remains a no-op. [DevTools checks and timings](https://github.com/TanStack/redact/blob/main/docs/devtools-implementation-status.md). |

Native animation is not exhaustive visual parity. Production animation, hidden-tab behavior, broader resource/navigation races, and Safari/Firefox remain unverified. [API details](https://github.com/TanStack/redact/blob/main/docs/REACT_19_3_SUPPORT.md), [upstream audit](https://github.com/TanStack/redact/blob/main/docs/REACT_19_3_AUDIT.md), [native animation limits](https://github.com/TanStack/redact/blob/main/docs/VIEW_TRANSITION_EXPERIMENT.md).

## Waiting for hydration in tests

Redact does not expose React DOM's private `__reactFiber$` or `__reactProps$` node properties. Use a marker your application owns, set in an effect on the component your test will use:

```jsx
import { useEffect, useRef } from 'react'

function ReadyButton({ onClick, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const node = ref.current
    node.dataset.appReady = 'true'
    return () => { delete node.dataset.appReady }
  }, [])
  return <button ref={ref} onClick={onClick}>{children}</button>
}
```

For example, Playwright can wait for `button[data-app-ready="true"]` before clicking that button. This works with React and Redact. The marker means this component committed, it does not mean every Suspense boundary on the page has hydrated. Put the signal inside a deferred component when the test needs to wait for that component.
