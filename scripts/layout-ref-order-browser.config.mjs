import { resolve } from 'node:path'
import config from './layout-ref-order.config.mjs'

export default {
  ...config,
  root: resolve(config.root, 'tests'),
  optimizeDeps: { include: ['react/jsx-dev-runtime'] },
  test: {
    include: ['layout-ref-order.test.tsx'],
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
