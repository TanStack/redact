import { isValidElement, cloneElement } from './element'
import type { ReactNode, ReactElement } from '../core'

function flatten(node: ReactNode, out: any[], prefix: string): void {
  if (node == null || typeof node === 'boolean') return
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) flatten(node[i], out, prefix + '.' + i)
    return
  }
  out.push(node)
}

function getKey(node: any, index: number, prefix: string): string {
  if (isValidElement(node) && node.key != null) return prefix + '$' + node.key
  return prefix + ':' + index
}

function mapChildren(
  children: ReactNode,
  fn: (child: ReactNode, index: number) => any,
  prefix = '',
): any[] {
  const flat: any[] = []
  flatten(children, flat, prefix)
  const out: any[] = []
  for (let i = 0; i < flat.length; i++) {
    const child = flat[i]
    const mapped = fn(child, i)
    if (mapped == null) continue
    if (Array.isArray(mapped)) {
      for (let j = 0; j < mapped.length; j++) {
        const m = mapped[j]
        if (m == null) continue
        out.push(
          isValidElement(m) && m.key == null
            ? cloneElement(m as ReactElement, { key: getKey(child, i, prefix) + '/' + j })
            : m,
        )
      }
    } else {
      out.push(
        isValidElement(mapped) && mapped.key == null
          ? cloneElement(mapped as ReactElement, { key: getKey(child, i, prefix) })
          : mapped,
      )
    }
  }
  return out
}

export const Children = {
  map(children: ReactNode, fn: (child: ReactNode, index: number) => any): any[] | null {
    if (children == null) return null
    return mapChildren(children, fn)
  },
  forEach(children: ReactNode, fn: (child: ReactNode, index: number) => void): void {
    if (children == null) return
    mapChildren(children, (c, i) => {
      fn(c, i)
      return null
    })
  },
  count(children: ReactNode): number {
    let n = 0
    const flat: any[] = []
    flatten(children, flat, '')
    for (let i = 0; i < flat.length; i++) n++
    return n
  },
  toArray(children: ReactNode): any[] {
    const flat: any[] = []
    flatten(children, flat, '')
    return flat.map((c, i) =>
      isValidElement(c) && c.key == null
        ? cloneElement(c as ReactElement, { key: '' + i })
        : c,
    )
  },
  only(children: ReactNode): ReactElement {
    if (!isValidElement(children)) {
      throw new Error('Children.only expected a single React element.')
    }
    return children
  },
}
