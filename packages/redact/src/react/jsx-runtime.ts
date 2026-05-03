import { REACT_ELEMENT_TYPE, type ReactElement } from '../core'

export { Fragment } from './element'

export function jsx(type: any, props: any, key?: any): ReactElement {
  return {
    $$typeof: REACT_ELEMENT_TYPE,
    type,
    key: key == null ? null : '' + key,
    ref: props?.ref ?? null,
    props,
  }
}

export const jsxs = jsx
export const jsxDEV = jsx

// Permissive JSX namespace — picked up by TypeScript via the
// `jsxImportSource: "@tanstack/redact"` + `jsx: "react-jsx"` pair. The
// runtime accepts any element type and any props; matching that with strict
// element typings would require an entire React.dom.d.ts surface, which
// isn't a stated goal of redact (consumers who want strict JSX still alias
// `react`/`react-dom` types from the real packages).
export namespace JSX {
  export type Element = ReactElement
  export type ElementType = any
  export interface IntrinsicElements {
    [elemName: string]: any
  }
  export interface ElementChildrenAttribute {
    children: {}
  }
  export interface ElementAttributesProperty {
    props: {}
  }
}
