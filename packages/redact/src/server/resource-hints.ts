import { resourceKind, resourceURL, type ResourceHintKind, type ResourceHintOptions } from '../core/resource-hints'
import { attrToHtml, escapeAttr } from './escape'
import { attributeName } from '../core/attributes'

interface Resource {
  kind: ResourceHintKind | 'style'
  href: string
  options: Record<string, any>
  sent?: boolean
  cancelled?: boolean
  preloaded?: boolean
  css?: string
}

export interface ResourceScope {
  stylesheets?: Map<string, string[]>
  inline?: Set<string>
}

function styleText(props: any): string {
  const html = props.dangerouslySetInnerHTML
  if (html != null) {
    if (typeof html !== 'object' || !('__html' in html)) throw new Error('dangerouslySetInnerHTML must be an object with an __html field.')
    if (props.children != null) throw new Error('Can only set one of children or dangerouslySetInnerHTML.')
    return html.__html == null ? '' : '' + html.__html
  }
  const child = Array.isArray(props.children) ? props.children.length < 2 ? props.children[0] : null : props.children
  return child == null || typeof child === 'function' || typeof child === 'symbol' ? ''
    : ('' + child).replace(/(<\/?)(s)(tyle)/gi, (_, prefix: string, s: string, suffix: string) => prefix + '\\' + s.charCodeAt(0).toString(16) + ' ' + suffix)
}

function markup(resource: Resource, late: boolean): string {
  const { kind, href, options } = resource
  const script = kind === 'script' || kind === 'module-script'
  const style = kind === 'stylesheet'
  const props: Record<string, any> = script
    ? { src: href, ...(kind === 'module-script' ? { type: 'module' } : {}), async: true, ...options }
    : style
      ? late
        ? { rel: 'preload', as: 'style', href, crossOrigin: options.crossOrigin, fetchPriority: options.fetchPriority, integrity: options.integrity, media: options.media, hrefLang: options.hrefLang, referrerPolicy: options.referrerPolicy }
        : { rel: 'stylesheet', href, 'data-precedence': options.precedence!, ...options }
      : { rel: kind, ...(options.as === 'image' && options.imageSrcSet ? {} : { href }), ...options }
  let output = script ? '<script' : '<link'
  for (const name in props) {
    if (name === 'precedence' || late && name === 'data-precedence') continue
    const value = name === 'href' || name === 'src' ? resourceURL(props[name]!) : props[name]!
    output += attrToHtml(name, value).replace(/'/g, '&#x27;')
  }
  return output + (script ? '></script>' : '/>')
}

export function createResourceHints(shellFlushed = false, styleNonce?: string) {
  const resources = new Map<string, Resource>()
  const groups: Resource[][] = [[], [], [], [], []]
  const styles = new Map<string, Resource[]>()
  const dependencies = new Map<string, string[]>()
  const visibleInline = new Set<string>()
  const collector = {
    add(kind: ResourceHintKind | 'style', href: string, options: ResourceHintOptions): Resource {
      let type: string = kind
      let source = href
      const init = kind === 'style' || kind === 'stylesheet' || kind === 'script' || kind === 'module-script'
      if (kind === 'preload') {
        type = options.as!
        if (type === 'image' && options.imageSrcSet) source = options.imageSrcSet + '\n' + (options.imageSizes || '')
      } else if (kind === 'modulepreload') type = 'module-' + (options.as || 'script')
      else if (kind === 'stylesheet') type = 'style'
      else if (kind === 'preconnect') type += ':' + (options.crossOrigin ?? 'default')
      const key = JSON.stringify([type, source])
      const prior = resources.get(key)
      if (prior && (!init || prior.kind !== 'preload' && prior.kind !== 'modulepreload')) return prior

      const resource: Resource = { kind, href, options: { ...options } }
      if (kind === 'style' && (!styleNonce || options.nonce === styleNonce)) resource.css = styleText(options)
      if (prior) {
        prior.cancelled = true
        resource.preloaded = !!prior.sent
        for (const name of ['crossOrigin', 'integrity']) {
          if (resource.options[name] == null && prior.options[name] != null) resource.options[name] = prior.options[name]!
        }
      }
      resources.set(key, resource)
      if (kind === 'stylesheet' || kind === 'style') {
        const precedence = options.precedence!
        let group = styles.get(precedence)
        if (!group) styles.set(precedence, group = [])
        group.push(resource)
      } else {
        const group = kind === 'dns-prefetch' || kind === 'preconnect' ? 0
          : kind === 'preload' && options.as === 'font' ? 1
          : kind === 'preload' && options.as === 'image' && options.fetchPriority === 'high' ? 2
          : init ? 3 : 4
        groups[group]!.push(resource)
      }
      return resource
    },
    addHost(type: string, props: any, scope?: ResourceScope): boolean {
      const kind = resourceKind(type, props)
      if (!kind) return false
      const resource = collector.add(kind === 'script' && props.type === 'module' ? 'module-script' : kind, kind === 'script' ? props.src : props.href, props)
      if (shellFlushed && kind === 'stylesheet') {
        const descriptor = [resourceURL(resource.href), resource.options.precedence]
        for (const name in resource.options) {
          if (name === 'href' || name === 'rel' || name === 'precedence' || name === 'data-precedence' || name === 'children' || name === 'dangerouslySetInnerHTML' || name === 'innerHTML' || name === 'style' || name === 'suppressHydrationWarning' || name === 'suppressContentEditableWarning' || name === 'ref' || name === 'key' || /^on/i.test(name) || !/^[a-zA-Z_:][a-zA-Z0-9:_.-]*$/.test(name)) continue
          const value = resource.options[name]
          if (value == null || typeof value === 'function' || typeof value === 'symbol' || name === 'hidden' && value === false) continue
          descriptor.push(attributeName(name), name === 'hidden' ? '' : name === 'src' ? resourceURL('' + value) : '' + value)
        }
        ;(scope ? scope.stylesheets ||= new Map() : dependencies).set(resource.href, descriptor)
      } else if (shellFlushed && kind === 'style') {
        ;(scope ? scope.inline ||= new Set() : visibleInline).add(resource.options.precedence)
      }
      return true
    },
    mergeScope(scope: ResourceScope, parent?: ResourceScope): void {
      if (scope.stylesheets) for (const [href, descriptor] of scope.stylesheets) {
        ;(parent ? parent.stylesheets ||= new Map() : dependencies).set(href, descriptor)
      }
      if (scope.inline) for (const precedence of scope.inline) {
        ;(parent ? parent.inline ||= new Set() : visibleInline).add(precedence)
      }
    },
    takeStylesheets(): string[][] {
      const result = Array.from(dependencies.values())
      dependencies.clear()
      return result
    },
    drain(): string {
      let output = ''
      function flush(group: Resource[], precedence?: string) {
        let remaining = 0
        let inline = false, hasStylesheets = false
        let hrefs = '', rules = ''
        for (const resource of group) {
          if (!resource.sent && !resource.cancelled) {
            if (resource.kind === 'style') {
              if (shellFlushed && !visibleInline.has(precedence!)) { group[remaining++] = resource; continue }
              inline = true
              if (resource.css !== undefined) {
                hrefs += (hrefs ? ' ' : '') + resource.href
                rules += resource.css
              }
            } else {
              if (resource.kind === 'stylesheet') hasStylesheets = true
              if (!(shellFlushed && resource.kind === 'stylesheet' && resource.preloaded)) output += markup(resource, shellFlushed)
            }
            resource.sent = true
          }
        }
        group.length = remaining
        if (hrefs || inline && !shellFlushed && !hasStylesheets) {
          output += `<style${styleNonce !== undefined ? ` nonce="${escapeAttr(styleNonce)}"` : ''}${shellFlushed ? ' media="not all"' : ''} data-precedence="${escapeAttr(precedence!)}"${hrefs ? ` data-href="${escapeAttr(hrefs)}"` : ''}>${rules}</style>`
        }
      }
      for (let index = 0; index < groups.length; index++) {
        if (index === 3) for (const [precedence, group] of styles) flush(group, precedence)
        flush(groups[index]!)
      }
      shellFlushed = true
      visibleInline.clear()
      return output
    },
  }
  return collector
}
