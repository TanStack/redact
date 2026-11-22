import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(process.argv[2])
const framework = process.argv[3]
const renderer = process.argv[4]
const port = Number(process.argv[5])

if (!framework) {
  const children = new Set()
  let stopping = false
  function stop(signal = 'SIGTERM') {
    if (stopping) return
    stopping = true
    for (const child of children) child.kill(signal)
    const force = setTimeout(() => {
      for (const child of children) child.kill('SIGKILL')
    }, 5000)
    force.unref()
  }
  function failed(label, detail) {
    if (stopping) return
    console.error(`${label}: preview failed (${detail})`)
    process.exitCode = 1
    stop()
  }
  let nextPort = 4380
  for (const name of ['start', 'vite', 'vinext', 'next']) {
    for (const runtime of [
      'react',
      'redact',
      ...(['start', 'vite'].includes(name) ? ['redact-lean'] : []),
    ]) {
      const serverPort = nextPort++
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(import.meta.url),
          root,
          name,
          runtime,
          String(serverPort),
        ],
        {
          env: { ...process.env, NODE_ENV: 'production', RENDERER: runtime },
          stdio: 'inherit',
        },
      )
      children.add(child)
      const label = `${name}/${runtime}`
      child.once('error', error => failed(label, error.message))
      child.once('exit', (code, signal) => failed(label, signal ?? `exit ${code}`))
      child.once('close', () => children.delete(child))
      console.log(`${name}/${runtime}: http://127.0.0.1:${serverPort}`)
    }
  }
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (!stopping) process.exitCode = signal === 'SIGINT' ? 130 : 143
      stop(signal)
    })
  }
} else if (framework === 'next') {
  process.chdir(join(root, framework))
  process.argv = [
    process.execPath,
    join(root, 'node_modules/next/dist/bin/next'),
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(port),
  ]
  await import(pathToFileURL(process.argv[1]).href)
} else if (framework === 'vinext') {
  process.chdir(join(root, framework))
  const { startProdServer } = await import(
    pathToFileURL(join(root, 'node_modules/vinext/dist/server/prod-server.js'))
      .href
  )
  await startProdServer({
    port,
    host: '127.0.0.1',
    outDir: join(root, framework, `dist-${renderer}`),
  })
} else {
  const dist = join(root, framework, `dist-${renderer}`)
  const publicRoot = framework === 'start' ? join(dist, 'client') : dist
  const handler =
    framework === 'start'
      ? (await import(pathToFileURL(join(dist, 'server/server.js')).href))
          .default
      : null
  createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://127.0.0.1:${port}`)
      if (
        url.pathname.startsWith('/assets/') ||
        (framework === 'vite' && url.pathname === '/')
      ) {
        const asset = resolve(
          publicRoot,
          '.' + (url.pathname === '/' ? '/index.html' : url.pathname),
        )
        if (!asset.startsWith(publicRoot + sep)) {
          response.writeHead(400).end()
          return
        }
        const body = await readFile(asset)
        response.setHeader(
          'Content-Type',
          asset.endsWith('.js')
            ? 'text/javascript'
            : asset.endsWith('.css')
              ? 'text/css'
              : 'text/html',
        )
        response.end(body)
      } else if (handler) {
        const result = await handler.fetch(
          new Request(url, { headers: request.headers }),
        )
        response.writeHead(result.status, Object.fromEntries(result.headers))
        if (result.body) await pipeline(Readable.fromWeb(result.body), response)
        else response.end()
      } else response.writeHead(404).end()
    } catch (error) {
      console.error(error)
      if (response.destroyed) return
      if (response.headersSent) response.destroy()
      else response.writeHead(500).end(String(error))
    }
  }).listen(port, '127.0.0.1')
}
