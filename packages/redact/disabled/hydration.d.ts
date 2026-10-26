// Referenced from the file that redact() generates when `features.hydration`
// is false. Without the feature, hydrateRoot throws. This overload takes
// priority over the original: using the returned root is a type error, and the
// call itself is marked deprecated.
import type { ReactNode } from 'react'
import type { HydrationOptions } from 'react-dom/client'

type FeatureDisabled<Message extends string> = { readonly [K in Message]: never }

declare module 'react-dom/client' {
  /**
   * @deprecated Redact: `hydrateRoot` requires the `hydration` feature. Set `features.hydration: true` in redact(), or use `createRoot`.
   */
  function hydrateRoot(
    container: Element | Document,
    initialChildren: ReactNode,
    options?: HydrationOptions,
  ): FeatureDisabled<'Redact: hydrateRoot() requires the `hydration` feature. Set `features.hydration: true` in redact(), or use createRoot().'>
}
