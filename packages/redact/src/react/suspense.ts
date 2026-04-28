export const REACT_SUSPENSE_TYPE = Symbol.for('react.suspense')
export const REACT_STRICT_MODE_TYPE = Symbol.for('react.strict_mode')
export const REACT_PROFILER_TYPE = Symbol.for('react.profiler')

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
