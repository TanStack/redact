import config from './upstream-gaps.config.mjs'
import { dirname, resolve } from 'node:path'

const original = resolve('packages/redact/src')
const source = resolve(process.env.REDACT_SOURCE || original)

export default {
  ...config,
  plugins: [{
    name: 'isolated-effect-drain-source',
    enforce: 'pre',
    async resolveId(id, importer) {
      const path = id.startsWith('.') && importer ? resolve(dirname(importer), id) : id
      if (path.startsWith(original + '/')) {
        return this.resolve(source + path.slice(original.length), importer, { skipSelf: true })
      }
    },
  }],
  resolve: { alias: [
    { find: /^react-dom\/server$/, replacement: resolve(source, 'server/index.ts') },
    ...config.resolve.alias.map(alias => ({ ...alias, replacement: alias.replacement.replace(original, source) })),
  ] },
  test: {
    ...config.test,
    include: [
      'tests/effect-drain.test.ts', 'tests/commit-staging.test.tsx',
      'tests/commit-feature-phases.test.tsx', 'tests/callback-ref-commit-phase.test.tsx',
      'tests/fragment-refs.test.tsx', 'tests/hooks.test.tsx', 'tests/activity.test.tsx',
      'tests/activity-hydration.test.tsx', 'tests/context-suspense-updates.test.tsx',
      'tests/commit-plan.test.ts', 'tests/commit-queue-optimizations.test.ts',
      'tests/view-transition-phases.test.tsx', 'tests/reducer-layout*.test.tsx',
    ],
  },
}
