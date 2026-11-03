import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const entries: Record<string, string> = {
  react: './react.js',
  'react/jsx-runtime': '../react/jsx-runtime.js',
  'react/jsx-dev-runtime': '../react/jsx-runtime.js',
  'react/compiler-runtime': '../react/compiler-runtime.js',
  'react-dom': '../dom/index.js',
  'react-dom/client': './client.js',
  'react-dom/test-utils': '../dom/test-utils.js',
  'react-dom/server': '../server/index.js',
  'react-dom/server.browser': '../server/index.js',
  'react-dom/server.edge': '../server/index.js',
  'react-dom/server.node': '../server/index.js',
  'react-dom/server.bun': '../server/index.js',

  scheduler: '../scheduler/index.js',
}

/** Use Redact in the browser, keeping Next's server rendering and Flight on React. */
export function withRedact<T extends Record<string, any> | ((...args: any[]) => any)>(config: T = {} as T): T {
  if (typeof config === 'function') return ((...args: any[]) => withRedact(config(...args))) as T
  if (typeof config.then === 'function') return config.then((value: any) => withRedact(value))
  const version = createRequire(import.meta.url)('next/package.json').version as string
  const [major] = version.split('.').map(Number)
  if (!/^(?:15\.5|16\.[0-4])\.\d+$/.test(version)) throw new Error(`withRedact supports stable Next.js 15.5 and 16.0 through 16.4, received ${version}`)
  const aliases: Record<string, string> = {}
  for (const [name, entry] of Object.entries(entries)) {
    const target = fileURLToPath(new URL(entry, import.meta.url))
    aliases[name] = target
    if (name.startsWith('react')) {
      aliases[`next/dist/compiled/${name}`] = target
      const [pkg, ...rest] = name.split('/')
      aliases[`next/dist/compiled/${pkg}-experimental${rest.length ? '/' + rest.join('/') : ''}`] = target
    }
  }
  const rules = { ...config.turbopack?.rules }
  if (major! >= 16) rules['*.js'] = rules['*.js'] ? [rules['*.js']].flat() : []
  for (const [name, entry] of Object.entries(entries)) {
    const [pkg, subpath = 'index'] = name.split('/')
    const loaders = [{
      loader: fileURLToPath(new URL('./loader.cjs', import.meta.url)),
      options: {
        target: fileURLToPath(new URL(entry, import.meta.url)),
        defaultExport: name === 'react' || name === 'react-dom' || name === 'react-dom/client' || name.startsWith('react-dom/server'),
      },
    }]
    if (major! >= 16) {
      rules['*.js'].push({
        condition: { all: ['browser', { path: new RegExp(`(?:^|/)node_modules/(?:next/dist/compiled/)?${pkg}(?:-experimental)?/${subpath}\\.js$`) }] },
        loaders,
      })
    } else {
      for (const path of [pkg, `next/dist/compiled/${pkg}`, `next/dist/compiled/${pkg}-experimental`]) {
        const glob = `**/node_modules/${path}/${subpath}.js`
        if (glob in rules) throw new Error(`Conflicting Turbopack rule for ${glob}`)
        rules[glob] = { browser: { loaders } }
      }
    }
  }
  const devCacheLoader = version.startsWith('16.2.')
    ? fileURLToPath(new URL('./dev-cache-loader.cjs', import.meta.url))
    : undefined
  const devCachePath = /(?:^|[/\\])node_modules[/\\]next[/\\]dist[/\\](?:esm[/\\])?client[/\\]dev[/\\]debug-channel\.js$/
  if (devCacheLoader) rules['*.js'].push({
    condition: { all: ['browser', { path: /(?:^|\/)node_modules\/next\/dist\/(?:esm\/)?client\/dev\/debug-channel\.js$/ }, 'development'] },
    loaders: [{ loader: devCacheLoader }],
  })
  return {
    ...config,
    turbopack: {
      ...config.turbopack,
      rules,
    },
    webpack(webpackConfig: any, context: any) {
      const result = config.webpack ? config.webpack(webpackConfig, context) : webpackConfig
      if (!context.isServer) {
        if (context.dev && devCacheLoader) {
          result.module ||= {}
          result.module.rules ||= []
          result.module.rules.push({ test: devCachePath, use: [{ loader: devCacheLoader }] })
        }
        result.plugins ||= []
        result.plugins.push(new context.webpack.NormalModuleReplacementPlugin(
          /^(?:react(?:\/.*)?|react-dom(?:\/.*)?|scheduler|next\/dist\/compiled\/react(?:-dom)?(?:-experimental)?(?:\/.*)?)$/,
          (resource: { request: string }) => {
            if (aliases[resource.request]) resource.request = aliases[resource.request]!
          },
        ))
      }
      return result
    },
  }
}
