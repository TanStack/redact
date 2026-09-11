import type { FiberRoot } from '../../../core'
import { ReactSharedInternals } from '../../../react/shared-internals'
import { currentCommit, prepareCommit, commitBeforeMutation, commitMutation, commitSynchronously, type CommitPlan } from '../../commit'
import { prepareViewTransition } from './visual'
import { recoverRootError } from '../../reconcile'

type Work = { commit: () => void; scopes: Set<Set<string>> }
type Visual = NonNullable<ReturnType<typeof prepareViewTransition>>
interface Transaction {
  native?: ViewTransition
  visual: Visual
  work: Map<FiberRoot, Work>
  layout: Array<() => void>
  passive: Array<() => void>
  consumed: boolean
  cancelled: boolean
  ready: boolean
  plans: CommitPlan[]
  preparing: boolean
}
interface Coordinator {
  queued: Map<FiberRoot, Work>
  active?: Transaction | undefined
  flush: () => void
  scheduled: boolean
}

const marks = new Map<FiberRoot, Set<Set<string>> | null>()
const documents = new Map<Document, Coordinator>()
let committing: Transaction | undefined

function ownerDocument(root: FiberRoot): Document {
  return root.c.nodeType === 9 ? root.c as unknown as Document : root.c.ownerDocument!
}

function drain(queue: Array<() => void>): void {
  while (queue.length) queue.shift()!()
}

function passive(transaction: Transaction): void {
  if (transaction.consumed) transaction.visual.restore()
  drain(transaction.passive)
}

function release(doc: Document, coordinator: Coordinator): void {
  if (!coordinator.active && !coordinator.queued.size && documents.get(doc) === coordinator) documents.delete(doc)
}

function render(work: Map<FiberRoot, Work>): void {
  for (const entry of work.values()) entry.commit()
}

function prepareRoot(transaction: Transaction, root: FiberRoot, commit: () => void): void {
  try {
    prepareCommit(() => {
      transaction.plans.push(currentCommit!)
      commit()
    })
  } catch (error) {
    transaction.plans.pop()
    if (!recoverRootError(error)) throw error
    transaction.work.delete(root)
    transaction.visual.exclude(root)
  }
}

function beforeMutation(transaction: Transaction): void {
  for (const plan of transaction.plans) commitBeforeMutation(plan)
}

function mutation(transaction: Transaction): void {
  for (const plan of transaction.plans) commitMutation(plan)
}

export function markTransitionUpdate(root: FiberRoot): void {
  if (committing) return
  const coordinator = documents.size ? documents.get(ownerDocument(root)) : undefined
  if (coordinator?.active) passive(coordinator.active)
  const scope = ReactSharedInternals.T
  if (scope) {
    if (marks.get(root) !== null) {
      let scopes = marks.get(root)
      if (!scopes) marks.set(root, scopes = new Set())
      scopes.add(scope)
    }
  } else {
    if (marks.has(root)) marks.set(root, null)
    if (coordinator) cancel(coordinator)
  }
}

export function deferTransition(root: FiberRoot, commit: () => void, flush: () => void): boolean {
  if (committing?.preparing && !currentCommit && ownerDocument(root) === committing.visual.document) {
    prepareRoot(committing, root, commit)
    return true
  }
  if (!marks.size && !documents.size) return false
  const scopes = marks.get(root)
  marks.delete(root)
  const doc = ownerDocument(root)
  const activeCoordinator = documents.get(doc)
  if (activeCoordinator?.active?.plans.length && !activeCoordinator.active.consumed && !currentCommit) {
    // A reentrant urgent render must consume the already-rendered commit
    // before reconciling another tree against it.
    if (committing || !scopes) cancel(activeCoordinator)
  }
  if (committing || !scopes || !doc.startViewTransition) return false
  let coordinator = documents.get(doc)
  if (!coordinator) {
    coordinator = { queued: new Map(), flush, scheduled: false }
    documents.set(doc, coordinator)
  }
  const existing = coordinator.queued.get(root)
  if (existing) for (const scope of scopes) existing.scopes.add(scope)
  else coordinator.queued.set(root, { commit, scopes })
  kick(doc, coordinator)
  return true
}

function kick(doc: Document, coordinator: Coordinator): void {
  if (coordinator.active || coordinator.scheduled || !coordinator.queued.size) return
  coordinator.scheduled = true
  queueMicrotask(async () => {
    coordinator.scheduled = false
    if (coordinator.active || !coordinator.queued.size) return
    const work = coordinator.queued
    coordinator.queued = new Map()
    const types = new Set<string>()
    for (const entry of work.values()) for (const scope of entry.scopes) for (const type of scope) types.add(type)
    const visual = prepareViewTransition(work.keys(), [...types])
    if (!visual) {
      commitSynchronously(() => render(work))
      release(doc, coordinator)
      return
    }
    const transaction: Transaction = { visual, work, layout: [], passive: [], plans: [], preparing: true, consumed: false, cancelled: false, ready: false }
    coordinator.active = transaction
    try {
      try {
        within(transaction, () => {
          for (const [root, entry] of work) prepareRoot(transaction, root, entry.commit)
          coordinator.flush()
        })
      } finally { transaction.preparing = false }
      const resources = visual.prepare()
      if (resources) await resources
      if (transaction.cancelled) return
      within(transaction, () => beforeMutation(transaction))
      if (!visual.beforeCommit()) {
        cancel(coordinator)
        return
      }
    } catch (error) {
      cancel(coordinator)
      report(transaction, error)
      return
    }
    const update = () => {
      if (transaction.consumed) return
      transaction.consumed = true
      const navigation = (doc.defaultView as any)?.navigation?.transition
      const fonts = doc.fonts
      const wasLoaded = fonts?.status === 'loaded'
      within(transaction, () => {
        mutation(transaction)
        coordinator.flush()
      })
      const finishCommit = () => {
        if (transaction.cancelled) return
        within(transaction, () => { drain(transaction.layout); coordinator.flush() })
        if (navigation) return navigation.finished.catch(() => {}).then(() => {
          if (!transaction.cancelled) visual.afterCommit()
        })
        visual.afterCommit()
      }
      const resources = visual.waitForResources(!!wasLoaded)
      if (resources) return resources.then(finishCommit)
      return finishCommit()
    }
    try {
      const native = transaction.native = doc.startViewTransition({ update, types: [...types] })
      native.updateCallbackDone.catch(error => report(transaction, error))
      native.ready.then(() => {
        if (!transaction.cancelled) {
          transaction.ready = true
          try { visual.ready() } catch (error) { report(transaction, error) }
        }
      }, error => {
        try {
          if (!transaction.cancelled && reportable(error)) {
            const root = transaction.work.keys().next().value
            if (root?.re) root.re(error, { componentStack: null })
            else if (typeof reportError === 'function') reportError(error)
            else queueMicrotask(() => { throw error })
          }
        } finally {
          transaction.cancelled = true
          try { visual.cancel() } finally { consume(transaction) }
        }
      })
      native.finished.then(() => finish(doc, coordinator, transaction), () => finish(doc, coordinator, transaction))
    } catch {
      cancel(coordinator)
    }
  })
}

function reportable(error: unknown): boolean {
  return error !== null && !(error && typeof error === 'object' && 'name' in error && error.name === 'InvalidStateError' &&
    'message' in error && (
      error.message === 'View transition was skipped because document visibility state is hidden.' ||
      error.message === 'Skipping view transition because document visibility state has become hidden.' ||
      error.message === 'Skipping view transition because viewport size changed.' ||
      error.message === 'Transition was aborted because of invalid state'
    ))
}

function consume(transaction: Transaction): void {
  transaction.consumed = true
  within(transaction, () => {
    beforeMutation(transaction)
    mutation(transaction)
  })
  drain(transaction.layout)
}

function within(transaction: Transaction, work: () => void): void {
  const previous = committing
  committing = transaction
  try { work() } finally { committing = previous }
}

function report(transaction: Transaction, error: unknown): void {
  const root = transaction.work.keys().next().value
  if (root?.ue) root.ue(error, { componentStack: null })
  else queueMicrotask(() => { throw error })
}

function finish(doc: Document, coordinator: Coordinator, transaction: Transaction): void {
  if (coordinator.active === transaction) coordinator.active = undefined
  try { passive(transaction) } catch (error) { report(transaction, error) } finally {
    try { transaction.visual.finish() } catch (error) { report(transaction, error) } finally {
      if (coordinator.queued.size) kick(doc, coordinator)
      else release(doc, coordinator)
    }
  }
}

function cancel(coordinator: Coordinator): void {
  const transaction = coordinator.active
  const queued = coordinator.queued
  const root = queued.keys().next().value
  const doc = transaction?.visual.document ?? (root ? ownerDocument(root) : undefined)
  coordinator.queued = new Map()
  if (transaction) {
    if (!transaction.ready) {
      coordinator.active = undefined
      transaction.cancelled = true
      transaction.native?.skipTransition()
      try { transaction.visual.cancel() } catch (error) { report(transaction, error) }
    }
    consume(transaction)
    passive(transaction)
  }
  commitSynchronously(() => render(queued))
  if (doc) release(doc, coordinator)
}

export function cancelTransitions(): void {
  if (!marks.size && !documents.size) return
  marks.clear()
  for (const [doc, coordinator] of [...documents]) {
    cancel(coordinator)
    release(doc, coordinator)
  }
}

export function deferTransitionLayout(work: () => void): boolean {
  if (!committing) return false
  committing.layout.push(work)
  return true
}

export function deferTransitionPassive(work: () => void): boolean {
  if (!committing) return false
  committing.passive.push(work)
  return true
}
