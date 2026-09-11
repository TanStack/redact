import config from './browser-api-browser.config.mjs'
export default {
  ...config,
  test: {
    ...config.test,
    include: process.env.REACT_REFERENCE === '1'
      ? ['reducer-layout*.test.tsx', 'reducer-queue.test.tsx', 'suspense-layout.test.tsx', 'reducer-benchmark.test.ts']
      : ['reducer-layout*.test.tsx', 'reducer-queue.test.tsx', 'suspense-layout.test.tsx', 'reducer-native-sync.test.tsx', 'reducer-benchmark.test.ts'],
  },
}
