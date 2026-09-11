# React and Redact performance measurements

Measured September 9, 2026. Negative time changes favor Redact. These are workload-specific results, not a whole-app speedup or a compatibility guarantee. [Method and reproduction](./README.md).

## Chrome, CPU slowdown 1x

Apple M5 Pro; Chrome 152.0.7977.83; 5 independent browser blocks, 5 timed rounds per workload per block. [Raw results](./results/parity-performance-cpu1.json).

| Workload | react ms/iteration | before-parity ms/iteration | current ms/iteration | Current vs React, 95% interval |
|---|---:|---:|---:|---|
| browser-ssr | 0.042 | 0.043 | 0.044 | +5.8% [-4.8%, +8.8%] |
| mount-unmount | 0.154 | 0.262 | 0.244 | +59.3% [+39.9%, +71.0%] |
| mixed-depth-setters | 0.242 | 0.095 | 0.098 | -59.5% [-60.9%, -56.8%] |
| passive-effects | 0.027 | 0.030 | 0.030 | +11.7% [+6.1%, +14.0%] |
| stable-keyed-rows | 0.050 | 0.047 | 0.047 | -5.7% [-16.8%, +0.5%] |
| jsx-stable-keyed-rows | 0.048 | 0.042 | 0.043 | -12.2% [-24.1%, -9.5%] |
| jsx-props-updates | 0.261 | 0.253 | 0.253 | -4.3% [-6.1%, -1.5%] |
| sparse-setters | 0.009 | 0.002 | 0.002 | -74.9% [-75.0%, -74.8%] |
| keyed-reverse | 0.170 | 0.117 | 0.118 | -29.8% [-31.8%, -28.0%] |
| controlled-selects | 0.154 | 0.137 | 0.137 | -11.4% [-14.1%, -9.6%] |
| deep-tree-props | 0.013 | 0.009 | 0.009 | -30.5% [-32.8%, -25.0%] |
| null-siblings | 0.099 | 0.092 | 0.086 | -12.5% [-14.0%, -7.6%] |
| batched-setters | 0.054 | 0.039 | 0.041 | -23.8% [-26.1%, -19.0%] |
| props-updates | 0.271 | 0.267 | 0.270 | -0.4% [-2.9%, +0.5%] |
| hydration | 0.220 | 0.320 | 0.228 | +4.8% [-2.4%, +7.5%] |

An iteration is one complete workload batch, not one leaf update. Intervals are exploratory and are not corrected for multiple comparisons.

Identical-React control: median absolute time difference across workloads 0.4%; largest difference -1.7% [-2.8%, -0.9%] on passive-effects. Small differences need repeat confirmation.

| Workload | Current vs before-parity |
|---|---:|
| browser-ssr | +0.5% [-1.7%, +0.9%] |
| mount-unmount | -6.5% [-6.9%, -5.7%] |
| mixed-depth-setters | +3.2% [-2.7%, +6.8%] |
| passive-effects | +0.6% [+0.3%, +2.0%] |
| stable-keyed-rows | +1.2% [-1.9%, +2.8%] |
| jsx-stable-keyed-rows | -0.5% [-0.8%, 0.0%] |
| jsx-props-updates | -0.3% [-0.9%, +0.1%] |
| sparse-setters | +4.3% [-2.8%, +6.0%] |
| keyed-reverse | +3.4% [+0.1%, +4.5%] |
| controlled-selects | +1.1% [+0.1%, +1.8%] |
| deep-tree-props | +0.6% [-0.7%, +2.1%] |
| null-siblings | -5.8% [-6.0%, -3.4%] |
| batched-setters | +5.3% [+2.9%, +10.5%] |
| props-updates | +0.4% [-0.2%, +1.5%] |
| hydration | -26.2% [-31.9%, -21.4%] |

### Normal-scheduling clicks

Automatic JSX, trusted clicks, no forced flush in the handler. Event Timing durations are browser-rounded observations, not field INP. An absent event entry is not zero latency.

| Scenario | Renderer | Handler-to-commit median / p95 ms | Observed click duration median / p95 ms | Event entries / clicks | Long tasks in event window |
|---|---|---:|---:|---:|---:|
| click-240 | react | 0.200 / 0.400 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | before-parity | 0.200 / 0.400 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | current | 0.200 / 0.400 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | react | 1.100 / 1.405 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | before-parity | 0.800 / 1.200 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | current | 0.800 / 1.100 | 16.0 / 16.0 | 60 / 60 | 0 |

The next-rAF timestamp and instrumentation-inclusive TaskDuration remain available as diagnostics in the raw data. Neither is reported as renderer CPU time or exact paint time.

## Chrome, CPU slowdown 1x

Apple M5 Pro; Chrome 152.0.7977.83; 5 independent browser blocks, 5 timed rounds per workload per block. [Raw results](./results/parity-context-cpu1.json).

| Workload | react ms/iteration | current ms/iteration | Current vs React, 95% interval |
|---|---:|---:|---|
| context-through-memo | 0.073 | 0.048 | -33.8% [-34.3%, -33.4%] |

An iteration is one complete workload batch, not one leaf update. Intervals are exploratory and are not corrected for multiple comparisons.

Identical-React control: median absolute time difference across workloads 0.4%; largest difference -0.4% [-1.2%, +0.3%] on context-through-memo. Small differences need repeat confirmation.

## Node SSR

Apple M5 Pro; v24.15.0; 5 independent process blocks, 5 timed rounds per workload per block. [Raw results](./results/parity-node-ssr.json).

| Workload | react ms/iteration | published ms/iteration | before-parity ms/iteration | current ms/iteration | Current vs React, 95% interval |
|---|---:|---:|---:|---:|---|
| node-readable-ready | 0.198 | 0.127 | 0.098 | 0.098 | -50.3% [-51.6%, -49.5%] |
| node-string-clean | 0.064 | 0.088 | 0.059 | 0.058 | -9.3% [-12.9%, -6.3%] |
| node-string-escaped | 0.146 | 0.174 | 0.172 | 0.137 | -4.7% [-7.6%, -1.1%] |
| node-string-hooks-context | 0.086 | 0.083 | 0.058 | 0.059 | -32.7% [-33.6%, -31.1%] |

An iteration is one complete workload batch, not one leaf update. Intervals are exploratory and are not corrected for multiple comparisons.

Identical-React control: median absolute time difference across workloads 1.2%; largest difference -2.2% [-3.2%, +2.2%] on node-string-escaped. Small differences need repeat confirmation.

| Workload | Current vs published | Current vs before-parity |
|---|---:|---:|
| node-readable-ready | -22.8% [-24.3%, -22.2%] | +0.3% [+0.0%, +1.6%] |
| node-string-clean | -34.4% [-35.1%, -32.9%] | +0.0% [-1.4%, +1.0%] |
| node-string-escaped | -19.7% [-24.1%, -17.0%] | -20.3% [-20.7%, -19.0%] |
| node-string-hooks-context | -29.7% [-30.1%, -29.1%] | +0.4% [-1.4%, +2.0%] |

## Chrome, CPU slowdown 1x

Apple M5 Pro; Chrome 152.0.7977.83; 5 independent browser blocks, 5 timed rounds per workload per block. [Raw results](./results/parity-optional-optimizations.json).

| Workload | react ms/iteration | correctness-only ms/iteration | current ms/iteration | Current vs React, 95% interval |
|---|---:|---:|---:|---|
| mixed-depth-setters | 0.229 | 0.091 | 0.090 | -60.2% [-61.1%, -59.8%] |
| mount-unmount | 0.153 | 0.246 | 0.225 | +47.3% [+44.7%, +54.0%] |
| batched-setters | 0.048 | 0.037 | 0.037 | -23.3% [-24.0%, -21.4%] |
| sparse-setters | 0.008 | 0.002 | 0.002 | -73.0% [-75.7%, -72.7%] |
| hydration | 0.195 | 0.285 | 0.216 | +9.9% [+5.3%, +12.3%] |

An iteration is one complete workload batch, not one leaf update. Intervals are exploratory and are not corrected for multiple comparisons.

Identical-React control: median absolute time difference across workloads 0.7%; largest difference +1.0% [+0.9%, +1.1%] on sparse-setters. Small differences need repeat confirmation.

| Workload | Current vs correctness-only |
|---|---:|
| mixed-depth-setters | -0.2% [-1.9%, +2.9%] |
| mount-unmount | -8.4% [-8.9%, -7.2%] |
| batched-setters | -0.3% [-1.0%, +1.9%] |
| sparse-setters | +0.5% [-0.5%, +1.6%] |
| hydration | -24.2% [-27.4%, -23.5%] |

## Compatibility and scope

Each current variant is the source snapshot identified by its raw input hashes, not necessarily the latest working tree. Redact retains synchronous scheduling and intentional concurrency downgrades. Missing behavior can make a renderer cheaper, so equal fixture output does not imply equal functionality.

The [upstream audit](../docs/REACT_19_3_AUDIT.md) records the latest fixes and remaining gaps. New Fragment refs, ViewTransition, addTransitionType, browser() and onBrowserBailout are not implemented by these performance passes.

These measurements do not cover tanstack.com or tannerlinsley.com, network/loading time, streaming Suspense waterfalls, input arriving during other work, field INP, memory allocation rate, or actual mobile hardware. A throttled desktop CPU is only a sensitivity check.
