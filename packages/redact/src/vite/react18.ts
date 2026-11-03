import MagicString from 'magic-string'

// Only these owned modules differ between React's public element protocols.
// Run after Vite's TypeScript transform, before bundling and minification.
const editsPerModule: Record<string, number> = {
  'core/types': 1,
  'react/context': 2,
  'react/index': 2,
  'dom/index': 2,
  'dom/features/context/full': 1,
  'dom/features/context/stub': 1,
  'server/walk': 1,
}

export function adaptReact18(code: string, id: string, module: string, version: string, parse: (code: string) => any) {
  const expected = editsPerModule[module]
  if (!expected) return null
  const output = new MagicString(code)
  let edits = 0
  function visit(node: any): void {
    if (!node || typeof node !== 'object') return
    let replacement: string | undefined
    if (node.type === 'Literal') {
      if (module === 'core/types' && node.value === 'react.transitional.element') replacement = JSON.stringify('react.element')
    }
    if ((module === 'react/index' || module === 'dom/index')
      && ((node.type === 'VariableDeclarator' && node.id?.name === 'version')
        || (node.type === 'Property' && node.key?.name === 'version'))) {
      const value = node.init ?? node.value
      if (value?.type === 'Literal' && typeof value.value === 'string') {
        output.overwrite(value.start, value.end, JSON.stringify(version))
        edits++
        return
      }
    }
    if (module === 'react/context' && node.type === 'CallExpression'
      && node.callee?.object?.name === 'Symbol' && node.callee?.property?.name === 'for'
      && node.arguments?.[0]?.value === 'react.consumer') replacement = 'REACT_CONTEXT_TYPE'
    if (module === 'react/context' && node.type === 'FunctionDeclaration' && node.id?.name === 'createContext') {
      if (node.params?.[0]?.name !== 'defaultValue') throw new Error('React 18 adaptation failed: createContext signature changed')
      // React 18 consumers are context objects, not callable components.
      output.overwrite(node.body.start, node.body.end, `{
        const context = { $$typeof: REACT_CONTEXT_TYPE, _currentValue: defaultValue };
        context.Provider = { $$typeof: REACT_PROVIDER_TYPE, _context: context };
        context.Consumer = context._context = context;
        return context;
      }`)
      edits++
      return
    }
    // React 18 uses react.context for consumers, not providers.
    if ((module.startsWith('dom/features/context/') || module === 'server/walk')
      && node.type === 'BinaryExpression' && node.operator === '==='
      && node.left?.name === 'marker' && node.right?.name === 'REACT_CONTEXT_TYPE') {
      replacement = 'false'
    }
    if (replacement !== undefined) {
      // A pure-call annotation no longer applies when a call becomes a symbol.
      for (const annotation of node._rollupAnnotations ?? []) {
        if (annotation.type === 'pure') output.remove(annotation.start, annotation.end)
      }
      output.overwrite(node.start, node.end, replacement)
      edits++
      return
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit)
      else if (value && typeof value === 'object') visit(value)
    }
  }
  visit(parse(code))
  if (edits !== expected) throw new Error(`React 18 adaptation failed for ${module}: expected ${expected} protocol edits, found ${edits}`)
  return { code: output.toString(), map: output.generateMap({ source: id, includeContent: true, hires: true }) }
}
