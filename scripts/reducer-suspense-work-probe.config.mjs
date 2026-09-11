import config from './upstream-gaps.config.mjs'

export default {
  ...config,
  define: { __REACT_REFERENCE__: process.env.REACT_REFERENCE === '1' },
  test: { ...config.test, include: ['tests/reducer-suspense-work.probe.tsx'] },
}
