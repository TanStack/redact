import { isValidElement, cloneElement } from './element'
import type { ReactNode, ReactElement } from '../core'

// Keys follow React's Children scheme: '.' separates levels, ':' separates
// siblings, keyed children use '$' + escaped key instead of their index.
function escapeKey(key: string): string {
  return '$' + key.replace(/[=:]/g, (m) => (m === '=' ? '=0' : '=2'))
}

function escapeUserProvidedKey(key: string): string {
  return key.replace(/\/+/g, '$&/')
}

function getElementKey(node: any, index: number): string {
  if (isValidElement(node) && node.key != null) return escapeKey('' + node.key)
  return index.toString(36)
}

const identity = (child: ReactNode) => child

function mapIntoArray(
  children: ReactNode,
  out: any[],
  escapedPrefix: string,
  nameSoFar: string,
  fn: (child: ReactNode) => any,
): void {
  if (Array.isArray(children)) {
    const namePrefix = nameSoFar === '' ? '.' : nameSoFar + ':'
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      mapIntoArray(child, out, escapedPrefix, namePrefix + getElementKey(child, i), fn)
    }
    return
  }

  const child = children === undefined || typeof children === 'boolean' ? null : children
  const childKey = nameSoFar === '' ? '.' + getElementKey(child, 0) : nameSoFar
  const mapped = fn(child)
  if (mapped == null) return
  if (Array.isArray(mapped)) {
    mapIntoArray(mapped, out, escapeUserProvidedKey(childKey) + '/', '', identity)
  } else if (isValidElement(mapped)) {
    const mappedKey =
      mapped.key != null && (!isValidElement(child) || child.key !== mapped.key)
        ? escapeUserProvidedKey('' + mapped.key) + '/'
        : ''
    out.push(cloneElement(mapped as ReactElement, { key: escapedPrefix + mappedKey + childKey }))
  } else {
    out.push(mapped)
  }
}

function mapChildren(children: ReactNode, fn: (child: ReactNode, index: number) => any): any[] {
  const out: any[] = []
  let index = 0
  mapIntoArray(children, out, '', '', (child) => fn(child, index++))
  return out
}

function countChildren(children: ReactNode): number {
  if (!Array.isArray(children)) return 1
  let n = 0
  for (let i = 0; i < children.length; i++) n += countChildren(children[i])
  return n
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
    if (children == null) return 0
    return countChildren(children)
  },
  toArray(children: ReactNode): any[] {
    if (children == null) return []
    return mapChildren(children, identity)
  },
  only(children: ReactNode): ReactElement {
    if (!isValidElement(children)) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error('Children.only expected a single React element.')
      }
      throw new Error()
    }
    return children
  },
}
