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
      '@tanstack/dom-core': r('packages/core/src/index.ts'),
      '@tanstack/react/jsx-runtime': r('packages/react/src/jsx-runtime.ts'),
      '@tanstack/react/jsx-dev-runtime': r('packages/react/src/jsx-runtime.ts'),
      '@tanstack/react': r('packages/react/src/index.ts'),
      '@tanstack/react-dom/client': r('packages/react-dom/src/client.ts'),
      '@tanstack/react-dom/test-utils': r('packages/react-dom/src/test-utils.ts'),
      '@tanstack/react-dom': r('packages/react-dom/src/index.ts'),
      '@tanstack/react-dom-server': r('packages/react-dom-server/src/index.ts'),
      '@tanstack/scheduler': r('packages/scheduler/src/index.ts'),
      '@tanstack/dom-hydration-runtime': r('packages/hydration-runtime/src/index.ts'),
      // React-shape aliases (what consumers will actually import)
      'react/jsx-runtime': r('packages/react/src/jsx-runtime.ts'),
      'react/jsx-dev-runtime': r('packages/react/src/jsx-runtime.ts'),
      react: r('packages/react/src/index.ts'),
      'react-dom/client': r('packages/react-dom/src/client.ts'),
      'react-dom/server': r('packages/react-dom-server/src/index.ts'),
      'react-dom': r('packages/react-dom/src/index.ts'),
      scheduler: r('packages/scheduler/src/index.ts'),
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: '@tanstack/react',
  },
})
