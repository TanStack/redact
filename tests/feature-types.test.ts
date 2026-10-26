// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { redact, type RedactOptions } from '@tanstack/redact/vite'

const FEATURES = [
  'activity', 'fragmentRefs', 'viewTransitions', 'portal', 'context', 'suspense',
  'memo', 'forwardRef', 'lazy', 'classComponents', 'hydration',
]

// Runs the plugin's configResolved hook against a temporary Vite root and
// returns the generated declaration file, or null when none was written.
function generate(options: RedactOptions, { file = 'src/redact.gen.d.ts', makeSrc = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'redact-dts-'))
  if (makeSrc) mkdirSync(join(root, 'src'))
  const warnings: Array<string> = []
  try {
    const plugin = [redact(options)].flat().find((p: any) => p.name === 'redact')
    plugin.configResolved({ root, logger: { warn: (message: string) => warnings.push(message) } })
    const path = join(root, file)
    return { source: existsSync(path) ? readFileSync(path, 'utf8') : null, warnings }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

// App code that uses each feature. `// expect: <feature>` marks a line that
// must fail type-checking when that feature is disabled.
const app = `
import { Activity, Component, Suspense, addTransitionType, createContext, forwardRef, lazy, memo, useContext, type ComponentType, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { createRoot, hydrateRoot } from 'react-dom/client'

const Theme = createContext('light')
export function ReadTheme() { return <p>{useContext(Theme)}</p> }
export function RefProp({ ref }: { ref?: Ref<HTMLInputElement> }) { return <input ref={ref} /> }
export const Memoized = memo(ReadTheme)
export const LazyTheme = lazy(async () => ({ default: ReadTheme }))

export class Counter extends Component<{}, { count: number }> {
  state = { count: 0 }
  componentWillUnmount() {}
  render() { return <button onClick={() => this.setState({ count: this.state.count + 1 })}>{this.state.count}</button> }
}
export class Mounts extends Component {
  componentDidMount() {} // expect: classComponents
  render() { return null }
}
export class Boundary extends Component<{ children?: ReactNode }, { failed: boolean }> { // expect: classComponents
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? null : this.props.children }
}

export const elements = [
  <ReadTheme />,
  <RefProp />,
  <Memoized />,
  <Counter />,
  <Boundary><ReadTheme /></Boundary>,
  <Mounts />, // expect: classComponents
  <Theme value="dark"><ReadTheme /></Theme>, // expect: context
  <Theme.Provider value="dark"><ReadTheme /></Theme.Provider>, // expect: context
  <Suspense fallback={null}><ReadTheme /></Suspense>, // expect: suspense
  <Activity mode="hidden"><ReadTheme /></Activity>, // expect: activity
  <LazyTheme />, // expect: lazy
  <div>{createPortal(<ReadTheme />, document.body)}</div>, // expect: portal
]
export const Input = forwardRef<HTMLInputElement, {}>((props, ref) => <input ref={ref} {...props} />) // expect: forwardRef
hydrateRoot(document, <ReadTheme />).unmount() // expect: hydration
createRoot(document.body).render(<ReadTheme />)
addTransitionType('navigate')
export function acceptsComponent(component: ComponentType) { return component }
acceptsComponent(Counter)
`

// Mount the fixture under tests/ so package resolution walks the workspace
// node_modules: @tanstack/redact links to packages/redact, and @types/react
// comes from the root.
const fixtureDir = resolve(import.meta.dirname, '__feature_types__')
const appPath = join(fixtureDir, 'app.tsx')
const generatedPath = join(fixtureDir, 'redact.gen.d.ts')
const gatePath = (feature: string) => resolve(import.meta.dirname, '../packages/redact/disabled', `${feature}.d.ts`)

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  jsx: ts.JsxEmit.ReactJSX,
  strict: true,
  noEmit: true,
  skipLibCheck: false,
  types: [],
}

function virtualFiles(generated: string): Record<string, string> {
  return { [generatedPath]: generated, [appPath]: app }
}

function typecheck(generated: string) {
  const files = virtualFiles(generated)
  const host = ts.createCompilerHost(compilerOptions)
  const { fileExists, readFile, getSourceFile } = host
  host.fileExists = (path) => path in files || fileExists(path)
  host.readFile = (path) => files[path] ?? readFile(path)
  host.getSourceFile = (path, version, ...rest) => path in files
    ? ts.createSourceFile(path, files[path]!, version, true)
    : getSourceFile(path, version, ...rest)
  const program = ts.createProgram(Object.keys(files), compilerOptions, host)
  const errorsIn = (path: string) => {
    const source = program.getSourceFile(path)
    if (!source) throw new Error(`${path} is not part of the program`)
    return [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)]
  }
  const loaded = new Set(program.getSourceFiles().map((file) => resolve(file.fileName)))
  return { program, loaded, errorsIn }
}

function linesWithErrors(diagnostics: ReadonlyArray<ts.Diagnostic>) {
  const lines = new Map<number, Array<string>>()
  for (const d of diagnostics) {
    const line = d.file!.getLineAndCharacterOfPosition(d.start!).line
    lines.set(line, [...(lines.get(line) ?? []), ts.flattenDiagnosticMessageText(d.messageText, '\n')])
  }
  return lines
}

function expectedLines(disabled: ReadonlyArray<string>) {
  const lines = new Map<number, string>()
  app.split('\n').forEach((text, line) => {
    const feature = text.match(/\/\/ expect: (\w+)/)?.[1]
    if (feature && disabled.includes(feature)) lines.set(line, feature)
  })
  return lines
}

function deprecatedCalls(generated: string): Array<string> {
  const files = virtualFiles(generated)
  const service = ts.createLanguageService({
    getScriptFileNames: () => Object.keys(files),
    getScriptVersion: () => '1',
    getScriptSnapshot: (path) => {
      const text = files[path] ?? ts.sys.readFile(path)
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
    },
    getCurrentDirectory: () => fixtureDir,
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: (path) => path in files || ts.sys.fileExists(path),
    readFile: (path) => files[path] ?? ts.sys.readFile(path),
    readDirectory: ts.sys.readDirectory,
    // Like tsc and tsserver, follow pnpm symlinks so the workspace's linked
    // @types/react copies resolve to one file.
    realpath: (path) => ts.sys.realpath?.(path) ?? path,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  })
  return service.getSuggestionDiagnostics(appPath)
    .filter((d) => d.reportsDeprecated)
    .map((d) => {
      const message = ts.flattenDiagnosticMessageText(d.messageText, ' ')
      return message.match(/of '(\w+)' is deprecated/)?.[1] ?? message
    })
    .sort()
}

describe('redact() feature types', () => {
  it('references one declaration file per disabled feature', () => {
    const nano = generate({ preset: 'nano' }).source!
    expect(nano.match(/@tanstack\/redact\/disabled\/\w+/g)).toEqual(FEATURES.map((f) => `@tanstack/redact/disabled/${f}`))
    for (const feature of FEATURES) expect(existsSync(gatePath(feature))).toBe(true)

    const full = generate({}).source!
    expect(full.match(/@tanstack\/redact\/disabled\/\w+/g)).toEqual(['@tanstack/redact/disabled/viewTransitions'])

    const mixed = generate({ features: { context: false, viewTransitions: true } }).source!
    expect(mixed.match(/@tanstack\/redact\/disabled\/\w+/g)).toEqual(['@tanstack/redact/disabled/context'])
  })

  it('honors the dts option and skips missing directories', () => {
    const custom = generate({ dts: 'src/custom.d.ts' }, { file: 'src/custom.d.ts' })
    expect(custom.source).toContain('disabled/viewTransitions')
    expect(generate({ dts: false }).source).toBeNull()

    // The default path is skipped quietly in projects without src/.
    const missing = generate({}, { makeSrc: false })
    expect(missing.source).toBeNull()
    expect(missing.warnings).toEqual([])

    const missingCustom = generate({ dts: 'types/redact.d.ts' }, { file: 'types/redact.d.ts' })
    expect(missingCustom.source).toBeNull()
    expect(missingCustom.warnings).toHaveLength(1)
    expect(missingCustom.warnings[0]).toContain('does not exist')
  })

  it('reports type errors only where code uses a disabled feature', () => {
    const { program, loaded, errorsIn } = typecheck(generate({ preset: 'nano' }).source!)
    for (const feature of FEATURES) expect(loaded.has(gatePath(feature)), feature).toBe(true)
    // A gate file without imports or exports would declare an ambient 'react'
    // module that hides React's real types instead of augmenting them.
    for (const feature of FEATURES) expect(ts.isExternalModule(program.getSourceFile(gatePath(feature))!), feature).toBe(true)
    for (const feature of FEATURES) expect(errorsIn(gatePath(feature)), feature).toEqual([])
    expect(errorsIn(generatedPath)).toEqual([])

    const actual = linesWithErrors(errorsIn(appPath))
    const expected = expectedLines(FEATURES)
    expect([...actual.keys()].sort((a, b) => a - b)).toEqual([...expected.keys()].sort((a, b) => a - b))
    for (const [line, feature] of expected) {
      expect(actual.get(line)!.join('\n'), `line ${line + 1}`).toContain(`features.${feature}`)
    }
  })

  it('leaves enabled features untouched', () => {
    const { errorsIn } = typecheck(generate({}).source!)
    expect(linesWithErrors(errorsIn(appPath))).toEqual(new Map())

    const contextOnly = typecheck(generate({ features: { context: false } }).source!)
    expect([...linesWithErrors(contextOnly.errorsIn(appPath)).keys()].sort((a, b) => a - b))
      .toEqual([...expectedLines(['context']).keys()].sort((a, b) => a - b))
  })

  it('marks calls that cannot fail as deprecated', () => {
    expect(deprecatedCalls(generate({ preset: 'nano' }).source!))
      .toEqual(['addTransitionType', 'createPortal', 'hydrateRoot', 'lazy', 'memo'])
    expect(deprecatedCalls(generate({}).source!)).toEqual(['addTransitionType'])
  })
})
