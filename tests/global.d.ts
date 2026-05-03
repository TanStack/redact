// Permissive JSX shim for type-checking the test suite. Vitest runs tests
// with the @tanstack/redact JSX runtime, which doesn't ship a strict element
// type surface (and isn't trying to). Tests use a lot of `<div>`-style
// markup as fixtures, so a permissive global JSX namespace keeps them
// type-checkable without requiring a full React.dom.d.ts re-implementation.
declare namespace JSX {
  type Element = any
  type ElementType = any
  interface IntrinsicElements {
    [elemName: string]: any
  }
  interface ElementChildrenAttribute {
    children: {}
  }
  interface ElementAttributesProperty {
    props: {}
  }
}
