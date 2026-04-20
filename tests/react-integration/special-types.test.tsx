/**
 * Port of React's `ReactDOMServerIntegrationSpecialTypes-test.js`. Covers
 * forwardRef, memo (including custom comparator), and Profiler — the
 * wrapper component types that React treats specially but which should
 * render transparently to the DOM.
 */
import { describe, expect } from 'vitest'
import * as React from 'react'
import { itRenders } from './harness'

describe('ReactDOMServerIntegration / special types', () => {
  itRenders('a forwardedRef component and its children', async (render) => {
    const FunctionComponent = ({
      label,
      forwardedRef,
    }: {
      label: string
      forwardedRef?: any
    }) => <div ref={forwardedRef}>{label}</div>
    const WrappedFunctionComponent = React.forwardRef<any, { label: string }>(
      (props, ref) => <FunctionComponent {...props} forwardedRef={ref} />,
    )
    const ref = React.createRef()
    const e = await render(<WrappedFunctionComponent ref={ref} label="Test" />)
    const div = e as HTMLElement
    expect(div.tagName).toBe('DIV')
    expect(div.textContent).toBe('Test')
  })

  itRenders('a Profiler component and its children', async (render) => {
    const e = await render(
      <React.Profiler id="profiler" onRender={() => {}}>
        <div>Test</div>
      </React.Profiler>,
    )
    const div = e as HTMLElement
    expect(div.tagName).toBe('DIV')
    expect(div.textContent).toBe('Test')
  })

  describe('memoized function components', () => {
    function Counter({ count }: { count: number }) {
      return <span>{'Count: ' + count}</span>
    }

    itRenders('basic memo render', async (render) => {
      const MemoCounter = React.memo(Counter)
      const e = (await render(<MemoCounter count={0} />)) as HTMLElement
      expect(e.textContent).toEqual('Count: 0')
    })

    itRenders('memo with forwardRef', async (render) => {
      const RefCounter = React.forwardRef<{ current: number }>((_props, ref) => (
        <Counter count={(ref as any)?.current ?? 0} />
      ))
      const MemoRefCounter = React.memo(RefCounter as any)
      const ref = React.createRef<any>()
      ;(ref as any).current = 0
      const e = (await render(
        <MemoRefCounter ref={ref} />,
      )) as HTMLElement
      expect(e.textContent).toEqual('Count: 0')
    })

    itRenders('memo with comparator', async (render) => {
      const MemoCounter = React.memo(Counter, () => false)
      const e = (await render(<MemoCounter count={0} />)) as HTMLElement
      expect(e.textContent).toEqual('Count: 0')
    })

    itRenders('comparator not invoked on first render', async (render) => {
      let comparatorCalls = 0
      const MemoCounter = React.memo(Counter, () => {
        comparatorCalls++
        return false
      })
      const e = (await render(<MemoCounter count={0} />)) as HTMLElement
      expect(e.textContent).toEqual('Count: 0')
      // On first render no previous props exist — comparator shouldn't run.
      expect(comparatorCalls).toBe(0)
    })
  })
})
