# Modernization checkpoint: 2026-11-12

Initial base: develop / 88c8345, Node v26.13.0, Windows PowerShell.
Phase 1 was committed/pushed as 142ecac. The verified wrapper/typed architecture
checkpoint was subsequently committed and pushed as **5adfac7**. Stabilization
changes after that checkpoint remain local, per the current instruction. No real
saves/configuration regenerated or copied.

## Latest stabilization result

**271 tests, 271 passed, 0 failed**, compared with the 263/254/9 checkpoint.
All nine historical failures have documented causes/corrections in STABILIZATION.md;
no test was disabled and no production balance/geometry was changed to satisfy it.
Two lifecycle regressions and six real-consumer policy tests were added.

Build, strict typecheck and both shared-browser artifacts passed. Unit 36/36,
balance 57/57, deterministic generation 25/25 and isolated server/plugin/save/
launcher integration 4/4 passed.
Default and explicit Custom simulations through Tier 10000 ran with 73 PASS,
2 documented WARN, 0 FAIL; JSON/CSV/Markdown exports were produced.

New TS domain slice: src/shared/typed/forge.ts owns canonical pricing/outcomes and
ForgeClientConfig. Restart-required, validated policies now reach actual forge,
Wisdom XP, frontier gold/death references, random gear chance, recovery hits and
monster depth scaling, including client world metadata and simulation consumers.
Read-only equipment stat/affix/rarity and full XP/category/phase policies remain
explicitly rejected until their complete context/cache migration; see the roadmap.

## Previous verified modernization checkpoint (historical)

Root-wrapper cleanup: all 44 temporary compatibility files have now been removed.
131 static imports across 22 files and the vegetation helper were migrated to
src/. Historical Git reports use an isolated per-module resolver. Root entry points
server.js/local-server.js and the documented plugin init(api) contract remain.
Full audit/path map and external direct-import caveat: ROOT-WRAPPER-REMOVAL.md.
Latest full suite: **263 tests, 254 passed, same 9 baseline failures**, compared
against the verified 260/251/9 modernization checkpoint. Build/typecheck/shared UI
artifact passed; deterministic tests 25/25 and integration checks 4/4 passed.
Normal/Custom simulation JSON matches that pre-removal baseline exactly. The
tables below retain the previous modernization checkpoint for comparison.

- Typed immutable Registry with Normal/Hardcore/Accelerated/Custom resolution;
  configurable rates/settlement/worldGeneration, strict validation, classification
  and legacy numeric rate adapter. Other mathematical policies are explicitly
  read-only production catalog entries, not silently ignored override knobs.
- Strict TS defaults/contracts/validator and shared resource/entity components.
  Committed generated CommonJS/browser outputs keep build-free launch working.
  TypeScript 5.9.3 is the only development dependency; no runtime framework added.
- Deterministic reusable simulation with real production helpers, actual Tier
  ranges, forge Markov model, reward/party/drop projections, Stone lifecycle
  ceilings, generation validation and JSON/CSV/Markdown exports.
- Shared HP/mana/XP presenter for HUD, target, team and entity nameplates. Existing
  CSS/transitions/rounding remain; zero/invalid display values clamp safely.
  Authoritative resource arithmetic preserves negative overkill and fractions.
- Shared World Boss identity/template/category/progression helpers with unchanged
  RNG draw order, identifiers, proper names and v1/v2 serialized fixtures from
  commit 142ecac. Differing summon/anomaly reward rules stay separate.
- Updated agent/dependency/developer guides and scoped remaining TS/UI roadmap.

| Final check | Actual result |
|---|---|
| npm ci --ignore-scripts --no-audit --no-fund | Passed after enabling Windows system CA trust on this Node 26 environment |
| npm run build / npm run typecheck / npm run check:shared-ui | Passed |
| npm run test:unit | 25/25 passed |
| npm run test:integration | 4/4 passed, including actual server/local launcher, plugins, save/restart, Rulesets and pinned projects/generation |
| npm run test:balance | 49/49 passed |
| npm run test:determinism | 25/25 passed |
| Full suite after Registry/simulator | 251 total, 242 passed, same 9 baseline failures |
| Full suite after resource/World Boss refactor | 260 total, 251 passed, same 9 baseline failures |
| Component VM tests | Actual generated UMD and HUD function executed against instrumented DOM; no manual screenshot/interactive visual claim |
| Deterministic before/after fixtures | v1/v2 descriptor/name/ID/geometry fixtures at Tiers 8, 100, 10000 match 142ecac |
| Default unified simulation | 73 PASS, 2 WARN, 0 FAIL; warnings are documented telemetry/absent-defense limitations |
| Alternative presets/custom exports | Hardcore range and Custom override example ran; JSON/CSV/Markdown emitted; no failed invariants |

At this historical checkpoint, logs/reports were local ignored files in reports/,
and the nine baseline failures still blocked a wholly green suite. They have now
been corrected with the provenance/fixture fixes documented in STABILIZATION.md;
no test was disabled and no production balance/geometry change hid a regression.

## Scope and risks recorded at that historical checkpoint

- Registry policy overrides for XP/forge/equipment/combat coefficients are not
  implemented; only the explicitly supported configuration domains accept patches.
  Future policy migration must wire all real consumers before accepting a knob.
- No wholesale TS/client conversion or abstract entity inheritance hierarchy.
  Inventory cells/tooltips/status effects/notifications and typed snapshot/service
  boundaries remain scoped roadmap items (DOMAIN-REFACTOR-PLAN.md, TYPESCRIPT-ROADMAP.md).
- Simulator income is an analytical single-target projection, not measured live
  farming/clearing income. Economic preference thresholds were not invented.
- Legacy historical gold report still has its pre-existing combat/XP reference
  assertion failure; the new simulator does not fabricate OLD/NEW comparisons.

## Historical phase-1 checkpoint

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

## Historical phase-1 verification

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

## Historical nine-failure baseline (now resolved)

These were present before modernization and retained at commit 5adfac7. They have
since been resolved locally as documented in STABILIZATION.md; this table preserves
the original observations rather than an expected-failure policy:

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

The original phase plan remains in MODERNIZATION-PLAN.md. Current implemented
scope and remaining migration items are recorded at the top of this document;
the historical phase-1 table is retained to make regression comparisons explicit.
