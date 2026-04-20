import {
  REACT_CONTEXT_TYPE,
  REACT_PROVIDER_TYPE,
  REACT_CONSUMER_TYPE,
  type Context,
} from '@tanstack/dom-core'
import { useContext } from './hooks'

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
