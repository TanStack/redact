// Referenced from the file that redact() generates when `features.lazy` is
// false. Without the feature, async lazy() payloads throw. This overload takes
// priority over the original, so rendering the result is a type error.
export {}

type FeatureDisabled<Message extends string> = { readonly [K in Message]: never }

declare module 'react' {
  /**
   * @deprecated Redact: `lazy` requires the `lazy` feature. Set `features.lazy: true` in redact().
   */
  function lazy<T extends ComponentType<any>>(
    load: () => Promise<{ default: T }>,
  ): FeatureDisabled<'Redact: lazy() requires the `lazy` feature. Set `features.lazy: true` in redact().'>
}
