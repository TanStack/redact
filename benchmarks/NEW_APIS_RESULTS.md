# React and Redact performance measurements

Negative time changes mean less completed-work time. These are workload-specific results, not a whole-app speedup or a compatibility guarantee. [Method and reproduction](./README.md).

## Chrome, CPU slowdown 1x, 16 workloads

2026-09-10; Apple M5 Pro; Chrome 152.0.7977.83; 5 independent browser blocks, 5 timed rounds per workload per block. [Raw results](./results/new-apis-cpu1.json).

| Workload | react ms/iteration | before-new-apis ms/iteration | current ms/iteration | Current vs React, 95% interval |
|---|---:|---:|---:|---|
| keyed-reverse | 0.164 | 0.113 | 0.118 | -28.4% [-30.3%, -22.2%] |
| props-updates | 0.256 | 0.247 | 0.252 | -1.7% [-2.3%, +0.3%] |
| mount-unmount | 0.156 | 0.198 | 0.206 | +31.2% [+30.1%, +36.0%] |
| browser-ssr | 0.039 | 0.044 | 0.045 | +12.8% [+7.6%, +16.8%] |
| jsx-props-updates | 0.247 | 0.233 | 0.235 | -5.6% [-6.3%, -4.2%] |
| context-through-memo | 0.077 | 0.050 | 0.050 | -35.3% [-36.0%, -31.0%] |
| stable-keyed-rows | 0.050 | 0.046 | 0.049 | +0.8% [-5.5%, +3.9%] |
| null-siblings | 0.096 | 0.079 | 0.084 | -13.1% [-16.0%, -9.3%] |
| sparse-setters | 0.009 | 0.002 | 0.002 | -74.9% [-75.3%, -73.3%] |
| jsx-stable-keyed-rows | 0.048 | 0.041 | 0.046 | -5.2% [-7.8%, +2.2%] |
| passive-effects | 0.027 | 0.028 | 0.029 | +10.6% [+3.6%, +13.9%] |
| controlled-selects | 0.154 | 0.132 | 0.144 | -3.8% [-9.2%, -3.1%] |
| deep-tree-props | 0.014 | 0.009 | 0.010 | -26.1% [-30.7%, -22.0%] |
| batched-setters | 0.056 | 0.041 | 0.040 | -27.7% [-30.2%, -23.7%] |
| mixed-depth-setters | 0.244 | 0.096 | 0.098 | -59.9% [-61.0%, -57.0%] |
| hydration | 0.212 | 0.247 | 0.240 | +15.1% [+9.4%, +16.7%] |

An iteration is one complete workload batch, not one leaf update. Intervals are exploratory and are not corrected for multiple comparisons.

Identical-React control: median absolute time difference across workloads 0.7%; largest difference +2.9% [-3.2%, +7.1%] on mixed-depth-setters. Small differences need repeat confirmation.

Control intervals extending beyond 5%: deep-tree-props -0.1% [-6.0%, +0.9%]; mixed-depth-setters +2.9% [-3.2%, +7.1%]. These expose run-to-run sensitivity even when the pooled control estimate is small.

| Workload | Current vs before-new-apis |
|---|---:|
| keyed-reverse | +4.4% [+3.1%, +5.5%] |
| props-updates | +2.2% [+0.7%, +3.1%] |
| mount-unmount | +4.1% [+2.8%, +4.7%] |
| browser-ssr | +2.0% [+1.2%, +2.7%] |
| jsx-props-updates | +2.0% [+1.0%, +2.6%] |
| context-through-memo | +1.4% [+0.4%, +2.2%] |
| stable-keyed-rows | +8.5% [+6.1%, +10.5%] |
| null-siblings | +5.8% [+4.9%, +7.3%] |
| sparse-setters | +2.0% [-0.7%, +3.4%] |
| jsx-stable-keyed-rows | +9.5% [+8.3%, +12.8%] |
| passive-effects | +2.7% [+1.0%, +8.0%] |
| controlled-selects | +8.8% [+7.2%, +9.6%] |
| deep-tree-props | +10.9% [+8.6%, +13.7%] |
| batched-setters | -0.4% [-2.6%, +3.2%] |
| mixed-depth-setters | +0.5% [0.0%, +1.2%] |
| hydration | -0.9% [-5.8%, +2.0%] |

### Mount/unmount render counts

Each cycle mounts once and removes the subtree once. An extra component render during removal is unwanted work, even when final DOM and effect counts match.

| Renderer | Component renders per cycle, observed range |
|---|---:|
| react | 1 to 1 |
| before-new-apis | 1 to 1 |
| current | 1 to 1 |

### Normal-scheduling clicks

Automatic JSX, trusted clicks, no forced flush in the handler. Event Timing durations are browser-rounded observations, not field INP. An absent event entry is not zero latency.

| Scenario | Renderer | Handler-to-commit median / p95 ms | Observed click duration median / p95 ms | Event entries / clicks | Long tasks in event window |
|---|---|---:|---:|---:|---:|
| click-240 | react | 0.300 / 0.400 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | before-new-apis | 0.200 / 0.300 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | current | 0.200 / 0.400 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | react | 1.300 / 1.505 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | before-new-apis | 1.000 / 1.200 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | current | 1.100 / 1.300 | 16.0 / 16.0 | 60 / 60 | 0 |

The next-rAF timestamp and instrumentation-inclusive TaskDuration remain available as diagnostics in the raw data. Neither is reported as renderer CPU time or exact paint time.

### Retained heap for 2,400 mounted rows

Separate mount/unmount-only pages, forced GC, three cycles per block. Values exclude the loaded-fixture baseline. Unmounted residuals can include JIT caches, so they are not a leak diagnosis.

| Renderer | Median mounted JS heap delta, KiB | Median last-unmount residual, KiB | Last-unmount DOM node delta |
|---|---:|---:|---:|
| react | 665.1 | 120.1 | 0, 0, 0, 0, 0 |
| before-new-apis | 741.4 | 48.7 | 0, 0, 0, 0, 0 |
| current | 752.0 | 53.9 | 0, 0, 0, 0, 0 |

## Chrome, CPU slowdown 1x, 8 workloads

2026-09-10; Apple M5 Pro; Chrome 152.0.7977.83; 5 independent browser blocks, 5 timed rounds per workload per block. [Raw results](./results/new-apis-queue-guard-cpu1.json).

| Workload | react ms/iteration | before-new-apis ms/iteration | api-before-guard ms/iteration | current ms/iteration | Current vs React, 95% interval |
|---|---:|---:|---:|---:|---|
| controlled-selects | 0.141 | 0.126 | 0.137 | 0.129 | -7.9% [-8.8%, -1.2%] |
| jsx-stable-keyed-rows | 0.043 | 0.039 | 0.043 | 0.040 | -4.9% [-11.6%, -1.7%] |
| stable-keyed-rows | 0.048 | 0.044 | 0.048 | 0.045 | -5.5% [-8.8%, +0.1%] |
| hydration | 0.189 | 0.211 | 0.213 | 0.210 | +11.8% [+10.0%, +21.8%] |
| passive-effects | 0.025 | 0.028 | 0.028 | 0.028 | +10.3% [+8.7%, +11.6%] |
| mount-unmount | 0.150 | 0.196 | 0.204 | 0.198 | +32.8% [+20.7%, +35.0%] |
| deep-tree-props | 0.013 | 0.008 | 0.009 | 0.008 | -34.1% [-37.1%, -23.1%] |
| batched-setters | 0.051 | 0.038 | 0.038 | 0.038 | -25.5% [-27.7%, -22.2%] |

An iteration is one complete workload batch, not one leaf update. Intervals are exploratory and are not corrected for multiple comparisons.

Identical-React control: median absolute time difference across workloads 0.4%; largest difference -2.4% [-3.9%, +0.8%] on hydration. Small differences need repeat confirmation.

Control intervals extending beyond 5%: mount-unmount -0.5% [-6.7%, +1.8%]. These expose run-to-run sensitivity even when the pooled control estimate is small.

| Workload | Current vs before-new-apis | Current vs api-before-guard |
|---|---:|---:|
| controlled-selects | +2.6% [+2.1%, +3.0%] | -6.2% [-7.0%, -6.1%] |
| jsx-stable-keyed-rows | +1.2% [+0.9%, +2.6%] | -7.8% [-8.3%, -7.0%] |
| stable-keyed-rows | +1.4% [+0.7%, +1.5%] | -6.8% [-8.1%, -6.3%] |
| hydration | +0.8% [-1.0%, +3.9%] | -1.6% [-3.1%, +2.1%] |
| passive-effects | -1.3% [-3.5%, +3.1%] | -0.5% [-1.5%, +0.3%] |
| mount-unmount | +1.4% [+0.9%, +2.3%] | -2.4% [-2.9%, -1.7%] |
| deep-tree-props | +3.0% [+2.4%, +4.1%] | -6.9% [-7.3%, -6.4%] |
| batched-setters | +0.5% [-1.0%, +1.0%] | +0.0% [-0.8%, +0.3%] |

### Mount/unmount render counts

Each cycle mounts once and removes the subtree once. An extra component render during removal is unwanted work, even when final DOM and effect counts match.

| Renderer | Component renders per cycle, observed range |
|---|---:|
| react | 1 to 1 |
| before-new-apis | 1 to 1 |
| api-before-guard | 1 to 1 |
| current | 1 to 1 |

## Compatibility and scope

Each current variant is the source snapshot identified by its raw input hashes, not necessarily the latest working tree. Redact retains synchronous scheduling and intentional concurrency downgrades. Missing behavior can make a renderer cheaper, so equal fixture output does not imply equal functionality.

The [upstream audit](../docs/REACT_19_3_AUDIT.md) and [API support notes](../docs/REACT_19_3_SUPPORT.md) record current behavior and remaining gaps. Historical measurements retain their original API surface; consult the recorded source hashes rather than assuming every snapshot supports the latest additions.

These measurements do not cover tanstack.com or tannerlinsley.com, network/loading time, streaming Suspense waterfalls, input arriving during other work, field INP, memory allocation rate, or actual mobile hardware. A throttled desktop CPU is only a sensitivity check.
