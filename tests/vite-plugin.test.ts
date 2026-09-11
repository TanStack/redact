// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { redact } from '@tanstack/redact/vite'
import { build } from 'vite'

const { JSDOM } = createRequire(import.meta.url)('jsdom')

function flattenPlugins(plugins: any): Array<any> {
  return [plugins].flat(Infinity)
}

function findPlugin(plugins: any, name: string): any {
  const plugin = flattenPlugins(plugins).find((p) => p.name === name)
  expect(plugin).toBeDefined()
  return plugin
}

describe('redact vite plugin', () => {
  it.each(['ts', 'js'])('redirects disabled registration imports in %s modules', async (extension) => {
    const plugin = findPlugin(redact({ preset: 'nano' }), 'redact')
    const importer = `/package/${extension === 'ts' ? 'src' : 'dist'}/dom/features/index.${extension}`
    const calls: Array<string> = []
    const context = {
      async resolve(id: string, from: string, options: any) {
        expect(from).toBe(importer)
        expect(options).toEqual({ custom: true, skipSelf: true })
        calls.push(id)
        return { id: resolve(importer, '..', id) + (extension === 'ts' ? '.ts' : '') }
      },
    }
    for (const feature of ['activity', 'fragment-refs', 'view-transition', 'portal', 'context', 'memo', 'suspense', 'forward-ref', 'lazy', 'class', 'hydration']) {
      const specifier = `./${feature}${extension === 'js' ? '/index.js' : ''}`
      await expect(plugin.resolveId.call(context, specifier, importer, { custom: true }))
        .resolves.toBe(resolve(importer, '..', feature, `stub.${extension}`))
      expect(calls.at(-1)).toBe(`./${feature}/stub${extension === 'js' ? '.js' : ''}`)
    }
    expect(calls).toHaveLength(11)
  })

  it.each(['ts', 'js'])('keeps peer imports on the same disabled implementation in %s modules', async (extension) => {
    const plugin = findPlugin(redact({ preset: 'nano' }), 'redact')
    const importer = `/package/${extension === 'ts' ? 'src' : 'dist'}/dom/features/suspense/full.${extension}`
    for (const feature of ['context', 'hydration', 'fragment-refs', 'view-transition']) {
      for (const base of [`../${feature}`, `../../features/${feature}`]) {
        const specifier = base + (extension === 'js' ? '/index.js' : '')
        const context = {
          async resolve(id: string, from: string, options: any) {
            expect(id).toBe(specifier)
            expect(from).toBe(importer)
            expect(options.skipSelf).toBe(true)
            return { id: resolve(importer, '..', base, `index.${extension}`) }
          },
        }
        await expect(plugin.resolveId.call(context, specifier, importer))
          .resolves.toBe(resolve(importer, '..', base, `stub.${extension}`))
      }
    }
  })

  it.each(['ts', 'js'])('does not redirect enabled, unrelated, or RSC imports in %s modules', async (extension) => {
    const importer = `/package/dist/dom/features/index.${extension}`
    const suffix = extension === 'js' ? '/index.js' : ''
    const enabled = findPlugin(redact({ features: { viewTransitions: true } }), 'redact')
    const neverResolve = { resolve() { throw new Error('Unexpected feature redirect') } }
    for (const feature of ['context', 'hydration', 'fragment-refs', 'view-transition']) {
      await expect(enabled.resolveId.call(neverResolve, `./${feature}${suffix}`, importer)).resolves.toBeNull()
      await expect(enabled.resolveId.call(neverResolve, `../${feature}${suffix}`, importer)).resolves.toBeNull()
    }
    const disabled = findPlugin(redact({ preset: 'nano' }), 'redact')
    await expect(disabled.resolveId.call({ ...neverResolve, environment: { name: 'rsc' } }, `./context${suffix}`, importer)).resolves.toBeNull()
    await expect(disabled.resolveId.call({
      resolve: async () => ({ id: `/other/context/index.${extension}` }),
    }, `../context${suffix}`, importer)).resolves.toBeNull()
    await expect(disabled.resolveId.call(neverResolve, './unknown/index.js', importer)).resolves.toBeNull()
  })

  it.each([
    { preset: 'full', viewTransitions: true },
    { preset: 'full', viewTransitions: false },
    { preset: 'nano', viewTransitions: false },
    { preset: 'nano', viewTransitions: true },
  ] as const)('bundles $preset with viewTransitions=$viewTransitions without leaking the animation implementation', async ({ preset, viewTransitions }) => {
    const source = resolve(import.meta.dirname, '../packages/redact/src')
    const fixture = '\0redact-view-transition-feature-fixture'
    let modules: string[] = []
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [
        ...redact({ preset, features: viewTransitions ? { viewTransitions: true } : {} }),
        {
          name: 'view-transition-feature-fixture',
          resolveId(id) { if (id === fixture) return id },
          load(id) {
            if (id !== fixture) return
            return `
              import { ViewTransition, createElement, startTransition, addTransitionType } from ${JSON.stringify(source + '/react/index.ts')};
              import { createRoot } from ${JSON.stringify(source + '/dom/client.ts')};
              export function mount(container) {
                const root = createRoot(container);
                const render = text => root.render(createElement(ViewTransition, { name: 'flag-check' }, createElement('span', null, text)));
                render('initial');
                return {
                  render,
                  transition(text) { startTransition(() => { addTransitionType('test'); render(text); }); },
                  unmount: () => root.unmount()
                };
              }
            `
          },
          generateBundle(_options, bundle) {
            modules = Object.values(bundle).flatMap((item) => item.type === 'chunk' ? Object.keys(item.modules) : [])
          },
        },
      ],
      build: {
        write: false,
        minify: false,
        rollupOptions: {
          input: fixture,
          preserveEntrySignatures: 'strict',
          output: { format: 'iife', name: 'RedactViewTransitionFixture' },
        },
      },
    })
    expect(modules.some((id) => id.endsWith('/features/view-transition/full.ts'))).toBe(viewTransitions)
    expect(modules.some((id) => id.endsWith('/features/view-transition/visual.ts'))).toBe(viewTransitions)
    const output = Array.isArray(result) ? result[0] : result
    if (!output || !('output' in output)) throw new Error('Expected a completed Vite bundle')
    const chunk = output.output.find((item) => item.type === 'chunk')
    if (!chunk || chunk.type !== 'chunk') throw new Error('Expected a JavaScript chunk')
    const dom = new JSDOM('', { url: 'https://redact.test' })
    const { document } = dom.window
    let nativeCalls = 0
    if (!viewTransitions) {
      Object.defineProperty(document, 'startViewTransition', {
        value() { nativeCalls++; throw new Error('Disabled view transitions must not call the browser API') },
      })
    }
    const api = new Function('document', chunk.code + '; return RedactViewTransitionFixture;')(document)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const mounted = api.mount(container)
    try {
      const span = container.firstChild
      expect(container.textContent).toBe('initial')
      mounted.transition('updated')
      // Unsupported browsers and the disabled feature keep normal sync rendering.
      expect(container.textContent).toBe('updated')
      expect(container.firstChild).toBe(span)
      expect((span as HTMLElement).style.getPropertyValue('view-transition-name')).toBe('')
      expect(nativeCalls).toBe(0)
    } finally {
      mounted.unmount()
      dom.window.close()
    }
  })

  it('does not pull DOM animation code into the React API entry', async () => {
    const fixture = '\0redact-view-transition-api-fixture'
    const source = resolve(import.meta.dirname, '../packages/redact/src/react/index.ts')
    let modules: string[] = []
    await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [
        ...redact(),
        {
          name: 'view-transition-api-fixture',
          resolveId(id) { if (id === fixture) return id },
          load(id) {
            if (id === fixture) return `export { ViewTransition, startTransition, addTransitionType } from ${JSON.stringify(source)};`
          },
          generateBundle(_options, bundle) {
            modules = Object.values(bundle).flatMap((item) => item.type === 'chunk' ? Object.keys(item.modules) : [])
          },
        },
      ],
      build: {
        write: false,
        minify: false,
        rollupOptions: { input: fixture, preserveEntrySignatures: 'strict', output: { format: 'es' } },
      },
    })
    expect(modules.some((id) => id.includes('/src/dom/'))).toBe(false)
  })

  it.each([
    { preset: 'full', activity: true, fragmentRefs: true },
    { preset: 'full', activity: false, fragmentRefs: true },
    { preset: 'full', activity: true, fragmentRefs: false },
    { preset: 'full', activity: false, fragmentRefs: false },
    { preset: 'nano', activity: false, fragmentRefs: false },
    { preset: 'nano', activity: true, fragmentRefs: false },
    { preset: 'nano', activity: false, fragmentRefs: true },
    { preset: 'nano', activity: true, fragmentRefs: true },
  ] as const)('bundles $preset with activity=$activity fragmentRefs=$fragmentRefs without leaking peer implementations', async ({ preset, activity, fragmentRefs }) => {
    const source = resolve(import.meta.dirname, '../packages/redact/src')
    const fixture = '\0redact-new-api-feature-fixture'
    let modules: string[] = []
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [
        ...redact({ preset, features: Object.fromEntries(Object.entries({ activity, fragmentRefs }).filter(([, enabled]) => enabled !== (preset === 'full'))) }),
        {
          name: 'new-api-feature-fixture',
          resolveId(id) { if (id === fixture) return id },
          load(id) {
            if (id !== fixture) return
            return `
              import { Activity, Fragment, createElement, createRef } from ${JSON.stringify(source + '/react/index.ts')};
              import { createRoot } from ${JSON.stringify(source + '/dom/client.ts')};
              export function mount(container) {
                const root = createRoot(container);
                const ref = createRef();
                const render = mode => root.render(createElement(Fragment, { ref },
                  createElement(Activity, { mode }, createElement('button', null, 'child'))));
                render('visible');
                return { ref, render, unmount: () => root.unmount() };
              }
            `
          },
          generateBundle(_options, bundle) {
            modules = Object.values(bundle).flatMap((item) => item.type === 'chunk' ? Object.keys(item.modules) : [])
          },
        },
      ],
      build: {
        write: false,
        minify: false,
        rollupOptions: {
          input: fixture,
          preserveEntrySignatures: 'strict',
          output: { format: 'iife', name: 'RedactNewApiFixture' },
        },
      },
    })
    expect(modules.some((id) => id.endsWith('/features/activity/full.ts'))).toBe(activity)
    expect(modules.some((id) => id.endsWith('/features/activity/stub.ts'))).toBe(!activity)
    expect(modules.some((id) => id.endsWith('/dom/fragment-instance.ts'))).toBe(fragmentRefs)
    expect(modules.some((id) => id.endsWith('/features/fragment-refs/stub.ts'))).toBe(!fragmentRefs)
    const output = Array.isArray(result) ? result[0] : result
    if (!output || !('output' in output)) throw new Error('Expected a completed Vite bundle')
    const chunk = output.output.find((item) => item.type === 'chunk')
    if (!chunk || chunk.type !== 'chunk') throw new Error('Expected a JavaScript chunk')
    const dom = new JSDOM('', { url: 'https://redact.test' })
    const { document } = dom.window
    const api = new Function('document', chunk.code + '; return RedactNewApiFixture;')(document)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const mounted = api.mount(container)
    try {
      const button = container.firstChild as HTMLButtonElement
      let clicks = 0
      if (fragmentRefs) {
        expect(mounted.ref.current).toBeTruthy()
        mounted.ref.current.addEventListener('click', () => clicks++)
        button.click()
        expect(clicks).toBe(1)
      } else expect(mounted.ref.current).toBe(null)
      mounted.render('hidden')
      expect(container.firstChild).toBe(activity ? button : null)
      expect(button.style.display).toBe(activity ? 'none' : '')
      button.click()
      expect(clicks).toBe(fragmentRefs ? 1 : 0)
      mounted.render('visible')
      const revealed = container.firstChild as HTMLButtonElement
      expect(revealed === button).toBe(activity)
      expect(revealed.style.display).toBe('')
      revealed.click()
      expect(clicks).toBe(fragmentRefs ? 2 : 0)
    } finally {
      mounted.unmount()
      dom.window.close()
    }
  })

  it.each([
    { preset: 'full', context: false, memo: true, suspense: false, forwardRef: true, classComponents: true },
    { preset: 'full', context: false, memo: false, suspense: true, forwardRef: true, classComponents: true },
    { preset: 'full', context: false, memo: true, suspense: true, forwardRef: true, classComponents: true },
    { preset: 'full', context: true, memo: true, suspense: true, forwardRef: true, classComponents: true },
    { preset: 'nano', context: false, memo: false, suspense: false, forwardRef: false, classComponents: false },
    { preset: 'nano', context: false, memo: false, suspense: false, forwardRef: true, classComponents: false },
    { preset: 'nano', context: false, memo: false, suspense: false, forwardRef: false, classComponents: true },
    { preset: 'full', context: true, memo: true, suspense: true, forwardRef: false, classComponents: true },
    { preset: 'full', context: true, memo: true, suspense: true, forwardRef: true, classComponents: false },
  ] as const)('bundles $preset with context=$context memo=$memo suspense=$suspense forwardRef=$forwardRef classComponents=$classComponents', async ({ preset, ...features }) => {
    const { context, memo, suspense, forwardRef, classComponents } = features
    const source = resolve(import.meta.dirname, '../packages/redact/src')
    const fixture = '\0redact-feature-fixture'
    let modules: string[] = []
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [
        ...redact({ preset, features: Object.fromEntries(Object.entries(features).filter(([, enabled]) => enabled !== (preset === 'full'))) }),
        {
          name: 'feature-fixture',
          resolveId(id) { if (id === fixture) return id },
          load(id) {
            if (id !== fixture) return
            return `
              import { createElement, createContext, memo, Suspense, useContext } from ${JSON.stringify(source + '/react/index.ts')};
              import { createRoot } from ${JSON.stringify(source + '/dom/client.ts')};
              const Context = createContext('default');
              const Reader = memo(() => createElement('span', null, useContext(Context)));
              export function mount(container) {
                const root = createRoot(container);
                root.render(createElement(Context.Provider, { value: 'provided' },
                  createElement(Suspense, { fallback: 'loading' }, createElement(Reader))));
                return () => root.unmount();
              }
            `
          },
          generateBundle(_options, bundle) {
            modules = Object.values(bundle).flatMap((item) => item.type === 'chunk' ? Object.keys(item.modules) : [])
          },
        },
      ],
      build: {
        write: false,
        minify: false,
        rollupOptions: {
          input: fixture,
          preserveEntrySignatures: 'strict',
          output: { format: 'iife', name: 'RedactFeatureFixture' },
        },
      },
    })
    expect(modules.some((id) => id.endsWith('/features/context/full.ts'))).toBe(context)
    expect(modules.some((id) => id.endsWith('/features/context/stub.ts'))).toBe(!context)
    expect(modules.some((id) => id.endsWith('/features/memo/full.ts'))).toBe(memo)
    expect(modules.some((id) => id.endsWith('/features/suspense/full.ts'))).toBe(suspense)
    expect(modules.some((id) => id.endsWith('/features/forward-ref/full.ts'))).toBe(forwardRef)
    expect(modules.some((id) => id.endsWith('/features/forward-ref/stub.ts'))).toBe(!forwardRef)
    expect(modules.some((id) => id.endsWith('/features/class/full.ts'))).toBe(classComponents)
    expect(modules.some((id) => id.endsWith('/features/class/stub.ts'))).toBe(!classComponents)
    const output = Array.isArray(result) ? result[0] : result
    if (!output || !('output' in output)) throw new Error('Expected a completed Vite bundle')
    const chunk = output.output.find((item) => item.type === 'chunk')
    if (!chunk || chunk.type !== 'chunk') throw new Error('Expected a JavaScript chunk')
    const dom = new JSDOM('')
    const { document } = dom.window
    const api = new Function('document', chunk.code + '; return RedactFeatureFixture;')(document)
    const container = document.createElement('div')
    const unmount = api.mount(container)
    try {
      expect(container.textContent).toBe(context ? 'provided' : 'default')
    } finally {
      unmount()
      dom.window.close()
    }
  })

  it('aliases React DOM server runtime entrypoints', async () => {
    const packageRoot = resolve(import.meta.dirname, '../packages/redact')
    const plugin = findPlugin(redact({
      packageRoots: {
        '@tanstack/redact': packageRoot,
      },
    }), 'redact')

    plugin.configResolved?.({
      root: resolve(import.meta.dirname, '..'),
      server: { fs: { allow: [] } },
    } as any)

    const context = { environment: { name: 'ssr' } }
    for (const entry of ['react-dom/server', 'react-dom/server.browser', 'react-dom/server.bun', 'react-dom/server.edge', 'react-dom/server.node']) {
      await expect(plugin.resolveId.call(context, entry)).resolves.toMatch(
        /packages\/redact\/dist\/server\/index\.js$/,
      )
      await expect(plugin.resolveId.call({ environment: { name: 'rsc' } }, entry)).resolves.toBeNull()
    }
    await expect(plugin.resolveId.call(context, 'react-dom/static.edge')).resolves.toMatch(
      /packages\/redact\/dist\/server\/index\.js$/,
    )
  })

  it('prunes force-included React optimizer deps outside RSC', () => {
    const plugin = findPlugin(redact({
      skip: ['scheduler'],
    }), 'redact:optimize-deps-guard')
    const config = {
      optimizeDeps: {
        include: [
          'react',
          'react-dom/client',
          'scheduler',
          '@vitejs/plugin-rsc/vendor/react-server-dom/client.browser',
        ],
      },
      environments: {
        client: {
          optimizeDeps: {
            include: [
              'react',
              '@example/library > react-dom/client',
              'scheduler',
              '@tanstack/react-router > @tanstack/react-store',
            ],
          },
        },
        ssr: {
          optimizeDeps: {
            include: ['react-dom/server', 'scheduler'],
          },
        },
        rsc: {
          optimizeDeps: {
            include: ['react', 'react-dom/server'],
          },
        },
      },
    }

    plugin.configResolved(config)

    expect(config.optimizeDeps.include).toEqual([
      'scheduler',
      '@vitejs/plugin-rsc/vendor/react-server-dom/client.browser',
    ])
    expect(config.environments.client.optimizeDeps.include).toEqual([
      'scheduler',
      '@tanstack/react-router > @tanstack/react-store',
    ])
    expect(config.environments.ssr.optimizeDeps.include).toEqual(['scheduler'])
    expect(config.environments.rsc.optimizeDeps.include).toEqual([
      'react',
      'react-dom/server',
    ])
  })
})
