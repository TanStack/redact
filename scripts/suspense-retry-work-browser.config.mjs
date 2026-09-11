import config from './browser-api-browser.config.mjs'
export default { ...config, test: { ...config.test, include: ['suspense-retry-work.test.tsx'] } }
