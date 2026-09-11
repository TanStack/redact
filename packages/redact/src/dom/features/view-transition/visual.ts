import { FiberTag, type Fiber, type FiberRoot } from '../../../core'
import {
  REACT_VIEW_TRANSITION_TYPE,
  type ViewTransitionClass,
  type ViewTransitionInstance,
  type ViewTransitionProps,
  type ViewTransitionPseudoElement,
} from '../../../react/view-transition'
import { transitionResources, type TransitionImages } from './resources'

type Kind = 'enter' | 'exit' | 'update' | 'share'
type Host = HTMLElement | SVGElement
type Rect = [number, number, number, number]
interface Boundary {
  fiber: Fiber
  props: ViewTransitionProps
  hosts: Host[]
  ancestors: Fiber[]
  parent: Fiber | null
  name: string
  explicit: boolean
  rects: Rect[]
  content: string
  inViewport: boolean
}
interface Snapshot {
  boundaries: Map<Fiber, Boundary>
  visible: Set<Fiber>
  images: TransitionImages
}
interface Capture {
  old?: Boundary | undefined
  next?: Boundary | undefined
  kind: Kind
  name: string
  oldHosts: Host[]
  newEnabled: boolean
}
interface Event {
  boundary: Boundary
  kind: Kind
  name: string
}

const names = new WeakMap<Fiber, string>()
const styleProperties = ['view-transition-name', 'view-transition-class']
let nextName = 0

function byType(value: ViewTransitionClass | undefined, types: string[]): string | undefined {
  if (typeof value === 'string') return value
  if (!value) return undefined
  let result: string | undefined
  for (const type of types) {
    const match = value[type]
    if (match === 'none') return match
    if (match != null) result = result == null ? match : result + ' ' + match
  }
  return result ?? value.default
}

function className(props: ViewTransitionProps, kind: Kind, types: string[]): string | undefined {
  const value = byType(props[kind], types) ?? byType(props.default, types)
  return value === 'auto' ? undefined : value
}

function visibleChildren(fiber: Fiber, visit: (child: Fiber) => void): void {
  if (fiber.tag === FiberTag.Activity && fiber.pp?.mode === 'hidden') return
  if (fiber.tag === FiberTag.Suspense && fiber.ms?.f) {
    visit(fiber.ms.f)
    return
  }
  for (let child = fiber.child; child; child = child.sibling) visit(child)
}

// Ignore nested boundary content: its mutations belong to that boundary.
function contents(node: Node, nested: Set<Node>, first = false): string {
  if (!first && nested.has(node)) return '|'
  if (node.nodeType === 3) return JSON.stringify(node.nodeValue)
  if (node.nodeType !== 1) return ''
  const element = node as Host
  let result = '<' + element.nodeName
  for (const attribute of element.attributes) {
    if (attribute.name !== 'style') result += ' ' + attribute.name + '=' + JSON.stringify(attribute.value)
  }
  for (let i = 0; i < element.style.length; i++) {
    const property = element.style[i]!
    if (property !== 'view-transition-name' && property !== 'view-transition-class') {
      result += ';' + property + ':' + element.style.getPropertyValue(property) + '!' + element.style.getPropertyPriority(property)
    }
  }
  if ('value' in element) result += '=' + (element as HTMLInputElement).value
  if ('checked' in element) result += ':' + (element as HTMLInputElement).checked
  result += '>'
  for (let child = node.firstChild; child; child = child.nextSibling) result += contents(child, nested)
  return result + '</' + element.nodeName + '>'
}

function snapshot(roots: FiberRoot[], doc: Document, types: string[], connected = true): Snapshot {
  const boundaries = new Map<Fiber, Boundary>()
  const visible = new Set<Fiber>()
  const images: TransitionImages = new Map()
  const allHosts = new Set<Node>()
  const empty: Boundary[] = []
  const ancestors: Fiber[] = []
  function walk(fiber: Fiber, parent: Fiber | null, pending: Boundary[]): void {
    if (fiber.um) return
    if (fiber.type === REACT_VIEW_TRANSITION_TYPE) {
      const props: ViewTransitionProps = fiber.pp ?? {}
      const explicitName = byType(props.name, types)
      let name = explicitName
      if (name == null || name === 'auto') {
        name = names.get(fiber)
        if (!name) names.set(fiber, name = '_redact_t_' + (++nextName).toString(32))
      }
      const boundary: Boundary = {
        fiber, props, hosts: [], ancestors: ancestors.slice(), parent, name,
        explicit: explicitName != null && explicitName !== 'auto', rects: [], content: '', inViewport: false,
      }
      boundaries.set(fiber, boundary)
      pending = pending.concat(boundary)
      parent = fiber
    }
    if (fiber.tag === FiberTag.Host) {
      visible.add(fiber)
      const dom = fiber.dom as Host | null
      if (parent && fiber.type === 'img' && dom?.ownerDocument === doc) {
        images.set(dom as HTMLImageElement, fiber.pp)
      }
      if (pending.length && dom?.ownerDocument === doc && (!connected || dom.isConnected) && dom.style) {
        for (const boundary of pending) boundary.hosts.push(dom)
        allHosts.add(dom)
      }
      pending = empty
      ancestors.push(fiber)
    }
    visibleChildren(fiber, child => walk(child, parent, pending))
    if (fiber.tag === FiberTag.Host) ancestors.pop()
  }
  for (const root of roots) walk(root.r, null, empty)
  const view = doc.defaultView
  if (connected) for (const boundary of boundaries.values()) {
    boundary.rects = boundary.hosts.map(host => {
      const rect = host.getBoundingClientRect()
      return [rect.x, rect.y, rect.width, rect.height]
    })
    boundary.inViewport = boundary.rects.some(([x, y, width, height]) => width > 0 && height > 0 && x + width > 0 && y + height > 0 && x < (view?.innerWidth ?? Infinity) && y < (view?.innerHeight ?? Infinity))
    boundary.content = boundary.hosts.map(host => contents(host, allHosts, true)).join('')
  }
  return { boundaries, visible, images }
}

function pseudo(doc: Document, kind: string, name: string): ViewTransitionPseudoElement {
  const scope = doc.documentElement
  const selector = '::view-transition-' + kind + '(' + nativeName(name) + ')'
  return {
    animate(keyframes, options) {
      return scope.animate(keyframes, { ...(typeof options === 'number' ? { duration: options } : options), pseudoElement: selector })
    },
    getAnimations() {
      return scope.getAnimations({ subtree: true }).filter(animation => {
        const effect = animation.effect as KeyframeEffect | null
        return effect?.target === scope && effect.pseudoElement === selector
      })
    },
    getComputedStyle() { return doc.defaultView!.getComputedStyle(scope, selector) },
  }
}

function nativeName(name: string): string {
  return CSS.escape(name) === name ? name : CSS.escape('r-' + btoa(name).replace(/=/g, ''))
}

function instance(doc: Document, name: string): ViewTransitionInstance {
  return {
    name,
    group: pseudo(doc, 'group', name),
    imagePair: pseudo(doc, 'image-pair', name),
    old: pseudo(doc, 'old', name),
    new: pseudo(doc, 'new', name),
  }
}

function topLevel(boundary: Boundary, other: Snapshot, side: Snapshot): boolean {
  // An inserted/deleted host wrapper owns its subtree's enter/exit animation.
  if (boundary.ancestors.some(fiber => !other.visible.has(fiber))) return false
  for (let parent = boundary.parent; parent; parent = side.boundaries.get(parent)?.parent ?? null) {
    if (!other.boundaries.has(parent)) return false
  }
  return true
}

function changed(before: Boundary, after: Boundary): boolean {
  return before.content !== after.content || before.hosts.length !== after.hosts.length ||
    before.hosts.some((host, i) => host !== after.hosts[i] || before.rects[i]!.some((value, axis) => value !== after.rects[i]![axis]))
}

export interface PreparedViewTransition {
  document: Document
  exclude(root: FiberRoot): void
  prepare(): Promise<void> | undefined
  waitForResources(fontsWereLoaded: boolean): Promise<void> | undefined
  beforeCommit(): boolean
  afterCommit(): void
  ready(): void
  restore(): void
  finish(): void
  cancel(): void
}

export function prepareViewTransition(rootIterable: Iterable<FiberRoot>, types: string[]): PreparedViewTransition | null {
  const roots = Array.from(rootIterable)
  const container = roots[0]?.c
  const doc = container?.nodeType === 9 ? container as unknown as Document : container?.ownerDocument
  if (!doc?.documentElement) return null
  const before = snapshot(roots, doc, types)
  const saved = new Map<Host, string[]>()
  const suppressed = new Set<string>()
  const events: Event[] = []
  const cleanups: (() => void)[] = []
  const captures: Capture[] = []
  let done = false
  let after: Snapshot
  let resources: ReturnType<typeof transitionResources> | undefined

  function apply(host: Host, name: string, classes?: string): void {
    let previous = saved.get(host)
    if (!previous) saved.set(host, previous = [])
    for (let index = 0; index < 2; index++) {
      const property = styleProperties[index]!
      const offset = index * 3
      const current = host.style.getPropertyValue(property)
      // A committed style prop may replace either temporary value.
      if (current !== previous[offset + 2]) {
        previous[offset] = current
        previous[offset + 1] = host.style.getPropertyPriority(property)
      }
      const value = index ? classes === 'none' ? '' : classes ?? previous[offset]! : nativeName(name)
      host.style.setProperty(property, previous[offset + 2] = value, 'important')
    }
  }

  function applyHosts(hosts: Host[], name: string, props: ViewTransitionProps, kind: Kind): void {
    const classes = className(props, kind, types)
    hosts.forEach((host, index) => apply(host, index ? name + '_' + index : name, classes))
  }

  function suppress(hosts: Host[], name: string): void {
    hosts.forEach((_, index) => suppressed.add(index ? name + '_' + index : name))
  }

  function ownership(side: 'old' | 'next'): Map<Host, Capture> {
    const owners = new Map<Host, Capture>()
    for (const capture of captures) {
      if (side === 'next' && !capture.newEnabled) continue
      for (const host of capture[side]?.hosts ?? []) owners.set(host, capture)
    }
    return owners
  }

  function capture(kind: Kind, old?: Boundary, next?: Boundary, enabled = true): void {
    captures.push({ old, next, kind, name: (old ?? next)!.name, oldHosts: [], newEnabled: !!next && enabled })
  }

  function restore(): void {
    for (const [host, previous] of saved) {
      for (let index = 0; index < 2; index++) {
        const property = styleProperties[index]!
        const offset = index * 3
        if (host.style.getPropertyValue(property) === previous[offset + 2]) {
          host.style.setProperty(property, previous[offset]!, previous[offset + 1])
        }
      }
    }
    saved.clear()
  }

  function finish(): void {
    if (done) return
    done = true
    resources?.cancel()
    restore()
    let error: unknown
    let failed = false
    for (const cleanup of cleanups.splice(0)) {
      try { cleanup() } catch (caught) { if (!failed) { error = caught; failed = true } }
    }
    if (failed) throw error
  }

  return {
    document: doc,
    exclude(root) {
      const index = roots.indexOf(root)
      if (index >= 0) roots.splice(index, 1)
      for (const [fiber] of before.boundaries) if (fiber.root === root) before.boundaries.delete(fiber)
    },
    prepare() {
      after = snapshot(roots, doc, types, false)
      resources = transitionResources(doc, before.images, after.images)
      return resources.before()
    },
    waitForResources(fontsWereLoaded) { if (!done) return resources?.after(fontsWereLoaded) },
    beforeCommit() {
      if (done) return false
      const entering = new Map<string, Boundary>()
      const paired = new Set<Fiber>()
      for (const boundary of after.boundaries.values()) {
        if (!before.boundaries.has(boundary.fiber) && boundary.explicit) entering.set(boundary.name, boundary)
      }
      for (const old of before.boundaries.values()) {
        const current = after.boundaries.get(old.fiber)
        if (current) {
          if (className(current.props, 'update', types) !== 'none') capture('update', old, current)
        } else {
          const shared = old.explicit && old.inViewport ? entering.get(old.name) : undefined
          if (shared) {
            entering.delete(old.name)
            if (className(old.props, 'share', types) !== 'none') {
              paired.add(shared.fiber)
              capture('share', old, shared, className(shared.props, 'share', types) !== 'none')
            }
          } else if (topLevel(old, after, before) && old.inViewport && className(old.props, 'exit', types) !== 'none') {
            capture('exit', old)
          }
        }
      }
      for (const boundary of after.boundaries.values()) {
        if (before.boundaries.has(boundary.fiber) || paired.has(boundary.fiber)) continue
        if (topLevel(boundary, before, after) && className(boundary.props, 'enter', types) !== 'none') {
          capture('enter', undefined, boundary)
        }
      }
      // A directly nested boundary owns updates; an outer presence boundary
      // owns entering/exiting hosts. Shared descendants take precedence.
      captures.sort((a, b) => (a.kind === 'share' ? 2 : a.kind === 'update' ? 0 : 1) - (b.kind === 'share' ? 2 : b.kind === 'update' ? 0 : 1))
      if (!captures.some(capture => capture.old?.hosts.length || (capture.newEnabled && capture.next?.hosts.length))) return false
      const owners = ownership('old')
      apply(doc.documentElement, 'none')
      for (const boundary of before.boundaries.values()) for (const host of boundary.hosts) apply(host, 'none')
      for (const capture of captures) {
        capture.oldHosts = capture.old?.hosts.filter(host => owners.get(host) === capture) ?? []
        const props = capture.kind === 'update' ? capture.next!.props : capture.old?.props
        if (props) applyHosts(capture.oldHosts, capture.name, props, capture.kind)
      }
      return true
    },
    afterCommit() {
      if (done) return
      const after = snapshot(roots, doc, types)
      for (const capture of captures) {
        if (capture.next) capture.next = after.boundaries.get(capture.next.fiber)
        if (capture.kind !== 'update' && !capture.next?.inViewport) capture.newEnabled = false
      }
      const owners = ownership('next')
      for (const boundary of after.boundaries.values()) for (const host of boundary.hosts) apply(host, 'none')
      for (const capture of captures) {
        const newHosts = capture.next?.hosts.filter(host => owners.get(host) === capture) ?? []
        if (capture.next) applyHosts(newHosts, capture.name, capture.next.props, capture.kind)
        if (!capture.oldHosts.length && !newHosts.length) continue
        if (capture.kind === 'update') {
          if (capture.next && capture.old && changed(capture.old, capture.next)) events.push({ boundary: capture.next, name: capture.name, kind: 'update' })
          else suppress(capture.oldHosts, capture.name)
        } else {
          const boundary = capture.kind === 'enter' ? capture.next : capture.old
          if (boundary) events.push({ boundary, name: capture.name, kind: capture.kind })
        }
      }
    },
    ready() {
      if (done) return
      // These captures were needed before the synchronous commit could tell
      // which boundaries changed. Cancel their native animations, not the DOM.
      const nativeSuppressed = new Set([...suppressed].map(nativeName))
      for (const animation of doc.documentElement.getAnimations({ subtree: true })) {
        const effect = animation.effect as KeyframeEffect | null
        const selector = effect?.pseudoElement
        if (effect?.target !== doc.documentElement || !selector) continue
        const start = selector.indexOf('(')
        if (start >= 0 && nativeSuppressed.has(selector.slice(start + 1, -1))) animation.cancel()
      }
      for (const name of suppressed) {
        const animation = pseudo(doc, 'group', name).animate({ opacity: 0 }, { duration: 0, fill: 'forwards' })
        cleanups.push(() => animation.cancel())
      }
      let error: unknown
      let failed = false
      for (const event of events) {
        if (done) break
        const callback = event.boundary.props[('on' + event.kind[0]!.toUpperCase() + event.kind.slice(1)) as 'onEnter']
        if (callback) {
          try {
            const cleanup = callback(instance(doc, event.name), types)
            if (typeof cleanup === 'function') {
              if (done) cleanup()
              else cleanups.push(cleanup)
            }
          } catch (caught) { if (!failed) { error = caught; failed = true } }
        }
      }
      if (failed) throw error
    },
    restore,
    finish,
    cancel: finish,
  }
}
