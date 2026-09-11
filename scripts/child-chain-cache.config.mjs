import { resolve } from 'node:path'
import config from './browser-api.config.mjs'

if (process.env.REACT_REFERENCE === '1') {
  throw new Error('The anchor regression suite requires Redact synchronous rendering, not reference React.')
}

export default {
  ...config,
  cacheDir: resolve('node_modules/.vite/child-chain-cache'),
  test: {
    ...config.test,
    include: ['tests/child-chain-cache-regressions.test.tsx', 'tests/null-sibling-anchors.test.tsx'],
  },
}
