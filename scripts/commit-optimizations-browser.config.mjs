import config from './view-transition-browser.config.mjs'
export default { ...config, test: { ...config.test, include: ['host-assembly.test.tsx', 'reducer-layout.test.tsx', 'wrapped-error-boundaries.test.tsx'] } }
