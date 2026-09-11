# React and Redact performance measurements

Measured September 9, 2026. Negative time changes favor Redact. These are workload-specific results, not a whole-app speedup or a compatibility guarantee. [Method and reproduction](./README.md).

## Chrome, CPU slowdown 1x, 16 workloads

Apple M5 Pro; Chrome 152.0.7977.83; 5 independent browser blocks, 5 timed rounds per workload per block. [Raw results](./results/control-restore-cpu1.json).

| Workload | react ms/iteration | before-controls ms/iteration | correctness-only ms/iteration | current ms/iteration | Current vs React, 95% interval |
|---|---:|---:|---:|---:|---|
| controlled-selects | 0.153 | 0.134 | 0.137 | 0.135 | -11.4% [-12.8%, -10.8%] |
| mount-unmount | 0.157 | 0.213 | 0.211 | 0.202 | +30.7% [+24.6%, +32.7%] |
| jsx-props-updates | 0.246 | 0.235 | 0.235 | 0.230 | -5.9% [-7.2%, -4.7%] |
| stable-keyed-rows | 0.049 | 0.046 | 0.046 | 0.046 | -6.2% [-6.8%, -4.0%] |
| browser-ssr | 0.040 | 0.045 | 0.043 | 0.043 | +6.3% [+4.9%, +11.8%] |
| passive-effects | 0.026 | 0.029 | 0.029 | 0.029 | +7.1% [+0.0%, +12.3%] |
| context-through-memo | 0.077 | 0.050 | 0.049 | 0.050 | -34.9% [-36.5%, -32.5%] |
| jsx-stable-keyed-rows | 0.049 | 0.042 | 0.042 | 0.042 | -15.4% [-16.2%, -14.2%] |
| sparse-setters | 0.009 | 0.002 | 0.002 | 0.002 | -76.2% [-76.7%, -76.1%] |
| mixed-depth-setters | 0.238 | 0.097 | 0.097 | 0.097 | -58.5% [-66.9%, -57.8%] |
| keyed-reverse | 0.167 | 0.116 | 0.116 | 0.117 | -29.6% [-33.8%, -26.1%] |
| null-siblings | 0.098 | 0.086 | 0.086 | 0.083 | -17.3% [-19.3%, -15.6%] |
| deep-tree-props | 0.013 | 0.009 | 0.009 | 0.009 | -28.1% [-36.8%, -24.2%] |
| hydration | 0.220 | 0.246 | 0.255 | 0.251 | +14.4% [+5.4%, +22.1%] |
| batched-setters | 0.053 | 0.039 | 0.039 | 0.039 | -26.9% [-27.2%, -26.7%] |
| props-updates | 0.266 | 0.255 | 0.255 | 0.252 | -4.6% [-5.8%, -1.4%] |

An iteration is one complete workload batch, not one leaf update. Intervals are exploratory and are not corrected for multiple comparisons.

Identical-React control: median absolute time difference across workloads 0.5%; largest difference +3.8% [-0.2%, +13.5%] on mixed-depth-setters. Small differences need repeat confirmation.

Control intervals extending beyond 5%: mixed-depth-setters +3.8% [-0.2%, +13.5%]; deep-tree-props +1.1% [-0.5%, +14.0%]. These expose run-to-run sensitivity even when the pooled control estimate is small.

| Workload | Current vs before-controls | Current vs correctness-only |
|---|---:|---:|
| controlled-selects | +1.5% [+0.7%, +1.7%] | -0.4% [-1.7%, +1.3%] |
| mount-unmount | -5.3% [-6.9%, -5.1%] | -5.2% [-7.0%, -4.2%] |
| jsx-props-updates | -2.0% [-2.3%, -1.2%] | -1.8% [-3.6%, -1.1%] |
| stable-keyed-rows | +0.4% [-1.8%, +2.5%] | +0.9% [+0.1%, +2.5%] |
| browser-ssr | -0.8% [-8.7%, -0.5%] | -0.8% [-1.0%, -0.6%] |
| passive-effects | +0.5% [-2.5%, +1.4%] | +0.4% [-1.5%, +1.4%] |
| context-through-memo | +0.1% [-1.0%, +5.5%] | +1.3% [-0.6%, +4.5%] |
| jsx-stable-keyed-rows | +0.9% [-2.8%, +2.2%] | +0.1% [-0.6%, +1.9%] |
| sparse-setters | -0.1% [-4.6%, +1.2%] | -1.7% [-4.8%, +2.3%] |
| mixed-depth-setters | -1.3% [-7.1%, -0.1%] | -1.5% [-6.1%, -1.2%] |
| keyed-reverse | +0.4% [-0.3%, +0.4%] | +0.3% [-0.1%, +0.7%] |
| null-siblings | -4.2% [-5.9%, -1.9%] | -3.6% [-4.2%, -2.1%] |
| deep-tree-props | +0.1% [-0.4%, +0.4%] | -0.6% [-2.3%, +0.1%] |
| hydration | +2.5% [-3.5%, +4.4%] | -0.6% [-3.7%, +3.9%] |
| batched-setters | -0.1% [-2.1%, +0.9%] | -0.9% [-1.8%, +0.4%] |
| props-updates | -1.2% [-2.1%, -0.4%] | -1.4% [-1.9%, -1.2%] |

### Mount/unmount render counts

Each cycle mounts once and removes the subtree once. An extra component render during removal is unwanted work, even when final DOM and effect counts match.

| Renderer | Component renders per cycle, observed range |
|---|---:|
| react | 1 to 1 |
| before-controls | 1 to 1 |
| correctness-only | 1 to 1 |
| current | 1 to 1 |

### Normal-scheduling clicks

Automatic JSX, trusted clicks, no forced flush in the handler. Event Timing durations are browser-rounded observations, not field INP. An absent event entry is not zero latency.

| Scenario | Renderer | Handler-to-commit median / p95 ms | Observed click duration median / p95 ms | Event entries / clicks | Long tasks in event window |
|---|---|---:|---:|---:|---:|
| click-240 | react | 0.200 / 0.300 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | before-controls | 0.200 / 0.205 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | correctness-only | 0.100 / 0.200 | 16.0 / 16.0 | 59 / 60 | 0 |
| click-240 | current | 0.100 / 0.205 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | react | 1.100 / 1.500 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | before-controls | 1.000 / 1.200 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | correctness-only | 0.900 / 1.200 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | current | 0.900 / 1.300 | 16.0 / 16.0 | 60 / 60 | 0 |

The next-rAF timestamp and instrumentation-inclusive TaskDuration remain available as diagnostics in the raw data. Neither is reported as renderer CPU time or exact paint time.

### Retained heap for 2,400 mounted rows

Separate mount/unmount-only pages, forced GC, three cycles per block. Values exclude the loaded-fixture baseline. Unmounted residuals can include JIT caches, so they are not a leak diagnosis.

| Renderer | Median mounted JS heap delta, KiB | Median last-unmount residual, KiB | Last-unmount DOM node delta |
|---|---:|---:|---:|
| react | 665.2 | 120.1 | 0, 0, 0, 0, 0 |
| before-controls | 737.0 | 44.7 | 0, 0, 0, 0, 0 |
| correctness-only | 737.5 | 44.7 | 0, 0, 0, 0, 0 |
| current | 741.4 | 48.7 | 0, 0, 0, 0, 0 |

## Chrome, CPU slowdown 1x, 4 workloads

Apple M5 Pro; Chrome 152.0.7977.83; 5 independent browser blocks, 5 timed rounds per workload per block. [Raw results](./results/control-restore-repeat-cpu1.json).

| Workload | react ms/iteration | before-controls ms/iteration | correctness-only ms/iteration | current ms/iteration | Current vs React, 95% interval |
|---|---:|---:|---:|---:|---|
| hydration | 0.242 | 0.291 | 0.285 | 0.303 | +19.6% [+11.3%, +30.9%] |
| stable-keyed-rows | 0.048 | 0.045 | 0.046 | 0.046 | -2.0% [-4.1%, -1.5%] |
| mount-unmount | 0.156 | 0.207 | 0.205 | 0.196 | +25.2% [+23.3%, +26.4%] |
| jsx-props-updates | 0.259 | 0.251 | 0.259 | 0.244 | -6.4% [-7.5%, -4.6%] |

An iteration is one complete workload batch, not one leaf update. Intervals are exploratory and are not corrected for multiple comparisons.

Identical-React control: median absolute time difference across workloads 0.2%; largest difference -0.9% [-3.8%, +1.5%] on jsx-props-updates. Small differences need repeat confirmation.

Control intervals extending beyond 5%: hydration -0.3% [-1.3%, +5.5%]. These expose run-to-run sensitivity even when the pooled control estimate is small.

| Workload | Current vs before-controls | Current vs correctness-only |
|---|---:|---:|
| hydration | +2.8% [-1.8%, +8.0%] | +2.8% [-1.4%, +5.8%] |
| stable-keyed-rows | -0.5% [-3.5%, +0.8%] | -0.1% [-1.9%, +1.5%] |
| mount-unmount | -5.8% [-6.4%, -5.2%] | -5.1% [-5.7%, -3.8%] |
| jsx-props-updates | -1.6% [-7.8%, -0.8%] | -3.7% [-4.0%, -1.4%] |

### Mount/unmount render counts

Each cycle mounts once and removes the subtree once. An extra component render during removal is unwanted work, even when final DOM and effect counts match.

| Renderer | Component renders per cycle, observed range |
|---|---:|
| react | 1 to 1 |
| before-controls | 1 to 1 |
| correctness-only | 1 to 1 |
| current | 1 to 1 |

## Compatibility and scope

Each current variant is the source snapshot identified by its raw input hashes, not necessarily the latest working tree. Redact retains synchronous scheduling and intentional concurrency downgrades. Missing behavior can make a renderer cheaper, so equal fixture output does not imply equal functionality.

The [upstream audit](../docs/REACT_19_3_AUDIT.md) records the latest fixes and remaining gaps. New Fragment refs, ViewTransition, addTransitionType, browser() and onBrowserBailout are not implemented by these performance passes.

These measurements do not cover tanstack.com or tannerlinsley.com, network/loading time, streaming Suspense waterfalls, input arriving during other work, field INP, memory allocation rate, or actual mobile hardware. A throttled desktop CPU is only a sensitivity check.
