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
  for (const key in native) {
    if (!(key in event)) {
      const value = (native as any)[key]
      event[key] = isFunction(value) ? value.bind(native) : value
    }
  }
  return event
}
