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
  Activity = 13,
  Resource = 14,
}

export interface Hook {
  s: any
  q: any
  d: any
  c: any
}

export interface Effect {
  t: 0 | 1 | 2
  c: () => any
  d?: () => void
  s?: boolean // Store subscriptions run in layout but stay connected in Suspense.
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
  hooks: Hook[] | null
  cu: Array<() => void> | null
  dy: boolean
  um: boolean
  pd?: boolean
  su?: Fiber | null // Retained Suspense primary update target.
  ld?: boolean // Layout effects and refs are disconnected, not passive effects.
  root: FiberRoot | null
  depth?: number
  cx?: Map<any, any> | null
  cr?: Ref<any> | null
  rc?: (() => void) | null
}

export type RecoverableErrorHandler = (error: unknown, info: { componentStack: string | null; errorBoundary?: unknown }) => void

export interface FiberRoot {
  c: Element | DocumentFragment
  r: Fiber
  p: Set<Fiber>
  s: boolean
  u?: (() => void) | undefined
  er?: Array<{ error: unknown; stack: string }> | undefined
  eb?: boolean
  sp?: boolean
  re?: RecoverableErrorHandler | undefined
  ce?: RecoverableErrorHandler | undefined
  ue?: RecoverableErrorHandler | undefined
  i: string | undefined
  ic: number
  h: boolean
  a?: boolean
  fr?: boolean
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
