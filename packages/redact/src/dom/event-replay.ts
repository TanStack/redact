/**
 * Drain the `window.$RE_q` event buffer that the inline runtime populated
 * before the main bundle was parsed. For each buffered event, re-dispatch a
 * synthesized event at the original target so handlers attached during
 * hydration see it.
 *
 * Lossy by design: only the event type and target are preserved. Modifier
 * keys, pointer positions, etc. are zeroed. This is acceptable because the
 * replay window is a fraction of a second between shell render and full
 * hydration of a streaming page; users who need pixel-accurate replay won't
 * lose much beyond that.
 */
export function drainReplayQueue(): void {
  const g = globalThis as any
  const q = g.$RE_q as Array<[string, EventTarget, number]> | undefined
  if (!q) return

  // Stop capturing before replaying so we don't re-capture what we dispatch.
  if (typeof g.$RE_stop === 'function') {
    try {
      g.$RE_stop()
    } catch {}
  }

  const events = q.splice(0)
  for (const [type, target] of events) {
    try {
      const ev = createEvent(type)
      target.dispatchEvent(ev)
    } catch {}
  }
}

function createEvent(type: string): Event {
  switch (type) {
    case 'click':
    case 'dblclick':
    case 'mousedown':
    case 'mouseup':
    case 'contextmenu':
      return new MouseEvent(type, { bubbles: true, cancelable: true })
    case 'keydown':
    case 'keyup':
    case 'keypress':
      return new KeyboardEvent(type, { bubbles: true, cancelable: true })
    case 'input':
      return new InputEvent(type, { bubbles: true, cancelable: true })
    case 'submit':
    case 'change':
    case 'focus':
    case 'blur':
    default:
      return new Event(type, { bubbles: true, cancelable: true })
  }
}
