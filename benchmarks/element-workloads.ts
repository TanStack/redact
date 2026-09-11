import { cloneElement, createContext, createElement, createRef } from 'react'

const batchSize = 256
const ref = createRef()
const template = createElement('button', { ref, className: 'trigger', title: 'original' }, 'child')

// These measure factory work, not render latency. Check the element-level ref
// shared by both versions so the known missing props.ref bug cannot skip work.
export const elementWorkloads = [
  { name: 'create-elements', make: (id: number) => createElement('button', { id, className: 'trigger', title: 'created' }, 'child') },
  { name: 'create-elements-with-ref', make: (id: number) => createElement('button', { id, ref, className: 'trigger', title: 'created' }, 'child') },
  { name: 'clone-elements', make: (id: number) => cloneElement(template, { id, ref: undefined, title: 'cloned' }) },
  { name: 'create-contexts', make: (id: number) => createContext(id) },
].map(({ name, make }) => ({
  name,
  mode: 'sync' as const,
  optIn: true,
  defaultIterations: 1000,
  async execute(iterations: number) {
    const batch: any[] = new Array(batchSize)
    let checksum = 0
    const context = name === 'create-contexts'
    const start = performance.now()
    for (let tick = 0; tick < iterations; tick++) {
      for (let id = 0; id < batchSize; id++) batch[id] = make(tick + id)
      for (let id = 0; id < batchSize; id++) checksum += context ? batch[id]._currentValue : batch[id].props.id
    }
    const durationMs = performance.now() - start
    const expected = batchSize * iterations * (iterations + batchSize - 2) / 2
    if (checksum !== expected) throw new Error(`${name}: incorrect completed factory work`)
    for (let id = 0; id < batchSize; id++) {
      const value = batch[id]
      if (context) {
        if (!value.Provider || !value.Consumer || value._currentValue !== iterations - 1 + id) throw new Error('Invalid context')
      } else if (value.type !== 'button' || value.props.children !== 'child' || value.ref !== (name === 'create-elements' ? null : ref)) {
        throw new Error('Invalid element')
      }
    }
    return { durationMs, operations: iterations * batchSize, checks: batchSize + 1, diagnostics: { checksum } }
  },
}))
