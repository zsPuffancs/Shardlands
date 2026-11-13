# Performance and persistence engineering

## Phase 1: spatial queries and multiplayer

Baseline: `3987df6` on develop. Synthetic isolated entities; no real saves, sockets or plugins.

Root causes: unconditional sorting with per-comparison membership lookups; repeated ordering of snapshot candidates; rebuilding identical map-local rows for every receiver; scanning all events for every receiver.

The spatial index retains insertion priority by default. Ordered cell-range membership is cached, bounded to 64 ranges / 65,536 references, and invalidated on add/remove/cell transitions. Exact positions are always filtered anew. Unordered monster snapshot queries use the existing distance/ID ordering. Wake checks short-circuit; aggro, AI processing, skill ties and pickup priorities retain their order. Snapshot row caches live for one publication and one map only; ownership, connection deltas, far-player throttling and send recovery remain private. Event bucketing preserves source order and explicitly filters regions.

### Reproduction

`node --expose-gc scripts/performance-benchmark.js --samples 30`

Use the same script with `--root <baseline-checkout>` for the baseline. Node v26.13.0, win32, AMD Ryzen 5 7600X 6-Core Processor             . 10 warmups and 30 measured rounds per scenario, 3,400 monsters, 1,000 loot entities, 200 events, all delta features negotiated. Each round measures 100 ordered spatial queries, a publication including JSON serialization/byte counting, and the production simulation tick including publication. Simulation uses idle archer bots, no-op damage/loot callbacks, real AI traversal and regeneration. It excludes actual sockets, plugin execution and pickup processing. Crowded entities lie around one fight; distributed positions span the founding coordinate plane. Timers yield between rounds. CPU is process CPU / elapsed time, normalized to one core; GC is observed V8 GC time, not allocated bytes. Heap delta is retained/transient heap change, not an allocation counter.

Raw P50/P95/P99, event-loop delay, CPU, memory, GC and serialized bytes are in `performance-measurements.json`. Both retained runs ran without another benchmark or test process alongside them.

| Players | Layout | Query 100 P50 before/after (ms) | Snapshot P50 before/after (ms) | Tick P50 before/after (ms) |
|---|---|---|---|---|
| 50 | crowded | 13.59 / 4.07 | 51.73 / 44.51 | 58.97 / 47.88 |
| 100 | crowded | 16.39 / 4.04 | 110.39 / 91.69 | 122.50 / 97.49 |
| 200 | crowded | 18.87 / 4.20 | 225.18 / 190.36 | 247.48 / 200.38 |
| 300 | crowded | 18.46 / 3.90 | 339.84 / 291.34 | 383.05 / 307.13 |
| 50 | distributed | 5.19 / 0.55 | 3.19 / 2.79 | 6.21 / 3.26 |
| 100 | distributed | 5.33 / 3.48 | 6.53 / 5.93 | 12.07 / 10.16 |
| 200 | distributed | 5.21 / 3.58 | 13.64 / 13.44 | 24.56 / 21.28 |
| 300 | distributed | 5.36 / 3.54 | 22.45 / 20.51 | 39.05 / 32.00 |

These are measured workloads, not player-capacity claims. The dense scenario is still over the 50 ms tick budget; JSON encoding, per-observer distance selection and per-connection delta comparison remain expensive. The design does not cache final observer visibility or share connection baselines. No gameplay caps, generation changes or protocol fields were introduced.

### Regression coverage

`tests/spatial-performance.test.js`: 2,500 seeded add/move/replace/remove operations against brute force, ordered/unordered equivalence, short-circuit checks, shared wire-row equivalence, fresh rows across ticks, event ordering/draining and region isolation/transitions. Existing combat/aggro/pickup, full/delta, throttling and blocked-send tests remain unchanged. Full suite: 282/282 passing after this phase; no skipped tests.
