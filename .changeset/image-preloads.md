---
'@tanstack/redact': patch
---

Document renders now preload the images they render eagerly and open `<head>` with the charset and viewport metas, as React's server renderer does. Every `<img>` outside `<picture>`, `<noscript>` and SVG that has a `src` or `srcSet`, is not `loading="lazy"` or `fetchPriority="low"` and is not a `data:` URI gets a `<link rel="preload" as="image">`; the first ten and every `fetchPriority="high"` image are placed ahead of the stylesheets, the rest after the scripts.
