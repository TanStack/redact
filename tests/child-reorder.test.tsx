/**
 * DOM placement when child order changes across re-renders.
 *
 * The reconciler's placeChildrenInOrder pass moves DOM nodes to match the
 * new fiber order. It must iterate such that moving doms[i] doesn't
 * disturb items not yet placed — otherwise a chain of moves cascades into
 * the wrong final order.
 *
 * Reported symptoms this test locks down:
 *   - tanstack.com application starter: after clicking Analyze and then
 *     picking a different idea chip, the Analyze and "I'm feeling lucky"
 *     buttons swap places. Concrete transition: existing=[A, R] (Analyze
 *     + "Review" message div), new=[A, L, R] (Analyze + Lucky + "Prompt
 *     changed" div). Forward iteration produced [L, A, R]; correct is
 *     [A, L, R].
 *   - npm stats library dropdown: library items reorder after filter
 *     changes. Same root cause.
 */
import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

function setup() {
  const c = document.createElement('div')
  document.body.appendChild(c)
  return c
}

function textsOf(parent: Element): string[] {
  return Array.from(parent.children).map((c) => c.textContent || '')
}

describe('child reorder — DOM placement', () => {
  it('inserts a new middle child between existing siblings without disturbing order', () => {
    const container = setup()
    function App({ state }: { state: 'initial' | 'analyzing' | 'changed' }) {
      if (state === 'initial') {
        return (
          <div id="row">
            <button>A</button>
            <button>L</button>
          </div>
        )
      }
      if (state === 'analyzing') {
        return (
          <div id="row">
            <button>A</button>
            <div>R</div>
          </div>
        )
      }
      // changed: Lucky comes back, message div also present
      return (
        <div id="row">
          <button>A</button>
          <button>L</button>
          <div>R</div>
        </div>
      )
    }

    const root = createRoot(container)
    flushSync(() => root.render(<App state="initial" />))
    expect(textsOf(container.querySelector('#row')!)).toEqual(['A', 'L'])

    flushSync(() => root.render(<App state="analyzing" />))
    expect(textsOf(container.querySelector('#row')!)).toEqual(['A', 'R'])

    // The tricky transition that was broken: insert Lucky between
    // existing Analyze and the Review div. Forward iteration produced
    // [L, A, R] here; correct is [A, L, R].
    flushSync(() => root.render(<App state="changed" />))
    expect(textsOf(container.querySelector('#row')!)).toEqual(['A', 'L', 'R'])
  })

  it('swaps two adjacent unkeyed children', () => {
    const container = setup()
    function App({ swap }: { swap: boolean }) {
      return (
        <div id="row">
          <button>{swap ? 'B' : 'A'}</button>
          <button>{swap ? 'A' : 'B'}</button>
        </div>
      )
    }
    const root = createRoot(container)
    flushSync(() => root.render(<App swap={false} />))
    expect(textsOf(container.querySelector('#row')!)).toEqual(['A', 'B'])
    flushSync(() => root.render(<App swap={true} />))
    expect(textsOf(container.querySelector('#row')!)).toEqual(['B', 'A'])
  })

  it('reorders keyed list items preserving DOM identity', () => {
    const container = setup()
    const itemRefs = new Map<string, HTMLLIElement>()
    function App({ items }: { items: string[] }) {
      return (
        <ul id="list">
          {items.map((item) => (
            <li
              key={item}
              ref={(el: HTMLLIElement | null) => {
                if (el) itemRefs.set(item, el)
              }}
            >
              {item}
            </li>
          ))}
        </ul>
      )
    }
    const root = createRoot(container)
    flushSync(() => root.render(<App items={['a', 'b', 'c']} />))
    const elA = itemRefs.get('a')!
    const elB = itemRefs.get('b')!
    const elC = itemRefs.get('c')!

    // Reverse list — keyed so each li's DOM element must be preserved.
    flushSync(() => root.render(<App items={['c', 'b', 'a']} />))
    const list = container.querySelector('#list')!
    expect(textsOf(list)).toEqual(['c', 'b', 'a'])
    expect(list.children[0]).toBe(elC)
    expect(list.children[1]).toBe(elB)
    expect(list.children[2]).toBe(elA)
  })

  it('inserts a new keyed leading sibling without re-creating the rest', () => {
    const container = setup()
    function App({ lead }: { lead: boolean }) {
      return (
        <div id="row">
          {lead ? <span key="x">X</span> : null}
          <span key="a">A</span>
          <span key="b">B</span>
        </div>
      )
    }
    const root = createRoot(container)
    flushSync(() => root.render(<App lead={false} />))
    const rowBefore = container.querySelector('#row')!
    const aEl = rowBefore.children[0]
    const bEl = rowBefore.children[1]

    flushSync(() => root.render(<App lead={true} />))
    const rowAfter = container.querySelector('#row')!
    expect(textsOf(rowAfter)).toEqual(['X', 'A', 'B'])
    expect(rowAfter.children[1]).toBe(aEl)
    expect(rowAfter.children[2]).toBe(bEl)
  })
})
