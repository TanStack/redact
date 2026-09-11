# React and Redact performance measurements

Negative time changes mean less completed-work time. These are workload-specific results, not a whole-app speedup or a compatibility guarantee. [Method and reproduction](./README.md).

## Chrome, CPU slowdown 1x, 15 workloads

2026-09-11; Apple M5 Pro; Chrome 152.0.7977.83; 5 independent browser blocks, 5 timed rounds per workload per block. [Raw results](./results/parity-expansion-cpu1.json).

| Workload | react ms/iteration | before-expansion ms/iteration | current ms/iteration | Current vs React, 95% interval |
|---|---:|---:|---:|---|
| browser-ssr | 0.038 | 0.041 | 0.041 | +7.4% [+2.6%, +12.6%] |
| mount-unmount | 0.146 | 0.155 | 0.151 | +2.9% [-11.4%, +6.2%] |
| mixed-depth-setters | 0.226 | 0.091 | 0.102 | -54.9% [-58.6%, -51.7%] |
| passive-effects | 0.026 | 0.029 | 0.037 | +41.7% [+41.2%, +51.9%] |
| stable-keyed-rows | 0.048 | 0.046 | 0.047 | -3.2% [-13.1%, -0.1%] |
| jsx-stable-keyed-rows | 0.045 | 0.042 | 0.044 | -4.0% [-18.7%, -2.9%] |
| jsx-props-updates | 0.237 | 0.226 | 0.224 | -5.6% [-6.2%, -2.9%] |
| sparse-setters | 0.009 | 0.002 | 0.003 | -65.9% [-67.0%, -65.0%] |
| keyed-reverse | 0.162 | 0.112 | 0.114 | -29.2% [-30.2%, -27.0%] |
| controlled-selects | 0.147 | 0.132 | 0.138 | -7.7% [-9.2%, -4.8%] |
| deep-tree-props | 0.013 | 0.009 | 0.014 | +5.7% [-0.4%, +27.8%] |
| null-siblings | 0.093 | 0.077 | 0.095 | +1.2% [-4.3%, +1.9%] |
| batched-setters | 0.052 | 0.040 | 0.051 | -0.9% [-7.7%, +1.2%] |
| props-updates | 0.249 | 0.247 | 0.247 | -0.5% [-2.7%, +1.2%] |
| hydration | 0.203 | 0.223 | 0.225 | +15.2% [+8.2%, +19.6%] |

An iteration is one complete workload batch, not one leaf update. Intervals are exploratory and are not corrected for multiple comparisons.

Identical-React control: median absolute time difference across workloads 0.5%; largest difference -2.4% [-13.5%, +13.0%] on deep-tree-props. Small differences need repeat confirmation.

Control intervals extending beyond 5%: mixed-depth-setters -0.4% [-1.6%, +5.8%]; deep-tree-props -2.4% [-13.5%, +13.0%]. These expose run-to-run sensitivity even when the pooled control estimate is small.

| Workload | Current vs before-expansion |
|---|---:|
| browser-ssr | +1.9% [+0.5%, +8.5%] |
| mount-unmount | +1.2% [-1.8%, +2.6%] |
| mixed-depth-setters | +14.0% [+10.2%, +20.7%] |
| passive-effects | +26.3% [+24.4%, +30.6%] |
| stable-keyed-rows | +1.3% [-1.5%, +4.5%] |
| jsx-stable-keyed-rows | +4.5% [+3.4%, +5.2%] |
| jsx-props-updates | -0.5% [-4.1%, -0.1%] |
| sparse-setters | +28.2% [+26.7%, +29.3%] |
| keyed-reverse | +2.0% [+0.7%, +4.2%] |
| controlled-selects | +3.9% [+2.7%, +6.1%] |
| deep-tree-props | +50.2% [+40.0%, +54.1%] |
| null-siblings | +22.5% [+21.9%, +23.3%] |
| batched-setters | +29.0% [+27.8%, +29.4%] |
| props-updates | +0.5% [-1.0%, +1.3%] |
| hydration | +2.0% [+0.6%, +3.8%] |

### Mount/unmount render counts

Each cycle mounts once and removes the subtree once. An extra component render during removal is unwanted work, even when final DOM and effect counts match.

| Renderer | Component renders per cycle, observed range |
|---|---:|
| react | 1 to 1 |
| before-expansion | 1 to 1 |
| current | 1 to 1 |

### Normal-scheduling clicks

Automatic JSX, trusted clicks, no forced flush in the handler. Event Timing durations are browser-rounded observations, not field INP. An absent event entry is not zero latency.

| Scenario | Renderer | Handler-to-commit median / p95 ms | Observed click duration median / p95 ms | Event entries / clicks | Long tasks in event window |
|---|---|---:|---:|---:|---:|
| click-240 | react | 0.400 / 0.500 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | before-expansion | 0.300 / 0.400 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | current | 0.300 / 0.400 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | react | 1.400 / 1.600 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | before-expansion | 1.100 / 1.200 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | current | 1.100 / 1.205 | 16.0 / 16.0 | 60 / 60 | 0 |

The next-rAF timestamp and instrumentation-inclusive TaskDuration remain available as diagnostics in the raw data. Neither is reported as renderer CPU time or exact paint time.

### Retained heap for 2,400 mounted rows

Separate mount/unmount-only pages, forced GC, three cycles per block. Values exclude the loaded-fixture baseline. Unmounted residuals can include JIT caches, so they are not a leak diagnosis.

| Renderer | Median mounted JS heap delta, KiB | Median last-unmount residual, KiB | Last-unmount DOM node delta |
|---|---:|---:|---:|
| react | 665.3 | 120.1 | 0, 0, 0, 0, 0 |
| before-expansion | 762.2 | 63.4 | 0, 0, 0, 0, 0 |
| current | 764.0 | 63.0 | 0, 0, 0, 0, 0 |

## Chrome, CPU slowdown 1x, 3 workloads

2026-09-11; Apple M5 Pro; Chrome 152.0.7977.83; 5 independent browser blocks, 5 timed rounds per workload per block. [Raw results](./results/parity-expansion-reducers-cpu1.json).

| Workload | react ms/iteration | current ms/iteration | Current vs React, 95% interval |
|---|---:|---:|---|
| reducer-batches | 0.058 | 0.068 | +17.0% [+16.3%, +18.0%] |
| reducer-suspense-updates | 0.060 | 0.091 | +51.3% [+48.2%, +52.7%] |
| reducer-suspense-retries | 0.133 | 0.313 | +136.2% [+130.7%, +138.6%] |

An iteration is one complete workload batch, not one leaf update. Intervals are exploratory and are not corrected for multiple comparisons.

Identical-React control: median absolute time difference across workloads 0.5%; largest difference +0.8% [-0.6%, +1.2%] on reducer-suspense-retries. Small differences need repeat confirmation.

## Compatibility and scope

Each current variant is the source snapshot identified by its raw input hashes, not necessarily the latest working tree. Redact retains synchronous scheduling and intentional concurrency downgrades. Missing behavior can make a renderer cheaper, so equal fixture output does not imply equal functionality.

The [upstream audit](../docs/REACT_19_3_AUDIT.md) and [API support notes](../docs/REACT_19_3_SUPPORT.md) record current behavior and remaining gaps. Historical measurements retain their original API surface; consult the recorded source hashes rather than assuming every snapshot supports the latest additions.

These measurements do not cover tanstack.com or tannerlinsley.com, network/loading time, streaming Suspense waterfalls, input arriving during other work, field INP, memory allocation rate, or actual mobile hardware. A throttled desktop CPU is only a sensitivity check.
