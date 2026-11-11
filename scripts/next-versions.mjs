// Pin every tested release. A newer release needs its own matrix run.
export const nextVersions = ['15.5.28', '16.0.11', '16.1.7', '16.2.12', '16.3.8', '16.4.3']
export const nextModes = [[], ['--webpack'], ['--production'], ['--production', '--webpack']]

export const nextRenderings = version => Number(version.split('.')[0]) >= 16 ? ['standard', 'cache-components'] : ['standard']

export function nextScenarios(version, mode, deployment, rendering) {
  if (deployment === 'static-export') return ['static-export']
  return [
    'hydration', 'ids', 'actions', 'direct-actions', 'progressive-actions', 'streaming', 'flight-promise',
    ...(rendering === 'cache-components' ? ['cache-components'] : []),
    'pages-router', ...(mode === 'development' ? ['fast-refresh'] : []),
    'routing', 'boundaries', 'loading-cancellation', 'navigation-cancellation',
    'parallel-routes', 'mutations', 'components', 'pages-data', 'error-boundaries', 'server-runtime',
  ]
}
