import * as React from 'react'
import {
  type HydrationLabCase,
  type HydrationLabReport,
  getHydrationLabReport,
  getRuntimeSide,
  hydrationLabCases,
} from '../hydrationLab'

export function HydrationLab({ activeCase }: { activeCase: HydrationLabCase }) {
  const report = useHydrationLabReport()

  return (
    <div class="stack hydration-lab" data-lab-watch="lab-section">
      <div class="lab-tabs" aria-label="Hydration lab cases">
        {hydrationLabCases.map((item) => (
          <a class={item.id === activeCase.id ? 'active' : undefined} href={`/?lab=${item.id}`}>
            {item.title}
          </a>
        ))}
      </div>

      <div class="row">
        <span class="pill">case: {activeCase.id}</span>
        <span class="pill">expected: {activeCase.expectedScope}</span>
      </div>

      <p class="muted">{activeCase.summary}</p>

      <div class="lab-grid">
        <div class="stack">
          <LabExample activeCase={activeCase} />
        </div>
        <HydrationLabReportView report={report} />
      </div>
    </div>
  )
}

function LabExample({ activeCase }: { activeCase: HydrationLabCase }) {
  const [outerClicks, setOuterClicks] = React.useState(0)

  return (
    <div class="lab-shell stack" data-lab-watch="lab-shell">
      <div class="lab-sentinel" data-lab-watch="outer-before">
        Outer sibling before the recovery target
      </div>

      {renderCase(activeCase.id)}

      <div class="lab-sentinel row" data-lab-watch="outer-after">
        <span>Outer sibling after the recovery target</span>
        <button class="ghost" onClick={() => setOuterClicks((value) => value + 1)}>
          ping {outerClicks}
        </button>
      </div>
    </div>
  )
}

function renderCase(id: HydrationLabCase['id']) {
  switch (id) {
    case 'text':
      return <TextMismatchCase />
    case 'attr':
      return <AttributeMismatchCase />
    case 'suspense':
      return <SuspenseMismatchCase />
    case 'extension':
      return <ExtensionMutationCase />
    case 'document':
      return <DocumentMismatchCase />
    case 'none':
    default:
      return <CleanCase />
  }
}

function CleanCase() {
  return (
    <article class="lab-panel" data-lab-watch="clean-panel">
      <span class="lab-target" data-lab-watch="clean-target">
        Same server and client markup
      </span>
      <LabCounter watch="clean-counter" />
    </article>
  )
}

function TextMismatchCase() {
  const label = getRuntimeSide() === 'server' ? 'Server text' : 'Client text'

  return (
    <article class="lab-panel" data-lab-watch="text-panel">
      <span class="lab-target" data-lab-watch="text-target">
        {label}
      </span>
      <LabCounter watch="text-counter" />
    </article>
  )
}

function AttributeMismatchCase() {
  const side = getRuntimeSide()

  return (
    <article
      class="lab-panel"
      data-lab-watch="attr-panel"
      data-owned-attr={side === 'server' ? 'server-owned' : 'client-owned'}
      title={side === 'server' ? 'server title' : 'client title'}
    >
      <span class="lab-target" data-lab-watch="attr-target">
        Owned attrs differ, text stays stable
      </span>
      <LabCounter watch="attr-counter" />
    </article>
  )
}

function SuspenseMismatchCase() {
  return (
    <React.Suspense fallback={<div class="lab-panel muted">Suspense fallback</div>}>
      <div class="lab-panel" data-lab-watch="suspense-panel">
        <span class="lab-sentinel" data-lab-watch="suspense-before">
          Stable child before boundary mismatch
        </span>
        <span class="lab-target" data-lab-watch="suspense-target">
          {getRuntimeSide() === 'server' ? 'Server Suspense text' : 'Client Suspense text'}
        </span>
        <LabCounter watch="suspense-counter" />
      </div>
    </React.Suspense>
  )
}

function ExtensionMutationCase() {
  return (
    <article class="lab-panel" data-lab-watch="extension-panel" data-extension-target="">
      <span class="lab-target" data-lab-watch="extension-target">
        App-owned text that an extension did not render
      </span>
      <LabCounter watch="extension-counter" />
    </article>
  )
}

function DocumentMismatchCase() {
  return (
    <article class="lab-panel" data-lab-watch="document-panel">
      <span class="lab-target" data-lab-watch="document-target">
        Body child rendered as {getRuntimeSide()}
      </span>
      <LabCounter watch="document-counter" />
    </article>
  )
}

function LabCounter({ watch }: { watch: string }) {
  const [count, setCount] = React.useState(0)

  return (
    <div class="row" data-lab-watch={watch}>
      <button onClick={() => setCount((value) => value + 1)}>click {count}</button>
      <span class="muted">event handler check</span>
    </div>
  )
}

function HydrationLabReportView({ report }: { report: HydrationLabReport | null }) {
  const beforeNodes = report?.before?.nodes ?? []
  const afterNodes = report?.after?.nodes ?? []
  const afterById = new Map(afterNodes.map((node) => [node.id, node]))
  const rows = beforeNodes.slice(0, 12)

  return (
    <div class="lab-report stack" data-lab-watch="lab-report">
      <div class="row">
        <span class="pill">recoverable: {report?.errors.length ?? 0}</span>
        <span class="pill">status: {report?.after ? 'captured' : 'hydrating'}</span>
      </div>

      {report?.mutations.length ? (
        <ul class="muted" style="margin:0; padding-left: 1.1rem;">
          {report.mutations.map((item) => (
            <li>{item}</li>
          ))}
        </ul>
      ) : null}

      {report?.thrown ? <p class="danger">thrown: {report.thrown}</p> : null}

      <table class="lab-table">
        <thead>
          <tr>
            <th>watched node</th>
            <th>DOM</th>
            <th>after text</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((before) => {
            const after = afterById.get(before.id)
            const preserved = Boolean(before.token && after?.token === before.token)

            return (
              <tr>
                <td>{before.id}</td>
                <td class={preserved ? 'ok' : 'danger'}>
                  {preserved ? 'preserved' : after ? 'remounted' : 'removed'}
                </td>
                <td>{after?.text || '-'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <details>
        <summary class="muted">before body snapshot</summary>
        <pre class="lab-code">{report?.before?.bodyHtml ?? '(waiting)'}</pre>
      </details>
      <details>
        <summary class="muted">after body snapshot</summary>
        <pre class="lab-code">{report?.after?.bodyHtml ?? '(waiting)'}</pre>
      </details>
      {report?.errors.length ? (
        <details open>
          <summary class="muted">recoverable errors</summary>
          <pre class="lab-code">{report.errors.join('\n\n')}</pre>
        </details>
      ) : null}
    </div>
  )
}

function useHydrationLabReport(): HydrationLabReport | null {
  const [report, setReport] = React.useState<HydrationLabReport | null>(null)

  React.useEffect(() => {
    const update = () => setReport(cloneReport(getHydrationLabReport()))
    update()
    window.addEventListener('hydration-lab:update', update)
    return () => window.removeEventListener('hydration-lab:update', update)
  }, [])

  return report
}

function cloneReport(report: HydrationLabReport | null): HydrationLabReport | null {
  return report ? { ...report } : null
}
