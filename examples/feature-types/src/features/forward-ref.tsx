import { forwardRef, useRef, type Ref } from 'react'

// Error: without `features.forwardRef`, the render function never receives the ref.
const ForwardedInput = forwardRef<HTMLInputElement, {}>((props, ref) => <input ref={ref} {...props} />)

// OK: React 19 passes `ref` as an ordinary prop.
function RefPropInput({ ref }: { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} placeholder="ref as a prop" />
}

export function ForwardRefDemo() {
  const forwarded = useRef<HTMLInputElement>(null)
  const plain = useRef<HTMLInputElement>(null)
  return (
    <>
      <ForwardedInput />{' '}
      <button onClick={() => forwarded.current?.focus()}>Focus forwardRef input</button>
      <br />
      <RefPropInput ref={plain} />{' '}
      <button onClick={() => plain.current?.focus()}>Focus ref-prop input</button>
    </>
  )
}
