import { REACT_SUSPENSE_TYPE, REACT_STRICT_MODE_TYPE, REACT_PROFILER_TYPE } from '@tanstack/dom-core'

export const Suspense = REACT_SUSPENSE_TYPE as any as (props: {
  children?: any
  fallback?: any
}) => any

export const StrictMode = REACT_STRICT_MODE_TYPE as any as (props: {
  children?: any
}) => any

export const Profiler = REACT_PROFILER_TYPE as any as (props: {
  id: string
  onRender?: any
  children?: any
}) => any
