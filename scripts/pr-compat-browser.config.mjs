import { resolve } from 'node:path'
import config from './browser-api-browser.config.mjs'

export default {
  ...config,
  cacheDir: resolve(`node_modules/.vite/pr-compat-${process.env.REACT_REFERENCE === '1' ? 'react' : 'redact'}`),
  test: {
    ...config.test,
    include: ['context-as-provider.test.tsx', 'element-ref-prop.test.tsx'],
    testNamePattern: undefined,
  },
}
