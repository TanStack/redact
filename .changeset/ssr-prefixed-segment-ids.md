---
'@tanstack/redact': patch
---

Use safely escaped, prefixed hexadecimal transport IDs for streamed Suspense boundaries, pass both DOM IDs to reveal instructions, and emit the recognized stylesheet-gated reveal instruction.

Keep reveal registrations shared across independently prefixed streams without changing early-event capture behavior. Remove the hidden segment and its parsing wrapper if a stylesheet-gated reveal fails, including when its boundary has already been deleted.
