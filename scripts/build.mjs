#!/usr/bin/env node
// Build the @tanstack/redact package to dist/.
//
// The package is laid out as one tree with internal subdirectories
// (core, react, dom, server, scheduler, vite). Every TS module is emitted
// as its own dist file, with relative imports preserved literally — that
// keeps a single runtime instance of every module no matter which subpath
// the consumer imports first, and preserves the import-graph boundaries
// the `redact()` Vite plugin needs at consumer-build time to swap feature
// `index.js` modules for their `stub.js` counterparts.
import { build } from 'esbuild'
import { execSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { resolve, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const pkgDir = resolve(root, 'packages/redact')
const srcDir = resolve(pkgDir, 'src')
const distDir = resolve(pkgDir, 'dist')

function listTsFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...listTsFiles(full))
    } else if (full.endsWith('.ts') && !full.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

// Each TS module emits its own dist file with all relative imports kept as
// literal external imports in the output. This preserves boundaries the
// `redact()` plugin needs to swap features/<name>/index.js → stub.js at
// consumer-build time, and keeps single-instance state because each module
// is emitted exactly once in dist/.
const externalizeRelative = {
  name: 'externalize-relative',
  setup(b) {
    b.onResolve({ filter: /^\.\.?\// }, (args) => {
      if (args.kind === 'entry-point') return null
      return { external: true, path: args.path }
    })
  },
}

async function buildPackage() {
  rmSync(distDir, { recursive: true, force: true })
  mkdirSync(distDir, { recursive: true })

  const tsFiles = listTsFiles(srcDir)
  console.log(`Building @tanstack/redact: ${tsFiles.length} entries...\n`)

  for (const tsFile of tsFiles) {
    const relPath = relative(srcDir, tsFile).replace(/\.ts$/, '')
    // The vite plugin runs in Node — uses fs/path/url. Browser/SSR code
    // never imports from `vite/`, so the `node:` builtins it uses are
    // safe to leave external in that one entry.
    const isVite = relPath.startsWith('vite' + sep) || relPath === 'vite'
    await build({
      entryPoints: [{ in: tsFile, out: relPath }],
      bundle: true,
      format: 'esm',
      platform: isVite ? 'node' : 'browser',
      target: 'es2022',
      outdir: distDir,
      external: isVite ? ['vite', 'node:*'] : [],
      sourcemap: true,
      splitting: false,
      plugins: [externalizeRelative],
      logLevel: 'warning',
    })
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
      jsxImportSource: '@tanstack/redact',
    },
    include: [
      resolve(pkgDir, 'src/**/*'),
      resolve(pkgDir, 'tsconfig.build-globals.d.ts'),
    ],
  }
  const tsconfigPath = resolve(pkgDir, 'tsconfig.build.json')
  const globalsPath = resolve(pkgDir, 'tsconfig.build-globals.d.ts')
  writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2))
  writeFileSync(globalsPath, `
declare const process: { env: { NODE_ENV?: string } }
declare module 'node:fs' {
  export const existsSync: any
  export const readFileSync: any
  export const realpathSync: any
}
declare module 'node:path' {
  export const dirname: any
  export const resolve: any
}
declare module 'node:url' {
  export const fileURLToPath: any
}
`)
  try {
    execSync(`npx tsc -p ${tsconfigPath}`, { cwd: root, stdio: 'inherit' })
  } finally {
    rmSync(tsconfigPath, { force: true })
    rmSync(globalsPath, { force: true })
  }

  console.log(`\n  ✓ @tanstack/redact`)
}

await buildPackage()
console.log('\nDone.')
