import { resolve } from 'node:path'
import config from './resource-hints.config.mjs'

export default {
  ...config,
  root: resolve(config.root, 'tests'),
  optimizeDeps: { include: ['react/jsx-dev-runtime'] },
  test: {
    include: ['resource-hints-browser.test.tsx'],
    testTimeout: 10000,
    browser: {
      enabled: true, name: 'chromium', provider: 'playwright',
      providerOptions: { launch: { channel: 'chrome' } },
      headless: true, screenshotFailures: false,
    },
  },
}
