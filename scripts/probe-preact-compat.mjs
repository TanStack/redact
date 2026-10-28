import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { resolve } from 'node:path'
const root = resolve(process.argv[2])
const bundle = await build({ stdin: { contents: 'export * from \"preact/compat\"', resolveDir: process.cwd() }, alias: { preact: root }, bundle: true, format: 'esm', platform: 'browser', write: false })
const compat = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64'))
const trace = []
compat.startTransition(() => trace.push('callback'))
trace.push('after')
assert.deepEqual(trace, ['callback', 'after'])
assert.equal(compat.useTransition()[0], false)
const value = {}
assert.equal(compat.useDeferredValue(value), value)
for (const name of ['useActionState', 'useOptimistic', 'useFormStatus', 'Activity', 'ViewTransition']) {
  assert.equal(name in compat, false, `${name} was added; review the comparison`)
}
assert.equal(compat.useInsertionEffect, compat.useLayoutEffect)
for (const name of ['use', 'useEffectEvent', 'useId', 'useSyncExternalStore']) assert.equal(typeof compat[name], 'function')
console.log('Preact compatibility probes passed: transition callback, pending state, deferred identity, insertion alias, and export inventory.')
