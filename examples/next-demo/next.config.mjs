import { withRedact } from '@tanstack/redact/next'
import { createRequire } from 'node:module'

const [major, minor] = createRequire(import.meta.url)('next/package.json').version.split('.').map(Number)
const cacheComponents = major >= 16 && process.env.NEXT_TEST_CACHE_COMPONENTS !== '0'
const config = {
  reactStrictMode: true,
  ...(process.env.NEXT_TEST_DIST_DIR ? { distDir: process.env.NEXT_TEST_DIST_DIR } : {}),
  ...(major >= 16 ? { cacheComponents } : { experimental: { useCache: true } }),
  ...(major > 16 || major === 16 && minor >= 3 ? { partialPrefetching: cacheComponents } : {}),
  ...(major > 16 || major === 16 && minor >= 4 ? { agentRules: false } : {}),
  ...(process.env.NEXT_TEST_OUTPUT ? { output: process.env.NEXT_TEST_OUTPUT } : {}),
  ...(process.env.NEXT_TEST_BASE_PATH ? { basePath: process.env.NEXT_TEST_BASE_PATH, trailingSlash: true } : {}),
  async rewrites() { return [{ source: '/rewritten/:slug', destination: '/routing/:slug' }] },
  async redirects() { return [{ source: '/configured-redirect', destination: '/routing/redirected?from=config', permanent: false }] },
}

export default process.env.NEXT_TEST_REFERENCE ? config : withRedact(config)
