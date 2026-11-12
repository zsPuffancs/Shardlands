# Implemented architecture

Status: backend relocation and AI-agent navigation checkpoint, 2026-11-12.
Balance Registry, Rulesets, TypeScript and a unified simulation engine are planned,
not implemented. See MODERNIZATION-PLAN.md and DEVELOPMENT-AND-TESTING.md.

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
| public/ | Global browser scripts, Three/WebGL client, UI, localization, shared UMD math/geometry |
| dev-atlas/ | Developer map frontend; local-only endpoints in world-atlas.js |
| plugins/ | CommonJS plugins loaded at runtime; PLUGINS.md describes API |
| scripts/ / tests/ | Existing balance/art reports, dependency generator, native tests/fixtures |

The old root module names re-export their src/ implementation. Consumers at either
path share the same exports/cache identity. New backend imports use src/ directly;
do not edit compatibility wrappers when changing implementation behavior.
docs/module-domains.json provides the exact legacy-to-domain relocation map.

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

There is currently no src/balance/ registry. Constants live in their production
domains (XP_BALANCE, ENEMY_SCALING, GOLD_BALANCE, STONE_REWARDS, forge UMD constants,
SETTLEMENT_ECONOMY, region/generation parameters). Registry extraction must preserve
these exact results. Ruleset labels cannot authorize new balance values.

## Configuration precedence and persistence

Implemented: built-in server config -> config.json; PORT overrides the port.
Rate defaults -> recognized finite numeric rates.json keys -> bounded mutable
runtime object shared with plugins/admin commands. The watcher reloads roughly
every 1.5 seconds; omitted/invalid keys retain previous values. Rate effects differ:
some apply immediately, monster HP applies at spawn and population settings need
restart. Read server-config.js before assuming a knob is fully live.

Planned, not implemented: Base -> Ruleset -> server-specific overrides -> validated
effective Balance. Future settings must explicitly classify live/restart/generation-
locked/save-sensitive behavior. Persisted generation/settlement snapshots take
precedence over newly configured defaults for already-created content.

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

No TypeScript tooling or module-system changes exist at this checkpoint. Shared
UMD modules work both through CommonJS require and browser globals; moving them
or adding frontend compilation is outside the relocation phase.
