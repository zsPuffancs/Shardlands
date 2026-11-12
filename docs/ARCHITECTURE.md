# Implemented architecture

Status: backend domains, typed Balance Registry, Rulesets, deterministic balance
simulations and shared typed health/World Boss components, 2026-11-12.
See MODERNIZATION-STATUS.md for actual checks and remaining migration scope.

## Runtime and directory responsibilities

| Location | Responsibility |
|---|---|
| server.js | Root composition, save-path anchors, universe bootstrapping, service wiring |
| local-server.js / start.bat / start.sh | Local process wrapper, restart IPC, optional tunnel |
| src/server/ | Config/rate loading, HTTP, plugin API, persistence, lifecycle/console, tunnel |
| src/world/ | World identity, maps, regions, generation/danger/progression geography, runtime encounters, Atlas and portal directory |
| src/combat/ | Simulation ticks, attacks/skills, monster spawning/scaling, participation and summons |
| src/player/ | Classes/stats/level-ups, sessions, authenticated dispatch and character attachment |
| src/economy/ | Equipment/inventory, forge integration, affixes, loot, gold/death/Stone rewards, settlement economy |
| src/progression/ | XP policy and adventure/contracts/bestiary |
| src/multiplayer/ | Parties/trades, WebSocket framing, snapshots/deltas |
| src/shared/ | RNG, localized payloads, spatial index and technical safety limits |
| src/balance/ | Typed defaults/validation/Rulesets, immutable resolution, production formula catalog and offline simulations |
| src/shared/typed/ | Reusable typed resource arithmetic/presenter and encounter/World Boss contracts; generated/ contains CommonJS outputs |
| public/ | Global browser scripts, Three/WebGL client, UI, localization, shared UMD math/geometry |
| dev-atlas/ | Developer map frontend; local-only endpoints in world-atlas.js |
| plugins/ | CommonJS plugins loaded at runtime; PLUGINS.md describes API |
| scripts/ / tests/ | Existing balance/art reports, dependency generator, native tests/fixtures |

src/ is the canonical backend module location. All 44 temporary root compatibility
wrappers were retired after migrating internal consumers. server.js/local-server.js
remain intentional root entry points. docs/module-domains.json preserves the
legacy-to-domain relocation map as migration metadata; it does not declare legacy
paths to be loadable. ROOT-WRAPPER-REMOVAL.md records the full audit and compatibility
boundary. Offline historical reports use a scoped virtual-module import adapter;
normal runtime/plugin resolution is not patched.

## Main flows and dependencies

server.js recovers the coordinated save journal, opens stores, attaches the
universe, composes services, loads plugins and starts HTTP/WebSockets/ticks.
The local launcher forks server.js and handles restart/shutdown IPC. Importing
server.js starts a live server: do not use it as a library or dependency scanner.

Sessions dispatch authenticated requests into inventory/combat/teams/adventure.
Simulation updates entities and bounded jobs. Snapshot publishing uses spatial
queries and shared state-delta channels; transport frames them for the browser.
Combat chooses eligible participants and delegates reward policy/payout to
XP, Stone rewards, gold, loot and teams. Monetary writes use safety-limits.

World descriptors combine universe identity, versioned generation settings,
frozen history, region levels, danger fields, geometry and spawn plans.
Encounter-runtime materializes nearby encounters and preserves lifecycle state.
Atlas and portal navigation read these authoritative descriptors; previews do
not unlock regions, mutate history or spawn encounters.

Important static cycles reported by the dependency map:

- enemy-scaling / monsters / equipment / characters / game-world; scaling uses
  deferred imports to avoid eager initialization problems.
- danger-geography / progression-generation / world-generation.

Do not replace lazy imports or injected callbacks with eager initialization merely
to remove a static cycle. Plugin hooks and browser globals are not fully captured
by literal import analysis. public/index.html script order is part of the client
contract; its ordered edges appear in the map.

## Formula and configuration ownership

Paths below are relative to src/ unless public/ is specified.

| Area | Authoritative implementation / accompanying modules |
|---|---|
| XP requirements, level-gap penalties, category and party XP | progression/xp-economy.js; player/characters.js applies level-ups; combat/combat.js and participation select recipients |
| Player stats and skills | player/characters.js; economy/equipment.js and shared public/affix-usage.js provide item contributions |
| Monster HP/damage/boss pressure | combat/enemy-scaling.js; combat/monsters.js applies spawn categories; combat/simulation.js runs behavior |
| Item stats, rarity, soft caps, sale values | economy/equipment.js; public/affix-math.js; inspect inventory and characters when changing attachment |
| Forge price and probabilities | public/forge-math.js, consumed by equipment.js and browser UI; inventory.js handles payment, downgrade and automatic jobs |
| Affix jobs | economy/auto-affix-jobs.js, inventory.js, public/affix-math.js and affix-usage.js |
| Monster gold budget/Gold Find/sharing | economy/gold-rewards.js; loot.js, multiplayer/teams.js and safety-limits complete payout |
| Stone and summoned reward eligibility | economy/stone-rewards.js, combat/summons.js, combat/simulation.js, loot.js and xp-economy.js |
| Death penalty | economy/death-gold.js reuses gold reference reward at player level |
| Construction prices | economy/settlement-economy-config.js and settlement-economy.js; world/regions.js snapshots costs and contributions |
| Region levels and progression geography | world/region-levels.js, progression-generation.js, region-blueprint.js, universe.js |
| Generation distribution/budgets/validation | world/world-generation.js and danger-geography.js; shared/deterministic-random.js |
| Contracts and activity state | progression/adventure.js with coordinated persistence and durable pending reward receipts |

For the five requested audit workflows, use `inspectTogether` in
docs/module-domains.json, or `node scripts/module-map.js --group <name>`.
These groups intentionally include payout/state consumers, not just formula files.

Registry entry: src/balance/index.js. Typed defaults/validation/contracts live in
src/balance/typed/, with committed generated/ CommonJS/declarations. Configurable
domains now include rates, settlement, worldGeneration, forging, progression,
gold, loot, combat and monsters; STABILIZATION.md lists their exact supported
parameters and production consumers. Other existing policy constants
(XP_BALANCE, ENEMY_SCALING, GOLD_BALANCE, STONE_REWARDS, forge rates, rarity and region
parameters) remain in production domains and are exposed by a read-only formulaCatalog().
Unsupported policy overrides throw rather than being silently ignored. This is an
incremental Registry boundary, not a claim that every gameplay coefficient is tunable.

## Configuration precedence and persistence

Implemented: built-in server config -> config.json; PORT overrides the port.
Rate defaults -> recognized finite numeric rates.json keys -> bounded mutable
runtime object shared with plugins/admin commands. The watcher reloads roughly
every 1.5 seconds; omitted/invalid keys retain previous values. Rate effects differ:
some apply immediately, monster HP applies at spawn and population settings need
restart. Read server-config.js before assuming a knob is fully live.

Implemented: Base -> Ruleset -> config.json balance.overrides -> validated effective
Balance. Named presets Normal/Hardcore/Accelerated/Custom currently have empty patches
and preserve defaults. Legacy rates.json then adapts numeric values using existing
clamp/retain semantics; effectiveBalance() returns an immutable snapshot of that
runtime state. Registry live updates reject restart/generation/save-sensitive knobs.
Population requires restart; monsterHp remains live-on-respawn as before. Generation
snapshots in an existing universe override newly configured generation defaults;
existing settlement prices/donations stay pinned, while new projects use resolved
settlement configuration. The Registry does not rewrite saves.

Root stores: saves.json, plugin-data.json, universe.json; save-journal.json is
coordinated recovery state. persistence.js handles queued writes and recovery;
this is not a claim of power-loss durability/fsync. config.json, rates.json and
tunnel.json are local operational inputs. Do not print their secrets or load real
stores for repository analysis. Paths stay anchored at root after relocation.

## Determinism and compatibility

Legacy/missing generator versions retain their old paths. Seeded generation uses
purpose-specific streams and frozen inputs; existing saved descriptors/plans,
generator versions and independent progression/level-range versions must survive.
Do not silently recompute regions, settlement prices, donations or guardian budgets.
Use real descriptor ranges when comparing World Tiers; player level and item level
are distinct. Atlas endpoints must retain loopback/Host/origin/proxy restrictions.

Strict TypeScript is used for Registry and shared resource/entity contracts.
Generated CommonJS is committed, preserving node server.js without installation.
The browser-generated artifacts are public/resource-bars.js and public/forge-math.js,
UMD wrappers of the same dependency-free typed resource/forge modules used by Node.
ForgeClientConfig adds policy metadata while preserving the existing upRate array.
Policy instances flow through server factories and world-view metadata explicitly;
there is no mutable global configuration. Existing client scripts remain globals.
ResourceBar encapsulates DOM caching and accessibility; configuration preserves
HUD/nameplate rounding and existing CSS transitions. Pure server arithmetic retains
overkill/death semantics, while display clamping is separate. Composed service
factories remain appropriate for combat/rewards; no artificial entity inheritance
tree or saved class instances are introduced. World Boss factories preserve IDs,
proper names, unknown template fields, serialized shape and seeded RNG draw order.
