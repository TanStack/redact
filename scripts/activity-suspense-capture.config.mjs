import config from './activity.config.mjs'
export default { ...config, test: { ...config.test, include: ['tests/activity-suspense-capture.test.tsx'] } }
