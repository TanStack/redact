import { resolve } from 'node:path'
import config from './view-transition-browser.config.mjs'

const current = resolve('packages/redact/src')
const source = resolve(process.env.REDACT_SOURCE || current)

export default {
  ...config,
  cacheDir: '/tmp/redact-transition-rejections-vite-cache',
  resolve: {
    ...config.resolve,
    alias: config.resolve.alias.map(alias => ({
      ...alias,
      replacement: alias.replacement.replace(current, source),
    })),
  },
  server: { fs: { allow: [resolve('.'), resolve(source, '..')] } },
  test: {
    ...config.test,
    include: process.env.ALL_TRANSITION_TESTS === '1' ? config.test.include : ['native-transition-rejections.test.tsx'],
  },
}
