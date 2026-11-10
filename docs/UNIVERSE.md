# Universes: seed, world tier and chronicle

Every Shardlands server is one independent, persistent universe. This document explains
how that foundation works, why it is built this way, and what is deliberately left for later.

## What exists today

| Part | Where | What it does |
|---|---|---|
| World seed | `universe.js`, `universe.json` | Created once, on the first start. Set `worldSeed` in `config.json` before the first start to choose it. |
| Universe name | `universeName(seed)` | Derived from the seed, e.g. "The Verdant Throne". |
| Seeded geography | `monsters.js` `populateMonsters(random)`, `public/game.js` `bakeWorld` | Camps, stones, alphas and bosses are placed from the seed. Trees, rocks and plants on the client are baked from the same seed. Two servers with different seeds have different maps; one server always rebuilds the same map. |
| World Tier | `state.worldTier` | Starts at 1. Rises by one when the current tier's World Boss is defeated in its own region. |
| World Boss | `generateRegion(...).worldBoss` | One boss per region, chosen by the seed. Servers differ in which boss is the gatekeeper. |
| Region generator | `generateRegion(seed, tier, historySnapshot, generatorVersion)` | Pure function. Tiers 1-7 describe the seven hand-built zones. Tier 8 and above return a generated region description: name, biome, levels, monster families, stone count, modifiers and a named World Boss. |
| Chronicle | `state.history` | Permanent list of verified events, each with a type, a time, the World Tier, the players involved and structured data. |
| Legends | `summary().legends` | Ranking computed from the chronicle. Nothing is stored that the chronicle does not prove. |
| Client | Chronicle window (H or the 🏛 button), login screen line | Shows the universe name, seed, World Tier, frontier region, World Boss, chronicle and legends. |

### Recorded events

`founded`, `firstHero`, `levelMilestone` (first hero to reach 10/20/30/40/50/60), `bossFirstKill`
(per boss type), `stoneFirst` (per region), `firstMythic`, `worldBoss` (a tier was unlocked).
Boss and stone records list the killer first, then everyone else who damaged it in the last five minutes.

## Design decisions

- **Reuse, don't rewrite.** The universe is one new module. It reuses `openJsonStore` for
  persistence, the existing `fire(...)` game events (`join`, `levelup`, `damage`, `kill`,
  `merge`, `death`) for recording, the existing spawner for layout and the existing localisation
  for text. Combat, loot, inventory and plugins are untouched.
- **One random stream per purpose.** `seededRandom(seed, 'spawns')`, `seededRandom(seed, 'region', tier, 'v1')`
  and so on. Adding a new consumer never shifts the results of an old one.
- **Generator version is part of the input.** A region is generated once, when it becomes known,
  and stored together with the history snapshot it was generated from. Changing the generator
  later (version 2) cannot rewrite a region a universe already has.
- **Facts and narrative are separate.** The chronicle stores structured records only. Readable
  sentences are produced from them at display time (and translated on the client). Text can be
  rewritten or replaced by a narrative engine later without touching the facts.
- **History shapes what comes next.** The snapshot counts which elements of boss (fire, frost,
  void, beast, war, undead) the universe's heroes have slain. Frontier regions are more likely to
  take the biome of the most-slain element. It is a weight, not a script.
- **A tier unlocks exactly once.** The check "is this the current World Boss, in its own region"
  and the tier change happen in one synchronous step on the single game thread, and the record is
  guarded by a `firsts` key. A second kill, a late kill or a kill of a later boss does nothing.
- **Bounded difficulty inputs.** Frontier regions get at most three modifiers from a fixed list and
  10 levels per tier. The generator has no way to produce unbounded stat growth on its own.
- **Cheats do not enter history.** Heroes listed in `admins` are not recorded (set
  `recordAdminHistory: true` in `config.json` to change that, for example on a test server).
  Monsters created with `/spawn` never count.
- **Existing saves keep working.** A server with heroes but no `universe.json` founds its universe
  on the next start. Nothing is gated: all seven zones stay open whatever the World Tier is.

## Not implemented yet

- **Playing in generated regions.** From World Tier 8 the next region is generated, named and
  shown, but it cannot be entered. `playable: false` marks this, and the World Tier stops there.
  Making it real needs terrain, spawning and client rendering for generated regions.
- **Region modifiers have no gameplay effect.** They are generated and stored only.
- **Guilds, factions, PvP and territory.** The game has none yet, so the chronicle has no such events.
- **Landmarks, statues and titles** named after legends.
- **Loading and unloading regions, several simulation servers, anti-cheat.** One process simulates everything.
- **Hand-built zones do not change with history.** Only their monster layout and decoration follow the seed.

## Risks to keep in mind

- The seed is public (login screen), so the monster layout can be computed by anyone. Nothing secret
  should ever be derived from it.
- Layout depends on the zone tables. A plugin or update that changes them changes the map on the next start.
- "First" records can be taken by a high-level hero in low zones. That is a true record, but it may
  need rules (level limits, group requirements) once competition matters.
- `universe.json` is the history. Back it up together with `saves.json`.
