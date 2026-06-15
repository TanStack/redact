import type { ReactElement, ReactNode, Ref } from './types'

export const enum FiberTag {
  Host = 0,
  Text = 1,
  Function = 2,
  Class = 3,
  Fragment = 4,
  Portal = 5,
  Provider = 6,
  Consumer = 7,
  ForwardRef = 8,
  Memo = 9,
  Lazy = 10,
  Suspense = 11,
  Root = 12,
}

export interface Hook {
  s: any
  q: any
  d: any
  c: any
  n: Hook | null
}

export interface Effect {
  t: 0 | 1
  c: () => any
}

export interface Fiber {
  tag: FiberTag
  type: any
  key: string | null
  ref: Ref<any> | null
  pp: any
  mp: any
  ms: any
  sn: any
  dom: Node | null
  parent: Fiber | null
  child: Fiber | null
  sibling: Fiber | null
  hooks: Hook | null
  cu: Array<() => void> | null
  dy: boolean
  um: boolean
  root: FiberRoot | null
}

export interface FiberRoot {
  c: Element | DocumentFragment
  r: Fiber
  p: Set<Fiber>
  s: boolean
  re?: ((err: unknown) => void) | undefined
  ce?: ((err: unknown) => void) | undefined
  ue?: ((err: unknown) => void) | undefined
  i: string
  h: boolean
}

export function createFiber(tag: FiberTag, type: any, key: string | null): Fiber {
  return {
    tag,
    type,
    key,
    ref: null,
    pp: null,
    mp: null,
    ms: null,
    sn: null,
    dom: null,
    parent: null,
    child: null,
    sibling: null,
    hooks: null,
    cu: null,
    dy: false,
    um: false,
    root: null,
  }
}

export type ChildNode = ReactElement | string | number | boolean | null | undefined | ChildNode[]
export type { ReactElement, ReactNode }
