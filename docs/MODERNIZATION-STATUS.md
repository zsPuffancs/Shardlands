# Modernization checkpoint: 2026-11-12

Base: develop / 88c8345, Node v26.13.0, Windows PowerShell.
No commit/push performed. No real saves/configuration regenerated or copied.

## Implemented

- Phase 0 audit and exact relocation map in module-domains.json and
  MODERNIZATION-PLAN.md.
- Phase 1: 44 backend modules under eight src/ domain directories; server.js and
  local-server.js stay at root. Old module paths are CommonJS compatibility
  re-exports; internal imports target implementations and shared public helpers.
- Root-anchored tunnel/Atlas asset defaults preserved. Source-inspection tests
  updated to read implementations, with all assertions retained.
- Root AGENTS.md, architecture/developer guides, source-only module-map script,
  five focused audit groups and potential-cycle reporting.
- New unit checks for export identity, map reproducibility, group targets and
  backend dependency boundaries; isolated integration startup/plugin/save/restart
  test using temporary stores.

## Actual verification

| Check | Result |
|---|---|
| Full original suite before relocation | 231 total, 222 pass, 9 fail |
| Per-domain focused migration batches | All eight groups passed after relocation |
| New architecture tests | 3/3 pass |
| Full suite after relocation | 234 total, 225 pass, same 9 failures |
| Original vs relocated implementation source | All 44 identical after normalizing relative require paths and the two root-path anchors |
| Isolated actual server | Plugins loaded; graceful IPC shutdown saved; restart reused identical seed/version/regions |
| Existing combat report | Executed successfully |
| Existing XP progression report | Executed successfully; Markdown/JSON exported |
| Existing gold report | Fails historical combat/XP equivalence assertion; same error reproduced on unmodified HEAD sources in an isolated directory |
| Generation stress | 100 cases; 0 invalid regions, 0 spacing/protected/boundary violations; 7 optional placement failures; seeded distribution checks passed |
| Focused documented balance command | 26/26 pass |
| Dependency CLI | Full export, all five groups and focused equipment view executed successfully |

The source comparison excluded only relative require path strings and the
necessary tunnel/Atlas root anchor substitutions, not mathematical expressions.
No gameplay formula, save field, protocol payload or public browser source changed.

Commands executed (report paths were temporary absolute paths):

```text
node --test tests/*.test.js
node --test tests/architecture.test.js tests/architecture-startup.test.js
node --test tests/architecture.test.js
node --test tests/architecture-startup.test.js
node --test tests/world-generation.test.js tests/danger-atlas.test.js
node --test tests/enemy-scaling.test.js tests/xp-region-levels.test.js tests/item-soft-cap.test.js
node scripts/combat-balance.js
node scripts/xp-balance.js --progression --out <temp.md> --json <temp.json>
node scripts/gold-balance.js --out <temp.md> --json <temp.json>
node scripts/world-generation-stress.js 100 <temp.json>
node scripts/module-map.js --out <temp.json>
node scripts/module-map.js --focus src/economy/equipment.js
node scripts/module-map.js --group <each-of-the-five-documented-groups>
```

Per-domain batches additionally covered movement-boundaries, xp-region-levels,
item-soft-cap, auto-affix, enemy-scaling, snapshot-deltas and
trade-journal-regressions. The isolated baseline gold reproduction used original
HEAD backend sources and the same historical Git objects; no estimates substituted.

## Pre-existing full-suite failures retained

These were present before any backend edit and remain unchanged afterward:

| Test location | Observed baseline / investigation |
|---|---|
| adventure-improvements.test.js:90 | Contract eligible-kill count expects 1, gets 2; older XP-gap expectation requires separate policy-aligned review |
| adventure-improvements.test.js:104 | Localization scan treats dynamic `adventure.category.` prefix as a complete catalog key |
| gold-rewards.test.js:87 | Artificial Stone drop fixture expects Souls but receives none under current encounter reward eligibility |
| safety-limits.test.js:18 | Expects deathGoldLoss cap 1, current intentional cap is 0.05 |
| safety-limits.test.js:22 | Artificial high-tier Stone drop fixture expects ten gear drops but current encounter eligibility returns zero |
| village-kit.test.js:143 | Existing Necropolis geometry fingerprint differs; golden fixture left intact |
| xp-economy.test.js:24 | Artificial Stone party fixture receives no XP under current encounter eligibility |
| xp-economy.test.js:194 | Stone category fixture likewise lacks an eligible lifecycle reward context |
| xp-progression.test.js:172 | Expects Stone guardians to be XP-free, contrary to latest intentional 30%/50% guardian reward policy |

These observations are not a claim that every failing test is incorrect or every
live gameplay path is bug-free. Resolve fixture/policy discrepancies separately;
do not silently weaken assertions or change rewards in an architecture migration.

## Pending: not implemented

Phases 2–7 remain beyond this verified relocation checkpoint:

- Typed Balance Registry and production-consumed configuration resolution.
- Normal/Hardcore/Accelerated/Custom Rulesets, validation and rates adapter.
- Live/restart/generation-locked/save-sensitive enforcement.
- Strict TypeScript build/typecheck and shared contracts.
- Unified deterministic simulation, forge Markov model, actual-Tier scenarios,
  configurable overrides, JSON/CSV/Markdown exports and explicit status policies.
- New Registry/simulation/statistical tests and final verification of those phases.

The approved implementation plan remains in MODERNIZATION-PLAN.md. The full
modernization is **not complete**. This checkpoint avoids mixing a large config/
typing/simulation rewrite into the already verified relocation, and preserves
baseline failures rather than concealing them.
