import { resolve } from 'node:path'
import config from './control-update-gaps.config.mjs'

export default {
  ...config,
  root: resolve(config.root, 'tests'),
  optimizeDeps: { include: ['react/jsx-dev-runtime'] },
  test: {
    include: ['control-updates.test.tsx'],
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
