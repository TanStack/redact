import config from './browser-api.config.mjs'
import { resolve } from 'node:path'

const source = process.env.HOOK_STAGING_SOURCE

// HOOK_STAGING_SOURCE can point these regressions at a frozen source tree.
// They also run normally through hook-staging-parity.config.mjs.
export default {
  ...config,
  resolve: source ? {
    ...config.resolve,
    alias: config.resolve.alias.map(alias => ({
      ...alias,
      replacement: alias.replacement.replace(resolve('packages/redact/src'), resolve(source)),
    })),
  } : config.resolve,
  test: { ...config.test, include: ['tests/hook-staging-investigation.test.tsx'] },
}
