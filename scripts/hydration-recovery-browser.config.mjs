import { resolve } from 'node:path'
import config from './browser-api-browser.config.mjs'
export default {
  ...config,
  cacheDir: resolve(`node_modules/.vite/hydration-recovery-${process.env.REACT_REFERENCE === '1' ? 'react' : 'redact'}`),
  test: { ...config.test, browser: { ...config.test.browser, providerOptions: { launch: process.env.RECOVERY_CHROME === '1' ? { channel: 'chrome' } : {} } }, include: ['hydration-scroll-ownership.test.tsx', 'hydration-runtime-regressions.test.tsx', 'retained-store-departure.test.tsx', 'error-fallback-recovery.test.tsx'], testNamePattern: process.env.REACT_REFERENCE === '1' ? /^(?!does not instantiate custom elements|still reports genuinely different opaque markup|preserves opaque head recovery policy).*$/ : undefined },
}
