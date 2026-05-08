import { defineConfig } from 'vite'
import { resolve } from 'node:path'

const r = (p: string) => resolve(__dirname, '..', '..', p)

export default defineConfig({
  resolve: {
    // Mirror the test config aliases so redact source (not dist) is consumed.
    alias: {
      '@tanstack/redact/jsx-runtime': r('packages/redact/src/react/jsx-runtime.ts'),
      '@tanstack/redact/dom-client': r('packages/redact/src/dom/client.ts'),
      '@tanstack/redact/dom': r('packages/redact/src/dom/index.ts'),
      '@tanstack/redact/_all': r('packages/redact/src/dom/_all.ts'),
      '@tanstack/redact': r('packages/redact/src/react/index.ts'),
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: '@tanstack/redact',
  },
  build: {
    minify: 'esbuild',
    sourcemap: false,
    target: 'es2022',
    rollupOptions: {
      output: {
        // Stable name so playwright/profile scripts can reference it
        entryFileNames: 'bench.[hash].js',
      },
    },
  },
})
