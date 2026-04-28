import type { ReactNode } from '../core'
import {
  beginSSR,
  endSSR,
  installSSRDispatcher,
  uninstallSSRDispatcher,
  applyContextSnapshot,
} from './dispatcher'
import { walk, type SuspendedBoundary } from './walk'
import { BOUNDARY_REVEAL_RUNTIME, revealScript } from './bootstrap-script'

export interface StreamOptions {
  identifierPrefix?: string
  nonce?: string
  bootstrapScripts?: ReadonlyArray<string | { src: string; async?: boolean; nonce?: string }>
  bootstrapModules?: ReadonlyArray<string | { src: string; nonce?: string }>
  onError?: (error: unknown) => string | void
  signal?: AbortSignal
  progressiveChunkSize?: number
}

export interface ReadableStreamResult extends ReadableStream<Uint8Array> {
  allReady: Promise<void>
}

export interface OrchestratorState {
  nextId: number
  pending: Set<Promise<void>>
  closed: boolean
  errored: unknown | null
}

type Emit = (chunk: string) => void

export async function streamHtml(
  children: ReactNode,
  emit: Emit,
  options: StreamOptions,
  state: OrchestratorState,
): Promise<void> {
  installSSRDispatcher()
  beginSSR(options.identifierPrefix)
  const nonce = options.nonce

  try {
    const boundaries: SuspendedBoundary[] = []

    // Buffer shell + bootstrap into a string[] and flush as a single emit.
    // Per-emit overhead in renderToReadableStream is TextEncoder.encode +
    // controller.enqueue — each walkHost normally fires 3+ emits (opening
    // tag, per-attribute, closing bracket), which for a ~30-component tree
    // is ~100 stream-controller round-trips. Batching collapses those into
    // one encode and one enqueue per shell — measured ~2-4% of total SSR
    // time on CPU profiles.
    const shellChunks: string[] = []
    const bufferedEmit: Emit = (chunk) => {
      shellChunks.push(chunk)
    }

    // 1. Render the shell
    walk(children, {
      emit: bufferedEmit,
      onSuspend: (b) => boundaries.push(b),
      nextBoundaryId: () => state.nextId++,
    })

    // 2. Inject runtime + bootstrap scripts (once, after shell). Skip the
    // reveal/event-replay runtime when nothing needs it — no suspensions to
    // reveal and no bootstrap scripts to guard against early user input. That
    // keeps fully-static SSR responses byte-equivalent to a plain walk and
    // matches React's behavior where `renderToReadableStream` of a static
    // tree emits only the markup.
    const hasBootstrap =
      (options.bootstrapScripts?.length ?? 0) > 0 ||
      (options.bootstrapModules?.length ?? 0) > 0
    if (boundaries.length > 0 || hasBootstrap) {
      shellChunks.push(`<script${nonce ? ` nonce="${nonce}"` : ''}>${BOUNDARY_REVEAL_RUNTIME}</script>`)
      for (const s of options.bootstrapScripts ?? []) {
        shellChunks.push(bootstrapTag(s, 'script', nonce))
      }
      for (const m of options.bootstrapModules ?? []) {
        shellChunks.push(bootstrapTag(m, 'module', nonce))
      }
    }

    if (shellChunks.length) emit(shellChunks.join(''))

    // 3. Stream suspended boundaries as they resolve
    for (const b of boundaries) streamBoundary(b, emit, options, state)
    await drain(state)
  } catch (err) {
    state.errored = err
    if (options.onError) options.onError(err)
    throw err
  } finally {
    endSSR()
    uninstallSSRDispatcher()
    state.closed = true
  }
}

function streamBoundary(
  b: SuspendedBoundary,
  emit: Emit,
  options: StreamOptions,
  state: OrchestratorState,
): void {
  const task = (async () => {
    try {
      await b.thenable
    } catch (err) {
      if (options.onError) options.onError(err)
    }
    if (state.closed) return

    // Re-render the boundary's children into a string, restoring the
    // provider stack from when the boundary first suspended.
    const parts: string[] = []
    const sub: SuspendedBoundary[] = []
    const restore = applyContextSnapshot(b.contextSnapshot)
    try {
      walk(b.children, {
        emit: (s) => parts.push(s),
        onSuspend: (n) => sub.push(n),
        nextBoundaryId: () => state.nextId++,
      })
    } catch (err) {
      if (options.onError) options.onError(err)
      restore()
      return
    }
    restore()

    emit(`<div hidden id="S:${b.id}">${parts.join('')}</div>${revealScript(b.id, options.nonce)}`)

    // Recurse: any nested suspensions inside the now-revealed content
    for (const s of sub) streamBoundary(s, emit, options, state)
  })()
  state.pending.add(task)
  task.finally(() => state.pending.delete(task))
}

async function drain(state: OrchestratorState): Promise<void> {
  while (state.pending.size > 0) {
    await Promise.race(state.pending)
  }
}

function bootstrapTag(
  entry: string | { src: string; async?: boolean; nonce?: string },
  kind: 'script' | 'module',
  defaultNonce: string | undefined,
): string {
  const src = typeof entry === 'string' ? entry : entry.src
  const nonce = typeof entry === 'string' ? defaultNonce : entry.nonce ?? defaultNonce
  const nAttr = nonce ? ` nonce="${nonce}"` : ''
  if (kind === 'module') return `<script type="module"${nAttr} src="${src}"></script>`
  return `<script async${nAttr} src="${src}"></script>`
}

// ---------------------------------------------------------------------------
// Web Streams: renderToReadableStream
// ---------------------------------------------------------------------------

export function renderToReadableStream(
  children: ReactNode,
  options: StreamOptions = {},
): Promise<ReadableStreamResult> {
  const state: OrchestratorState = {
    nextId: 0,
    pending: new Set(),
    closed: false,
    errored: null,
  }
  const encoder = new TextEncoder()

  let allReadyResolve!: () => void
  let allReadyReject!: (e: unknown) => void
  const allReady = new Promise<void>((r, rej) => {
    allReadyResolve = r
    allReadyReject = rej
  })

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {}
      }

      streamHtml(children, emit, options, state).then(
        () => {
          try {
            controller.close()
          } catch {}
          allReadyResolve()
        },
        (err) => {
          try {
            controller.error(err)
          } catch {}
          allReadyReject(err)
        },
      )

      options.signal?.addEventListener('abort', () => {
        state.closed = true
        try {
          controller.close()
        } catch {}
      })
    },
  })

  return Promise.resolve(Object.assign(stream, { allReady }))
}

// ---------------------------------------------------------------------------
// Node Streams: renderToPipeableStream
// ---------------------------------------------------------------------------

export interface PipeableHandle {
  pipe<T extends NodeJS.WritableStream>(dest: T): T
  abort(reason?: unknown): void
}

export interface PipeableOptions extends StreamOptions {
  onShellReady?: () => void
  onShellError?: (err: unknown) => void
  onAllReady?: () => void
}

export function renderToPipeableStream(
  children: ReactNode,
  options: PipeableOptions = {},
): PipeableHandle {
  const state: OrchestratorState = {
    nextId: 0,
    pending: new Set(),
    closed: false,
    errored: null,
  }

  const buffers: string[] = []
  let dest: NodeJS.WritableStream | null = null
  let shellReady = false
  let finished = false
  let aborted = false

  const flushTo = (w: NodeJS.WritableStream) => {
    if (!buffers.length) return
    for (const b of buffers) w.write(b)
    buffers.length = 0
  }

  const emit: Emit = (chunk) => {
    if (aborted || finished) return
    if (dest) dest.write(chunk)
    else buffers.push(chunk)
  }

  // Kick off rendering
  streamHtml(children, emit, options, state).then(
    () => {
      finished = true
      if (dest) dest.end()
      options.onAllReady?.()
    },
    (err) => {
      if (!shellReady) {
        options.onShellError?.(err)
      } else {
        options.onError?.(err)
        if (dest) dest.end()
      }
    },
  )

  // We call onShellReady once the first synchronous emit has landed.
  // streamHtml above runs the shell synchronously before the first await in drain(),
  // so we can schedule onShellReady right after the first microtask.
  queueMicrotask(() => {
    if (aborted || finished) return
    shellReady = true
    options.onShellReady?.()
  })

  return {
    pipe<T extends NodeJS.WritableStream>(target: T): T {
      dest = target
      flushTo(target)
      if (finished) target.end()
      return target
    },
    abort(_reason?: unknown) {
      aborted = true
      state.closed = true
      if (dest) dest.end()
    },
  }
}
