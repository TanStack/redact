import type { ReactNode } from '../core'
import { beginSSR, currentSSRFrame } from './dispatcher'
import { walk } from './walk'

export function renderToString(
  children: ReactNode,
  options: { identifierPrefix?: string } = {},
): string {
  const restore = beginSSR(options.identifierPrefix)
  let output = ''
  let head = 0
  try {
    walk(children, {
      emit: (s) => {
        output += s
      },
      onHead: () => { head = output.length },
    })
    const hints = currentSSRFrame().resources?.drain()
    return hints ? output.slice(0, head) + hints + output.slice(head) : output
  } finally {
    restore()
  }
}

export function renderToStaticMarkup(
  children: ReactNode,
  options: { identifierPrefix?: string } = {},
): string {
  // For our purposes identical to renderToString (no hydration markers in static output)
  return renderToString(children, options).replace(/<!--[^>]*-->/g, '')
}
