---
"@tanstack/redact": patch
---

Correct SVG attribute names in browser rendering, server output, and hydration, including textAnchor and fontSize. Preserve case-sensitive SVG names such as gradientUnits and preserveAspectRatio.

Add the svgAttributeAliases bundling option, enabled in full and disabled in nano. Development builds throw when a disabled alias is used and explain how to enable support.
