import { expect, it } from 'vitest'
import { ALIASES, isOwnedRuntimeFeature, resolveFeatures } from '../packages/redact/src/bundler-core/selection'

it('preserves the existing preset defaults and independent overrides', () => {
  const full = resolveFeatures('full', {})
  expect(full.viewTransitions).toBe(false)
  expect(Object.entries(full).filter(([key]) => key !== 'viewTransitions').every(([, value]) => value)).toBe(true)
  expect(Object.values(resolveFeatures('nano', {})).every(value => !value)).toBe(true)
  expect(resolveFeatures('nano', { hydration: true }).hydration).toBe(true)
  expect(resolveFeatures('nano', { hydration: true }).suspense).toBe(false)
  const changed = resolveFeatures('full', { hydration: false })
  expect(changed.hydration).toBe(false)
  expect(changed.suspense).toBe(true)
  changed.context = false
  expect(resolveFeatures('full', {}).context).toBe(true)
})

it('retains explicit file subpaths and exact public export targets', () => {
  expect(ALIASES['use-sync-external-store/shim/index.js']).toBe('@tanstack/redact')
  expect(ALIASES['react/jsx-runtime']).toBe('@tanstack/redact/jsx-runtime')
  expect(ALIASES['react-dom/server.browser']).toBe('@tanstack/redact/server')
  expect(ALIASES['react-dom/client']).toBe('@tanstack/redact/dom-client')
  expect(ALIASES['@tanstack/redact/dom-client']).toBe('@tanstack/redact/dom-client')
})

it.each([
  ['/chosen/src/dom/features/context/full.ts', '/chosen', true],
  ['/chosen/dist/dom/features/context/index.js', '/chosen/', true],
  ['/chosen/src/dom/features/context/full.ts?raw', '/chosen', true],
  ['/chosen-other/src/dom/features/context/full.ts', '/chosen', false],
  ['/app/features/context/index.js', '/chosen', false],
  ['/chosen/src/react/index.ts', '/chosen', false],
  ['C:\\chosen\\dist\\dom\\features\\context\\index.js', 'C:\\chosen', true],
  ['C:\\chosen-other\\dist\\dom\\features\\context\\index.js', 'C:\\chosen', false],
])('keeps ownership limited to the selected runtime: %s', (file, root, owned) => {
  expect(isOwnedRuntimeFeature(file, root)).toBe(owned)
})
