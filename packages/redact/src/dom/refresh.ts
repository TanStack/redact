import { FiberTag, type Fiber, type FiberRoot, type ReactNode } from '../core'
import { REACT_FORWARD_REF_TYPE, REACT_MEMO_TYPE, REACT_LAZY_TYPE } from '../react'
import { flushSyncWork, renderRoot, scheduleRootRender, scheduleUpdate } from './reconcile'
import { queueCommitEffects } from './commit'

// Only referenced inside development guards. The production renderer does not
// register a hook, allocate refresh bookkeeping, or check component families.
interface Family { current: any }
interface RefreshUpdate { updatedFamilies: Set<Family>; staleFamilies: Set<Family> }
interface RootState { memoizedState: { element: ReactNode } }
interface RefreshRoot {
  root: FiberRoot
  current: RootState & { alternate: RootState | null }
  render?: (() => void) | undefined
  failed: boolean
}
interface RefreshHook {
  isDisabled?: boolean
  inject(renderer: object): number
  onScheduleFiberRoot?(id: number, root: RefreshRoot, children: ReactNode): void
  onCommitFiberRoot?(id: number, root: RefreshRoot, priority: undefined, failed: boolean): void
}

let resolveFamily: ((type: any) => Family | undefined) | undefined
let hook: RefreshHook | undefined
let rendererID: number
const roots = new WeakMap<FiberRoot, RefreshRoot>()
const refreshing = new WeakSet<Fiber>()
const remounting = new WeakSet<Fiber>()
const failedBoundaries = new WeakSet<Fiber>()

function getRefreshRoot(root: FiberRoot): RefreshRoot | undefined {
  if (!hook) {
    const candidate = (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: RefreshHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__
    if (!candidate || candidate.isDisabled) return
    try {
      rendererID = candidate.inject({
        rendererPackageName: '@tanstack/redact',
        bundleType: 1,
        setRefreshHandler(handler: typeof resolveFamily) { resolveFamily = handler },
        scheduleRefresh,
        scheduleRoot(adapter: RefreshRoot, element: ReactNode) {
          flushSyncWork(() => scheduleRootRender(adapter.root, adapter.render || (() => renderRoot(adapter.root, element))))
        },
      })
      hook = candidate
    } catch { return }
  }
  let adapter = roots.get(root)
  if (!adapter) {
    adapter = { root, current: { memoizedState: { element: null }, alternate: null }, failed: false }
    roots.set(root, adapter)
  }
  return adapter
}

export function rememberRefreshRender(root: FiberRoot, render: () => void): void {
  const adapter = getRefreshRoot(root)
  if (adapter) adapter.render = render
}

export function scheduleRefreshRoot(root: FiberRoot, children: ReactNode): void {
  const adapter = getRefreshRoot(root)
  // Fatal error cleanup renders null internally. It must not replace the
  // user's last element or look like an intentional unmount to React Refresh.
  if (adapter && !adapter.failed) {
    try { hook!.onScheduleFiberRoot?.(rendererID, adapter, children) } catch {}
  }
}

export function commitRefreshRoot(root: FiberRoot): void {
  const adapter = roots.get(root)
  if (!adapter) return
  const previous = adapter.current.memoizedState
  adapter.current = {
    memoizedState: { element: root.r.mp?.children ?? null },
    alternate: { memoizedState: previous },
  }
  const failed = adapter.failed
  adapter.failed = false
  try { hook!.onCommitFiberRoot?.(rendererID, adapter, undefined, failed) } catch {}
}

export function failRefreshRoot(root: FiberRoot): void {
  const adapter = roots.get(root)
  if (adapter) adapter.failed = true
}

export function failRefreshBoundary(fiber: Fiber): void {
  failedBoundaries.add(fiber)
}

export function resolveRefreshType<T>(type: T): T {
  return resolveFamily?.(type)?.current ?? type
}

export function resolveRefreshMemo(wrapper: any): any {
  const type = resolveRefreshType(wrapper.type)
  return type === wrapper.type ? wrapper : { ...wrapper, type }
}

export function sameRefreshFamily(previous: any, next: any): boolean {
  const family = resolveFamily?.(previous)
  return family !== undefined && family === resolveFamily?.(next)
}

export function isRefreshing(fiber: Fiber | null): boolean {
  return !!fiber && refreshing.has(fiber)
}

export function finishRefresh(fiber: Fiber): void {
  if (refreshing.has(fiber)) queueCommitEffects(() => refreshing.delete(fiber))
}

export function needsRefreshRemount(fiber: Fiber): boolean {
  return remounting.has(fiber)
}

function typeKind(type: any): any {
  return typeof type === 'function' ? (type.prototype?.isReactComponent ? 'class' : 'function') : type?.$$typeof
}

function scheduleRefresh(adapter: RefreshRoot, update: RefreshUpdate): void {
  flushSyncWork(() => visit(adapter.root.r, update))
}

function visit(fiber: Fiber, update: RefreshUpdate): void {
  if (fiber.um || fiber.pd) return
  let remount = failedBoundaries.has(fiber), render = false
  let type = fiber.type
  while (type) {
    const family = resolveFamily?.(type)
    if (family) {
      if (update.staleFamilies.has(family) || typeKind(type) !== typeKind(family.current)) remount = true
      else if (update.updatedFamilies.has(family)) {
        if (typeKind(type) === 'class') remount = true
        else render = true
      }
    }
    if (type.$$typeof === REACT_MEMO_TYPE) type = type.type
    else if (type.$$typeof === REACT_FORWARD_REF_TYPE) type = type.render
    else if (type.$$typeof === REACT_LAZY_TYPE && type._payload?.status === 1) type = type._payload.result
    else if (type.$$typeof === REACT_LAZY_TYPE && type._payload?._status === 1) type = type._payload._result.default
    else break
  }
  if (remount) remounting.add(fiber)
  if (render || remount) {
    refreshing.add(fiber)
    scheduleUpdate(fiber)
  }
  if (!remount) {
    for (let child = fiber.child; child; child = child.sibling) visit(child, update)
    if (fiber.tag === FiberTag.Suspense && fiber.ms?.f) visit(fiber.ms.f, update)
  }
}
