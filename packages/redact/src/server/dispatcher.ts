import { isFunction } from '../core/functions'
import { readThenable } from '../react/thenable'
import { idleFormStatus } from '../react/form-state'
import { ReactSharedInternals, REACT_CONTEXT_TYPE } from '../react'
import { isBrowserToken, browserError } from '../core/browser'
import { resourceHintDispatcher, resourceKind } from '../core/resource-hints'
import { createResourceHints, type ResourceScope } from './resource-hints'

export interface SSRFrame {
  idCounter: number
  nextId: number
  identifierPrefix: string
  contextStack: ContextSnapshot
  resources?: ReturnType<typeof createResourceHints>
  shellFlushed?: boolean
  styleNonce?: string | undefined
}

let frame: SSRFrame | null = null

function resourcesFor(frame: SSRFrame) {
  return frame.resources ||= createResourceHints(frame.shellFlushed, frame.styleNonce)
}

resourceHintDispatcher.emit = (kind, href, options) => {
  if (!frame) return false
  resourcesFor(frame).add(kind, href, options)
  return true
}

export function beginSSR(identifierPrefix = ':R', nextFrame?: SSRFrame): () => void {
  const previousFrame = frame
  const previousDispatcher = ReactSharedInternals.H
  frame = nextFrame ?? { idCounter: 0, nextId: 0, identifierPrefix, contextStack: [] }
  ReactSharedInternals.H = ssrDispatcher as any
  return () => {
    while (frame?.contextStack.length) popContext()
    ReactSharedInternals.H = previousDispatcher ?? null
    frame = previousFrame
  }
}

export function currentSSRFrame(): SSRFrame {
  return frame!
}

export function recordHostResource(tag: string, props: any, emit: (chunk: string) => void, scope: ResourceScope, flags: number, inFallback?: boolean): ((chunk: string) => void) | true | null | void {
  if (!frame) return
  const kind = resourceKind(tag, props)
  if (!kind && !(flags & 16 && !(flags & 8) && (tag === 'meta' || tag === 'img' && !(flags & 4)))) return
  const collector = resourcesFor(frame)
  if (kind) return collector.addHost(kind, props, scope)
  return tag === 'img' ? collector.addImage(props) : collector.addMeta(props, emit, scope, inFallback)
}

export function pushContext(context: any, value: any): void {
  if (!frame) throw new Error(process.env.NODE_ENV !== 'production' ? 'pushContext called outside SSR' : '')
  frame.contextStack.push([context, context._currentValue])
  context._currentValue = value
}

export function popContext(context?: any): void {
  const top = frame?.contextStack.pop()
  if (top && (context === undefined || top[0] === context)) top[0]._currentValue = top[1]
}

export type ContextSnapshot = Array<[context: any, value: any]>

export function snapshotContexts(): ContextSnapshot {
  return frame?.contextStack.map(([context]) => [context, context._currentValue]) ?? []
}

/**
 * Push snapshot values for this render. The render restore callback clears them.
 * Called when we re-render a suspended boundary so it sees the same provider
 * values that were active at suspension time.
 */
export function applyContextSnapshot(snapshot: ContextSnapshot): void {
  for (const [context, value] of snapshot) pushContext(context, value)
}

export const ssrDispatcher = {
  useCacheRefresh() {
    return () => { throw new Error('Refreshing the cache is not supported during server rendering.') }
  },
  useState<S>(initial: S | (() => S)) {
    const v = isFunction(initial) ? (initial as () => S)() : initial
    return [v, (() => {}) as any] as [S, any]
  },
  useReducer<S, A>(_reducer: (s: S, a: A) => S, initialArg: any, init?: (a: any) => S) {
    const v = init ? init(initialArg) : initialArg
    return [v, (() => {}) as any]
  },
  useEffect() {
    // noop on server
  },
  useLayoutEffect() {
    // noop on server
  },
  useInsertionEffect() {
    // noop on server
  },
  useRef<T>(initial: T) {
    return { current: initial }
  },
  useMemo<T>(factory: () => T) {
    return factory()
  },
  useCallback<T extends Function>(fn: T) {
    return fn
  },
  useContext<T>(ctx: any): T {
    return ctx._currentValue
  },
  useImperativeHandle() {
    // noop on server
  },
  useDebugValue() {
    // noop
  },
  useId(): string {
    if (!frame) return ':r0:'
    return `${frame.identifierPrefix}${(frame.idCounter++).toString(36)}`
  },
  useTransition(): [boolean, (fn: () => void) => void] {
    return [false, (fn) => fn()]
  },
  useActionState<S, P>(_action: (state: Awaited<S>, payload: P) => S | Promise<S>, initial: Awaited<S>): [Awaited<S>, (payload: P) => void, boolean] {
    return [initial, () => {}, false]
  },
  useOptimistic<S, A>(state: S): [S, (action: A) => void] {
    return [state, () => {}]
  },
  useFormStatus() { return idleFormStatus },
  useDeferredValue<T>(v: T): T {
    return v
  },
  useSyncExternalStore<T>(
    _subscribe: (cb: () => void) => () => void,
    getSnapshot: () => T,
    getServerSnapshot?: () => T,
  ): T {
    return getServerSnapshot ? getServerSnapshot() : getSnapshot()
  },
  use<T>(resource: any): T {
    if (resource == null) throw new Error('use() received null or undefined')
    if (isBrowserToken(resource)) throw browserError(resource)
    if (resource.$$typeof === REACT_CONTEXT_TYPE) {
      return resource._currentValue
    }
    if (isFunction(resource.then)) {
      return readThenable(resource) as T
    }
    throw new Error('use() expected a Promise or Context')
  },
}
