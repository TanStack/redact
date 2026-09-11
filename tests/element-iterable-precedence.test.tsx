import { afterEach, expect, it } from 'vitest'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'

let root: Root | undefined
let container: HTMLDivElement | undefined
afterEach(() => {
  if (root) flushSync(() => root!.unmount())
  container?.remove()
  root = undefined
})

function mount(child: unknown) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  flushSync(() => root!.render(child as React.ReactNode))
  return container
}

it('recognizes a React element before consulting a custom iterator', () => {
  let iterations = 0
  const child = {
    ...React.createElement('b', null, 'element'),
    *[Symbol.iterator]() { iterations++; yield 'iterator' },
  }
  expect(mount(child).innerHTML).toBe('<b>element</b>')
  expect(iterations).toBe(0)
})

it('keeps ordinary iterable children and nested arrays in their original order', () => {
  const iterable = {
    *[Symbol.iterator]() {
      yield React.createElement('b', { key: 'first' }, 'first')
      yield [null, false, React.createElement('i', { key: 'second' }, 'second')]
      yield 3
    },
  }
  expect(mount(iterable).innerHTML).toBe('<b>first</b><i>second</i>3')
})
