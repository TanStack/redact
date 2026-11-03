// Class defaults are resolved by both renderers, including elements made by an
// automatic JSX runtime. Never mutate props owned by the caller.
export function resolveClassProps(type: any, props: Record<string, any>) {
  const defaults = type.defaultProps
  if (defaults) {
    props = { ...props }
    for (const key in defaults) {
      if (props[key] === undefined) props[key] = defaults[key]
    }
  }
  return props
}
