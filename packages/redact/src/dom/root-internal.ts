import { FiberTag, createFiber, type Fiber, type FiberRoot } from '../core'

export interface RootOptionsInternal {
  identifierPrefix?: string
  onRecoverableError?: (error: unknown) => void
  onCaughtError?: (error: unknown) => void
  onUncaughtError?: (error: unknown) => void
}

export function createFiberRoot(
  container: Element | Document | DocumentFragment,
  options: RootOptionsInternal,
): FiberRoot {
  const rootFiber = createFiber(FiberTag.Root, null, null)
  const root: FiberRoot = {
    c: container as any,
    r: rootFiber,
    p: new Set(),
    s: false,
    re: options.onRecoverableError,
    ce: options.onCaughtError,
    ue: options.onUncaughtError,
    i: options.identifierPrefix ?? ':r',
    ic: 0,
    h: false,
  }
  rootFiber.root = root
  rootFiber.sn = container
  return root
}

export function attachRootFiber(
  root: FiberRoot,
  container: Element | Document | DocumentFragment,
): void {
  const rootFiber = createFiber(FiberTag.Root, null, null)
  root.c = container as any
  root.ic = 0
  rootFiber.root = root
  rootFiber.sn = container
  root.r = rootFiber
}
