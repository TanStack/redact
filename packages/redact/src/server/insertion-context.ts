import { escapeAttr } from './escape'

// The context belongs to the *parent* of a suspended subtree. It must survive
// retries: looking at the first resolved child cannot recover HTML insertion mode.
export type InsertionContext = 'html' | 'svg' | 'math' | 'mtext' | 'table' | 'tbody' | 'tr' | 'colgroup'

export function childInsertionContext(tag: string, props: Record<string, any>, parent: InsertionContext): InsertionContext {
  if (tag === 'svg') return 'svg'
  if (tag === 'math') return 'math'
  if ((parent === 'svg' && (tag === 'foreignObject' || tag === 'desc' || tag === 'title')) || (tag === 'annotation-xml' && /^(text\/html|application\/xhtml\+xml)$/i.test(props.encoding ?? ''))) return 'html'
  // WHATWG tree-construction dispatcher: MathML text integration points use
  // HTML rules except for mglyph/malignmark. Keep that mixed context on retries.
  if (parent === 'math' && /^(mi|mo|mn|ms|mtext)$/.test(tag)) return 'mtext'
  if (parent === 'mtext' && (tag === 'mglyph' || tag === 'malignmark')) return 'math'
  if (parent === 'svg' || parent === 'math') return parent
  if (tag === 'table' || tag === 'tr' || tag === 'colgroup') return tag
  if (tag === 'tbody' || tag === 'thead' || tag === 'tfoot') return 'tbody'
  return 'html'
}

export function segmentHtml(content: string, id: string, context: InsertionContext): string {
  const mathText = context === 'mtext'
  const nested = mathText || context === 'tbody' || context === 'tr' || context === 'colgroup'
  const tag = context === 'html' ? 'div' : context
  const hidden = nested ? '' : context === 'svg' || context === 'math' ? ' aria-hidden="true" style="display:none"' : ' hidden'
  const wrapper = mathText ? '<math style="display:none">' : '<table hidden>'
  return `${nested ? wrapper : ''}<${tag}${hidden} id="${escapeAttr(id)}">${content}</${tag}>${nested ? mathText ? '</math>' : '</table>' : ''}`
}
