import config from './resource-hints.config.mjs'

export default {
  ...config,
  test: { ...config.test, environment: 'node', include: ['tests/resource-hints-entrypoints.test.tsx'] },
}
