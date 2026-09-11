# React and Redact performance measurements

Negative time changes mean less completed-work time. These are workload-specific results, not a whole-app speedup or a compatibility guarantee. [Method and reproduction](./README.md).

## Chrome, CPU slowdown 1x, 15 workloads

2026-09-10; Apple M5 Pro; Chrome 152.0.7977.83; 5 independent browser blocks, 5 timed rounds per workload per block. [Raw results](./results/commit-error-parity-cpu1.json).

| Workload | react ms/iteration | pre-animation ms/iteration | pre-rejection ms/iteration | native-stripped ms/iteration | current ms/iteration | Current vs React, 95% interval |
|---|---:|---:|---:|---:|---:|---|
| null-siblings | 0.095 | 0.081 | 0.079 | 0.079 | 0.080 | -16.6% [-21.1%, -15.7%] |
| deep-tree-props | 0.012 | 0.009 | 0.009 | 0.009 | 0.009 | -25.6% [-29.3%, -18.0%] |
| passive-effects | 0.026 | 0.029 | 0.029 | 0.030 | 0.030 | +16.0% [+10.6%, +18.0%] |
| jsx-stable-keyed-rows | 0.043 | 0.041 | 0.042 | 0.042 | 0.042 | -4.0% [-9.6%, +0.4%] |
| jsx-props-updates | 0.249 | 0.230 | 0.238 | 0.241 | 0.239 | -3.6% [-5.0%, -1.7%] |
| controlled-selects | 0.150 | 0.134 | 0.135 | 0.135 | 0.134 | -10.7% [-12.5%, -8.6%] |
| stable-keyed-rows | 0.047 | 0.046 | 0.046 | 0.046 | 0.046 | -2.6% [-5.2%, +3.2%] |
| keyed-reverse | 0.165 | 0.115 | 0.115 | 0.115 | 0.117 | -29.5% [-30.3%, -27.5%] |
| mixed-depth-setters | 0.242 | 0.094 | 0.094 | 0.097 | 0.096 | -62.6% [-64.9%, -57.9%] |
| props-updates | 0.256 | 0.248 | 0.255 | 0.255 | 0.253 | -1.2% [-2.1%, -0.1%] |
| mount-unmount | 0.151 | 0.206 | 0.162 | 0.162 | 0.162 | +6.7% [+4.0%, +9.1%] |
| hydration | 0.215 | 0.251 | 0.246 | 0.252 | 0.242 | +9.9% [+3.8%, +21.3%] |
| batched-setters | 0.053 | 0.039 | 0.040 | 0.039 | 0.040 | -23.1% [-28.0%, -21.8%] |
| browser-ssr | 0.040 | 0.042 | 0.042 | 0.042 | 0.042 | +4.6% [+0.1%, +8.3%] |
| sparse-setters | 0.009 | 0.002 | 0.002 | 0.002 | 0.002 | -73.3% [-74.1%, -70.8%] |

An iteration is one complete workload batch, not one leaf update. Intervals are exploratory and are not corrected for multiple comparisons.

Identical-React control: median absolute time difference across workloads 0.4%; largest difference +2.9% [-5.0%, +5.0%] on sparse-setters. Small differences need repeat confirmation.

Control intervals extending beyond 5%: mixed-depth-setters +1.4% [-0.1%, +8.3%]. These expose run-to-run sensitivity even when the pooled control estimate is small.

| Workload | Current vs pre-animation | Current vs pre-rejection | Current vs native-stripped |
|---|---:|---:|---:|
| null-siblings | -1.0% [-1.7%, -0.2%] | +0.6% [+0.3%, +0.9%] | +0.3% [-0.3%, +0.9%] |
| deep-tree-props | +1.5% [-0.5%, +2.9%] | -0.6% [-1.7%, +0.6%] | -0.3% [-0.6%, 0.0%] |
| passive-effects | +3.2% [+2.4%, +3.8%] | -0.2% [-0.5%, +2.4%] | +0.0% [-0.5%, +0.7%] |
| jsx-stable-keyed-rows | +1.0% [-0.3%, +3.3%] | +0.4% [-0.9%, +1.4%] | -0.5% [-1.1%, +0.1%] |
| jsx-props-updates | +3.6% [+3.4%, +4.2%] | +0.2% [+0.1%, +2.2%] | -0.2% [-1.8%, +1.4%] |
| controlled-selects | +0.4% [-0.7%, +1.7%] | 0.0% [-0.7%, +0.7%] | 0.0% [-0.8%, +0.6%] |
| stable-keyed-rows | +0.2% [-0.3%, +2.5%] | +0.5% [-0.1%, +0.7%] | -0.0% [-1.2%, +0.6%] |
| keyed-reverse | +1.8% [-3.3%, +3.3%] | +0.9% [-0.7%, +2.0%] | +0.3% [-1.3%, +0.9%] |
| mixed-depth-setters | +0.8% [-3.6%, +2.4%] | +0.7% [-1.3%, +1.3%] | +0.8% [+0.0%, +1.8%] |
| props-updates | +2.4% [+1.9%, +4.6%] | -0.4% [-0.4%, +1.0%] | -0.5% [-1.3%, +0.8%] |
| mount-unmount | -21.7% [-21.9%, -20.6%] | -0.4% [-0.9%, +0.5%] | +0.0% [-0.5%, +0.5%] |
| hydration | -3.2% [-6.3%, -1.4%] | -4.7% [-7.3%, +1.1%] | -3.6% [-8.5%, -0.1%] |
| batched-setters | +3.2% [-1.7%, +5.3%] | +0.7% [+0.3%, +2.6%] | +2.1% [+1.5%, +3.3%] |
| browser-ssr | -0.6% [-1.4%, +0.4%] | -0.1% [-0.3%, +0.7%] | +0.2% [-0.2%, +0.9%] |
| sparse-setters | +5.7% [+4.5%, +7.5%] | +0.4% [-0.9%, +0.9%] | +0.9% [-0.6%, +2.1%] |

### Mount/unmount render counts

Each cycle mounts once and removes the subtree once. An extra component render during removal is unwanted work, even when final DOM and effect counts match.

| Renderer | Component renders per cycle, observed range |
|---|---:|
| react | 1 to 1 |
| pre-animation | 1 to 1 |
| pre-rejection | 1 to 1 |
| native-stripped | 1 to 1 |
| current | 1 to 1 |

### Normal-scheduling clicks

Automatic JSX, trusted clicks, no forced flush in the handler. Event Timing durations are browser-rounded observations, not field INP. An absent event entry is not zero latency.

| Scenario | Renderer | Handler-to-commit median / p95 ms | Observed click duration median / p95 ms | Event entries / clicks | Long tasks in event window |
|---|---|---:|---:|---:|---:|
| click-240 | react | 0.200 / 0.500 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | pre-animation | 0.200 / 0.300 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | pre-rejection | 0.200 / 0.305 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | native-stripped | 0.200 / 0.300 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | current | 0.200 / 0.400 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | react | 1.300 / 1.500 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | pre-animation | 1.000 / 1.300 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | pre-rejection | 1.000 / 1.200 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | native-stripped | 1.050 / 1.205 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | current | 1.000 / 1.200 | 16.0 / 16.0 | 60 / 60 | 0 |

The next-rAF timestamp and instrumentation-inclusive TaskDuration remain available as diagnostics in the raw data. Neither is reported as renderer CPU time or exact paint time.

### Retained heap for 2,400 mounted rows

Separate mount/unmount-only pages, forced GC, three cycles per block. Values exclude the loaded-fixture baseline. Unmounted residuals can include JIT caches, so they are not a leak diagnosis.

| Renderer | Median mounted JS heap delta, KiB | Median last-unmount residual, KiB | Last-unmount DOM node delta |
|---|---:|---:|---:|
| react | 665.3 | 120.2 | 0, 0, 0, 0, 0 |
| pre-animation | 748.5 | 50.6 | 0, 0, 0, 0, 0 |
| pre-rejection | 765.4 | 63.4 | 0, 0, 0, 0, 0 |
| native-stripped | 765.2 | 63.1 | 0, 0, 0, 0, 0 |
| current | 765.4 | 63.4 | 0, 0, 0, 0, 0 |

## Compatibility and scope

Each current variant is the source snapshot identified by its raw input hashes, not necessarily the latest working tree. Redact retains synchronous scheduling and intentional concurrency downgrades. Missing behavior can make a renderer cheaper, so equal fixture output does not imply equal functionality.

The [upstream audit](../docs/REACT_19_3_AUDIT.md) and [API support notes](../docs/REACT_19_3_SUPPORT.md) record current behavior and remaining gaps. Historical measurements retain their original API surface; consult the recorded source hashes rather than assuming every snapshot supports the latest additions.

These measurements do not cover tanstack.com or tannerlinsley.com, network/loading time, streaming Suspense waterfalls, input arriving during other work, field INP, memory allocation rate, or actual mobile hardware. A throttled desktop CPU is only a sensitivity check.
