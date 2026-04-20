import { REACT_ELEMENT_TYPE, type ReactElement } from '@tanstack/dom-core'

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
