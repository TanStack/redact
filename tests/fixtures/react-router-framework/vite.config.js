import { reactRouter } from '@react-router/dev/vite'
import { redact } from '@tanstack/redact/vite'
export default {
  server: { host: '127.0.0.1' },
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
