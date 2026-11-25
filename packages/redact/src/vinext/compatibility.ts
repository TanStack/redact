import { readFileSync } from 'node:fs'
import { createRequire, findPackageJSON } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { correctFlightTimings } from './flight-timing'

const shimPackages = ['next', 'vinext', 'server-only', 'client-only', 'private-next-instrumentation-client']
const requestHandlers = ['vinext/server/app-rsc-handler', 'vinext/server/app-rsc-combined-handler']
const clientDependencies = ['vinext > @unpic/react', 'vinext > ipaddr.js', 'vinext > web-vitals']

export type VinextVersionSupport = 'supported' | 'prerelease' | 'untested'

/**
 * Classifies a Vinext version for the adapter's compatibility policy.
 * Stable 1.3.x and 1.4.x releases are supported; prereleases and other
 * versions continue through the source-shape checks with a warning.
 */
export function vinextVersionSupport(version: string): VinextVersionSupport {
  if (version.includes('-')) return 'prerelease'
  const [major, minor] = version.split('.')
  return major === '1' && (minor === '3' || minor === '4') ? 'supported' : 'untested'
}

// These modules carry framework state or request semantics. Both Vite's main
// graph and its separate dependency optimizer must see the same correction.
export function correctVinextModule(code: string, id: string, directory: string): string | null {
  id = id.split('?')[0]!.replace(/\\/g, '/')
  directory = directory.replace(/\\/g, '/')
  if (id === directory + '/server/app-rsc-handler.js') {
    const original = 'if (!options.skipTrailingSlashRedirect) {'
    if (code.includes('if (!isDataRequest && !options.skipTrailingSlashRedirect) {')) return null
    if (code.split(original).length !== 2) throw new Error('Unsupported Vinext Pages data handler. Update the Redact integration for this Vinext build.')
    return code.replace(original, 'if (!isDataRequest && !options.skipTrailingSlashRedirect) {')
  }
  if (id === directory + '/client/instrumentation-client-state.js') {
    if (code.includes('Symbol.for("vinext.client.instrumentationHooks")')) return null
    const replacements = [
      ['let clientInstrumentationHooks = null;', 'const clientInstrumentationKey = Symbol.for("vinext.client.instrumentationHooks");'],
      ['clientInstrumentationHooks = hooks;', 'Reflect.set(globalThis, clientInstrumentationKey, hooks);'],
      ['return clientInstrumentationHooks;', 'return Reflect.get(globalThis, clientInstrumentationKey) ?? null;'],
      ['clientInstrumentationHooks?.onRouterTransitionStart?.(href, navigationType);', 'getClientInstrumentationHooks()?.onRouterTransitionStart?.(href, navigationType);'],
    ]
    for (const [original, corrected] of replacements) {
      const expected = original === 'return clientInstrumentationHooks;' ? 3 : 2
      if (code.split(original!).length !== expected) throw new Error('Unsupported Vinext instrumentation state. Update the Redact integration for this Vinext build.')
      code = code.split(original!).join(corrected!)
    }
    return code
  }
  return null
}

function isShimInclude(id: string, excludes: string[]) {
  const target = id.slice(id.lastIndexOf('>') + 1).trim()
  // A package root covers its explicit, nested, .js, and glob entrypoints.
  return excludes.some(excluded => target === excluded || target.startsWith(excluded + '/'))
}

/**
 * Builds the Vite plugin that applies Vinext compatibility corrections and
 * resolves the public shims Redact needs.
 */
export function vinextCompatibility() {
  let directory = '', hasApp = false, excludes: string[] = [], externalRequire: any
  const transform = function(this: any, code: string, id: string) {
    const corrected = directory && (correctVinextModule(code, id, directory) || correctFlightTimings(code, id, source => this.parse(source)))
    return corrected ? { code: corrected, map: null } : null
  }
  const modulePlugin = { name: 'redact:vinext-modules', transform }
  const requirePlugins = new WeakSet<object>()
  function configure(name: string, config: any) {
    if (!directory) return
    const client = name === 'client' || config.consumer === 'client'
    if (!client) {
      config.resolve ||= {}
      if (Array.isArray(config.resolve.external)) config.resolve.external = config.resolve.external.filter((id: string) => !requestHandlers.includes(id))
      if (config.resolve.noExternal !== true) {
        const existing = config.resolve.noExternal
        config.resolve.noExternal = [...(Array.isArray(existing) ? existing : existing ? [existing] : []), 'vinext']
      }
    }
    const optimizer = config.optimizeDeps ||= {}
    const optimizerActive = !optimizer.noDiscovery || !!optimizer.include?.length
    const options = optimizer.rolldownOptions ||= {}
    let plugins = [options.plugins || []].flat(Infinity)
    plugins = plugins.filter((plugin: any) => plugin?.name !== modulePlugin.name)
    if (!client || hasApp) {
      optimizer.exclude = [...new Set([...(optimizer.exclude || []), ...excludes])]
      optimizer.include = optimizer.include?.filter((id: string) => !isShimInclude(id, excludes))
      plugins = plugins.filter((plugin: any) => plugin?.name !== 'vinext:dep-optimize-alias')
      if (!client && !plugins.some((plugin: any) => plugin && typeof plugin === 'object' && requirePlugins.has(plugin))) {
        // Rolldown's built-in plugins are class instances. Preserve the instance
        // so its native implementation and options reach the optimizer.
        const plugin = externalRequire({ external: excludes })
        requirePlugins.add(plugin)
        plugins.push(plugin)
      }
      if (client && optimizerActive) {
        optimizer.include = [...new Set([...(optimizer.include || []), ...clientDependencies.filter(id => !isShimInclude(id, optimizer.exclude.filter((entry: string) => !shimPackages.includes(entry))))])]
      }
    }
    options.plugins = [...plugins, modulePlugin]
  }
  return {
    config: {
      order: 'post',
      /** Resolves the installed Vinext package and configures compatibility hooks. */
      async handler(config: any) {
        const require = createRequire(resolve(config.root || '.', 'package.json'))
        // Vinext is ESM-only, so resolve its public package manifest through its
        // import condition without loading a second copy of the plugin.
        const packagePath = findPackageJSON('vinext', pathToFileURL(resolve(config.root || '.', 'package.json')))
        if (!packagePath) throw new Error('Install vinext before using the Redact Vinext integration.')
        directory = resolve(dirname(packagePath), 'dist')
        const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
        const support = vinextVersionSupport(pkg.version)
        if (support !== 'supported')
          console.warn(`[redact] ${support === 'prerelease' ? 'Prerelease' : 'Untested'} vinext version ${pkg.version}; continuing with source checks.`)
        hasApp = !!config.environments?.rsc
        const aliases = Array.isArray(config.resolve?.alias) ? config.resolve.alias : Object.entries(config.resolve?.alias || {}).map(([find, replacement]) => ({ find, replacement }))
        const publicShims = Object.keys((await import(pathToFileURL(resolve(directory, 'shims/public-shim-map.json.js')).href)).default)
        const shimEntries = [...publicShims, 'next/dist/client/components/navigation'].flatMap(id => [id, id + '.js'])
        excludes = [...new Set([...shimPackages, ...shimEntries, ...aliases.filter((alias: any) => typeof alias.find === 'string' && (alias.find.startsWith('next/') || alias.replacement?.replace(/\\/g, '/').startsWith(directory.replace(/\\/g, '/') + '/'))).map((alias: any) => alias.find)])] as string[]
        const vite = await import(pathToFileURL(require.resolve('vite')).href)
        externalRequire = vite.esmExternalRequirePlugin
        if (typeof externalRequire !== 'function') throw new Error('Redact Vinext integration requires Vite 8 with esmExternalRequirePlugin support.')
      },
    },
    configEnvironment: { order: 'post', handler: configure },
    configResolved: {
      order: 'post',
      handler(config: any) {
        for (const [name, environment] of Object.entries(config.environments)) configure(name, environment)
      },
    },
    resolveHandler(id: string) {
      if (directory && requestHandlers.includes(id)) return { id: resolve(directory, id.slice('vinext/'.length) + '.js'), external: false }
      return null
    },
    transform,
  }
}
