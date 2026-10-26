import { defineConfig } from 'vite'
import { redact } from '@tanstack/redact/vite'

export default defineConfig({
  // This app's tsconfig maps react to Redact's source rather than
  // @types/react, so the feature type declarations do not apply.
  plugins: [redact({ dts: false })],
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: '@tanstack/redact',
  },
  server: { middlewareMode: true },
  appType: 'custom',
})
