import { hydrateRoot } from 'react-dom/client'
import App from './App'
import {
  type HydrationLabDomSnapshot,
  type HydrationLabNodeSnapshot,
  type HydrationLabReport,
  getHydrationLabCase,
  getHydrationLabReport,
  setHydrationLabReport,
} from './hydrationLab'

const url = window.location.href
const labCase = getHydrationLabCase(url)
const labReport = setupHydrationLab(labCase.id)

try {
  hydrateRoot(document, <App url={url} />, {
    onRecoverableError: (error) => {
      if (labReport) labReport.errors.push(formatError(error))
      console.warn(error)
    },
  })
} catch (error) {
  if (labReport) labReport.thrown = formatError(error)
  else throw error
}

if (labReport) {
  scheduleHydrationLabCapture(labReport)
}

function setupHydrationLab(caseId: HydrationLabReport['caseId']): HydrationLabReport {
  const existing = getHydrationLabReport()
  if (existing?.caseId === caseId && existing.before) return existing

  const report: HydrationLabReport = {
    caseId,
    before: null,
    after: null,
    errors: [],
    mutations: [],
    thrown: null,
  }

  setHydrationLabReport(report)

  if (caseId === 'extension') {
    const target = document.querySelector('[data-extension-target]')
    if (target) {
      const injected = document.createElement('span')
      injected.setAttribute('data-lab-watch', 'extension-injected')
      injected.className = 'lab-sentinel'
      injected.textContent = 'Injected before hydrateRoot'
      target.insertBefore(injected, target.firstChild)
      report.mutations.push('Inserted a foreign element into the app-owned subtree.')
    }
  }

  report.before = captureHydrationLabDom('before')
  return report
}

function captureHydrationLabDom(phase: HydrationLabDomSnapshot['phase']): HydrationLabDomSnapshot {
  return {
    phase,
    bodyHtml: compactHtml(document.body.innerHTML),
    nodes: Array.from(document.querySelectorAll<HTMLElement>('[data-lab-watch]')).map((node, index) =>
      captureNode(node, index, phase),
    ),
  }
}

function scheduleHydrationLabCapture(report: HydrationLabReport): void {
  for (const delay of [0, 50, 200, 600]) {
    setTimeout(() => {
      report.after = captureHydrationLabDom('after')
      window.dispatchEvent(new CustomEvent('hydration-lab:update'))
    }, delay)
  }
}

function captureNode(
  node: HTMLElement,
  index: number,
  phase: HydrationLabDomSnapshot['phase'],
): HydrationLabNodeSnapshot {
  const id = node.getAttribute('data-lab-watch') || `watch-${index}`
  let token = node.getAttribute('data-lab-token')

  if (!token && phase === 'before') {
    token = `${id}:${index}`
    node.setAttribute('data-lab-token', token)
  }

  return {
    id,
    token,
    text: compactText(node.textContent || ''),
    html: compactHtml(node.outerHTML),
  }
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 180)
}

function compactHtml(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 900)
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
