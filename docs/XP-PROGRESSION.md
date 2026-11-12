# XP Penalty 2.0 and progression-aware frontier regions

Restart the server to apply the new XP curve. No reseeding, unlock, character reset or save migration is required. Newly created generator-v2 frontier descriptors pin `progressionVersion: 1`. Founding regions, generator-v1 worlds and already saved descriptors without that field retain their original generation policy, even if their spawn plan has not yet been materialized. Existing spawn plans are never overwritten. The new XP curve applies to all combat XP recipients, including in old regions.

## Authoritative reward math

`xp-economy.js` is the only reward implementation. Let `g = playerLevel - monsterLevel`. Between consecutive anchors `(a, A)` and `(b, B)`, the multiplier is `A + (B-A) * s((g-a)/(b-a))`, where `s(t) = 3t² - 2t³`. At every anchor the two segments meet with zero first derivative.

Overlevel anchors: `(5, 1)`, `(6, .95)`, `(10, .65)`, `(15, .30)`, `(20, .10)`, `(25, 0)`. Gaps through +5 have multiplier 1; gaps at least +25 have multiplier 0. For stronger enemies use their positive advantage `d = -g`: anchors `(10, 1)`, `(15, .90)`, `(25, .55)`, `(40, .22)`, `(60, .02)`. Through +10 enemy advantage the penalty factor remains 1. Beyond 60 it is `.02 / (1 + ((d-60)/10)²)`, continuous with zero derivative at 60 and tending to zero.

These are multipliers, not a promise of identical raw XP from different monster levels. The reward reference remains `min(monsterLevel, playerLevel+5)`; its level requirement is capped to `1.5 * Q(playerLevel)`. Existing category fractions, early taper, recipient encounter cap, rounding, Wisdom, server rates and plugin caps are unchanged. Mature equal-level normal/stone budgets remain 2.5% / 10%. Summoned guardians receive zero. Level 10000 receives zero new XP. Party membership cannot transfer another recipient's level eligibility: existing initial roster, contribution, session, distance, expiration and paid-HP allocation rules remain authoritative. Gold/drop sharing is independent of XP eligibility. Daily contracts retain their separate 13-level eligibility rule.

## Distribution policy 1

`universe.createRegionDescriptor` pins the policy only when creating a new frontier descriptor. `region-blueprint.buildRegionPlan` passes it into the shared production `world-generation.generateSpawnPlan`; `progression-generation.js` assigns the already placed encounters their levels. The plan keeps generator version 2 and adds a separate `progression` record. No player state or clock is an input.

For `N = maximum-minimum+1`, band boundaries are `minimum + round(N * cut)` (upper end exclusive). Empty bands near the level ceiling are removed and their remaining population weights renormalized.

| Population | Normalized boundaries | Population weights |
|---|---|---|
| Ordinary monsters | 0, .20, .46, .78, 1 | 35%, 35%, 20%, 10% |
| Spirit Stones | 0, .20, .50, .80, 1 | 30%, 40%, 20%, 10% |

This produces the specified normal bands 100–108 / 109–120 / 121–135 / 136–145 and stone bands 100–108 / 109–122 / 123–136 / 137–145 for a 100–145 region. Actual percentages vary with camp sizes, integer allocations, inaccessible optional encounters and bounded entry/coverage corrections. Underrepresented bands are reported rather than silently dropping encounters or breaking budgets.

Encounters are ranked by `0.75 * localDanger + 0.15 * normalizedPortalDistance + seededJitter[0,.10)`. Accessible and isolated optional populations are each distributed across the full set of bands, so inaccessible endgame sites do not steal all useful high-level sources. Within each band, encounter levels are stratified across its interval. Camp members vary by at most ±1 from their camp level, clipped to that band. Bosses use the region maximum. Alphas start 1–3 levels above their nearest camp, capped to the region maximum. This relates levels to danger without making distance the dominant factor; seeded unexpected danger remains possible.

Geometry, encounter budgets, spawn IDs, family/type selection, paths and protected areas use the existing generator streams unchanged. The independent `progression-levels` stream cannot perturb placement. A safe ordinary entry camp is anchored to the minimum. Coverage repairs may reassign redundant ordinary/stone encounters to missing progression segments without moving or replacing anything. Repairs are recorded in the plan and bounded to one iteration per supported level per population (at most 92 iterations for a 45-level span). If constraints still fail, generation throws `ProgressionGenerationError` with code `INVALID_PROGRESSION` and structured diagnostics. Zero or insufficient budgets are rejected rather than accepted as playable.

The planned stone level goes unchanged through encounter-runtime activation into `spawnMob({level})`, which already derives health, pulse scaling, XP and level-derived drops from it. Reload and respawn retain that level, health fraction, stone stage and existing cooldown state. Guardian waves in policy-1 zones inherit their parent stone's level, including Alphas. The existing summon service still marks them XP-free, caps their population and expires them. Legacy/founding guardian level rules are preserved.

## Coverage and accessibility

Validation inspects actual saved spawn levels, not expected distributions. At every integer player level in the region, except terminal level 10000, it requires at least four accessible ordinary monsters and one accessible stone with both:

- Production level-gap multiplier at least .65.
- Production prebonus solo reward at least 50% of that category's equal-level reward budget for that recipient.

Thus a theoretical positive but negligible award cannot satisfy coverage. Entry additionally requires four ordinary monsters at `minimum..minimum+5`, accessible through the safer entry flood. Bosses, Alphas and summons cannot satisfy ordinary progression. At level 10000 the report marks the segment terminal and checks encounter level suitability only; it does not promise XP beyond the cap.

Accessibility uses the authoritative danger field, including safe-route suppression and protected areas, on a fixed 33×33 grid. An eight-neighbor flood starts at the actual portal (or settlement when absent). Grid edges and endpoint connectors are sampled at intervals no longer than 25 game units. General approaches must stay below EXTREME danger (.85); entry approaches must stay below HIGH (.65). Every mandatory boss arena plus 30 units is excluded, so entry XP never requires boss defeat. An encounter connects through one of the surrounding nine reached grid nodes; near-grid narrow connections can therefore be recognized without an independent navigation implementation.

This approximation checks the approach to encounter centers on the existing flat gameplay terrain, not exact trajectories to every moving camp member. It does not model aggro, equipment, deaths, guardian clear time, player-built obstructions or combat DPS. Mandatory route geometry/spacing validation remains separate and still runs. The grid can conservatively reject very narrow passages. An impossible configuration returns diagnostics rather than retrying forever or changing danger geography to force success.

Diagnostics include band counts/percentages, actual min/max levels, reachable per-level normal/stone counts, gap intervals/largest gap, safe entry IDs, warnings, failed mandatory constraints, per-encounter accessibility and recorded corrections. Legacy inspection runs the same analysis read-only: errors are reported without migrating the region or invalidating its original geometry policy.

## Local World Atlas

Start `node server.js` and visit **http://localhost:3000/dev/atlas** (adjust the configured port). Enable Monster levels, Spirit Stone levels, Progression bands / endgame, or Accessible entry XP encounters. Band rings use green / gold / orange / red. Isolated optional encounters have a red fill. Hover/click shows saved levels, band, accessibility and entry eligibility; the side panel shows population percentages, largest gap and validation outcome. PNG export includes enabled layers. JSON validation export includes the complete `progression` report.

Persisted legacy regions are explicitly labeled report-only. Dry-run previews use the production policy, frozen startup history/range context and deterministic seeds without spawning monsters, unlocking tiers, changing history or writing saves. Existing loopback, Host, Origin, proxy and method checks are unchanged. Public responses contain no progression diagnostics, hidden spawn data or raw universe seed.

## Reproduce validation and balance tables

```powershell
node --test tests/xp-progression.test.js tests/xp-economy.test.js tests/xp-region-levels.test.js tests/world-generation.test.js tests/danger-atlas.test.js
node --test tests/*.test.js
node scripts/xp-balance.js --progression --out docs/XP-PROGRESSION-REPORT.md --json docs/XP-PROGRESSION-REPORT.json
```

The report executes the actual pre-update production XP module pinned to commit `25a1d0a2a39ad65d9571381d927d503a77ed88f2` and current production formulas. It includes representative signed gaps, low/high levels, XP per kill/minute/hour, normal/stone kills per level, every integer step through four generated region intervals, and equal-DPS solo/party comparisons. Kill-time and participation assumptions are explicit; none are presented as measured throughput. Existing `xp-balance.js` default mode remains available for the older economy audit.

The standalone new generation tests cover 48 seed/biome/span combinations (all six biomes, spans 20/25/35/45, ordinary and high levels), three capped ranges, low budgets, dense danger, inaccessible approaches, determinism, geometry identity, legacy immutability, previews, stone HP/XP/stages/reload/respawn, summon waves and numerical safety. Existing Atlas stress tests additionally exercise 120 inputs including very high tiers; zero-budget inputs now assert a structured failure.

The pre-change full suite had two existing failures: the bestiary localization-key scan in `adventure-improvements.test.js` and the dark-village geometry fingerprint in `village-kit.test.js`. They are outside this update and are not hidden or rewritten. The final validation outcome is recorded with the delivered change; these existing failures must not be described as a fully passing suite.

Final full-suite execution: **231 tests, 229 passed, 2 failed**. Both failures match the pre-change baseline (**219 tests, 217 passed, the same 2 failed**); no new failure was introduced. All 12 newly added tests passed, including real stone waves/reload/payout and the production before/after simulator. The relevant XP/world-generation/Atlas run before the final three test additions passed 59/59. Syntax and whitespace checks also passed. Browser visual verification was not performed.

## Files changed

| Files | Change |
|---|---|
| `xp-economy.js` | Shared smooth signed-gap curve; unchanged category/recipient/bonus limits |
| `progression-generation.js` | Versioned bands, bounded danger accessibility, assignment, repair and diagnostics |
| `world-generation.js`, `universe.js`, `region-blueprint.js` | New-descriptor policy pinning and production plan/validation integration |
| `combat.js` | Policy-1 stone guardians inherit parent levels; legacy policy preserved |
| `world-atlas.js`, `dev-atlas/atlas.js`, `dev-atlas/index.html` | Local diagnostic payload/export, overlays, level labels and coverage panel |
| `scripts/xp-balance.js`, `scripts/xp-progression-balance.js` | Production historical comparison mode and full-region progression simulation |
| `tests/xp-progression.test.js`, `tests/xp-economy.test.js`, `tests/xp-region-levels.test.js`, `tests/danger-atlas.test.js` | New and updated policy, runtime, party, save, HTTP and stress regressions |
| `README.md`, `docs/XP-ECONOMY.md`, `docs/XP-PROGRESSION.md` | Operation, exact math, authority and compatibility documentation |
| `docs/XP-PROGRESSION-REPORT.md`, `docs/XP-PROGRESSION-REPORT.json` | Generated before/after XP tables and machine-readable simulation results |
