import { FiberTag, type Fiber, type FiberRoot } from '../core'
import { findRoot, getCurrentRoot, isActivityHidden } from './reconcile'
import { onCommitFailure, onCommitRollback, queueMutation } from './commit'

type Listener = EventListenerOrEventListenerObject
type Observer = IntersectionObserver | ResizeObserver
type OwnedNode = Node & { reactFragments?: Set<FragmentInstance> }
type Registration = {
  type: string
  listener: Listener
  attached: Listener
  capture: boolean
  options: AddEventListenerOptions
  cleanup?: () => void
}

const instances = new WeakMap<FiberRoot, Set<FragmentInstance>>()

function hosts(fiber: Fiber, deep = false, result: Fiber[] = []): Fiber[] {
  for (let child = fiber.child; child; child = child.sibling) {
    if (child.um || isActivityHidden(child)) continue
    const host = child.tag === FiberTag.Host || child.tag === FiberTag.Text
    if (host) result.push(child)
    if (!host || deep) hosts(child, deep, result)
  }
  if (deep && fiber.tag === FiberTag.Suspense && fiber.ms?.f) hosts(fiber.ms.f, true, result)
  return result
}

function node(fiber: Fiber): Node {
  return fiber.tag === FiberTag.Root ? fiber.root!.c : fiber.dom!
}

function siblings(fiber: Fiber, parent: Fiber | null): [Node | null, Node | null] {
  let previous: Node | null = null
  let next: Node | null = null
  let found = false
  function visit(parent: Fiber): void {
    for (let child = parent.child; child && !next; child = child.sibling) {
      if (child === fiber) found = true
      else if (child.tag === FiberTag.Host || child.tag === FiberTag.Text) {
        if (found) next = node(child)
        else previous = node(child)
      } else if (!isActivityHidden(child)) visit(child)
    }
  }
  if (parent) visit(parent)
  return [previous, next]
}

function containsFiber(parent: Fiber, child: Fiber | null): boolean {
  for (; child; child = child.parent) if (child === parent) return true
  return false
}

export class FragmentInstance {
  private nodes = new Set<OwnedNode>()
  private listeners: Registration[] = []
  private observers = new Set<Observer>()
  private pending = new Map<Observer, Set<Element>>()
  private children: Node[] = []
  private ordered: Fiber[] = []
  private parent: Node | null = null
  private adjacent: [Node | null, Node | null] = [null, null]
  private portalContainer: Node | null = null

  constructor(private fiber: Fiber) {}

  refresh(ordered: Fiber[]): void {
    this.children = hosts(this.fiber).map(node)
    let parent = this.fiber.parent
    this.portalContainer = null
    for (; parent; parent = parent.parent) {
      if (parent.tag === FiberTag.Host || parent.tag === FiberTag.Root) break
      if (parent.tag === FiberTag.Portal && !this.portalContainer) this.portalContainer = parent.mp.container
    }
    this.parent = parent && node(parent)
    this.adjacent = siblings(this.fiber, parent)
    this.ordered = ordered
    const current = new Set(this.children)
    for (const child of this.nodes) if (!current.has(child)) this.update(child, false)
    for (const child of current) this.update(child, true)
  }

  /** Renderer hook, called only for first-level host insertion/removal. */
  update(child: OwnedNode, adding: boolean): void {
    if (adding === this.nodes.has(child)) return
    if (adding) {
      this.nodes.add(child)
      ;(child.reactFragments ??= new Set()).add(this)
    } else {
      this.nodes.delete(child)
      child.reactFragments?.delete(this)
    }
    for (const entry of this.listeners) {
      if (adding) child.addEventListener(entry.type, entry.attached, entry.options)
      else child.removeEventListener(entry.type, entry.attached, entry.capture)
    }
    if (child.nodeType !== 1) return
    for (const observer of this.observers) {
      if (adding) {
        this.pending.get(observer)?.delete(child as Element)
        observer.observe(child as Element)
      } else if (typeof (observer as IntersectionObserver).rootMargin === 'string') {
        let pending = this.pending.get(observer)
        if (!pending) {
          this.pending.set(observer, pending = new Set())
          const flush = () => {
            for (const element of pending!) observer.unobserve(element)
            if (this.pending.get(observer) === pending) this.pending.delete(observer)
          }
          const frame = child.ownerDocument?.defaultView?.requestAnimationFrame
          if (frame) frame(() => frame(flush))
          else queueMicrotask(flush)
        }
        pending.add(child as Element)
      } else observer.unobserve(child as Element)
    }
  }

  addEventListener(type: string, listener: Listener | null, options?: boolean | AddEventListenerOptions): void {
    if (!listener) return
    const opts = typeof options === 'boolean' ? { capture: options } : options ?? {}
    const capture = !!opts.capture
    if (opts.signal?.aborted || this.listeners.some((entry) => entry.type === type && entry.listener === listener && entry.capture === capture)) return
    const instance = this
    const entry: Registration = {
      type, listener, capture,
      options: opts.passive === undefined ? { capture } : { capture, passive: opts.passive },
      attached: opts.once ? function (this: EventTarget, event: Event) {
        instance.removeEventListener(type, listener, capture)
        if (typeof listener === 'function') listener.call(this, event)
        else listener.handleEvent(event)
      } : listener,
    }
    if (opts.signal) {
      const abort = () => this.removeEventListener(type, listener, capture)
      opts.signal.addEventListener('abort', abort, { once: true })
      entry.cleanup = () => opts.signal!.removeEventListener('abort', abort)
    }
    this.listeners.push(entry)
    for (const child of this.nodes) child.addEventListener(type, entry.attached, entry.options)
  }

  removeEventListener(type: string, listener: Listener | null, options?: boolean | EventListenerOptions): void {
    const capture = typeof options === 'boolean' ? options : !!options?.capture
    const index = this.listeners.findIndex((entry) => entry.type === type && entry.listener === listener && entry.capture === capture)
    if (index < 0) return
    const entry = this.listeners.splice(index, 1)[0]!
    for (const child of this.nodes) child.removeEventListener(type, entry.attached, capture)
    entry.cleanup?.()
  }

  dispatchEvent(event: Event): boolean {
    const parent = !this.fiber.um && this.parent
    if (!parent) return true
    const target = parent
    if (!this.listeners.length && event.bubbles) return target.dispatchEvent(event)
    const document = target.nodeType === 9 ? target as Document : target.ownerDocument!
    const temporary = target.nodeType === 9 ? document.createComment('') : document.createTextNode('')
    for (const entry of this.listeners) temporary.addEventListener(entry.type, entry.attached, entry.options)
    target.appendChild(temporary)
    try { return temporary.dispatchEvent(event) }
    finally { temporary.parentNode?.removeChild(temporary) }
  }

  private focusChild(last: boolean, options?: FocusOptions): void {
    // Parent links survive reconciliation. Filter the committed root order,
    // not the work-in-progress child pointers, when focus is actually used.
    const children = this.ordered.filter(child => containsFiber(this.fiber, child))
    if (last) children.reverse()
    for (const child of children) {
      if (child.tag === FiberTag.Text) continue
      const element = child.dom as HTMLElement
      if (element.ownerDocument.activeElement === element) return
      let focused = false
      const handleFocus = () => { focused = true }
      element.ownerDocument.addEventListener('focus', handleFocus, true)
      try { (element.focus ?? HTMLElement.prototype.focus).call(element, options) }
      finally { element.ownerDocument.removeEventListener('focus', handleFocus, true) }
      if (focused) return
    }
  }

  focus(options?: FocusOptions): void { this.focusChild(false, options) }
  focusLast(options?: FocusOptions): void { this.focusChild(true, options) }

  blur(): void {
    const parent = this.parent
    const active = parent && (parent.ownerDocument ?? parent as Document).activeElement as HTMLElement | null
    if (active && this.children.some((child) => child.contains(active))) active.blur()
  }

  observeUsing(observer: Observer): void {
    this.observers.add(observer)
    for (const child of this.nodes) if (child.nodeType === 1) observer.observe(child as Element)
  }

  unobserveUsing(observer: Observer): void {
    if (!this.observers.delete(observer)) return
    for (const child of this.nodes) if (child.nodeType === 1) observer.unobserve(child as Element)
    for (const child of this.pending.get(observer) ?? []) observer.unobserve(child)
    this.pending.get(observer)?.clear()
    this.pending.delete(observer)
  }

  getClientRects(): DOMRect[] {
    const rects: DOMRect[] = []
    for (const child of this.children) {
      if (child.nodeType === 3) {
        const range = child.ownerDocument!.createRange()
        range.selectNodeContents(child)
        rects.push(...range.getClientRects())
      } else rects.push(...(child as Element).getClientRects())
    }
    return rects
  }

  getRootNode(options?: GetRootNodeOptions): Node | FragmentInstance {
    const parent = !this.fiber.um && this.parent
    return parent ? parent.getRootNode(options) : this
  }

  compareDocumentPosition(other: Node): number {
    const parent = !this.fiber.um && this.parent
    if (!parent) return 1
    const children = this.children
    let parentNode = parent
    if (!children.length) {
      if (this.portalContainer) parentNode = this.portalContainer
      let result = parentNode.compareDocumentPosition(other)
      if (parentNode === other) result = 8
      else if (result & 16) {
        const following = this.adjacent[1]
        const position = following && following.compareDocumentPosition(other)
        result = following && (position === 0 || position! & 4) ? 4 : 2
      }
      return result | 32
    }
    const first = children[0]!
    const last = children[children.length - 1]!
    if (this.portalContainer) parentNode = first.parentNode!
    if (!parentNode) return 1
    const firstContained = parentNode.compareDocumentPosition(first) & 16
    const lastContained = parentNode.compareDocumentPosition(last) & 16
    const firstPosition = first.compareDocumentPosition(other)
    const lastPosition = last.compareDocumentPosition(other)
    const result = (firstContained && first === other) || (lastContained && last === other) ||
      (firstPosition & 16) || (lastPosition & 16) ||
      (firstContained && lastContained && (firstPosition & 4) && (lastPosition & 2)) ? 16 :
      (!firstContained && first === other) || (!lastContained && last === other) ? 32 : firstPosition
    if (result & 33) return result
    const ordered = this.ordered
    let otherFiber: Fiber | undefined
    for (let target: Node | null = other; target && !otherFiber; target = target.parentNode) {
      otherFiber = ordered.find((fiber) => fiber.dom === target)
    }
    if (result & 16) return containsFiber(this.fiber, otherFiber ?? null) ? result : 32
    if (result & 8) return otherFiber || other === other.ownerDocument || other === other.ownerDocument?.documentElement || other === other.ownerDocument?.body ? result : 32
    if (!otherFiber) return 32
    const otherIndex = ordered.indexOf(otherFiber)
    return ((result & 2) && otherIndex <= ordered.findIndex(fiber => fiber.dom === first)) ||
      ((result & 4) && otherIndex >= ordered.findIndex(fiber => fiber.dom === last)) ? result : 32
  }

  scrollIntoView(alignToTop?: boolean): void {
    if (typeof alignToTop === 'object') throw new Error('FragmentInstance.scrollIntoView expects a boolean, not an options object.')
    if (this.fiber.um) return
    const children = this.children.slice()
    const top = alignToTop !== false
    if (!children.length) {
      const [previous, next] = this.adjacent
      const fallback = top ? next ?? previous ?? this.parent : previous ?? next
      if (fallback) children.push(fallback)
    }
    if (top) children.reverse()
    for (const target of children) {
      if (target.nodeType === 3) {
        const range = target.ownerDocument!.createRange()
        range.selectNodeContents(target)
        const rect = range.getBoundingClientRect()
        const window = target.ownerDocument!.defaultView!
        window.scrollTo(window.scrollX + rect.left, window.scrollY + (top ? rect.top : rect.bottom - window.innerHeight))
      } else if (target.nodeType === 11) {
        ;(target as ShadowRoot).host?.scrollIntoView(alignToTop)
      } else if (target.nodeType !== 9) (target as Element).scrollIntoView(alignToTop)
    }
  }

  dispose(): void {
    for (const child of this.nodes) this.update(child, false)
    for (const entry of this.listeners) entry.cleanup?.()
    this.listeners = []
    this.children = []
    this.ordered = []
    this.parent = null
    const root = this.fiber.root ?? findRoot(this.fiber)
    if (root) instances.get(root)?.delete(this)
  }
}

export function createFragmentInstance(fiber: Fiber): FragmentInstance {
  const root = fiber.root ?? findRoot(fiber)
  if (root) root.fr = true
  const instance = new FragmentInstance(fiber)
  if (root) {
    let registered = instances.get(root)
    if (!registered) instances.set(root, registered = new Set())
    registered.add(instance)
    onCommitRollback(() => { registered.delete(instance) })
    onCommitFailure(() => { registered.delete(instance) })
  }
  return instance
}

export function updateFragmentHost(fiber: Fiber, adding: boolean): void {
  if (!(fiber.root ?? getCurrentRoot() ?? findRoot(fiber))?.fr || !fiber.dom) return
  const dom = fiber.dom
  queueMutation(() => {
    for (let parent = fiber.parent; parent; parent = parent.parent) {
      if (adding && isActivityHidden(parent)) break
      if (parent.tag === FiberTag.Fragment && parent.sn instanceof FragmentInstance) parent.sn.update(dom, adding)
      if (parent.tag === FiberTag.Host || parent.tag === FiberTag.Root) break
    }
  })
}

export function refreshFragmentInstances(root: FiberRoot): void {
  if (!root.fr) return
  const registered = instances.get(root)
  if (!registered?.size) return
  queueMutation(() => {
    if (!registered.size) return
    const ordered = hosts(root.r, true)
    for (const instance of registered) instance.refresh(ordered)
  })
}
