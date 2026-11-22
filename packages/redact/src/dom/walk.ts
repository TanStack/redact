import type { Fiber } from '../core'
import { visitChildren } from './tree'

export function walkRetained(fiber: Fiber, visit: (fiber: Fiber) => void, postorder?: boolean): void {
  function walk(node: Fiber): void {
    if (!postorder) visit(node)
    visitChildren(node, walk)
    if (postorder) visit(node)
  }
  walk(fiber)
}
