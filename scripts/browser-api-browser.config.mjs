import { resolve } from 'node:path'
import config from './browser-api.config.mjs'

export default {
  ...config,
  root: resolve(config.root, 'tests'),
  resolve: { alias: config.resolve.alias.map((alias) => alias.find.source === '^react-dom\\/server$' && process.env.REACT_REFERENCE === '1'
    ? { ...alias, replacement: resolve('benchmarks/reference/node_modules/react-dom/server.browser.js') }
    : alias) },
  optimizeDeps: { include: ['react/jsx-dev-runtime'] },
  test: {
    include: ['browser-api.test.tsx'],
    testNamePattern: /^(?!.*pipeable).*$/,
    browser: {
      enabled: true, name: 'chromium', provider: 'playwright',
      providerOptions: { launch: { channel: 'chrome' } },
      headless: true, screenshotFailures: false,
    },
  },
}
