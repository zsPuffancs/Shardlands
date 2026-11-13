# Deterministic World Tier unlocks

Baseline: `b460c8072464aa5f26e5302660448b0ea039d0fa`, verified latest develop at task start. Implementation branch: `feature/deterministic-tier-unlocks`; no merge, push or save migration.

## Root cause and lifecycle

Boss arenas were already reserved first; that order is unchanged. The old V2 kill hook advanced worldTier and announced discovery before its callback could lazily generate a plan. Callback exceptions were logged without rollback, while activation retried the same invalid inputs. Failures can arise in progression assignment before final geometry/route validation.

New V2 flow: **boss defeated -> durable pending entitlement -> frozen inputs -> generate/validate -> deterministic retry -> durable ready plan -> coordinated Tier/history commit -> activate map -> remove pending receipt -> announce**. Live monsters still activate lazily around players. No future Tier is continuously precomputed.

`pendingUnlock` stores the original party/boss, history snapshot, frozen generation settings, descriptor/inputs, attempt cursor/end, selected ready plan and bounded diagnostics. It is created synchronously with the kill; all expensive generation runs outside the combat tick. A single short-lived serial Node worker is used, not a pool. Parent-resolved families/level rules are passed to it, preserving plugin template inputs. Existing geometry, danger, route and XP coverage validators must all pass; the required World Boss and supported plan/policy versions are checked explicitly.

## Determinism and bounds

Attempt 0 uses the original stream inputs and retains the original plan shape. Positive attempts domain-separate every placement/member/level stream using `generation-attempt-v1` plus the stable attempt ID. The universe seed, boss identity, descriptor, history snapshot and saved generation settings do not change. The selected attempt and complete plan are persisted and reused.

Default budget: 20 candidates; `config.json` -> `worldGeneration.unlockAttempts` is operational and bounded to 1..20. The run end/cursor persist, so a restart does not replenish a consumed budget. Explicit admin **`/retrytier`** extends the budget from the next unused attempt; server APIs are `retryPendingUnlock()`, `resumePendingUnlock()` and `unlockStatus()`. A timed-out/interrupted candidate has an unknown result and can be retried after recovery; a durably recorded invalid candidate is not repeated.

Each worker attempt has a 5 second deadline, with a 30 second preparation-run deadline; IO acknowledgement/cleanup can take longer, since durability is never skipped. Errors retain up to 40 attempt diagnostics (up to 32 error codes per candidate). No weakening fallback was added: lowering spacing or injecting populations would change frozen settings/budgets. Existing deterministic route/level repairs still run normally. Impossible inputs retain a `generation-failed` entitlement rather than advancing.

## Commit, recovery and compatibility

The existing coordinated WAL captures player rewards, the dead encounter, plugin data and the universe entitlement together before preparation. A valid plan is checkpointed in pending state before the Tier/history commit. History/firsts use the existing once-only Tier key; retries never call combat, reward or kill hooks again. Region objects, existing spawn plans and live spawnState references stay authoritative.

Uncertain persistence is never rolled back, since its WAL record might already be durable. Internal worldTier may contain the proposed committed value with a `committing` receipt, while identity, portal access, summaries and the Atlas remain gated at the previous acknowledged Tier. A separate in-memory gate also covers pending-receipt deletion IO. Only after acknowledgement is the map opened; the receipt cleanup is acknowledged before the discovery notification. Activation failures retain the receipt and retry idempotently. Startup resumes pending/ready/committing checkpoints; exhausted generation failures require explicit retry/repair. Shutdown and reseed suspend the worker safely.

A small supporting persistence fix drains standalone initialization writes queued before coordinateSaves installs its worker. Otherwise a late startup writer could overwrite a newer compacted checkpoint. This is covered with a deterministic barrier test. No WAL format or player save format changed.

V1 keeps its legacy synchronous path and golden output. Existing V2 plans are not regenerated. An already-unlocked historical descriptor with no plan is validated using original attempt 0 before a map/type is published; an invalid legacy descriptor fails closed and requires explicit operator repair, not an automatic rewrite. Old worlds already soft-locked before this change are not silently migrated or assigned a fabricated boss entitlement. Back up/recover all coordinated stores and sidecars before any explicit offline repair.

Fatal crashes before the entitlement is acknowledged can roll back unacknowledged progress as before. Recovery after acknowledgement retains the progression right; ready plans are reused. Live notifications are not an exactly-once cross-crash protocol: a crash after receipt cleanup but before sending may omit a toast; the durable history remains once-only. Physical power-loss guarantees retain the existing filesystem/device limitations.

## Verification

- `npm test`: **325/325 passed**, zero failures/skips (17.04 seconds in the retained final run).
- 17 new focused tests: attempt-zero identity, real first-invalid/second-valid XP regression, alternative reproducibility, impossible budgets, missing/unreachable bosses/policies, durable ordering, frozen history under retry, no partial activation, pending/ready/commit restart, fixed retry budget after crash, persistence/activation failures, unchanged saved plans, V1/founding behavior, WAL recovery, overlapping jobs, shutdown, cleanup visibility and startup-writer draining.
- First full run also exposed a pre-existing CRLF portability failure in the newly merged enemy-model hash test. Its reader now normalizes checkout line endings to canonical Git LF. Expected hashes and all golden fixtures are unchanged; the normalized hash matched the verified baseline Git blob.
- No public gameplay, combat/reward/economy modules or golden fixtures were modified. All test stores are disposable temporary stores.

Reproduce: `node scripts/tier-generation-stress.js 12` and `node scripts/tier-unlock-benchmark.js`. Optional final argument writes JSON. Full retained synthetic measurements: `tier-unlock-measurements.json`.

## Stress results

12 seeds x 3 Tiers (8, 40, 400) x 6 profiles = **216 cases**. All 216 attempt-zero results/errors matched the verified baseline generator. Every accepted candidate was fully validated and reproduced using its selected attempt.

| Profile | Valid | Safely exhausted | Recovered by retry | Highest accepted attempt ID |
|---|---:|---:|---:|---:|
| default | 36 | 0 | 0 | 0 |
| spacing500 | 36 | 0 | 0 | 0 |
| spacing700 | 36 | 0 | 18 | 17 |
| spacing1000 | 26 | 10 | 18 | 14 |
| extremeDanger | 36 | 0 | 0 | 0 |
| noNormals | 0 | 36 | 0 | 0 |

Total: 170 valid, 46 bounded failures, 36 recoveries through alternate candidates. These samples do not guarantee success for every seed/configuration. Zero-normal budgets remain mathematically impossible; some spacing-1000 inputs also exhausted all 20 attempts. Pending rights remain available for an explicit configuration/input repair. Simply retrying an impossible configuration cannot make it viable.

## Combat-tick impact

Environment: v26.13.0, AMD Ryzen 5 7600X 6-Core Processor. Synthetic stores include JSON capture but exclude physical disk IO and actual multiplayer/combat load. A 2 ms heartbeat measures observed scheduler stalls (including OS timer resolution), not hard realtime bounds. The synchronous comparison runs the same candidate budget on the main thread; it is not the old production kill hook, which did no eager validation.

| Scenario | Synchronous kill hook (ms) | Async preparation wall (ms) | Observed async timer stall (ms) | Synchronous-equivalent timer stall (ms) |
|---|---:|---:|---:|---:|
| normal | 0.39 | 122.56 | 13.88 | 75.86 |
| spacing700 | 0.10 | 376.75 | 17.13 | 314.36 |
| impossible | 0.08 | 528.96 | 15.20 | 420.27 |

Generation latency moves off the combat thread; worker startup/copying and durability add wall time. These observations are not player-capacity or FPS claims. Universe serialization and callbacks still consume main-thread time; large historical stores retain the limitations documented in PERFORMANCE-PERSISTENCE.md.

## Files changed

- `AGENTS.md`
- `docs/TIER-UNLOCK-RETRIES.md`
- `docs/tier-unlock-measurements.json`
- `scripts/tier-generation-stress.js`
- `scripts/tier-unlock-benchmark.js`
- `server.js`
- `src/server/persistence.js`
- `src/world/region-blueprint.js`
- `src/world/region-plan-preparer.js`
- `src/world/region-plan-retries.js`
- `src/world/region-plan-worker.js`
- `src/world/regions.js`
- `src/world/tier-transition.js`
- `src/world/universe.js`
- `src/world/world-atlas.js`
- `src/world/world-generation.js`
- `tests/enemy-models.test.js`
- `tests/tier-unlocks.test.js`
