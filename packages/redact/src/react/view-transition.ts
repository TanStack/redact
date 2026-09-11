import type { ReactNode } from '../core'
import { ReactSharedInternals } from './shared-internals'

export const REACT_VIEW_TRANSITION_TYPE = Symbol.for('react.view_transition')

export type ViewTransitionClass = string | Record<string, string>
export interface ViewTransitionPseudoElement {
  animate(keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions): Animation
  getAnimations(): Animation[]
  getComputedStyle(): CSSStyleDeclaration
}

export interface ViewTransitionInstance {
  name: string
  group: ViewTransitionPseudoElement
  imagePair: ViewTransitionPseudoElement
  old: ViewTransitionPseudoElement
  new: ViewTransitionPseudoElement
}

type ViewTransitionEvent = (instance: ViewTransitionInstance, types: string[]) => void | (() => void)
export interface ViewTransitionProps {
  children?: ReactNode
  name?: string | Record<string, string> | undefined
  default?: ViewTransitionClass | undefined
  enter?: ViewTransitionClass | undefined
  exit?: ViewTransitionClass | undefined
  update?: ViewTransitionClass | undefined
  share?: ViewTransitionClass | undefined
  onEnter?: ViewTransitionEvent | undefined
  onExit?: ViewTransitionEvent | undefined
  onUpdate?: ViewTransitionEvent | undefined
  onShare?: ViewTransitionEvent | undefined
}

// Animation support belongs to the optional DOM feature, not this public entry.
export const ViewTransition = REACT_VIEW_TRANSITION_TYPE as unknown as (props: ViewTransitionProps) => any

export function addTransitionType(type: string): void {
  ReactSharedInternals.T?.add(type)
}
