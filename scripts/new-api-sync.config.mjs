import config from './browser-api.config.mjs'
export default { ...config, test: { ...config.test, include: ['tests/new-api-sync.test.tsx'] } }
