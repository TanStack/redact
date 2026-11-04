import { createServer } from 'vite'

const server = await createServer({
  server: { host: '127.0.0.1', port: 0, strictPort: true },
})
await server.listen()
process.send(server.httpServer.address().port)
