export type HydrationLabCaseId =
  | 'none'
  | 'text'
  | 'attr'
  | 'suspense'
  | 'extension'
  | 'document'

export interface HydrationLabCase {
  id: HydrationLabCaseId
  title: string
  summary: string
  expectedScope: string
}

export interface HydrationLabNodeSnapshot {
  id: string
  token: string | null
  text: string
  html: string
}

export interface HydrationLabDomSnapshot {
  phase: 'before' | 'after'
  bodyHtml: string
  nodes: HydrationLabNodeSnapshot[]
}

export interface HydrationLabReport {
  caseId: HydrationLabCaseId
  before: HydrationLabDomSnapshot | null
  after: HydrationLabDomSnapshot | null
  errors: string[]
  mutations: string[]
  thrown: string | null
}

declare global {
  interface Window {
    __HYDRATION_LAB__?: HydrationLabReport
  }
}

const hydrationLabReportKey = Symbol.for('tanstack.redact.hydrationLab')

export const hydrationLabCases: HydrationLabCase[] = [
  {
    id: 'none',
    title: 'Clean hydration',
    summary: 'Server and client output match. Watched nodes should keep their DOM tokens.',
    expectedScope: 'No recovery',
  },
  {
    id: 'text',
    title: 'Host text mismatch',
    summary: 'A server/client text branch differs inside one host subtree.',
    expectedScope: 'Nearest safe host subtree',
  },
  {
    id: 'attr',
    title: 'Owned attribute mismatch',
    summary: 'The same element renders different owned attributes on the server and client.',
    expectedScope: 'Nearest safe host subtree',
  },
  {
    id: 'suspense',
    title: 'Suspense boundary mismatch',
    summary: 'A mismatch occurs inside a resolved Suspense boundary.',
    expectedScope: 'Suspense marker range',
  },
  {
    id: 'extension',
    title: 'Pre-hydration DOM mutation',
    summary: 'The client mutates server HTML before hydrateRoot, like a browser extension could.',
    expectedScope: 'Nearest safe host subtree',
  },
  {
    id: 'document',
    title: 'Document body mismatch',
    summary: 'A top-level body child differs while hydrateRoot(document, <html />) is running.',
    expectedScope: 'Body children, preserving <head>',
  },
]

export function getHydrationLabCase(url?: string): HydrationLabCase {
  const raw = getSearchParam(url, 'lab')
  return hydrationLabCases.find((item) => item.id === raw) ?? hydrationLabCases[0]
}

export function getRuntimeSide(): 'server' | 'client' {
  return typeof window === 'undefined' ? 'server' : 'client'
}

export function getHydrationLabReport(): HydrationLabReport | null {
  return ((globalThis as any)[hydrationLabReportKey] as HydrationLabReport | undefined) ?? null
}

export function setHydrationLabReport(report: HydrationLabReport): void {
  ;(globalThis as any)[hydrationLabReportKey] = report

  if (typeof window !== 'undefined') {
    window.__HYDRATION_LAB__ = report
  }
}

function getSearchParam(url: string | undefined, key: string): string | null {
  try {
    const parsed = new URL(url || '/', 'http://localhost')
    return parsed.searchParams.get(key)
  } catch {
    return null
  }
}
