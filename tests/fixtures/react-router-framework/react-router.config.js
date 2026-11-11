export default {
  ssr: true,
  buildDirectory: process.env.ROUTER_REFERENCE
    ? 'build-native'
    : 'build-redact',
}
