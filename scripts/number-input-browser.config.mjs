import { resolve } from 'node:path'
import config from './number-input-test.config.mjs'

export default {
  ...config,
  root: resolve(config.root, 'tests'),
  optimizeDeps: { include: ['react/jsx-dev-runtime'] },
  test: {
    include: ['number-input.test.tsx'],
    browser: {
      enabled: true,
      name: 'chromium',
      provider: 'playwright',
      providerOptions: { launch: { channel: 'chrome' } },
      headless: true,
      screenshotFailures: false,
    },
  },
}
