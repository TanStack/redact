# React and Redact performance measurements

Measured September 9, 2026. Negative time changes favor Redact. These are workload-specific results, not a whole-app speedup or a compatibility guarantee. [Method and reproduction](./README.md).

## Chrome, CPU slowdown 1x

Apple M5 Pro; Chrome 152.0.7977.83; 5 independent browser blocks, 5 timed rounds per workload per block. [Raw results](./results/react-comparison-cpu1.json).

| Workload | react ms/iteration | published ms/iteration | pre-performance ms/iteration | current ms/iteration | Current vs React, 95% interval |
|---|---:|---:|---:|---:|---|
| mount-unmount | 0.155 | 0.363 | 0.359 | 0.256 | +62.7% [+60.8%, +65.3%] |
| jsx-props-updates | 0.239 | 0.262 | 0.264 | 0.231 | -4.0% [-4.3%, -2.0%] |
| deep-tree-props | 0.013 | 0.009 | 0.008 | 0.008 | -33.2% [-40.1%, -30.1%] |
| browser-ssr | 0.042 | 0.053 | 0.053 | 0.046 | +10.5% [+5.5%, +12.5%] |
| passive-effects | 0.025 | 0.037 | 0.037 | 0.028 | +13.0% [+6.3%, +17.3%] |
| stable-keyed-rows | 0.050 | 0.077 | 0.078 | 0.046 | -5.8% [-8.9%, -1.5%] |
| jsx-stable-keyed-rows | 0.047 | 0.074 | 0.074 | 0.042 | -12.2% [-13.2%, -10.5%] |
| hydration | 0.205 | 0.309 | 0.298 | 0.298 | +47.3% [+44.3%, +52.5%] |
| mixed-depth-setters | 0.229 | 0.189 | 0.191 | 0.090 | -60.7% [-67.3%, -60.0%] |
| keyed-reverse | 0.165 | 0.111 | 0.111 | 0.112 | -31.9% [-32.6%, -30.8%] |
| controlled-selects | 0.140 | 0.209 | 0.208 | 0.129 | -9.2% [-12.5%, -6.8%] |
| null-siblings | 0.095 | 0.121 | 0.121 | 0.092 | -4.4% [-5.6%, -1.8%] |
| batched-setters | 0.053 | 0.037 | 0.037 | 0.037 | -29.7% [-31.6%, -29.0%] |
| sparse-setters | 0.009 | 0.002 | 0.002 | 0.002 | -75.1% [-75.5%, -73.4%] |
| props-updates | 0.250 | 0.283 | 0.281 | 0.251 | -0.1% [-1.9%, +1.0%] |

An iteration is one complete workload batch, not one leaf update. Intervals are exploratory and are not corrected for multiple comparisons.

Identical-React control: median absolute time difference across workloads 0.4%; largest difference -1.9% [-5.7%, -0.9%] on hydration. Small differences need repeat confirmation.

Control intervals extending beyond 5%: deep-tree-props +0.1% [-1.0%, +5.5%]; hydration -1.9% [-5.7%, -0.9%]; mixed-depth-setters -0.1% [-2.5%, +26.0%]. These expose run-to-run sensitivity even when the pooled control estimate is small.

| Workload | Current vs published | Current vs pre-performance |
|---|---:|---:|
| mount-unmount | -29.2% [-35.3%, -29.0%] | -29.3% [-30.8%, -28.7%] |
| jsx-props-updates | -12.0% [-13.5%, -10.4%] | -12.3% [-13.1%, -12.1%] |
| deep-tree-props | +0.9% [-0.1%, +2.0%] | +1.0% [+0.3%, +2.6%] |
| browser-ssr | -13.8% [-17.7%, -12.2%] | -13.7% [-17.5%, -8.7%] |
| passive-effects | -22.9% [-23.7%, -20.1%] | -21.8% [-23.5%, -20.1%] |
| stable-keyed-rows | -40.9% [-41.3%, -40.1%] | -41.7% [-42.0%, -40.7%] |
| jsx-stable-keyed-rows | -43.7% [-45.2%, -43.4%] | -43.8% [-44.6%, -43.7%] |
| hydration | -3.2% [-3.6%, +1.5%] | -1.2% [-2.1%, +1.8%] |
| mixed-depth-setters | -52.8% [-53.1%, -48.5%] | -52.9% [-53.8%, -51.4%] |
| keyed-reverse | +1.3% [-1.1%, +3.5%] | +0.8% [-0.1%, +2.7%] |
| controlled-selects | -38.5% [-39.3%, -37.9%] | -38.3% [-39.8%, -37.8%] |
| null-siblings | -24.4% [-25.6%, -23.8%] | -24.6% [-25.6%, -22.3%] |
| batched-setters | -0.9% [-1.6%, +0.4%] | -1.4% [-2.1%, -0.4%] |
| sparse-setters | -0.2% [-0.9%, +0.4%] | -0.7% [-1.7%, +1.1%] |
| props-updates | -10.9% [-12.5%, -7.7%] | -10.7% [-12.1%, -10.1%] |

### Normal-scheduling clicks

Automatic JSX, trusted clicks, no forced flush in the handler. Event Timing durations are browser-rounded observations, not field INP. An absent event entry is not zero latency.

| Scenario | Renderer | Handler-to-commit median / p95 ms | Observed click duration median / p95 ms | Event entries / clicks | Long tasks in event window |
|---|---|---:|---:|---:|---:|
| click-240 | react | 0.300 / 0.400 | 16.0 / 16.0 | 59 / 60 | 0 |
| click-240 | published | 0.400 / 0.500 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | pre-performance | 0.300 / 0.400 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | current | 0.200 / 0.400 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | react | 1.400 / 1.600 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | published | 1.500 / 1.800 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | pre-performance | 1.500 / 1.700 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | current | 1.050 / 1.205 | 16.0 / 16.0 | 60 / 60 | 0 |

The next-rAF timestamp and instrumentation-inclusive TaskDuration remain available as diagnostics in the raw data. Neither is reported as renderer CPU time or exact paint time.

### Retained heap for 2,400 mounted rows

Separate mount/unmount-only pages, forced GC, three cycles per block. Values exclude the loaded-fixture baseline. Unmounted residuals can include JIT caches, so they are not a leak diagnosis.

| Renderer | Median mounted JS heap delta, KiB | Median last-unmount residual, KiB | Last-unmount DOM node delta |
|---|---:|---:|---:|
| react | 665.3 | 120.1 | 0, 0, 0, 0, 0 |
| published | 779.2 | 57.9 | 0, 0, 0, 0, 0 |
| pre-performance | 772.2 | 56.0 | 0, 0, 0, 0, 0 |
| current | 767.6 | 52.3 | 0, 0, 0, 0, 0 |

## Chrome, CPU slowdown 4x

Apple M5 Pro; Chrome 152.0.7977.83; 3 independent browser blocks, 5 timed rounds per workload per block. [Raw results](./results/react-comparison-cpu4.json).

| Workload | react ms/iteration | published ms/iteration | current ms/iteration | Current vs React, 95% interval |
|---|---:|---:|---:|---|
| passive-effects | 0.110 | 0.156 | 0.118 | +8.3% [-1.0%, +11.2%] |
| jsx-stable-keyed-rows | 0.193 | 0.300 | 0.170 | -8.6% [-18.0%, -3.6%] |
| sparse-setters | 0.036 | 0.009 | 0.008 | -76.0% [-76.3%, -75.6%] |
| keyed-reverse | 0.681 | 0.481 | 0.474 | -30.0% [-30.6%, -29.2%] |
| props-updates | 1.131 | 1.291 | 1.109 | -0.2% [-3.0%, +0.8%] |
| mount-unmount | 0.633 | 1.512 | 1.060 | +69.5% [+57.0%, +72.6%] |
| mixed-depth-setters | 0.987 | 0.933 | 0.418 | -57.5% [-60.2%, -55.3%] |
| hydration | 2.346 | 1.262 | 1.221 | -46.5% [-48.3%, -41.4%] |

An iteration is one complete workload batch, not one leaf update. Intervals are exploratory and are not corrected for multiple comparisons.

Identical-React control: median absolute time difference across workloads 0.6%; largest difference +3.5% [+0.0%, +6.7%] on sparse-setters. Small differences need repeat confirmation.

Control intervals extending beyond 5%: sparse-setters +3.5% [+0.0%, +6.7%]; hydration -0.1% [-9.1%, +10.6%]. These expose run-to-run sensitivity even when the pooled control estimate is small.

| Workload | Current vs published |
|---|---:|
| passive-effects | -22.7% [-26.3%, -20.9%] |
| jsx-stable-keyed-rows | -43.7% [-44.2%, -43.0%] |
| sparse-setters | -2.6% [-6.6%, +1.1%] |
| keyed-reverse | +1.5% [-2.6%, +1.8%] |
| props-updates | -11.5% [-16.9%, -10.7%] |
| mount-unmount | -30.1% [-30.5%, -29.9%] |
| mixed-depth-setters | -53.8% [-54.0%, -52.3%] |
| hydration | +0.8% [-0.9%, +1.2%] |

### Normal-scheduling clicks

Automatic JSX, trusted clicks, no forced flush in the handler. Event Timing durations are browser-rounded observations, not field INP. An absent event entry is not zero latency.

| Scenario | Renderer | Handler-to-commit median / p95 ms | Observed click duration median / p95 ms | Event entries / clicks | Long tasks in event window |
|---|---|---:|---:|---:|---:|
| click-240 | react | 0.700 / 1.100 | 16.0 / 16.0 | 36 / 36 | 0 |
| click-240 | published | 0.900 / 1.400 | 16.0 / 16.0 | 36 / 36 | 0 |
| click-240 | current | 0.700 / 1.100 | 16.0 / 16.0 | 36 / 36 | 0 |
| click-2400 | react | 4.300 / 5.150 | 32.0 / 32.0 | 36 / 36 | 0 |
| click-2400 | published | 5.250 / 6.250 | 32.0 / 40.0 | 36 / 36 | 0 |
| click-2400 | current | 3.850 / 4.225 | 32.0 / 32.0 | 36 / 36 | 0 |
| click-10000 | react | 17.300 / 18.650 | 120.0 / 136.0 | 36 / 36 | 36 |
| click-10000 | published | 19.600 / 21.650 | 136.0 / 152.0 | 36 / 36 | 36 |
| click-10000 | current | 14.000 / 16.025 | 128.0 / 144.0 | 36 / 36 | 36 |

The next-rAF timestamp and instrumentation-inclusive TaskDuration remain available as diagnostics in the raw data. Neither is reported as renderer CPU time or exact paint time.

### Retained heap for 2,400 mounted rows

Separate mount/unmount-only pages, forced GC, three cycles per block. Values exclude the loaded-fixture baseline. Unmounted residuals can include JIT caches, so they are not a leak diagnosis.

| Renderer | Median mounted JS heap delta, KiB | Median last-unmount residual, KiB | Last-unmount DOM node delta |
|---|---:|---:|---:|
| react | 666.2 | 120.0 | 0, 0, 0 |
| published | 772.3 | 58.1 | 0, 0, 0 |
| current | 767.6 | 52.4 | 0, 0, 0 |

## Node SSR

Apple M5 Pro; v24.15.0; 5 independent process blocks, 5 timed rounds per workload per block. [Raw results](./results/node-ssr-comparison.json).

| Workload | react ms/iteration | published ms/iteration | pre-performance ms/iteration | current ms/iteration | Current vs React, 95% interval |
|---|---:|---:|---:|---:|---|
| node-readable-ready | 0.182 | 0.117 | 0.116 | 0.089 | -50.6% [-52.7%, -49.1%] |
| node-string-clean | 0.058 | 0.081 | 0.079 | 0.053 | -10.5% [-13.3%, -4.6%] |
| node-string-escaped | 0.132 | 0.158 | 0.158 | 0.158 | +18.8% [+18.0%, +27.2%] |
| node-string-hooks-context | 0.079 | 0.076 | 0.076 | 0.054 | -31.6% [-33.2%, -31.2%] |

An iteration is one complete workload batch, not one leaf update. Intervals are exploratory and are not corrected for multiple comparisons.

Identical-React control: median absolute time difference across workloads 0.3%; largest difference +0.7% [-0.5%, +3.4%] on node-string-hooks-context. Small differences need repeat confirmation.

| Workload | Current vs published | Current vs pre-performance |
|---|---:|---:|
| node-readable-ready | -23.3% [-24.1%, -21.8%] | -23.3% [-24.7%, -21.2%] |
| node-string-clean | -34.5% [-38.1%, -32.2%] | -33.9% [-35.1%, -31.7%] |
| node-string-escaped | +0.6% [-1.7%, +2.2%] | +0.3% [-1.4%, +1.6%] |
| node-string-hooks-context | -29.0% [-29.7%, -28.1%] | -28.8% [-29.3%, -28.2%] |

## Compatibility and scope

Each current variant is the source snapshot identified by its raw input hashes, not necessarily the latest working tree. Redact retains synchronous scheduling and intentional concurrency downgrades. Missing behavior can make a renderer cheaper, so equal fixture output does not imply equal functionality.

The [upstream audit](../docs/REACT_19_3_AUDIT.md) records the latest fixes and remaining gaps. New Fragment refs, ViewTransition, addTransitionType, browser() and onBrowserBailout are not implemented by these performance passes.

These measurements do not cover tanstack.com or tannerlinsley.com, network/loading time, streaming Suspense waterfalls, input arriving during other work, field INP, memory allocation rate, or actual mobile hardware. A throttled desktop CPU is only a sensitivity check.
