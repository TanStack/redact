import { resolve } from 'node:path'
import config from './activity.config.mjs'

export default {
  ...config,
  test: {
    ...config.test,
    include: ['tests/activity-hydration.test.tsx'],
    // Pinned React 19.3 loops until memory exhaustion on this mismatched
    // Activity shape, including in a standalone Node/jsdom reproduction.
    // Redact still runs the case and must recover once without duplicate effects.
    ...(process.env.REACT_REFERENCE === '1' ? {
      testNamePattern: /^(?!hydrates Activity hidden server markup as visible)/,
    } : {}),
  },
  resolve: { alias: [
    { find: /^react-dom\/server$/, replacement: resolve(process.env.REACT_REFERENCE === '1'
      ? 'benchmarks/reference/node_modules/react-dom/server.node.js'
      : 'packages/redact/src/server/index.ts') },
    ...config.resolve.alias,
  ] },
}
