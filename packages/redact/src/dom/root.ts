import {
  FiberTag,
  REACT_ELEMENT_TYPE,
  createFiber,
  type FiberRoot,
  type ReactElement,
  type ReactNode,
} from '../core'
import { renderRoot, flushSyncWork, batchedUpdates } from './reconcile'
import {
  beginHydration,
  endHydration,
  drainReplayQueue,
  installHydrationScrollGuard,
} from './features/hydration'

export interface RootOptions {
  identifierPrefix?: string
  onRecoverableError?: (error: unknown) => void
  onCaughtError?: (error: unknown) => void
  onUncaughtError?: (error: unknown) => void
}

export interface Root {
  render(children: ReactNode): void
  unmount(): void
}

export function createRoot(container: Element | DocumentFragment, options: RootOptions = {}): Root {
  const rootFiber = createFiber(FiberTag.Root, null, null)
  rootFiber.dom = container
  const root: FiberRoot = {
    container,
    current: rootFiber,
    pending: new Set(),
    scheduled: false,
    onRecoverableError: options.onRecoverableError,
    onCaughtError: options.onCaughtError,
    onUncaughtError: options.onUncaughtError,
    identifierPrefix: options.identifierPrefix ?? ':r',
    hydrating: false,
  }
  rootFiber.root = root
  rootFiber.stateNode = container

  let firstRender = true
  return {
    render(children) {
      if (firstRender) {
        firstRender = false
        // Match real React's `clearContainer` semantics: blow away any pre-render
        // markup (server-rendered placeholder, splash shells, etc.) on the
        // initial commit so it doesn't stack with the React tree.
        if ((container as Node).nodeType === 1 /* ELEMENT_NODE */) {
          ;(container as Element).textContent = ''
        }
      }
      flushSyncWork(() => {
        renderRoot(root, children)
      })
    },
    unmount() {
      flushSyncWork(() => {
        renderRoot(root, null)
      })
    },
  }
}

export function hydrateRoot(
  container: Element | Document,
  initialChildren: ReactNode,
  options: RootOptions = {},
): Root {
  // `container` may be the Document when the React tree renders <html>...</html>
  // (e.g. TanStack Start's default client entry). In that case we adopt
  // documentElement as a CHILD of the root, not as the root itself — otherwise
  // we'd try to render <html> inside <html>.
  const target = container as any as Element | Document
  const rootFiber = createFiber(FiberTag.Root, null, null)
  rootFiber.dom = target as unknown as Node
  const root: FiberRoot = {
    container: target as any,
    current: rootFiber,
    pending: new Set(),
    scheduled: false,
    onRecoverableError: options.onRecoverableError,
    onCaughtError: options.onCaughtError,
    onUncaughtError: options.onUncaughtError,
    identifierPrefix: options.identifierPrefix ?? ':r',
    hydrating: false,
  }
  rootFiber.root = root
  rootFiber.stateNode = target

  // Preserve the user's scroll position across hydration (see feature impl
  // for the details). No-op in SSR; no-op in the stub.
  installHydrationScrollGuard()

  beginHydration(root)
  try {
    const normalizedInitialChildren =
      isDocumentContainer(container) ? normalizeDocumentChildren(initialChildren) : initialChildren
    flushSyncWork(() => {
      renderRoot(root, normalizedInitialChildren)
    })
  } finally {
    endHydration(root)
  }
  drainReplayQueue()

  return {
    render(children) {
      flushSyncWork(() => {
        renderRoot(root, isDocumentContainer(container) ? normalizeDocumentChildren(children) : children)
      })
    },
    unmount() {
      flushSyncWork(() => {
        renderRoot(root, null)
      })
    },
  }
}

const HEAD_TAGS = new Set(['base', 'link', 'meta', 'script', 'style', 'title'])

function isDocumentContainer(container: unknown): container is Document {
  return !!container && (container as Node).nodeType === 9
}

function normalizeDocumentChildren(children: ReactNode): ReactNode {
  const list = toChildArray(children)
  const htmlIndex = list.findIndex((child) => isHostElement(child, 'html'))
  if (htmlIndex === -1) return children

  const headNodes = list.filter(isHeadElement)
  if (headNodes.length === 0) return children

  const htmlElement = list[htmlIndex] as ReactElement
  const normalizedHtml = hoistIntoHtmlHead(htmlElement, headNodes)
  return list
    .filter((child, index) => index === htmlIndex || !isHeadElement(child))
    .map((child) => (child === htmlElement ? normalizedHtml : child))
}

function hoistIntoHtmlHead(htmlElement: ReactElement, headNodes: ReactNode[]): ReactElement {
  const htmlChildren = toChildArray(htmlElement.props?.children)
  const headIndex = htmlChildren.findIndex((child) => isHostElement(child, 'head'))
  let nextChildren: ReactNode[]

  if (headIndex === -1) {
    nextChildren = [
      createHostElement('head', { children: headNodes }),
      ...htmlChildren,
    ]
  } else {
    const headElement = htmlChildren[headIndex] as ReactElement
    const existingHeadChildren = toChildArray(headElement.props?.children)
    const nextHead = {
      ...headElement,
      props: {
        ...headElement.props,
        children: [...headNodes, ...existingHeadChildren],
      },
    }
    nextChildren = htmlChildren.map((child, index) => (index === headIndex ? nextHead : child))
  }

  return {
    ...htmlElement,
    props: {
      ...htmlElement.props,
      children: nextChildren,
    },
  }
}

function toChildArray(children: unknown): ReactNode[] {
  if (children == null || typeof children === 'boolean') return []
  if (Array.isArray(children)) return children as ReactNode[]
  if (isReactElement(children)) return [children]
  if (typeof children !== 'string' && isIterable(children)) return Array.from(children) as ReactNode[]
  return [children as ReactNode]
}

function isHeadElement(value: ReactNode): boolean {
  return isReactElement(value) && typeof value.type === 'string' && HEAD_TAGS.has(value.type)
}

function isHostElement(value: ReactNode, tag: string): boolean {
  return isReactElement(value) && value.type === tag
}

function isReactElement(value: unknown): value is ReactElement {
  return !!value && typeof value === 'object' && (value as ReactElement).$$typeof === REACT_ELEMENT_TYPE
}

function isIterable(value: unknown): value is Iterable<ReactNode> {
  return !!value && typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function'
}

function createHostElement(type: string, props: Record<string, unknown>): ReactElement {
  return {
    $$typeof: REACT_ELEMENT_TYPE,
    type,
    key: null,
    ref: null,
    props,
  }
}

export { flushSyncWork as flushSync, batchedUpdates }
