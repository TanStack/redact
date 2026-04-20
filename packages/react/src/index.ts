export { createElement, cloneElement, isValidElement, createRef, Fragment } from './element'
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
  use,
  useActionState,
  useFormStatus,
  useOptimistic,
  startTransition,
} from './hooks'
export { createContext } from './context'
export { Component, PureComponent } from './class'
export { memo, forwardRef, lazy } from './memo'
export { Suspense, StrictMode, Profiler } from './suspense'
export { Children } from './children'
export { ReactSharedInternals } from './shared-internals'

// Stub exports
export const cache = <T extends Function>(fn: T): T => fn
export const act = async (fn: () => any) => {
  const r = fn()
  if (r && typeof r.then === 'function') await r
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
  use,
  useActionState,
  useFormStatus,
  useOptimistic,
  startTransition,
} from './hooks'
import { createContext } from './context'
import { Component, PureComponent } from './class'
import { memo, forwardRef, lazy } from './memo'
import { Suspense, StrictMode, Profiler } from './suspense'
import { Children } from './children'

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
  use,
  useActionState,
  useFormStatus,
  useOptimistic,
  startTransition,
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
  version: '19.2.3',
}
