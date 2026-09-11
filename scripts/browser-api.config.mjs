import config from './upstream-gaps.config.mjs'
import { resolve } from 'node:path'

export default {
  ...config,
  test: { ...config.test, include: ['tests/browser-api.test.tsx'] },
  resolve: { alias: [
    { find: /^react-dom\/server$/, replacement: resolve(process.env.REACT_REFERENCE === '1'
      ? 'benchmarks/reference/node_modules/react-dom/server.node.js'
      : resolve(process.env.REDACT_TEST_SOURCE || 'packages/redact/src', 'server/index.ts')) },
    ...config.resolve.alias,
  ] },
}
