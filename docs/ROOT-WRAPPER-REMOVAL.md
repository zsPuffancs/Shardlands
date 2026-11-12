# Root wrapper removal audit

Status: all 44 audited wrappers removed. No root compatibility wrapper retained. Canonical implementations and both root launchers preserved.
This audit records the 263-test wrapper-removal checkpoint, later committed/pushed
as 5adfac7. Subsequent stabilization resolved the nine historical failures and
expanded policy consumers; see STABILIZATION.md and MODERNIZATION-STATUS.md for
current all-pass results. The removal map and compatibility boundary below remain valid.

## Pre-deletion evidence

- Audited the local working tree including uncommitted Registry/TypeScript/domain work; no reset, pull or replacement from remote.
- Found 44 exact three-line CommonJS compatibility wrappers; every src/ target exists. Each candidate was byte-checked independently of the manifest and hashed before deletion.
- AST audit found 131 legacy literal imports across 22 script/test files; all were migrated to canonical paths before deleting files.
- Inspected tracked and untracked source, plugins (including ignored JS files), launchers, package scripts, docs, dynamic require calls and historical Module._compile loaders.
- Both supported root entry points remain: server.js and local-server.js; start.bat/start.sh and npm start/dev still select them.

## External contracts and retained wrappers

No root wrapper is required by an identified supported external contract. package.json is private, has no published module main/exports API, and launchers use the two preserved entry points. The documented plugin contract is init(api); all installed built-in server plugins use that API and have no legacy module imports. Plugin entry loading remains unchanged.

**Retained wrappers: none.** This does not prove absence of external installations or private/ignored third-party integrations outside the inspected tree. Code that directly imported a retired internal root path must move to the mapped src/ path; preserving arbitrary undocumented imports would require retaining every shim. This is an intentional source-import migration, not a promise of universal third-party source compatibility.

## Dynamic and historical paths

- plugin-host require(entry): continues to load explicit files under the root plugins/ directory using the existing init API. No root backend import is involved.
- Adventure localization test require.resolve(file): its finite path list already points at src/progression/adventure and public/adventure-ui.
- Architecture checks now load canonical modules dynamically and assert that retired root files are absent; they no longer require wrappers for export identity.
- Vegetation helper had require(path.join(ROOT, monsters)); this is now a direct canonical src/combat/monsters import. Its public/settlement dynamic import is unchanged.
- XP/gold historical scripts compile old Git blobs with original virtual filenames. Historical relative imports previously depended on root wrappers. scripts/historical-imports.js now supplies per-module resolution into src/ while preserving the XP report’s explicit pinned historical siblings. No global require hook, runtime barrel, source copy or filesystem wrapper was introduced.
- Virtual historical filenames and git show commit:monsters.js / commit:xp-economy.js paths intentionally remain: those identify old Git objects, not current root files. Historical modules still use pinned Git source and fail if its commit is unavailable.

## Full removal map

| Removed root wrapper | Canonical implementation |
|---|---|
| server-config.js | src/server/server-config.js |
| server-console.js | src/server/server-console.js |
| server-lifecycle.js | src/server/server-lifecycle.js |
| web-server.js | src/server/web-server.js |
| plugin-host.js | src/server/plugin-host.js |
| persistence.js | src/server/persistence.js |
| tunnel.js | src/server/tunnel.js |
| game-world.js | src/world/game-world.js |
| universe.js | src/world/universe.js |
| regions.js | src/world/regions.js |
| region-levels.js | src/world/region-levels.js |
| region-blueprint.js | src/world/region-blueprint.js |
| world-generation.js | src/world/world-generation.js |
| danger-geography.js | src/world/danger-geography.js |
| progression-generation.js | src/world/progression-generation.js |
| encounter-runtime.js | src/world/encounter-runtime.js |
| world-atlas.js | src/world/world-atlas.js |
| portal-directory.js | src/world/portal-directory.js |
| combat.js | src/combat/combat.js |
| simulation.js | src/combat/simulation.js |
| monsters.js | src/combat/monsters.js |
| enemy-scaling.js | src/combat/enemy-scaling.js |
| encounter-participation.js | src/combat/encounter-participation.js |
| summons.js | src/combat/summons.js |
| characters.js | src/player/characters.js |
| player-session.js | src/player/player-session.js |
| equipment.js | src/economy/equipment.js |
| inventory.js | src/economy/inventory.js |
| auto-affix-jobs.js | src/economy/auto-affix-jobs.js |
| loot.js | src/economy/loot.js |
| gold-rewards.js | src/economy/gold-rewards.js |
| stone-rewards.js | src/economy/stone-rewards.js |
| death-gold.js | src/economy/death-gold.js |
| settlement-economy.js | src/economy/settlement-economy.js |
| settlement-economy-config.js | src/economy/settlement-economy-config.js |
| xp-economy.js | src/progression/xp-economy.js |
| adventure.js | src/progression/adventure.js |
| teams.js | src/multiplayer/teams.js |
| transport.js | src/multiplayer/transport.js |
| snapshots.js | src/multiplayer/snapshots.js |
| deterministic-random.js | src/shared/deterministic-random.js |
| localized-text.js | src/shared/localized-text.js |
| spatial-index.js | src/shared/spatial-index.js |
| safety-limits.js | src/shared/safety-limits.js |

Only these exact wrappers may be deleted. Their implementation files, domain exports, gameplay, assets, stores, protocol, plugin API and generation versions are preserved.

## Verification

Baseline: 260 tests, 251 passed, nine documented pre-existing failures. After removal: 263 tests, 254 passed, the exact same nine failure locations; three new audit/scoped-loader tests pass.

| Executed check | Result |
|---|---|
| npm run build | Passed; generated outputs rebuilt |
| npm run typecheck / npm run check:shared-ui | Passed |
| npm test | 263 total, 254 pass, same 9 baseline failures; no introduced failure |
| npm run test:determinism | 25/25 passed |
| npm run test:integration | 4/4 passed; actual temporary server and local launcher, plugins, graceful save/restart, saved seed/regions/project compatibility |
| node --test tests/root-imports.test.js tests/architecture.test.js | 5/5 passed after final fixture reorganization |
| Normal and Custom balance simulations | 0 failed invariants; JSON reports match pre-removal baseline exactly, CSV/Markdown exports generated |
| Original XP historical and progression reports | Both completed successfully without root wrappers |
| Historical gold report | Same pre-existing Gold rebalance changed combat/XP reference data assertion; no missing-module failure |
| AST audit / source dependency map | 0 retired literal imports, 0 remaining wrappers, 0 unresolved literal imports in the source map |
| Formatting diff check | Passed |

The simulator retains its two documented WARN entries (missing live farming telemetry and absent independent monster-defense stat), not new failures. Existing full-suite failures are detailed in MODERNIZATION-STATUS.md. Their sorted file/line locations were compared automatically with reports/test-all.log from before this cleanup.

Regression fixture files under tests/fixtures/*.txt deliberately contain old import examples: they test AST filtering and scoped historical compilation, and are not application modules. The plain-module negative test intentionally confirms old root imports fail outside the historical adapter. Source-map generation reports no unresolved runtime/literal dependencies.

Audit commands: node scripts/audit-root-imports.js --out reports/root-imports-after.json and node scripts/module-map.js --out reports/root-removal-dependencies.json. reports/ contains local ignored before/after inventories, test logs and simulation exports. No real save/configuration was changed and no commit/push was performed for this cleanup.
