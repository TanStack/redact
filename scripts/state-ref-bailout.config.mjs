import { resolve } from 'node:path'
import config from './upstream-gaps.config.mjs'

export default {
  ...config,
  resolve: process.env.PUBLISHED_REDACT === '1' ? {
    alias: Object.entries({
      'react/jsx-runtime': 'react/jsx-runtime.js',
      'react/jsx-dev-runtime': 'react/jsx-runtime.js',
      'react-dom/client': 'dom/client.js',
      'react-dom': 'dom/index.js',
      react: 'react/index.js',
    }).map(([name, path]) => ({
      find: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'),
      replacement: resolve('benchmarks/reference/node_modules/@tanstack/redact/dist', path),
    })),
  } : config.resolve,
  test: {
    ...config.test,
    include: ['tests/state-ref-bailout.test.tsx'],
    server: { deps: { inline: [/@tanstack\/redact/] } },
  },
}
