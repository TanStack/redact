import config from './browser-api.config.mjs'

export default {
  ...config,
  test: { ...config.test, environment: 'node', include: process.env.REACT_REFERENCE === '1'
    ? ['tests/resource-hints-server.test.tsx']
    : ['tests/resource-hints-server.test.tsx', 'tests/resource-hints-collector.test.tsx'] },
}
