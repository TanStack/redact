import { resolve } from 'node:path'
import config from './browser-api.config.mjs'

export default {
  ...config,
  cacheDir: resolve('node_modules/.vite/child-chain-cache'),
  test: {
    ...config.test,
    include: ['tests/child-chain-cache-regressions.test.tsx', 'tests/null-sibling-anchors.test.tsx'],
  },
}
