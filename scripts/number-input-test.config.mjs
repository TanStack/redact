import config from './upstream-gaps.config.mjs'

export default {
  ...config,
  test: { ...config.test, include: ['tests/number-input.test.tsx'] },
}
