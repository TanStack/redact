import config from './browser-api.config.mjs'
export default {
  ...config,
  test: { ...config.test, testNamePattern: process.env.REACT_REFERENCE === '1' ? /^(?!does not instantiate custom elements|still reports genuinely different opaque markup|preserves opaque head recovery policy).*$/ : undefined, include: ['tests/hydration-scroll-ownership.test.tsx', 'tests/hydration-runtime-regressions.test.tsx', 'tests/retained-store-departure.test.tsx', 'tests/error-fallback-recovery.test.tsx'] },
}
