# Shardlands plugins

Drop a `.js` file (or a folder containing `index.js`) into `plugins/` and restart the server.
Files starting with `_` are ignored. Disable one without deleting it: add its name to `disabledPlugins` in `config.json`.
A broken plugin never crashes the server: errors are printed to the console and the plugin is skipped.

The supported server-plugin contract is `init(api)` and the API described here.
The temporary root backend module wrappers have been retired; internal modules
live under `src/`. Built-in plugins do not import those legacy paths. Third-party
code using an old direct import such as `../monsters` must migrate to
`../src/combat/monsters` (or preferably use `api.MOBTYPES`, `api.spawn`, etc.).
Direct imports of backend internals are not a separate stable plugin API.
See [the wrapper audit](docs/ROOT-WRAPPER-REMOVAL.md) for the complete path map.

```js
// plugins/my_plugin.js
module.exports = { name: 'my_plugin', version: '1.0', init(api) {
  api.on('kill', (player, mob) => { if (mob.ty === 'wolf') api.giveGold(player, 5); });
  api.command('hello', {}, (player, args) => 'Hi ' + player.name);       // /hello  (add {admin:true} to restrict)
} };
```

## Events: `api.on(name, fn)`
| event | arguments | notes |
|---|---|---|
| `join` / `leave` | `player` | |
| `chat` | `player, text` | return `false` to swallow the message |
| `kill` | `player, mob` | mob.ty = type id, mob.lvl, mob.tier |
| `damage` | `player, mob, o` | change `o.v` to alter damage dealt (o.crit tells if it crit) |
| `hurt` | `player, mob, o` | change `o.v` to alter damage taken |
| `death` | `player, mob` | |
| `xp` | `player, o` | change `o.v` to alter XP before bonuses |
| `levelup` | `player` | |
| `merge` | `player, newItem, usedItems` | fired after items are merged (also the Blacksmith's Mythic merge); you may modify `newItem` |
| `reroll` | `player, item` | the Soul Mystic rerolled an item |
| `affix` | `player, item` | the Soul Mystic put an affix on an item (`item.afx = { k, v }`) |
| `teamJoin` | `player, team` | a hero joined a team |
| `trade` | `playerA, playerB, details` | a trade completed (`details.gave`, `details.got`, `goldA`, `goldB`) |
| `tick` | `dt` | runs 20 times per second, keep it light |

Skill ids on `player.sk`: actives `s1 mend frenzy` (max 5), passives `vit might swift crit critdmg lifesteal guard haste focus fortune` (max 99).

## Adding content
- `api.addMob(id, {name, lvl, hp, dmg, spd, xp, gold:[min,max], r, aggro, color, boss})` then `api.addToTier(tierIndex, id)` (or `addToTier(i, id, true)` for a boss). Tiers: 0 Meadows, 1 Gloomwood, 2 Ashen Barrens, 3 Ember Wastes, 4 Frostfang Peaks, 5 Voidreach, 6 Death Zone.
- `api.addItem(id, {n, d, price, w, color, use(player){ ... }})` consumable. `w` = drop weight (0 = shop only). `use` may return a message string, or `false` to cancel (item not consumed).
- `api.addClass(id, {name, desc, color, fam:'sword'|'bow'|'staff', range, hp, mp, atk, s1, s1r, s1m, s1c, s1n, s2, s3, model, tint})`.
  `model` picks the 3D hero: `Warrior`, `Ranger`, `Wizard`, `Rogue`, `Cleric` or `Monk`; `tint` is an `[r,g,b]` colour multiplier (see class_berserker.js).
- `api.genGear(slot|undefined, ilvl, rarity 0-4|undefined, fam)` makes a gear item; `api.giveGear(player, item)` puts it in the bag; `api.dropAt(x, y, {kind:'gear', item, name:item.name, rar:item.rar}, ownerId)` drops it on the ground.
- Slots: weapon, helm, armor, boots, ring, amulet. Stats: dmg, hp, mp, def, crit, spd. (Gear gold find and XP bonus were removed; gold find only comes from the Fortune passive.) Rarities: 0 Common ... 4 Legendary.

## Rates
`api.rates` is the live object behind rates.json (xpRate, goldRate, gearDropRate, potionDropRate, rarityBoost, monsterHp, monsterDamage, ...).
Change it from a plugin for events (e.g. double XP weekends): `api.rates.xpRate *= 2`.

## Monsters: alphas & bosses
`api.spawn(type, x, y, { alpha: true })` spawns an Alpha version. Use `api.spawn('wolf', x, y, { level: 5 })` to reuse a base monster at another level. HP, damage, XP and gold scale by the target level divided by the base level, raised to 1.9, 1.37, 2 and 1.5 respectively. Stones use 1.4 for HP. Built-in stones use 4,000 base HP at level 5 as their reference point. Adding an existing type to a higher tier automatically scales it when its base level is below that tier's range. Types with `boss: true` do the telegraphed ground slam automatically.
Give a boss a signature attack with `special` in its addMob definition: `'charge'`, `'breath'`, `'meteor'`, `'summon'` or `'slam'` (it alternates with the slam).
`api.addToTier(i, id, true)` adds a boss to zone i (0-6, 6 = Death Zone, whose monsters are auto-scaled to level 50-60).

## Helpers
`players()`, `mobs()`, `findPlayer(name)`, `spawn(type, x, y, {temp:true})`, `say(player, text)`, `broadcast(text)`,
`giveItem(p, id, n)`, `giveGold(p, n)`, `giveXp(p, n)`, `heal(p)`, `teleport(p, x, y)` (x and y are local to the map the player is on), `teleportTo(p, otherPlayer)`, `toVillage(p)`, `setLevel(p, n)`, `refresh(p)` (call after you change a player's gear/stats),
`effect(x, y, radius, style)` (styles: blade archer mage heal lvl rage buff), `text(x, y, text, kind)`,
`toast(p, text, colour)` (big centre message), `stats()` (server load), `NPCS` (merchant/smith positions), `isAdmin(p)`, `kick(p)`, `data()` (a JSON object saved automatically for your plugin), `config`, `consts` (map size, village centre), plus raw `MOBTYPES`, `ITEMS`, `CLASSES`, `TIERS`.
`player.data` is a free JSON object saved with each hero: store per-hero plugin state there.

## Client plugins (looks)
Files in `public/plugins/*.js` are loaded automatically by the browser. A script that matches a server plugin by filename or declared name loads only if that plugin started successfully. Entries in `disabledPlugins` can also disable standalone client scripts by filename without the extension. Give a new monster a model:
```js
Shardlands.addModel('frostwolf', { fn: beast, kind: 'wolf', sc: 1.15, body: hex('#c8ecff'), leg: hex('#6fa3c8'), top: 46 });
```
Available: `beast` (wolf/boar shapes), `human` (kinds: orc, bandit, skeleton, ogre, golem...), `drake`, `slime`, `spider`, `part`, `hex`, `mix`, `golem`, `D`/`M` (raw draw + meshes: box, limb, tlimb, cyl, cone, taper, torso, ball, rock, octa, ring, disc, wing, gable, cone6, trunk, tuft). `D(mesh, x,y,z, sx,sy,sz, yaw, pitch, [r,g,b], emissive, alpha, roll)`, `Shardlands.FXC` (effect colours), `Shardlands.burst(x,y,z,count,colour,speed,life,size)` for particles.
Unknown monsters get an automatic model tinted with their `color`, so a server plugin alone already works.
Use an animated character model for a humanoid monster instead: `Shardlands.charModel('cultist', { m: 'Cleric', sc: 1.1, tint: [.7, .4, .9] })`.

## Built-in plugins
`admin.js` (needs your hero name in `admins`): /give /gear /drop /gold /level /heal /tp /spawn /announce /kick /xprate /droprate /players.
`welcome.js`, `frost_wolf.js` (new monster + item), `class_berserker.js` (new class): read them as examples.

## Translating game text

Register a locale in a script under `public/locales/` using `GameText.addCatalog('de', entries, 'Deutsch')`. Load the script in `public/index.html` after `text.js` and before `game.js`. The language selectors list registered catalogs automatically. Use `public/locales/hu.js` as a reference. Missing entries use the English fallback.

- For HTML labels, use `data-text="myPlugin.label"`. Use `data-title-text` or `data-placeholder-text` for those attributes.
- For dynamic client labels, call `text('myPlugin.label', 'Hello {player}', { player })`.
- For a server message or a command reply, create it with `api.message('myPlugin.reward', 'Reward: {amount}', { amount })`. Pass the result to `api.say`, `api.toast`, `api.broadcast`, or return it from the command handler.
- Use stable content IDs for names, for example `monster.frostwolf`, `item.frostpot.name`, and `class.berserker.name`. Keep parameter names such as `{amount}` identical in the translation. Character names and player chat are displayed as entered.
