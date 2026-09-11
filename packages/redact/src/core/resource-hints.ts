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
export function resourceKind(type: string, props: any): 'style' | 'stylesheet' | 'script' | undefined {
  if (props.itemProp != null) return
  if (type === 'style') {
    if (typeof props.precedence === 'string' && typeof props.href === 'string' && props.href) return 'style'
  } else if (type === 'link') {
    if (props.rel === 'stylesheet' && typeof props.href === 'string' && props.href && typeof props.precedence === 'string' && props.disabled == null && !props.onLoad && !props.onError) return 'stylesheet'
  } else if (type === 'script' && props.async && typeof props.async !== 'function' && typeof props.async !== 'symbol' && typeof props.src === 'string' && props.src && !props.onLoad && !props.onError) return 'script'
}

export function resourceURL(value: string): string {
  return /^[\u0000-\u0020]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i.test(value)
    ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')"
    : value
}
