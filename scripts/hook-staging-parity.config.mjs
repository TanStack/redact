import config from './browser-api.config.mjs'

export default {
  ...config,
  test: { ...config.test, include: ['tests/hook-staging-parity.test.tsx', 'tests/hook-staging-investigation.test.tsx'] },
}
