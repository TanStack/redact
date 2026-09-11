# React and Redact performance measurements

Negative time changes mean less completed-work time. These are workload-specific results, not a whole-app speedup or a compatibility guarantee. [Method and reproduction](./README.md).

## Chrome, CPU slowdown 1x, 16 workloads

2026-09-11; Apple M5 Pro; Chrome 152.0.7977.83; 5 independent browser blocks, 5 timed rounds per workload per block. [Raw results](./results/ship-final-cpu1.json).

| Workload | react ms/iteration | before-expansion ms/iteration | expanded ms/iteration | default-package ms/iteration | current ms/iteration | Current vs React, 95% interval |
|---|---:|---:|---:|---:|---:|---|
| passive-effects | 0.024 | 0.028 | 0.035 | 0.032 | 0.032 | +27.8% [+22.9%, +29.7%] |
| controlled-selects | 0.142 | 0.128 | 0.132 | 0.132 | 0.132 | -7.3% [-9.9%, -5.2%] |
| deep-tree-props | 0.012 | 0.009 | 0.013 | 0.010 | 0.009 | -21.8% [-23.5%, -8.0%] |
| mount-unmount | 0.149 | 0.158 | 0.162 | 0.162 | 0.161 | +7.5% [+5.7%, +9.1%] |
| stable-keyed-rows | 0.045 | 0.045 | 0.046 | 0.046 | 0.046 | -0.4% [-5.7%, +1.7%] |
| mixed-depth-setters | 0.227 | 0.093 | 0.104 | 0.093 | 0.094 | -60.0% [-62.5%, -55.5%] |
| jsx-props-updates | 0.237 | 0.227 | 0.226 | 0.226 | 0.227 | -3.6% [-5.4%, -3.1%] |
| context-through-memo | 0.073 | 0.051 | 0.060 | 0.052 | 0.052 | -30.0% [-31.6%, -28.1%] |
| jsx-stable-keyed-rows | 0.050 | 0.042 | 0.044 | 0.043 | 0.043 | -13.0% [-16.1%, -4.7%] |
| browser-ssr | 0.038 | 0.041 | 0.042 | 0.043 | 0.042 | +10.8% [+9.2%, +20.7%] |
| props-updates | 0.249 | 0.242 | 0.242 | 0.243 | 0.245 | -2.1% [-2.4%, -1.0%] |
| keyed-reverse | 0.161 | 0.111 | 0.113 | 0.112 | 0.112 | -30.4% [-31.2%, -30.0%] |
| null-siblings | 0.094 | 0.078 | 0.097 | 0.083 | 0.082 | -14.1% [-15.9%, -11.1%] |
| hydration | 0.182 | 0.217 | 0.227 | 0.227 | 0.227 | +24.9% [+22.0%, +26.1%] |
| batched-setters | 0.050 | 0.039 | 0.049 | 0.041 | 0.041 | -18.2% [-18.5%, -17.1%] |
| sparse-setters | 0.009 | 0.002 | 0.003 | 0.002 | 0.002 | -71.5% [-72.4%, -70.3%] |

An iteration is one complete workload batch, not one leaf update. Intervals are exploratory and are not corrected for multiple comparisons.

Identical-React control: median absolute time difference across workloads 0.5%; largest difference +1.4% [-0.1%, +10.0%] on mixed-depth-setters. Small differences need repeat confirmation.

Control intervals extending beyond 5%: mixed-depth-setters +1.4% [-0.1%, +10.0%]. These expose run-to-run sensitivity even when the pooled control estimate is small.

| Workload | Current vs before-expansion | Current vs expanded | Current vs default-package |
|---|---:|---:|---:|
| passive-effects | +7.9% [+7.6%, +13.1%] | -12.9% [-13.1%, -12.7%] | +0.9% [-1.5%, +1.8%] |
| controlled-selects | +2.4% [+0.8%, +3.6%] | -0.3% [-0.8%, +0.1%] | +0.1% [-0.1%, +0.8%] |
| deep-tree-props | +5.6% [+3.4%, +13.7%] | -25.7% [-27.1%, -24.9%] | 0.0% [-0.4%, +0.3%] |
| mount-unmount | +2.6% [-0.5%, +4.1%] | -0.6% [-1.3%, +0.4%] | -0.2% [-0.7%, +0.3%] |
| stable-keyed-rows | +2.3% [+0.5%, +2.8%] | -0.4% [-0.8%, -0.1%] | -0.1% [-0.5%, +0.4%] |
| mixed-depth-setters | +1.7% [+0.5%, +3.0%] | -9.2% [-9.3%, -8.9%] | -0.3% [-6.0%, 0.0%] |
| jsx-props-updates | -0.2% [-0.7%, +0.9%] | +0.3% [-0.9%, +1.8%] | +0.2% [-0.9%, +0.6%] |
| context-through-memo | +2.3% [+1.4%, +5.1%] | -13.8% [-16.0%, -12.7%] | -1.2% [-2.1%, +0.5%] |
| jsx-stable-keyed-rows | +2.8% [+1.4%, +3.2%] | -0.8% [-2.8%, +0.1%] | -0.3% [-1.8%, +0.2%] |
| browser-ssr | +2.1% [+1.8%, +2.4%] | +0.4% [-0.2%, +1.0%] | -0.1% [-1.7%, +0.1%] |
| props-updates | +0.4% [-2.1%, +2.3%] | +0.1% [-0.5%, +1.5%] | +0.3% [-1.1%, +1.3%] |
| keyed-reverse | +1.0% [+0.3%, +1.3%] | -0.6% [-0.8%, -0.3%] | -0.1% [-0.7%, +0.3%] |
| null-siblings | +3.8% [+2.8%, +4.9%] | -15.4% [-15.8%, -14.8%] | +0.1% [-0.6%, +0.8%] |
| hydration | +5.3% [+4.3%, +6.9%] | -0.4% [-1.6%, +2.8%] | -0.8% [-1.3%, +2.5%] |
| batched-setters | +6.8% [+5.7%, +7.6%] | -16.7% [-17.8%, -15.6%] | +1.7% [+1.1%, +2.2%] |
| sparse-setters | +6.6% [+6.1%, +7.2%] | -16.8% [-17.3%, -15.8%] | +0.3% [-1.0%, +1.5%] |

### Mount/unmount render counts

Each cycle mounts once and removes the subtree once. An extra component render during removal is unwanted work, even when final DOM and effect counts match.

| Renderer | Component renders per cycle, observed range |
|---|---:|
| react | 1 to 1 |
| before-expansion | 1 to 1 |
| expanded | 1 to 1 |
| default-package | 1 to 1 |
| current | 1 to 1 |

### Normal-scheduling clicks

Automatic JSX, trusted clicks, no forced flush in the handler. Event Timing durations are browser-rounded observations, not field INP. An absent event entry is not zero latency.

| Scenario | Renderer | Handler-to-commit median / p95 ms | Observed click duration median / p95 ms | Event entries / clicks | Long tasks in event window |
|---|---|---:|---:|---:|---:|
| click-240 | react | 0.400 / 0.500 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | before-expansion | 0.300 / 0.400 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | expanded | 0.300 / 0.400 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | default-package | 0.300 / 0.400 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | current | 0.300 / 0.400 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | react | 1.500 / 1.605 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | before-expansion | 1.100 / 1.300 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | expanded | 1.200 / 1.400 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | default-package | 1.200 / 1.300 | 16.0 / 16.0 | 59 / 60 | 0 |
| click-2400 | current | 1.100 / 1.300 | 16.0 / 16.0 | 60 / 60 | 0 |

The next-rAF timestamp and instrumentation-inclusive TaskDuration remain available as diagnostics in the raw data. Neither is reported as renderer CPU time or exact paint time.

### Retained heap for 2,400 mounted rows

Separate mount/unmount-only pages, forced GC, three cycles per block. Values exclude the loaded-fixture baseline. Unmounted residuals can include JIT caches, so they are not a leak diagnosis.

| Renderer | Median mounted JS heap delta, KiB | Median last-unmount residual, KiB | Last-unmount DOM node delta |
|---|---:|---:|---:|
| react | 666.4 | 120.1 | 0, 0, 0, 0, 0 |
| before-expansion | 762.2 | 63.4 | 0, 0, 0, 0, 0 |
| expanded | 762.8 | 63.0 | 0, 0, 0, 0, 0 |
| default-package | 762.5 | 62.8 | 0, 0, 0, 0, 0 |
| current | 762.6 | 62.8 | 0, 0, 0, 0, 0 |

## Chrome, CPU slowdown 1x, 3 workloads

2026-09-11; Apple M5 Pro; Chrome 152.0.7977.83; 5 independent browser blocks, 5 timed rounds per workload per block. [Raw results](./results/ship-final-reducers-cpu1.json).

| Workload | react ms/iteration | expanded ms/iteration | default-package ms/iteration | current ms/iteration | Current vs React, 95% interval |
|---|---:|---:|---:|---:|---|
| reducer-suspense-retries | 0.117 | 0.296 | 0.268 | 0.273 | +125.2% [+120.7%, +142.1%] |
| reducer-batches | 0.051 | 0.060 | 0.055 | 0.055 | +9.0% [+5.9%, +11.4%] |
| reducer-suspense-updates | 0.051 | 0.091 | 0.076 | 0.077 | +50.1% [+46.8%, +67.0%] |

An iteration is one complete workload batch, not one leaf update. Intervals are exploratory and are not corrected for multiple comparisons.

Identical-React control: median absolute time difference across workloads 0.5%; largest difference +1.3% [+0.6%, +2.4%] on reducer-suspense-updates. Small differences need repeat confirmation.

| Workload | Current vs expanded | Current vs default-package |
|---|---:|---:|
| reducer-suspense-retries | -8.3% [-8.9%, -7.5%] | +0.1% [-0.8%, +1.2%] |
| reducer-batches | -7.5% [-8.2%, -6.4%] | +1.3% [+0.1%, +2.2%] |
| reducer-suspense-updates | -7.6% [-12.5%, -5.8%] | +0.9% [-0.5%, +2.1%] |

## Node SSR

2026-09-11; Apple M5 Pro; v24.15.0; 5 independent process blocks, 5 timed rounds per workload per block. [Raw results](./results/ship-final-node-ssr.json).

| Workload | react ms/iteration | published ms/iteration | expanded ms/iteration | current ms/iteration | Current vs React, 95% interval |
|---|---:|---:|---:|---:|---|
| node-readable-ready | 0.175 | 0.112 | 0.090 | 0.088 | -49.4% [-51.5%, -47.0%] |
| node-string-clean | 0.057 | 0.076 | 0.054 | 0.053 | -6.9% [-8.6%, -1.6%] |
| node-string-escaped | 0.126 | 0.154 | 0.124 | 0.124 | -2.6% [-7.2%, +1.7%] |
| node-string-hooks-context | 0.076 | 0.074 | 0.053 | 0.053 | -30.5% [-34.3%, -29.3%] |

An iteration is one complete workload batch, not one leaf update. Intervals are exploratory and are not corrected for multiple comparisons.

Identical-React control: median absolute time difference across workloads 0.7%; largest difference -1.3% [-3.5%, +1.0%] on node-string-escaped. Small differences need repeat confirmation.

| Workload | Current vs published | Current vs expanded |
|---|---:|---:|
| node-readable-ready | -21.2% [-22.4%, -20.7%] | -1.7% [-3.5%, +0.7%] |
| node-string-clean | -31.3% [-32.8%, -30.3%] | -1.2% [-1.9%, +1.9%] |
| node-string-escaped | -20.5% [-21.2%, -18.4%] | -0.3% [-1.8%, +0.1%] |
| node-string-hooks-context | -28.2% [-28.9%, -27.7%] | -0.3% [-2.7%, +1.1%] |

## Compatibility and scope

Each current variant is the source snapshot identified by its raw input hashes, not necessarily the latest working tree. Redact retains synchronous scheduling and intentional concurrency downgrades. Missing behavior can make a renderer cheaper, so equal fixture output does not imply equal functionality.

The [upstream audit](../docs/REACT_19_3_AUDIT.md) and [API support notes](../docs/REACT_19_3_SUPPORT.md) record current behavior and remaining gaps. Historical measurements retain their original API surface; consult the recorded source hashes rather than assuming every snapshot supports the latest additions.

These measurements do not cover tanstack.com or tannerlinsley.com, network/loading time, streaming Suspense waterfalls, input arriving during other work, field INP, memory allocation rate, or actual mobile hardware. A throttled desktop CPU is only a sensitivity check.
