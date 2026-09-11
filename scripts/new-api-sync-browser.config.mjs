import config from './browser-api-browser.config.mjs'
export default { ...config, test: { ...config.test, include: ['new-api-sync.test.tsx'] } }
