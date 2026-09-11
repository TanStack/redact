import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'
import { build as buildVite } from 'vite'
import ts from 'typescript'

const root = fileURLToPath(new URL('..', import.meta.url))
const packageRoot = realpathSync(resolve(root, process.env.BUILD_PACKAGE_ROOT || 'packages/redact'))
const entries = ['react/index', 'dom/client', 'dom/index', 'server/index']
const diagnostics = ['Hooks can only be called inside a function component.', 'flushPending exceeded 50 iterations']
const packageJSON = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'))
const publicEntries = Object.keys(packageJSON.exports).filter(entry => !entry.includes('*'))
  .map(entry => packageJSON.name + (entry === '.' ? '' : entry.slice(1)))
const jsdomPath = createRequire(resolve(root, 'tests/package.json')).resolve('jsdom')
const { JSDOM } = createRequire(import.meta.url)(jsdomPath)

// Every emitted relative dependency must resolve without a bundler. Inspect
// syntax nodes so string literal types and application strings stay untouched.
const declarations = []
let explicitImports = 0
for (const file of readdirSync(resolve(packageRoot, 'dist'), { recursive: true })) {
  if (!file.endsWith('.js') && !file.endsWith('.d.ts')) continue
  const path = resolve(packageRoot, 'dist', file)
  if (file.endsWith('.d.ts')) declarations.push(path)
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  const visit = node => {
    const parent = node.parent
    if (ts.isStringLiteral(node) && parent && (
      ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) && parent.moduleSpecifier === node) ||
      (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent) && parent.parent.argument === parent) ||
      ts.isExternalModuleReference(parent) ||
      (ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword && parent.arguments[0] === node)
    ) && /^\.\.?(?:\/|$)/.test(node.text)) {
      assert(node.text.endsWith('.js'), `${file} has a non-ESM relative import: ${node.text}`)
      const target = resolve(dirname(path), node.text)
      assert(existsSync(target), `${file} imports a missing JavaScript module: ${node.text}`)
      if (file.endsWith('.d.ts')) assert(existsSync(target.replace(/\.js$/, '.d.ts')), `${file} imports missing declarations: ${node.text}`)
      explicitImports++
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}
assert(explicitImports > 0, 'No emitted module specifiers were checked')

// A virtual consumer checks real package exports under NodeNext, with no
// workspace paths or skipLibCheck masking declaration resolution failures.
const consumerPath = resolve(packageRoot, '__verify_build__.mts')
const consumer = publicEntries.map((entry, index) => `import * as Entry${index} from ${JSON.stringify(entry)}; void Entry${index};`).join('\n') + `
import { cloneElement, createElement, useState, type ReactElement } from ${JSON.stringify(packageJSON.name)};
import { createRoot } from ${JSON.stringify(packageJSON.name + '/dom-client')};
import { createPortal } from ${JSON.stringify(packageJSON.name + '/dom')};
import { renderToString } from ${JSON.stringify(packageJSON.name + '/server')};
function Counter(): ReactElement {
  const [value, setValue] = useState(1);
  setValue(previous => previous + 1);
  return createElement('span', null, value);
}
const element = createElement(Counter);
const cloned: ReactElement = cloneElement(element);
void cloned;
createRoot(document.createDocumentFragment()).render(element);
createPortal(element, document.createDocumentFragment());
const html: string = renderToString(element);
void html;
`
const options = {
  noEmit: true,
  strict: true,
  skipLibCheck: false,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  types: [],
}
const host = ts.createCompilerHost(options)
const getSourceFile = host.getSourceFile.bind(host)
const fileExists = host.fileExists.bind(host)
const readFile = host.readFile.bind(host)
host.fileExists = path => path === consumerPath || fileExists(path)
host.readFile = path => path === consumerPath ? consumer : readFile(path)
host.getSourceFile = (path, languageVersion, ...rest) => path === consumerPath
  ? ts.createSourceFile(path, consumer, languageVersion, true)
  : getSourceFile(path, languageVersion, ...rest)
const program = ts.createProgram([consumerPath, ...declarations], options, host)
const typeErrors = ts.getPreEmitDiagnostics(program)
assert.equal(typeErrors.length, 0, ts.formatDiagnosticsWithColorAndContext(typeErrors, {
  getCanonicalFileName: file => file,
  getCurrentDirectory: () => root,
  getNewLine: () => '\n',
}))

// Fresh Node processes catch native module cycles and duplicated dispatcher
// state that disappear when esbuild collapses the graph into one bundle.
const firstImports = ['', '/dom-client', '/server', '/_all']
for (const mode of ['development', 'production']) {
  for (const first of firstImports) {
    execFileSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      await import(${JSON.stringify(packageJSON.name + first)});
      for (const entry of ${JSON.stringify(publicEntries)}) await import(entry);
      const React = await import(${JSON.stringify(packageJSON.name)});
      const client = await import(${JSON.stringify(packageJSON.name + '/dom-client')});
      const dom = await import(${JSON.stringify(packageJSON.name + '/dom')});
      const all = await import(${JSON.stringify(packageJSON.name + '/_all')});
      const server = await import(${JSON.stringify(packageJSON.name + '/server')});
      const jsx = await import(${JSON.stringify(packageJSON.name + '/jsx-runtime')});
      const jsxDev = await import(${JSON.stringify(packageJSON.name + '/jsx-dev-runtime')});
      assert.equal(client.createRoot, all.createRoot);
      assert.equal(client.hydrateRoot, all.hydrateRoot);
      assert.equal(dom.flushSync, all.flushSync);
      assert.equal(React.default.useState, React.useState);
      assert.equal(jsx.Fragment, React.Fragment);
      assert.equal(jsx, jsxDev);
      let update;
      function Counter() {
        const [value, setValue] = React.useState(1);
        update = setValue;
        return jsx.jsx('span', { children: value });
      }
      assert.equal(server.renderToString(React.createElement(Counter)), '<span>1</span>');
      const { JSDOM } = createRequire(import.meta.url)(${JSON.stringify(jsdomPath)});
      const window = new JSDOM('').window;
      globalThis.document = window.document;
      const container = document.createElement('div');
      const root = client.createRoot(container);
      root.render(React.createElement(Counter));
      assert.equal(container.textContent, '1');
      dom.flushSync(() => update(value => value + 1));
      assert.equal(container.textContent, '2');
      const clientUpdate = update;
      assert.equal(server.renderToString(React.createElement(Counter)), '<span>1</span>');
      all.flushSync(() => clientUpdate(value => value + 1));
      assert.equal(container.textContent, '3');
      root.unmount();
      assert.equal(container.textContent, '');
      window.close();
    `], {
      cwd: packageRoot,
      env: { ...process.env, NODE_ENV: mode },
      stdio: 'pipe',
    })
  }
}

const { redact } = await import(pathToFileURL(resolve(packageRoot, 'dist/vite/index.js')).href)
const featureCases = [
  { preset: 'full' },
  { preset: 'nano' },
  { preset: 'full', features: { context: false, hydration: false, fragmentRefs: false } },
  { preset: 'nano', features: { activity: true, fragmentRefs: true, viewTransitions: true, memo: true, suspense: true } },
]
const featurePaths = {
  activity: 'activity/full.js', context: 'context/full.js', memo: 'memo/full.js',
  suspense: 'suspense/full.js', forwardRef: 'forward-ref/full.js', lazy: 'lazy/full.js',
  classComponents: 'class/full.js', portal: 'portal/full.js', hydration: 'hydration/full.js',
  viewTransitions: 'view-transition/full.js',
}
for (const featureCase of featureCases) {
  const fixture = '\0redact-published-feature-check'
  let modules = []
  const result = await buildVite({
    root, configFile: false, logLevel: 'silent',
    plugins: [
      ...redact({ ...featureCase, packageRoots: { [packageJSON.name]: packageRoot } }),
      {
        name: 'published-feature-check',
        resolveId(id) { if (id === fixture) return id },
        load(id) {
          if (id !== fixture) return
          return `
            import * as React from 'react';
            import * as Redact from ${JSON.stringify(packageJSON.name)};
            import { createRoot } from 'react-dom/client';
            import { flushSync } from 'react-dom';
            import { renderToString } from 'react-dom/server';
            export const sameRuntime = React.useState === Redact.useState;
            const Context = React.createContext('default');
            const Reader = React.memo(() => React.createElement('span', null, React.useContext(Context)));
            export function mount(container) {
              const root = createRoot(container);
              root.render(React.createElement(Context.Provider, { value: 'provided' },
                React.createElement(React.Suspense, { fallback: 'loading' }, React.createElement(Reader))));
              return () => flushSync(() => root.unmount());
            }
            export const html = renderToString(React.createElement('span', null, 'server'));
          `
        },
        generateBundle(_options, bundle) {
          modules = Object.values(bundle).flatMap(item => item.type === 'chunk' ? Object.keys(item.modules) : [])
        },
      },
    ],
    build: {
      write: false, minify: false,
      rollupOptions: { input: fixture, preserveEntrySignatures: 'strict', output: { format: 'iife', name: 'PublishedRedact' } },
    },
  })
  const enabled = key => featureCase.features?.[key] ?? (key !== 'viewTransitions' && featureCase.preset === 'full')
  for (const [key, path] of Object.entries(featurePaths)) {
    assert.equal(modules.some(id => id.endsWith('/features/' + path)), enabled(key), `${featureCase.preset}: ${key} leaked or was removed`)
  }
  assert.equal(modules.some(id => id.endsWith('/dom/fragment-instance.js')), enabled('fragmentRefs'), 'Published fragmentRefs flag did not strip its implementation')
  assert(!modules.some(id => id.startsWith(resolve(packageRoot, 'src') + '/')), 'Published aliases pulled source modules into the bundle')
  assert.equal(modules.filter(id => id.endsWith('/react/shared-internals.js')).length, 1, 'Published aliases duplicated runtime state')
  const output = Array.isArray(result) ? result[0] : result
  const chunk = output.output.find(item => item.type === 'chunk')
  assert(chunk, 'Vite did not produce a published-package bundle')
  const window = new JSDOM('').window
  try {
    const api = runInNewContext(chunk.code + '\nPublishedRedact', { document: window.document, console, setTimeout, clearTimeout, queueMicrotask })
    assert(api.sameRuntime, 'React and Redact aliases resolved to different modules')
    assert.equal(api.html, '<span>server</span>')
    const container = window.document.createElement('div')
    const unmount = api.mount(container)
    assert.equal(container.textContent, enabled('context') ? 'provided' : 'default')
    unmount()
    assert.equal(container.textContent, '')
  } finally {
    window.close()
  }
}

let guardedModules = 0
for (const file of readdirSync(resolve(packageRoot, 'src'), { recursive: true })) {
  if (!file.endsWith('.ts') || file.endsWith('.d.ts')) continue
  const source = readFileSync(resolve(packageRoot, 'src', file), 'utf8')
  if (!source.includes('process.env.NODE_ENV')) continue
  const output = readFileSync(resolve(packageRoot, 'dist', file.replace(/\.ts$/, '.js')), 'utf8')
  assert(output.includes('process.env.NODE_ENV'), `Build baked an environment into ${file}`)
  guardedModules++
}
assert(guardedModules > 0, 'No environment-sensitive modules were checked')

const sizes = []
for (const mode of ['development', 'production']) {
  for (const entry of entries) {
    const bundles = []
    for (const tree of ['src', 'dist']) {
      const result = await build({
        absWorkingDir: packageRoot,
        entryPoints: [resolve(packageRoot, tree, entry + (tree === 'src' ? '.ts' : '.js'))],
        bundle: true, write: false, format: 'iife', globalName: 'RedactPackage',
        platform: 'browser', target: 'es2022', minify: true,
        define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
        logLevel: 'warning',
      })
      assert(!result.warnings.some(warning => warning.id === 'ignored-bare-import'), `${tree}/${entry} lost feature registration`)
      const code = result.outputFiles[0].text
      assert(!code.includes('process.env.NODE_ENV'), `${tree}/${entry} retained a runtime environment lookup`)
      const api = runInNewContext(code + '\nRedactPackage', { console, setTimeout, clearTimeout, queueMicrotask })
      bundles.push({ code, api })
      if (mode === 'production') sizes.push({ entry, tree, gzip: gzipSync(code).length })
      if (entry === 'react/index') {
        assert.throws(() => api.useState(0), error => mode === 'production'
          ? error.message === ''
          : error.message.startsWith(diagnostics[0]))
      }
    }
    assert.deepEqual(Object.keys(bundles[0].api).sort(), Object.keys(bundles[1].api).sort(), `${entry} changed exports during build`)
    for (const message of diagnostics) {
      assert.equal(bundles[1].code.includes(message), bundles[0].code.includes(message), `${entry} changed diagnostic behavior during build`)
      if (mode === 'production') assert(!bundles[1].code.includes(message), `${entry} retained a development diagnostic`)
    }
  }
}
console.log(`Build verification passed: ${explicitImports} explicit module imports, ${declarations.length} NodeNext declarations, 8 native import orders, 4 published feature bundles, ${guardedModules} environment-sensitive modules, and 16 matching source/dist consumer bundles.`)
console.log(JSON.stringify({ consumerIifeGzip: sizes }))
