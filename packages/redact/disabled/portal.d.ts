// Referenced from the file that redact() generates when `features.portal` is
// false. Without the feature, portal children render in place. This overload
// takes priority over the original, so rendering the result is a type error.
import type { Key, ReactNode } from 'react'

type FeatureDisabled<Message extends string> = { readonly [K in Message]: never }

declare module 'react-dom' {
  /**
   * @deprecated Redact: `createPortal` requires the `portal` feature. Set `features.portal: true` in redact().
   */
  function createPortal(
    children: ReactNode,
    container: Element | DocumentFragment,
    key?: Key | null,
  ): FeatureDisabled<'Redact: createPortal() requires the `portal` feature. Set `features.portal: true` in redact().'>
}
