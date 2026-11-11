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
| Generated maps and World Portal | `regions.js`, `game-world.js` | Each tier from 8 up is a playable map with its own village. The portal lists the unlocked maps and moves players between them. |
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
  a seeded 20-45 level span for newly created descriptors, capped at level 10,000. Saved regions keep their original ranges. Missing predecessor ranges follow the seeded chain. At the cap, ranges shorten instead of starting below the previous maximum. The level-range policy is versioned independently of the layout generator.
- **Cheats do not enter history.** Heroes listed in `admins` are not recorded (set
  `recordAdminHistory: true` in `config.json` to change that, for example on a test server).
  Monsters created with `/spawn` never count.
- **Existing saves keep working.** A server with heroes but no `universe.json` founds its universe
  on the next start. The seven founding zones are never gated. Generated maps appear in the portal only once unlocked.

## Maps beyond the founding lands

From World Tier 8, every tier is its own generated map (`regions.js`).

- **When:** the moment the current World Boss dies, the next region is generated, its map is built
  and filled, and only then is the victory announced. On a restart, every map up to the current
  World Tier is rebuilt from the seed, so layouts are the same as before.
- **One coordinate plane.** Each map occupies its own square, 16000 units apart (`game-world.js`).
  Distance checks, aggro, skills and loot need no map checks because other maps are simply far away.
  Only `mapAt`, `clampWorld`, `inVillage`, `nearNpc`, `tierOf` and `placeInVillage` know about maps.
- **Clients only see local coordinates.** Snapshots, events and the world description are shifted by
  the map's origin on the way out, and click-to-move is shifted back on the way in. The client is
  told about a map change by one `map` message, whatever caused it (portal or admin teleport),
  and rebuilds its scenery from the seed and the map number.
- **A region is a zone.** A generated region is appended to the zone table with its own map as its
  area, so spawning, level scaling, stones, loot and respawns are the existing code. Its World Boss
  is a new monster type (`wb8`, `wb9`, ...) built on an existing boss, with its own name.
- **Every map has a village** with the three NPCs and the portal at the same places as at home.
  Death and Return Scrolls bring you to the village of the map you are on.
- **Saved positions** are stored as map number plus local position.
- **Scenery** reuses the look of the founding zone that fits the biome (for example glacier uses
  the Frostfang look).

## Settlements

`public/settlement.js` is shared by the server and the client. It turns a settlement record
(`kind`, `style`, `built`) into one layout: houses, wall and gates, tents, stalls and obstacles.
The server uses it for collision (players cannot walk through houses or the wall) and to decide which
NPCs exist; the client draws exactly the same layout and applies the same collision to its own
movement prediction.

- The record of each map is in `universe.json` under `settlements`, made once from its own seeded
  stream (`seededRandom(seed, 'settlement', tier)`), so region descriptors and their hashes are unchanged.
- Fire (`volcanic`) and void (`voidscar`) regions are always encampments; other regions after the first
  are settlement-free 30% of the time; the rest are villages styled by biome.
- Building a stall is one atomic server step: check, pay, record, chronicle (`campFounded`,
  `stallBuilt`), then every player on that map gets the new world description.

## Not implemented yet

- **Region modifiers have no gameplay effect.** They are generated and stored only.
- **New monsters, terrain shapes and boss mechanics per region.** Regions reuse existing monster
  families, stones and boss attacks at higher levels on a flat square map.
- **Unloading maps.** Every unlocked map stays in memory (about 300 monsters each; sleeping monsters
  cost almost nothing). A server that reaches hundreds of tiers will need unloading.
- **Guilds, factions, PvP and territory.** The game has none yet, so the chronicle has no such events.
- **Landmarks, statues and titles** named after legends.
- **Several simulation servers, anti-cheat.** One process simulates everything.
- **Hand-built zones do not change with history.** Only their monster layout and decoration follow the seed.

## Risks to keep in mind

- The seed is public (login screen), so the monster layout can be computed by anyone. Nothing secret
  should ever be derived from it.
- Layout depends on the zone tables. A plugin or update that changes them changes the map on the next start.
- "First" records can be taken by a high-level hero in low zones. That is a true record, but it may
  need rules (level limits, group requirements) once competition matters.
- `universe.json` is the history. Back it up together with `saves.json`.
