import { resolve } from 'node:path'
import config from './browser-api-browser.config.mjs'

const reference = process.env.REACT_REFERENCE === '1'

export default {
  ...config,
  cacheDir: resolve(`node_modules/.vite/parity-final-core-${reference ? 'react' : 'redact'}`),
  test: {
    ...config.test,
    include: [
      'browser-api.test.tsx',
      'new-api-sync.test.tsx',
      'fragment-refs.test.tsx',
      'hook-staging-parity.test.tsx',
      'hook-staging-investigation.test.tsx',
      'reducer-layout*.test.tsx',
      'reducer-queue.test.tsx',
      'reducer-benchmark.test.ts',
      'suspense-layout.test.tsx',
      'suspense-retry-work.test.tsx',
      'activity-suspense-capture.test.tsx',
      'state-ref-bailout.test.tsx',
      'error-info-parity.test.tsx',
      'element-iterable-precedence.test.tsx',
      'upstream-parity.test.tsx',
      'context-suspense-updates.test.tsx',
      'context-pending-parent.test.tsx',
      'context-as-provider.test.tsx',
      'element-ref-prop.test.tsx',
      'control-updates.test.tsx',
      'number-input.test.tsx',
      'hydration-form-controls.test.tsx',
      'layout-ref-order.test.tsx',
      'activity-hydration.test.tsx',
      ...(reference ? [] : ['reducer-native-sync.test.tsx', 'hydration-recovery-lifecycle.test.tsx']),
    ],
    // Pipeable streams run in Node. The bounded Activity hydration reference
    // failure remains excluded, never counted as a parity pass.
    testNamePattern: reference
      ? /^(?!.*pipeable)(?!.*hydrates Activity hidden server markup as visible).*$/
      : /^(?!.*pipeable).*$/,
    testTimeout: 10000,
  },
}
