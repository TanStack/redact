---
'@tanstack/redact': patch
---

Cache the sibling anchor across a child chain instead of rescanning every later sibling for each child. Mounting into a parent that already has children was O(n²) in sibling count: 2000 rows appended after a retained header took 2,001,000 `firstDomNode` calls and 11.5ms, now 2,000 calls and 5.2ms; 8000 rows go from 106ms to 23.5ms. The cache is dropped as soon as the node ahead is no longer a child of this parent preceded by what the chain placed there, so inline portal moves, nested `flushSync` reveals and replaced siblings still rescan.
