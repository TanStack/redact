import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALIASES, resolveFeatures, isOwnedRuntimeFeature } from '../bundler-core/selection'
import { findPackageDir, resolveSpecifier } from '../bundler-core/resolution'
import type { ResolvedFeatures } from '../bundler-core/selection'
import type { RedactOptions } from '../bundler-core/resolution'
export type { RedactOptions } from '../bundler-core/resolution'
export type { RedactPreset, RedactFeatures } from '../bundler-core/selection'

const pluginDir = dirname(fileURLToPath(import.meta.url))
const directories: Record<string, keyof ResolvedFeatures> = {
  activity: 'activity', 'fragment-refs': 'fragmentRefs', 'view-transition': 'viewTransitions',
  portal: 'portal', context: 'context', suspense: 'suspense', memo: 'memo',
  'forward-ref': 'forwardRef', lazy: 'lazy', class: 'classComponents', hydration: 'hydration',
  'suspense-runtime': 'suspense', 'suspense-hydration': 'hydration',
}

// Both compilers expose these hooks. No compiler package is loaded by the plugin.
interface ResourceData {
  resource?: string
  request?: string
  userRequest?: string
}
interface ModuleFactory {
  hooks: { afterResolve: { tap(name: string, callback: (data: { createData?: ResourceData }) => void): void } }
}
type AliasValue = string | false | Array<string | false>

interface Compiler {
  context: string
  options: {
    target?: string | false | ReadonlyArray<string>
    resolve: { alias?: false | Record<string, AliasValue> | Array<{ name: string; alias: AliasValue; onlyModule?: boolean }> }
    module: { rules: Array<unknown> }
  }
  hooks: { normalModuleFactory: { tap(name: string, callback: (factory: ModuleFactory) => void): void } }
}

export function selectedFeatureResource(resource: string, root: string, features: ResolvedFeatures): string | null {
  const path = resource.split(/[?#]/, 1)[0]!
  if (!existsSync(path)) return null
  const canonical = realpathSync(path)
  if (!isOwnedRuntimeFeature(canonical, root)) return null
  const directory = canonical.replaceAll('\\', '/').match(/\/dom\/features\/([^/]+)\/index\.js$/)?.[1]
  const feature = directory && directories[directory]
  if (!feature || features[feature]) return null
  const stub = resolve(dirname(canonical), 'stub.js')
  if (!existsSync(stub)) throw new Error(`Redact feature stub is missing: ${stub}`)
  return stub + resource.slice(path.length)
}

/** Webpack 5 and Rspack 2 integration for browser SPAs. */
export function redact(options: RedactOptions = {}) {
  const features = resolveFeatures(options.preset ?? 'full', options.features ?? {})
  return {
    apply(compiler: Compiler): void {
      const target = compiler.options.target
      if (target !== undefined && target !== 'web' && !(Array.isArray(target) && target.includes('web') && target.every(value => value === 'web' || /^es\d+$/.test(value)))) {
        throw new Error('The Redact Webpack/Rspack plugin supports browser SPA targets only. Use target: "web".')
      }
      const from = options.resolveFrom ?? compiler.context
      const roots = options.packageRoots ?? {}
      const entry = resolveSpecifier('@tanstack/redact', from, roots)
      if (!entry) throw new Error('Cannot find the built @tanstack/redact package. Install it before configuring the plugin.')
      const root = realpathSync(resolve(dirname(entry), '../..'))
      const aliases: Array<{ name: string; alias: string; onlyModule: true }> = []
      for (const [name, specifier] of Object.entries(ALIASES)) {
        if (options.skip?.includes(name)) continue
        const alias = resolveSpecifier(specifier, from, roots)
        if (!alias) throw new Error(`Cannot resolve Redact alias: ${specifier}`)
        aliases.push({ name, alias, onlyModule: true })
      }
      const previous = compiler.options.resolve.alias || {}
      compiler.options.resolve.alias = Array.isArray(previous)
        ? [...aliases, ...previous]
        : Object.fromEntries([
            ...aliases.map(({ name, alias }) => [name + '$', alias]),
            ...Object.entries(previous).filter(([name]) => !aliases.some(alias => alias.name + '$' === name)),
          ])
      const reactDir = findPackageDir('react', from)
      const version = reactDir && JSON.parse(readFileSync(resolve(reactDir, 'package.json'), 'utf8')).version
      if (typeof version === 'string' && /^18\./.test(version)) {
        compiler.options.module.rules.push({
          test: /\.js$/,
          include: (file: string) => realpathSync(file).replaceAll('\\', '/').startsWith(root.replaceAll('\\', '/') + '/dist/'),
          use: [{ loader: resolve(pluginDir, 'react18-loader.cjs'), options: { packageRoot: root, version } }],
        })
      }
      compiler.hooks.normalModuleFactory.tap('redact', factory => {
        factory.hooks.afterResolve.tap('redact', data => {
          const created = data.createData
          if (!created?.resource) return
          const old = created.resource
          const next = selectedFeatureResource(old, root, features)
          if (!next) return
          created.resource = next
          if (created.request) created.request = created.request.replace(old, next)
          if (created.userRequest) created.userRequest = created.userRequest.replace(old, next)
        })
      })
    },
  }
}

export default redact
