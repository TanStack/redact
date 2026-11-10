// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { redact } from '@tanstack/redact/vite'
import { build } from 'vite'

const { JSDOM } = createRequire(import.meta.url)('jsdom')
const { parseAst } = createRequire(createRequire(import.meta.url).resolve('vite'))('rollup/parseAst')

function flattenPlugins(plugins: any): Array<any> {
  return [plugins].flat(Infinity)
}

function findPlugin(plugins: any, name: string): any {
  const plugin = flattenPlugins(plugins).find((p) => p.name === name)
  expect(plugin).toBeDefined()
  return plugin
}

describe('redact vite plugin', () => {
  it.each((['src', 'dist'] as const).flatMap(tree => ([
    { preset: 'full', override: undefined, enabled: true },
    { preset: 'nano', override: undefined, enabled: false },
    { preset: 'full', override: false, enabled: false },
    { preset: 'nano', override: true, enabled: true },
  ] as const).flatMap(options => [false, true].map(development => ({ tree, ...options, development })))))('bundles $tree SVG aliases for $preset with override=$override and development=$development', async ({ tree, preset, override, enabled, development }) => {
    const source = resolve(import.meta.dirname, `../packages/redact/${tree}`)
    const extension = tree === 'src' ? 'ts' : 'js'
    const fixture = '\0redact-svg-feature-fixture'
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      define: { 'process.env.NODE_ENV': JSON.stringify(development ? 'development' : 'production') },
      plugins: [
        ...redact({ preset, packageRoots: { '@tanstack/redact': resolve(source, '..') }, features: { hydration: true, ...(override === undefined ? {} : { svgAttributeAliases: override }) } }),
        {
          name: 'svg-feature-fixture',
          resolveId(id) { if (id === fixture) return id },
          load(id) {
            if (id === fixture) return `
              export { attributeName } from ${JSON.stringify(source + '/core/attributes.' + extension)};
              import { createElement } from ${JSON.stringify(source + '/react/index.' + extension)};
              import { renderToString } from ${JSON.stringify(source + '/server/index.' + extension)};
              import { hydrateRoot } from ${JSON.stringify(source + '/dom/client.' + extension)};
              const element = name => createElement('svg', null, createElement('text', { [name]: 12, suppressHydrationWarning: true }, 'a'));
              export const svgHtml = name => renderToString(element(name));
              export const hydrateSvg = (container, name) => hydrateRoot(container, element(name));
            `
          },
        },
      ],
      build: {
        write: false,
        minify: false,
        rollupOptions: { input: fixture, preserveEntrySignatures: 'strict', output: { format: 'iife', name: 'SVGFixture' } },
      },
    })
    const output = Array.isArray(result) ? result[0] : result
    if (!output || !('output' in output)) throw new Error('Expected a completed Vite bundle')
    const chunk = output.output.find(item => item.type === 'chunk')!
    if (chunk.type !== 'chunk') throw new Error('Expected JavaScript')
    const dom = new JSDOM()
    const { attributeName, svgHtml, hydrateSvg } = new Function('document', chunk.code + '; return SVGFixture;')(dom.window.document)
    for (const name of ['viewBox', 'gradientUnits', 'preserveAspectRatio', 'customCamelCase', 'fontSizeCustom', 'fontSize\n', 'text-anchor'])
      expect(attributeName(name, true)).toBe(name)
    expect(attributeName('fontSize', false)).toBe('fontsize')
    if (!enabled && development) {
      expect(() => attributeName('textAnchor', true)).toThrow('svgAttributeAliases: true')
      expect(() => attributeName('fontSize', true)).toThrow('svgAttributeAliases: true')
      expect(() => svgHtml('fontSize')).toThrow('svgAttributeAliases: true')
      const container = dom.window.document.createElement('div')
      container.innerHTML = '<svg><text font-size="12">a</text></svg>'
      expect(() => hydrateSvg(container, 'fontSize')).toThrow('svgAttributeAliases: true')
    } else {
      expect(attributeName('textAnchor', true)).toBe(enabled ? 'text-anchor' : 'textAnchor')
      expect(attributeName('fontSize', true)).toBe(enabled ? 'font-size' : 'fontSize')
      expect(svgHtml('fontSize')).toContain(`${enabled ? 'font-size' : 'fontSize'}="12"`)
    }
    expect(chunk.code.includes('SVG_HYPHENATED_ATTRS')).toBe(enabled || development)
    expect(chunk.code.includes('requires svgAttributeAliases')).toBe(!enabled && development)
    expect(svgHtml('font-size')).toContain('font-size="12"')
    dom.window.close()
  })

  it.each(['18.2.0', '18.3.1', '19.3.1'])('targets the consumer React %s without changing unrelated modules or RSC', async (version) => {
    const root = mkdtempSync(resolve(tmpdir(), 'redact-version-'))
    try {
      const react = resolve(root, 'node_modules/react')
      mkdirSync(react, { recursive: true })
      writeFileSync(resolve(react, 'package.json'), JSON.stringify({ version }))
      const plugins = redact({ resolveFrom: root, packageRoots: { '@tanstack/redact': resolve(import.meta.dirname, '../packages/redact') } })
      const plugin = findPlugin(plugins, 'redact')
      const compiler = findPlugin(plugins, 'redact:react18')
      plugin.configResolved({ root })
      const id = await plugin.resolveId.call({}, 'react')
      const code = `export const version = '19.2.3'; export default { version: '19.2.3' };`
      const result = compiler.transform.call({ parse: parseAst }, code, id)
      if (version.startsWith('18.')) {
        expect(result.code).toContain(JSON.stringify(version))
        expect(() => compiler.transform.call({ parse: parseAst }, '', id)).toThrow('React 18 adaptation failed')
      } else expect(result).toBeNull()
      expect(compiler.transform.call({}, '', '/unrelated/react/index.js')).toBeNull()
      expect(compiler.transform.call({ environment: { name: 'rsc' } }, '', id)).toBeNull()
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it.each(['ts', 'js'])('redirects disabled registration imports in %s modules', async (extension) => {
    const plugin = findPlugin(redact({ preset: 'nano' }), 'redact')
    const importer = `${resolve(import.meta.dirname, '../packages/redact')}/${extension === 'ts' ? 'src' : 'dist'}/dom/features/index.${extension}`
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
    const importer = `${resolve(import.meta.dirname, '../packages/redact')}/${extension === 'ts' ? 'src' : 'dist'}/dom/features/suspense/full.${extension}`
    for (const feature of ['context', 'hydration', 'fragment-refs', 'view-transition', 'class', 'suspense-hydration']) {
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

  it.each(['ts', 'js'])('preserves query and fragment suffixes on disabled runtime features in %s modules', async (extension) => {
    const packageRoot = resolve(import.meta.dirname, '../packages/redact')
    const runtime = `${packageRoot}/${extension === 'ts' ? 'src' : 'dist'}/dom`
    const plugin = findPlugin(redact({ preset: 'nano' }), 'redact')
    for (const suffix of ['?v=abc123', '?v=abc123&mode=one?two#fragment', '#fragment', '']) {
      const importer = `${runtime}/dispatcher.${extension}?v=importer`
      for (const feature of ['context', 'hydration', 'fragment-refs', 'view-transition', 'class', 'suspense-runtime', 'suspense-hydration']) {
        const specifier = `./features/${feature}/index.js`
        const resolved = `${runtime}/features/${feature}/index.${extension}${suffix}`
        await expect(plugin.resolveId.call({ resolve: async () => ({ id: resolved }) }, specifier, importer))
          .resolves.toBe(`${runtime}/features/${feature}/stub.${extension}${suffix}`)
        await expect(plugin.resolveId.call({ resolve: async () => ({ id: `/app/features/${feature}/index.${extension}${suffix}` }) }, specifier, importer))
          .resolves.toBeNull()
      }
      const registration = `${runtime}/features/index.${extension}${suffix}`
      const request = `./context/index.js${suffix}`
      await expect(plugin.resolveId.call({
        resolve: async (id: string) => {
          expect(id).toBe(`./context/stub.js${suffix}`)
          return { id: `${runtime}/features/context/stub.${extension}${suffix}` }
        },
      }, request, registration)).resolves.toBe(`${runtime}/features/context/stub.${extension}${suffix}`)
      await expect(plugin.resolveId.call({ environment: { name: 'rsc' }, resolve() { throw new Error('RSC must retain native imports') } }, request, registration))
        .resolves.toBeNull()
    }
  })

  it.each(['ts', 'js'])('does not redirect enabled, unrelated, or RSC imports in %s modules', async (extension) => {
    const importer = `${resolve(import.meta.dirname, '../packages/redact')}/dist/dom/features/index.${extension}`
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
    for (const feature of ['hydration', 'suspense-hydration']) {
      await expect(disabled.resolveId.call({
        resolve: async () => ({ id: `/app/features/${feature}/index.${extension}` }),
      }, `../${feature}${suffix}`, `/app/page.${extension}`)).resolves.toBeNull()
    }
    await expect(disabled.resolveId.call({
      async resolve(id: string) {
        expect(id).toBe(`./hydration${suffix}`)
        return { id: `/app/features/hydration/index.${extension}` }
      },
    }, `./hydration${suffix}`, `/app/features/index.${extension}`)).resolves.toBeNull()
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
              const LegacyProvider = { $$typeof: Symbol.for('react.provider'), _context: Context };
              const Reader = memo(() => createElement('span', null, useContext(Context)));
              export function mount(container) {
                const root = createRoot(container);
                root.render(createElement(Context.Provider, { value: 'provided' },
                  createElement(Suspense, { fallback: 'loading' }, createElement(Reader)),
                  createElement(Context, { value: 'nested' },
                    createElement(Context.Consumer, null, value => createElement('i', null, value))),
                  createElement(LegacyProvider, { value: 'legacy' }, createElement(Reader))));
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
      expect(container.textContent).toBe(context ? 'providednestedlegacy' : 'defaultdefaultdefault')
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

  it('aliases use-sync-external-store file subpaths to the React entry', async () => {
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

    const context = { environment: { name: 'client' } }
    const reactEntry = await plugin.resolveId.call(context, 'react')
    expect(reactEntry).toMatch(/packages\/redact\/dist\//)
    for (const specifier of [
      'use-sync-external-store',
      'use-sync-external-store/index.js',
      'use-sync-external-store/shim',
      'use-sync-external-store/shim/index.js',
    ]) {
      await expect(plugin.resolveId.call(context, specifier)).resolves.toBe(reactEntry)
    }
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


describe('streamed hydration feature boundary',()=>{
  it.each([
    {hydration:false,suspense:true},
    {hydration:false,suspense:false},
    {hydration:true,suspense:false},
    {hydration:true,suspense:true},
  ])('bundles hydration=$hydration suspense=$suspense without leaking disabled implementations',async features=>{
    const source=resolve(import.meta.dirname,'../packages/redact/src'),fixture='\0streamed-hydration-feature-fixture'
    let modules:string[]=[]
    await build({configFile:false,logLevel:'silent',plugins:[...redact({preset:'full',features}),{
      name:'streamed-hydration-feature-fixture',resolveId(id){if(id===fixture)return id},
      load(id){if(id===fixture)return `export {createRoot,hydrateRoot} from ${JSON.stringify(source+'/dom/client.ts')};`},
      generateBundle(_options,bundle){modules=Object.values(bundle).flatMap(item=>item.type==='chunk'?Object.keys(item.modules):[])},
    }],build:{write:false,minify:true,rollupOptions:{input:fixture,preserveEntrySignatures:'strict',output:{format:'es'}}}})
    expect(modules.some(id=>id.endsWith('/features/suspense-hydration/full.ts'))).toBe(features.hydration&&features.suspense)
    expect(modules.some(id=>id.endsWith('/features/suspense/full.ts'))).toBe(features.suspense)
  })
})
