import type { ResourceHintOptions } from '../core/resource-hints'

interface Resources {
  // Connection and preload selectors are disjoint, so one map deduplicates both.
  preloads: Map<string, ResourceHintOptions>
  instances: Map<string, Element>
}

export type ResourceRoot = Document | DocumentFragment

const roots = /*#__PURE__*/ new WeakMap<ResourceRoot, Resources>()
// Existing document links can satisfy a shadow declaration. Links created by
// the resource system belong to their original root instead.
export const createdStylesheets = /*#__PURE__*/ new WeakSet<Element>()

export function resourceAttribute(name: string, value: string): string {
  return `[${name}="${value.replace(/[\n"\\]/g, char => '\\' + char.charCodeAt(0).toString(16) + ' ')}"]`
}

export function resourceSelector(href: string, as: string): string {
  return as === 'style'
    ? 'link[rel="stylesheet"]' + resourceAttribute('href', href)
    : 'script[async]' + resourceAttribute('src', href)
}

export function getResources(root: ResourceRoot): Resources {
  let resources = roots.get(root)
  if (!resources) roots.set(root, resources = { preloads: new Map(), instances: new Map() })
  return resources
}

export function adoptResourceProps(props: any, prior: ResourceHintOptions | undefined, script: boolean): void {
  if (prior) for (const name of ['crossOrigin', 'referrerPolicy', script ? 'integrity' : 'title']) {
    if (props[name] == null && prior[name] != null) props[name] = prior[name]
  }
}

export function insertResource(node: Element, precedence?: string, root: ResourceRoot = node.ownerDocument): void {
  const container = root.nodeType === 9 ? (root as Document).head : root
  if (precedence != null) {
    if (node.localName === 'link') createdStylesheets.add(node)
    let previous: Element | undefined
    let matched = false
    for (const sibling of root.querySelectorAll('link[rel="stylesheet"][data-precedence],style[data-precedence]')) {
      if (sibling.getAttribute('data-precedence') === precedence) matched = true
      else if (matched) break
      previous = sibling
    }
    if (previous) previous.parentNode!.insertBefore(node, previous.nextSibling)
    else container.insertBefore(node, container.firstChild)
  } else container.appendChild(node)
}
