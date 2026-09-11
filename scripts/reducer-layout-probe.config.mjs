import config from './reducer-layout.config.mjs'
export default { ...config, test: { ...config.test, include: ['scripts/fixtures/reducer-layout-probe.tsx'] } }
