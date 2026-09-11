import { resolve } from 'node:path'
import config from './view-transition-resources-browser.config.mjs'

export default {
  ...config,
  cacheDir: resolve(`node_modules/.vite/parity-final-native-${process.env.REACT_REFERENCE === '1' ? 'react' : 'redact'}`),
  test: {
    ...config.test,
    include: [
      'view-transition.test.tsx',
      'view-transition-phases.test.tsx',
      'view-transition-resources.test.tsx',
      'native-transition-rejections.test.tsx',
      ...(process.env.REACT_REFERENCE === '1' ? [] : ['view-transition-sync.test.tsx']),
    ],
  },
}
