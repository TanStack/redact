import {
  requestSeed,
  session,
  trace,
  clientSeed,
  clientStamp,
} from './contexts'
export const middleware = [
  async ({ context }, next) => {
    context.set(session, context.get(requestSeed))
    const events = ['root-before']
    context.set(trace, events)
    const response = await next()
    events.push('root-after')
    response.headers.set('X-Fixture-Trace', events.join('|'))
    return response
  },
]
export const clientMiddleware = [
  async ({ context }, next) => {
    const seed = context.get(clientSeed)
    context.set(clientStamp, seed)
    window.middlewareEvents.push({ part: 'root-before', seed })
    await next()
    window.middlewareEvents.push({ part: 'root-after', seed })
  },
]
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router'
import { useEffect } from 'react'
export default function Root() {
  useEffect(() => {
    window.routerReady = true
  }, [])
  return (
    <html>
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}
