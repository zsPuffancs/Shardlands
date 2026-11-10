# SHARDLANDS 3D v0.5 - private multiplayer hack-and-slash with plugins (Metin2-inspired, 100% original)

## Run
1. Install Node.js 18+ (https://nodejs.org). Nothing else. No internet needed to play.
2. Windows: double-click `start.bat`.  Mac/Linux: `./start.sh`
3. Open http://localhost:3000. Friends on your LAN join at http://YOUR-LAN-IP:3000 (over the internet: Tailscale or a cloudflared/ngrok tunnel).
Set a hero password on the login screen so nobody can take your name.

## What's new in v0.5
- Real 3D models: Quaternius CC0 characters (animated heroes, NPCs, bandits, goblins, orcs, void knights) and nature packs (forests, farms, rocks, flowers per zone).
- Map is twice as wide (10600 x 10600). Every zone has more room, 10-16 Spirit Stones and 5-30 Alphas.
- Harder and slower: monsters have more HP and hit harder, the XP curve is steeper.
- Spirit Stones are a real fight: waves of guardians (plus Alpha guardians) as they crack, a shockwave you have to dodge, 4-7 rare+ items, potions, 2x XP and extra gold.
- Bosses have signature attacks with their own telegraphs: charge (red lane), fire/frost/void breath (red cone), meteor rain (red circles), summon portal, ground slam.
- New hero attack effects: sword slashes, arrows with trails, magic bolts, whirlwind, arrow fan, arcane nova.
- 10 passive skills (up to 10 ranks each): Vitality, Might, Swiftness, Precision (crit chance), Brutality (crit damage), Bloodthirst (lifesteal), Iron Skin (defence), Haste (attack speed), Focus (mana), Fortune (gold find).
- Settings window (O or the gear button): master/combat/interface volume, graphics quality, and rebindable keys.
- The Blacksmith only upgrades equipment you are wearing, and no longer hammers in your ears.
- Item tooltips always show above windows. The camera fades out trees and roofs between it and your hero.

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
- **Alpha** monsters (orange name + aura): 5x HP, harder hits, guaranteed loot, 90 s respawn.
- **Bosses** (gold name): every attack is telegraphed in red on the ground - get out of it. 3 min respawn, best loot.
- **Stones**: guardians spawn at every 20% of HP lost, the stone pulses a blue shockwave (red circle first), respawn after 90 s.

## Village NPCs (click them or press F when close)
- **Merchant** - potions, elixirs, scrolls (incl. Skill Reset). Buys your gear (Shift/right-click a bag item, or "Sell junk").
- **Blacksmith** - upgrades the equipment you are wearing +0 to +9. Each + adds 10% to the item's stats (weapons +15% damage). From +5 a failure drops it one level.

## Gear & merging
6 slots, 5 colours (common, uncommon, rare, epic, legendary). Helmets, armor and boots never roll damage or crit.
**Merge**: Inventory → Merge → pick any 3 items of the same colour (any slot, any level) → you get 1 item of the next colour
at your level ±20% (slot of the first item, best +forge kept). Auto-merge buttons do it for all greens or all blues.

## Skills
1 point per level. Active skills (keys 1-3) go to rank 5, passives to rank 10. Open with K and switch tabs.

## Controls (all rebindable in Settings → Key bindings, except movement)
Click: move / attack / loot / talk · WASD walk · right-drag or ←→ camera · wheel zoom · 1-3 skills · Q/E/R/T potions & return scroll
F talk · I inventory · K skills · O settings · G graphics quality · P fps · M mute · Enter chat (/help) · Esc close windows.
Windows can be dragged by their title bar.

## Admin commands (put your hero name in config.json "admins")
/give /gear /drop /gold /level /heal /tp /zone <0-6> /spawn /god /stats /rate /xprate /droprate /announce /kick /players
`/stats` shows monster count and server tick time - handy while stress testing the Death Zone. `/god` makes you immune.

## Performance
Graphics default to Auto (lowers resolution and shadows if the frame rate drops). Trees and plants far away use cheap stand-ins,
only the nearest ~26 humanoid monsters are fully animated, and sleeping monsters cost the server nothing
(3363 monsters ≈ 0.5 ms per server tick). Use a current Chrome/Edge/Firefox with hardware acceleration on.
Very old GPUs that can't do skinned characters fall back to the classic block models automatically.

## Plugins
See PLUGINS.md. Drop files into `plugins/`, restart.

## Credits
3D models: Quaternius (https://quaternius.com), CC0. Everything else: original.
