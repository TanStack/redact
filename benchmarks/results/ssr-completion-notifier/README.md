# Counted SSR completion notifier

When Suspense boundaries settle one at a time, draining a Set with repeated Promise.race calls attaches reactions to every remaining task. Replace that bookkeeping with a pending count and one completion waiter. Resolve the waiter with the settled task, preserving rejection from a throwing output sink.

This patch isolates the notifier from the other experimental SSR changes. Baseline: 37c051c9. No public API or application changes.

Current-main validation: 2,007 tests pass, 91 skipped, types, build verification and every existing source and built size budget pass. Chrome, Firefox and WebKit completion traces match baseline for abort, boundary errors, reverse resolution, reentrant rendering and throwing sinks.

The earlier combined prototype improved staggered 32, 128 and 512 boundary workloads by roughly 20-26%, 36-40% and 55%, respectively, with lower sampled allocation. Those figures are historical context, not measurements of this isolated patch. Current-main timing and memory validation is pending. Do not merge until that validation and required CI complete.
