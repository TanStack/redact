import { expect, it } from 'vitest'
import { checkpointCommit, commitMutation, commitSynchronously, currentCommit, onCommitFailure, onCommitRollback, prepareCommit, queueBeforeMutation, queueCommitEffects, queueMutation, queueProp, queueText, rewindCommit } from '../packages/redact/src/dom/commit'

it('preserves interleaved text and generic mutation order', () => {
  const first = document.createTextNode('old'), second = document.createTextNode('other')
  const events: string[] = []
  const plan = prepareCommit(() => {
    queueBeforeMutation(() => events.push(`before:${first.data}:${second.data}`))
    queueText(first, 'one')
    queueMutation(() => events.push(`first:${first.data}`))
    queueText(second, '')
    queueMutation(() => { events.push(`second:${second.data}`); second.data = 'generic' })
    queueText(first, 'two')
    queueMutation(() => events.push(`last:${first.data}:${second.data}`))
    queueCommitEffects(() => events.push(`effect:${first.data}:${second.data}`))
  })
  expect([first.data, second.data]).toEqual(['old', 'other'])
  commitMutation(plan)
  commitMutation(plan)
  expect(events).toEqual(['before:old:other', 'first:one', 'second:', 'last:two:generic', 'effect:two:generic'])
})

it('truncates mixed text records and functions at nested checkpoints', () => {
  const text = document.createTextNode('old')
  const events: string[] = []
  const plan = prepareCommit(() => {
    queueMutation(() => events.push('kept'))
    queueText(text, 'prefix')
    const outer = checkpointCommit()
    onCommitRollback(() => events.push('undo-outer'))
    queueText(text, 'discarded-outer')
    queueMutation(() => events.push('discarded-outer'))
    const inner = checkpointCommit()
    onCommitRollback(() => events.push('undo-inner'))
    queueMutation(() => events.push('discarded-inner'))
    queueText(text, 'discarded-inner')
    queueBeforeMutation(() => events.push('discarded-before'))
    queueCommitEffects(() => events.push('discarded-effect'))
    rewindCommit(inner)
    queueMutation(() => events.push('also-discarded'))
    rewindCommit(outer)
    queueMutation(() => events.push(`prefix:${text.data}`))
    queueText(text, 'final')
    queueMutation(() => events.push(`final:${text.data}`))
  })
  expect(text.data).toBe('old')
  commitMutation(plan)
  expect(events).toEqual(['undo-inner', 'undo-outer', 'kept', 'prefix:prefix', 'final:final'])
  expect(text.data).toBe('final')
})

it('does not reuse an active synchronous plan during nested mutation commits', () => {
  const outer = document.createTextNode('outer-old'), inner = document.createTextNode('inner-old')
  const events: string[] = []
  commitSynchronously(() => {
    queueBeforeMutation(() => events.push('outer-before'))
    queueMutation(() => {
      events.push('outer-start')
      commitSynchronously(() => {
        queueBeforeMutation(() => events.push('inner-before'))
        queueText(inner, 'inner-new')
        queueMutation(() => events.push(`inner-mutate:${inner.data}`))
        queueCommitEffects(() => events.push('inner-effect'))
      })
      queueCommitEffects(() => events.push('outer-added-effect'))
      events.push('outer-end')
    })
    queueText(outer, 'outer-new')
    queueMutation(() => events.push(`outer-mutate:${outer.data}:${inner.data}`))
    queueCommitEffects(() => events.push('outer-effect'))
  })
  expect(events).toEqual(['outer-before', 'outer-start', 'inner-before', 'inner-mutate:inner-new', 'inner-effect', 'outer-end', 'outer-mutate:outer-new:inner-new', 'outer-effect', 'outer-added-effect'])
  expect(currentCommit).toBeNull()
  commitSynchronously(() => queueText(outer, 'next'))
  expect([outer.data, inner.data]).toEqual(['next', 'inner-new'])
})

it('clears failed preparation before reusing a plan, including reentrant recovery', () => {
  const discarded = document.createTextNode('untouched'), recovered = document.createTextNode('old')
  const events: string[] = []
  expect(() => commitSynchronously(() => {
    queueBeforeMutation(() => events.push('discarded-before'))
    queueText(discarded, 'discarded')
    queueCommitEffects(() => events.push('discarded-effect'))
    onCommitFailure(() => commitSynchronously(() => {
      queueText(recovered, 'recovered')
      queueCommitEffects(() => events.push('recovery'))
    }))
    throw Error('prepare failed')
  })).toThrow('prepare failed')
  expect(currentCommit).toBeNull()
  commitSynchronously(() => {
    queueBeforeMutation(() => events.push('next-before'))
    queueText(recovered, 'next')
    queueCommitEffects(() => events.push('next-effect'))
  })
  expect(discarded.data).toBe('untouched')
  expect(recovered.data).toBe('next')
  expect(events).toEqual(['recovery', 'next-before', 'next-effect'])
})

it('isolates a nested mutation failure from the parent plan and the next commit', () => {
  const outer = document.createTextNode('old'), inner = document.createTextNode('old')
  const events: string[] = []
  commitSynchronously(() => {
    queueMutation(() => {
      expect(() => commitSynchronously(() => {
        queueText(inner, 'committed-before-error')
        queueMutation(() => { throw Error('mutation failed') })
        queueText(inner, 'discarded-after-error')
        queueCommitEffects(() => events.push('discarded-effect'))
      })).toThrow('mutation failed')
      queueCommitEffects(() => events.push('parent-effect'))
    })
    queueText(outer, 'parent-complete')
  })
  commitSynchronously(() => queueMutation(() => events.push('next')))
  expect([outer.data, inner.data]).toEqual(['parent-complete', 'committed-before-error'])
  expect(events).toEqual(['parent-effect', 'next'])
  expect(currentCommit).toBeNull()
})

it('preserves property, text and function record boundaries including function-valued props', () => {
  const button = document.createElement('button'), text = document.createTextNode('old')
  button.appendChild(text)
  button.setAttribute('data-state', 'old')
  const events: string[] = []
  const plan = prepareCommit(() => {
    queueProp(button, 'data-state', 'one', 'old', false)
    queueText(text, 'one')
    queueMutation(() => events.push(`${button.getAttribute('data-state')}:${text.data}`))
    queueProp(button, 'onClick', () => events.push('clicked'), undefined, false)
    queueProp(button, 'disabled', true, false, false)
    queueMutation(() => events.push(`disabled:${button.disabled}`))
    queueText(text, 'two')
    queueProp(button, 'disabled', false, true, false)
    queueProp(button, 'data-state', null, 'one', false)
    queueMutation(() => events.push(`${button.hasAttribute('data-state')}:${text.data}:${button.disabled}`))
  })
  expect(button.textContent).toBe('old')
  expect(button.getAttribute('data-state')).toBe('old')
  commitMutation(plan)
  expect(events).toEqual(['one:one', 'disabled:true', 'false:two:false'])
  button.click()
  expect(events).toEqual(['one:one', 'disabled:true', 'false:two:false', 'clicked'])
})

it('rewinds property records without leaving operand fragments in the mutation tape', () => {
  const div = document.createElement('div'), text = document.createTextNode('old')
  div.appendChild(text)
  const events: string[] = []
  const plan = prepareCommit(() => {
    queueText(text, 'prefix')
    queueProp(div, 'title', 'kept', undefined, false)
    const checkpoint = checkpointCommit()
    queueProp(div, 'title', 'discarded', 'kept', false)
    queueText(text, 'discarded')
    queueMutation(() => events.push('discarded'))
    rewindCommit(checkpoint)
    queueMutation(() => events.push(`${div.title}:${text.data}`))
    queueProp(div, 'title', 'final', 'kept', false)
    queueText(text, 'final')
  })
  commitMutation(plan)
  expect(events).toEqual(['kept:prefix'])
  expect([div.title, text.data]).toEqual(['final', 'final'])
})
