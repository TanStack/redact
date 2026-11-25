export function vinextMatrix(deployments = ['node', 'standalone', 'static-export', 'workers']) {
  const jobs = []
  for (const deployment of deployments) for (const reference of [true, false]) {
    for (const rendering of deployment === 'static-export' ? ['standard'] : ['standard', 'cache-components']) {
      for (const mode of ['node', 'workers'].includes(deployment) ? ['development', 'production'] : ['production']) {
        const renderer = reference ? 'react' : 'redact'
        const name = deployment === 'static-export' ? `${renderer}-production-static-export` : `${renderer}-${mode}-${rendering}${deployment === 'node' ? '' : '-' + deployment}`
        jobs.push({ name, deployment, reference, rendering, mode, basePath: ['standalone', 'static-export'].includes(deployment) ? '/coverage' : '' })
      }
    }
  }
  return jobs
}

export const edgeScenarios = ['transition-retains-visible-content', 'deferred-search-retains-stale-results', 'uncontrolled-select-action-reset']
export function vinextScenarios(job) {
  if (job.deployment === 'static-export') return ['static-export']
  return ['hydration', 'ids', 'actions', 'direct-actions', 'progressive-actions', 'streaming', 'flight-promise', 'pages-router', 'routing', 'boundaries', 'loading-cancellation', 'navigation-cancellation', 'parallel-routes', 'mutations', 'components', 'pages-data', 'error-boundaries', 'server-runtime', ...edgeScenarios,
    ...(job.rendering === 'cache-components' ? ['cache-components'] : []), ...(job.mode === 'development' ? ['fast-refresh'] : [])]
}
