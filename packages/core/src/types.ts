// React 19+ uses the transitional element symbol. When our shim's elements
// are passed to react-dom (e.g. Start routing through real react-dom/server
// somewhere), they must carry the symbol that React's isValidElement checks.
export const REACT_ELEMENT_TYPE = Symbol.for('react.transitional.element')
export const REACT_LEGACY_ELEMENT_TYPE = Symbol.for('react.element')
export const REACT_FRAGMENT_TYPE = Symbol.for('react.fragment')
export const REACT_PORTAL_TYPE = Symbol.for('react.portal')
export const REACT_PROVIDER_TYPE = Symbol.for('react.provider')
export const REACT_CONTEXT_TYPE = Symbol.for('react.context')
export const REACT_CONSUMER_TYPE = Symbol.for('react.consumer')
export const REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref')
export const REACT_SUSPENSE_TYPE = Symbol.for('react.suspense')
export const REACT_MEMO_TYPE = Symbol.for('react.memo')
export const REACT_LAZY_TYPE = Symbol.for('react.lazy')
export const REACT_STRICT_MODE_TYPE = Symbol.for('react.strict_mode')
export const REACT_PROFILER_TYPE = Symbol.for('react.profiler')

export type Key = string | number | null | undefined

export interface ReactElement<P = any, T = any> {
  $$typeof: typeof REACT_ELEMENT_TYPE
  type: T
  key: string | null
  ref: any
  props: P
}

export type ReactNode =
  | ReactElement
  | string
  | number
  | boolean
  | null
  | undefined
  | Iterable<ReactNode>

export type RefObject<T> = { current: T | null }
export type RefCallback<T> = (instance: T | null) => void | (() => void)
export type Ref<T> = RefObject<T> | RefCallback<T> | null

export type Dispatch<A> = (value: A) => void
export type SetStateAction<S> = S | ((prev: S) => S)

export type EffectCallback = () => void | (() => void)
export type DependencyList = ReadonlyArray<unknown>

export interface Context<T> {
  $$typeof: typeof REACT_CONTEXT_TYPE
  _currentValue: T
  Provider: ProviderExoticComponent<{ value: T; children?: ReactNode }>
  Consumer: ConsumerExoticComponent<T>
  displayName?: string
}

export interface ProviderExoticComponent<P> {
  $$typeof: typeof REACT_PROVIDER_TYPE
  _context: Context<any>
  (props: P): ReactElement
}

export interface ConsumerExoticComponent<T> {
  $$typeof: typeof REACT_CONSUMER_TYPE
  _context: Context<T>
  (props: { children: (value: T) => ReactNode }): ReactElement
}
