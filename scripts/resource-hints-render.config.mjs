import config from './resource-hints.config.mjs'

export default {
  ...config,
  test: { ...config.test, include: ['tests/resource-hints-render.test.tsx'] },
}
