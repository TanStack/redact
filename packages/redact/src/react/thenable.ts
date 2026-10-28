// Lazy owns a record so it can also read frozen promises. use() adopts the
// status fields shared with React and Flight on the thenable itself.
export function readThenable<T>(thenable: PromiseLike<T>, state: any = thenable, subscribed?: boolean): T {
  if (state.status === 'fulfilled') return state.value
  if (state.status === 'rejected') throw state.reason
  if (subscribed) throw thenable
  // Subscribe to anything unsettled, as React's use() does, then look again: Flight chunks
  // bring their own status ('resolved_model', 'blocked', ...) and only initialize or settle
  // once subscribed. A thenable settles once, so every subscription records the same outcome.
  state.status ??= 'pending'
  thenable.then(value => {
    state.status = 'fulfilled'
    state.value = value
  }, reason => {
    state.status = 'rejected'
    state.reason = reason
  })
  return readThenable(thenable, state, true)
}
