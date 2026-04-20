import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface TanStackDomOptions {
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
   * names (e.g. `@tanstack/react`), values are absolute paths to the package
   * directory. Handy for cross-workspace testing / bring-your-own-build setups.
   */
  packageRoots?: Record<string, string>
}

const ALIASES: Record<string, string> = {
  // Shim targets
  react: '@tanstack/react',
  'react/jsx-runtime': '@tanstack/react/jsx-runtime',
  'react/jsx-dev-runtime': '@tanstack/react/jsx-dev-runtime',
  'react-dom': '@tanstack/react-dom',
  'react-dom/client': '@tanstack/react-dom/client',
  'react-dom/server': '@tanstack/react-dom-server',
  'react-dom/test-utils': '@tanstack/react-dom/test-utils',
  scheduler: '@tanstack/scheduler',
  // Internal @tanstack/* aliases so Vite consistently picks source .ts over
  // published dist/.js. Without these, mixing source + dist loads two copies
  // of ReactSharedInternals and hooks break.
  '@tanstack/react': '@tanstack/react',
  '@tanstack/react/jsx-runtime': '@tanstack/react/jsx-runtime',
  '@tanstack/react/jsx-dev-runtime': '@tanstack/react/jsx-dev-runtime',
  '@tanstack/react-dom': '@tanstack/react-dom',
  '@tanstack/react-dom/client': '@tanstack/react-dom/client',
  '@tanstack/react-dom/test-utils': '@tanstack/react-dom/test-utils',
  '@tanstack/react-dom-server': '@tanstack/react-dom-server',
  '@tanstack/dom-core': '@tanstack/dom-core',
  '@tanstack/scheduler': '@tanstack/scheduler',
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
  // transformed bundle per package so Vite's dep optimizer doesn't thrash on
  // dozens of individual source files. Our build keeps cross-@tanstack
  // imports external, so there's still only one React instance at runtime.
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

// When installed from npm, the shim packages are declared as `dependencies`
// of this plugin. Under pnpm's strict mode they end up nested under the
// plugin's own `.pnpm/@tanstack+dom-vite@.../node_modules/` rather than
// hoisted to the consumer's root, so a `findPackageDir` walk starting at the
// Vite project root won't find them. Search from the plugin's own directory
// first (which walks into its nested node_modules), then fall back to the
// consumer root for overridden/hoisted installs.
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
  // Canonicalize through pnpm symlinks. Under strict pnpm, the shim packages
  // live nested under the plugin's own `.pnpm/@tanstack+dom-vite@.../node_modules/*`,
  // but each of those is itself a symlink to the flat `.pnpm/@tanstack+react@.../`
  // entry. Vite's `fetchModule` (used by TanStack Start's server-fn compiler)
  // follows the realpath, so the id seen by the capture-transform differs from
  // the nested id we'd return. That leaves the compiler's moduleCache keyed on
  // the realpath while `getModuleInfo` looks up the nested path → miss →
  // "could not load module info". Returning the canonical realpath here keeps
  // the two sides in agreement.
  try {
    return realpathSync(target)
  } catch {
    return target
  }
}

export function tanstackDom(options: TanStackDomOptions = {}): any {
  const skip = new Set(options.skip ?? [])
  const entries = Object.entries(ALIASES).filter(([k]) => !skip.has(k))

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

  return {
    name: 'tanstack-dom',
    enforce: 'pre',

    config() {
      const excludeList = entries.map(([k]) => k)
      const noExt = [
        '@tanstack/react',
        '@tanstack/react-dom',
        '@tanstack/react-dom-server',
        '@tanstack/dom-core',
        '@tanstack/scheduler',
      ]
      // Scope optimizeDeps to client + ssr environments ONLY. Do NOT set a
      // top-level optimizeDeps — in Vite 6+ that's effectively the client
      // env's default but also seeps into the rsc env's `'use client'`
      // analysis, causing flood warnings like "inconsistently optimized".
      return {
        environments: {
          client: {
            optimizeDeps: { exclude: excludeList },
          },
          ssr: {
            optimizeDeps: { exclude: excludeList },
            resolve: { noExternal: noExt },
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

    resolveId(this: any, id: string) {
      // Skip the RSC environment — it relies on real React internals via
      // @vitejs/plugin-rsc's vendored react-server-dom. Substituting our shim
      // there breaks Flight serialization. Client + SSR envs still swap.
      const envName = this?.environment?.name
      if (envName === 'rsc') return null
      return resolvedMap[id] ?? null
    },
  }
}

export default tanstackDom
