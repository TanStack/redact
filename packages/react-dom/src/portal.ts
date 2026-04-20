import { REACT_PORTAL_TYPE, type ReactNode, type ReactElement } from '@tanstack/dom-core'

export function createPortal(
  children: ReactNode,
  container: Element,
  key: string | null = null,
): ReactElement {
  return {
    $$typeof: REACT_PORTAL_TYPE as any,
    type: REACT_PORTAL_TYPE as any,
    key: key == null ? null : '' + key,
    ref: null,
    props: { children, container },
  }
}
