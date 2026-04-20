#!/usr/bin/env node
// Flip exports to publish form (types: src, import: dist) for all publishable
// packages, bump the version, and add publishConfig. Idempotent. Run before
// `pnpm publish`. The dev-time resolver (`dom-vite` plugin) still picks the
// `import` target — after this flip that's `./dist/index.js`, which means
// dev requires a prior `node scripts/build.mjs`.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const VERSION = process.env.TDV_VERSION || '0.1.0-alpha.0'
const TAG = process.env.TDV_TAG || 'next'

const targets = [
  { dir: 'packages/core', name: '@tanstack/dom-core' },
  { dir: 'packages/scheduler', name: '@tanstack/scheduler' },
  {
    dir: 'packages/react',
    name: '@tanstack/react',
    exports: {
      '.': { types: './src/index.ts', import: './dist/index.js' },
      './jsx-runtime': {
        types: './src/jsx-runtime.ts',
        import: './dist/jsx-runtime.js',
      },
      './jsx-dev-runtime': {
        types: './src/jsx-runtime.ts',
        import: './dist/jsx-runtime.js',
      },
    },
  },
  {
    dir: 'packages/react-dom',
    name: '@tanstack/react-dom',
    exports: {
      '.': { types: './src/index.ts', import: './dist/index.js' },
      './client': { types: './src/client.ts', import: './dist/client.js' },
      './test-utils': {
        types: './src/test-utils.ts',
        import: './dist/test-utils.js',
      },
    },
  },
  { dir: 'packages/react-dom-server', name: '@tanstack/react-dom-server' },
  {
    dir: 'packages/dom-vite',
    name: '@tanstack/dom-vite',
    // dom-vite re-declares each shim as a runtime `dependency` so installing
    // just `@tanstack/dom-vite` pulls the full matching set. The plugin
    // resolves these from its own node_modules context (`pluginDir`) so
    // pnpm's nested-in-`.pnpm` layout still works.
    extraDeps: {
      '@tanstack/dom-core': true,
      '@tanstack/scheduler': true,
      '@tanstack/react': true,
      '@tanstack/react-dom': true,
      '@tanstack/react-dom-server': true,
    },
  },
]

for (const t of targets) {
  const pkgPath = resolve(root, t.dir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  pkg.version = VERSION
  pkg.main = './dist/index.js'
  pkg.module = './dist/index.js'
  pkg.types = './src/index.ts'
  pkg.files = ['dist', 'src']
  if (!pkg.exports) {
    pkg.exports = {
      '.': { types: './src/index.ts', import: './dist/index.js' },
    }
  }
  // Override exports if the target supplies them (multi-entry packages).
  if (t.exports) pkg.exports = t.exports
  else if (pkg.exports['.'] && typeof pkg.exports['.'] === 'object') {
    pkg.exports['.'] = {
      types: './src/index.ts',
      import: './dist/index.js',
    }
  }
  // Publish with a non-default tag so `@tanstack/react` doesn't resolve to
  // this on a plain `npm install @tanstack/react` — consumers have to opt in
  // via `npm install @tanstack/react@next` until we graduate the dist-tag.
  pkg.publishConfig = {
    access: 'public',
    tag: TAG,
  }
  // Internal workspace dep versions → real semver so pnpm/npm can resolve
  // against the published registry entries. Also re-bump any sibling @tanstack
  // shim dep that was already flipped on a previous run (script is idempotent
  // across versions — `workspace:*` only fires the first time).
  const siblingPkgs = new Set(targets.map((x) => x.name))
  for (const field of ['dependencies', 'peerDependencies']) {
    const deps = pkg[field]
    if (!deps) continue
    for (const k in deps) {
      if (deps[k] === 'workspace:*' || siblingPkgs.has(k)) deps[k] = VERSION
    }
  }
  // Apply extra shim deps for consolidated install targets (`@tanstack/dom-vite`).
  if (t.extraDeps) {
    pkg.dependencies ||= {}
    for (const k in t.extraDeps) pkg.dependencies[k] = VERSION
  }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`  ✓ ${t.name} → ${VERSION} (tag: ${TAG})`)
}

console.log('\nNext:')
console.log('  1. node scripts/build.mjs          # produces dist/')
console.log(`  2. pnpm -r publish --tag ${TAG} --no-git-checks`)
