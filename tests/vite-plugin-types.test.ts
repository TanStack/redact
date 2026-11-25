// @vitest-environment node
import { expect, it } from 'vitest'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import ts from 'typescript'

it('publishes typed Vite plugins for both exports', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'redact-vite-types-'))
  try {
    symlinkSync(resolve(import.meta.dirname, '../node_modules'), resolve(root, 'node_modules'), 'dir')
    const declaration = resolve(import.meta.dirname, '../packages/redact/dist/vite/index.js')
    const fixture = (entry: string) => `
      import defaultRedact, { redact } from ${JSON.stringify(entry)};
      import { defineConfig, type Plugin } from 'vite';
      type IsAny<T> = 0 extends (1 & T) ? true : false;
      type AssertFalse<T extends false> = T;
      export type NamedReturn = AssertFalse<IsAny<ReturnType<typeof redact>>>;
      export type DefaultReturn = AssertFalse<IsAny<ReturnType<typeof defaultRedact>>>;
      const plugins: Plugin[] = redact();
      defineConfig({ plugins: [redact(), ...defaultRedact(), ...plugins] });
    `
    const check = (entry: string) => {
      const file = resolve(root, 'consumer.mts')
      writeFileSync(file, fixture(entry))
      const program = ts.createProgram([file], {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        strict: true, skipLibCheck: true, noEmit: true, types: [],
      })
      return ts.getPreEmitDiagnostics(program).map(diagnostic => ({
        code: diagnostic.code,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      }))
    }
    // Prove the same consumer rejects the original public any return type.
    const control = resolve(root, 'untyped.d.mts')
    writeFileSync(control, 'export declare function redact(): any;\nexport default redact;\n')
    expect(check(resolve(root, 'untyped.mjs')).map(diagnostic => diagnostic.code)).toEqual([2344, 2344])
    expect(check(declaration)).toEqual([])
  } finally { rmSync(root, { recursive: true, force: true }) }
})
