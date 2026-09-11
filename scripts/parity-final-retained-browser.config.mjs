import { resolve } from 'node:path'
import config from './activity-browser.config.mjs'

export default {
  ...config,
  cacheDir: resolve(`node_modules/.vite/parity-final-retained-${process.env.REACT_REFERENCE === '1' ? 'react' : 'redact'}`),
  test: {
    ...config.test,
    include: ['activity.test.tsx', 'suspense-layout.test.tsx', 'retained-resource-class.test.tsx', 'layout-ref-order.test.tsx'],
  },
}
