import { reactRouter } from '@react-router/dev/vite'
import { redact } from '@tanstack/redact/vite'
export default {
  server: {
    host: '127.0.0.1',
    // HMR must read a completed module, not a file while it is being rewritten.
    watch: { awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 10 } },
  },
  cacheDir: process.env.ROUTER_REFERENCE ? '.vite-native' : '.vite-redact',
  plugins: [
    ...(process.env.ROUTER_REFERENCE
      ? []
      : [redact({ environments: ['client'] })]),
    reactRouter(),
  ],
  build: {
    outDir: process.env.ROUTER_REFERENCE ? 'build-native' : 'build-redact',
  },
}
