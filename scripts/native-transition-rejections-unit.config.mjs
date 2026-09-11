import { resolve } from 'node:path'
import config from '../tests/vitest.config.ts'

const current = resolve('packages/redact/src')
const source = resolve(process.env.REDACT_SOURCE || current)

export default {
  ...config,
  root: resolve('tests'),
  resolve: {
    ...config.resolve,
    alias: [
      { find: /^(?:\.\.\/)+packages\/redact\/src\//, replacement: source + '/' },
      ...Object.entries(config.resolve.alias).map(([name, replacement]) => ({ find: name, replacement: replacement.replace(current, source) })),
    ],
  },
}
