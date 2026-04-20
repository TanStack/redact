// Minimal DOM-oriented JSX runtime
export const Fragment = (props: { children?: any }) => props.children

export function jsx(type: any, props: any, key?: any): Node {
  return createNode(type, props, key)
}

export const jsxs: typeof jsx = jsx

type Child = Node | string | number | null | undefined | boolean | Child[]
type Props = { children?: Child } & Record<string, any>

function isFragmentType(t: any): t is typeof Fragment {
  return t === Fragment
}

function createNode(
  type: string | Function,
  rawProps: Props = {},
  _key?: any,
): Node {
  const { children, ...props } = rawProps ?? {}

  if (isFragmentType(type)) {
    return normalizeChild(children) ?? document.createDocumentFragment()
  }

  if (typeof type === 'function') {
    const rendered = normalizeChild((type as any)({ ...props, children }))
    return rendered ?? document.createDocumentFragment()
  }

  const el = document.createElement(type as string)

  for (const [name, value] of Object.entries(props)) {
    if (name === 'className') {
      el.setAttribute('class', value)
    } else if (name.startsWith('on') && typeof value === 'function') {
      const eventName = name.slice(2).toLowerCase()
      el.addEventListener(eventName, value)
    } else if (value === true) {
      el.setAttribute(name, '')
    } else if (value === false || value == null) {
      // skip
    } else {
      el.setAttribute(name, String(value))
    }
  }

  appendChildren(el, children)
  return el
}

function appendChildren(parent: Node, children: Child) {
  if (Array.isArray(children)) {
    for (const c of children) appendChildren(parent, c)
    return
  }
  const node = normalizeChild(children)
  if (node) parent.appendChild(node)
}

function normalizeChild(child: Child): Node | null {
  if (child == null || child === false) return null
  if (Array.isArray(child)) {
    const frag = document.createDocumentFragment()
    for (const c of child) {
      const n = normalizeChild(c)
      if (n) frag.appendChild(n)
    }
    return frag
  }
  if (typeof child === 'string' || typeof child === 'number') {
    return document.createTextNode(String(child))
  }
  return child as Node
}
