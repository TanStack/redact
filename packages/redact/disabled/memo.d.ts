// Referenced from the file that redact() generates when `features.memo` is
// false. Without the feature, memo components render on every parent render.
// Behavior is otherwise unchanged, so this only marks memo() as deprecated in
// editors. These overloads match the originals and take priority over them.
export {}

declare module 'react' {
  /**
   * @deprecated Redact: `features.memo` is off, so this component re-renders with its parent. Set `features.memo: true` in redact() to restore the props check.
   */
  function memo<P extends object>(
    Component: FunctionComponent<P>,
    propsAreEqual?: (prevProps: Readonly<P>, nextProps: Readonly<P>) => boolean,
  ): NamedExoticComponent<P>
  /**
   * @deprecated Redact: `features.memo` is off, so this component re-renders with its parent. Set `features.memo: true` in redact() to restore the props check.
   */
  function memo<T extends ComponentType<any>>(
    Component: T,
    propsAreEqual?: (prevProps: Readonly<ComponentProps<T>>, nextProps: Readonly<ComponentProps<T>>) => boolean,
  ): MemoExoticComponent<T>
}
