import config from './resource-hints-render.config.mjs'
export default { ...config, test: { ...config.test, include: ['tests/resource-ownership.test.tsx'] } }
