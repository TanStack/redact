import { readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { adaptReact18 } from './react18'

import { ALIASES, resolveFeatures, isOwnedRuntimeFeature } from '../bundler-core/selection'
import type { ResolvedFeatures } from '../bundler-core/selection'
export type { RedactPreset, RedactFeatures } from '../bundler-core/selection'

import { findPackageDir, resolveSpecifier, resolvePackageDir } from '../bundler-core/resolution'
import type { RedactOptions as CommonRedactOptions } from '../bundler-core/resolution'

export interface RedactOptions extends CommonRedactOptions {
  /** Select browser and/or SSR replacement. RSC always keeps native React. */
  environments?: ReadonlyArray<'client' | 'ssr'>
}
const pluginDir = dirname(fileURLToPath(import.meta.url))

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
  const aliasPattern = excludeList.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const aliasFilter = aliasPattern ? new RegExp(`^(?:${aliasPattern})$`) : /$a/
  const featureImport = /^\.\/([a-z-]+)(\/index\.js)?$/
  const peerImport = /[\\/](context|hydration|fragment-refs|view-transition|class|suspense-runtime|suspense-hydration)(?:[\\/]index\.js)?$/
  const optimizeDepsBlocked = new Set(excludeList)
  const features = resolveFeatures(options.preset ?? 'full', options.features ?? {})

  const resolvedMap: Record<string, string> = {}
  const client = !options.environments || options.environments.includes('client')
  const ssr = !options.environments || options.environments.includes('ssr')
  const active = (environment: any, legacySsr?: boolean): boolean => environment?.name !== 'rsc' &&
    (environment?.name === 'ssr' || environment?.config?.consumer === 'server' || legacySsr ? ssr : client)
  let done = false
  let react18Version: string | undefined
  let runtimeRoot: string | undefined
  const featurePackageDir = options.packageRoots?.['@tanstack/redact'] ?? resolvePath(pluginDir, '../..')
  let featurePackageRoot = resolvePath(featurePackageDir)
  try { featurePackageRoot = realpathSync(featurePackageRoot) } catch { /* Package may not be built yet. */ }
  featurePackageRoot = featurePackageRoot.replaceAll('\\', '/').replace(/\/$/, '')
  const isRuntimeFeature = (id: string) => isOwnedRuntimeFeature(id, featurePackageRoot)

  function resolveAll(root: string): void {
    if (done) return
    const fromDir = options.resolveFrom ?? root
    const packageRoots = options.packageRoots ?? {}
    for (const [from, to] of entries) {
      const resolved = resolveSpecifier(to, fromDir, packageRoots, options.resolveFrom !== undefined)
      if (resolved) resolvedMap[from] = resolved
    }
    const selectedDir = resolvePackageDir('@tanstack/redact', fromDir, packageRoots, options.resolveFrom !== undefined)
    if (selectedDir) {
      try { featurePackageRoot = realpathSync(selectedDir).replaceAll('\\', '/').replace(/\/$/, '') } catch { /* Keep the unbuilt-package fallback. */ }
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
          ...(client ? { client: {
            optimizeDeps: { exclude: excludeList },
            resolve: { alias: aliasMap, dedupe },
          } } : {}),
          ...(ssr ? { ssr: {
            optimizeDeps: { exclude: excludeList },
            resolve: { alias: aliasMap, dedupe, noExternal: noExt },
          } } : {}),
        },
        ...(ssr ? { ssr: { noExternal: noExt } } : {}),
      }
    },

    configResolved(config: any) {
      resolveAll(config.root)
      const reactDir = findPackageDir('react', options.resolveFrom ?? config.root)
      if (reactDir) {
        const installedVersion = JSON.parse(readFileSync(resolvePath(reactDir, 'package.json'), 'utf8')).version
        if (/^18\./.test(installedVersion)) react18Version = installedVersion
      }
      if (resolvedMap.react) {
        runtimeRoot = resolvePath(dirname(resolvedMap.react), '..').replaceAll('\\', '/') + '/'
      }
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

    applyToEnvironment: (environment: any) => active(environment),
    resolveId: {
      filter: { id: [aliasFilter,
        new RegExp(featureImport.source.slice(0, -1) + '(?:[?#]|$)'),
        new RegExp(peerImport.source.slice(0, -1) + '(?:[?#]|$)'),
      ] },
      async handler(this: any, id: string, importer?: string, opts?: any) {
        // Skip the RSC environment — it relies on real React internals via
        // @vitejs/plugin-rsc's vendored react-server-dom. Substituting our
        // shim there breaks Flight serialization. Client + SSR envs still swap.
        if (!active(this?.environment, opts?.ssr)) return null

        // Feature-flag swap: when the reconciler's `features/index` module
        // imports a feature by relative path, redirect to that feature's stub
        // if the flag is off. The stub registers a graceful-degradation
        // matcher (e.g. Portal → Fragment) so user code keeps working.
        const path = id.split(/[?#]/, 1)[0]!
        const suffix = id.slice(path.length)
        if (importer && isRuntimeFeature(importer) && /[\\/]features[\\/]index\.[jt]sx?$/.test(importer.split(/[?#]/, 1)[0]!)) {
          const m = path.match(featureImport)
          if (m) {
            const dir = m[1]!
            const name = (dir === 'forward-ref' ? 'forwardRef' : dir === 'fragment-refs' ? 'fragmentRefs' : dir === 'view-transition' ? 'viewTransitions' : dir === 'class' ? 'classComponents' : dir) as keyof ResolvedFeatures
            if (name in features && !features[name]) {
              const r = await this.resolve(`./${dir}/stub${m[2] ? '.js' : ''}${suffix}`, importer, {
                ...opts,
                skipSelf: true,
              })
              if (r) return r.id
            }
          }
        }

        // Peer imports must use the same feature selection as the registration
        // entrypoint, or an enabled feature can bring a disabled one back in.
        const peer = path.match(peerImport)
        const peerKey = peer?.[1] === 'suspense-hydration' ? 'hydration' : peer?.[1] === 'suspense-runtime' ? 'suspense' : peer?.[1] === 'fragment-refs' ? 'fragmentRefs' : peer?.[1] === 'view-transition' ? 'viewTransitions' : peer?.[1] === 'class' ? 'classComponents' : peer?.[1] as 'context' | 'hydration' | undefined
        if (importer && peer && peerKey && !features[peerKey]) {
          const r = await this.resolve(id, importer, { ...opts, skipSelf: true })
          const resolvedFeature = r?.id.match(/features[\\/](context|hydration|fragment-refs|view-transition|class|suspense-runtime|suspense-hydration)[\\/]index\.(ts|js)(?=[?#]|$)/)
          if (r && isRuntimeFeature(r.id) && resolvedFeature?.[1] === peer[1]) {
            return r.id.replace(/index\.(ts|js)(?=[?#]|$)/, 'stub.$1')
          }
        }

        return resolvedMap[id] ?? null
      },
    },
  }, {
    name: 'redact:canonical-imports',
    applyToEnvironment: (environment: any) => active(environment),
    resolveId: {
      order: 'pre',
      filter: { id: aliasFilter },
      handler(this: any, id: string, _importer?: string, opts?: any) {
        if (!active(this.environment, opts?.ssr)) return null
        return resolvedMap[id] ?? null
      },
    },
  }, {
    name: 'redact:react18',
    applyToEnvironment: (environment: any) => !!react18Version && !!runtimeRoot && active(environment),
    enforce: 'post',
    transform(this: any, code: string, id: string, opts?: any) {
      if (!react18Version || !runtimeRoot || !active(this?.environment, opts?.ssr)) return null
      const path = id.split('?')[0]!.replaceAll('\\', '/')
      if (!path.startsWith(runtimeRoot)) return null
      const module = path.slice(runtimeRoot.length).replace(/\.[jt]s$/, '')
      return adaptReact18(code, id, module, react18Version, (source) => this.parse(source))
    },
  }, {
    name: 'redact:optimize-deps-guard',
    enforce: 'post',

    configResolved(config: any) {
      // `optimizeDeps.exclude` loses when another plugin force-adds the same
      // ids to `include`. That lets Vite pre-bundle real React next to Redact,
      // producing duplicate dispatcher state. Prune after config settles so
      // Redact's client/SSR shims stay canonical.
      if (client) {
        pruneOptimizeDepsInclude(config.optimizeDeps, optimizeDepsBlocked)
        pruneOptimizeDepsInclude(config.environments?.client?.optimizeDeps, optimizeDepsBlocked)
      }
      if (ssr) pruneOptimizeDepsInclude(config.environments?.ssr?.optimizeDeps, optimizeDepsBlocked)
      // Leave `environments.rsc` untouched. RSC depends on real React internals.
    },
  }]
}

export default redact
