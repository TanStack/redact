import { resolve } from 'node:path'
import config from './activity-hydration.config.mjs'

export default {
  ...config,
  root: resolve(config.root, 'tests'),
  resolve: { alias: config.resolve.alias.map(alias => alias.find.source === '^react-dom\\/server$' && process.env.REACT_REFERENCE === '1'
    ? { ...alias, replacement: resolve('benchmarks/reference/node_modules/react-dom/server.browser.js') }
    : alias) },
  optimizeDeps: { include: ['react/jsx-dev-runtime'] },
  test: {
    ...config.test,
    include: ['activity-hydration.test.tsx'],
    testTimeout: 3000,
    ...(process.env.ACTIVITY_REFERENCE_CRASH_PROBE === '1' ? { testNamePattern: 'hidden server markup as visible' } : {}),
    browser: {
      enabled: true, name: 'chromium', provider: 'playwright',
      providerOptions: { launch: { channel: 'chrome', args: ['--js-flags=--max-old-space-size=128'] } },
      headless: true, screenshotFailures: false,
    },
  },
}
