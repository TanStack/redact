import { SVG_HYPHENATED_ATTRS } from './aliases'

// Keep the exact detector in development and remove it from production.
export const svgAttributeAliases = process.env.NODE_ENV !== 'production' ? {
  test(name: string): boolean {
    if (SVG_HYPHENATED_ATTRS.test(name)) {
      throw new Error(`SVG attribute "${name}" requires svgAttributeAliases. Enable it with redact({ features: { svgAttributeAliases: true } }).`)
    }
    return false
  },
} : undefined
