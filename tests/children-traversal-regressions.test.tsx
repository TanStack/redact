import { describe, expect, it } from 'vitest'
import { Children, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const keysOf = (children: any[]) => children.map((child) => child.key)

describe('Children traversal regressions', () => {
  it('counts empty slots inside arrays', () => {
    expect(Children.count([null, false, undefined, 'visible'])).toBe(4)
  })

  it('calls map for empty slots and preserves their positions', () => {
    const seen: Array<[unknown, number]> = []
    const mapped = Children.map([null, false, 'visible'], (child, index) => {
      seen.push([child, index])
      return index
    })

    expect(seen).toEqual([[null, 0], [null, 1], ['visible', 2]])
    expect(mapped).toEqual([0, 1, 2])
  })

  it('keeps nested original keys distinct after toArray flattens them', () => {
    const children = [
      [createElement('span', { key: 'same' })],
      [createElement('span', { key: 'same' })],
    ]
    const flattened = Children.toArray(children)

    expect(new Set(flattened.map(child => child.key)).size).toBe(2)
  })

  it('combines a mapped element key with its source key', () => {
    const child = createElement('span', { key: 'source' })
    const [mapped] = Children.map([child], () => createElement('b', { key: 'wrapper' }))!

    expect(mapped.key).toContain('source')
    expect(mapped.key).toContain('wrapper')
  })

  it('keeps keyed children keys stable when they are reordered', () => {
    const a = createElement('i', { key: 'a' })
    const b = createElement('i', { key: 'b' })

    expect(keysOf(Children.toArray([a, b]))).toEqual(['.$a', '.$b'])
    expect(keysOf(Children.toArray([b, a]))).toEqual(['.$b', '.$a'])
    expect(keysOf(Children.map([b, a], (c) => c)!)).toEqual(['.$b', '.$a'])
  })

  it('gives a lone child the same key it has as the first array item', () => {
    const a = createElement('i', { key: 'a' })
    const alone = Children.toArray(a)[0]
    const inArray = Children.toArray([a, createElement('i', { key: 'b' })])[0]

    expect(alone.key).toBe('.$a')
    expect(inArray.key).toBe(alone.key)
    expect(Children.map(a, (c) => c)![0].key).toBe('.$a')
  })

  it('drops empty slots from toArray', () => {
    const b = createElement('b')
    expect(Children.toArray([false, null, b, undefined, true, 'x'])).toEqual([
      expect.objectContaining({ type: 'b', key: '.2' }),
      'x',
    ])
  })

  it('treats null and undefined children as empty', () => {
    expect(Children.count(null)).toBe(0)
    expect(Children.count(undefined)).toBe(0)
    expect(Children.toArray(null)).toEqual([])
    expect(Children.toArray(undefined)).toEqual([])
    expect(Children.map(undefined, () => 1)).toBeNull()
  })

  it('does not double the key when map returns the child unchanged', () => {
    const [mapped] = Children.map([createElement('i', { key: 'a' })], (c) => c)!
    expect(mapped.key).toBe('.$a')
  })

  it('keeps keys distinct when map returns arrays', () => {
    const children = [
      [createElement('i', { key: 'same' })],
      [createElement('i', { key: 'same' })],
    ]
    const keyed = Children.map(children, (c) => [c])!
    expect(keysOf(keyed)).toEqual(['.0:$same/.$same', '.1:$same/.$same'])

    const unkeyed = Children.map([createElement('i', { key: 'a' })], () => [
      createElement('b'),
      createElement('b'),
    ])!
    expect(new Set(keysOf(unkeyed)).size).toBe(2)
  })

  it('flattens nested arrays returned from map and drops their empty slots', () => {
    const mapped = Children.map(['x'], () => [null, [createElement('b')], false])!
    expect(mapped).toHaveLength(1)
    expect(mapped[0].key).toBe('.0/.1:0')
  })

  it('escapes separators in user keys', () => {
    expect(Children.toArray([createElement('i', { key: 'a:b=c' })])[0].key).toBe('.$a=2b=0c')

    const [mapped] = Children.map([createElement('i', { key: 'x/y' })], () => [createElement('b')])!
    expect(mapped.key).toBe('.$x//y/.0')
  })

  it('keeps an explicit empty mapped key distinct from an unkeyed one', () => {
    const source = [createElement('i')]
    const [emptyKeyed] = Children.map(source, () => createElement('b', { key: '' }))!
    const [unkeyed] = Children.map(source, () => createElement('b'))!
    expect(emptyKeyed.key).toBe('/.0')
    expect(unkeyed.key).toBe('.0')

    const [same] = Children.map([createElement('i', { key: '' })], (c) => c)!
    expect(same.key).toBe('.$')
  })

  it('passes a running index to forEach across nested arrays and empty slots', () => {
    const seen: Array<[unknown, number]> = []
    Children.forEach([['a', null], [[false, 'b']]], (child, index) => {
      seen.push([child, index])
    })
    expect(seen).toEqual([['a', 0], [null, 1], [null, 2], ['b', 3]])
  })

  it('preserves component state when keyed children are reordered through Children.map', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const setters: Record<string, (v: string) => void> = {}

    function Item({ id }: { id: string }) {
      const [value, setValue] = useState(id)
      setters[id] = setValue
      return createElement('span', null, value)
    }
    function List({ children }: { children: any }) {
      return createElement('div', null, Children.map(children, (c) => c))
    }
    const render = (ids: string[]) =>
      createElement(List, null, ids.map((id) => createElement(Item, { key: id, id })))

    const root = createRoot(container)
    flushSync(() => root.render(render(['a', 'b'])))
    flushSync(() => setters.a!('a-edited'))
    flushSync(() => root.render(render(['b', 'a'])))

    expect(container.textContent).toBe('ba-edited')
    root.unmount()
    container.remove()
  })
})
