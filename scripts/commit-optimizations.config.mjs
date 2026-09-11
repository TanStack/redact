import config from './upstream-gaps.config.mjs'
export default {
  ...config,
  test: {
    ...config.test,
    include: process.env.REACT_REFERENCE === '1'
      ? ['tests/host-assembly.test.tsx']
      : ['tests/host-assembly.test.tsx', 'tests/commit-queue-optimizations.test.ts'],
  },
}
