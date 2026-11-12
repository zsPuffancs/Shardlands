# Shardlands: coding-agent guide

## Start here

- Backend: CommonJS JavaScript under `src/`; `server.js` composes services.
- Root backend files are compatibility re-exports. Edit implementations in `src/`.
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
  a redo journal recovered before store opening. Never bypass claim durability.

## Balance Registry and Rulesets: implementation status

**Not implemented yet:** typed Balance Registry, Ruleset resolver, TypeScript
toolchain and unified simulation engine. Do not import or document imaginary APIs.
The approved next-phase plan is in `docs/MODERNIZATION-PLAN.md`.
Planned precedence is Base -> Ruleset -> server overrides -> validated effective
balance; Normal/Hardcore/Accelerated/Custom must initially retain current values.

Today defaults are domain constants (see ARCHITECTURE.md). `server-config.js`
loads config.json over server defaults; rates.json overrides recognized finite
numeric rate keys, with safety-limits bounding assignment. Rates hot-reload;
omitted/malformed updates keep previous values. Plugins/admin commands can mutate
the same bounded rates object. PORT overrides configured port. There is no
current Ruleset layer. Keep technical safety limits separate from balance knobs.

## JavaScript / TypeScript boundary

Current runtime is CommonJS JS; there is no package.json, tsc, ESM migration or
build command. Do not rename files to TS without a runnable build/interoperability
path. New TS work must use strict checking and emit compatible CommonJS, retain
JS entry points and avoid changing browser UMD modules. Distinguish authored and
generated code. Do not add dependencies without a concrete need.

## Persistence and generation invariants

- Keep all runtime paths anchored at the repository root, never src/ or cwd.
- Preserve unknown/legacy save fields, existing equipment, currency and donations.
  Existing settlement project prices are persisted snapshots, not repricing inputs.
- Missing generator versions retain legacy behavior. Existing region descriptors,
  spawn plans and frozen history/settings remain authoritative; never regenerate
  existing worlds to apply configuration changes.
- Reuse seeded purpose-specific RNG streams and production geometry. No Date.now,
  Math.random or iteration-order dependence in deterministic generation changes.
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
- Existing reports: `node scripts/combat-balance.js`,
  `node scripts/xp-balance.js --progression`,
  `node scripts/world-generation-stress.js 100`.
  See the developer guide for exports and known report limitations.
- Never weaken assertions or rewrite golden fixtures to conceal regressions.
  Compare against the recorded pre-migration failures.
- Do not commit/push, reset, discard work, migrate saves or regenerate worlds
  without authorization. Never include local saves, seeds, credentials or reports
  containing private game data in commits or agent context.
