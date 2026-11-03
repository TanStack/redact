import { useState, useReducer, useEffect, useLayoutEffect, useInsertionEffect, useRef, useMemo, useCallback, useContext, useImperativeHandle, useDebugValue, useId, useTransition, useDeferredValue, useSyncExternalStore, useSyncExternalStoreWithSelector, use, useActionState, useFormStatus, useOptimistic, useEffectEvent, startTransition, unstable_useCacheRefresh, } from './hooks';
export type { FragmentInstance } from '../dom/fragment-instance';
export { Children } from './children';
import { Suspense, StrictMode, Profiler } from './suspense';
export { Suspense, StrictMode, Profiler, REACT_SUSPENSE_TYPE, REACT_STRICT_MODE_TYPE, REACT_PROFILER_TYPE, } from './suspense';
export { createElement, cloneElement, isValidElement, createRef, Fragment } from './element';
import { act } from './act';
import { captureOwnerStack } from '../core/devtools';
export { captureOwnerStack } from '../core/devtools';
export type { ViewTransitionProps, ViewTransitionClass, ViewTransitionInstance, ViewTransitionPseudoElement } from './view-transition';
export { Component, PureComponent } from './class';
export { useState, useReducer, useEffect, useLayoutEffect, useInsertionEffect, useRef, useMemo, useCallback, useContext, useImperativeHandle, useDebugValue, useId, useTransition, useDeferredValue, useSyncExternalStore, useSyncExternalStoreWithSelector, use, useActionState, useFormStatus, useOptimistic, useEffectEvent, startTransition, unstable_useCacheRefresh, } from './hooks';
export type { ActivityProps } from './activity';
import { Children } from './children';
import { ViewTransition, addTransitionType } from './view-transition';
export { createContext, REACT_CONTEXT_TYPE, REACT_PROVIDER_TYPE, REACT_CONSUMER_TYPE, type Context, type ProviderExoticComponent, type ConsumerExoticComponent, } from './context';
export { memo, forwardRef, lazy, REACT_MEMO_TYPE, REACT_FORWARD_REF_TYPE, REACT_LAZY_TYPE, } from './memo';
import { Activity } from './activity';
export { ReactSharedInternals } from './shared-internals';
export { ViewTransition, addTransitionType, REACT_VIEW_TRANSITION_TYPE } from './view-transition';
export type { ReactElement, ReactNode, Key, Ref, RefObject, RefCallback, Dispatch, SetStateAction, EffectCallback, DependencyList, } from '../core';
import { createContext } from './context';
import { Component, PureComponent } from './class';
export { Activity, REACT_ACTIVITY_TYPE } from './activity';
import { memo, forwardRef, lazy } from './memo';
export { REACT_PORTAL_TYPE } from './portal';
import { createElement, cloneElement, isValidElement, createRef, Fragment } from './element';
// Lightweight functional-component alias — matches React's FC shape closely
// enough for the common `const X: FC<P> = (props) => …` pattern used in
// tests and downstream consumer code.
export type FC<P = {}> = (props: P & {
    children?: import('../core').ReactNode;
}) => import('../core').ReactElement | null;
// Stub exports
export const cache = <T extends Function>(fn: T): T => fn;
// The client/DOM-server entry has no RSC cache lifetime, matching React's
// client export. The upstream Flight renderer remains responsible for RSC.
export const cacheSignal = (): AbortSignal | null => null;
export { act };
export function taintUniqueValue(_msg: string, _lifetime: any, _value: any): void { }
export function taintObjectReference(_msg: string, _object: any): void { }
export const version = '19.2.3';
// Default export for `import React from 'react'` usage
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
    ...(process.env.NODE_ENV !== 'production' ? { captureOwnerStack } : {}),
    act,
    version: '19.2.3',
};
