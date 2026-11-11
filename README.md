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

Console commands are defined in `server-console.js`. Give each `Command` a name, description and handler. The command registry handles parsing, usage and errors. For unattended hosting, use `node server.js` and manage restarts from your hosting platform.

## What's new in v0.5
- Real 3D models: Quaternius CC0 characters (animated heroes, NPCs, bandits, goblins, orcs, void knights) and nature packs (forests, farms, rocks, flowers per zone).
- Map is twice as wide (10600 x 10600). Every zone has more room, 10-30 Spirit Stones (more in the harder zones) and 5-30 Alphas.
- Harder and slower: monsters have more HP and hit harder, the XP curve is steeper.
- Spirit Stones are a real fight: waves of guardians (plus Alpha guardians) as they crack, a shockwave you have to dodge, 4-7 rare+ items, potions, 2x XP and extra gold.
- Bosses have signature attacks with their own telegraphs: charge (red lane), fire/frost/void breath (red cone), meteor rain (red circles), summon portal, ground slam.
- New hero attack effects: sword slashes, arrows with trails, magic bolts, whirlwind, arrow fan, arcane nova.
- 10 passive skills (up to 10 ranks each): Vitality, Might, Swiftness, Precision (crit chance), Brutality (crit damage), Bloodthirst (lifesteal), Iron Skin (defence), Haste (attack speed), Focus (mana), Fortune (gold find).
- Settings window (O or the gear button): master/combat/interface volume, graphics quality, and rebindable keys.
- The Blacksmith only upgrades equipment you are wearing, and no longer hammers in your ears.
- Item tooltips always show above windows. The camera fades out trees and roofs between it and your hero.

## Universes
Every server is its own universe. On the first start it gets a world seed and a name (for example "The Verdant Throne"). The seed decides where monster camps, stones, bosses, trees and rocks are, so no two servers have the same map.
- **World Tier**: starts at 1. Each region has one World Boss (👑), picked by the seed. Defeating it in its own region raises the World Tier and reveals the next region. Tiers 1-7 are the seven zones. From tier 8 every new tier is a whole new map, generated from the seed and the server's history.
- **World Portal**: when the 7th World Boss (the Lord of Death) falls, a portal opens in the centre of the village. Press F at it to see every map unlocked on the server and travel between them. Each generated map has its own village with the Merchant, Blacksmith, Soul Mystic and a portal, monsters 10 levels above the previous map, stones, Alphas and a named World Boss. Killing that boss unlocks the next map, without end.
- **Chronicle** (H or the 🏛 button): the permanent record of firsts - first hero, first to reach level 10-60, first kill of each boss, first stone shattered in each region, first Mythic, every World Boss victory - and the Legends ranking that follows from it.
- The universe lives in `universe.json`. Back it up with `saves.json`. Set `worldSeed` in `config.json` before the first start to choose the seed.
- **Seed randomizer**: type `reseed` in the server console. `reseed confirm` founds a new universe with a random seed, `reseed confirm MY-SEED` with a seed you choose. Heroes and items are kept; the map layout, World Tier, chronicle and generated maps start over. The old universe is saved as `universe-backup-<time>.json`.
- Admin heroes are left out of the chronicle unless `recordAdminHistory` is `true` in `config.json`.

Details and design notes: `docs/UNIVERSE.md`.

## The two settings files
- **rates.json** - XP, gold, drops and difficulty. Edit and save while the server runs; changes apply within ~2 seconds.
  `xpRate`, `goldRate`, `gearDropRate`, `potionDropRate`, `rarityBoost` (0 normal, 1 = more rare/epic/legendary, 3 = loot shower),
  `monsterHp` (default 1.6), `monsterDamage` (default 1.4), `deathZoneMonsters` (default 1800, restart needed), `deathGoldLoss`, `respawnSeconds`.
  **Upgrading from v0.4?** Your old rates.json keeps its old values. Delete it to get the new, harder defaults (the server rewrites it on start).
- **config.json** - server name, message of the day, port, `admins` (hero names allowed to use admin commands), `disabledPlugins`.

## World (7 rings around the village)
| Zone | Levels | Monsters | Bosses (signature attack) | Stone |
|---|---|---|---|---|
| Whispering Meadows | 1-6 | Wolf, Slime, Boar, Shroomling | Alpha Wolf (charge), King Slime (summon) | Spirit Stone |
| Gloomwood | 7-14 | Goblin, Orc, Cave Spider, Bandit | Orc Warlord (charge), Spider Broodmother (summon) | Jade Stone |
| Ashen Barrens | 15-22 | Skeleton, Ogre, Wraith | Bone King (summon), Ogre Chieftain (slam) | Bone Obelisk |
| Ember Wastes | 23-30 | Hellhound, Ember Drake, Magma Golem | Elder Drake (breath), Infernal Colossus (meteors) | Ember Stone |
| Frostfang Peaks | 30-40 | Frost Fang, Yeti, Ice Golem | Frost Wyrm (breath), Yeti King (charge) | Frost Stone |
| Voidreach | 40-50 | Shade, Void Weaver, Void Knight | Void Lord (meteors), Abyssal Wyrm (breath) | Void Stone |
| **Death Zone** (map border) | 50-60 | ~1800 of everything, scaled up | 4x Lord of Death + Void Lord, Abyssal Wyrm, Frost Wyrm, Yeti King | Doom Stone |
- **Alpha** monsters (orange name + aura): 5x HP, harder hits, 3x XP, guaranteed loot, 90 s respawn. Like normal monsters they give less XP to heroes more than 5 levels above them.
- **Bosses** (gold name): every attack is telegraphed in red on the ground - get out of it. 3 min respawn, best loot.
- **World Bosses** (👑): the one boss per zone, chosen by the seed, that unlocks the next World Tier. 1.5x bigger and 3x HP.
- **Stones**: 6,000 base HP for the Spirit Stone and up from there; 5 + zone guardians spawn at every 20% of HP lost (up to 12), with an Alpha guardian at 60%, 40% and 20%, the stone pulses a blue shockwave (red circle first), respawn after 90 s.

## Village NPCs (click them or press F when close)
- **Merchant** - potions, elixirs, scrolls (incl. Skill Reset). Buys your gear (Shift/right-click a bag item, or "Sell junk").
- **Blacksmith** - upgrades the equipment you are wearing +0 to +9. Each + adds 10% to the item's stats (weapons +15% damage). From +5 a failure drops it one level.
- **Blacksmith** has two tabs. **Mythic merge**: three Mythics from your bag + 1,000,000 gold = one new random Mythic (any slot) at the three items' average item level.
- **Soul Mystic** has two tabs. **Reroll**: rerolls every stat of a worn or bag item for souls (1 common/uncommon, 2 rare, 3 epic, 5 legendary, 10 mythic); name, colour, item level and + upgrades stay. **Affix**: puts one affix on a weapon, ring or amulet - *Vampiric* (Lifesteal %), *Brutal* (Crit Damage %) or *Swift* (Attack Speed %) - for souls (2/2/3/5/8/15 by rarity). The affix names the item, and a new one replaces the old. Gear totals are capped at 15% lifesteal and 40% attack speed.

## Gear & merging
6 slots, 6 colours (common, uncommon, rare, epic, legendary, **mythic**). Helmets, armor and boots never roll damage or crit.
**Mythic** items (red) are only made by merging. Besides stats they add 2-3 passive skill ranks (+1 to +3 each, up to 5 above the normal cap) while worn.
**Merge**: Inventory → Merge → pick items of the same colour (any slot, any level) → you get 1 item of the next colour
whose item level is the average of the merged items (slot of the first item, best +forge kept). It takes 2 common → uncommon, 3 uncommon → rare, 4 rare → epic,
5 epic → legendary, 15 legendary → mythic. Mythics can't be merged. Auto-merge buttons go up to green, blue, purple or orange.

## Souls
Spirit Stones, Alphas and bosses drop 1-5 souls each (purple orb). Souls show next to your gold and are spent at the Soul Mystic.

## Skills
1 point per level. Active skills (keys 1-3) go to rank 5, passives to rank **99**. Open with K and switch tabs.
Passives give their full bonus per rank up to rank 10. After that each rank adds a little less, and the bonus levels off towards a cap (about 95% of it at rank 99): Vitality / Might / Focus +300%, Swiftness +80%, Precision +30% crit chance, Brutality +400% crit damage, Bloodthirst 15% lifesteal, Iron Skin 60% less damage, Haste 60% faster attacks, Fortune +300% gold.

## Items
Hover an item and hold **Shift** to see the lowest and highest value each of its stats could have rolled at that item level and rarity.
**Consumables** have their own tab in the inventory. Elixirs and scrolls stack: each one adds its time, up to 5 minutes left.

## Teams and trading
Press **Y** (or the 👥 button) to open the Team window. Invite a hero by name (or `/invite name`, `/accept`, `/leave`); up to 5 heroes, team chat with `/t message`.
**Sharing**: team members within 1000 units of a kill (same map) split its XP - with +15% in total for every extra member - and its gold. The killer's gold drops on the ground as usual; the others get theirs straight away. Gear and other drops still go to the killer. The leader switches sharing on or off with `/share` or the button in the Team window (on by default).
**Tougher monsters**: a monster fought by a team gets x1.5 HP and damage for every extra member nearby (2 heroes x1.5, 3 x2.25, 4 x3.4, 5 x5.1). It keeps that strength until it walks home and heals, or respawns. This applies whether sharing is on or off.
Only team members can trade. Press **Trade** next to a member (or `/trade name`). Both put bag items and gold on the table; when both press **Accept trade** the swap happens at once. Any change to an offer takes back both acceptances, so nobody can switch items after you accepted. Leaving the team or the game cancels the trade.

## Language and text size

Choose English or Hungarian on the login screen or in Settings → Graphics. Text follows the game window size, and the text-size slider lets you adjust it further from 85% to 130%. Both settings are saved in the browser. See PLUGINS.md for adding a locale.

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

- `server.js` connects the modules. `server-lifecycle.js` starts the server and handles autosave, shutdown and restart.
- `simulation.js` advances the game world. `combat.js`, `monsters.js` and `loot.js` handle fights, spawns and rewards.
- `characters.js`, `equipment.js` and `inventory.js` handle character progression, item generation and shop actions.
- `player-session.js` authenticates players and dispatches game messages. `snapshots.js` builds the state updates sent to clients.
- `universe.js` holds the world seed, World Tier, region generator and chronicle. `regions.js` builds the generated maps and runs the World Portal.
- `plugin-host.js` registers plugins and their hooks. `web-server.js` serves the client and connects WebSocket transport.

## Plugins
See PLUGINS.md. Drop files into `plugins/`, restart.

## Credits
3D models: Quaternius (https://quaternius.com), CC0. Everything else: original.

## Performance checks
Run `node --test tests/performance.test.js` for spatial queries, loot ownership, skill targeting, sleeping AI, state deltas and overload handling.

Monsters, players and loot use a shared persistent spatial index. AI processes nearby and still-active monsters; distant lifecycle checks (respawn and summon expiry) run every 500 ms. Empty maps keep their state without running full AI every tick. Code that moves an indexed entity directly should call `entities.update(entity)`; monster membership is also reconciled during lifecycle checks.

Clients that negotiate `meDeltas` receive inventory counts and skill ranks only on change. Older clients keep receiving full state. A simulation tick over its 50 ms budget may skip one snapshot, keeping queued events for the next publication; consecutive snapshots are never skipped. Console `status` reports tick overruns and skipped snapshots. Under sustained overload the fixed-step simulation slows down rather than running a burst of catch-up ticks.
