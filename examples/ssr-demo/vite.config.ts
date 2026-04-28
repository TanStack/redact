import { defineConfig } from 'vite'
import { redact } from '@tanstack/redact/vite'

export default defineConfig({
  plugins: [redact()],
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: '@tanstack/redact',
  },
  server: { middlewareMode: true },
  appType: 'custom',
})
