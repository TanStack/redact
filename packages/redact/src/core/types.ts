// React 19+ uses the transitional element symbol. When our shim's elements
// are passed to react-dom (e.g. Start routing through real react-dom/server
// somewhere), they must carry the symbol that React's isValidElement checks.
export const REACT_ELEMENT_TYPE = Symbol.for('react.transitional.element')
export const REACT_LEGACY_ELEMENT_TYPE = Symbol.for('react.element')
export const REACT_FRAGMENT_TYPE = Symbol.for('react.fragment')

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

