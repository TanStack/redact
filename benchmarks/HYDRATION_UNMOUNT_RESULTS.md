# React and Redact performance measurements

Measured September 9, 2026. Negative time changes favor Redact. These are workload-specific results, not a whole-app speedup or a compatibility guarantee. [Method and reproduction](./README.md).

## Chrome, CPU slowdown 1x

Apple M5 Pro; Chrome 152.0.7977.83; 5 independent browser blocks, 5 timed rounds per workload per block. [Raw results](./results/hydration-unmount-cpu1.json).

| Workload | react ms/iteration | before-fixes ms/iteration | current ms/iteration | Current vs React, 95% interval |
|---|---:|---:|---:|---|
| keyed-reverse | 0.165 | 0.112 | 0.113 | -31.6% [-32.8%, -27.1%] |
| props-updates | 0.262 | 0.261 | 0.257 | -1.4% [-3.0%, +0.1%] |
| mount-unmount | 0.159 | 0.245 | 0.212 | +35.9% [+35.3%, +40.7%] |
| browser-ssr | 0.041 | 0.045 | 0.045 | +9.1% [+1.6%, +14.6%] |
| jsx-props-updates | 0.246 | 0.235 | 0.229 | -5.1% [-7.8%, -4.3%] |
| context-through-memo | 0.078 | 0.050 | 0.050 | -36.2% [-37.1%, -34.1%] |
| stable-keyed-rows | 0.049 | 0.046 | 0.046 | -7.8% [-11.3%, -5.5%] |
| null-siblings | 0.097 | 0.089 | 0.085 | -13.7% [-14.7%, -12.0%] |
| sparse-setters | 0.009 | 0.002 | 0.002 | -74.7% [-75.4%, -74.3%] |
| jsx-stable-keyed-rows | 0.048 | 0.041 | 0.041 | -14.9% [-16.1%, -7.2%] |
| passive-effects | 0.027 | 0.030 | 0.030 | +7.9% [+4.7%, +14.1%] |
| controlled-selects | 0.156 | 0.135 | 0.134 | -11.8% [-14.6%, -11.0%] |
| deep-tree-props | 0.014 | 0.009 | 0.009 | -35.2% [-36.9%, -30.2%] |
| batched-setters | 0.055 | 0.040 | 0.040 | -27.9% [-31.0%, -25.0%] |
| mixed-depth-setters | 0.240 | 0.098 | 0.097 | -59.6% [-60.9%, -58.3%] |
| hydration | 0.212 | 0.234 | 0.246 | +15.9% [+12.1%, +22.8%] |

An iteration is one complete workload batch, not one leaf update. Intervals are exploratory and are not corrected for multiple comparisons.

Identical-React control: median absolute time difference across workloads 0.9%; largest difference +1.7% [+0.6%, +4.0%] on mount-unmount. Small differences need repeat confirmation.

Control intervals extending beyond 5%: sparse-setters +1.1% [-7.8%, +5.6%]; deep-tree-props +0.5% [-8.3%, +5.9%]; mixed-depth-setters -1.0% [-5.4%, +1.2%]. These expose run-to-run sensitivity even when the pooled control estimate is small.

| Workload | Current vs before-fixes |
|---|---:|
| keyed-reverse | -0.5% [-1.6%, -0.2%] |
| props-updates | -1.2% [-1.7%, -0.1%] |
| mount-unmount | -12.7% [-13.2%, -11.2%] |
| browser-ssr | +0.3% [-0.6%, +1.3%] |
| jsx-props-updates | -1.0% [-1.7%, -0.1%] |
| context-through-memo | -0.4% [-1.6%, +0.3%] |
| stable-keyed-rows | -0.9% [-1.4%, -0.3%] |
| null-siblings | -4.3% [-5.2%, -3.4%] |
| sparse-setters | -0.9% [-2.1%, +0.8%] |
| jsx-stable-keyed-rows | -1.3% [-2.2%, +0.2%] |
| passive-effects | -1.1% [-3.0%, -0.6%] |
| controlled-selects | -1.3% [-1.4%, -0.6%] |
| deep-tree-props | -1.7% [-2.9%, +0.1%] |
| batched-setters | -0.3% [-1.8%, 0.0%] |
| mixed-depth-setters | -0.5% [-2.1%, -0.1%] |
| hydration | +5.2% [-0.5%, +6.8%] |

### Mount/unmount render counts

Each cycle mounts once and removes the subtree once. An extra component render during removal is unwanted work, even when final DOM and effect counts match.

| Renderer | Component renders per cycle, observed range |
|---|---:|
| react | 1 to 1 |
| before-fixes | 2 to 2 |
| current | 1 to 1 |

### Normal-scheduling clicks

Automatic JSX, trusted clicks, no forced flush in the handler. Event Timing durations are browser-rounded observations, not field INP. An absent event entry is not zero latency.

| Scenario | Renderer | Handler-to-commit median / p95 ms | Observed click duration median / p95 ms | Event entries / clicks | Long tasks in event window |
|---|---|---:|---:|---:|---:|
| click-240 | react | 0.200 / 0.400 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | before-fixes | 0.200 / 0.300 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-240 | current | 0.200 / 0.300 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | react | 1.200 / 1.400 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | before-fixes | 1.000 / 1.200 | 16.0 / 16.0 | 60 / 60 | 0 |
| click-2400 | current | 1.000 / 1.200 | 16.0 / 16.0 | 60 / 60 | 0 |

The next-rAF timestamp and instrumentation-inclusive TaskDuration remain available as diagnostics in the raw data. Neither is reported as renderer CPU time or exact paint time.

### Retained heap for 2,400 mounted rows

Separate mount/unmount-only pages, forced GC, three cycles per block. Values exclude the loaded-fixture baseline. Unmounted residuals can include JIT caches, so they are not a leak diagnosis.

| Renderer | Median mounted JS heap delta, KiB | Median last-unmount residual, KiB | Last-unmount DOM node delta |
|---|---:|---:|---:|
| react | 665.1 | 120.1 | 0, 0, 0, 0, 0 |
| before-fixes | 752.2 | 50.9 | 0, 0, 0, 0, 0 |
| current | 737.0 | 44.7 | 0, 0, 0, 0, 0 |

## Compatibility and scope

Each current variant is the source snapshot identified by its raw input hashes, not necessarily the latest working tree. Redact retains synchronous scheduling and intentional concurrency downgrades. Missing behavior can make a renderer cheaper, so equal fixture output does not imply equal functionality.

The [upstream audit](../docs/REACT_19_3_AUDIT.md) records the latest fixes and remaining gaps. New Fragment refs, ViewTransition, addTransitionType, browser() and onBrowserBailout are not implemented by these performance passes.

These measurements do not cover tanstack.com or tannerlinsley.com, network/loading time, streaming Suspense waterfalls, input arriving during other work, field INP, memory allocation rate, or actual mobile hardware. A throttled desktop CPU is only a sensitivity check.
