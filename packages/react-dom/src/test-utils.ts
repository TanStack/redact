export async function act(fn: () => any): Promise<void> {
  const r = fn()
  if (r && typeof r.then === 'function') await r
  // Drain pending microtasks
  for (let i = 0; i < 10; i++) await Promise.resolve()
}
