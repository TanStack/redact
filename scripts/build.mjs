#!/usr/bin/env node
// Build every @tanstack/* package to dist/ as ESM + .d.ts.
// Consumers install these as normal npm packages.
import { build } from 'esbuild'
import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// No aliases during build — rely on `external` to keep cross-package imports
// as bare specifiers so consumers resolve them through their own package
// resolution, ensuring ONE runtime instance of each @tanstack/* module.

const packages = [
  {
    name: '@tanstack/dom-core',
    dir: 'packages/core',
    entries: { 'index.js': 'src/index.ts' },
  },
  {
    name: '@tanstack/scheduler',
    dir: 'packages/scheduler',
    entries: { 'index.js': 'src/index.ts' },
  },
  {
    name: '@tanstack/react',
    dir: 'packages/react',
    entries: {
      'index.js': 'src/index.ts',
      'jsx-runtime.js': 'src/jsx-runtime.ts',
    },
  },
  {
    name: '@tanstack/react-dom',
    dir: 'packages/react-dom',
    // Build the internal union first, then thin re-export shims that import
    // from it. Keeps a single copy of reconciler state across all entries.
    entries: {
      '_all.js': 'src/_all.ts',
    },
    postBuild: ({ distDir }) => {
      // Emit tiny facades that re-export from _all.js
      writeFileSync(
        resolve(distDir, 'index.js'),
        `export { flushSync, unstable_batchedUpdates, createPortal, preconnect, prefetchDNS, preload, preinit, preloadModule, preinitModule, version } from './_all.js'
export * as default from './_all.js'
`,
      )
      writeFileSync(
        resolve(distDir, 'client.js'),
        `export { createRoot, hydrateRoot } from './_all.js'\n`,
      )
      writeFileSync(
        resolve(distDir, 'test-utils.js'),
        `export { act } from './_all.js'\n`,
      )
    },
  },
  {
    name: '@tanstack/react-dom-server',
    dir: 'packages/react-dom-server',
    entries: { 'index.js': 'src/index.ts' },
  },
  {
    name: '@tanstack/dom-vite',
    dir: 'packages/dom-vite',
    entries: { 'index.js': 'src/index.ts' },
    external: ['vite', 'node:*'],
    platform: 'node',
  },
]

async function buildPackage(pkg) {
  const pkgDir = resolve(root, pkg.dir)
  const distDir = resolve(pkgDir, 'dist')
  rmSync(distDir, { recursive: true, force: true })
  mkdirSync(distDir, { recursive: true })

  // Keep cross-@tanstack imports EXTERNAL so consumers end up with a single
  // copy of each package. If we inlined (`bundle: true` without externals),
  // @tanstack/react-dom's dist would include its own ReactSharedInternals and
  // hooks would break with "mismatching versions of React" when user code
  // also imports @tanstack/react directly.
  const externals = [
    '@tanstack/react',
    '@tanstack/react/jsx-runtime',
    '@tanstack/react-dom',
    '@tanstack/react-dom/client',
    '@tanstack/react-dom/test-utils',
    '@tanstack/react-dom-server',
    '@tanstack/dom-core',
    '@tanstack/scheduler',
    ...(pkg.external ?? []),
  ]
  // Build all entries of a package together with splitting enabled so shared
  // modules (e.g. react-dom's hydration.ts imported by both index and client)
  // end up in one chunk — otherwise each entry gets its own copy and
  // module-level state (CLAIMED WeakSet, caches) ends up duplicated at
  // runtime, breaking cross-entry coordination.
  const entryPoints = Object.entries(pkg.entries).map(([out, src]) => ({
    in: resolve(pkgDir, src),
    out: out.replace(/\.js$/, ''),
  }))
  await build({
    entryPoints,
    bundle: true,
    format: 'esm',
    platform: pkg.platform ?? 'browser',
    target: 'es2022',
    outdir: distDir,
    external: externals,
    sourcemap: true,
    logLevel: 'warning',
  })

  if (pkg.postBuild) {
    pkg.postBuild({ distDir })
  }

  // Generate .d.ts files. tsc --emitDeclarationOnly.
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      strict: false,
      skipLibCheck: true,
      declaration: true,
      emitDeclarationOnly: true,
      outDir: './dist',
      rootDir: './src',
      jsx: 'react-jsx',
      jsxImportSource: '@tanstack/react',
      paths: {
        '@tanstack/dom-core': [resolve(root, 'packages/core/src/index.ts')],
        '@tanstack/react': [resolve(root, 'packages/react/src/index.ts')],
        '@tanstack/react/jsx-runtime': [resolve(root, 'packages/react/src/jsx-runtime.ts')],
        '@tanstack/react-dom': [resolve(root, 'packages/react-dom/src/index.ts')],
        '@tanstack/react-dom/client': [resolve(root, 'packages/react-dom/src/client.ts')],
      },
    },
    include: [resolve(pkgDir, 'src/**/*')],
  }
  const tsconfigPath = resolve(pkgDir, 'tsconfig.build.json')
  writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2))
  try {
    execSync(`npx tsc -p ${tsconfigPath}`, { cwd: root, stdio: 'inherit' })
  } catch {
    // Non-fatal: declarations may be incomplete, but JS still builds.
  } finally {
    rmSync(tsconfigPath, { force: true })
  }

  console.log(`  ✓ ${pkg.name}`)
}

console.log('Building packages...\n')
for (const pkg of packages) {
  await buildPackage(pkg)
}
console.log('\nDone.')
