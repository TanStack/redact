# React and Redact performance measurements

Negative time changes mean less completed-work time. These are workload-specific results, not a whole-app speedup or a compatibility guarantee. [Method and reproduction](./README.md).

## Chrome, CPU slowdown 1x, 15 workloads

2026-09-10; Apple M5 Pro; Chrome 152.0.7977.83; 5 independent browser blocks, 5 timed rounds per workload per block. [Raw results](./results/commit-split-final-cpu1.json).

| Workload | react ms/iteration | pre-animation ms/iteration | native-stripped ms/iteration | current ms/iteration | Current vs React, 95% interval |
|---|---:|---:|---:|---:|---|
| mount-unmount | 0.148 | 0.202 | 0.173 | 0.174 | +15.7% [+13.1%, +21.5%] |
| jsx-props-updates | 0.242 | 0.225 | 0.235 | 0.235 | -1.7% [-2.6%, -1.5%] |
| deep-tree-props | 0.012 | 0.009 | 0.009 | 0.009 | -27.6% [-35.4%, -20.0%] |
| browser-ssr | 0.040 | 0.045 | 0.041 | 0.041 | +5.0% [-0.9%, +13.2%] |
| passive-effects | 0.025 | 0.028 | 0.030 | 0.031 | +19.4% [+17.2%, +22.1%] |
| stable-keyed-rows | 0.045 | 0.044 | 0.048 | 0.048 | +4.1% [+0.2%, +5.5%] |
| jsx-stable-keyed-rows | 0.045 | 0.041 | 0.044 | 0.044 | -2.0% [-3.5%, -0.8%] |
| hydration | 0.194 | 0.216 | 0.226 | 0.233 | +21.8% [+17.4%, +22.9%] |
| mixed-depth-setters | 0.258 | 0.091 | 0.096 | 0.096 | -59.5% [-66.4%, -58.1%] |
| keyed-reverse | 0.162 | 0.111 | 0.115 | 0.115 | -28.6% [-29.2%, -27.4%] |
| controlled-selects | 0.133 | 0.125 | 0.127 | 0.126 | -6.6% [-7.7%, -4.9%] |
| null-siblings | 0.093 | 0.081 | 0.084 | 0.084 | -9.9% [-10.7%, -9.4%] |
| batched-setters | 0.052 | 0.039 | 0.041 | 0.041 | -20.5% [-22.4%, -19.5%] |
| sparse-setters | 0.009 | 0.002 | 0.002 | 0.003 | -70.3% [-72.0%, -70.0%] |
| props-updates | 0.252 | 0.241 | 0.255 | 0.254 | +1.3% [+0.7%, +4.4%] |

An iteration is one complete workload batch, not one leaf update. Intervals are exploratory and are not corrected for multiple comparisons.

Identical-React control: median absolute time difference across workloads 0.4%; largest difference -1.3% [-1.5%, -0.5%] on keyed-reverse. Small differences need repeat confirmation.

Control intervals extending beyond 5%: sparse-setters -0.6% [-5.1%, +1.4%]. These expose run-to-run sensitivity even when the pooled control estimate is small.

| Workload | Current vs pre-animation | Current vs native-stripped |
|---|---:|---:|
| mount-unmount | -13.6% [-15.0%, -12.7%] | -0.3% [-0.6%, +0.1%] |
| jsx-props-updates | +4.4% [+3.5%, +5.2%] | -0.6% [-1.2%, +1.0%] |
| deep-tree-props | +5.1% [+4.1%, +12.1%] | +1.1% [-0.1%, +1.4%] |
| browser-ssr | -8.3% [-11.8%, +0.6%] | 0.0% [-0.3%, +1.0%] |
| passive-effects | +7.6% [+6.9%, +9.8%] | -0.1% [-0.3%, +1.9%] |
| stable-keyed-rows | +7.8% [+6.3%, +9.4%] | -0.5% [-0.8%, +0.1%] |
| jsx-stable-keyed-rows | +7.7% [+6.5%, +11.3%] | +0.4% [-2.7%, +1.9%] |
| hydration | +8.6% [+6.6%, +9.7%] | +0.7% [-1.4%, +3.0%] |
| mixed-depth-setters | +8.2% [+6.8%, +9.3%] | +0.5% [-0.7%, +3.1%] |
| keyed-reverse | +4.0% [+2.0%, +4.3%] | 0.0% [-1.0%, +0.5%] |
| controlled-selects | +1.1% [-1.6%, +2.8%] | -0.6% [-1.9%, 0.0%] |
| null-siblings | +3.5% [+2.6%, +4.1%] | +0.1% [-0.2%, +0.2%] |
| batched-setters | +8.1% [+7.3%, +9.0%] | +2.0% [+0.3%, +4.6%] |
| sparse-setters | +14.7% [+12.2%, +17.5%] | +2.8% [+1.1%, +4.0%] |
| props-updates | +6.1% [+4.5%, +7.2%] | -0.2% [-0.9%, +0.1%] |

### Mount/unmount render counts

Each cycle mounts once and removes the subtree once. An extra component render during removal is unwanted work, even when final DOM and effect counts match.

| Renderer | Component renders per cycle, observed range |
|---|---:|
| react | 1 to 1 |
| pre-animation | 1 to 1 |
| native-stripped | 1 to 1 |
| current | 1 to 1 |

### Normal-scheduling clicks

Automatic JSX, trusted clicks, no forced flush in the handler. Event Timing durations are browser-rounded observations, not field INP. An absent event entry is not zero latency.

| Scenario | Renderer | Handler-to-commit median / p95 ms | Observed click duration median / p95 ms | Event entries / clicks | Long tasks in event window |
|---|---|---:|---:|---:|---:|
| click-240 | react | 0.300 / 0.400 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | pre-animation | 0.200 / 0.300 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | native-stripped | 0.200 / 0.400 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | current | 0.200 / 0.400 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | react | 1.400 / 1.500 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | pre-animation | 1.100 / 1.205 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | native-stripped | 1.100 / 1.300 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | current | 1.100 / 1.305 | 16.0 / 16.0 | 60 / 60 | 0 |

The next-rAF timestamp and instrumentation-inclusive TaskDuration remain available as diagnostics in the raw data. Neither is reported as renderer CPU time or exact paint time.

### Retained heap for 2,400 mounted rows

Separate mount/unmount-only pages, forced GC, three cycles per block. Values exclude the loaded-fixture baseline. Unmounted residuals can include JIT caches, so they are not a leak diagnosis.

| Renderer | Median mounted JS heap delta, KiB | Median last-unmount residual, KiB | Last-unmount DOM node delta |
|---|---:|---:|---:|
| react | 667.4 | 120.1 | 0, 0, 0, 0, 0 |
| pre-animation | 748.5 | 50.6 | 0, 0, 0, 0, 0 |
| native-stripped | 757.8 | 58.3 | 0, 0, 0, 0, 0 |
| current | 758.1 | 58.6 | 0, 0, 0, 0, 0 |

## Compatibility and scope

Each current variant is the source snapshot identified by its raw input hashes, not necessarily the latest working tree. Redact retains synchronous scheduling and intentional concurrency downgrades. Missing behavior can make a renderer cheaper, so equal fixture output does not imply equal functionality.

The [upstream audit](../docs/REACT_19_3_AUDIT.md) and [API support notes](../docs/REACT_19_3_SUPPORT.md) record current behavior and remaining gaps. Historical measurements retain their original API surface; consult the recorded source hashes rather than assuming every snapshot supports the latest additions.

These measurements do not cover tanstack.com or tannerlinsley.com, network/loading time, streaming Suspense waterfalls, input arriving during other work, field INP, memory allocation rate, or actual mobile hardware. A throttled desktop CPU is only a sensitivity check.
