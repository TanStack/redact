import { resolve } from 'node:path'
import config from './browser-api-browser.config.mjs'

export default {
  ...config,
  cacheDir: resolve('node_modules/.vite/actions-browser'),
  test: {
    ...config.test,
    include: ['actions.test.tsx', 'transition-retention.test.tsx', 'activity-transition.test.tsx', 'select-defaults.test.tsx', 'event-parity.test.tsx', 'lazy-wrapped-components.test.tsx', 'thenable-children.test.tsx', 'root-suspension.test.tsx', 'find-dom-node.test.tsx', 'document-shell.test.tsx', 'issue115-controlled-restore.browser.tsx'],
  },
}
