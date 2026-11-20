---
'@tanstack/redact': patch
---

Map camelCase SVG presentation props (shapeRendering, fontSize, stopColor, textAnchor, markerEnd, vectorEffect, ...) to their hyphenated attribute names, as React does, so the browser applies them. Names SVG itself spells in camelCase (clipPathUnits, glyphRef, markerWidth, maskUnits, textLength, viewBox) keep their case.
