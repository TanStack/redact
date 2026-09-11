import config from './view-transition-browser.config.mjs'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
const require = createRequire(import.meta.url)
const playwrightRequire = createRequire(require.resolve('playwright/package.json'))
const fonts = join(dirname(playwrightRequire.resolve('playwright-core/package.json')), 'lib/vite/traceViewer')
const font = readFileSync(join(fonts, readdirSync(fonts).find(name => /^codicon\..*\.ttf$/.test(name))))

export default {
  ...config,
  define: { ...config.define, __TRANSITION_IMAGE_FIXTURES__: 'true' },
  plugins: [...(config.plugins || []), {
    name: 'view-transition-image-fixtures',
    configureServer(server) {
      const pending = new Map()
      const released = new Map()
      function finish(response, failed, isFont) {
        response.setHeader('Cache-Control', 'no-store')
        response.setHeader('Content-Type', failed ? 'text/plain' : isFont ? 'font/ttf' : 'image/png')
        response.statusCode = failed ? 404 : 200
        response.end(failed ? 'Missing resource' : isFont ? font : pixel)
      }
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url, 'http://localhost')
        const key = url.searchParams.get('key')
        if (url.pathname === '/__transition_image' || url.pathname === '/__transition_font') {
          const isFont = url.pathname === '/__transition_font'
          if (released.has(key)) finish(response, released.get(key), isFont)
          else {
            let responses = pending.get(key)
            if (!responses) pending.set(key, responses = new Map())
            responses.set(response, isFont)
            response.on('close', () => responses.delete(response))
          }
        } else if (url.pathname === '/__transition_image_release') {
          const failed = url.searchParams.has('failed')
          released.set(key, failed)
          for (const [waiting, isFont] of pending.get(key) || []) finish(waiting, failed, isFont)
          pending.delete(key)
          response.end('released')
        } else next()
      })
    },
  }],
  test: { ...config.test, include: ['view-transition-resources.test.tsx'], testTimeout: 15000 },
}
