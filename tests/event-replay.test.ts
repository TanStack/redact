import { describe, expect, it, afterEach } from 'vitest'
import { drainReplayQueue } from '../packages/redact/src/dom/event-replay'

const g = globalThis as any

afterEach(() => {
  delete g.$RE_q
  delete g.$RE_stop
})

describe('event replay', () => {
  it('replays buffered events with browser-compatible event subclasses', () => {
    const root = document.createElement('div')
    const button = document.createElement('button')
    const input = document.createElement('input')
    const form = document.createElement('form')
    root.append(button, input, form)
    document.body.appendChild(root)

    const seen: Event[] = []
    const stopSnapshots: number[] = []

    root.addEventListener('click', (event) => {
      event.preventDefault()
      seen.push(event)
    })
    root.addEventListener('keydown', (event) => seen.push(event))
    root.addEventListener('input', (event) => seen.push(event))
    root.addEventListener('change', (event) => seen.push(event))
    root.addEventListener('submit', (event) => {
      event.preventDefault()
      seen.push(event)
    })

    g.$RE_q = [
      ['click', button, 1],
      ['keydown', input, 2],
      ['input', input, 3],
      ['change', input, 4],
      ['submit', form, 5],
    ]
    g.$RE_stop = () => {
      stopSnapshots.push(seen.length)
    }

    drainReplayQueue()

    expect(stopSnapshots[0]).toBe(0)
    expect(g.$RE_q).toEqual([])
    expect(seen.map((event) => event.type)).toEqual([
      'click',
      'keydown',
      'input',
      'change',
      'submit',
    ])

    expect(seen[0]).toBeInstanceOf(MouseEvent)
    expect(seen[1]).toBeInstanceOf(KeyboardEvent)
    expect(seen[2]).toBeInstanceOf(InputEvent)
    expect(seen[3]).toBeInstanceOf(Event)
    expect(seen[4]).toBeInstanceOf(Event)

    expect(seen[0]?.target).toBe(button)
    expect(seen[1]?.target).toBe(input)
    expect(seen[2]?.target).toBe(input)
    expect(seen[4]?.target).toBe(form)
    expect(seen.every((event) => event.bubbles)).toBe(true)
    expect(seen.every((event) => event.cancelable)).toBe(true)
    expect(seen[0]?.defaultPrevented).toBe(true)
    expect(seen[4]?.defaultPrevented).toBe(true)

    drainReplayQueue()

    expect(seen).toHaveLength(5)
    expect(stopSnapshots).toEqual([0, 5])
  })
})
