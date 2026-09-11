import config from './upstream-gaps.config.mjs'
export default { ...config, test: { ...config.test, include: ['tests/reducer-layout.test.tsx', 'tests/reducer-queue.test.tsx', 'tests/reducer-benchmark.test.ts'] } }
