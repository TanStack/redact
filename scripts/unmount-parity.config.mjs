import config from './upstream-gaps.config.mjs'
import { resolve } from 'node:path'

const source = process.env.SOURCE && resolve(process.env.SOURCE)
export default {
  ...config,
  test: {
    ...config.test,
    include: [
      'tests/unmount-render-parity.test.tsx',
      ...(process.env.REACT_REFERENCE === '1' ? [] : ['tests/unmount-order.test.tsx']),
    ],
  },
  resolve: {
    ...config.resolve,
    alias: config.resolve.alias.map(alias => ({
      ...alias,
      replacement: source && process.env.REACT_REFERENCE !== '1'
        ? alias.replacement.replace(resolve('packages/redact/src'), source)
        : alias.replacement,
    })),
  },
}
