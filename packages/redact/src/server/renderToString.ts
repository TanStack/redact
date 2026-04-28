import type { ReactNode } from '../core'
import { beginSSR, endSSR, installSSRDispatcher, uninstallSSRDispatcher } from './dispatcher'
import { walk } from './walk'

export function renderToString(
  children: ReactNode,
  options: { identifierPrefix?: string } = {},
): string {
  installSSRDispatcher()
  beginSSR(options.identifierPrefix)
  let output = ''
  let id = 0
  try {
    walk(children, {
      emit: (s) => {
        output += s
      },
      nextBoundaryId: () => id++,
    })
  } finally {
    endSSR()
    uninstallSSRDispatcher()
  }
  return output
}

export function renderToStaticMarkup(
  children: ReactNode,
  options: { identifierPrefix?: string } = {},
): string {
  // For our purposes identical to renderToString (no hydration markers in static output)
  return renderToString(children, options).replace(/<!--[^>]*-->/g, '')
}
