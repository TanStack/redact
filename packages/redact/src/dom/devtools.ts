import { FiberTag, type Fiber, type FiberRoot } from '../core'
import { devToolsMetadata } from '../core/devtools'
import { onCommitRollback } from './commit'
import { notifyDevToolsCommit, hasPendingDevToolsEffects } from './devtools-effects'

// React DevTools consumes React's private fiber layout. Keep that layout in a
// separate, development-only tree instead of expanding Redact's runtime fibers.
// The renderer supplies its development hooks at attachment time. Keeping
// this module independent avoids pulling renderer cycles into production builds.
interface DevToolsRuntime {
  shared: typeof import('../react/shared-internals').ReactSharedInternals
  scheduleUpdate: typeof import('./reconcile').scheduleUpdate
  flushSyncWork: typeof import('./reconcile').flushSyncWork
  onCommitRollback: typeof import('./commit').onCommitRollback
}
let runtime: DevToolsRuntime
const REACT_VIEW_TRANSITION_TYPE = /* @__PURE__ */ Symbol.for('react.view_transition')
const REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for('react.profiler')
const REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for('react.strict_mode')
type DebugFiber = Record<string, any>
type HookDescription = { name: string; index: number; value: any; args: any[] }
const fibers = /* @__PURE__ */ new WeakMap<object, DebugFiber>()
const nativeFibers = /* @__PURE__ */ new WeakMap<DebugFiber, Fiber>()
const mountingFibers = /* @__PURE__ */ new WeakMap<Fiber, DebugFiber>()
const hosts = /* @__PURE__ */ new WeakMap<Node, Fiber>()
const hooks = /* @__PURE__ */ new WeakMap<Fiber, HookDescription[]>()
const dispatchers = /* @__PURE__ */ new WeakMap<object, any>()
const renderFunctions = /* @__PURE__ */ new WeakMap<Function, Function>()
const members = /* @__PURE__ */ new WeakMap<object, Set<Fiber>>()
const offscreens = /* @__PURE__ */ new WeakMap<Fiber, DebugFiber>()
let enabled = false
const rendered = /* @__PURE__ */ new WeakSet<Fiber>()
const changedTrees = /* @__PURE__ */ new WeakSet<Fiber>()
type Timing = { start: number; children: number; delegated: number; parent: Timing | null; fiber: Fiber }
const durations = /* @__PURE__ */ new WeakMap<Fiber, { self: number; actual: number }>()
const resolvedTypes = /* @__PURE__ */ new WeakMap<Fiber, { type: any; tag: FiberTag }>()
let timing: Timing | null = null
let errorHandler: ((fiber: DebugFiber) => boolean | null) | undefined
let suspenseHandler: ((fiber: DebugFiber) => boolean) | undefined
const forcedSuspensions = /* @__PURE__ */ new WeakMap<Fiber, { promise: Promise<void>; resolve: () => void }>()
const forcedErrors = /* @__PURE__ */ new WeakSet<Fiber>()
const forceClassUpdates = /* @__PURE__ */ new WeakSet<Fiber>()
const updaters = /* @__PURE__ */ new WeakMap<FiberRoot, Set<Fiber>>()

export function wrapDevToolsRender<T extends Function>(render: T): T {
  if (!enabled) return render
  let wrapped = renderFunctions.get(render)
  if (!wrapped) {
    wrapped = function react_stack_bottom_frame(props: any, ref: any) { return render(props, ref) }
    renderFunctions.set(render, wrapped)
  }
  return wrapped as T
}

export function beginDevToolsCallback(fiber: Fiber): Fiber | null {
  const previous = devToolsMetadata.current
  devToolsMetadata.current = fiber
  return previous
}

export function endDevToolsCallback(previous: Fiber | null | undefined): void {
  devToolsMetadata.current = previous || null
}

export function markDevToolsError(fiber: Fiber): void {
  if (enabled) forcedErrors.add(fiber)
}

export function markDevToolsUpdate(fiber: Fiber): void {
  if (!enabled || !fiber.r) return
  let pending = updaters.get(fiber.r)
  if (!pending) updaters.set(fiber.r, pending = new Set())
  pending.add(fiber)
}

export function markDevToolsClassUpdate(fiber: Fiber): void {
  if (enabled) forceClassUpdates.add(fiber)
}

export function consumeDevToolsClassUpdate(fiber: Fiber): boolean {
  return enabled && forceClassUpdates.delete(fiber)
}

export function devToolsError(fiber: Fiber): boolean | null {
  const view = fibers.get(fiber) || mountingFibers.get(fiber)
  const result = enabled && view ? errorHandler?.(view) ?? null : null
  if (result === true) forcedErrors.add(fiber)
  else forcedErrors.delete(fiber)
  return result
}

export function devToolsSuspension(fiber: Fiber): Promise<void> | undefined {
  if (!enabled) return
  const view = fibers.get(fiber) || mountingFibers.get(fiber)
  let pending = forcedSuspensions.get(fiber)
  if (view && suspenseHandler?.(view)) {
    if (!pending) {
      let resolve!: () => void
      const promise = new Promise<void>(done => { resolve = done })
      forcedSuspensions.set(fiber, pending = { promise, resolve })
    }
    return pending.promise
  }
  if (pending) {
    forcedSuspensions.delete(fiber)
    pending.resolve()
  }
}

function scheduleDevToolsUpdate(view: DebugFiber): void {
  const fiber = nativeFibers.get(view)
  if (!fiber || fiber.u) return
  if (fiber.t === FiberTag.Suspense && fiber.b) fiber.b.u = true
  runtime.flushSyncWork(() => runtime.scheduleUpdate(fiber))
}

export function beginDevToolsRender(fiber: Fiber): Timing | undefined {
  if (!enabled) return
  for (let current: Fiber | null = fiber; current && !changedTrees.has(current); current = current.p) changedTrees.add(current)
  if (fiber.t !== FiberTag.Memo && fiber.t !== FiberTag.Lazy) {
    resolvedTypes.set(fiber, { type: fiber.type, tag: fiber.t })
  }
  if (!fibers.has(fiber)) {
    const view = mountingFibers.get(fiber) || {}
    Object.assign(view, {
      tag: tags[fiber.t], type: fiber.type, elementType: fiber.type,
      memoizedProps: fiber.v, pendingProps: fiber.v, alternate: null,
      return: fiber.p ? fibers.get(fiber.p) || mountingFibers.get(fiber.p) || null : null,
      _debugOwner: null, _debugInfo: null,
    })
    mountingFibers.set(fiber, view)
    nativeFibers.set(view, fiber)
  }
  const start = performance.now()
  if (!timing && start - devToolsMetadata.stackResetTime > 1000) {
    devToolsMetadata.stackBudget = 10000
    devToolsMetadata.stackResetTime = start
  }
  timing = { start, children: 0, delegated: 0, parent: timing, fiber }
  devToolsMetadata.owner = fiber
  return timing
}

export function endDevToolsRender(frame: Timing | undefined): void {
  if (!enabled || !timing || timing !== frame) return
  const fiber = timing.fiber
  const elapsed = performance.now() - timing.start
  const previous = durations.get(fiber)
  const self = Math.max(0, elapsed - timing.children)
  durations.set(fiber, { self: self + timing.delegated, actual: (previous?.actual || 0) + self })
  if (timing.parent?.fiber === fiber) timing.parent.delegated += self + timing.delegated
  if (timing.parent) timing.parent.children += elapsed
  timing = timing.parent
  devToolsMetadata.owner = timing?.fiber || null
}

export function enableDevTools(hook: any, dependencies: DevToolsRuntime): void {
  runtime = dependencies
  // Embedded DevTools may install the hook from the parent window's realm.
  enabled = typeof hook.rendererInterfaces?.get === 'function'
  devToolsMetadata.enabled = enabled
}

export function rememberDevToolsFiber(fiber: Fiber, element: object): void {
  const metadata = devToolsMetadata.elements.get(element)
  if (!metadata) return
  const previous = devToolsMetadata.fibers.get(fiber)
  onCommitRollback(() => {
    if (previous) devToolsMetadata.fibers.set(fiber, previous)
    else devToolsMetadata.fibers.delete(fiber)
  })
  devToolsMetadata.fibers.set(fiber, metadata)
}

export const devToolsDispatcher = process.env.NODE_ENV === 'production' ? undefined! : function devToolsDispatcher(fiber: Fiber, dispatcher: any): any {
  if (!enabled) return dispatcher
  const previous = hooks.get(fiber)
  const wasRendered = rendered.has(fiber)
  runtime.onCommitRollback(() => {
    if (previous) hooks.set(fiber, previous)
    else hooks.delete(fiber)
    if (!wasRendered) rendered.delete(fiber)
  })
  rendered.add(fiber)
  hooks.set(fiber, [])
  let wrapped = dispatchers.get(dispatcher)
  if (!wrapped) {
    wrapped = {}
    const methods = {
      ...dispatcher,
      useHostTransitionStatus: () => dispatcher.useFormStatus(),
      useEffectEvent: (fn: any) => {
        const ref = dispatcher.useRef(fn)
        dispatcher.useInsertionEffect(() => { ref.current = fn })
        return dispatcher.useCallback((...args: any[]) => ref.current(...args), [])
      },
    }
    for (const name of Object.keys(methods)) {
      wrapped[name] = (...args: any[]) => {
        const current = runtime.shared.F!
        const index = runtime.shared.I
        const value = methods[name].apply(dispatcher, args)
        hooks.get(current)!.push({ name, index, value, args })
        return value
      }
    }
    dispatchers.set(dispatcher, wrapped)
  }
  return wrapped
}

const noHooks = { state: null, types: null, dependencies: null }
function debugHooks(fiber: Fiber): { state: any; types: string[] | null; dependencies: any } {
  const descriptions = hooks.get(fiber)
  if (!descriptions?.length) return noHooks
  let state: any = null, last: any = null, context: any = null, lastContext: any = null
  const types: string[] = []
  const thenables: any[] = []
  const append = (value: any, index: number) => {
    const node = { memoizedState: value, queue: null, next: null }
    if (last) last.next = node
    else state = node
    last = node
  }
  for (const item of descriptions) {
    types.push(item.name)
    const hook = fiber.h?.[item.index]
    switch (item.name) {
      case 'useDebugValue': break
      case 'useActionState': append(item.value[0], -1); append(item.value[2], -1); append(null, -1); break
      case 'useOptimistic': append(item.value[0], -1); break
      case 'useEffectEvent': append({ impl: item.args[0] }, -1); break
      case 'useHostTransitionStatus': {
        const next = { context: { _currentValue: item.value }, memoizedValue: item.value, next: null }
        if (lastContext) lastContext.next = next
        else context = next
        lastContext = next
        break
      }
      case 'use':
      case 'useContext': {
        const ctx = item.args[0]
        if (ctx && typeof ctx.then === 'function') thenables.push(ctx)
        else if (ctx) {
          const next = { context: ctx, memoizedValue: item.value, next: null }
          if (lastContext) lastContext.next = next
          else context = next
          lastContext = next
        }
        break
      }
      case 'useMemo':
      case 'useCallback': append([hook?.s, hook?.d], item.index); break
      case 'useTransition': append(item.value[0], -1); append(item.value[1], -1); break
      case 'useDeferredValue': append(item.value, -1); break
      case 'useSyncExternalStore': append(hook?.s, item.index); append(null, -1); break
      case 'useEffect':
      case 'useInsertionEffect':
      case 'useLayoutEffect':
      case 'useImperativeHandle': append({ create: item.args[0], deps: hook?.d }, item.index); break
      default: append(hook?.s, item.index)
    }
  }
  return { state, types, dependencies: context || thenables.length ? { firstContext: context, _debugThenableState: { thenables } } : null }
}

// Tags are the React 19 reconciler protocol, not Redact's compact internal tags.
const tags = [5, 6, 0, 1, 7, 4, 10, 9, 11, 15, 0, 13, 3, 31, 26]

function project(fiber: Fiber, parent: DebugFiber | null, index: number, seen: Set<Fiber>, deferred: boolean, reuse = false): DebugFiber {
  seen.add(fiber)
  const previous = fibers.get(fiber)
  if (!deferred && previous && !changedTrees.has(fiber)) {
    retain(previous, seen)
    if (reuse) return previous
    const view = { ...previous, return: parent, index, sibling: null, flags: 0, actualDuration: 0 }
    connectView(view, previous, fiber, fiber)
    return view
  }
  changedTrees.delete(fiber)
  const view: DebugFiber = deferred ? {} : previous?.alternate || mountingFibers.get(fiber) || {}
  if (!deferred && view.tag === 1) delete view.pendingProps
  const hookData = debugHooks(fiber)
  const resolved = resolvedTypes.get(fiber)
  const type = resolved?.type ?? fiber.type
  const tag = resolved?.tag ?? fiber.t
  const metadata = devToolsMetadata.fibers.get(fiber)
  Object.assign(view, {
    _redactKey: fiber, _redactFiber: fiber, _redactOwner: metadata?.owner,
    tag: type === REACT_VIEW_TRANSITION_TYPE ? 30 : type === REACT_PROFILER_TYPE ? 12 : type === REACT_STRICT_MODE_TYPE ? 8 : fiber.t === FiberTag.Memo && tag === FiberTag.Function ? 15 : tags[tag], type, elementType: fiber.type, key: fiber.key,
    stateNode: fiber.n || fiber.i, return: parent, child: null, sibling: null,
    index, ref: fiber.ref, pendingProps: fiber.v, memoizedProps: fiber.m,
    memoizedState: fiber.t === FiberTag.Root ? { element: fiber.m?.children ?? null }
      : tag === FiberTag.Class ? fiber.i?.state ?? null : hookData.state,
    dependencies: hookData.dependencies, alternate: null,
    flags: (!previous || previous.memoizedProps !== fiber.m || rendered.has(fiber) ? 1 : 0) | (forcedErrors.has(fiber) ? 128 : 0),
    subtreeFlags: 0, mode: 0, _debugHookTypes: hookData.types,
    _debugOwner: metadata?.owner ? fibers.get(metadata.owner) || null : null,
    _debugSource: metadata?.source || null, _debugStack: metadata?.stack || null, _debugInfo: null,
  })
  rendered.delete(fiber)
  if (!deferred) connectView(view, previous, fiber, fiber)
  let last: DebugFiber | null = null, childIndex = 0
  let lastChanged: Fiber | null = null
  if (!deferred) for (let child = fiber.c; child; child = child.s) {
    if (changedTrees.has(child) || !fibers.has(child)) lastChanged = child
  }
  let reuseTail = !lastChanged
  for (let child = fiber.c; child; child = child.s) {
    const next = project(child, view, childIndex++, seen, deferred, reuseTail)
    if (child === lastChanged) reuseTail = true
    if (last) last.sibling = next
    else view.child = next
    last = next
  }
  if (tag === FiberTag.Suspense || tag === FiberTag.Activity) {
    const key = offscreens.get(fiber) || {}
    offscreens.set(fiber, key)
    const old = fibers.get(key)
    const offscreen: DebugFiber = deferred ? {} : old?.alternate || {}
    const hidden = tag === FiberTag.Suspense ? !!fiber.b?.p : fiber.m?.mode === 'hidden'
    Object.assign(offscreen, {
      _redactKey: key,
      tag: 22, type: null, elementType: null, key: null, index: 0, ref: null,
      return: view, child: view.child, sibling: null, stateNode: null,
      memoizedProps: { mode: hidden ? 'hidden' : 'visible' }, pendingProps: null,
      memoizedState: hidden ? {} : null, alternate: null, flags: 0,
      dependencies: null, mode: 0, actualDuration: 0, selfBaseDuration: 0,
      treeBaseDuration: 0,
    })
    if (tag === FiberTag.Suspense && hidden) {
      view.memoizedState = { dehydrated: null }
      if (fiber.b?.f) offscreen.sibling = project(fiber.b.f, view, 1, seen, deferred)
      else {
        // Hydrated fallback children can live directly under the boundary.
        offscreen.sibling = view.child
        offscreen.child = null
      }
    }
    for (let child = offscreen.child; child; child = child.sibling) {
      child.return = offscreen
      offscreen.actualDuration += child.actualDuration
      offscreen.treeBaseDuration += child.treeBaseDuration
    }
    view.child = offscreen
    if (!deferred) connectView(offscreen, old, key)
  }
  const duration = durations.get(fiber)
  view.actualDuration = duration?.actual || 0
  view.selfBaseDuration = duration?.self || 0
  view.treeBaseDuration = view.selfBaseDuration
  for (let child = view.child; child; child = child.sibling) {
    view.actualDuration += child.actualDuration
    view.treeBaseDuration += child.treeBaseDuration
  }
  if (duration) duration.actual = 0
  return view
}

// Like React's bailout fibers, unchanged subtrees keep their identity. Walking
// their compact membership avoids rebuilding hook lists and debug snapshots.
function retain(view: DebugFiber, seen: Set<Fiber>): void {
  if (view._redactFiber) seen.add(view._redactFiber)
  view.actualDuration = 0
  for (let child = view.child; child; child = child.sibling) retain(child, seen)
}

function connectView(view: DebugFiber, previous: DebugFiber | undefined, key: object, fiber?: Fiber): void {
  view.alternate = previous || null
  if (previous) previous.alternate = view
  fibers.set(key, view)
  if (fiber) {
    mountingFibers.delete(fiber)
    nativeFibers.set(view, fiber)
    if (view.stateNode?.nodeType) hosts.set(view.stateNode, fiber)
    if (view.tag === 1) Object.defineProperty(view, 'pendingProps', {
      configurable: true, enumerable: true,
      get: () => fiber.v,
      set: value => { fiber.v = value },
    })
  }
  view._debugOwner = view._redactOwner ? fibers.get(view._redactOwner) || null : null
}

function materialize(snapshot: DebugFiber, parent: DebugFiber | null): DebugFiber {
  const key = snapshot._redactKey
  const fiber: Fiber | undefined = snapshot._redactFiber
  const previous = fibers.get(key)
  const view = previous?.alternate || (fiber && mountingFibers.get(fiber)) || {}
  // The backend writes class pendingProps directly before calling forceUpdate.
  // Remove the old accessor before copying a historical notification snapshot.
  if (view.tag === 1) delete view.pendingProps
  Object.assign(view, snapshot, { return: parent, child: null, sibling: null })
  connectView(view, previous, key, fiber)
  let last: DebugFiber | null = null
  for (let child = snapshot.child; child; child = child.sibling) {
    const next = materialize(child, view)
    if (last) last.sibling = next
    else view.child = next
    last = next
  }
  return view
}

export function commitDevTools(root: FiberRoot, adapter: any, hook: any, id: number, failed: boolean): boolean {
  if (!enabled) return false
  changedTrees.add(root.r)
  const seen = new Set<Fiber>()
  const deferred = hasPendingDevToolsEffects(root)
  const snapshot = project(root.r, null, 0, seen, deferred)
  const pendingUpdaters = updaters.get(root) || new Set()
  updaters.delete(root)
  adapter._debugRootType ||= devToolsMetadata.hydratedRoots.has(root) ? 'hydrateRoot()' : 'createRoot()'
  notifyDevToolsCommit(root, (layout, passive) => {
    const view = deferred ? materialize(snapshot, null) : snapshot
    view.stateNode = adapter
    adapter.current = view
    adapter.containerInfo = root.c
    adapter.effectDuration = layout
    adapter.passiveEffectDuration = passive
    adapter.memoizedUpdaters = new Set([...pendingUpdaters].map(fiber => fibers.get(fiber)).filter(Boolean))
    for (const old of members.get(adapter) || []) {
      if (!seen.has(old)) {
        try { hook.onCommitFiberUnmount?.(id, fibers.get(old)) } catch {}
        if (old.n && hosts.get(old.n) === old) hosts.delete(old.n)
        fibers.delete(old)
        hooks.delete(old)
        forcedSuspensions.get(old)?.resolve()
        forcedSuspensions.delete(old)
      }
    }
    members.set(adapter, seen)
    try {
      hook.onCommitFiberRoot?.(id, adapter, undefined, failed)
      hook.onPostCommitFiberRoot?.(id, adapter)
    } catch {}
  })
  return true
}

function edit(value: any, path: (string | number)[], next: any, remove = false): any {
  if (!path.length) return next
  const copy = Array.isArray(value) ? value.slice() : { ...value }
  const [key, ...rest] = path
  if (rest.length) copy[key!] = edit(value?.[key!], rest, next, remove)
  else if (remove) {
    if (Array.isArray(copy)) copy.splice(Number(key), 1)
    else delete copy[key!]
  } else copy[key!] = next
  return copy
}

function updateProps(view: DebugFiber, transform: (props: any) => any): void {
  const fiber = nativeFibers.get(view)
  if (!fiber || fiber.u) return
  fiber.v = transform(fiber.v)
  runtime.flushSyncWork(() => runtime.scheduleUpdate(fiber))
}

function updateHook(view: DebugFiber, id: number, transform: (state: any) => any): void {
  const fiber = nativeFibers.get(view)
  if (!fiber || fiber.u) return
  // DevTools IDs count visible primitive hooks, not React's internal slots.
  const item = hooks.get(fiber)?.filter(item => !['useContext', 'use', 'useDebugValue', 'useHostTransitionStatus'].includes(item.name))[id]
  if (!item || (item.name !== 'useState' && item.name !== 'useReducer')) return
  const hook = fiber.h?.[item.index]
  if (!hook) return
  hook.s = hook.d = transform(hook.s)
  hook.c = null
  // A DevTools edit is an explicit render, not an eager-state bailout.
  fiber.v = { ...fiber.v }
  runtime.flushSyncWork(() => runtime.scheduleUpdate(fiber))
}

function renamed(value: any, oldPath: (string | number)[], newPath: (string | number)[]): any {
  const entry = oldPath.reduce((item, key) => item?.[key], value)
  return edit(edit(value, oldPath, undefined, true), newPath, entry)
}

export function devToolsRenderer(): Record<string, any> {
  return {
    version: '19.2.3', reconcilerVersion: '19.2.3',
    currentDispatcherRef: runtime.shared,
    getCurrentFiber: () => {
      const fiber = devToolsMetadata.current || timing?.fiber || runtime.shared.F
      return fiber ? fibers.get(fiber) || mountingFibers.get(fiber) || null : null
    },
    findFiberByHostInstance(node: Node) {
      for (let current: Node | null = node; current; current = current.parentNode) {
        const fiber = hosts.get(current)
        if (fiber) return fibers.get(fiber) || null
      }
      return null
    },
    scheduleUpdate: scheduleDevToolsUpdate,
    scheduleRetry: scheduleDevToolsUpdate,
    setErrorHandler(handler: typeof errorHandler) { errorHandler = handler },
    setSuspenseHandler(handler: typeof suspenseHandler) { suspenseHandler = handler },
    overrideProps: (view: DebugFiber, path: any[], value: any) => updateProps(view, props => edit(props, path, value)),
    overridePropsDeletePath: (view: DebugFiber, path: any[]) => updateProps(view, props => edit(props, path, undefined, true)),
    overridePropsRenamePath: (view: DebugFiber, oldPath: any[], newPath: any[]) => updateProps(view, props => renamed(props, oldPath, newPath)),
    overrideHookState: (view: DebugFiber, id: number, path: any[], value: any) => updateHook(view, id, state => edit(state, path, value)),
    overrideHookStateDeletePath: (view: DebugFiber, id: number, path: any[]) => updateHook(view, id, state => edit(state, path, undefined, true)),
    overrideHookStateRenamePath: (view: DebugFiber, id: number, oldPath: any[], newPath: any[]) => updateHook(view, id, state => renamed(state, oldPath, newPath)),
  }
}

export function invokeDevToolsCallback<T>(fiber: Fiber, callback: () => T): T {
  const previous = beginDevToolsCallback(fiber)
  try { return callback() } finally { endDevToolsCallback(previous) }
}

export function renderWithDevTools(fiber: Fiber, render?: (fiber: Fiber) => void): void {
  const previousOwner = devToolsMetadata.owner
  const previousCurrent = devToolsMetadata.current
  if (!previousOwner && performance.now() - devToolsMetadata.stackResetTime > 1000) {
    devToolsMetadata.stackBudget = 10000
    devToolsMetadata.stackResetTime = performance.now()
  }
  devToolsMetadata.owner = devToolsMetadata.current = fiber
  const timing = beginDevToolsRender(fiber)
  try { render?.(fiber) } finally {
    endDevToolsRender(timing)
    devToolsMetadata.owner = previousOwner
    devToolsMetadata.current = previousCurrent
  }
}
