import { isFunction, isThenable } from '../core/functions'
import type { ReactNode } from '../core'
import {
  beginSSR,
  applyContextSnapshot,
  currentSSRFrame,
  type SSRFrame,
} from './dispatcher'
import { walk, type SuspendedBoundary, type BrowserBailoutCallback } from './walk'
import { browserError, isBrowserToken, isBrowserError } from '../core/browser'
import { injectBootstrapScript, inlineScript, revealScript } from './bootstrap-script'
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
  pending: (task?: Promise<void>) => Promise<void> | undefined
  closed: boolean
  aborted: boolean
  reason: unknown
  abort: (reason?: unknown) => void
  cancelled: Promise<void>
  onShellReady?: () => void
}

function createState(): OrchestratorState {
  let wake!: () => void
  let count = 0, notify: (() => void) | undefined, failed: unknown[] | undefined
  const settled = () => { count--; notify?.() }
  const rejected = (error: unknown) => {
    // An empty box marks a consumed failure without retaining it or accepting later failures.
    failed ||= [error]
    settled()
  }
  const state: OrchestratorState = {
    pending(task) {
      if (task) {
        count++
        task.then(settled, rejected)
      } else if (failed?.length) return Promise.reject(failed.pop())
      else if (count) return new Promise<void>(resolve => { notify = resolve })
    }, closed: false,
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
    const shellErrors: unknown[] = []
    let rootRetries = 0
    let resources: SSRFrame['resources']
    let frame: SSRFrame
    for (;;) {
      const restore = beginSSR(options.identifierPrefix)
      frame = currentSSRFrame()
      frame.styleNonce = typeof options.nonce === 'object' ? options.nonce?.style : undefined
      if (resources) frame.resources = resources
      let suspended: Promise<unknown>
      try {
        if (state.aborted) throw state.reason
        walk(children, {
          emit: bufferedEmit,
          onSuspend: (b) => boundaries.push(b),
          onBrowserBailout: options.onBrowserBailout,
          onError: error => { shellErrors.push(error) },
          onHead: () => { head = shellChunks.length },
        })
        break
      } catch (err) {
        shellChunks.length = boundaries.length = shellErrors.length = head = 0
        if (!isThenable(err)) throw err
        if (++rootRetries > 50) {
          throw new Error('renderToReadableStream exceeded 50 root suspension retries.')
        }
        frame.resources?.discardMetas()
        suspended = err
      } finally {
        resources = frame.resources
        restore()
      }
      await Promise.race([suspended, state.cancelled])
    }
    for (const error of shellErrors) options.onError?.(error)

    const hints = frame.resources?.drain()
    if (hints) shellChunks.splice(head, 0, hints)
    frame.shellFlushed = true

    // 2. Inject runtime + bootstrap scripts (once, after shell). Skip the
    // reveal/event-replay runtime when nothing needs it — no suspensions to
    // reveal and no bootstrap scripts to guard against early user input. That
    // keeps fully-static SSR responses byte-equivalent to a plain walk and
    // matches React's behavior where `renderToReadableStream` of a static
    // tree emits only the markup.
    const content = options.bootstrapScriptContent
    const inlineScripts = content === undefined ? [] : typeof content === 'string' ? [content] : [...content]
    if (boundaries.length || inlineScripts.length || options.bootstrapScripts?.length || options.bootstrapModules?.length) {
      shellChunks.push(injectBootstrapScript(nonce))
      for (const content of inlineScripts) {
        shellChunks.push(inlineScript(escapeScript(content), nonce))
      }
      for (const s of options.bootstrapScripts ?? []) {
        shellChunks.push(bootstrapTag(s, false, nonce))
      }
      for (const m of options.bootstrapModules ?? []) {
        shellChunks.push(bootstrapTag(m, true, nonce))
      }
    }

    if (shellChunks.length) emit(normalizeDocumentShell(shellChunks.join('')))
    shellChunks.length = 0
    if (state.onShellReady) queueMicrotask(state.onShellReady)

    // 3. Stream suspended boundaries as they resolve
    for (const b of boundaries) streamBoundary(b, emit, options, state, frame)
    for (let next; (next = state.pending());) await next
  } catch (err) {
    if (isBrowserError(err)) {
      err = new Error('The server render could not complete because client rendering was requested outside a Suspense boundary.',
        Object.hasOwn(err, 'cause') ? { cause: err.cause } : undefined)
    }
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
  frame: SSRFrame,
): void {
  const nonce = scriptNonce(options)
  const task = (async () => {
    try {
      await Promise.race([b[2], state.cancelled])
    } catch {}
    if (state.closed) return

    const defer = (error: unknown) => {
      const browser = isBrowserError(error)
      if (browser) options.onBrowserBailout?.(error, { componentStack: (error as any).componentStack || b[4] })
      else options.onError?.(error)
      emit(inlineScript(`$RB(${b[0]}${browser ? '' : ',1'})`, nonce))
    }
    if (state.aborted) { defer(state.reason); return }

    // Re-render the boundary's children into a string, restoring the
    // provider stack from when the boundary first suspended.
    const parts: string[] = []
    const sub: SuspendedBoundary[] = []
    const resourceScope: ResourceScope = [b[0]]
    let styles: string[][] | undefined
    const restore = beginSSR(options.identifierPrefix, frame)
    frame.resources?.takeStylesheets()
    applyContextSnapshot(b[3])
    try {
      walk(b[1], {
        emit: (s) => parts.push(s),
        onSuspend: (n) => sub.push(n),
        onBrowserBailout: options.onBrowserBailout,
          onError: options.onError,
        componentStack: b[4],
        inFallback: b[6],
      }, b[5], resourceScope)
      frame.resources?.mergeScope(resourceScope)
    } catch (err) {
      if (isThenable(err)) {
        b[2] = err
        streamBoundary(b, emit, options, state, frame)
      } else defer(err)
      return
    } finally {
      restore()
      const resources = frame.resources
      const hints = resources?.drain()
      styles = resources?.takeStylesheets()
      if (hints) emit(hints)
    }

    emit(`<div hidden id="S:${b[0]}">${parts.join('')}</div>${revealScript(b[0], nonce, styles)}`)

    // Recurse: any nested suspensions inside the now-revealed content
    for (const s of sub) streamBoundary(s, emit, options, state, frame)
  })()
  state.pending(task)
}

function scriptNonce(options: StreamOptions): string | undefined {
  return typeof options.nonce === 'string' ? options.nonce : options.nonce?.script
}

function normalizeDocumentShell(html: string): string {
  const doctypeIndex = html.indexOf('<!DOCTYPE html><html')
  if (doctypeIndex <= 0) return html

  const headPrefix = html.slice(0, doctypeIndex)
  if (!isHeadPrefix(headPrefix)) return html

  const documentHtml = html.slice(doctypeIndex)
  const headOpen = documentHtml.match(/<head(?:\s[^>]*)?>/)
  if (!headOpen) return html

  const insertAt = headOpen.index! + headOpen[0].length
  return documentHtml.slice(0, insertAt) + headPrefix + documentHtml.slice(insertAt)
}

function isHeadPrefix(value: string): boolean {
  for (;;) {
    const rest = value.replace(/^\s*<(?:(?:meta|link|base)\b[^>]*>|(title|style|script)\b[^>]*>[\s\S]*?<\/\1>)/i, '')
    if (rest === value) return !value.trim()
    value = rest
  }
}

function bootstrapTag(
  entry: string | { src: string; async?: boolean; nonce?: string },
  module: boolean,
  defaultNonce: string | undefined,
): string {
  const src = escapeAttr(resourceURL(typeof entry === 'string' ? entry : entry.src))
  const nonce = typeof entry === 'string' ? defaultNonce : entry.nonce ?? defaultNonce
  const nAttr = nonce ? ` nonce="${escapeAttr(nonce)}"` : ''
  return `<script ${module ? 'type="module"' : 'async'}${nAttr} src="${src}"></script>`
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
  const signal = options.signal
  const detachAbortListener = () => signal?.removeEventListener('abort', abortFromSignal)
  const abortFromSignal = () => {
    detachAbortListener()
    state.abort(signal!.reason)
  }

  let allReady!: Promise<void>
  let shellResolve!: (stream: ReadableStreamResult) => void
  let shellReject!: (error: unknown) => void
  const shell = new Promise<ReadableStreamResult>((resolve, reject) => {
    shellResolve = resolve
    shellReject = reject
  })
  state.onShellReady = () => shellResolve(Object.assign(stream, { allReady }))

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {}
      }

      signal?.addEventListener('abort', abortFromSignal)
      if (signal?.aborted) abortFromSignal()

      allReady = streamHtml(children, emit, options, state).then(
        () => {
          detachAbortListener()
          try {
            controller.close()
          } catch {}
        },
        (error) => {
          detachAbortListener()
          try {
            controller.error(error)
          } catch {}
          shellReject(error)
          throw error
        },
      )
      // A shell failure reaches the caller before it can observe allReady.
      allReady.catch(() => {})
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
  // 0 while rendering, 1 on success, 2 on failure.
  let status = 0
  let failure: unknown

  const finishDestination = (target: PipeableWritable) => {
    if (status === 2 && target.destroy) target.destroy(failure)
    else target.end()
  }

  const emit: Emit = (chunk) => {
    if (status) return
    if (dest) dest.write(chunk)
    else buffers.push(chunk)
  }

  state.onShellReady = () => {
    shellReady = true
    options.onShellReady?.()
  }

  // Kick off rendering
  streamHtml(children, emit, options, state).then(
    () => {
      status = 1
      if (dest) finishDestination(dest)
      options.onAllReady?.()
    },
    (err) => {
      status = 2
      failure = err
      if (!shellReady) options.onShellError?.(err)
      else if (dest) finishDestination(dest)
    },
  )

  return {
    pipe<T extends PipeableWritable>(target: T): T {
      dest = target
      if (status !== 2) {
        for (const chunk of buffers) target.write(chunk)
        buffers.length = 0
      }
      if (status) finishDestination(target)
      return target
    },
    abort: state.abort,
  }
}
