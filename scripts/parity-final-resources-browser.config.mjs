import { resolve } from 'node:path'
import config from './resource-hints-browser.config.mjs'

export default {
  ...config,
  cacheDir: resolve(`node_modules/.vite/parity-final-resources-${process.env.REACT_REFERENCE === '1' ? 'react' : 'redact'}`),
  test: {
    ...config.test,
    include: ['resource-hints.test.tsx', 'resource-hints-render.test.tsx', 'resource-hints-browser.test.tsx', 'resource-ownership.test.tsx', 'shadow-resource-ownership.test.tsx'],
  },
}
