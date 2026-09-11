import type { ReactNode } from '../core'
import {
  beginSSR,
  endSSR,
  applyContextSnapshot,
  currentSSRFrame,
  type SSRFrame,
} from './dispatcher'
import { walk, type SuspendedBoundary, type BrowserBailoutCallback } from './walk'
import { browserError, isBrowserToken, isBrowserError } from '../core/browser'
import { BOUNDARY_REVEAL_RUNTIME, revealScript } from './bootstrap-script'
import { escapeAttr, escapeScript } from './escape'
import { resourceURL } from '../core/resource-hints'
import type { ResourceScope } from './resource-hints'

export interface StreamOptions {
  identifierPrefix?: string
  nonce?: string | { script?: string; style?: string }
  bootstrapScriptContent?: string | ReadonlyArray<string>
  bootstrapScripts?: ReadonlyArray<string | { src: string; async?: boolean; nonce?: string }>
  bootstrapModules?: ReadonlyArray<string | { src: string; nonce?: string }>
  onError?: (error: unknown) => string | void
  onBrowserBailout?: BrowserBailoutCallback
  signal?: AbortSignal
  progressiveChunkSize?: number
}

export interface ReadableStreamResult extends ReadableStream<Uint8Array> {
  allReady: Promise<void>
}

export interface PipeableWritable {
  write(chunk: string): unknown
  end(): unknown
  destroy?(error?: unknown): unknown
}

export interface OrchestratorState {
  nextId: number
  pending: Set<Promise<void>>
  closed: boolean
  errored: unknown | null
  aborted: boolean
  reason: unknown
  abort: (reason?: unknown) => void
  cancelled: Promise<void>
  onShellReady?: () => void
  frame?: SSRFrame
}

function createState(): OrchestratorState {
  let wake!: () => void
  const state: OrchestratorState = {
    nextId: 0, pending: new Set(), closed: false, errored: null,
    aborted: false, reason: undefined,
    cancelled: new Promise<void>((resolve) => { wake = resolve }),
    abort(reason) {
      if (state.closed || state.aborted) return
      state.aborted = true
      state.reason = isBrowserToken(reason) ? browserError(reason) : reason ?? new Error('The render was aborted by the server without a reason.')
      wake()
    },
  }
  return state
}

type Emit = (chunk: string) => void

export async function streamHtml(
  children: ReactNode,
  emit: Emit,
  options: StreamOptions,
  state: OrchestratorState,
): Promise<void> {
  const nonce = scriptNonce(options)

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
    let head = 0
    const bufferedEmit: Emit = (chunk) => {
      shellChunks.push(chunk)
    }

    // 1. Render the shell. A root-level `use(promise)` has no Suspense
    // boundary to capture it, but App Router SSR commonly suspends at this
    // level while resolving the RSC stream. Wait and retry without leaking
    // partial shell chunks or boundary ids from the aborted attempt.
    let shellRendered = false
    let rootRetries = 0
    let resources: SSRFrame['resources']
    while (!shellRendered) {
      const chunkCount = shellChunks.length
      const boundaryCount = boundaries.length
      const nextId = state.nextId
      head = 0
      const previous = beginSSR(options.identifierPrefix)
      currentSSRFrame().styleNonce = typeof options.nonce === 'object' ? options.nonce?.style : undefined
      if (resources) currentSSRFrame().resources = resources
      let suspended: Promise<unknown> | undefined
      try {
        if (state.aborted) throw state.reason
        walk(children, {
          emit: bufferedEmit,
          onSuspend: (b) => boundaries.push(b),
          nextBoundaryId: () => state.nextId++,
          onBrowserBailout: options.onBrowserBailout,
          onHead: () => { head = shellChunks.length },
        })
        shellRendered = true
        state.frame = currentSSRFrame()
      } catch (err) {
        shellChunks.length = chunkCount
        boundaries.length = boundaryCount
        state.nextId = nextId
        if (!isThenable(err)) throw err
        if (++rootRetries > 50) {
          throw new Error('renderToReadableStream exceeded 50 root suspension retries.')
        }
        suspended = err
      } finally {
        resources = currentSSRFrame().resources
        endSSR(previous)
      }
      if (suspended) await Promise.race([suspended, state.cancelled])
    }

    const hints = state.frame?.resources?.drain()
    if (hints) shellChunks.splice(head, 0, hints)
    if (state.frame) state.frame.shellFlushed = true

    // 2. Inject runtime + bootstrap scripts (once, after shell). Skip the
    // reveal/event-replay runtime when nothing needs it — no suspensions to
    // reveal and no bootstrap scripts to guard against early user input. That
    // keeps fully-static SSR responses byte-equivalent to a plain walk and
    // matches React's behavior where `renderToReadableStream` of a static
    // tree emits only the markup.
    const hasBootstrap =
      bootstrapScriptContentToArray(options.bootstrapScriptContent).length > 0 ||
      (options.bootstrapScripts?.length ?? 0) > 0 ||
      (options.bootstrapModules?.length ?? 0) > 0
    if (boundaries.length > 0 || hasBootstrap) {
      shellChunks.push(`<script${nonce ? ` nonce="${escapeAttr(nonce)}"` : ''}>${BOUNDARY_REVEAL_RUNTIME}</script>`)
      for (const content of bootstrapScriptContentToArray(options.bootstrapScriptContent)) {
        shellChunks.push(inlineBootstrapTag(content, nonce))
      }
      for (const s of options.bootstrapScripts ?? []) {
        shellChunks.push(bootstrapTag(s, 'script', nonce))
      }
      for (const m of options.bootstrapModules ?? []) {
        shellChunks.push(bootstrapTag(m, 'module', nonce))
      }
    }

    if (shellChunks.length) emit(normalizeDocumentShell(shellChunks.join('')))
    state.onShellReady?.()

    // 3. Stream suspended boundaries as they resolve
    for (const b of boundaries) streamBoundary(b, emit, options, state)
    await drain(state)
  } catch (err) {
    if (isBrowserError(err)) {
      err = new Error('The server render could not complete because client rendering was requested outside a Suspense boundary.',
        Object.hasOwn(err, 'cause') ? { cause: err.cause } : undefined)
    }
    state.errored = err
    if (options.onError) options.onError(err)
    throw err
  } finally {
    state.closed = true
  }
}

function streamBoundary(
  b: SuspendedBoundary,
  emit: Emit,
  options: StreamOptions,
  state: OrchestratorState,
): void {
  const nonce = scriptNonce(options)
  const task = (async () => {
    try {
      await Promise.race([b.thenable, state.cancelled])
    } catch {}
    if (state.closed) return

    const defer = (error: unknown) => {
      if (isBrowserError(error)) options.onBrowserBailout?.(error, { componentStack: (error as any).componentStack || b.componentStack })
      else options.onError?.(error)
      emit(`<script${nonce ? ` nonce="${escapeAttr(nonce)}"` : ''}>$RB(${b.id}${isBrowserError(error) ? '' : ',1'})</script>`)
    }
    if (state.aborted) { defer(state.reason); return }

    // Re-render the boundary's children into a string, restoring the
    // provider stack from when the boundary first suspended.
    const parts: string[] = []
    const sub: SuspendedBoundary[] = []
    const resourceScope: ResourceScope = {}
    let styles: string[][] | undefined
    const previous = beginSSR(options.identifierPrefix, state.frame)
    state.frame?.resources?.takeStylesheets()
    const restore = applyContextSnapshot(b.contextSnapshot)
    try {
      walk(b.children, {
        emit: (s) => parts.push(s),
        onSuspend: (n) => sub.push(n),
        nextBoundaryId: () => state.nextId++,
        onBrowserBailout: options.onBrowserBailout,
        componentStack: b.componentStack,
        resourceScope,
      })
      state.frame?.resources?.mergeScope(resourceScope)
    } catch (err) {
      if (isThenable(err)) {
        streamBoundary({ ...b, thenable: err }, emit, options, state)
      } else defer(err)
      return
    } finally {
      restore()
      endSSR(previous)
      const hints = state.frame?.resources?.drain()
      styles = state.frame?.resources?.takeStylesheets()
      if (hints) emit(hints)
    }

    emit(`<div hidden id="S:${b.id}">${parts.join('')}</div>${revealScript(b.id, nonce, styles)}`)

    // Recurse: any nested suspensions inside the now-revealed content
    for (const s of sub) streamBoundary(s, emit, options, state)
  })()
  state.pending.add(task)
  task.then(() => state.pending.delete(task), () => state.pending.delete(task))
}

async function drain(state: OrchestratorState): Promise<void> {
  while (state.pending.size > 0) {
    await Promise.race(state.pending)
  }
}

function isThenable(value: unknown): value is Promise<unknown> {
  return !!value && typeof (value as { then?: unknown }).then === 'function'
}

function scriptNonce(options: StreamOptions): string | undefined {
  return typeof options.nonce === 'string' ? options.nonce : options.nonce?.script
}

function bootstrapScriptContentToArray(
  content: StreamOptions['bootstrapScriptContent'],
): string[] {
  if (content === undefined) return []
  return typeof content === 'string' ? [content] : [...content]
}

function inlineBootstrapTag(content: string, defaultNonce: string | undefined): string {
  const nAttr = defaultNonce ? ` nonce="${escapeAttr(defaultNonce)}"` : ''
  return `<script${nAttr}>${escapeScript(content)}</script>`
}

function normalizeDocumentShell(html: string): string {
  const doctypeIndex = html.indexOf('<!DOCTYPE html><html')
  if (doctypeIndex <= 0) return html

  const headPrefix = html.slice(0, doctypeIndex)
  if (!isHeadPrefix(headPrefix)) return html

  const documentHtml = html.slice(doctypeIndex)
  const headOpen = documentHtml.match(/<head(?:\s[^>]*)?>/)
  if (!headOpen || headOpen.index === undefined) return html

  const insertAt = headOpen.index + headOpen[0].length
  return documentHtml.slice(0, insertAt) + headPrefix + documentHtml.slice(insertAt)
}

function isHeadPrefix(value: string): boolean {
  if (!value) return false
  return stripLeadingHeadTags(value).trim() === ''
}

function stripLeadingHeadTags(value: string): string {
  let rest = value
  let changed = true
  while (changed) {
    changed = false
    const next = rest.replace(
      /^\s*(?:<meta\b[^>]*>|<link\b[^>]*>|<base\b[^>]*>|<title\b[^>]*>[\s\S]*?<\/title>|<style\b[^>]*>[\s\S]*?<\/style>|<script\b[^>]*>[\s\S]*?<\/script>)/i,
      '',
    )
    if (next !== rest) {
      rest = next
      changed = true
    }
  }
  return rest
}

function bootstrapTag(
  entry: string | { src: string; async?: boolean; nonce?: string },
  kind: 'script' | 'module',
  defaultNonce: string | undefined,
): string {
  const src = escapeAttr(resourceURL(typeof entry === 'string' ? entry : entry.src))
  const nonce = typeof entry === 'string' ? defaultNonce : entry.nonce ?? defaultNonce
  const nAttr = nonce ? ` nonce="${escapeAttr(nonce)}"` : ''
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
  const state = createState()
  const encoder = new TextEncoder()
  let abortListener: (() => void) | undefined
  const detachAbortListener = () => {
    if (abortListener) {
      options.signal?.removeEventListener('abort', abortListener)
      abortListener = undefined
    }
  }

  let allReadyResolve!: () => void
  let allReadyReject!: (e: unknown) => void
  const allReady = new Promise<void>((r, rej) => {
    allReadyResolve = r
    allReadyReject = rej
  })
  // Shell failures reject the outer promise before callers receive allReady.
  allReady.catch(() => {})
  let shellResolve!: (stream: ReadableStreamResult) => void
  let shellReject!: (error: unknown) => void
  const shell = new Promise<ReadableStreamResult>((resolve, reject) => {
    shellResolve = resolve
    shellReject = reject
  })
  state.onShellReady = () => queueMicrotask(() => shellResolve(Object.assign(stream, { allReady })))

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {}
      }

      if (options.signal) {
        abortListener = () => {
          detachAbortListener()
          state.abort(options.signal!.reason)
        }
        options.signal.addEventListener('abort', abortListener)
        if (options.signal.aborted) abortListener()
      }

      streamHtml(children, emit, options, state).then(
        () => {
          detachAbortListener()
          try {
            controller.close()
          } catch {}
          allReadyResolve()
        },
        (err) => {
          detachAbortListener()
          try {
            controller.error(err)
          } catch {}
          allReadyReject(err)
          shellReject(err)
        },
      )

    },
    cancel(reason) {
      state.abort(reason)
      detachAbortListener()
    },
  })

  return shell
}

// ---------------------------------------------------------------------------
// Node Streams: renderToPipeableStream
// ---------------------------------------------------------------------------

export interface PipeableHandle {
  pipe<T extends PipeableWritable>(dest: T): T
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
  const state = createState()

  const buffers: string[] = []
  let dest: PipeableWritable | null = null
  let shellReady = false
  let shellFailed = false
  let finished = false
  let failed = false
  let failure: unknown

  const finishDestination = (target: PipeableWritable) => {
    if (failed && target.destroy) target.destroy(failure)
    else target.end()
  }

  const flushTo = (w: PipeableWritable) => {
    if (!buffers.length) return
    for (const b of buffers) w.write(b)
    buffers.length = 0
  }

  const emit: Emit = (chunk) => {
    if (finished) return
    if (dest) dest.write(chunk)
    else buffers.push(chunk)
  }

  state.onShellReady = () => queueMicrotask(() => {
    if (shellFailed) return
    shellReady = true
    options.onShellReady?.()
  })

  // Kick off rendering
  streamHtml(children, emit, options, state).then(
    () => {
      finished = true
      if (dest) dest.end()
      options.onAllReady?.()
    },
    (err) => {
      finished = true
      failed = true
      failure = err
      if (!shellReady) {
        shellFailed = true
        options.onShellError?.(err)
      } else {
        if (dest) finishDestination(dest)
      }
    },
  )

  return {
    pipe<T extends PipeableWritable>(target: T): T {
      dest = target
      if (!failed) flushTo(target)
      if (finished) finishDestination(target)
      return target
    },
    abort(reason?: unknown) {
      state.abort(reason)
    },
  }
}
