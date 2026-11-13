# Performance and persistence engineering

## Phase 1: spatial queries and multiplayer

Baseline: `3987df6` on develop. Synthetic isolated entities; no real saves, sockets or plugins.

Root causes: unconditional sorting with per-comparison membership lookups; repeated ordering of snapshot candidates; rebuilding identical map-local rows for every receiver; scanning all events for every receiver.

The spatial index retains insertion priority by default. Ordered cell-range membership is cached, bounded to 64 ranges / 65,536 references, and invalidated on add/remove/cell transitions. Exact positions are always filtered anew. Unordered monster snapshot queries use the existing distance/ID ordering. Crowded monster selection uses an exact bounded nearest-420 heap, computes distances once and retains the original distance/ID ordering. Wake checks short-circuit; aggro, AI processing, skill ties and pickup priorities retain their order. Snapshot row caches live for one publication and one map only; ownership, connection deltas, far-player throttling and send recovery remain private. Event bucketing preserves source order and explicitly filters regions.

### Reproduction

`node --expose-gc scripts/performance-benchmark.js --samples 30`

Use `--baseline-ref 3987df6` with the same script to load the historical spatial index, publisher and simulation together; `--root <baseline-checkout>` is also supported. Node v26.13.0, win32, AMD Ryzen 5 7600X 6-Core Processor             . 10 warmups and 30 measured rounds per scenario, 3,400 monsters, 1,000 loot entities, 200 events, all delta features negotiated. Each round measures 100 ordered spatial queries, a publication including JSON serialization/byte counting, and the production simulation tick including publication. Simulation uses idle archer bots, no-op damage/loot callbacks, real AI traversal and regeneration. It excludes actual sockets, plugin execution and pickup processing. Crowded entities lie around one fight; distributed positions span the founding coordinate plane. Timers yield between rounds. CPU is process CPU / elapsed time, normalized to one core; GC is observed V8 GC time, not allocated bytes. Heap delta is retained/transient heap change, not an allocation counter.

Raw P50/P95/P99, event-loop delay, CPU, memory, GC and serialized bytes are in `performance-measurements.json`. Both retained runs ran without another benchmark or test process alongside them.

| Players | Layout | Query 100 P50 before/after (ms) | Snapshot P50 before/after (ms) | Tick P50 before/after (ms) |
|---|---|---|---|---|
| 50 | crowded | 20.98 / 5.42 | 68.09 / 36.55 | 79.02 / 40.40 |
| 100 | crowded | 23.76 / 6.96 | 141.27 / 88.28 | 160.78 / 97.60 |
| 200 | crowded | 26.58 / 6.94 | 287.94 / 173.33 | 322.01 / 184.64 |
| 300 | crowded | 21.70 / 6.04 | 427.34 / 266.85 | 485.11 / 290.44 |
| 50 | distributed | 7.47 / 0.81 | 4.79 / 4.36 | 8.88 / 5.03 |
| 100 | distributed | 7.10 / 5.01 | 8.85 / 9.52 | 16.06 / 15.11 |
| 200 | distributed | 7.19 / 5.60 | 19.88 / 19.68 | 36.68 / 29.33 |
| 300 | distributed | 7.35 / 5.17 | 31.57 / 31.76 | 52.01 / 46.44 |

These are measured workloads, not player-capacity claims. The dense scenario is still over the 50 ms tick budget; JSON encoding, per-observer distance selection and per-connection delta comparison remain expensive. The design does not cache final observer visibility or share connection baselines. No gameplay caps, generation changes or protocol fields were introduced.

### Regression coverage

`tests/spatial-performance.test.js`: 2,500 seeded add/move/replace/remove operations against brute force, ordered/unordered equivalence, short-circuit checks, shared wire-row equivalence, fresh rows across ticks, event ordering/draining and region isolation/transitions. Existing combat/aggro/pickup, full/delta, throttling and blocked-send tests remain unchanged. Full suite at the initial phase checkpoint: 282/282 passing; the additional nearest-420 oracle was then added, and the final integrated suite is 298/298 with no skipped tests.

## Phase 2: incremental persistence and controlled crash recovery

### Previous guarantees and root causes

The original coordinator cloned every store with JSON.parse(JSON.stringify(...)), serialized the full journal again, then serialized each store again. It queued concurrent saves and replayed a v1 redo journal before loading stores. Rename-based grouped recovery protected against a partially replaced wallet/world pair, but writes were not fsynced. Adventure claims already persisted an entitlement before payout and a paid receipt afterward; those ordering and gameplay rules are preserved. Autosaves ran every 10 seconds, with explicit durable saves for actions. The tick had no error boundary; the local launcher only restarted an explicitly requested restart.

### Implementation and decisions

- `server.js` enables the incremental background coordinator. `savePlayer` replaces tracked records; all active players are captured synchronously at the checkpoint boundary. Offline historical records are not traversed or reserialized on each action. Unknown player-record fields survive replacement.
- The small compatibility coordinator serializes each store once; existing custom writer injection and v1 journals remain supported. Production uses one built-in Node worker, with no new dependency or native installation step.
- Each coordinated transaction contains changed/deleted player records plus plugin/universe changes. The main thread freezes the JSON text once before IO; mutations during IO cannot alter that transaction. A 25 ms coalescing window batches concurrent requests. A save requested during IO is captured before the shared pending promise resolves, matching the old durability contract. The worker suppresses unchanged records and empty transactions.
- `save-log.jsonl` contains checksummed v2 coordinated transactions. An append is flushed with fsync before acknowledgement. One worker serializes all writes; an uncertain write rejects waiters, restores dirty markers and fails closed for future writes until restart/recovery. No overlapping writers are spawned. This assumes one server process per save directory, as before.
- Compaction runs off the main thread after 128 transactions or 8 MiB of log data, and during graceful shutdown. It emits the original v1 full redo journal, fsyncs it, atomically replaces/fsyncs each legacy JSON store, then clears the log and journal. State replacement makes redo and log replay idempotent. Checkpoint bytes remain normal JSON, not a new player save format.
- Recovery accepts old saves and v1 journals, validates complete log records/checksums, and ignores only an interrupted final line. Complete corrupt records stop startup and preserve evidence. Recovery itself writes a v1 redo before replacing stores.
- Tick throws and uncaught/asynchronous failures stop the process with code 70 and recover the last acknowledged transaction. The design deliberately does not continue or save a partially mutated failed tick: a final save there could persist only half a reward/trade operation. Healthy shutdown cancels jobs, closes input, drains saves and compacts, with a 10 second deadline. Save/startup failures exit 74 without automatic restart. Existing intentional restart code 75 remains unchanged.
- The local launcher restarts crashes with 0.5/1/2/4/8 second delays, at most five per ten minutes. Persistent faults stop instead of spinning indefinitely. Plain `node server.js` exits on a fatal error; automatic supervision is provided by `node local-server.js` / npm run dev (or an external supervisor).

The worker/log approach was selected over only reducing stringify passes because that would still scan all historical inventories on every action. Per-character files or a database would require a broader storage migration; this retains the existing coordinated JSON checkpoints and adds a recoverable incremental sidecar. No XP, combat outcomes, prices, rewards, spawning or generation formulas were changed.

### Persistence reproduction and measurements

`node --expose-gc scripts/persistence-benchmark.js --baseline-ref 3987df6`

`node --expose-gc scripts/persistence-benchmark.js`

Both commands run sequentially in disposable OS temporary directories, use the same synthetic dataset and production coordinator, and remove all generated stores. Node v26.13.0, AMD Ryzen 5 7600X 6-Core Processor             . Each character has 90 equipment objects; 10 characters are active/dirty. Workloads: one save, 25 simultaneous durable requests, another save arriving during a pending save, then a final small save. The baseline must perform five full checkpoints; the new coordinator can capture the two pending requests together. Both must persist the final state. A 1 ms timer measures the largest observed scheduling stall; this is not a CPU profiler or a hard upper bound. Latencies include coalescing and IO. RSS includes the worker; heap/GC observations are from the main isolate, while process CPU includes worker work. Raw measurements are in `persistence-measurements.json`.

| Characters | Main-thread stall before/after (ms) | First save before/after (ms) | Final small save before/after (ms) | Full background compaction (ms) |
|---|---|---|---|---|
| 100 | 14.32 / 15.72 | 22.89 / 66.08 | 17.49 / 36.59 | 55.93 |
| 1000 | 125.96 / 15.20 | 168.54 / 136.80 | 143.88 / 37.54 | 92.41 |
| 10000 | 1452.43 / 15.61 | 1887.63 / 838.04 | 1820.39 / 37.22 | 445.17 |

At 10,000 characters the largest observed main-thread stall falls 98.9%. The steady small-save latency falls 98.0%. The dataset is 151.52 MB. Estimated baseline bytes written for these five full checkpoints are 1515.18 MB versus 1.01 MB measured incremental log growth before compaction; baseline byte accounting excludes tiny plugin/world metadata and is explicitly an estimate. A compaction additionally writes the full legacy data twice (redo plus stores), so it is not free. The log is bounded by compaction thresholds plus one transaction, with another full checkpoint/temporary file set during compaction.

At 10,000 characters, measured process CPU is 14704 -> 1141 ms; RSS is 925.9 -> 1000.3 MB. Main-isolate GC observation is 438.6 -> 0.0 ms. This is a speed/responsiveness improvement with an explicit worker-memory cost, not a claim that all memory usage decreased. Small datasets can be slower due to the batching window, thread startup and fsync.

### Verification and limitations

Final complete suite: **298/298 passed**, no skips (24.72 seconds in the retained final run). Existing startup integration saves/restarts the actual server and launcher from isolated stores; deterministic generation, Atlas and approved fixtures passed unchanged. New tests cover record compatibility and unknown fields, concurrent requests during IO, deletions and prototype-like keys, interrupted log tails, checksum failure, abrupt writer termination between store renames, process exit immediately after durable acknowledgement, actual duplicate adventure claims across recovery, serialization and worker IO failures, fatal tick/async boundaries, shutdown timeout/failure, and the real launcher consuming its bounded restart policy. The shutdown test dependency mock was updated for the new policy module. An unrelated pre-existing guardian test had nondeterministic critical hits that could legitimately one-shot its Stone; its random input is now fixed without weakening assertions or changing gameplay. The first full phase-2 run exposed these two fixture issues (295/297); neither failure was skipped or hidden.

Remaining limits: online record capture still costs O(active inventory size), plugin/universe snapshots remain synchronous and full, and cold startup/recovery still loads historical JSON on the main thread. Full worker compaction and its cached historical strings consume memory proportional to total history; the legacy monolithic format still has V8 string-size limits at much larger datasets. No user creation cap, history pruning, adaptive scheduling, binary protocol or database migration was introduced. Sustained concurrent save storms can prolong the shared pending promise while additional checkpoints drain. Unacknowledged progress since the last autosave/durable action can be lost on a crash; acknowledged transactions survive the tested process-crash boundaries. File fsync cannot guarantee against faulty storage/firmware, and Windows lacks directory fsync through Node, so sudden power-loss guarantees depend on the OS/filesystem/device. Tests terminate processes/writers and interrupt real file boundaries; they do not emulate hardware power loss.

### Operations and rollback

Do not delete `save-log.jsonl` or `save-journal.json` to work around an error. Stop the server and back up saves.json, plugin-data.json, universe.json **and both recovery sidecars together**; all are ignored by Git. Never run two servers against the same save directory. For a rollback to code that does not understand v2 logs, first use this version to recover and gracefully shut down/compact; then verify the log is empty and no redo is pending. Existing worlds, seeds, descriptors, spawn plans and approved fixtures require no regeneration.

### Files and responsibilities

- Spatial/network: src/shared/spatial-index.js; src/combat/simulation.js (wake existence check only); src/multiplayer/snapshots.js.
- Persistence: src/server/persistence.js; persistence-worker.js; save-log.js; durable-files.js.
- Lifecycle: src/server/server-lifecycle.js; restart-policy.js; root local-server.js and server.js wiring.
- Tests: spatial-performance.test.js; persistence-engineering.test.js; lifecycle-recovery.test.js; the two fixture/mock fixes in auto-affix.test.js and xp-progression.test.js.
- Reproduction/reporting: scripts/performance-benchmark.js; scripts/persistence-benchmark.js; this report and synthetic measurement JSON files.
- Documentation/operations: AGENTS.md; docs/ARCHITECTURE.md; .gitignore.

## Summary comparison

| Component | Before | After | Improvement | Conditions |
|---|---|---|---|---|
| Spatial queries | 21.70 ms | 6.04 ms | 72.2% lower | 300 crowded players; same warmed workload, P50; 100 queries |
| Multiplayer snapshots | 427.34 ms | 266.85 ms | 37.6% lower | 300 crowded players; same warmed workload, P50 |
| Simulation tick | 485.11 ms | 290.44 ms | 40.1% lower | 300 crowded players; same warmed workload, P50 |
| Persistence | 1452.43 ms | 15.61 ms | 98.9% lower | Largest observed main-thread stall; same 10,000-character dataset |

Repeated primary runs showed scheduling/runtime variance; the retained final historical baseline and optimized workloads use the same script and deterministic inputs. The final allocation cleanup was remeasured against that baseline. Per-layout raw values remain visible, including low-density cases with smaller or absent gains. Caches and explicit map isolation add bookkeeping overhead when there is little shared work; no claim of universal speedup or increased player capacity is made. Dense snapshots still exceed the tick budget despite the reduction.

### Allocation sampling (separate from latency measurements)

`node --expose-gc scripts/performance-benchmark.js --players 300 --samples 5 --sample-allocations --baseline-ref 3987df6`

Repeat without `--baseline-ref` for the optimized code. These separate runs enable Node inspector allocation sampling at 32 KiB, including objects collected by minor/major GC; sampling adds overhead, so their latency numbers are not substituted into the primary table. Values below are **statistical allocation estimates** from sampled main-isolate allocations over 15 rounds (10 warmup + 5 measured), not exact allocated-byte counters. They include query, publisher, simulation and harness allocations. GC duration/count and heap/RSS for every primary layout/player count are available in the primary raw JSON; allocation profiles are in `allocation-measurements.json`.

| 300-player layout | Estimated allocated MB before | Estimated allocated MB after |
|---|---|---|
| crowded | 9248.51 | 9214.96 |
| distributed | 1088.50 | 1010.78 |

This implementation targets repeated sorting and latency, and adds bounded membership/row caches plus temporary heap-selection score arrays. Inspect the allocation estimates and GC/retained memory separately; neither cached rows nor a faster tick imply all allocation or memory metrics improve.

For the retained 300-player crowded primary window, process CPU utilization is 100.2% -> 96.3% of one core while completing the same number of rounds in less time; these are deliberately saturated synthetic runs, not idle utilization. Observed GC time is 557.5 -> 525.1 ms, with 762 -> 779 GC entries. RSS is 275.5 -> 256.2 MB; cache memory is bounded, not zero.

Phase 1 implementation commit: `4808653` (`perf(multiplayer): cache ordered spatial ranges and per-tick snapshot rows`). Phase 2 is the separate persistence commit containing the completed report and final measurement artifacts; use `git log -2 --oneline` on the feature branch.
