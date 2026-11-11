import { ResourceField as R, ResourceFlag as F, ScopeField } from './resource-fields'
import { isFunction, isString } from '../core/functions'
import { resourceURL, type HostResourceKind, type ResourceHintKind, type ResourceHintOptions } from '../core/resource-hints'
import { attrToHtml, escapeAttr, isInternalAttribute } from './escape'
import { attributeName } from '../core/attributes'

type Resource = [
  kind: ResourceHintKind | 'style',
  href: string,
  options: Record<string, any>,
  flags: number,
  css?: string,
]

export type ResourceScope = [
  metadataOwner?: number,
  metadataCounts?: Map<string, number>,
  stylesheets?: Map<string, string[]>,
  inline?: Set<string>,
]

function styleText(props: any): string {
  const html = props.dangerouslySetInnerHTML
  if (html != null) {
    if (typeof html !== 'object' || !('__html' in html)) throw new Error('dangerouslySetInnerHTML must be an object with an __html field.')
    if (props.children != null) throw new Error('Can only set one of children or dangerouslySetInnerHTML.')
    return html.__html == null ? '' : '' + html.__html
  }
  let child = props.children
  if (Array.isArray(child)) child = child.length < 2 ? child[0] : null
  return child == null || isFunction(child) || typeof child === 'symbol' ? ''
    : ('' + child).replace(/(<\/?)(s)(tyle)/gi, (_, prefix: string, s: string, suffix: string) => prefix + (s === 'S' ? '\\53 ' : '\\73 ') + suffix)
}

function markup(resource: Resource, late: boolean): string {
  const [kind, href, options] = resource
  const script = kind === 'script' || kind === 'module-script'
  const style = kind === 'stylesheet'
  let props: Record<string, any>
  if (style && late) {
    props = { rel: 'preload', as: 'style', href }
    for (const name of ['crossOrigin', 'fetchPriority', 'integrity', 'media', 'hrefLang', 'referrerPolicy'])
      props[name] = options[name]
  } else {
    props = {
      ...(script
        ? { src: href, ...(kind === 'module-script' ? { type: 'module' } : {}), async: true }
        : style
          ? { rel: kind, href, 'data-precedence': options.precedence! }
          : { rel: kind, ...(options.as === 'image' && options.imageSrcSet ? {} : { href }) }),
      ...options,
    }
  }
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
  let charset = '', viewport = ''
  const recordedMetas = new Map<string, number>()
  const collector = {
    add(kind: ResourceHintKind | 'style', href: string, options: ResourceHintOptions, eager?: boolean): Resource {
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
      // Image preloads that go ahead of the stylesheets: every fetchPriority="high" one and the
      // first ten eager <img> per flush, as in React.
      const high = kind === 'preload' && type === 'image' && (options.fetchPriority === 'high' || eager && groups[2]!.length < 10)
      if (prior && (!init || prior[R.Kind] !== 'preload' && prior[R.Kind] !== 'modulepreload')) {
        // An eager <img> also moves the preload() of the same image ahead, keeping its attributes.
        if (eager && high && !(prior[R.Flags] & (F.Sent | F.High))) {
          prior[R.Flags] |= F.High
          // The normal group will skip this entry once the high group sends it.
          groups[2]!.push(prior)
        }
        return prior
      }

      const resource: Resource = [kind, href, { ...options }, high ? F.High : 0]
      if (kind === 'style' && (!styleNonce || options.nonce === styleNonce)) resource[R.Css] = styleText(options)
      if (prior) {
        prior[R.Flags] |= F.Cancelled
        if (prior[R.Flags] & F.Sent) resource[R.Flags] |= F.Preloaded
        for (const name of ['crossOrigin', 'integrity']) {
          if (resource[R.Options][name] == null && prior[R.Options][name] != null) resource[R.Options][name] = prior[R.Options][name]!
        }
      }
      resources.set(key, resource)
      if (kind === 'stylesheet' || kind === 'style') {
        const precedence = options.precedence!
        const group = styles.get(precedence)
        if (group) group.push(resource)
        else styles.set(precedence, [resource])
      } else {
        const group = kind === 'dns-prefetch' || kind === 'preconnect' ? 0
          : kind === 'preload' && type === 'font' ? 1
          : high ? 2
          : init ? 3 : 4
        groups[group]!.push(resource)
      }
      return resource
    },
    // Preload an eagerly rendered <img> as React does: the first ten per flush and every
    // fetchPriority="high" image go ahead of the stylesheets, the rest after the scripts.
    addImage(props: any): void {
      const { src, srcSet, sizes, crossOrigin, integrity, type, fetchPriority, referrerPolicy, loading } = props
      const source = srcSet || src
      if (loading === 'lazy' || fetchPriority === 'low' || !source || src != null && !isString(src) || srcSet != null && !isString(srcSet) || /^data:/i.test(src || '') || /^data:/i.test(srcSet || '')) return
      collector.add('preload', source, { as: 'image', imageSrcSet: srcSet, imageSizes: sizes, crossOrigin, integrity, type, fetchPriority, referrerPolicy } as any, true)
    },
    // Hoist <meta charSet> and <meta name="viewport"> to the start of the head. Content streamed
    // after the shell keeps its metas in place.
    addMeta(props: any, emit: (chunk: string) => void, scope: ResourceScope, inFallback?: boolean): ((chunk: string) => void) | true | null {
      const isCharset = isString(props.charSet)
      if (!(isCharset || props.name === 'viewport') || props.itemProp != null) return null
      if (inFallback) return true
      let markup = ''
      return chunk => {
        markup += chunk
        if (chunk !== '/>') return
        const counts = scope[ScopeField.Counts] ||= new Map()
        const count = (counts.get(markup) || 0) + 1
        counts.set(markup, count)
        const key = scope[ScopeField.Owner] + ':' + markup
        if (count <= (recordedMetas.get(key) || 0)) return
        if (shellFlushed) emit(markup)
        else {
          // Late boundary output can still be discarded if the boundary suspends again.
          recordedMetas.set(key, count)
          if (isCharset) charset += markup
          else viewport += markup
        }
      }
    },
    // An abandoned shell attempt re-walks its metas; the hints it registered stay deduplicated.
    discardMetas(): void {
      charset = viewport = ''
      recordedMetas.clear()
    },
    addHost(kind: HostResourceKind, props: any, scope?: ResourceScope): true {
      const resource = collector.add(kind === 'script' && props.type === 'module' ? 'module-script' : kind, kind === 'script' ? props.src : props.href, props)
      if (shellFlushed && kind === 'stylesheet') {
        const options = resource[R.Options]
        const descriptor = [resourceURL(resource[R.Href]), options.precedence]
        for (const name in options) {
          if (isInternalAttribute(name) || /^(?:href|rel|(?:data-)?precedence|innerHTML|style)$/.test(name) || /^on/i.test(name) || !/^[a-zA-Z_:][a-zA-Z0-9:_.-]*$/.test(name)) continue
          const value = options[name]
          if (value == null || isFunction(value) || typeof value === 'symbol' || name === 'hidden' && value === false) continue
          descriptor.push(attributeName(name), name === 'hidden' ? '' : name === 'src' ? resourceURL('' + value) : '' + value)
        }
        ;(scope ? scope[ScopeField.Stylesheets] ||= new Map() : dependencies).set(resource[R.Href], descriptor)
      } else if (shellFlushed && kind === 'style') {
        ;(scope ? scope[ScopeField.Inline] ||= new Set() : visibleInline).add(resource[R.Options].precedence)
      }
      return true
    },
    mergeScope(scope: ResourceScope, parent?: ResourceScope): void {
      if (scope[ScopeField.Stylesheets]) for (const [href, descriptor] of scope[ScopeField.Stylesheets]) {
        ;(parent ? parent[ScopeField.Stylesheets] ||= new Map() : dependencies).set(href, descriptor)
      }
      if (scope[ScopeField.Inline]) for (const precedence of scope[ScopeField.Inline]) {
        ;(parent ? parent[ScopeField.Inline] ||= new Set() : visibleInline).add(precedence)
      }
    },
    takeStylesheets(): string[][] {
      const result = Array.from(dependencies.values())
      dependencies.clear()
      return result
    },
    drain(): string {
      let output = charset + viewport
      charset = viewport = ''
      function flush(group: Resource[], precedence?: string) {
        let remaining = 0
        let inline = false, hasStylesheets = false
        let hrefs = '', rules = ''
        for (const resource of group) {
          if (!(resource[R.Flags] & (F.Sent | F.Cancelled))) {
            if (resource[R.Kind] === 'style') {
              if (shellFlushed && !visibleInline.has(precedence!)) { group[remaining++] = resource; continue }
              inline = true
              if (resource[R.Css] !== undefined) {
                hrefs += (hrefs ? ' ' : '') + resource[R.Href]
                rules += resource[R.Css]
              }
            } else {
              if (resource[R.Kind] === 'stylesheet') hasStylesheets = true
              if (!(shellFlushed && resource[R.Kind] === 'stylesheet' && resource[R.Flags] & F.Preloaded)) output += markup(resource, shellFlushed)
            }
            resource[R.Flags] |= F.Sent
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
