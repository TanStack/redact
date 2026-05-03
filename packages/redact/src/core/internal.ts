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

export const enum FiberFlag {
  None = 0,
  Placement = 1 << 0,
  Update = 1 << 1,
  Deletion = 1 << 2,
  Ref = 1 << 3,
  Effect = 1 << 4,
  LayoutEffect = 1 << 5,
  ContentReset = 1 << 6,
  DidCapture = 1 << 7,
}

export interface Hook {
  state: any
  queue: any
  deps: any
  cleanup: any
  next: Hook | null
}

export interface Effect {
  tag: 'effect' | 'layout' | 'insertion'
  create: () => any
  destroy: (() => void) | void
  deps: ReadonlyArray<unknown> | undefined
}

export interface Fiber {
  tag: FiberTag
  type: any
  key: string | null
  ref: Ref<any> | null
  pendingProps: any
  memoizedProps: any
  memoizedState: any
  stateNode: any
  dom: Node | null
  parent: Fiber | null
  child: Fiber | null
  sibling: Fiber | null
  hooks: Hook | null
  effects: Effect[] | null
  layoutEffects: Effect[] | null
  cleanups: Array<() => void> | null
  flags: FiberFlag
  dirty: boolean
  unmounted: boolean
  root: FiberRoot | null
}

export interface FiberRoot {
  container: Element | DocumentFragment
  current: Fiber
  pending: Set<Fiber>
  scheduled: boolean
  onRecoverableError?: ((err: unknown) => void) | undefined
  onCaughtError?: ((err: unknown) => void) | undefined
  onUncaughtError?: ((err: unknown) => void) | undefined
  identifierPrefix: string
  hydrating: boolean
}

export function createFiber(tag: FiberTag, type: any, key: string | null): Fiber {
  return {
    tag,
    type,
    key,
    ref: null,
    pendingProps: null,
    memoizedProps: null,
    memoizedState: null,
    stateNode: null,
    dom: null,
    parent: null,
    child: null,
    sibling: null,
    hooks: null,
    effects: null,
    layoutEffects: null,
    cleanups: null,
    flags: FiberFlag.None,
    dirty: false,
    unmounted: false,
    root: null,
  }
}

export type ChildNode = ReactElement | string | number | boolean | null | undefined | ChildNode[]
export type { ReactElement, ReactNode }
