import { resourceHintDispatcher, resourceURL, type ResourceHintKind, type ResourceHintOptions } from '../core/resource-hints'
import { adoptResourceProps, getResources, insertResource, resourceAttribute, resourceSelector } from './resource-store'
const requestOptions = 'integrity fetchPriority'

function options(input: any, fields: string, as?: string): ResourceHintOptions {
  const result: ResourceHintOptions = {}
  for (const name of fields ? fields.split(' ') : []) {
    const value = input?.[name]
    if (typeof value === 'string') result[name] = value
  }
  const crossOrigin = input?.crossOrigin
  if (as === 'font' || typeof crossOrigin === 'string') {
    result.crossOrigin = as !== 'font' && crossOrigin === 'use-credentials' ? crossOrigin : ''
  }
  return result
}

function scriptDestination(as: string): boolean {
  return /^(script|audioworklet|paintworklet|serviceworker|sharedworker|worker)$/.test(as)
}

function emit(kind: ResourceHintKind, href: string, props: ResourceHintOptions): void {
  if (!href || resourceHintDispatcher.emit?.(kind, href, props) || typeof document === 'undefined') return
  const resources = getResources(document)

  const style = kind === 'stylesheet'
  const script = kind === 'script' || kind === 'module-script'
  const preload = kind === 'preload' || kind === 'modulepreload'
  const as = props.as || 'script'
  let selector: string
  let tag = 'link'
  if (style || script) {
    selector = resourceSelector(href, style ? 'style' : 'script')
    if (resources.instances.has(selector)) return
    const existing = document.querySelector(selector)
    if (existing) { resources.instances.set(selector, existing); return }
    adoptResourceProps(props, resources.preloads.get(selector), script)
    if (style) {
      props = { rel: 'stylesheet', href, 'data-precedence': props.precedence!, ...props }
      delete props.precedence
    } else {
      tag = 'script'
      props = { src: href, async: '', ...(kind === 'module-script' ? { type: 'module' } : {}), ...props }
    }
  } else {
    selector = `link[rel="${kind}"]`
    let resource = ''
    if (preload) {
      selector += resourceAttribute('as', as)
      if (as === 'image' && props.imageSrcSet) {
        selector += resourceAttribute('imagesrcset', props.imageSrcSet)
        if (typeof props.imageSizes === 'string') selector += resourceAttribute('imagesizes', props.imageSizes)
      } else selector += resourceAttribute('href', href)
      resource = (kind === 'preload' ? as === 'script' || as === 'style' : scriptDestination(as))
        ? resourceSelector(href, as)
        : ''
    } else {
      selector += resourceAttribute('href', href)
      if (props.crossOrigin != null) selector += resourceAttribute('crossorigin', props.crossOrigin)
    }
    const key = resource || selector
    if (resources.preloads.has(key)) return
    resources.preloads.set(key, props)
    if (document.querySelector(selector) || resource && document.querySelector(resource)) return
    props = { rel: kind, ...(kind === 'preload' && as === 'image' && props.imageSrcSet ? {} : { href }), ...props }
  }

  const node = document.createElement(tag)
  for (const name in props) {
    const value = props[name]!
    node.setAttribute(name.toLowerCase(), name === 'href' || name === 'src' ? resourceURL(value) : value)
  }
  if (style || script) resources.instances.set(selector, node)
  insertResource(node, style ? props['data-precedence'] : undefined)
}

export function prefetchDNS(href: string): void {
  if (typeof href === 'string') emit('dns-prefetch', href, {})
}

export function preconnect(href: string, input?: any): void {
  if (typeof href === 'string') emit('preconnect', href, options(input, ''))
}

export function preload(href: string, input?: any): void {
  if (typeof href === 'string' && input && typeof input === 'object' && typeof input.as === 'string' && input.as) {
    emit('preload', href, options(input, 'as nonce type referrerPolicy imageSrcSet imageSizes media ' + requestOptions, input.as))
  }
}

export function preinit(href: string, input?: any): void {
  if (typeof href === 'string' && input) {
    if (input.as === 'style') {
      const props = options(input, 'precedence ' + requestOptions)
      props.precedence ||= 'default'
      emit('stylesheet', href, props)
    } else if (input.as === 'script') {
      emit('script', href, options(input, 'nonce ' + requestOptions))
    }
  }
}

export function preloadModule(href: string, input?: any): void {
  if (typeof href === 'string') {
    const props = options(input, 'as nonce ' + requestOptions, input?.as)
    if (props.as === 'script') delete props.as
    emit('modulepreload', href, props)
  }
}

export function preinitModule(href: string, input?: any): void {
  if (typeof href === 'string' && (input == null || typeof input === 'object' && (input.as == null || input.as === 'script'))) {
    emit('module-script', href, options(input, 'nonce ' + requestOptions))
  }
}
