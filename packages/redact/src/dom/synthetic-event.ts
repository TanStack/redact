import { isFunction } from '../core/functions'
// Snapshot native values so retaining or redispatching an event cannot change them.
export function createSyntheticEvent(native: Event) {
  let stopped = false
  const event: Record<string, any> = {
    nativeEvent: native,
    defaultPrevented: native.defaultPrevented,
    isDefaultPrevented: () => event.defaultPrevented,
    isPropagationStopped: () => stopped,
    preventDefault() { event.defaultPrevented = true; native.preventDefault() },
    stopPropagation() { stopped = true; native.stopPropagation() },
    stopImmediatePropagation() { stopped = true; native.stopImmediatePropagation() },
    persist() {},
  }
  // Walk the prototype chain instead of `for…in`: DOM implementations such as
  // happy-dom define `type`, `target` and other Event fields as non-enumerable
  // accessors. Object.prototype names are already `in event`, so they are skipped.
  for (let o: object | null = native; o; o = Object.getPrototypeOf(o)) {
    for (const key of Object.getOwnPropertyNames(o)) {
      if (!(key in event)) {
        const value = (native as any)[key]
        event[key] = isFunction(value) ? value.bind(native) : value
      }
    }
  }
  return event
}
