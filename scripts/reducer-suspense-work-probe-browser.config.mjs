import { resolve } from 'node:path'
import config from './reducer-suspense-work-probe.config.mjs'

export default {
  ...config,
  root: resolve(config.root, 'tests'),
  esbuild: { ...config.esbuild, jsxDev: false },
  test: {
    include: ['reducer-suspense-work.probe.tsx'],
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
