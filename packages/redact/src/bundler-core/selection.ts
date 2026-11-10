export type RedactPreset = 'nano' | 'full'

/**
 * Opt-in feature set. Each flag toggles whether the feature's real
 * implementation ships (`true`) or is swapped with a stub module that
 * degrades gracefully (`false`). Missing keys fall back to the preset's
 * default. Adding a feature to this interface propagates to consumer
 * configs as autocompleted options.
 */
export interface RedactFeatures {
  /** Activity visibility, retained state and disconnected effects. */
  activity?: boolean
  /** DOM instances, events, focus, layout and observers for Fragment refs. */
  fragmentRefs?: boolean
  /** Experimental native ViewTransition animations. Opt-in until snapshot parity is complete. */
  viewTransitions?: boolean
  /**
   * `createPortal`. When `false`, portal elements render in place as a
   * Fragment (the `container` prop is ignored). `renderPortal` and its
   * deps are stripped from the bundle.
   */
  portal?: boolean
  /**
   * `createContext` / `useContext` / `<Provider>` / `<Consumer>`. When
   * `false`, Providers render as Fragments (value never propagates),
   * Consumers invoke their function-children with the context's default
   * value, and `useContext` returns the default. Provider-walk logic and
   * `renderProvider` are stripped.
   */
  context?: boolean
  /**
   * `<Suspense>` boundaries + streaming hydration. When `false`, Suspense
   * elements render as Fragments (children mount inline, `fallback` is
   * ignored). Thrown thenables still schedule a re-render on settle, so
   * eventual consistency works, just no fallback UI during the pending
   * window. Boundary-handler stack and hydration integration are stripped.
   */
  suspense?: boolean
  /**
   * `React.memo`. When `false`, memoized components still render but without
   * the prop-equality gate, every parent rerender passes through.
   * `shallowEqual` and the force-rerender bypass are stripped.
   */
  memo?: boolean
  /**
   * `React.forwardRef`. When `false`, forwardRef components still render but
   * the ref prop isn't forwarded to the inner function. React 19+ treats
   * refs as normal props on function components anyway, so most apps can
   * drop this. The dispatcher save/restore machinery is stripped.
   */
  forwardRef?: boolean
  /**
   * `React.lazy`. When `false`, lazy elements still resolve if their payload
   * is already available synchronously (e.g. pre-awaited RSC Flight); async
   * resolution throws a clear error. The hydration-deferred-reveal path and
   * Suspense coordination are stripped.
   */
  lazy?: boolean
  /**
   * Class components (`extends Component`). When `false`, class components
   * still render but only honor the core contract: constructor + `render()`
   * + `setState`. Dropped: `contextType`, `getDerivedStateFromProps`,
   * `shouldComponentUpdate`, `componentDidMount`/`Update`/`WillUnmount`,
   * `getDerivedStateFromError`/`componentDidCatch` (error boundaries).
   */
  classComponents?: boolean
  /**
   * SSR hydration (`hydrateRoot`). When `false`, `hydrateRoot` throws
   * (use `createRoot` for SPAs). The HydrationCursor / DOM adoption /
   * streaming-boundary coordination / event-replay / scroll-guard
   * machinery is stripped, the biggest single chunk of reducible code.
   */
  hydration?: boolean
}

export interface ResolvedFeatures {
  activity: boolean
  fragmentRefs: boolean
  viewTransitions: boolean
  portal: boolean
  context: boolean
  suspense: boolean
  memo: boolean
  forwardRef: boolean
  lazy: boolean
  classComponents: boolean
  hydration: boolean
}

const PRESET_DEFAULTS: Record<RedactPreset, ResolvedFeatures> = {
  // Opt-in: everything off. Turn individual features on via `features`.
  nano: {
    activity: false, fragmentRefs: false, viewTransitions: false,
    portal: false, context: false, suspense: false, memo: false,
    forwardRef: false, lazy: false, classComponents: false, hydration: false,
  },
  // Opt-out: everything on (drop-in React parity). Turn features off via `features`.
  full: {
    activity: true, fragmentRefs: true, viewTransitions: false,
    portal: true, context: true, suspense: true, memo: true,
    forwardRef: true, lazy: true, classComponents: true, hydration: true,
  },
}

export function resolveFeatures(
  preset: RedactPreset,
  overrides: RedactFeatures,
): ResolvedFeatures {
  const p = PRESET_DEFAULTS[preset]
  return {
    activity: overrides.activity ?? p.activity,
    fragmentRefs: overrides.fragmentRefs ?? p.fragmentRefs,
    viewTransitions: overrides.viewTransitions ?? p.viewTransitions,
    portal: overrides.portal ?? p.portal,
    context: overrides.context ?? p.context,
    suspense: overrides.suspense ?? p.suspense,
    memo: overrides.memo ?? p.memo,
    forwardRef: overrides.forwardRef ?? p.forwardRef,
    lazy: overrides.lazy ?? p.lazy,
    classComponents: overrides.classComponents ?? p.classComponents,
    hydration: overrides.hydration ?? p.hydration,
  }
}

// Alias map. ORDER MATTERS, Vite's alias matcher uses first-match against
// prefix, so more-specific specifiers MUST come before less-specific ones.
// Without this, `react-dom/server` would prefix-match `react-dom` first and
// resolve to `@tanstack/redact/dom/server` (wrong) instead of
// `@tanstack/redact/server`.
//
// `use-sync-external-store` aliases are here because its CJS-only React 17
// compat shim does `var React = require('react')`. That survives Vite's
// pre-bundling intact and explodes in Cloudflare Workers (no `require`).
// Modern React has `useSyncExternalStore` built-in, and `@tanstack/redact`
// additionally exports `useSyncExternalStoreWithSelector` so this alias
// is safe everywhere.
export const ALIASES: Record<string, string> = {
  // ---- most-specific first ----
  'use-sync-external-store/shim/with-selector': '@tanstack/redact',
  'use-sync-external-store/shim/with-selector.js': '@tanstack/redact',
  'use-sync-external-store/with-selector': '@tanstack/redact',
  'use-sync-external-store/with-selector.js': '@tanstack/redact',
  // Explicit file subpaths (react-aria imports `shim/index.js`). Without these,
  // dev resolves the raw CJS shim and its named ESM import fails.
  'use-sync-external-store/shim/index.js': '@tanstack/redact',
  'use-sync-external-store/index.js': '@tanstack/redact',
  'use-sync-external-store/shim': '@tanstack/redact',
  'use-sync-external-store': '@tanstack/redact',

  // React drop-in shim targets. Subpaths first.
  'react/jsx-runtime': '@tanstack/redact/jsx-runtime',
  'react/jsx-dev-runtime': '@tanstack/redact/jsx-dev-runtime',
  'react/compiler-runtime': '@tanstack/redact/compiler-runtime',
  'react-dom/profiling': '@tanstack/redact/dom-profiling',
  'react-dom/client': '@tanstack/redact/dom-client',
  'react-dom/server.browser': '@tanstack/redact/server',
  'react-dom/server.bun': '@tanstack/redact/server',
  'react-dom/server.edge': '@tanstack/redact/server',
  'react-dom/server.node': '@tanstack/redact/server',
  'react-dom/static.edge': '@tanstack/redact/server',
  'react-dom/server': '@tanstack/redact/server',
  'react-dom/test-utils': '@tanstack/redact/dom-test-utils',
  'react-dom': '@tanstack/redact/dom',
  react: '@tanstack/redact',
  scheduler: '@tanstack/redact/scheduler',

  // Self-aliases so Vite resolves `@tanstack/redact/*` imports to the same
  // canonical file path no matter where they originate (worker bundle vs
  // deps_ssr pre-bundle vs source). Without these, Cloudflare's
  // `noExternal: true` worker config inlines one copy while Vite's
  // optimizeDeps pre-bundles another, ending up with two separate
  // ReactSharedInternals instances and a null dispatcher in user hooks.
  // Subpaths first here too.
  '@tanstack/redact/jsx-runtime': '@tanstack/redact/jsx-runtime',
  '@tanstack/redact/jsx-dev-runtime': '@tanstack/redact/jsx-dev-runtime',
  '@tanstack/redact/compiler-runtime': '@tanstack/redact/compiler-runtime',
  '@tanstack/redact/dom-profiling': '@tanstack/redact/dom-profiling',
  '@tanstack/redact/dom-client': '@tanstack/redact/dom-client',
  '@tanstack/redact/dom-test-utils': '@tanstack/redact/dom-test-utils',
  '@tanstack/redact/server': '@tanstack/redact/server',
  '@tanstack/redact/scheduler': '@tanstack/redact/scheduler',
  '@tanstack/redact/dom': '@tanstack/redact/dom',
  '@tanstack/redact': '@tanstack/redact',
}

// The caller canonicalizes filesystem paths before making this pure ownership decision.
export function isOwnedRuntimeFeature(id: string, packageRoot: string): boolean {
  const path = id.replaceAll('\\', '/')
  const root = packageRoot.replaceAll('\\', '/').replace(/\/$/, '')
  return path.startsWith(root + '/src/dom/features/') ||
    path.startsWith(root + '/dist/dom/features/')
}
