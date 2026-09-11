import { expect, it } from 'vitest'
import { createFiber, FiberTag, type Hook } from '../packages/redact/src/core'
import { checkpointCommit, commitMutation, prepareCommit, rewindCommit } from '../packages/redact/src/dom/commit'

function hook(value: unknown): Hook { return { s: value, q: undefined, d: undefined, c: undefined } }

it('restores every hook field and the retained reducer dispatch and action-array identities', () => {
  const fiber = createFiber(FiberTag.Function, null, null)
  const state = { count: 1 }, dispatch = () => {}, reducer = (value: number) => value
  const actions = [{ amount: 2 }, { amount: 3 }]
  const slot: Hook = { s: state, q: dispatch, d: reducer, c: actions }
  fiber.hooks = [slot]
  const plan = prepareCommit(() => {
    const checkpoint = checkpointCommit(fiber)
    slot.s = { count: 6 }
    slot.q = () => {}
    slot.d = () => 99
    slot.c = [{ amount: 8 }]
    rewindCommit(checkpoint)
  })
  expect(fiber.hooks).toHaveLength(1)
  expect(fiber.hooks![0]).toBe(slot)
  expect(slot.s).toBe(state)
  expect(slot.q).toBe(dispatch)
  expect(slot.d).toBe(reducer)
  expect(slot.c).toBe(actions)
  expect(actions).toEqual([{ amount: 2 }, { amount: 3 }])
  commitMutation(plan)
})

it('restores a mutable store queue in place before retained subscribers read it again', () => {
  const fiber = createFiber(FiberTag.Function, null, null)
  const get = () => 'committed', server = () => 'server', metadata = { version: 1 }
  const store = { g: get, s: server, metadata }
  const slot: Hook = { s: 'committed', q: store, d: [get], c: () => {} }
  const retainedRead = () => store.g()
  fiber.hooks = [slot]
  const plan = prepareCommit(() => {
    const checkpoint = checkpointCommit(fiber)
    store.g = () => 'abandoned'
    store.s = () => 'abandoned server'
    store.metadata = { version: 2 }
    slot.q = { g: () => 'replacement', s: undefined }
    slot.s = 'abandoned'
    rewindCommit(checkpoint)
  })
  expect(slot.q).toBe(store)
  expect(store.g).toBe(get)
  expect(store.s).toBe(server)
  expect(store.metadata).toBe(metadata)
  expect(retainedRead()).toBe('committed')
  expect(slot.s).toBe('committed')
  commitMutation(plan)
})

it('drops newly added hook slots and restores replaced slots after an abandoned attempt', () => {
  const fiber = createFiber(FiberTag.Function, null, null)
  const first = hook(1), second = hook(2)
  const originalSlots = fiber.hooks = [first, second]
  const plan = prepareCommit(() => {
    const checkpoint = checkpointCommit(fiber)
    originalSlots.push(hook(3))
    originalSlots[0] = hook(4)
    fiber.hooks = [hook(5), ...originalSlots]
    rewindCommit(checkpoint)
  })
  expect(fiber.hooks).toHaveLength(2)
  expect(fiber.hooks![0]).toBe(first)
  expect(fiber.hooks![1]).toBe(second)
  commitMutation(plan)
})

it.each([false, true])('restores an initially empty hook collection, allocated=%s', allocated => {
  const fiber = createFiber(FiberTag.Function, null, null)
  if (allocated) fiber.hooks = []
  const plan = prepareCommit(() => {
    const checkpoint = checkpointCommit(fiber)
    ;(fiber.hooks ||= []).push(hook('abandoned'))
    rewindCommit(checkpoint)
  })
  expect(fiber.hooks).toEqual(allocated ? [] : null)
  commitMutation(plan)
})

it('restores hook slots, action queues, and mutable stores through nested checkpoints', () => {
  const fiber = createFiber(FiberTag.Function, null, null)
  const first = hook('before'), second = hook('store'), outerSlot = hook('outer slot')
  const actions = [1, 2], outerActions = [3, 4]
  const get = () => 'before', outerGet = () => 'outer', store = { g: get, s: undefined }
  first.c = actions
  second.q = store
  fiber.hooks = [first, second]
  const plan = prepareCommit(() => {
    const outer = checkpointCommit(fiber)
    first.s = 'outer'
    first.c = outerActions
    store.g = outerGet
    fiber.hooks!.push(outerSlot)
    const inner = checkpointCommit(fiber)
    first.s = 'inner'
    first.c = [5]
    store.g = () => 'inner'
    fiber.hooks![0] = hook('replacement')
    fiber.hooks!.push(hook('inner slot'))
    rewindCommit(inner)
    expect(fiber.hooks).toHaveLength(3)
    expect(fiber.hooks![0]).toBe(first)
    expect(fiber.hooks![2]).toBe(outerSlot)
    expect(first.s).toBe('outer')
    expect(first.c).toBe(outerActions)
    expect(store.g).toBe(outerGet)
    rewindCommit(outer)
  })
  expect(fiber.hooks).toHaveLength(2)
  expect(fiber.hooks![0]).toBe(first)
  expect(fiber.hooks![1]).toBe(second)
  expect(first.s).toBe('before')
  expect(first.c).toBe(actions)
  expect(second.q).toBe(store)
  expect(store.g).toBe(get)
  commitMutation(plan)
})

it.each([FiberTag.Class, FiberTag.Memo, FiberTag.Lazy])('retains committed class metadata through wrapper tag %s', tag => {
  const fiber = createFiber(tag, null, null)
  const props = { label: 'before' }, state = { count: 1 }, context = { name: 'before' }
  const instance = { _fiber: fiber, props, state, context }
  const memoized = { c: { props, state }, r: 'before', extra: 1 } as Record<string, unknown>
  fiber.sn = instance
  fiber.ms = memoized
  const plan = prepareCommit(() => {
    const checkpoint = checkpointCommit(fiber)
    instance.props = { label: 'abandoned' }
    instance.state = { count: 2 }
    instance.context = { name: 'abandoned' }
    memoized.r = 'abandoned'
    memoized.added = true
    fiber.ms = { r: 'replacement' }
    fiber.sn = { _fiber: fiber }
    rewindCommit(checkpoint)
  })
  expect(fiber.sn).toBe(instance)
  expect(instance.props).toBe(props)
  expect(instance.state).toBe(state)
  expect(instance.context).toBe(context)
  expect(fiber.ms).toBe(memoized)
  expect(fiber.ms).toEqual({ c: { props, state }, r: 'before', extra: 1 })
  commitMutation(plan)
})

it('preserves generic fiber metadata and snapshots hooks in the retained Suspense fallback', () => {
  const boundary = createFiber(FiberTag.Suspense, null, 'boundary')
  const primary = createFiber(FiberTag.Function, null, 'primary')
  const fallback = createFiber(FiberTag.Fragment, null, 'fallback')
  const primaryHook = hook('primary'), fallbackHook = hook('fallback')
  primary.hooks = [primaryHook]
  fallback.hooks = [fallbackHook]
  primary.parent = fallback.parent = boundary
  boundary.child = primary
  const props = { children: 'before' }, node = document.createElement('div'), cleanup = () => {}
  const context = {}, ref = { current: null }
  boundary.pp = boundary.mp = props
  boundary.ms = { f: fallback, p: null }
  boundary.dom = node
  boundary.ref = ref
  boundary.cx = new Map([[context, 'before']])
  boundary.cu = [cleanup]
  boundary.depth = 2
  boundary.ld = false
  boundary.su = null
  const plan = prepareCommit(() => {
    const checkpoint = checkpointCommit(boundary)
    boundary.pp = boundary.mp = { children: 'abandoned' }
    boundary.ms.f = null
    boundary.ms.p = Promise.resolve()
    boundary.ms.added = true
    boundary.child = null
    boundary.dom = document.createElement('span')
    boundary.ref = { current: null }
    boundary.cx!.set(context, 'abandoned')
    boundary.cx!.set({}, 'new context')
    boundary.cu!.push(() => {})
    boundary.depth = 8
    boundary.ld = true
    boundary.su = primary
    primaryHook.s = 'abandoned primary'
    fallbackHook.s = 'abandoned fallback'
    fallback.hooks!.push(hook('new fallback hook'))
    rewindCommit(checkpoint)
  })
  expect(boundary.pp).toBe(props)
  expect(boundary.mp).toBe(props)
  expect(boundary.ms).toEqual({ f: fallback, p: null })
  expect(boundary.child).toBe(primary)
  expect(boundary.dom).toBe(node)
  expect(boundary.ref).toBe(ref)
  expect([...boundary.cx!]).toEqual([[context, 'before']])
  expect(boundary.cu).toEqual([cleanup])
  expect(boundary.depth).toBe(2)
  expect(boundary.ld).toBe(false)
  expect(boundary.su).toBeNull()
  expect(primaryHook.s).toBe('primary')
  expect(fallback.hooks).toHaveLength(1)
  expect(fallback.hooks![0]).toBe(fallbackHook)
  expect(fallbackHook.s).toBe('fallback')
  commitMutation(plan)
})
