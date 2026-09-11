import config from './browser-api-browser.config.mjs'
export default {
  ...config,
  define: { ...config.define, __REACT_REFERENCE__: JSON.stringify(process.env.REACT_REFERENCE === '1') },
  test: {
    ...config.test,
    include: ['error-multi-root.test.tsx'],
    browser: {
      ...config.test.browser,
      providerOptions: {
        ...config.test.browser.providerOptions,
        context: { reducedMotion: process.env.REDUCED_MOTION === '1' ? 'reduce' : 'no-preference' },
      },
    },
  },
}
