export type TransitionImages = Map<HTMLImageElement, { src?: unknown; srcSet?: unknown; onLoad?: unknown; loading?: unknown }>

let imageBudget = 0

function imageBytes(image: HTMLImageElement): number {
  return (image.width || 100) * (image.height || 100) * (image.ownerDocument.defaultView?.devicePixelRatio || 1) * 0.25
}

function staticResource(type: string): boolean {
  return /^(css|script|font|img|image|input|link)$/.test(type)
}

// Match React's estimate from up to eleven groups of overlapping transfers,
// falling back to the browser's downlink estimate and then 5 Mbps.
function bandwidth(doc: Document): number {
  const view = doc.defaultView!
  const entries = view.performance.getEntriesByType?.('resource') as PerformanceResourceTiming[] | undefined
  let count = 0, bits = 0
  for (let i = 0; entries && i < entries.length; i++) {
    const entry = entries[i]!
    if (!entry.transferSize || !entry.duration || !staticResource(entry.initiatorType)) continue
    let overlap = 0
    for (++i; i < entries.length; i++) {
      const next = entries[i]!
      if (next.startTime > entry.responseEnd) break
      if (next.transferSize && staticResource(next.initiatorType)) {
        overlap += next.transferSize * (next.responseEnd < entry.responseEnd ? 1 :
          (entry.responseEnd - next.startTime) / (next.responseEnd - next.startTime))
      }
    }
    i--
    bits += 8 * (entry.transferSize + overlap) / (entry.duration / 1000)
    if (++count > 10) break
  }
  if (count) return bits / count / 1000000
  const downlink = (view.navigator as any).connection?.downlink
  return typeof downlink === 'number' ? downlink : 5
}

export function transitionResources(doc: Document, previous: TransitionImages, next: TransitionImages) {
  const pending: HTMLImageElement[] = []
  const releases = new Set<() => void>()

  function wait(promises: Promise<unknown>[], timeout: number, cleanups: Array<() => void> = []): Promise<void> | undefined {
    if (!promises.length) return
    return new Promise(resolve => {
      const finish = () => {
        if (!releases.delete(finish)) return
        clearTimeout(timer)
        for (const cleanup of cleanups) cleanup()
        resolve()
      }
      const timer = setTimeout(finish, timeout)
      releases.add(finish)
      Promise.all(promises).then(finish, finish)
    })
  }

  return {
    before() {
      const promises: Promise<unknown>[] = []
      let bytes = 0
      for (const [image, props] of next) {
        const old = previous.get(image)
        if (props.src == null || props.src === '' || props.onLoad != null || props.loading === 'lazy' ||
          (old && props.src === old.src && props.srcSet === old.srcSet) || typeof image.decode !== 'function') continue
        if (!image.complete) { pending.push(image); bytes += imageBytes(image) }
        promises.push(image.decode().catch(() => {}))
      }
      if (bytes && !imageBudget) imageBudget = 125 * bandwidth(doc) * 500
      return wait(promises, bytes > imageBudget ? 50 : 800)
    },
    after(fontsWereLoaded: boolean) {
      const promises: Promise<unknown>[] = []
      const cleanups: Array<() => void> = []
      if (fontsWereLoaded) {
        // Discover fonts introduced by mutation before the browser captures.
        doc.documentElement.getBoundingClientRect()
        if (doc.fonts.status === 'loading') promises.push(doc.fonts.ready)
      }
      const images: HTMLImageElement[] = []
      let bytes = 0
      const view = doc.defaultView!
      for (const image of pending) {
        if (image.complete) continue
        const rect = image.getBoundingClientRect()
        if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= view.innerHeight || rect.left >= view.innerWidth) continue
        bytes += imageBytes(image)
        if (bytes > imageBudget) { images.length = 0; break }
        images.push(image)
      }
      for (const image of images) {
        promises.push(new Promise<void>(resolve => {
          const loaded = () => resolve()
          image.addEventListener('load', loaded)
          image.addEventListener('error', loaded)
          cleanups.push(() => {
            image.removeEventListener('load', loaded)
            image.removeEventListener('error', loaded)
          })
        }))
      }
      return wait(promises, 500, cleanups)
    },
    cancel() { for (const release of releases) release() },
  }
}
