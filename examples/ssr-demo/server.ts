import { createServer as createHttpServer } from 'node:http'
import { createServer as createViteServer } from 'vite'

const PORT = Number(process.env.PORT ?? 5173)

const vite = await createViteServer({
  configFile: new URL('./vite.config.ts', import.meta.url).pathname,
  server: { middlewareMode: true },
  appType: 'custom',
})

const server = createHttpServer((req, res) => {
  vite.middlewares(req, res, async () => {
    try {
      const mod = await vite.ssrLoadModule('/src/entry-server.tsx')
      const render = mod.render as () => Promise<ReadableStream<Uint8Array>>
      const stream = await render()
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.write('<!doctype html>')
      const reader = stream.getReader()
      const pump = async () => {
        const { value, done } = await reader.read()
        if (done) return res.end()
        res.write(Buffer.from(value))
        pump()
      }
      pump()
    } catch (err) {
      vite.ssrFixStacktrace(err as Error)
      console.error(err)
      res.statusCode = 500
      res.end((err as Error).stack)
    }
  })
})

server.listen(PORT, () => {
  console.log(`SSR demo on http://localhost:${PORT}`)
})
