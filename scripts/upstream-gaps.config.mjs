import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const reference = process.env.REACT_REFERENCE === '1'
const source = resolve(process.env.REDACT_TEST_SOURCE || resolve(root, 'packages/redact/src'))
const installed = resolve(root, 'benchmarks/reference/node_modules')
const aliases = reference ? {
  'react/jsx-runtime': resolve(installed, 'react/jsx-runtime.js'),
  'react/jsx-dev-runtime': resolve(installed, 'react/jsx-dev-runtime.js'),
  'react-dom/client': resolve(installed, 'react-dom/client.js'),
  'react-dom': resolve(installed, 'react-dom/index.js'),
  react: resolve(installed, 'react/index.js'),
} : {
  'react/jsx-runtime': resolve(source, 'react/jsx-runtime.ts'),
  'react/jsx-dev-runtime': resolve(source, 'react/jsx-runtime.ts'),
  'react-dom/client': resolve(source, 'dom/client.ts'),
  'react-dom': resolve(source, 'dom/index.ts'),
  react: resolve(source, 'react/index.ts'),
}

export default defineConfig({
  root,
  test: {
    environment: 'jsdom',
    include: ['tests/upstream-parity.test.tsx', 'tests/context-suspense-updates.test.tsx'],
  },
  resolve: {
    alias: Object.entries(aliases).map(([name, replacement]) => ({
      find: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'),
      replacement,
    })),
  },
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
})
