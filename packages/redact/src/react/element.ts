import {
  REACT_ELEMENT_TYPE,
  REACT_LEGACY_ELEMENT_TYPE,
  REACT_FRAGMENT_TYPE,
  type ReactElement,
  type ReactNode,
  type Ref,
} from '../core'
import type { FragmentInstance } from '../dom/fragment-instance'

export const Fragment = REACT_FRAGMENT_TYPE as unknown as (props: {
  children?: ReactNode
  key?: string | number
  ref?: Ref<FragmentInstance>
}) => ReactElement

export function createElement(
  type: any,
  config?: Record<string, any> | null,
  ...children: ReactNode[]
): ReactElement {
  let key: string | null = null
  const props: Record<string, any> = {}

  if (config != null) {
    if (config.key !== undefined && config.key !== null) key = '' + config.key
    for (const k in config) {
      if (k !== 'key' && k !== '__self' && k !== '__source' && Object.prototype.hasOwnProperty.call(config, k)) {
        props[k] = config[k]
      }
    }
  }

  if (children.length === 1) props.children = children[0]
  else if (children.length > 1) props.children = children

  if (type && type.defaultProps) {
    const dp = type.defaultProps
    for (const k in dp) {
      if (props[k] === undefined) props[k] = dp[k]
    }
  }

  return { $$typeof: REACT_ELEMENT_TYPE, type, key, ref: props.ref ?? null, props }
}

export function cloneElement(
  element: ReactElement,
  config?: Record<string, any> | null,
  ...children: ReactNode[]
): ReactElement {
  let key = element.key
  const props = { ...element.props }

  if (config != null) {
    if (config.key !== undefined) key = '' + config.key
    const defaultProps = element.type?.defaultProps
    for (const k in config) {
      if (k === 'key' || k === '__self' || k === '__source' || !Object.prototype.hasOwnProperty.call(config, k)) continue
      if (k === 'ref' && config.ref === undefined) continue
      props[k] = config[k] === undefined && defaultProps ? defaultProps[k] : config[k]
    }
  }

  if (children.length === 1) props.children = children[0]
  else if (children.length > 1) props.children = children

  return { $$typeof: REACT_ELEMENT_TYPE, type: element.type, key, ref: props.ref === undefined ? element.ref : props.ref, props }
}

export function isValidElement(obj: any): obj is ReactElement {
  if (typeof obj !== 'object' || obj === null) return false
  const t = obj.$$typeof
  return t === REACT_ELEMENT_TYPE || t === REACT_LEGACY_ELEMENT_TYPE
}

export function createRef<T = any>() {
  return { current: null as T | null }
}
