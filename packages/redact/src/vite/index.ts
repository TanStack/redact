import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

export type RedactPreset = 'nano' | 'full'

/**
 * Opt-in feature set. Each flag toggles whether the feature's real
 * implementation ships (`true`) or is swapped with a stub module that
 * degrades gracefully (`false`). Missing keys fall back to the preset's
 * default. Adding a feature to this interface propagates to consumer
 * configs as autocompleted options.
 */
export interface RedactFeatures {
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
   * eventual consistency works — just no fallback UI during the pending
   * window. Boundary-handler stack and hydration integration are stripped.
   */
  suspense?: boolean
  /**
   * `React.memo`. When `false`, memoized components still render but without
   * the prop-equality gate — every parent rerender passes through.
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
   * machinery is stripped — the biggest single chunk of reducible code.
   */
  hydration?: boolean
}

interface ResolvedFeatures {
  portal: boolean
  context: boolean
  suspense: boolean
  memo: boolean
  forwardRef: boolean
  lazy: boolean
  classComponents: boolean
  hydration: boolean
}

// On-disk folder names (kebab-case) → ResolvedFeatures keys (camelCase). The
// resolveId hook receives the bare specifier from `features/index.ts`'s
// `import './<folder>'` calls, so the matched name is always the folder.
// Without this remap, `forwardRef: false` and `classComponents: false` were
// silently no-ops because `'forward-ref' in features` and `'class' in features`
// are both false.
const FOLDER_TO_FEATURE: Record<string, keyof ResolvedFeatures> = {
  portal: 'portal',
  context: 'context',
  suspense: 'suspense',
  memo: 'memo',
  'forward-ref': 'forwardRef',
  lazy: 'lazy',
  class: 'classComponents',
}

const PRESET_DEFAULTS: Record<RedactPreset, ResolvedFeatures> = {
  // Opt-in: everything off. Turn individual features on via `features`.
  nano: {
    portal: false, context: false, suspense: false, memo: false,
    forwardRef: false, lazy: false, classComponents: false, hydration: false,
  },
  // Opt-out: everything on (drop-in React parity). Turn features off via `features`.
  full: {
    portal: true, context: true, suspense: true, memo: true,
    forwardRef: true, lazy: true, classComponents: true, hydration: true,
  },
}

function resolveFeatures(
  preset: RedactPreset,
  overrides: RedactFeatures,
): ResolvedFeatures {
  const p = PRESET_DEFAULTS[preset]
  return {
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

export interface RedactOptions {
  /** Skip aliasing specific specifiers, e.g. if a consumer wants real React somewhere. */
  skip?: ReadonlyArray<string>
  /**
   * Override package resolution root. Defaults to the Vite config root. Useful
   * for monorepos where the plugin lives in a different workspace than the
   * consumer app.
   */
  resolveFrom?: string
  /**
   * Explicit package roots, bypassing node_modules lookup. Keys are package
   * names (e.g. `@tanstack/redact`), values are absolute paths to the package
   * directory. Handy for cross-workspace testing / bring-your-own-build setups.
   */
  packageRoots?: Record<string, string>
  /**
   * Starting point for feature selection. `'full'` (default) turns every
   * feature on — drop-in React parity, opt-out individual features via
   * `features`. `'nano'` turns everything off — opt in to what you need.
   */
  preset?: RedactPreset
  /**
   * Per-feature overrides merged on top of the preset's defaults. Enables
   * fine-grained "preset minus X" or "preset plus Y" configurations.
   */
  features?: RedactFeatures
}

// Alias map. ORDER MATTERS — Vite's alias matcher uses first-match against
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
const ALIASES: Record<string, string> = {
  // ---- most-specific first ----
  'use-sync-external-store/shim/with-selector': '@tanstack/redact',
  'use-sync-external-store/shim/with-selector.js': '@tanstack/redact',
  'use-sync-external-store/with-selector': '@tanstack/redact',
  'use-sync-external-store/with-selector.js': '@tanstack/redact',
  'use-sync-external-store/shim': '@tanstack/redact',
  'use-sync-external-store': '@tanstack/redact',

  // React drop-in shim targets. Subpaths first.
  'react/jsx-runtime': '@tanstack/redact/jsx-runtime',
  'react/jsx-dev-runtime': '@tanstack/redact/jsx-dev-runtime',
  'react/compiler-runtime': '@tanstack/redact/compiler-runtime',
  'react-dom/client': '@tanstack/redact/dom-client',
  'react-dom/server.edge': '@tanstack/redact/server',
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
  '@tanstack/redact/dom-client': '@tanstack/redact/dom-client',
  '@tanstack/redact/dom-test-utils': '@tanstack/redact/dom-test-utils',
  '@tanstack/redact/server': '@tanstack/redact/server',
  '@tanstack/redact/scheduler': '@tanstack/redact/scheduler',
  '@tanstack/redact/dom': '@tanstack/redact/dom',
  '@tanstack/redact': '@tanstack/redact',
}

function splitSpecifier(specifier: string): { pkg: string; sub: string } {
  if (specifier.startsWith('@')) {
    const slash1 = specifier.indexOf('/')
    const slash2 = specifier.indexOf('/', slash1 + 1)
    if (slash2 < 0) return { pkg: specifier, sub: '' }
    return { pkg: specifier.slice(0, slash2), sub: specifier.slice(slash2 + 1) }
  }
  const slash = specifier.indexOf('/')
  if (slash < 0) return { pkg: specifier, sub: '' }
  return { pkg: specifier.slice(0, slash), sub: specifier.slice(slash + 1) }
}

function findPackageDir(pkg: string, fromDir: string): string | null {
  let dir = fromDir
  while (true) {
    const candidate = resolvePath(dir, 'node_modules', pkg)
    if (existsSync(resolvePath(candidate, 'package.json'))) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function resolveExport(packageDir: string, sub: string): string | null {
  const pkgJsonPath = resolvePath(packageDir, 'package.json')
  let pkg: any
  try {
    pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
  } catch {
    return null
  }
  const key = sub ? './' + sub : '.'
  const exp = pkg.exports?.[key]
  // Prefer published `import` (dist/.js) over `source` — dist is a single
  // transformed bundle so Vite's dep optimizer doesn't thrash on dozens of
  // individual source files. The package keeps cross-subpath imports
  // external, so there's still only one runtime instance.
  const pick = (v: any): string | null => {
    if (typeof v === 'string') return v
    if (v && typeof v === 'object') {
      return pick(v.import ?? v.module ?? v.source ?? v.default ?? null)
    }
    return null
  }
  const target = pick(exp)
  if (target) return resolvePath(packageDir, target)
  if (!sub) {
    const main = pkg.module ?? pkg.main
    if (typeof main === 'string') return resolvePath(packageDir, main)
  }
  return null
}

// When installed from npm, `@tanstack/redact` is declared as a `dependency`
// of consumer apps. Under pnpm's strict mode it ends up nested under the
// plugin's own `.pnpm/@tanstack+redact@.../node_modules/` rather than
// hoisted to the consumer's root, so a `findPackageDir` walk starting at
// the Vite project root won't always find it. Search from the plugin's own
// directory first (which walks into its nested node_modules), then fall
// back to the consumer root for hoisted installs.
const pluginDir = dirname(fileURLToPath(import.meta.url))

function resolveSpecifier(
  specifier: string,
  fromDir: string,
  packageRoots: Record<string, string>,
): string | null {
  const { pkg, sub } = splitSpecifier(specifier)
  const packageDir =
    packageRoots[pkg] ??
    findPackageDir(pkg, pluginDir) ??
    findPackageDir(pkg, fromDir)
  if (!packageDir) return null
  const target = resolveExport(packageDir, sub)
  if (!target) return null
  // Canonicalize through pnpm symlinks. Under strict pnpm, the package may
  // live nested under `.pnpm/@tanstack+redact@.../node_modules/*`, but each
  // of those is itself a symlink to the flat `.pnpm/@tanstack+redact@.../`
  // entry. Vite's `fetchModule` (used by TanStack Start's server-fn
  // compiler) follows the realpath, so the id seen by the capture-transform
  // differs from the nested id we'd return. That leaves the compiler's
  // moduleCache keyed on the realpath while `getModuleInfo` looks up the
  // nested path → miss → "could not load module info". Returning the
  // canonical realpath here keeps the two sides in agreement.
  try {
    return realpathSync(target)
  } catch {
    return target
  }
}

interface OptimizeDepsWithInclude {
  include?: Array<string>
}

function pruneOptimizeDepsInclude(
  optimizeDeps: OptimizeDepsWithInclude | undefined,
  blocked: ReadonlySet<string>,
): void {
  if (!optimizeDeps?.include) return

  optimizeDeps.include = optimizeDeps.include.filter((id) => {
    const tailSpecifier = id.split('>').pop()?.trim() ?? id
    return !blocked.has(id) && !blocked.has(tailSpecifier)
  })
}

export function redact(options: RedactOptions = {}): any {
  const skip = new Set(options.skip ?? [])
  const entries = Object.entries(ALIASES).filter(([k]) => !skip.has(k))
  const excludeList = entries.map(([k]) => k)
  const optimizeDepsBlocked = new Set(excludeList)
  const features = resolveFeatures(options.preset ?? 'full', options.features ?? {})

  const resolvedMap: Record<string, string> = {}
  let done = false

  function resolveAll(root: string): void {
    if (done) return
    const fromDir = options.resolveFrom ?? root
    const packageRoots = options.packageRoots ?? {}
    for (const [from, to] of entries) {
      const resolved = resolveSpecifier(to, fromDir, packageRoots)
      if (resolved) resolvedMap[from] = resolved
    }
    done = true
  }

  return [{
    name: 'redact',
    enforce: 'pre',

    config() {
      // Single package — only one name to dedupe / no-external.
      const noExt = ['@tanstack/redact']
      const aliasMap = Object.fromEntries(entries.filter(([from, to]) => from !== to))
      // Dedupe `@tanstack/redact` so Vite resolves it to a single instance
      // even when multiple packages (e.g. @tanstack/react-router and user
      // code) drag it into different parts of the module graph.
      const dedupe = noExt
      // Scope `resolve.alias` to client + ssr environments ONLY. Do NOT set
      // a top-level alias: it would apply to the `rsc` environment too,
      // where `@vitejs/plugin-rsc`'s vendored `react-server-dom-server`
      // imports `react` and needs the *real* React (with the `.d` field on
      // ReactSharedInternals that our shim deliberately doesn't have).
      // Aliasing `react` → `@tanstack/redact` in the RSC env crashes Flight
      // serialization. The Cloudflare vite-plugin's rolldown worker-runner
      // also pre-scans bare specifiers via Vite's alias map (not plugin
      // hooks), but it scans within the *ssr* environment specifically —
      // so per-env `environments.ssr.resolve.alias` covers it. The
      // `enforce: 'pre'` resolveId hook below already skips RSC, so the
      // remaining concern is alias placement. Object form is required —
      // array form is silently ignored by rolldown's worker-runner.
      return {
        environments: {
          client: {
            optimizeDeps: { exclude: excludeList },
            resolve: { alias: aliasMap, dedupe },
          },
          ssr: {
            optimizeDeps: { exclude: excludeList },
            resolve: { alias: aliasMap, dedupe, noExternal: noExt },
          },
        },
        ssr: { noExternal: noExt },
      }
    },

    configResolved(config: any) {
      resolveAll(config.root)
      // With `packageRoots`, package sources live outside the consumer's Vite
      // project root, so the default server.fs.allow list blocks them. Append
      // to the resolved allow list rather than replacing via `config()`, so we
      // keep Vite's defaults (root + node_modules + client runtime).
      const fsAllow = Object.values(options.packageRoots ?? {})
      if (fsAllow.length && config.server?.fs?.allow) {
        for (const p of fsAllow) {
          if (!config.server.fs.allow.includes(p)) {
            config.server.fs.allow.push(p)
          }
        }
      }
    },

    async resolveId(this: any, id: string, importer?: string, opts?: any) {
      // Skip the RSC environment — it relies on real React internals via
      // @vitejs/plugin-rsc's vendored react-server-dom. Substituting our
      // shim there breaks Flight serialization. Client + SSR envs still swap.
      const envName = this?.environment?.name
      if (envName === 'rsc') return null

      // Feature-flag swap: when the reconciler's `features/index` module
      // imports a feature by relative path, redirect to that feature's stub
      // if the flag is off. The stub registers a graceful-degradation
      // matcher (e.g. Portal → Fragment) so user code keeps working.
      if (importer && /[\\/]features[\\/]index\.[jt]sx?$/.test(importer)) {
        const m = id.match(/^\.\/([a-z-]+)$/)
        if (m) {
          const folder = m[1]!
          const name = FOLDER_TO_FEATURE[folder]
          if (name && !features[name]) {
            const r = await this.resolve(`./${folder}/stub`, importer, {
              ...opts,
              skipSelf: true,
            })
            if (r) return r.id
          }
        }
      }

      // Hydration swap: hydration isn't self-registering, so it's imported
      // from reconcile.ts, root.ts, and the Suspense/Lazy feature modules.
      // Any specifier ending in `/hydration` that resolves to our feature
      // module gets redirected to the stub when the flag is off.
      if (!features.hydration && importer && /[\\/]hydration$/.test(id)) {
        const r = await this.resolve(id, importer, { ...opts, skipSelf: true })
        if (r && /features[\\/]hydration[\\/]index\.(ts|js)$/.test(r.id)) {
          return r.id.replace(/index\.(ts|js)$/, 'stub.$1')
        }
      }

      return resolvedMap[id] ?? null
    },
  }, {
    name: 'redact:optimize-deps-guard',
    enforce: 'post',

    configResolved(config: any) {
      // `optimizeDeps.exclude` loses when another plugin force-adds the same
      // ids to `include`. That lets Vite pre-bundle real React next to Redact,
      // producing duplicate dispatcher state. Prune after config settles so
      // Redact's client/SSR shims stay canonical.
      pruneOptimizeDepsInclude(config.optimizeDeps, optimizeDepsBlocked)
      pruneOptimizeDepsInclude(config.environments?.client?.optimizeDeps, optimizeDepsBlocked)
      pruneOptimizeDepsInclude(config.environments?.ssr?.optimizeDeps, optimizeDepsBlocked)
      // Leave `environments.rsc` untouched. RSC depends on real React internals.
    },
  }]
}

export default redact
