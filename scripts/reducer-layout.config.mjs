import config from './upstream-gaps.config.mjs'
import { resolve } from 'node:path'
const source = process.env.REDACT_SOURCE
export default {
  ...config,
  resolve: source && process.env.REACT_REFERENCE !== '1'
    ? { alias: config.resolve.alias.map(alias => ({ ...alias, replacement: alias.replacement.replace(resolve('packages/redact/src'), resolve(source)) })) }
    : config.resolve,
  test: { ...config.test, include: ['tests/reducer-layout*.test.tsx', 'tests/reducer-queue.test.tsx'] },
}
