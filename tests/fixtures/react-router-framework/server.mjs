import express from 'express'
import { createRequestHandler } from '@react-router/express'
import { RouterContextProvider } from 'react-router'

const directory = process.env.ROUTER_REFERENCE ? 'build-native' : 'build-redact'
const build = await import('./' + directory + '/server/index.js')
const requestSeed = build.entry.module.requestSeed
if (!requestSeed) throw new Error('The fixture must share its server context key')

const app = express()
app.use(express.static(directory + '/client'))
app.use(createRequestHandler({
  build,
  mode: 'production',
  getLoadContext(request) {
    const context = new RouterContextProvider()
    context.set(requestSeed, request.headers['x-fixture-seed'] || 'document')
    return context
  },
}))

const server = app.listen(0, '127.0.0.1', () => process.send(server.address().port))
