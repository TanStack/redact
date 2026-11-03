import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RedactPreset, RedactFeatures } from './selection'

export interface RedactOptions {
  /** Skip aliasing specific specifiers, e.g. if a consumer wants real React somewhere. */
  skip?: ReadonlyArray<string>
  /**
   * Override package resolution root. Defaults to the build config root. Useful
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
   * stable feature on, with view transitions off. Disable individual features via
   * `features`. `'nano'` turns everything off, opt in to what you need.
   */
  preset?: RedactPreset
  /**
   * Per-feature overrides merged on top of the preset's defaults. Enables
   * fine-grained "preset minus X" or "preset plus Y" configurations.
   */
  features?: RedactFeatures
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

export function findPackageDir(pkg: string, fromDir: string): string | null {
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
  // Prefer published JavaScript over TypeScript sources. Dist preserves one
  // file per module, so subpath imports share state and feature boundaries.
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

export function resolveSpecifier(
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

