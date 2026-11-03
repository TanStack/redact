// Compatibility entrypoint, React profiling instrumentation is not provided.
import dom from './index'
import client from './client'
export * from './index'
export * from './client'
export default { ...dom, ...client }
