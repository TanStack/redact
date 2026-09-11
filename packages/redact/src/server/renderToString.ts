import type { ReactNode } from '../core'
import { beginSSR, currentSSRFrame, endSSR } from './dispatcher'
import { walk } from './walk'

export function renderToString(
  children: ReactNode,
  options: { identifierPrefix?: string } = {},
): string {
  const previous = beginSSR(options.identifierPrefix)
  let output = ''
  let id = 0
  let head = 0
  try {
    walk(children, {
      emit: (s) => {
        output += s
      },
      nextBoundaryId: () => id++,
      onHead: () => { head = output.length },
    })
    const hints = currentSSRFrame().resources?.drain()
    if (hints) output = output.slice(0, head) + hints + output.slice(head)
  } finally {
    endSSR(previous)
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
