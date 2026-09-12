export { createElement, cloneElement, isValidElement, createRef, Fragment } from './element'
export type {
  ReactElement,
  ReactNode,
  Key,
  Ref,
  RefObject,
  RefCallback,
  Dispatch,
  SetStateAction,
  EffectCallback,
  DependencyList,
} from '../core'

// Lightweight functional-component alias — matches React's FC shape closely
// enough for the common `const X: FC<P> = (props) => …` pattern used in
// tests and downstream consumer code.
export type FC<P = {}> = (props: P & { children?: import('../core').ReactNode }) => import('../core').ReactElement | null
export {
  useState,
  useReducer,
  useEffect,
  useLayoutEffect,
  useInsertionEffect,
  useRef,
  useMemo,
  useCallback,
  useContext,
  useImperativeHandle,
  useDebugValue,
  useId,
  useTransition,
  useDeferredValue,
  useSyncExternalStore,
  useSyncExternalStoreWithSelector,
  use,
  useActionState,
  useFormStatus,
  useOptimistic,
  useEffectEvent,
  startTransition,
  unstable_useCacheRefresh,
} from './hooks'
export {
  createContext,
  REACT_CONTEXT_TYPE,
  REACT_PROVIDER_TYPE,
  REACT_CONSUMER_TYPE,
  type Context,
  type ProviderExoticComponent,
  type ConsumerExoticComponent,
} from './context'
export { Component, PureComponent } from './class'
export {
  memo, forwardRef, lazy,
  REACT_MEMO_TYPE,
  REACT_FORWARD_REF_TYPE,
  REACT_LAZY_TYPE,
} from './memo'
export {
  Suspense, StrictMode, Profiler,
  REACT_SUSPENSE_TYPE,
  REACT_STRICT_MODE_TYPE,
  REACT_PROFILER_TYPE,
} from './suspense'
export { REACT_PORTAL_TYPE } from './portal'
export { Children } from './children'
export { ViewTransition, addTransitionType, REACT_VIEW_TRANSITION_TYPE } from './view-transition'
export type { ViewTransitionProps, ViewTransitionClass, ViewTransitionInstance, ViewTransitionPseudoElement } from './view-transition'
export { Activity, REACT_ACTIVITY_TYPE } from './activity'
export type { ActivityProps } from './activity'
export type { FragmentInstance } from '../dom/fragment-instance'
export { ReactSharedInternals } from './shared-internals'

// Stub exports
export const cache = <T extends Function>(fn: T): T => fn
// The client/DOM-server entry has no RSC cache lifetime, matching React's
// client export. The upstream Flight renderer remains responsible for RSC.
export const cacheSignal = (): AbortSignal | null => null
export const act = async (fn: () => any) => {
  const r = fn()
  if (r && typeof r.then == 'function') await r
}
export function taintUniqueValue(_msg: string, _lifetime: any, _value: any): void {}
export function taintObjectReference(_msg: string, _object: any): void {}

export const version = '19.2.3'

// Default export for `import React from 'react'` usage
import { createElement, cloneElement, isValidElement, createRef, Fragment } from './element'
import {
  useState,
  useReducer,
  useEffect,
  useLayoutEffect,
  useInsertionEffect,
  useRef,
  useMemo,
  useCallback,
  useContext,
  useImperativeHandle,
  useDebugValue,
  useId,
  useTransition,
  useDeferredValue,
  useSyncExternalStore,
  useSyncExternalStoreWithSelector,
  use,
  useActionState,
  useFormStatus,
  useOptimistic,
  useEffectEvent,
  startTransition,
  unstable_useCacheRefresh,
} from './hooks'
import { createContext } from './context'
import { Component, PureComponent } from './class'
import { memo, forwardRef, lazy } from './memo'
import { Suspense, StrictMode, Profiler } from './suspense'
import { Children } from './children'
import { ViewTransition, addTransitionType } from './view-transition'
import { Activity } from './activity'

export default {
  createElement,
  cloneElement,
  isValidElement,
  createRef,
  Fragment,
  useState,
  useReducer,
  useEffect,
  useLayoutEffect,
  useInsertionEffect,
  useRef,
  useMemo,
  useCallback,
  useContext,
  useImperativeHandle,
  useDebugValue,
  useId,
  useTransition,
  useDeferredValue,
  useSyncExternalStore,
  // `use-sync-external-store/shim/with-selector` aliases here, and zustand
  // reads it as a CJS default import.
  useSyncExternalStoreWithSelector,
  use,
  useActionState,
  useFormStatus,
  useOptimistic,
  useEffectEvent,
  startTransition,
  unstable_useCacheRefresh,
  createContext,
  Component,
  PureComponent,
  memo,
  forwardRef,
  lazy,
  Suspense,
  StrictMode,
  Profiler,
  Children,
  ViewTransition,
  Activity,
  addTransitionType,
  cache,
  cacheSignal,
  version: '19.2.3',
}
