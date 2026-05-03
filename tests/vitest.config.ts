import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

const r = (p: string) => resolve(__dirname, '..', p)

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@tanstack/redact/jsx-runtime': r('packages/redact/src/react/jsx-runtime.ts'),
      '@tanstack/redact/jsx-dev-runtime': r('packages/redact/src/react/jsx-runtime.ts'),
      '@tanstack/redact/compiler-runtime': r('packages/redact/src/react/compiler-runtime.ts'),
      '@tanstack/redact/dom-client': r('packages/redact/src/dom/client.ts'),
      '@tanstack/redact/dom-test-utils': r('packages/redact/src/dom/test-utils.ts'),
      '@tanstack/redact/dom': r('packages/redact/src/dom/index.ts'),
      '@tanstack/redact/server': r('packages/redact/src/server/index.ts'),
      '@tanstack/redact/scheduler': r('packages/redact/src/scheduler/index.ts'),
      '@tanstack/redact/vite': r('packages/redact/src/vite/index.ts'),
      '@tanstack/redact': r('packages/redact/src/react/index.ts'),
      // React-shape aliases — what consumers will actually import
      'react/jsx-runtime': r('packages/redact/src/react/jsx-runtime.ts'),
      'react/jsx-dev-runtime': r('packages/redact/src/react/jsx-runtime.ts'),
      'react/compiler-runtime': r('packages/redact/src/react/compiler-runtime.ts'),
      react: r('packages/redact/src/react/index.ts'),
      'react-dom/client': r('packages/redact/src/dom/client.ts'),
      'react-dom/server': r('packages/redact/src/server/index.ts'),
      'react-dom/test-utils': r('packages/redact/src/dom/test-utils.ts'),
      'react-dom': r('packages/redact/src/dom/index.ts'),
      scheduler: r('packages/redact/src/scheduler/index.ts'),
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: '@tanstack/redact',
  },
})
