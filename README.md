# SHARDLANDS 3D v0.5 - private multiplayer hack-and-slash with plugins (Metin2-inspired, 100% original)

## Run
1. Install Node.js 18+ (https://nodejs.org). Nothing else. No internet needed to play.
2. Windows: double-click `start.bat`.  Mac/Linux: `./start.sh`
3. Open http://localhost:3000. Friends on your LAN join at http://YOUR-LAN-IP:3000.

### Invite link for friends over the internet
Put Cloudflare's `cloudflared` program in a `tools` folder next to `start.bat` (on Windows the file is `cloudflared-windows-amd64.exe`, from https://github.com/cloudflare/cloudflared/releases). `start.bat` / `start.sh` then start a tunnel with the game, print the public `https://....trycloudflare.com` link in the server window and show it on the login page with a **Copy link** button. The link changes every time you start the game and stays the same across the console's `restart`. Set `"tunnel": false` in `config.json` to switch it off, or `"tunnelPath"` to point at cloudflared somewhere else.

Set a password when creating a hero to protect it. Passwordless heroes are shared guests and cannot be assigned a password through login.

## Local server console
Start the game with `start.bat` or `start.sh`. Type `help` for the command list or `help restart` for details. Use `status` to inspect the server, `save` to save immediately, `restart` to save and start a fresh server process, or `stop` to save and shut down. Restart disconnects players, who can refresh to reconnect.

Console commands are defined in `src/server/server-console.js`. Give each `Command` a name, description and handler. The command registry handles parsing, usage and errors. For unattended hosting, use `node server.js` and manage restarts from your hosting platform.

## What's new in v0.5
- Real 3D models: Quaternius CC0 characters (animated heroes, NPCs, bandits, goblins, orcs, void knights) and nature packs (forests, farms, rocks, flowers per zone).
- Map is twice as wide (10600 x 10600). Every zone has more room, 10-30 Spirit Stones (more in the harder zones) and 5-30 Alphas.
- Harder and slower: monsters have more HP and hit harder, the XP curve is steeper.
- Spirit Stones are a real fight: guardian waves, shockwaves, 5–10 Uncommon-or-better equipment rolls, 3–6 Souls, potions, stronger completion XP and extra gold. Authorized guardians give 30% of normal XP/gold; Alpha guardians give 50% plus a small Soul chance. Rewards are limited to one set of waves per Stone life. Boss summons remain rewardless. See [Spirit Stone reward policy](docs/STONE-REWARDS.md).
- Bosses have signature attacks with their own telegraphs: charge (red lane), fire/frost/void breath (red cone), meteor rain (red circles), summon portal, ground slam.
- New hero attack effects: sword slashes, arrows with trails, magic bolts, whirlwind, arrow fan, arcane nova.
- 10 passive skills (up to 99 ranks each): Vitality, Might, Swiftness, Precision (crit chance), Brutality (crit damage), Bloodthirst (lifesteal), Iron Skin (defence), Haste (attack speed), Focus (mana), Fortune (gold find).
- Settings window (O or the gear button): master/combat/interface volume, graphics quality, and rebindable keys.
- The Blacksmith only upgrades equipment you are wearing, and no longer hammers in your ears.
- Item tooltips always show above windows. The camera fades out trees and roofs between it and your hero.

## Universes
Every server is its own universe. On the first start it gets a world seed and a name (for example "The Verdant Throne"). The seed decides where monster camps, stones, bosses, trees and rocks are, so no two servers have the same map.
- **World Tier**: starts at 1. Each region has one World Boss (👑), picked by the seed. Defeating it in its own region raises the World Tier and reveals the next region. Tiers 1-7 are the seven zones. From tier 8 every new tier is a whole new map, generated from the seed and the server's history.
- **World Portal**: when the 7th World Boss (the Lord of Death) falls, a portal opens in the centre of the village. Press F at it to see every map unlocked on the server and travel between them. Each generated map has its own village with the Merchant, Blacksmith, Soul Mystic and a portal, a seeded random level span of 20-45 starting at the previous map's maximum level, stones, Alphas and a named World Boss. Killing that boss unlocks the next map, without end.
- **Chronicle** (H or the 🏛 button): the permanent record of firsts - first hero, first to reach level 10-60, first kill of each boss, first stone shattered in each region, first Mythic, every World Boss victory - and the Legends ranking that follows from it.
- The universe lives in `universe.json`. Back it up with `saves.json`. Set `worldSeed` in `config.json` before the first start to choose the seed.
- **Seed randomizer**: type `reseed` in the server console. `reseed confirm` founds a new universe with a random seed, `reseed confirm MY-SEED` with a seed you choose. Heroes and items are kept; the map layout, World Tier, chronicle and generated maps start over. The old universe is saved as `universe-backup-<time>.json`.
- Admin heroes are left out of the chronicle unless `recordAdminHistory` is `true` in `config.json`.

- **Settlements**: every map has something at its centre, chosen by the seed, with the **World Portal at the exact centre** on its own plaza. The Merchant, Blacksmith and Soul Mystic stand around the plaza facing the portal, each with their cart right behind them. The founding lands and most regions have a large walled **village** (wall radius 342, `VILLAGE_SCALE` in `public/settlement.js`) with houses you cannot walk through and gates on the four roads. A village uses one of eight layouts, picked by the seed to suit the land and kept in the save: **Grand Circle** (the founding village), **Royal Avenue**, **Fortress**, **Crescent**, **High District**, **Merchant Quarter**, **Wildwood Haven** and **Ancient Citadel**. The layout decides the architecture; the land decides the materials: timber in green lands, snow-covered roofs on glacier maps, sandstone with flat roofs in the warfields, dark stone in the necropolis. **Fire and void** regions are too harsh for a village: they have an **encampment board** where heroes pay to build the Merchant's stall (base 250,000 gold), the Blacksmith's forge (base 400,000) and the Soul Mystic's tent (base 400,000); each one brings its NPC for everyone. Heroes who can't afford a stall can give part of their gold: the board shows how much is raised, and when the total is reached the biggest contributor gets the deed (on a tie, whoever got there first). Founding the camp and every stall go into the Chronicle. About a third of the other regions (never the first) have **no settlement**, only the World Portal in a ring of standing stones.
- **Villages without traders**: a generated village has a 25% chance (`UNSTAFFED_VILLAGE_CHANCE` in `public/settlement.js`) to start without its Merchant, Blacksmith and Soul Mystic. Their stalls are then bought at the **village board** on the plaza with the encampment stall system (same prices, shared funding, the biggest contributor gets the deed), and each bought stall brings its NPC and cart to their usual spot. The roll is made once and kept in the save; the founding village and villages saved before this rule keep their traders.
- **Village art**: villages in the dark lands are built from the dark-fantasy village kit (`public/village-kit.js`, see `docs/VILLAGE-KIT.md`): a rune-arched portal, vendor stations with carts, five house types, stone walls with gatehouses, lanterns and dark details, all instanced. Other lands keep the classic look for now; add `?villagekit=1` to the address to preview the kit anywhere.
- **Enemy equipment**: bandits wear one of three looks (cutthroat, brigand, marauder) built by the equipment kit (`public/equipment-kit.js`, see `docs/EQUIPMENT-KIT.md`): helmets, armour and weapons attached to the animated model's bones, picked from the monster id so every player sees the same bandit. Preview them at `/gearlab.html`.

Details and design notes: `docs/UNIVERSE.md`.

## The two settings files
- **rates.json** - XP, gold, drops and difficulty. Edit and save while the server runs; changes apply within ~2 seconds.
  `xpRate`, `goldRate`, `gearDropRate`, `potionDropRate`, `rarityBoost` (0 normal, 1 = more rare/epic/legendary, 3 = loot shower),
  `monsterHp` (default 1.6), `monsterDamage` (default 1.4), `deathZoneMonsters` (default 1800, restart needed), `deathGoldLoss`, `deathGoldKillCap`, `respawnSeconds`.
  Death Gold Penalty 2.0 loses the smaller of `floor(gold * deathGoldLoss)` and `floor(deathGoldKillCap * frontierAverageGold(playerLevel, 'normal'))`. Defaults and hard maxima are 5% and 12 normal kills. The reference reuses `src/economy/gold-rewards.js`, without drop randomness, Gold Find or server gold-rate bonuses. Both settings can be lowered; either set to 0 disables gold loss. Legacy `deathGoldLoss` settings above 0.05 are capped; an omitted kill cap defaults to 12. Existing balances, respawn timing and death messages are preserved.
  **Upgrading from v0.4?** Your old rates.json keeps its old values. Delete it to get the new, harder defaults (the server rewrites it on start).
- **config.json** - server name, message of the day, port, `admins` (hero names allowed to use admin commands), `disabledPlugins`.

## World (7 rings around the village)
| Zone | Levels | Monsters | Bosses (signature attack) | Stone |
|---|---|---|---|---|
| Whispering Meadows | 1-6 | Wolf, Slime, Boar, Shroomling | Alpha Wolf (charge), King Slime (summon) | Spirit Pillar |
| Gloomwood | 7-14 | Goblin, Orc, Cave Spider, Bandit | Orc Warlord (charge), Spider Broodmother (summon) | Jade Pillar |
| Ashen Barrens | 15-22 | Skeleton, Ogre, Wraith | Bone King (summon), Ogre Chieftain (slam) | Bone Pillar |
| Ember Wastes | 23-30 | Hellhound, Ember Drake, Magma Golem | Elder Drake (breath), Infernal Colossus (meteors) | Ember Pillar |
| Frostfang Peaks | 30-40 | Frost Fang, Yeti, Ice Golem | Frost Wyrm (breath), Yeti King (charge) | Frost Pillar |
| Voidreach | 40-50 | Shade, Void Weaver, Void Knight | Void Lord (meteors), Abyssal Wyrm (breath) | Void Pillar |
| **Death Zone** (map border) | 50-60 | ~1800 of everything, scaled up | 4x Lord of Death + Void Lord, Abyssal Wyrm, Frost Wyrm, Yeti King | Doom Pillar |
- **Monster strength** (`src/combat/enemy-scaling.js`, details in `docs/ENEMY-SCALING.md`): every monster's health and damage come from a level budget built on a reference hero with gear of its own level: an on-level normal monster takes a Rare +3 hero about 5 seconds to kill and needs about 14 hits to kill them (gentler during the first 25 levels). Each monster type keeps its character (Golems are tanky, Wraiths hit hard). Every world after the founding lands adds a little more health and more damage (World Tier 8 and on).
- **Alpha** monsters (orange name + aura): 3x HP and 1.5x damage of a normal monster, notice you from further away, a larger XP budget, guaranteed loot, 90 s respawn. All enemy categories give smoothly reduced XP to heroes more than 5 levels above them and zero XP at a gap of 25 or more. Extreme underlevel rewards are also reduced; gold and drops are unchanged. New v2 frontier regions distribute ordinary monsters and Spirit Stones across progression bands, with validated accessible XP sources throughout their level range. Existing saved regions are preserved. See [XP progression policy and Atlas coverage](docs/XP-PROGRESSION.md).
- **Bosses** (gold name): 8-12x HP (rising with the zone) and 1.8x damage. Every special attack is telegraphed in red on the ground - get out of it. After each one the boss recovers for a moment: it cannot hit back and takes 25% more damage. Below 60% health it becomes enraged and below 30% desperate: special attacks come faster and hit harder. 3 min respawn, best loot.
- **World Bosses** (👑): the one boss per zone, chosen by the seed, that unlocks the next World Tier. 1.5x bigger, 15-20x HP (rising with the World Tier), 2x damage, and after 2 minutes of fighting they hit faster and harder. They drop 7 items (Epic or better, 5 levels above the boss) and 5-10 souls.
- **Stones**: 12x the health of a normal monster of their level; 5 + zone guardians spawn at every 20% of HP lost (up to 12), with an Alpha guardian at 60%, 40% and 20%, the stone pulses a blue shockwave (red circle first), respawn after 90 s.

## Village NPCs (click them or press F when close)

**World Portal 2.0:** browse compact, server-paginated destination cards, search by Tier/name/biome, jump directly to a Tier, and keep local favorites/recent destinations. Select a card and use the footer Travel button; the Founding Lands have a dedicated shortcut. Refresh clients after updating the server. See [Portal navigation and protocol](docs/WORLD-PORTAL.md).

New generated settlements snapshot tier-scaled construction prices: `round(baseCost * (1 + 0.06 * max(0, tier-8)^0.7))`, starting from 250,000 gold for the Merchant and 400,000 each for the Blacksmith and Soul Mystic. Both encampments and villages without traders use the saved server prices. Existing settlements and their donations keep the historical fixed prices. Tune future projects in `src/economy/settlement-economy-config.js`; see [Settlement construction economy](docs/SETTLEMENT-ECONOMY.md).

Forge Economy 2.0 uses `round(100 * (plus + 1)^1.3 * (1 + itemLevel/12) * slotMultiplier)`, with a 0.8 multiplier for non-weapons. The server and UI share `public/forge-math.js`; success chances from +0 through +8 are 100%, 95%, 90%, 80%, 70%, 60%, 50%, 40%, 30%. Every attempt consumes gold. Failure below +5 keeps the upgrade level; failure at +5 or higher drops exactly one level. Equipment is never destroyed and +9 remains the maximum. Automatic forging retains its existing confirmation, cancellation and per-tick limits.
- **Merchant** - potions, elixirs, scrolls (incl. Skill Reset). Buys your gear (Shift/right-click a bag item, or "Sell junk").
- **Blacksmith** - upgrades the equipment you are wearing +0 to +9. Each + adds 10% to the item's stats (weapons +15% damage). From +5 a failure drops it one level.
- **Blacksmith** has two tabs. **Mythic merge**: three Mythics from your bag + 1,000,000 gold = one new random Mythic (any slot) at the three items' average item level.
- **Soul Mystic** has two tabs. **Reroll**: rerolls every stat of a worn or bag item for souls (1 common/uncommon, 2 rare, 3 epic, 5 legendary, 10 mythic); name, colour, item level and + upgrades stay. **Affix**: puts one affix on a weapon, ring or amulet - *Vampiric* (Lifesteal %), *Brutal* (Crit Damage %) or *Swift* (Attack Speed %) - for souls (2/2/3/5/8/15 by rarity). The affix names the item, and a new one replaces the old. Gear totals are capped at 15% lifesteal and 40% attack speed.

## Gear & merging
6 slots, 6 colours (common, uncommon, rare, epic, legendary, **mythic**). Helmets, armor and boots never roll damage or crit.
**Mythic** items (red) are only made by merging. Besides stats they add 2-3 passive skill ranks (+1 to +3 each, up to 5 above the normal cap) while worn.
**Merge**: Inventory → Merge → pick items of the same colour (any slot, any level) → you get 1 item of the next colour
whose item level is the average of the merged items (slot of the first item). The highest +forge is retained only from an input of the same slot whose item level is at least the result's; otherwise the result starts at +0. This also applies to automatic merging and Mythic fusion, preventing cheap low-level or cross-slot upgrade transfers. It takes 2 common → uncommon, 3 uncommon → rare, 4 rare → epic,
5 epic → legendary, 15 legendary → mythic. Mythics can't be merged. Auto-merge buttons go up to green, blue, purple or orange.

## Souls
Spirit Stones drop 3–6 Souls, ordinary Alphas and bosses retain their 1–5 Soul drops, and World Bosses retain 5–10. Souls show next to your gold and are spent at the Soul Mystic.

Boss adds generate no rewards. Stone guardians use bounded 30%/50% normal XP/gold payouts and reduced loot; Alpha guardians have an 8% chance for one Soul. Unrestricted plugin kill rewards remain disabled for all summons. Starter weapons are granted to new characters and migrated pre-equipment saves only; reconnecting with an empty equipped weapon slot does not create another item.

## Skills
1 point per level. Active skills (keys 1-3) go to rank 5, passives to rank **99**. Open with K and switch tabs.
Passives give their full bonus per rank up to rank 10. After that each rank adds a little less, and the bonus levels off towards a cap (about 95% of it at rank 99): Vitality / Might / Focus +300%, Swiftness +80%, Precision +30% crit chance, Brutality +400% crit damage, Bloodthirst 15% lifesteal, Iron Skin 60% less damage, Haste 60% faster attacks. Fortune is linear instead: 2% gold find at rank 1, +1% per rank, 100% at rank 99 (the cap). Bloodthirst and the Vampiric affix heal that share of your **Damage stat** on every hit (not of the damage the hit deals, so crits and skill multipliers do not raise the heal).

## Items
Hover an item and hold **Shift** to see the lowest and highest value each of its stats could have rolled at that item level and rarity.
**Consumables** have their own tab in the inventory. Elixirs and scrolls stack: each one adds its time, up to 5 minutes left.

## Teams and trading
Press **Y** (or the 👥 button) to open the Team window. Invite a hero by name (or `/invite name`, `/accept`, `/leave`); up to 5 heroes, team chat with `/t message`.
**Sharing**: XP captures a roster of up to five nearby members when an encounter starts. Members need at least 1% effective damage, a hit within 45 seconds, and must still be alive, online and within 1000 units on the same map. Eligible contributors share a pool matched to the encounter's paid HP scaling, targeting +5% per additional contributor in per-player XP/hour for equal-DPS groups. HP scales linearly by +45% per initial member and enemy damage separately by +8%; membership changes never heal or repeatedly resize a fight. Gold sharing still uses the current team at the kill: the killer's part drops on the ground, while the others receive theirs directly. Gear and other drops still go to the killer. `/share` controls new encounter XP rosters and current gold sharing. See [XP Economy 2.0](docs/XP-ECONOMY.md) for exact rules and limits.
**Tougher monsters**: a monster fought by a team gets more health for every extra member nearby: +45% for normal monsters, +50% for Alphas and stones, +60% for bosses and +70% for World Bosses, so a group kills faster but cannot melt a boss. Damage grows only +8% per member. It keeps that strength until it walks home and heals, or respawns. This applies whether sharing is on or off.
Only team members can trade. Press **Trade** next to a member (or `/trade name`). Both put bag items and gold on the table; when both press **Accept trade** the swap happens at once. Any change to an offer takes back both acceptances, so nobody can switch items after you accepted. Leaving the team or the game cancels the trade.

## Language and text size

Choose English or Hungarian on the login screen or in Settings → Graphics. Text follows the game window size, and the text-size slider lets you adjust it further from 85% to 130%. Both settings are saved in the browser. See PLUGINS.md for adding a locale.

## Interface tips
- **Esc** closes the topmost window, prompt or tooltip. Settings open with **O** or ⚙.
- **Hover** an item for its stats and a short verdict against what you wear; hold **Shift** for each stat's change and possible range.
- **Ctrl+click** an item to lock it: locked items cannot be sold, merged or traded. Merges and sales that use Epic or better items ask first.
- The **?** on the minimap shows what the markers mean; **🗺** shows the current region, World Tier and region modifiers.
- Settings → Graphics: rarity letters on items, reduce motion, show the tutorial again, reset window positions. Dragged windows keep their place.
See `docs/UI-AUDIT.md` for the full list.

## Controls (all rebindable in Settings → Key bindings, except movement)
Click: move / attack / loot / talk · Space: attack the selected monster in reach or pick the nearest one in reach · WASD walk · right-drag or ←→ camera · wheel zoom · 1-3 skills · Q/E/R/T potions & return scroll
F talk · I inventory · K skills · Y team · H chronicle · O settings · G graphics quality · P fps · M mute · Enter chat (/help) · Esc close windows.
WASD and ground clicks stop chasing and keep your target selected. Auto-attacks continue while the target is in reach.
Windows can be dragged by their title bar.

## Admin commands
Create the hero with a password before adding its name to `admins` in `config.json`.
/give /gear /drop /gold /souls /level /heal /tp /zone <0-6> /spawn /god /stats /rate /xprate /droprate /announce /kick /players
`/spawn <type> [count] [level]` spawns a temporary monster. For example, `/spawn wolf 3 5` creates three level-5 wolves from the same template.

`/stats` shows monster count and server tick time - handy while stress testing the Death Zone. `/god` makes you immune.

## Performance
Graphics default to Auto (lowers resolution and shadows if the frame rate drops). Trees and plants far away use cheap stand-ins,
only the nearest ~26 humanoid monsters are fully animated, and sleeping monsters cost the server nothing
(3363 monsters ≈ 0.5 ms per server tick). Use a current Chrome/Edge/Firefox with hardware acceleration on.
Very old GPUs that can't do skinned characters fall back to the classic block models automatically.

## Server modules

- `server.js` connects the modules. `src/server/server-lifecycle.js` starts the server and handles autosave, shutdown and restart.
- `src/combat/simulation.js` advances the game world. `src/combat/combat.js`, `src/combat/monsters.js` and `src/economy/loot.js` handle fights, spawns and rewards.
- `src/player/characters.js`, `src/economy/equipment.js` and `src/economy/inventory.js` handle character progression, item generation and shop actions.
- `src/player/player-session.js` authenticates players and dispatches game messages. `src/multiplayer/snapshots.js` builds the state updates sent to clients.
- `src/world/universe.js` holds the world seed, World Tier, region generator and chronicle. `src/world/regions.js` builds the generated maps and runs the World Portal.
- `src/server/plugin-host.js` registers plugins and their hooks. `src/server/web-server.js` serves the client and connects WebSocket transport.

## Plugins
See PLUGINS.md. Drop files into `plugins/`, restart.

## Credits
3D models: Quaternius (https://quaternius.com), CC0. Everything else: original.

## Performance checks
Run `node --test tests/performance.test.js` for spatial queries, loot ownership, skill targeting, sleeping AI, state deltas and overload handling.

Monsters, players and loot use a shared persistent spatial index. AI processes nearby and still-active monsters; distant lifecycle checks (respawn and summon expiry) run every 500 ms. Empty maps keep their state without running full AI every tick. Code that moves an indexed entity directly should call `entities.update(entity)`; monster membership is also reconciled during lifecycle checks.

Clients that negotiate `meDeltas` receive inventory counts and skill ranks only on change. Older clients keep receiving full state. A simulation tick over its 50 ms budget may skip one snapshot, keeping queued events for the next publication; consecutive snapshots are never skipped. Console `status` reports tick overruns and skipped snapshots. Under sustained overload the fixed-step simulation slows down rather than running a burst of catch-up ticks.

### Snapshot protocol
New clients negotiate `stateDeltas` and `listDeltas` in the join request. `me` then contains only changed top-level fields (nested inventory, skill and buff objects are replaced as a unit). Player lists use `pl` for a full baseline, `pd` for complete added/changed rows and `pr` for removed IDs; loot uses `lo`, `ld` and `lr` respectively. Omitted fields and lists retain their previous values, including when they contain zero or an empty object.

A snapshot with `sf: 1` resets the client baseline and includes complete own state and lists. The server sends one on entry, map changes, recovery from blocked/failed sends, and every 10 seconds. The existing monster protocol also receives a fresh baseline. Older clients continue to receive their negotiated full-state or inventory/skill-only delta format.

Nearby player movement is published at the normal 20 Hz. Beyond 750 world units, movement updates are limited to 5 Hz per observer; new players, removals, health, death and other non-position changes are immediate. Crossing into the nearby range also removes the throttle. This policy changes network publication only, not movement or combat simulation.

Run `node --test tests/*.test.js` to check both performance behavior and protocol reconstruction, including map transitions and backward compatibility.

### Monster fields and UI patches
Clients may also negotiate `mobFieldDeltas` and `uiDeltas`. Existing monsters then use `mf: [[id, mask, ...values]]`: bits 0-6 represent type, X, Y, HP, maximum HP, level and Alpha flag in that order. New monsters still use complete rows; visibility/order changes use `mi`, and full baselines use `mo`.

Inventory, team, trade and universe messages share `public/state-delta.js` on the server and browser. A full message carries `uiVersion`; later `uiPatch` messages carry the channel, previous version, new version and patch operations. Inventory items are keyed by UID, team members by ID, chronicle entries by event ID, regions by tier and legends by name. Only added/changed records and removed IDs are sent; list order is included when insertion order alone cannot reproduce it. Other object fields are patched individually, so a trade confirmation can update only an acceptance flag.

The receiver applies patches atomically to its own baseline before calling the existing UI handlers. A version mismatch requests `uiSync` for that channel once; the server returns its latest full state. Requests are limited to one per channel per second. A channel also sends a fresh baseline on its next update after 30 seconds. Failed writes never advance the server cache, and clients without these capabilities retain the original message formats.

## Procedural generator versions
New universes use generator v2: area-correct annulus sampling, bounded encounter placement and lazy player-driven activation. Existing universes remain on generator v1 without layout migration. See `docs/PROCEDURAL-GENERATION.md` for the mathematical audit, compatibility guarantees, deployment budgets, test commands and remaining runtime limits.

## Operational safety limits
Shared server limits live in `src/shared/safety-limits.js`. Combat stat formulas and equipment/passive bonus caps are unchanged by this work.

- Equipment drops: at most 10 per kill, including high-tier stones and extreme gear-drop rates.
- Temporary summons: at most 512 globally, 128 on one map and 64 from one source. Bosses, stone guardians and the plugin API's temporary spawns share these quotas. Existing summons expire normally; reaching a limit suppresses additional summons.
- Currency and pending XP use JavaScript's maximum safe integer (9,007,199,254,740,991); consumables accept additions only up to 1,000,000 per item type. Existing larger valid stacks are preserved and can still be consumed. Purchases/sales/trades validate capacity before spending or transferring items. Partial pickups leave the remainder on the ground with its original expiry/ownership. Invalid unsafe legacy balances are preserved but cannot be spent until repaired explicitly.
- Rate assignments from config reloads and admin/plugin writes share bounded settings: XP/gold/HP/damage multipliers up to 1,000,000; gear/potion/rarity rates up to 1,000; legacy Death Zone population up to 10,000; respawn seconds up to 86,400; death loss fraction up to 0.05 and death gold kill cap up to 12. Nonfinite assignments keep the last valid setting.
- Incoming WebSocket traffic has frame/byte budgets before JSON parsing. Normal gameplay commands then use per-connection token buckets: 40 movement commands/s, 3 chat commands/s, 15 actions/s and 5 sync queries/s, with short burst allowances. Movement-stop commands still clear the input when command tokens are exhausted; transport-level flooding closes the connection.
- Automatic forging processes at most 100 attempts per simulation tick globally and 25 per job per tick. It reports progress and stops on death, disconnect, leaving the smith or removing the selected equipment. Completed work is saved normally; unfinished jobs do not resume after restart. Level-ups also run in bounded batches (20 globally / 5 per player per tick) instead of an unbounded XP loop. XP already awarded remains stored while processing catches up.
- All client particles share a 700-particle cap; all transient effects share a 256-effect cap. Cosmetic effects stop at 192, reserving space for danger telegraphs. If the warning budget itself fills, closer warnings take priority over more distant ones. Asset-model mesh arrays are not subject to the particle cap.

Focused regression cases are prepared in `tests/safety-limits.test.js`. They were not executed during implementation because tests are run only on explicit user request. No automatic test hooks were added.

New frontier descriptors use the independently versioned level-range policy in `src/world/region-levels.js`: the seeded span is 20-45 (maximum minus minimum), starting at the previous saved region's maximum. This applies to future regions in existing v1/v2 worlds without reseeding. Saved regions and spawn plans, including the seven founding zones, keep their levels. Missing predecessor ranges are reconstructed as a deterministic chain without creating regions. At the level cap of 10,000, the interval shortens instead of shifting backwards; later capped regions remain at 10,000.

## Dynamic danger geography and developer World Atlas

New generator-v2 frontier regions now have deterministic biome-specific danger fields, protected entry areas, validated safe approaches and optional risky shortcuts. Encounter placement uses the same field without changing monster HP/damage formulas or increasing population budgets. Existing saved geography and v1 worlds are preserved.

After starting `node server.js`, open **http://localhost:3000/dev/atlas** locally (adjust the port if configured). The Atlas provides persisted region selection, isolated seed/tier dry-run previews, zoom/pan, exact danger inspection, toggleable layers, diagnostics, PNG export and JSON validation reports. It never unlocks regions or writes previews to saves. Local-only access is enforced; normal players do not receive the raw seed or internal encounter/danger descriptors. See [docs/DANGER-ATLAS.md](docs/DANGER-ATLAS.md) for operation, algorithms, compatibility, tests and measured limits.

## Monster gold rewards

Generated frontier gold now follows a bounded linear level/cost reference with ±20% variation and exclusive encounter-category multipliers. Founding solo rewards, personal Gold Find, configured gold rates, current party selection and loot ownership are preserved; integer party pools prevent rounding inflation. Prices, item selling and saved balances are unchanged. See [gold policy](docs/GOLD-REWARDS.md) and the [before/after report](docs/GOLD-BALANCE-REPORT.md). Reproduce the report with `node scripts/gold-balance.js --out docs/GOLD-BALANCE-REPORT.md`.

## Inventory search and safe destruction

Inventory now searches all 90 equipment slots and combines rarity/type/level/status filters with stable display sorting before pagination. Sort preferences stay local and the server bag order is unchanged. Use an item's **⋯** menu to request deliberate, server-confirmed single-item destruction; Legendary/Mythic items require an extra acknowledgement and typed confirmation. Existing equip, Ctrl+click locking and Merchant selling remain available. See [Inventory QoL 2.0](docs/INVENTORY-QOL.md) for controls, protection rules, persistence and tests.

## Automatic Soul Mystic affixes

Open **Soul Mystic → Affix → Auto Affix** for a separate draggable window with target-value probability estimates, attempt and Souls caps, and authoritative live results. Closing the window cancels rolling. The last actual roll stays on the item; best-roll history is informational. See [Auto Affix](docs/AUTO-AFFIX.md) for formulas, limits, safety rules and persistence.

## Adventurer's journal and party equipment

Open **📖** below the minimap for the discovered-enemy bestiary and daily village contracts. Team leaders can enable round-robin equipment ownership. Boss frames now show cast/phase/enrage/recovery state, and affix details distinguish raw values from effective gear caps. Character and world saves share a recoverable checkpoint so settlement funding and wallet deductions stay consistent. See [Adventure and recovery](docs/ADVENTURE.md) for controls, reward rules, limits and save recovery.

The client also has a [compact phone/tablet layout](docs/MOBILE-UI.md), with viewport-sized windows, smaller HUD/nameplates, safe-area spacing and keyboard-aware sizing.
