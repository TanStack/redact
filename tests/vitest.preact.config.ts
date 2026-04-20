/**
 * Alternative vitest config that points react/react-dom imports at the local
 * Preact fork via `preact/compat`. Used to discover where stock Preact breaks
 * on tanstack.com's real-world usage — each failing test is a gap in Preact's
 * React 19 compat surface that we'll eventually patch in our fork and send
 * upstream as one PR.
 *
 * Uses Preact's built `preact/compat` entries (require `npm run build` in
 * /Users/tannerlinsley/GitHub/preact first).
 *
 *   cd tests && pnpm exec vitest run --config vitest.preact.config.ts
 */
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

const r = (p: string) => resolve(__dirname, '..', p)
const PREACT = '/Users/tannerlinsley/GitHub/preact'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['**/*.test.{ts,tsx}'],
    // Force vitest to run Preact + compat + render-to-string through Vite's
    // transform pipeline instead of Node's native ESM resolver. The linked
    // fork lives outside node_modules so sibling `from 'preact'` imports
    // inside fork files need our aliases to resolve.
    server: {
      deps: {
        inline: [/preact/, /preact-render-to-string/],
      },
    },
  },
  resolve: {
    alias: [
      // React → preact/compat — order matters, longer specifiers first.
      { find: /^react-dom\/client$/, replacement: 'preact/compat/client' },
      { find: /^react-dom\/server$/, replacement: 'preact/compat/server' },
      { find: /^react-dom\/test-utils$/, replacement: 'preact/compat/test-utils' },
      { find: /^react-dom$/, replacement: 'preact/compat' },
      { find: /^react\/jsx-runtime$/, replacement: 'preact/compat/jsx-runtime' },
      { find: /^react\/jsx-dev-runtime$/, replacement: 'preact/compat/jsx-dev-runtime' },
      { find: /^react$/, replacement: 'preact/compat' },
      { find: /^scheduler$/, replacement: 'preact/compat/scheduler' },

      // Preact fork subpaths — every entry pinned with an exact-match regex
      // so `preact/hooks` doesn't shadow `preact`, and so sibling imports
      // inside linked fork files resolve to the right file regardless of
      // vite's node-resolution context.
      {
        find: /^preact\/compat\/client$/,
        replacement: `${PREACT}/compat/client.mjs`,
      },
      {
        find: /^preact\/compat\/server\.browser$/,
        replacement: `${PREACT}/compat/server.browser.js`,
      },
      {
        find: /^preact\/compat\/server$/,
        replacement: `${PREACT}/compat/server.mjs`,
      },
      {
        find: /^preact\/compat\/jsx-runtime$/,
        replacement: `${PREACT}/compat/jsx-runtime.mjs`,
      },
      {
        find: /^preact\/compat\/jsx-dev-runtime$/,
        replacement: `${PREACT}/compat/jsx-dev-runtime.mjs`,
      },
      {
        find: /^preact\/compat\/scheduler$/,
        replacement: `${PREACT}/compat/scheduler.mjs`,
      },
      {
        find: /^preact\/compat\/test-utils$/,
        replacement: `${PREACT}/test-utils/dist/testUtils.mjs`,
      },
      {
        find: /^preact\/compat$/,
        replacement: `${PREACT}/compat/dist/compat.mjs`,
      },
      {
        find: /^preact\/hooks$/,
        replacement: `${PREACT}/hooks/dist/hooks.mjs`,
      },
      {
        find: /^preact\/debug$/,
        replacement: `${PREACT}/debug/dist/debug.mjs`,
      },
      {
        find: /^preact\/jsx-runtime$/,
        replacement: `${PREACT}/jsx-runtime/dist/jsxRuntime.mjs`,
      },
      { find: /^preact$/, replacement: `${PREACT}/dist/preact.mjs` },

      // preact/compat/server does sibling lookups for preact-render-to-string
      // subpaths which vite can't follow across the symlinked fork.
      {
        find: /^preact-render-to-string\/stream-node$/,
        replacement: `${PREACT}/node_modules/preact-render-to-string/dist/stream-node.module.js`,
      },
      {
        find: /^preact-render-to-string\/stream$/,
        replacement: `${PREACT}/node_modules/preact-render-to-string/dist/stream.module.js`,
      },
      {
        find: /^preact-render-to-string$/,
        replacement: `${PREACT}/node_modules/preact-render-to-string/dist/index.mjs`,
      },

      // Shim-internal specifiers still resolve to our source — a handful of
      // tests reach into tanstack-dom package exports for test helpers.
      { find: '@tanstack/dom-core', replacement: r('packages/core/src/index.ts') },
      {
        find: '@tanstack/dom-hydration-runtime',
        replacement: r('packages/hydration-runtime/src/index.ts'),
      },
    ],
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
})
