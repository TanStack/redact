// Minimal `scheduler` package surface — enough for React-ecosystem libraries
// (react-three/fiber, react-query's older scheduler calls, some devtools) to
// resolve the import without crashing. We don't implement priority lanes or
// interruptible work; everything runs on microtask or the next task.

const PRIORITY_IMMEDIATE = 1
const PRIORITY_USER_BLOCKING = 2
const PRIORITY_NORMAL = 3
const PRIORITY_LOW = 4
const PRIORITY_IDLE = 5

type Callback = () => unknown

interface Task {
  id: number
  callback: Callback | null
  priority: number
  cancelled: boolean
}

let nextId = 0

export function unstable_scheduleCallback(priority: number, cb: Callback): Task {
  const task: Task = {
    id: ++nextId,
    callback: cb,
    priority,
    cancelled: false,
  }
  const run = () => {
    if (task.cancelled || !task.callback) return
    const fn = task.callback
    task.callback = null
    try {
      fn()
    } catch (e) {
      // Re-throw on next task so the host sees it
      setTimeout(() => {
        throw e
      }, 0)
    }
  }
  // Immediate → microtask so ordering is predictable; everything else → next task.
  if (priority <= PRIORITY_IMMEDIATE) {
    queueMicrotask(run)
  } else {
    setTimeout(run, 0)
  }
  return task
}

export function unstable_cancelCallback(task: Task): void {
  task.cancelled = true
  task.callback = null
}

export function unstable_shouldYield(): boolean {
  // We never yield — work runs to completion on whichever task schedules it.
  return false
}

export function unstable_requestPaint(): void {
  // no-op
}

export function unstable_now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

export function unstable_getCurrentPriorityLevel(): number {
  return PRIORITY_NORMAL
}

export function unstable_runWithPriority<T>(_priority: number, fn: () => T): T {
  return fn()
}

export function unstable_next<T>(fn: () => T): T {
  return fn()
}

export function unstable_wrapCallback<T extends (...args: any[]) => any>(fn: T): T {
  return fn
}

export function unstable_continueExecution(): void {
  // no-op
}

export function unstable_pauseExecution(): void {
  // no-op
}

export function unstable_getFirstCallbackNode(): Task | null {
  return null
}

export const unstable_IdlePriority = PRIORITY_IDLE
export const unstable_ImmediatePriority = PRIORITY_IMMEDIATE
export const unstable_LowPriority = PRIORITY_LOW
export const unstable_NormalPriority = PRIORITY_NORMAL
export const unstable_UserBlockingPriority = PRIORITY_USER_BLOCKING

// Some libraries (e.g. @react-three/fiber) import `scheduler` with a default
// binding expecting the namespace object. Provide one.
export default {
  unstable_scheduleCallback,
  unstable_cancelCallback,
  unstable_shouldYield,
  unstable_requestPaint,
  unstable_now,
  unstable_getCurrentPriorityLevel,
  unstable_runWithPriority,
  unstable_next,
  unstable_wrapCallback,
  unstable_continueExecution,
  unstable_pauseExecution,
  unstable_getFirstCallbackNode,
  unstable_IdlePriority,
  unstable_ImmediatePriority,
  unstable_LowPriority,
  unstable_NormalPriority,
  unstable_UserBlockingPriority,
}
