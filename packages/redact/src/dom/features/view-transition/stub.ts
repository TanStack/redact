import type { FiberRoot } from '../../../core'

export function markTransitionUpdate(_root: FiberRoot): void {}
export function deferTransition(_root: FiberRoot, _commit: () => void, _flush: () => void): boolean { return false }
export function cancelTransitions(): void {}
export function deferTransitionLayout(_work: () => void): boolean { return false }
export function deferTransitionPassive(_work: () => void): boolean { return false }
