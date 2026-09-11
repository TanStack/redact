# React and Redact performance measurements

Negative time changes mean less completed-work time. These are workload-specific results, not a whole-app speedup or a compatibility guarantee. [Method and reproduction](./README.md).

## Chrome, CPU slowdown 1x, 15 workloads

2026-09-10; Apple M5 Pro; Chrome 152.0.7977.83; 5 independent browser blocks, 5 timed rounds per workload per block. [Raw results](./results/commit-optimized-final-cpu1.json).

| Workload | react ms/iteration | pre-animation ms/iteration | first-split ms/iteration | native-stripped ms/iteration | current ms/iteration | Current vs React, 95% interval |
|---|---:|---:|---:|---:|---:|---|
| null-siblings | 0.097 | 0.082 | 0.087 | 0.081 | 0.081 | -17.4% [-18.7%, -14.6%] |
| deep-tree-props | 0.013 | 0.009 | 0.010 | 0.009 | 0.009 | -29.8% [-35.6%, -17.9%] |
| passive-effects | 0.026 | 0.029 | 0.032 | 0.030 | 0.030 | +13.2% [+9.7%, +19.6%] |
| jsx-stable-keyed-rows | 0.043 | 0.042 | 0.045 | 0.041 | 0.042 | -3.9% [-4.4%, -0.9%] |
| jsx-props-updates | 0.247 | 0.232 | 0.247 | 0.243 | 0.240 | -5.1% [-5.8%, -2.6%] |
| controlled-selects | 0.150 | 0.135 | 0.138 | 0.135 | 0.134 | -10.3% [-10.7%, -8.9%] |
| stable-keyed-rows | 0.046 | 0.047 | 0.050 | 0.046 | 0.046 | -1.3% [-7.1%, +0.1%] |
| keyed-reverse | 0.166 | 0.116 | 0.120 | 0.115 | 0.116 | -30.2% [-31.3%, -27.9%] |
| mixed-depth-setters | 0.264 | 0.095 | 0.104 | 0.097 | 0.098 | -64.6% [-67.8%, -62.1%] |
| props-updates | 0.266 | 0.253 | 0.271 | 0.264 | 0.261 | -1.7% [-2.2%, -0.2%] |
| mount-unmount | 0.155 | 0.206 | 0.182 | 0.163 | 0.163 | +6.7% [+2.4%, +10.4%] |
| hydration | 0.220 | 0.248 | 0.253 | 0.260 | 0.251 | +12.5% [+1.5%, +19.2%] |
| batched-setters | 0.054 | 0.040 | 0.043 | 0.039 | 0.040 | -25.2% [-28.7%, -23.8%] |
| browser-ssr | 0.040 | 0.042 | 0.043 | 0.042 | 0.042 | +5.7% [+0.6%, +9.2%] |
| sparse-setters | 0.009 | 0.002 | 0.003 | 0.002 | 0.002 | -74.1% [-74.3%, -73.2%] |

An iteration is one complete workload batch, not one leaf update. Intervals are exploratory and are not corrected for multiple comparisons.

Identical-React control: median absolute time difference across workloads 0.4%; largest difference +1.7% [-2.0%, +3.3%] on hydration. Small differences need repeat confirmation.

Control intervals extending beyond 5%: deep-tree-props +0.4% [-0.7%, +13.6%]; mixed-depth-setters +0.5% [-1.2%, +17.0%]; sparse-setters +0.5% [-2.8%, +6.0%]. These expose run-to-run sensitivity even when the pooled control estimate is small.

| Workload | Current vs pre-animation | Current vs first-split | Current vs native-stripped |
|---|---:|---:|---:|
| null-siblings | -1.5% [-2.6%, -1.4%] | -7.8% [-8.6%, -5.0%] | +0.3% [-0.8%, +1.0%] |
| deep-tree-props | +0.6% [-1.4%, +1.6%] | -3.5% [-4.0%, -2.1%] | -0.5% [-0.8%, -0.2%] |
| passive-effects | +3.6% [+2.4%, +5.1%] | -5.0% [-6.1%, -3.2%] | +0.5% [-0.1%, +1.4%] |
| jsx-stable-keyed-rows | +0.1% [-1.8%, +1.0%] | -7.4% [-10.2%, -6.9%] | +0.3% [0.0%, +1.0%] |
| jsx-props-updates | +2.7% [+2.0%, +3.4%] | -3.3% [-3.7%, -2.9%] | -0.7% [-0.8%, -0.1%] |
| controlled-selects | -0.3% [-0.9%, +0.3%] | -2.7% [-4.0%, -2.5%] | +0.1% [-0.5%, +0.7%] |
| stable-keyed-rows | -0.6% [-1.6%, +1.7%] | -7.5% [-7.7%, -5.8%] | -0.2% [-0.9%, +0.5%] |
| keyed-reverse | +1.5% [-4.6%, +3.4%] | -3.1% [-4.7%, -1.0%] | +0.7% [-0.7%, +4.1%] |
| mixed-depth-setters | +1.0% [-0.3%, +4.7%] | -7.0% [-10.0%, -4.1%] | +1.6% [+1.1%, +1.9%] |
| props-updates | +2.4% [+2.0%, +3.6%] | -3.5% [-5.7%, -2.8%] | -0.9% [-1.0%, +0.1%] |
| mount-unmount | -20.7% [-21.2%, -19.3%] | -9.9% [-11.1%, -8.5%] | +0.7% [-2.0%, +1.2%] |
| hydration | -0.1% [-1.2%, +2.4%] | -1.0% [-10.4%, +1.5%] | -4.3% [-5.6%, -2.1%] |
| batched-setters | -0.1% [-1.5%, +2.8%] | -8.4% [-9.8%, -5.1%] | +2.4% [+0.4%, +3.0%] |
| browser-ssr | -0.3% [-1.1%, +1.0%] | -0.2% [-3.0%, +0.5%] | -0.4% [-0.7%, -0.1%] |
| sparse-setters | +5.9% [+4.7%, +6.2%] | -9.9% [-10.4%, -9.6%] | +1.4% [+0.7%, +2.0%] |

### Mount/unmount render counts

Each cycle mounts once and removes the subtree once. An extra component render during removal is unwanted work, even when final DOM and effect counts match.

| Renderer | Component renders per cycle, observed range |
|---|---:|
| react | 1 to 1 |
| pre-animation | 1 to 1 |
| first-split | 1 to 1 |
| native-stripped | 1 to 1 |
| current | 1 to 1 |

### Normal-scheduling clicks

Automatic JSX, trusted clicks, no forced flush in the handler. Event Timing durations are browser-rounded observations, not field INP. An absent event entry is not zero latency.

| Scenario | Renderer | Handler-to-commit median / p95 ms | Observed click duration median / p95 ms | Event entries / clicks | Long tasks in event window |
|---|---|---:|---:|---:|---:|
| click-240 | react | 0.200 / 0.405 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | pre-animation | 0.200 / 0.305 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | first-split | 0.200 / 0.400 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | native-stripped | 0.200 / 0.300 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | current | 0.200 / 0.300 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | react | 1.100 / 1.505 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | pre-animation | 1.000 / 1.200 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | first-split | 1.000 / 1.300 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | native-stripped | 0.900 / 1.200 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | current | 1.000 / 1.205 | 16.0 / 16.0 | 60 / 60 | 0 |

The next-rAF timestamp and instrumentation-inclusive TaskDuration remain available as diagnostics in the raw data. Neither is reported as renderer CPU time or exact paint time.

### Retained heap for 2,400 mounted rows

Separate mount/unmount-only pages, forced GC, three cycles per block. Values exclude the loaded-fixture baseline. Unmounted residuals can include JIT caches, so they are not a leak diagnosis.

| Renderer | Median mounted JS heap delta, KiB | Median last-unmount residual, KiB | Last-unmount DOM node delta |
|---|---:|---:|---:|
| react | 665.3 | 120.1 | 0, 0, 0, 0, 0 |
| pre-animation | 748.5 | 50.6 | 0, 0, 0, 0, 0 |
| first-split | 758.1 | 58.6 | 0, 0, 0, 0, 0 |
| native-stripped | 765.2 | 63.1 | 0, 0, 0, 0, 0 |
| current | 762.3 | 63.4 | 0, 0, 0, 0, 0 |

## Compatibility and scope

Each current variant is the source snapshot identified by its raw input hashes, not necessarily the latest working tree. Redact retains synchronous scheduling and intentional concurrency downgrades. Missing behavior can make a renderer cheaper, so equal fixture output does not imply equal functionality.

The [upstream audit](../docs/REACT_19_3_AUDIT.md) and [API support notes](../docs/REACT_19_3_SUPPORT.md) record current behavior and remaining gaps. Historical measurements retain their original API surface; consult the recorded source hashes rather than assuming every snapshot supports the latest additions.

These measurements do not cover tanstack.com or tannerlinsley.com, network/loading time, streaming Suspense waterfalls, input arriving during other work, field INP, memory allocation rate, or actual mobile hardware. A throttled desktop CPU is only a sensitivity check.
