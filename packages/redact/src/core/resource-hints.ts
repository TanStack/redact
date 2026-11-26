import { isFunction } from './functions'
export type ResourceHintKind =
  | 'dns-prefetch'
  | 'preconnect'
  | 'preload'
  | 'modulepreload'
  | 'stylesheet'
  | 'script'
  | 'module-script'

// Only supported string options reach the dispatcher, using the public camelCase
// names. Fonts have crossOrigin: ''. Stylesheet precedence defaults to 'default'.
// Module preloads omit as for the implicit script destination. href is non-empty.
// A server renderer returns true to consume a hint in its current request, even
// when deduplication means no new output. Returning false falls through to the DOM.
export type ResourceHintOptions = Record<string, string>

export const resourceHintDispatcher: {
  emit?: (kind: ResourceHintKind, href: string, options: ResourceHintOptions) => boolean
} = {}

// The renderer excludes SVG before calling this. A ref does not opt a resource
// out of sharing, but event ownership, disabled sheets and itemProp do.
export type HostResourceKind = 'style' | 'stylesheet' | 'script'

export function resourceKind(type: string, props: any): HostResourceKind | undefined {
  if (props.itemProp != null) return
  if (type === 'style' || type === 'link') {
    if (isString(props.precedence) && isString(props.href) && props.href &&
      (type === 'style' || props.rel === 'stylesheet' && props.disabled == null && !props.onLoad && !props.onError)) {
      return type === 'style' ? 'style' : 'stylesheet'
    }
  } else if (type === 'script' && props.async && !isFunction(props.async) && typeof props.async !== 'symbol' && isString(props.src) && props.src && !props.onLoad && !props.onError) return 'script'

}

export const resourceURL = (value: string): string => (/^[\u0000-\u0020]*javascript:/i.test(String(value).replace(/[\r\n\t]/g, ''))
    ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')"
    : value)

import { isString } from "./functions"
