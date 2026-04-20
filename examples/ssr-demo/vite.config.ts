import { defineConfig } from 'vite'
import { tanstackDom } from '@tanstack/dom-vite'

export default defineConfig({
  plugins: [tanstackDom()],
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: '@tanstack/react',
  },
  server: { middlewareMode: true },
  appType: 'custom',
})
