import { createContext, startTransition, StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { RouterContextProvider } from 'react-router'
import { clientSeed } from './contexts'
import { HydratedRouter } from 'react-router/dom'
window.fixtureRenderer = Object.hasOwn(createContext(null), '_context') ? 'redact' : 'native'
window.routerRecoveries = []
window.middlewareEvents = []
window.contextSeed = 0
startTransition(() =>
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter
        getContext={() => {
          const context = new RouterContextProvider()
          context.set(clientSeed, ++window.contextSeed)
          return context
        }}
      />
    </StrictMode>,
    {
      identifierStrategy: 'react',
      identifierPrefix: 'app-',
      onRecoverableError: (error) =>
        window.routerRecoveries.push(String(error)),
      onUncaughtError: (error) =>
        window.routerRecoveries.push('Uncaught: ' + String(error)),
    }
  )
)
