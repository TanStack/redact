#!/usr/bin/env node
// Build the @tanstack/redact package to dist/.
//
// The package is laid out as one tree with internal subdirectories
// (core, react, dom, server, scheduler, vite). Every TS module is emitted
// as its own dist file, with explicit relative JavaScript imports. That
// keeps a single runtime instance of every module no matter which subpath
// the consumer imports first, and preserves the import-graph boundaries
// the `redact()` Vite plugin needs at consumer-build time to swap feature
// `index.js` modules for their `stub.js` counterparts.
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs'
import { resolve, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const pkgDir = realpathSync(resolve(root, process.env.BUILD_PACKAGE_ROOT || 'packages/redact'))
await import('./vendor-cloudflare.mjs')
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

// Resolve against the original module tree, including TypeScript's .js to
// .ts substitution. Directory imports must name index.js for native ESM.
function explicitSpecifier(specifier, importer) {
  if (!/^\.\.?(?:\/|$)/.test(specifier)) return specifier
  const resolved = ts.resolveModuleName(specifier, importer, {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  }, ts.sys).resolvedModule?.resolvedFileName
  if (!resolved || !/\.(?:d\.)?ts$/.test(resolved)) {
    throw new Error(`Cannot emit relative module ${JSON.stringify(specifier)} from ${importer}`)
  }
  const path = relative(dirname(importer), resolved)
    .split(sep).join('/').replace(/\.(?:d\.)?ts$/, '.js')
  return path.startsWith('../') ? path : './' + path
}

// Resolve imports in TypeScript's emitter so esbuild can transform each module
// without bundling it. Bundling rewrites top-level const to var, which prevents
// consumer builds from propagating feature flags and removing disabled paths.
const explicitImports = context => source => {
  const visit = node => {
    if (ts.isStringLiteral(node) && node.parent && (
      ((ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)) && node.parent.moduleSpecifier === node) ||
      (ts.isCallExpression(node.parent) && node.parent.expression.kind === ts.SyntaxKind.ImportKeyword)
    )) {
      const specifier = explicitSpecifier(node.text, source.fileName)
      if (specifier !== node.text) {
        return ts.setTextRange(ts.setOriginalNode(context.factory.createStringLiteral(specifier), node), node)
      }
    }
    return ts.visitEachChild(node, visit, context)
  }
  return ts.visitNode(source, visit)
}

function emitDeclarationSpecifiers() {
  const printer = ts.createPrinter()
  for (const file of readdirSync(distDir, { recursive: true })) {
    if (!file.endsWith('.d.ts')) continue
    const path = resolve(distDir, file)
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
    let changed = false
    const result = ts.transform(source, [context => {
      const visit = node => {
        // Only module specifiers are rewritten. Inferred import(".") types
        // need the same explicit path as import/export declarations.
        const parent = node.parent
        if (ts.isStringLiteral(node) && parent && (
          ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) && parent.moduleSpecifier === node) ||
          (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent) && parent.parent.argument === parent) ||
          ts.isExternalModuleReference(parent)
        )) {
          const specifier = explicitSpecifier(node.text, path)
          if (specifier !== node.text) {
            changed = true
            return context.factory.createStringLiteral(specifier)
          }
        }
        return ts.visitEachChild(node, visit, context)
      }
      return node => ts.visitNode(node, visit)
    }])
    if (changed) writeFileSync(path, printer.printFile(result.transformed[0]))
    result.dispose()
  }
}

async function buildPackage() {
  rmSync(distDir, { recursive: true, force: true })
  mkdirSync(distDir, { recursive: true })

  const tsFiles = listTsFiles(srcDir)
  console.log(`Building @tanstack/redact: ${tsFiles.length} entries...\n`)

  // TypeScript resolves const enums across module boundaries before esbuild
  // emits each module. Otherwise the published files retain enum objects and
  // property lookups that a consumer cannot inline after the modules are split.
  const emitted = new Map()
  const program = ts.createProgram(tsFiles, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    sourceMap: true,
    inlineSources: true,
    preserveConstEnums: true,
    outDir: distDir,
    rootDir: srcDir,
    skipLibCheck: true,
  })
  program.emit(undefined, (path, contents, _bom, _error, sources) => {
    if (sources?.length === 1) {
      const source = sources[0].fileName
      const record = emitted.get(source) || {}
      if (path.endsWith('.map')) {
        const map = JSON.parse(contents)
        map.sources = [source]
        record.map = map
      } else record.code = contents.replace(/\/\/# sourceMappingURL=.*$/, '')
      emitted.set(source, record)
    }
  }, undefined, false, { before: [explicitImports] })
  const compiledTypescript = {
    name: 'compiled-typescript',
    setup(builder) {
      builder.onLoad({ filter: /\.ts$/ }, ({ path }) => {
        // Keep enum definitions available to /_all consumers. esbuild emits
        // their pure initializers so ordinary entries can still tree-shake them.
        if (program.getSourceFile(path)?.statements.some(ts.isEnumDeclaration)) return null
        const output = emitted.get(path)
        if (!output?.code || !output.map) throw new Error(`Missing TypeScript output for ${path}`)
        return {
          contents: output.code + '\n//# sourceMappingURL=data:application/json;base64,' + Buffer.from(JSON.stringify(output.map)).toString('base64'),
          loader: 'js',
          resolveDir: dirname(path),
        }
      })
    },
  }

  for (const tsFile of tsFiles) {
    const relPath = relative(srcDir, tsFile).replace(/\.ts$/, '')
    // Build adapters run in Node and can leave builtins external. The Next
    // React bridge is browser code, so only its config entry uses Node.
    const isNodeEntry = relPath.startsWith('vite' + sep) || relPath === 'next' + sep + 'index' || relPath.startsWith('vinext' + sep) || relPath.startsWith('cloudflare' + sep)
    await build({
      absWorkingDir: pkgDir,
      entryPoints: [{ in: tsFile, out: relPath }],
      bundle: false,
      format: 'esm',
      platform: isNodeEntry ? 'node' : 'browser',
      // This is a library build. The consuming app chooses its environment;
      // esbuild's browser default would otherwise bake in development mode.
      define: { 'process.env.NODE_ENV': 'process.env.NODE_ENV' },
      target: 'es2022',
      outdir: distDir,
      sourcemap: true,
      splitting: false,
      plugins: [compiledTypescript],
      logLevel: 'warning',
    })
  }

  for (const loader of ['loader.cjs', 'dev-cache-loader.cjs']) {
    writeFileSync(resolve(distDir, 'next', loader), readFileSync(resolve(srcDir, 'next', loader)))
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
  export const writeFileSync: any
}
declare module 'node:path' {
  export const dirname: any
  export const resolve: any
}
declare module 'node:url' {
  export const fileURLToPath: any
  export const pathToFileURL: any
}
declare module 'node:module' {
  export const findPackageJSON: any
  export const createRequire: any
  export const registerHooks: any
}
`)
  try {
    execFileSync(process.execPath, [fileURLToPath(import.meta.resolve('typescript/lib/tsc.js')), '-p', tsconfigPath], {
      cwd: root,
      stdio: 'inherit',
    })
  } finally {
    rmSync(tsconfigPath, { force: true })
    rmSync(globalsPath, { force: true })
  }
  emitDeclarationSpecifiers()

  console.log(`\n  ✓ @tanstack/redact`)
}

await buildPackage()
console.log('\nDone.')
