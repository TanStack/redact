import config from './browser-api.config.mjs'
export default { ...config, test: { ...config.test, environment: 'node', include: ['tests/ssr-nonce-parity.test.tsx'] } }
