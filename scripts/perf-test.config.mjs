import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vitest/config'
import config from '../tests/vitest.config'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = resolve(root, 'packages/redact/src') + '/'
const candidate = process.env.REDACT_TEST_SOURCE
if (!candidate) throw new Error('Set REDACT_TEST_SOURCE to a candidate source directory')

export default mergeConfig(config, {
  root: resolve(root, 'tests'),
  plugins: [{
    name: 'candidate-source',
    enforce: 'pre',
    load(id) {
      const file = id.split('?')[0]
      if (file.startsWith(source)) {
        return readFileSync(resolve(candidate, file.slice(source.length)), 'utf8')
      }
    },
  }],
})
