import config from './new-api-sync-browser.config.mjs'

export default {
  ...config,
  test: {
    ...config.test,
    include: process.env.REACT_REFERENCE === '1'
      ? ['view-transition.test.tsx', 'view-transition-phases.test.tsx', 'native-transition-rejections.test.tsx']
      : ['view-transition*.test.tsx', 'native-transition-rejections.test.tsx'],
    testTimeout: 10000,
    browser: {
      ...config.test.browser,
      providerOptions: {
        ...config.test.browser.providerOptions,
        context: { reducedMotion: process.env.REDUCED_MOTION === '1' ? 'reduce' : 'no-preference' },
      },
    },
  },
}
