# Shardlands: coding-agent guide

## Start here

- Backend: CommonJS JavaScript under `src/`; `server.js` composes services.
- Backend module imports must target `src/`; root compatibility wrappers were
  retired. Keep the intentional root launchers `server.js` and `local-server.js`.
- `local-server.js`, `start.bat`, `start.sh`: local launcher, console/restart/tunnel.
- `public/index.html`: browser entry, ordered global scripts; no frontend build.
- `dev-atlas/`: local-only Atlas UI; `src/world/world-atlas.js` serves it.
- `plugins/`: dynamically loaded plugins; preserve the API in `src/server/plugin-host.js`.
- `tests/`: native `node:test`; `scripts/`: reports and source-only dependency tooling.
- Read [ARCHITECTURE.md](docs/ARCHITECTURE.md) for responsibilities/formula locations,
  [DEVELOPMENT-AND-TESTING.md](docs/DEVELOPMENT-AND-TESTING.md) for exact commands and known failures.

## Focused context, including Ollama/Qwen3-Coder

Generate a machine-readable dependency map without loading game modules:

```text
node scripts/module-map.js --out module-dependencies.json
node scripts/module-map.js --focus src/economy/equipment.js
node scripts/module-map.js --group xp-and-progression
```

The five audit groups in `docs/module-domains.json` are:
`player-and-monster-scaling`, `xp-and-progression`, `equipment-and-forging`,
`gold-and-loot-economy`, `world-generation-and-difficulty`.
Start with a group and its direct dependencies, then inspect relevant tests.
Do not load the entire repository, generated map or save files into context.
`node scripts/audit-root-imports.js` checks for retired literal import paths and
lists dynamic calls for manual review (requires the TypeScript dev dependency).
Historical Git reports use scripts/historical-imports.js only within their virtual
modules; do not add root shims or process-wide require hooks for old source.
The map is a lexical scan, not a runtime trace; browser globals, injected
callbacks and plugin hooks require manual inspection. Reported cycles can be lazy.

## Cross-module contracts

- `server.js` owns initialization order, IDs and injected callbacks; factories may
  reference services created later. Preserve deferred invocation.
- Characters/equipment/enemy scaling form a deferred dependency cycle. World
  generation/danger/progression generation also form a static cycle.
- `public/{state-delta,settlement,forge-math,affix-math,affix-usage,bag-view}.js`
  are shared browser/Node UMD helpers. Preserve exports and script load order.
- Combat -> participation/reward policy -> loot/teams -> bounded currency credit.
  Preserve authoritative ownership, party sharing and once-only payouts.
- Persistence coordinates saves.json, plugin-data.json and universe.json through
  an fsynced incremental save-log.jsonl and v1 checkpoint redo journal, recovered
  before store opening. Never bypass claim durability. See docs/PERFORMANCE-PERSISTENCE.md.
  savePlayer replaces tracked character records; nested mutations to inactive saved
  records must explicitly replace/mark the record. Plugin/universe snapshots remain full.
  Full compaction runs in persistence-worker.js. Back up all stores AND recovery files.
  A failed tick exits to last-durable-state recovery; never save partial failed ticks.

## Balance Registry and Rulesets: implementation status

`src/balance/index.js` exposes resolveBalance(), resolveLiveUpdate(), settingMode()
and formulaCatalog(). Types/defaults/validation are authored in `src/balance/typed/`.
Precedence: Base -> named Ruleset -> config.json balance.overrides -> validation.
Normal/Hardcore/Accelerated/Custom initially inherit identical values.
Supported domains: rates, settlement, worldGeneration, forging, progression,
gold, loot, combat, monsters. Read docs/STABILIZATION.md for the exact supported
coefficients/consumers; other constants are a read-only default catalog.
XP requirement/gap curves, equipment stat/rarity/affix scaling and boss phase/party
policies still reject overrides. Never advertise a knob before all consumers use it.

server-config adapts legacy rates.json *after* this resolution, preserving numeric
hot reload, clamping, previous values on malformed input and bounded plugin/admin
writes. effectiveBalance() snapshots current rates. PORT overrides configured port.
Generation settings already stored in a universe and settlement project price
snapshots remain authoritative. Never apply live updates to locked settings.
Keep technical ceilings in safety-limits, separate from gameplay defaults.

## JavaScript / TypeScript boundary

Runtime remains CommonJS. TypeScript 5.9.3 is the only development dependency;
`npm ci`, `npm run build`, `npm run typecheck`. No runtime dependencies or ESM
migration. Authored TS: src/balance/typed/ and src/shared/typed/. Their generated/
siblings are committed CommonJS/declarations for build-free server startup.
Never hand-edit generated files. Build also emits public/resource-bars.js and
public/forge-math.js from shared TS sources; verify with `npm run check:shared-ui`.
Strict/noImplicitOverride checking applies to new TS, not the entire legacy JS
client. Preserve existing browser global/script order and shared UMD exports.
See docs/TYPESCRIPT-ROADMAP.md and docs/DOMAIN-REFACTOR-PLAN.md.

Resource arithmetic/presentation: src/shared/typed/resources.ts. Raw damage keeps
overkill and fractional values; display normalization clamps separately. World Boss
identity/template/category helpers: src/shared/typed/entities.ts. Spawn category
and summoned/anomaly reward category intentionally have different precedence.
Typed forge.ts owns pricing/transitions and the additive ForgeClientConfig network
boundary. New policy objects are immutable per server, injected into services;
worldInfo metadata must use those policies too. These policies require restart.

## Persistence and generation invariants

- Keep all runtime paths anchored at the repository root, never src/ or cwd.
- Preserve unknown/legacy save fields, existing equipment, currency and donations.
  Existing settlement project prices are persisted snapshots, not repricing inputs.
- Missing generator versions retain legacy behavior. Existing region descriptors,
  spawn plans and frozen history/settings remain authoritative; never regenerate
  existing worlds to apply configuration changes.
- Reuse seeded purpose-specific RNG streams and production geometry. No Date.now,
  Math.random or iteration-order dependence in deterministic generation changes.
- New V2 Tier unlocks go through world/tier-transition.js: persist the boss entitlement,
  prepare/validate in one short-lived region-plan worker, persist a ready plan, then
  durably commit before portal visibility/announcement. Never advance a new V2 Tier
  directly from a kill hook or rely on lazy activation to validate mandatory content.
  pendingUnlock freezes history/settings/inputs; /retrytier is admin-only and extends
  a bounded attempt budget without re-killing or replaying rewards. Attempt 0 retains
  the original streams; positive generationAttempt values domain-separate retries.
  Preserve saved plans/spawnState. Do not delete failed entitlements to force progress.
- World Tier, player level and item level are different axes; do not substitute one.
- Do not expose universe seeds, hidden encounters or Atlas diagnostics publicly.
- Tests/startup probes must use temporary isolated saves, never real player stores.

## Work rules

- Modify only the authorized scope. Do not rebalance XP, combat, rewards, forging,
  shops or generation to make tests/simulations pass. Ask before unrelated changes.
- Keep English filenames, identifiers and comments; preserve localized user text.
- Do not add/run tests, builds or linters unless the current user request authorizes
  them. The modernization task authorizes them; this is not blanket future approval.
- When authorized: `node --test tests/*.test.js`; focused integration:
  `node --test tests/architecture-startup.test.js`; generation:
  `node --test tests/world-generation.test.js tests/danger-atlas.test.js`.
- New checks: `npm run test:unit`, `npm run test:integration`,
  `npm run test:balance`, `npm run test:determinism`.
- Unified report: `npm run simulate:balance -- --ruleset Normal --json reports/balance.json --csv reports/balance.csv --markdown reports/balance.md`.
  Production helpers, exact forge Markov model and actual descriptor Tier ranges;
  modeled income is not measured farming telemetry. WARN is not a failed invariant.
- Existing reports: `node scripts/combat-balance.js`,
  `node scripts/xp-balance.js --progression`,
  `node scripts/world-generation-stress.js 100`.
  See the developer guide for exports and known report limitations.
- Never weaken assertions or rewrite golden fixtures to conceal regressions.
  Compare against the recorded pre-migration failures and their documented fixes;
  the nine historical failures are now resolved (docs/STABILIZATION.md).
- Do not commit/push, reset, discard work, migrate saves or regenerate worlds
  without authorization. Never include local saves, seeds, credentials or reports
  containing private game data in commits or agent context.
