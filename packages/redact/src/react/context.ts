import type { ReactElement, ReactNode } from '../core'
import { useContext } from './hooks'

export const REACT_CONTEXT_TYPE = Symbol.for('react.context')
export const REACT_PROVIDER_TYPE = Symbol.for('react.provider')
export const REACT_CONSUMER_TYPE = Symbol.for('react.consumer')

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

export function createContext<T>(defaultValue: T): Context<T> {
  const context: Context<T> = {
    $$typeof: REACT_CONTEXT_TYPE,
    _currentValue: defaultValue,
  } as Context<T>

  const Provider: any = function Provider(_props: any): any {
    throw new Error('Provider components are handled by the renderer.')
  }
  Provider.$$typeof = REACT_PROVIDER_TYPE
  Provider._context = context

  const Consumer: any = function Consumer(props: { children: (v: T) => any }): any {
    return props.children(useContext(context))
  }
  Consumer.$$typeof = REACT_CONSUMER_TYPE
  Consumer._context = context

  context.Provider = Provider
  context.Consumer = Consumer

  return context
}
