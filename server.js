// SHARDLANDS 3D server - original Metin2-style mini MMO. Zero dependencies (Node 18+).
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
let CONFIG = { serverName: 'Shardlands', motd: '', admins: [], disabledPlugins: [], port: 3000 };
try { Object.assign(CONFIG, JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'))); } catch (e) {}
const PORT = process.env.PORT || CONFIG.port || 3000;

// ================= RATES (rates.json, reloaded live while the server runs) =================
const RATES_FILE = path.join(__dirname, 'rates.json');
const RATES = { xpRate: 1, goldRate: 1, gearDropRate: 0.8, potionDropRate: 1, rarityBoost: 0, monsterHp: 1.6, monsterDamage: 1.4, deathZoneMonsters: 1800, deathGoldLoss: 0.1, respawnSeconds: 11 };
function writeDefaultRates() {
  const o = Object.assign({ _README: [
    'Edit the numbers below and save - the running server picks them up within ~2 seconds (no restart).',
    'xpRate: XP multiplier (1 = normal, 2 = double).  goldRate: gold dropped by monsters.',
    'gearDropRate: chance of equipment drops (2 = twice as often).  potionDropRate: potions/scrolls drops.',
    'rarityBoost: 0 = normal; 1 = noticeably more rare/epic/legendary; 3 = loot shower.',
    'monsterHp / monsterDamage: monster strength (applies as monsters respawn / immediately).',
    'deathZoneMonsters: how many monsters live in the Death Zone (needs a server restart).',
    'deathGoldLoss: share of gold lost on death (0.1 = 10%).  respawnSeconds: normal monster respawn time.'] }, RATES);
  try { fs.writeFileSync(RATES_FILE, JSON.stringify(o, null, 2)); } catch (e) {}
}
function loadRates(first) {
  if (!fs.existsSync(RATES_FILE)) { if (first) writeDefaultRates(); return; }
  try { const r = JSON.parse(fs.readFileSync(RATES_FILE, 'utf8')); for (const k in RATES) if (typeof r[k] === 'number' && isFinite(r[k])) RATES[k] = Math.max(0, r[k]); if (!first) console.log('  rates.json reloaded: xp x' + RATES.xpRate + ', gold x' + RATES.goldRate + ', gear x' + RATES.gearDropRate + ', potions x' + RATES.potionDropRate + ', rarity +' + RATES.rarityBoost); }
  catch (e) { console.log('  rates.json could not be read (' + e.message + ') - keeping previous values'); }
}
loadRates(true); fs.watchFile(RATES_FILE, { interval: 1500 }, () => loadRates(false));

const W = 10600, H = 10600, CX = 5300, CY = 5300, VILLAGE = 220, BAGMAX = 30;
const NPCS = { merchant: { x: CX, y: CY - 33, name: 'Merchant' }, smith: { x: CX + 70, y: CY + 10, name: 'Blacksmith' } }, NPC_RANGE = 210;
const SAVE = path.join(__dirname, 'saves.json'), PDATA = path.join(__dirname, 'plugin-data.json');
let saves = {}, pdata = {};
try { saves = JSON.parse(fs.readFileSync(SAVE, 'utf8')); } catch (e) {}
try { pdata = JSON.parse(fs.readFileSync(PDATA, 'utf8')); } catch (e) {}

// ================= DATA =================
const MOBTYPES = {
  // Whispering Meadows 1-6
  wolf:        { name: 'Wild Wolf',        lvl: 1,  hp: 40,     dmg: 4,   spd: 105, xp: 14,    gold: [3, 9],         r: 14, aggro: 85,  color: '#9aa0a6' },
  slime:       { name: 'Green Slime',      lvl: 2,  hp: 55,     dmg: 5,   spd: 70,  xp: 18,    gold: [4, 10],        r: 15, aggro: 60,  color: '#59d26a' },
  boar:        { name: 'Tusk Boar',        lvl: 3,  hp: 65,     dmg: 6,   spd: 95,  xp: 22,    gold: [5, 14],        r: 16, aggro: 75,  color: '#a0703c' },
  shroom:      { name: 'Shroomling',       lvl: 5,  hp: 95,     dmg: 8,   spd: 80,  xp: 30,    gold: [7, 16],        r: 14, aggro: 80,  color: '#c94a3a' },
  alphawolf:   { name: 'Alpha Wolf',       lvl: 6,  hp: 900,    dmg: 14,  spd: 120, xp: 300,   gold: [120, 240],     r: 24, aggro: 210, color: '#3d4450', boss: true },
  kingslime:   { name: 'King Slime',       lvl: 7,  hp: 1300,   dmg: 15,  spd: 75,  xp: 380,   gold: [150, 300],     r: 34, aggro: 190, color: '#2fb54e', boss: true },
  // Gloomwood 7-14
  goblin:      { name: 'Goblin Cutthroat', lvl: 7,  hp: 170,    dmg: 15,  spd: 125, xp: 46,    gold: [16, 34],       r: 13, aggro: 190, color: '#7fae3a' },
  orc:         { name: 'Orc Raider',       lvl: 8,  hp: 220,    dmg: 18,  spd: 100, xp: 55,    gold: [20, 45],       r: 18, aggro: 200, color: '#5a9e4b' },
  spider:      { name: 'Cave Spider',      lvl: 9,  hp: 170,    dmg: 16,  spd: 135, xp: 62,    gold: [18, 40],       r: 14, aggro: 200, color: '#4a2f5a' },
  bandit:      { name: 'Bandit',           lvl: 10, hp: 300,    dmg: 24,  spd: 110, xp: 80,    gold: [30, 70],       r: 17, aggro: 220, color: '#b5483a' },
  warlord:     { name: 'Orc Warlord',      lvl: 13, hp: 4200,   dmg: 46,  spd: 100, xp: 1300,  gold: [400, 800],     r: 30, aggro: 260, color: '#2f6a2a', boss: true },
  broodmother: { name: 'Spider Broodmother', lvl: 14, hp: 5200, dmg: 50,  spd: 115, xp: 1600,  gold: [500, 900],     r: 38, aggro: 260, color: '#5a2a6a', boss: true },
  // Ashen Barrens 15-22
  skeleton:    { name: 'Skeleton',         lvl: 16, hp: 700,    dmg: 42,  spd: 105, xp: 190,   gold: [60, 120],      r: 17, aggro: 220, color: '#d9d6c4' },
  ogre:        { name: 'Ogre Brute',       lvl: 18, hp: 900,    dmg: 55,  spd: 90,  xp: 260,   gold: [120, 260],     r: 26, aggro: 230, color: '#7b5ea7' },
  wraith:      { name: 'Wraith',           lvl: 20, hp: 950,    dmg: 60,  spd: 125, xp: 300,   gold: [140, 280],     r: 16, aggro: 240, color: '#9fb0d0' },
  boneking:    { name: 'The Bone King',    lvl: 21, hp: 13000,  dmg: 95,  spd: 95,  xp: 4200,  gold: [900, 1800],    r: 34, aggro: 280, color: '#c9c2a0', boss: true },
  ogrechief:   { name: 'Ogre Chieftain',   lvl: 22, hp: 16000,  dmg: 105, spd: 90,  xp: 4800,  gold: [1000, 2000],   r: 42, aggro: 270, color: '#5e3f8a', boss: true },
  // Ember Wastes 23-30
  hellhound:   { name: 'Hellhound',        lvl: 23, hp: 1300,   dmg: 70,  spd: 140, xp: 430,   gold: [200, 400],     r: 18, aggro: 260, color: '#c8361a' },
  drake:       { name: 'Ember Drake',      lvl: 25, hp: 1700,   dmg: 82,  spd: 115, xp: 560,   gold: [250, 500],     r: 30, aggro: 260, color: '#e0662b' },
  golem:       { name: 'Magma Golem',      lvl: 28, hp: 3400,   dmg: 104, spd: 70,  xp: 800,   gold: [300, 600],     r: 34, aggro: 200, color: '#7a6a60' },
  elderdrake:  { name: 'Elder Drake',      lvl: 30, hp: 36000,  dmg: 160, spd: 120, xp: 12000, gold: [2500, 5000],   r: 44, aggro: 320, color: '#5a1f6a', boss: true },
  infernal:    { name: 'Infernal Colossus', lvl: 30, hp: 40000, dmg: 170, spd: 75,  xp: 13000, gold: [2600, 5200],   r: 50, aggro: 280, color: '#a32a14', boss: true },
  // Frostfang Peaks 30-40
  frostfang:   { name: 'Frost Fang',       lvl: 32, hp: 2600,   dmg: 108, spd: 135, xp: 950,   gold: [380, 760],     r: 18, aggro: 260, color: '#cfe8ff' },
  yeti:        { name: 'Yeti',             lvl: 35, hp: 3800,   dmg: 130, spd: 95,  xp: 1200,  gold: [450, 900],     r: 30, aggro: 240, color: '#e8eef5' },
  icegolem:    { name: 'Ice Golem',        lvl: 38, hp: 5200,   dmg: 150, spd: 70,  xp: 1500,  gold: [520, 1040],    r: 36, aggro: 220, color: '#8fc4ef' },
  yetiking:    { name: 'Yeti King',        lvl: 39, hp: 60000,  dmg: 210, spd: 95,  xp: 22000, gold: [4000, 8000],   r: 46, aggro: 300, color: '#f2f6fa', boss: true },
  frostwyrm:   { name: 'Frost Wyrm',       lvl: 40, hp: 70000,  dmg: 230, spd: 120, xp: 25000, gold: [4500, 9000],   r: 52, aggro: 330, color: '#9fd8ff', boss: true },
  // Voidreach 40-50
  shade:       { name: 'Shade',            lvl: 42, hp: 4300,   dmg: 165, spd: 130, xp: 1800,  gold: [600, 1200],    r: 17, aggro: 260, color: '#3a2a5a' },
  voidweaver:  { name: 'Void Weaver',      lvl: 44, hp: 4800,   dmg: 175, spd: 140, xp: 2000,  gold: [650, 1300],    r: 18, aggro: 260, color: '#6a2a9a' },
  voidknight:  { name: 'Void Knight',      lvl: 47, hp: 6500,   dmg: 200, spd: 110, xp: 2500,  gold: [750, 1500],    r: 20, aggro: 250, color: '#4a2a7a' },
  voidlord:    { name: 'Void Lord',        lvl: 50, hp: 120000, dmg: 300, spd: 100, xp: 45000, gold: [8000, 15000],  r: 50, aggro: 330, color: '#2a1040', boss: true },
  abyssalwyrm: { name: 'Abyssal Wyrm',     lvl: 50, hp: 130000, dmg: 320, spd: 120, xp: 48000, gold: [8500, 16000],  r: 56, aggro: 340, color: '#2a0a3a', boss: true },
  // Death Zone 50-60
  deathlord:   { name: 'Lord of Death',    lvl: 60, hp: 300000, dmg: 450, spd: 105, xp: 120000, gold: [20000, 40000], r: 54, aggro: 360, color: '#1a1a1a', boss: true },
  // stones (one kind per zone)
  stone:       { name: 'Spirit Stone',     lvl: 5,  hp: 4000,   dmg: 0, spd: 0, xp: 600,   gold: [400, 800],     r: 28, aggro: 0, color: '#5cc8ff', stone: true, shape: 'crystal' },
  jadestone:   { name: 'Jade Stone',       lvl: 12, hp: 11000,  dmg: 0, spd: 0, xp: 1800,  gold: [900, 1800],    r: 28, aggro: 0, color: '#4ee08a', stone: true, shape: 'crystal' },
  bonestone:   { name: 'Bone Obelisk',     lvl: 20, hp: 170000, dmg: 0, spd: 0, xp: 4500,  gold: [1800, 3600],   r: 30, aggro: 0, color: '#e8e0c0', stone: true, shape: 'obelisk' },
  emberstone:  { name: 'Ember Stone',      lvl: 28, hp: 45000,  dmg: 0, spd: 0, xp: 9000,  gold: [3000, 6000],   r: 30, aggro: 0, color: '#ff7a2a', stone: true, shape: 'obelisk' },
  froststone:  { name: 'Frost Stone',      lvl: 37, hp: 26000,  dmg: 0, spd: 0, xp: 16000, gold: [5000, 9000],   r: 30, aggro: 0, color: '#9fe8ff', stone: true, shape: 'crystal' },
  voidstone:   { name: 'Void Stone',       lvl: 46, hp: 105000, dmg: 0, spd: 0, xp: 26000, gold: [7000, 13000],  r: 30, aggro: 0, color: '#b45cff', stone: true, shape: 'crystal' },
  doomstone:   { name: 'Doom Stone',       lvl: 56, hp: 70000,  dmg: 0, spd: 0, xp: 45000, gold: [12000, 20000], r: 32, aggro: 0, color: '#ff2a3a', stone: true, shape: 'obelisk' },
};
const TIERS = [
  { name: 'Whispering Meadows', min: 400,  max: 1250, lv: [1, 6],   types: ['wolf', 'slime', 'boar', 'shroom'],        bosses: ['alphawolf', 'kingslime'],   bossCount: 2, count: 170, stones: 10, stone: 'stone',      alphas: 5 },
  { name: 'Gloomwood',          min: 1250, max: 2100, lv: [7, 14],  types: ['goblin', 'orc', 'spider', 'bandit'],      bosses: ['warlord', 'broodmother'],   bossCount: 2, count: 230, stones: 12, stone: 'jadestone',  alphas: 6 },
  { name: 'Ashen Barrens',      min: 2100, max: 2900, lv: [15, 22], types: ['skeleton', 'ogre', 'wraith'],             bosses: ['boneking', 'ogrechief'],    bossCount: 2, count: 240, stones: 12, stone: 'bonestone',  alphas: 6 },
  { name: 'Ember Wastes',       min: 2900, max: 3650, lv: [23, 30], types: ['hellhound', 'drake', 'golem'],            bosses: ['elderdrake', 'infernal'],   bossCount: 2, count: 230, stones: 12, stone: 'emberstone', alphas: 6 },
  { name: 'Frostfang Peaks',    min: 3650, max: 4350, lv: [30, 40], types: ['frostfang', 'yeti', 'icegolem'],          bosses: ['frostwyrm', 'yetiking'],    bossCount: 2, count: 240, stones: 12, stone: 'froststone', alphas: 7 },
  { name: 'Voidreach',          min: 4350, max: 4950, lv: [40, 50], types: ['shade', 'voidweaver', 'voidknight'],      bosses: ['voidlord', 'abyssalwyrm'],  bossCount: 2, count: 240, stones: 12, stone: 'voidstone',  alphas: 7 },
  { name: 'Death Zone',         min: 4950, max: 99999, lv: [50, 60], types: ['voidknight', 'shade', 'voidweaver', 'yeti', 'icegolem', 'hellhound', 'golem', 'drake', 'frostfang'],
    bosses: ['deathlord', 'deathlord', 'deathlord', 'deathlord', 'voidlord', 'abyssalwyrm', 'frostwyrm', 'yetiking'], count: 'death', stones: 16, stone: 'doomstone', alphas: 30, scale: true, outer: true },
];
// boss signature attacks (they alternate with a ground slam)
const SPECIAL = { alphawolf: 'charge', kingslime: 'summon', warlord: 'charge', broodmother: 'summon', boneking: 'summon', ogrechief: 'slam', elderdrake: 'breath', infernal: 'meteor', yetiking: 'charge', frostwyrm: 'breath', voidlord: 'meteor', abyssalwyrm: 'breath', deathlord: 'meteor' };
const STONE_DMG = [30, 70, 120, 180, 250, 330, 430];
const CLASSES = {
  blade:  { name: 'Blade',  desc: 'Melee tank with a sweeping whirlwind.', color: '#b9bccb', fam: 'sword', range: 40,  hp: 1.25, mp: 0.8, atk: 1.0,  s1: 'Whirlwind', s1r: 100, s1m: 1.8, s1c: 15, s1n: 99, s2: 'Second Wind',  s3: 'Battle Rage' },
  archer: { name: 'Archer', desc: 'Ranged hunter, hits several targets.',  color: '#5fae56', fam: 'bow',   range: 260, hp: 1.0,  mp: 1.0, atk: 0.9,  s1: 'Multishot', s1r: 260, s1m: 1.4, s1c: 18, s1n: 3,  s2: 'Herbal Salve', s3: 'Eagle Focus' },
  mage:   { name: 'Mage',   desc: 'Glass cannon with a huge nova.',        color: '#8b63d8', fam: 'staff', range: 210, hp: 0.85, mp: 1.5, atk: 1.05, s1: 'Nova',      s1r: 140, s1m: 2.2, s1c: 25, s1n: 99, s2: 'Healing Light', s3: 'Arcane Surge' },
};
const ITEMS = { // stackable consumables. w = random drop weight (0 = shop only)
  hp:    { n: 'Health Potion',         price: 40,  d: 'Restores 40% HP',              w: 30, color: '#e24a4a' },
  hp2:   { n: 'Greater Health Potion', price: 150, d: 'Restores 100% HP',             w: 6,  color: '#ff2a6a' },
  mp:    { n: 'Mana Potion',           price: 50,  d: 'Restores 50% MP',              w: 24, color: '#4a8fe2' },
  atk:   { n: 'Fury Elixir',           price: 120, d: '+30% damage for 60s',          w: 8,  color: '#ff9a3a' },
  def:   { n: 'Iron Elixir',           price: 120, d: '-35% damage taken for 60s',    w: 8,  color: '#aab4c0' },
  spd:   { n: 'Swift Scroll',          price: 80,  d: '+35% move speed for 60s',      w: 8,  color: '#3ae0c0' },
  xp:    { n: 'Wisdom Scroll',         price: 300, d: '+50% XP for 5 minutes',        w: 4,  color: '#b06aff' },
  ret:   { n: 'Return Scroll',         price: 60,  d: 'Teleports you to the village', w: 5,  color: '#ffffff' },
  reset: { n: 'Skill Reset Scroll',    price: 500, d: 'Refunds all skill points',     w: 0,  color: '#555566' },
};
// ---- gear ----
const SLOTS = ['weapon', 'helm', 'armor', 'boots', 'ring', 'amulet'], NO_DMG = { helm: 1, armor: 1, boots: 1 };
const RARITY = [{ n: 'Common', m: 1, x: 0, w: 60 }, { n: 'Uncommon', m: 1.25, x: 1, w: 25 }, { n: 'Rare', m: 1.55, x: 2, w: 11 }, { n: 'Epic', m: 1.9, x: 3, w: 3.5 }, { n: 'Legendary', m: 2.4, x: 4, w: 0.6 }];
const MATS = ['Rusty', 'Iron', 'Steel', 'Runed', 'Dragonbone', 'Voidforged', 'Starmetal', 'Celestial', 'Doomforged'];
const BASES = { weapon: { sword: 'Sword', bow: 'Bow', staff: 'Staff' }, helm: ['Helm', 'Cap', 'Hood'], armor: ['Mail', 'Robe', 'Vest'], boots: ['Boots', 'Greaves', 'Sandals'], ring: ['Ring', 'Band', 'Signet'], amulet: ['Amulet', 'Pendant', 'Charm'] };
const SUFFIX = ['of the Wolf', 'of Embers', 'of the Bear', 'of Storms', 'of the Fox', 'of Ruin', 'of Kings', 'of the Void', 'of Dawn', 'of Frost', 'of the Abyss'];
const STATDEF = {
  dmg: { n: 'Damage', f: i => 1.1 * i + 1 }, hp: { n: 'Max HP', f: i => 7 * i + 8 }, mp: { n: 'Max MP', f: i => 3 * i + 3 }, def: { n: 'Defense', f: i => 0.9 * i + 1 },
  crit: { n: 'Crit Chance %', f: i => 1.5 + i * 0.07, pct: 1 }, spd: { n: 'Move Speed %', f: i => 1.5 + i * 0.05, pct: 1 },
  gf: { n: 'Gold Find %', f: i => 4 + i * 0.3, pct: 1 }, xpb: { n: 'XP Bonus %', f: i => 2 + i * 0.15, pct: 1 },
};
const PRIMARY = { weapon: { dmg: i => 3 * i + 5 }, helm: { def: i => 1.3 * i + 2 }, armor: { hp: i => 12 * i + 20, def: i => 1.6 * i }, boots: { spd: i => 1.5 + i * 0.08, def: i => 0.8 * i }, ring: { dmg: i => 0.9 * i + 1, crit: i => 1 + i * 0.05 }, amulet: { hp: i => 6 * i + 10, mp: i => 2 * i + 4 } };
const SKILLS = ['s1', 'mend', 'frenzy', 'vit', 'might', 'swift', 'crit', 'critdmg', 'lifesteal', 'guard', 'haste', 'focus', 'fortune'], ACTIVE = { s1: 1, mend: 1, frenzy: 1 }, MAXRANK = 5, PMAX = 10;
const maxRank = k => ACTIVE[k] ? MAXRANK : PMAX;
const UP_RATE = [1, .9, .8, .7, .6, .5, .4, .3, .2];
const xpNeed = l => Math.floor(55 * Math.pow(l, 1.85));
const rnd = (a, b) => a + Math.random() * (b - a), rint = (a, b) => Math.floor(rnd(a, b + 1)), pick = a => a[Math.floor(Math.random() * a.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const newSk = () => ({ s1: 1, mend: 0, frenzy: 0, vit: 0, might: 0, swift: 0, crit: 0, critdmg: 0, lifesteal: 0, guard: 0, haste: 0, focus: 0, fortune: 0 });
const isAdmin = p => CONFIG.admins.map(a => String(a).toLowerCase()).includes(p.name.toLowerCase());
const hooks = {}, commands = {};
function fire(ev, ...a) { let ok = true; for (const h of hooks[ev] || []) { try { if (h.fn(...a) === false) ok = false; } catch (e) { console.log('[plugin ' + h.plugin + '] error in "' + ev + '": ' + e.message); } } return ok; }

// ---- gear generation ----
let uidc = 0; const newUid = () => Date.now().toString(36) + '-' + (uidc++).toString(36);
function rollRarity(bonus, minR) {
  const b = (bonus || 0) + RATES.rarityBoost, w = RARITY.map((r, i) => r.w * (1 + b * i * 1.5)); let r = Math.random() * w.reduce((a, c) => a + c, 0), out = 0;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { out = i; break; } }
  return Math.max(out, minR || 0);
}
const rv = (k, v) => (STATDEF[k] && STATDEF[k].pct) ? Math.round(v * 10) / 10 : Math.round(v);
function genGear(slot, ilvl, rar, fam) {
  slot = SLOTS.includes(slot) ? slot : pick(SLOTS); ilvl = Math.max(1, ilvl | 0); rar = rar === undefined || rar === null ? rollRarity(0) : Math.max(0, Math.min(4, rar | 0));
  const R = RARITY[rar], stats = {};
  for (const k in PRIMARY[slot]) stats[k] = rv(k, PRIMARY[slot][k](ilvl) * R.m * rnd(0.9, 1.1));
  const pool = Object.keys(STATDEF).filter(k => !(k in stats) && !(NO_DMG[slot] && (k === 'dmg' || k === 'crit')));
  for (let i = 0; i < R.x && pool.length; i++) { const k = pool.splice(rint(0, pool.length - 1), 1)[0]; stats[k] = rv(k, STATDEF[k].f(ilvl) * (0.6 + 0.4 * R.m) * rnd(0.85, 1.15)); }
  let base; if (slot === 'weapon') { fam = BASES.weapon[fam] ? fam : pick(Object.keys(BASES.weapon)); base = BASES.weapon[fam]; } else { base = pick(BASES[slot]); fam = undefined; }
  const name = MATS[Math.min(MATS.length - 1, Math.floor((ilvl - 1) / 7))] + ' ' + base + (rar >= 2 ? ' ' + pick(SUFFIX) : '');
  return { uid: newUid(), slot, fam, name, rar, ilvl, req: Math.max(1, ilvl - 3), stats, plus: 0 };
}
function sanitize(it) { if (it && NO_DMG[it.slot]) { delete it.stats.dmg; delete it.stats.crit; } if (it && !it.plus) it.plus = 0; return it; }
const plusMul = (it, k) => 1 + (it.plus || 0) * (it.slot === 'weapon' && k === 'dmg' ? 0.15 : 0.1);
const sellValue = it => Math.round((3 * it.ilvl + 5) * (1 + RARITY[it.rar].x * RARITY[it.rar].x * 0.6) * (1 + (it.plus || 0) * 0.5));
const upCostFor = it => it ? Math.round(100 * (it.plus + 1) * (it.plus + 1) * (1 + it.ilvl / 12) * (it.slot === 'weapon' ? 1 : 0.8)) : 0;

// ================= WORLD STATE =================
let nextId = 1;
const players = new Map(), mobs = new Map(), loot = new Map();
let events = [];
let TYPE_LIST = [], TYPE_IDX = {};
function typeIndex() { if (TYPE_LIST.length !== Object.keys(MOBTYPES).length) { TYPE_LIST = Object.keys(MOBTYPES); TYPE_IDX = {}; TYPE_LIST.forEach((k, i) => TYPE_IDX[k] = i); } }

function gearSum(p) { const g = {}; for (const s of SLOTS) { const it = p.eq[s]; if (it) for (const k in it.stats) { if (NO_DMG[s] && (k === 'dmg' || k === 'crit')) continue; g[k] = (g[k] || 0) + it.stats[k] * plusMul(it, k); } } return g; }
function stats(p) {
  const c = CLASSES[p.cls]; p.g = gearSum(p);
  p.maxhp = Math.floor((100 + p.lvl * 28) * c.hp * (1 + 0.05 * p.sk.vit) + (p.g.hp || 0));
  p.maxmp = Math.floor(((40 + p.lvl * 8) * c.mp + (p.g.mp || 0)) * (1 + 0.05 * p.sk.focus));
  p.w = p.eq.weapon ? p.eq.weapon.plus : 0;
}
const defRed = p => { const d = p.g.def || 0; return 1 - (1 - d / (d + 100 + 8 * p.lvl)) * (1 - 0.025 * p.sk.guard); };
const critCh = p => Math.min(0.8, 0.12 + (p.g.crit || 0) / 100 + 0.015 * p.sk.crit), critMul = p => 1.8 + 0.12 * p.sk.critdmg, goldFind = p => (p.g.gf || 0) + 6 * p.sk.fortune;
const dmgMul = (p, now) => (1 + 0.05 * p.sk.might) * (now < p.buf.atk ? 1.3 : 1) * (now < p.buf.rage ? 1.2 + 0.05 * p.sk.frenzy : 1);
const playerDmg = p => ((6 + p.lvl * 2.6) * CLASSES[p.cls].atk + (p.g.dmg || 0)) * dmgMul(p, Date.now());
function sendInv(p) { send(p.c, { t: 'inv', bag: p.bag, eq: p.eq, gs: Object.assign({}, p.g, { _dmg: Math.round(playerDmg(p)), _dr: Math.round(defRed(p) * 100), _hp: p.maxhp, _mp: p.maxmp, _crit: Math.round(critCh(p) * 100), _cdmg: Math.round(critMul(p) * 100), _ls: Math.round(0.8 * p.sk.lifesteal * 10) / 10, _haste: Math.round(3.5 * p.sk.haste), _gf: Math.round(goldFind(p)) }) }); }
function afterGearChange(p) { const o = p.maxhp; stats(p); if (p.maxhp > o) p.hp += p.maxhp - o; p.hp = Math.min(p.hp, p.maxhp); p.mp = Math.min(p.mp, p.maxmp); sendInv(p); }
function starterWeapon(p, plus) { const it = genGear('weapon', 1, 0, CLASSES[p.cls].fam); it.name = 'Worn ' + BASES.weapon[it.fam]; it.plus = plus || 0; return it; }
function addGear(p, it) { if (p.bag.length >= BAGMAX) return false; p.bag.push(it); sendInv(p); return true; }
const nearNpc = (p, k) => Math.hypot(p.x - NPCS[k].x, p.y - NPCS[k].y) <= NPC_RANGE;

// ---- monsters ----
function spawnMob(type, x, y, tier, opts) {
  opts = opts || {}; const t = MOBTYPES[type], T = TIERS[tier] || TIERS[0];
  let lvl = t.lvl || Math.round((T.lv[0] + T.lv[1]) / 2), hm = 1, dm = 1, xm = 1, gm = 1;
  if (T.scale && !t.stone) { const L = t.boss ? T.lv[1] + rint(0, 5) : rint(T.lv[0], T.lv[1]); if (L > lvl) { const k = L / lvl; hm = Math.pow(k, 1.9); dm = Math.pow(k, 1.37); xm = Math.pow(k, 2); gm = Math.pow(k, 1.5); lvl = L; } }
  if (opts.alpha) { hm *= 5; dm *= 1.6; xm *= 6; gm *= 5; }
  const m = { id: nextId++, ty: type, x, y, hx: x, hy: y, sx: x, sy: y, tier, lvl, hb: t.hp * hm, dmg: t.dmg * dm, xp: t.xp * xm, gm, r: Math.round(t.r * (opts.alpha ? 1.3 : 1)), alpha: opts.alpha ? 1 : 0, boss: !!t.boss, cd: 0, target: 0, dead: 0, stoneStep: 5, slamT: 0, slamAt: 0, awake: false, wake: 0 };
  m.mh = Math.round(m.hb * RATES.monsterHp); m.hp = m.mh; mobs.set(m.id, m); return m;
}
function randomSpawnPoint(tier) {
  const T = TIERS[tier];
  if (T.outer) { for (let i = 0; i < 50; i++) { const x = rnd(60, W - 60), y = rnd(60, H - 60); if (Math.hypot(x - CX, y - CY) >= T.min + 20) return { x, y }; } return { x: 80, y: 80 }; }
  const a = rnd(0, Math.PI * 2), d = rnd(T.min, T.max); return { x: CX + Math.cos(a) * d, y: CY + Math.sin(a) * d };
}
function populate() {
  for (let tier = 0; tier < TIERS.length; tier++) {
    const T = TIERS[tier], n = T.count === 'death' ? Math.round(RATES.deathZoneMonsters) : (T.count || 60);
    for (let c = 0, made = 0; made < n; c++) { // camps sharing a family
      const cen = randomSpawnPoint(tier), fam = pick(T.types), k = tier === 0 ? rint(2, 4) : T.outer ? rint(4, 8) : rint(3, 6); made += k;
      for (let i = 0; i < k; i++) spawnMob(Math.random() < 0.75 ? fam : pick(T.types), cen.x + rnd(-120, 120), cen.y + rnd(-120, 120), tier);
    }
    for (let i = 0; i < (T.stones || 0); i++) { const p = randomSpawnPoint(tier); spawnMob(T.stone || 'stone', p.x, p.y, tier); }
    for (let i = 0; i < (T.alphas || 0); i++) { const p = randomSpawnPoint(tier); spawnMob(pick(T.types), p.x, p.y, tier, { alpha: true }); }
    for (const b of T.bosses || []) for (let i = 0; i < (T.bossCount || 1); i++) { const p = randomSpawnPoint(tier); spawnMob(b, p.x, p.y, tier); }
  }
}
const ev = (k, x, y, v, extra) => events.push(Object.assign({ k, x: Math.round(x), y: Math.round(y), v }, extra));
const say = (p, m) => send(p.c, { t: 'msg', m });
const toast = (p, m, c) => send(p.c, { t: 'toast', m, c });
const inVillage = o => Math.hypot(o.x - CX, o.y - CY) < VILLAGE;
const clampWorld = o => { o.x = Math.max(20, Math.min(W - 20, o.x)); o.y = Math.max(20, Math.min(H - 20, o.y)); };
function moveToward(o, tx, ty, spd, dt) { const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy); if (d < 1) return 0; const s = Math.min(d, spd * dt); o.x += dx / d * s; o.y += dy / d * s; return d; }
const tierOf = (x, y) => { const d = Math.hypot(x - CX, y - CY); for (let i = 0; i < TIERS.length; i++) if (d < TIERS[i].max) return i; return TIERS.length - 1; };

function gainXp(p, xp) {
  { const o = { v: xp }; fire('xp', p, o); xp = Math.round(o.v); }
  xp = Math.max(1, Math.round(xp * (1 + (p.g.xpb || 0) / 100)));
  if (Date.now() < p.buf.xp) xp = Math.round(xp * 1.5);
  p.xp += xp; ev('xp', p.x, p.y, '+' + xp + ' xp');
  let up = false;
  while (p.xp >= xpNeed(p.lvl)) {
    p.xp -= xpNeed(p.lvl); p.lvl++; p.sp++; up = true; stats(p); p.hp = p.maxhp; p.mp = p.maxmp;
    ev('lvl', p.x, p.y, 'LEVEL ' + p.lvl); ev('fx', p.x, p.y, 110, { s: 'lvl', a: p.id });
    say(p, 'Level ' + p.lvl + '! You gained a skill point (press K).'); toast(p, 'Level ' + p.lvl + '!', '#ffe97a');
    broadcast({ t: 'chat', n: '*', m: p.name + ' reached level ' + p.lvl + '!' }); fire('levelup', p);
  }
  if (up) sendInv(p);
}

// ---- loot ----
function dropAt(x, y, d, owner) {
  const L = Object.assign({ id: nextId++, x: Math.round(x), y: Math.round(y), owner: owner || 0, free: Date.now() + (owner ? 25000 : 0), exp: Date.now() + 180000 }, d);
  clampWorld(L); loot.set(L.id, L); return L;
}
function dropLoot(p, m) {
  const t = MOBTYPES[m.ty], boss = !!t.boss, stone = !!t.stone, alpha = !!m.alpha;
  const gold = Math.round(rint(t.gold[0], t.gold[1]) * m.gm * RATES.goldRate * (stone ? 1.5 : 1) * (1 + goldFind(p) / 100));
  if (gold > 0) dropAt(m.x + rnd(-25, 25), m.y + rnd(-25, 25), { kind: 'gold', v: gold, name: gold + ' gold' }, p.id);
  const nc = stone ? 4 : boss ? 4 : alpha ? 2 : (Math.random() < Math.min(1, 0.16 * RATES.potionDropRate) ? 1 : 0);
  for (let i = 0; i < nc; i++) {
    const pool = Object.keys(ITEMS).filter(k => ITEMS[k].w > 0 && (k !== 'hp2' || m.tier >= 1));
    let r = Math.random() * pool.reduce((s, k) => s + ITEMS[k].w, 0), pk = pool[0]; for (const k of pool) { r -= ITEMS[k].w; if (r <= 0) { pk = k; break; } }
    dropAt(m.x + rnd(-45, 45), m.y + rnd(-45, 45), { kind: 'item', k: pk, n: 1, name: ITEMS[pk].n }, p.id);
  }
  const gch = (0.14 + 0.02 * Math.min(m.tier, 6)) * RATES.gearDropRate;
  let ng = stone ? 4 + Math.floor(m.tier / 2) : boss ? 5 : alpha ? 2 : 0; if (!stone && !boss && !alpha) { ng = Math.floor(gch); if (Math.random() < gch - ng) ng++; }
  for (let i = 0; i < ng; i++) {
    const ilvl = Math.max(1, m.lvl + rint(-1, 2) + (boss ? 3 : 0) + (stone || alpha ? 1 : 0)), minR = stone || boss ? 2 : alpha ? 1 : 0;
    const it = genGear(pick(SLOTS), ilvl, rollRarity((boss ? 3 : stone ? 2.2 : alpha ? 1.2 : 0) + m.tier * 0.15, minR), CLASSES[p.cls].fam);
    dropAt(m.x + rnd(-50, 50), m.y + rnd(-50, 50), { kind: 'gear', item: it, name: it.name, rar: it.rar }, p.id);
    if (it.rar >= 3) broadcast({ t: 'chat', n: '*', m: p.name + ' found ' + RARITY[it.rar].n + ' ' + it.name + '!' });
  }
}
function pickupTick(now) {
  for (const L of loot.values()) {
    if (now > L.exp) { loot.delete(L.id); continue; }
    if (L.owner && now < L.free && !players.has(L.owner)) L.free = 0;
    for (const p of players.values()) {
      if (p.dead || (L.owner && now < L.free && L.owner !== p.id) || Math.abs(p.x - L.x) > 58 || Math.abs(p.y - L.y) > 58 || Math.hypot(p.x - L.x, p.y - L.y) > 58) continue;
      if (L.kind === 'gold') { p.gold += L.v; ev('gold', L.x, L.y, '+' + L.v + 'g'); }
      else if (L.kind === 'item') { p.inv[L.k] = (p.inv[L.k] || 0) + L.n; ev('loot', L.x, L.y, '+' + L.name, { r: 0 }); }
      else if (L.kind === 'gear') {
        if (!addGear(p, L.item)) { if (now > (p.fullT || 0)) { p.fullT = now + 3000; say(p, 'Your bag is full! Merge, sell or equip something.'); toast(p, 'Bag full!', '#ff8a6a'); } continue; }
        ev('loot', L.x, L.y, '+' + L.name, { r: L.rar }); if (L.rar >= 3) toast(p, RARITY[L.rar].n + ': ' + L.name, ['', '', '', '#b25cff', '#ff9d2e'][L.rar]);
      }
      loot.delete(L.id); break;
    }
  }
}

// ---- combat ----
function hitMob(p, m, dmg) {
  if (m.dead) return;
  const crit = Math.random() < critCh(p); if (crit) dmg *= critMul(p);
  dmg = Math.max(1, Math.round(dmg * rnd(0.9, 1.1)));
  { const o = { v: dmg, crit }; fire('damage', p, m, o); dmg = Math.max(1, Math.round(o.v)); }
  m.hp -= dmg; ev('dmg', m.x, m.y, dmg, { c: crit ? 1 : 0 });
  if (p.sk.lifesteal && !p.dead) p.hp = Math.min(p.maxhp, p.hp + dmg * 0.008 * p.sk.lifesteal);
  const t = MOBTYPES[m.ty]; m.awake = true;
  if (!t.stone && !m.target) m.target = p.id;
  if (t.stone) {
    const step = Math.ceil((m.hp / m.mh) * 5);
    while (m.stoneStep > step && m.hp > 0) {
      m.stoneStep--;
      for (let i = 0; i < 3 + m.tier; i++) { const a = rnd(0, 6.283), r = rnd(60, 140); const g = spawnMob(pick(TIERS[m.tier].types), m.x + Math.cos(a) * r, m.y + Math.sin(a) * r, m.tier); g.target = p.id; g.hx = m.x; g.hy = m.y; g.summoned = true; g.awake = true; }
      if (m.stoneStep === 3 || m.stoneStep === 1) { const g = spawnMob(pick(TIERS[m.tier].types), m.x + rnd(-60, 60), m.y + rnd(-60, 60), m.tier, { alpha: true }); g.target = p.id; g.hx = m.x; g.hy = m.y; g.summoned = true; g.awake = true; }
      ev('fx', m.x, m.y, 160, { s: 'summon' });
    }
  }
  if (m.hp <= 0) killMob(p, m);
}
function killMob(p, m) {
  const t = MOBTYPES[m.ty];
  m.dead = Date.now() + (t.stone ? 90000 : t.boss ? 180000 : m.alpha ? 90000 : rint(RATES.respawnSeconds * 750, RATES.respawnSeconds * 1350));
  p.target = 0;
  const pen = t.stone ? 2 : t.boss || m.alpha ? 1 : Math.max(0.1, 1 - Math.max(0, p.lvl - m.lvl - 5) * 0.12);
  gainXp(p, Math.max(1, Math.round(m.xp * RATES.xpRate * pen)));
  dropLoot(p, m); ev('die', m.x, m.y, m.ty, { b: m.alpha ? 1 : 0 });
  if (t.boss) { broadcast({ t: 'chat', n: '*', m: p.name + ' has slain ' + t.name + '!' }); broadcast({ t: 'toast', m: p.name + ' has slain ' + t.name + '!', c: '#ffd24a' }); }
  fire('kill', p, m);
  if (m.summoned) mobs.delete(m.id);
}
function hurtPlayer(tp, m, dmg, now) {
  dmg = Math.max(1, Math.round(dmg * (1 - defRed(tp)) * (now < tp.buf.def ? 0.65 : 1)));
  { const o = { v: dmg }; fire('hurt', tp, m, o); dmg = Math.max(0, Math.round(o.v)); }
  if (!dmg) return;
  tp.hp -= dmg; ev('hurt', tp.x, tp.y, dmg, { a: m.id });
  if (tp.hp <= 0) {
    tp.hp = 0; tp.dead = now + 5000; tp.target = 0; const loss = Math.floor(tp.gold * RATES.deathGoldLoss); tp.gold -= loss;
    say(tp, 'You died. Lost ' + loss + ' gold. Respawning in the village...'); fire('death', tp, m);
    for (const o of mobs.values()) if (o.target === tp.id) o.target = 0;
  }
}
function startCast(m, t, tp, d, now) {
  const sig = (MOBTYPES[m.ty] && MOBTYPES[m.ty].special) || SPECIAL[m.ty] || 'slam'; m.alt = !m.alt; let s = m.alt ? sig : 'slam'; const R = m.r + 120;
  const ok = { slam: d < m.r + 170, breath: d < m.r + 260, charge: d < 520, meteor: d < 650, summon: d < 520 };
  if (!ok[s]) { if (s === sig) m.alt = !m.alt; s = 'slam'; if (!ok.slam) return; }
  const c = { s, at: now + (s === 'meteor' ? 1450 : 1150), r: R, ang: Math.atan2(tp.x - m.x, tp.y - m.y) };
  if (s === 'breath') { c.r = m.r + 300; c.half = 0.55; }
  if (s === 'charge') { const L = Math.min(480, Math.max(260, d + 120)); c.tx = m.x + Math.sin(c.ang) * L; c.ty = m.y + Math.cos(c.ang) * L; }
  if (s === 'meteor') { c.pts = []; for (const p of players.values()) if (!p.dead && dist(p, m) < 700) for (let i = 0; i < 3; i++) c.pts.push([Math.round(p.x + rnd(-120, 120)), Math.round(p.y + rnd(-120, 120))]); c.pts.push([Math.round(tp.x), Math.round(tp.y)]); c.r = 95; }
  m.cast = c; m.slamT = now + rnd(5500, 8500);
  ev('warn', m.x, m.y, c.r, { a: m.id, s, ang: Math.round(c.ang * 100) / 100, tx: c.tx && Math.round(c.tx), ty: c.ty && Math.round(c.ty), pts: c.pts, half: c.half });
}
function resolveCast(m, plist, now) {
  const c = m.cast; m.cast = null; const D = m.dmg * RATES.monsterDamage;
  if (c.s === 'slam') { ev('slam', m.x, m.y, c.r, { s: 'slam' }); for (const p of plist) if (!p.dead && !inVillage(p) && dist(p, m) <= c.r) hurtPlayer(p, m, D * 1.8, now); }
  else if (c.s === 'breath') { ev('slam', m.x, m.y, c.r, { s: 'breath', ang: c.ang, half: c.half, ty: m.ty }); for (const p of plist) { if (p.dead || inVillage(p)) continue; const dd = dist(p, m); if (dd > c.r) continue; let da = Math.atan2(p.x - m.x, p.y - m.y) - c.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) <= c.half) hurtPlayer(p, m, D * 1.7, now); } }
  else if (c.s === 'charge') { const x0 = m.x, y0 = m.y; m.x = Math.max(20, Math.min(W - 20, c.tx)); m.y = Math.max(20, Math.min(H - 20, c.ty)); if (inVillage(m)) { m.x = x0; m.y = y0; } ev('slam', m.x, m.y, 70, { s: 'charge', x0: Math.round(x0), y0: Math.round(y0) });
    for (const p of plist) { if (p.dead || inVillage(p)) continue; const vx = m.x - x0, vy = m.y - y0, L2 = vx * vx + vy * vy || 1, k = Math.max(0, Math.min(1, ((p.x - x0) * vx + (p.y - y0) * vy) / L2)), ex = x0 + vx * k - p.x, ey = y0 + vy * k - p.y; if (Math.hypot(ex, ey) < m.r + 45) hurtPlayer(p, m, D * 1.5, now); } }
  else if (c.s === 'meteor') { ev('slam', m.x, m.y, c.r, { s: 'meteor', pts: c.pts, ty: m.ty }); for (const p of plist) { if (p.dead || inVillage(p)) continue; for (const q of c.pts) if (Math.hypot(p.x - q[0], p.y - q[1]) <= c.r) { hurtPlayer(p, m, D * 1.4, now); break; } } }
  else if (c.s === 'summon') { ev('slam', m.x, m.y, 140, { s: 'summon' }); const T = TIERS[m.tier] || TIERS[0]; const tp = m.target; for (let i = 0; i < 4; i++) { const a = rnd(0, 6.283); const g = spawnMob(pick(T.types), m.x + Math.cos(a) * 110, m.y + Math.sin(a) * 110, m.tier); g.summoned = true; g.awake = true; g.target = tp; g.hx = m.x; g.hy = m.y; } }
}
function useItem(p, k) {
  const it = ITEMS[k], now = Date.now();
  if (!it || p.dead || !(p.inv[k] > 0)) return;
  const pot = k === 'hp' || k === 'hp2' || k === 'mp';
  if (typeof it.use === 'function') { let r; try { r = it.use(p); } catch (e) { return say(p, 'Item error: ' + e.message); } if (r === false) return; p.inv[k]--; if (typeof r === 'string') say(p, r); return; }
  if (pot) { if (now < p.potCd) return; if (k === 'mp' ? p.mp >= p.maxmp : p.hp >= p.maxhp) return; }
  if (k === 'ret' && inVillage(p)) return say(p, 'You are already in the village.');
  if (k === 'reset' && SKILLS.every(s => p.sk[s] === (s === 's1' ? 1 : 0))) return say(p, 'Nothing to reset.');
  p.inv[k]--; if (pot) p.potCd = now + 1000;
  if (k === 'hp' || k === 'hp2') { const h = Math.floor(p.maxhp * (k === 'hp' ? 0.4 : 1)); p.hp = Math.min(p.maxhp, p.hp + h); ev('heal', p.x, p.y, '+' + h); }
  else if (k === 'mp') { const h = Math.floor(p.maxmp * 0.5); p.mp = Math.min(p.maxmp, p.mp + h); ev('mana', p.x, p.y, '+' + h); }
  else if (k === 'atk' || k === 'def' || k === 'spd') { p.buf[k] = now + 60000; ev('fx', p.x, p.y, 50, { s: 'buff', a: p.id }); }
  else if (k === 'xp') { p.buf.xp = now + 300000; ev('fx', p.x, p.y, 50, { s: 'buff', a: p.id }); }
  else if (k === 'ret') { ev('fx', p.x, p.y, 60, { s: 'buff', a: p.id }); p.x = CX + rnd(-50, 50); p.y = CY + rnd(30, 95); p.dest = null; p.target = 0; ev('fx', p.x, p.y, 60, { s: 'buff', a: p.id }); }
  else if (k === 'reset') { p.sk = newSk(); p.sp = p.lvl; stats(p); p.hp = Math.min(p.hp, p.maxhp); say(p, 'Skill points refunded: ' + p.sp + ' available.'); sendInv(p); }
  if (!pot && k !== 'ret' && k !== 'reset') say(p, it.n + ' used.');
}
function skill(p, n) {
  const c = CLASSES[p.cls], now = Date.now(); if (p.dead) return;
  if (n === 1) {
    const r = p.sk.s1; if (r < 1 || now < p.cd1) return;
    const cost = Math.round(c.s1c * (1 + 0.05 * (r - 1))); if (p.mp < cost) return;
    const cnt = c.s1n + (p.cls === 'archer' ? (r >= 3 ? 2 : 0) + (r >= 5 ? 2 : 0) : 0), rr = c.s1r;
    const hit = []; for (const m of mobs.values()) if (!m.dead && Math.abs(m.x - p.x) < rr + 60 && Math.abs(m.y - p.y) < rr + 60 && dist(p, m) <= rr + m.r) hit.push(m);
    if (!hit.length) return; hit.sort((a, b) => dist(p, a) - dist(p, b)); hit.length = Math.min(hit.length, cnt);
    p.mp -= cost; p.cd1 = now + 2000 - 100 * (r - 1); ev('fx', p.x, p.y, c.s1r, { s: p.cls, a: p.id });
    hit.forEach(m => hitMob(p, m, playerDmg(p) * c.s1m * (1 + 0.18 * (r - 1))));
  } else if (n === 2) {
    const r = p.sk.mend; if (r < 1 || now < p.cd2 || p.mp < 20) return;
    p.mp -= 20; p.cd2 = now + 8000 - 500 * r; const h = Math.floor(p.maxhp * (0.2 + 0.08 * r));
    p.hp = Math.min(p.maxhp, p.hp + h); ev('heal', p.x, p.y, '+' + h); ev('fx', p.x, p.y, 50, { s: 'heal', a: p.id });
  } else if (n === 3) {
    const r = p.sk.frenzy; if (r < 1 || now < p.cd3 || p.mp < 30) return;
    p.mp -= 30; p.cd3 = now + 25000; p.buf.rage = now + (6 + 2 * r) * 1000; ev('fx', p.x, p.y, 70, { s: 'rage', a: p.id });
  }
}

// ================= TICK =================
const DT = 0.05;
let tickMs = 0;
function tick() {
  const now = Date.now(), t0 = process.hrtime.bigint(); if (hooks.tick) fire('tick', DT);
  const plist = [...players.values()];
  for (const p of plist) {
    if (p.dead) { if (now > p.dead) { p.dead = 0; p.hp = p.maxhp; p.mp = p.maxmp; p.x = CX + rnd(-50, 50); p.y = CY + rnd(30, 95); p.target = 0; } continue; }
    const c = CLASSES[p.cls], spd = p.spdNow = 190 * (1 + 0.04 * p.sk.swift) * (now < p.buf.spd ? 1.35 : 1) * (1 + Math.min(60, p.g.spd || 0) / 100);
    const dl = Math.hypot(p.dir.x, p.dir.y), tgt = p.target ? mobs.get(p.target) : null;
    if (tgt && tgt.dead) p.target = 0;
    if (dl > 0.01) { p.x += p.dir.x / dl * spd * DT; p.y += p.dir.y / dl * spd * DT; p.dest = null; }
    else if (tgt && !tgt.dead) { if (dist(p, tgt) > c.range + tgt.r - 6) moveToward(p, tgt.x, tgt.y, spd, DT); }
    else if (p.dest) { if (moveToward(p, p.dest.x, p.dest.y, spd, DT) < 6) p.dest = null; }
    clampWorld(p);
    if (tgt && !tgt.dead && now >= p.cd && dist(p, tgt) <= c.range + tgt.r) {
      p.cd = now + (now < p.buf.rage ? 600 : 800) * (1 - 0.035 * p.sk.haste); ev('atk', p.x, p.y, 0, { tx: Math.round(tgt.x), ty: Math.round(tgt.y), s: p.cls, a: p.id });
      hitMob(p, tgt, playerDmg(p));
    }
    p.hp = Math.min(p.maxhp, p.hp + p.maxhp * (inVillage(p) ? 0.05 : 0.006) * DT); p.mp = Math.min(p.maxmp, p.mp + (2 + p.lvl * 0.2) * (1 + 0.1 * p.sk.focus) * DT);
  }
  for (const m of mobs.values()) {
    const t = MOBTYPES[m.ty];
    if (m.dead) { if (now > m.dead) { m.dead = 0; m.mh = Math.round(m.hb * RATES.monsterHp); m.hp = m.mh; m.target = 0; m.stoneStep = 5; m.cast = null; m.x = m.hx = m.sx; m.y = m.hy = m.sy; } continue; }
    if (t.stone) {
      m.hp = Math.min(m.mh, m.hp + (m.stoneStep < 5 ? 0 : m.mh * 0.004 * DT));
      if (m.cast && now >= m.cast.at) { const R = m.cast.r; ev('slam', m.x, m.y, R, { s: 'pulse' }); for (const p of plist) if (!p.dead && dist(p, m) <= R) hurtPlayer(p, m, STONE_DMG[Math.min(6, m.tier)] * RATES.monsterDamage, now); m.cast = null; }
      else if (!m.cast && m.stoneStep < 5 && now > (m.slamT || 0)) { let near = false; for (const p of plist) if (!p.dead && dist(p, m) < 300) { near = true; break; } if (near) { m.slamT = now + 6500; m.cast = { at: now + 1300, r: 230 }; ev('warn', m.x, m.y, 230, { s: 'pulse', a: m.id }); } }
      continue;
    }
    // sleeping monsters (no player nearby) cost almost nothing
    if (!m.target && now > m.wake) { m.wake = now + 600; m.awake = false; for (const p of plist) if (Math.abs(p.x - m.x) < 1700 && Math.abs(p.y - m.y) < 1700) { m.awake = true; break; } }
    if (!m.awake && !m.target) continue;
    if (m.cast && now >= m.cast.at) resolveCast(m, plist, now);
    let tp = m.target ? players.get(m.target) : null; const leash = t.boss ? 1000 : m.alpha ? 850 : 700;
    if (tp && (tp.dead || inVillage(tp) || Math.hypot(tp.x - m.sx, tp.y - m.sy) > leash)) { tp = null; m.target = 0; }
    if (!tp) for (const p of plist) if (!p.dead && Math.abs(p.x - m.x) < t.aggro && Math.abs(p.y - m.y) < t.aggro && dist(p, m) < t.aggro && !inVillage(p)) { m.target = p.id; tp = p; break; }
    if (tp) {
      const d = dist(m, tp);
      if (t.boss && !m.cast && now > m.slamT) startCast(m, t, tp, d, now);
      if (m.cast && m.cast.s !== 'summon') { /* stand still while casting */ }
      else if (d > m.r + 20) { const ox = m.x, oy = m.y; moveToward(m, tp.x, tp.y, t.spd * (m.alpha ? 1.1 : 1), DT); if (inVillage(m)) { m.x = ox; m.y = oy; } }
      else if (now >= m.cd) { m.cd = now + (m.alpha ? 950 : 1100); hurtPlayer(tp, m, m.dmg * RATES.monsterDamage * rnd(0.8, 1.2), now); }
    } else {
      const d = moveToward(m, m.hx, m.hy, t.spd * 0.5, DT);
      if (d < 5 && Math.random() < 0.02) { m.hx = m.sx + rnd(-70, 70); m.hy = m.sy + rnd(-70, 70); }
      if (m.hp < m.mh) m.hp = Math.min(m.mh, m.hp + m.mh * 0.05 * DT);
    }
  }
  pickupTick(now);
  const snapEv = events; events = []; typeIndex();
  const buf = p => { const o = {}; for (const k in p.buf) if (p.buf[k] > now) o[k] = p.buf[k] - now; return o; };
  for (const p of plist) {
    const near = (o, r) => Math.abs(o.x - p.x) < r && Math.abs(o.y - p.y) < r;
    // monsters as compact arrays: [id, typeIndex, x, y, hp, maxHp, level, flags(1=alpha)]
    let mm = []; for (const m of mobs.values()) if (!m.dead && near(m, 1150)) mm.push(m);
    if (mm.length > 420) { mm.sort((a, b) => (Math.abs(a.x - p.x) + Math.abs(a.y - p.y)) - (Math.abs(b.x - p.x) + Math.abs(b.y - p.y))); mm.length = 420; }
    send(p.c, {
      t: 's', tm: now,
      me: { x: p.x, y: p.y, hp: Math.round(p.hp), mh: p.maxhp, mp: Math.round(p.mp), mm: p.maxmp, l: p.lvl, xp: p.xp, xn: xpNeed(p.lvl), g: p.gold, w: p.w, inv: p.inv, sk: p.sk, sp: p.sp, buf: buf(p), c1: Math.max(0, p.cd1 - now), c2: Math.max(0, p.cd2 - now), c3: Math.max(0, p.cd3 - now), tg: p.target, dead: p.dead ? p.dead - now : 0, vil: inVillage(p) ? 1 : 0, bag: p.bag.length, spd: Math.round(p.spdNow || 190), rng: CLASSES[p.cls].range },
      pl: plist.filter(o => o !== p && near(o, 1500)).map(o => ({ id: o.id, n: o.name, x: Math.round(o.x), y: Math.round(o.y), hp: Math.round(o.hp), mh: o.maxhp, l: o.lvl, c: o.cls, w: o.w, d: o.dead ? 1 : 0, rg: now < o.buf.rage ? 1 : 0 })),
      mo: mm.map(m => [m.id, TYPE_IDX[m.ty], Math.round(m.x), Math.round(m.y), Math.max(0, Math.round(m.hp)), m.mh, m.lvl, m.alpha]),
      lo: [...loot.values()].filter(L => near(L, 1150) && (!L.owner || L.owner === p.id || now >= L.free)).map(L => ({ id: L.id, x: L.x, y: L.y, k: L.kind, n: L.name, r: L.rar || 0, i: L.k, s: L.item ? (L.item.slot === 'weapon' ? L.item.fam : L.item.slot) : undefined })),
      ev: snapEv.filter(o => near(o, 1300)),
    });
  }
  tickMs = tickMs * 0.95 + Number(process.hrtime.bigint() - t0) / 1e6 * 0.05;
}
setInterval(tick, DT * 1000);

// ================= PERSISTENCE =================
function savePlayer(p) { saves[p.name.toLowerCase()] = { ph: p.ph, data: p.data, name: p.name, cls: p.cls, lvl: p.lvl, xp: p.xp, gold: p.gold, inv: p.inv, bag: p.bag, eq: p.eq, sk: p.sk, sp: p.sp }; }
function saveAll() { for (const p of players.values()) savePlayer(p); try { fs.writeFileSync(SAVE, JSON.stringify(saves)); fs.writeFileSync(PDATA, JSON.stringify(pdata)); } catch (e) {} }
setInterval(saveAll, 10000);
process.on('SIGINT', () => { saveAll(); process.exit(); }); process.on('SIGTERM', () => { saveAll(); process.exit(); });

// ================= NETWORK =================
function broadcast(o) { for (const p of players.values()) send(p.c, o); }
function send(c, obj) {
  if (!c || c.closed) return;
  const b = Buffer.from(JSON.stringify(obj)), n = b.length; let h;
  if (n < 126) h = Buffer.from([0x81, n]); else if (n < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(n, 2); } else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  try { c.sock.write(Buffer.concat([h, b])); } catch (e) {}
}
function parseFrames(c) {
  for (;;) {
    const b = c.buf; if (b.length < 2) return;
    const op = b[0] & 15; let len = b[1] & 127, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; } else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
    if (len > 65536) return c.sock.destroy();
    const masked = b[1] & 128; if (b.length < off + (masked ? 4 : 0) + len) return;
    let payload;
    if (masked) { const mk = b.subarray(off, off + 4); payload = Buffer.from(b.subarray(off + 4, off + 4 + len)); for (let i = 0; i < len; i++) payload[i] ^= mk[i & 3]; off += 4; } else payload = b.subarray(off, off + len);
    c.buf = b.subarray(off + len);
    if (op === 8) return c.sock.end();
    if (op === 9) { try { c.sock.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); } catch (e) {} }
    if (op === 1) { try { onMsg(c, JSON.parse(payload.toString())); } catch (e) {} }
  }
}
const clamp1 = v => Math.max(-1, Math.min(1, +v || 0));
const worldInfo = () => ({ W, H, CX, CY, V: VILLAGE, npcs: NPCS, npcRange: NPC_RANGE, tiers: TIERS.map(t => ({ name: t.name, min: t.min, max: t.max, lv: t.lv, outer: !!t.outer })) });

// ---- merging: 3 items of the same rarity (any slot, any level) -> 1 item of the next rarity at the player's level ±20% ----
function mergeItems(p, items) {
  const rar = items[0].rar, first = items[0], ilvl = Math.max(1, Math.round(p.lvl * rnd(0.8, 1.2)));
  const out = genGear(first.slot, ilvl, Math.min(4, rar + 1), first.fam); out.plus = Math.max(...items.map(i => i.plus || 0));
  const idx = p.bag.indexOf(first); p.bag = p.bag.filter(i => !items.includes(i)); p.bag.splice(Math.min(idx, p.bag.length), 0, out);
  fire('merge', p, out, items); return out;
}
function doMerge(p, uids) {
  if (p.dead || !Array.isArray(uids) || uids.length !== 3 || new Set(uids).size !== 3) return;
  const items = uids.map(u => p.bag.find(i => i.uid === u)); if (items.some(i => !i)) return;
  if (items.some(i => i.rar !== items[0].rar)) return say(p, 'Pick 3 items of the same rarity (colour) to merge.');
  const out = mergeItems(p, items); ev('fx', p.x, p.y, 60, { s: 'lvl', a: p.id }); ev('loot', p.x, p.y, 'Merged: ' + out.name, { r: out.rar });
  toast(p, 'Merged → ' + RARITY[out.rar].n + ' ' + out.name + ' (iLvl ' + out.ilvl + ')', ['#d8d8d8', '#4ee26a', '#4da3ff', '#b25cff', '#ff9d2e'][out.rar]);
  if (out.rar >= 3) broadcast({ t: 'chat', n: '*', m: p.name + ' merged a ' + RARITY[out.rar].n + ' ' + out.name + '!' });
  sendInv(p);
}
function autoMerge(p, maxRar) {
  if (p.dead) return; maxRar = Math.max(0, Math.min(3, maxRar | 0)); let n = 0, best = null;
  for (let r = 0; r <= maxRar; r++) for (;;) {
    const g = p.bag.filter(i => i.rar === r).sort((a, b) => a.ilvl - b.ilvl); if (g.length < 3) break;
    const out = mergeItems(p, g.slice(0, 3)); n++; if (!best || out.rar > best.rar) best = out;
  }
  if (!n) return say(p, 'Nothing to merge: you need 3 bag items of the same rarity.');
  ev('fx', p.x, p.y, 60, { s: 'lvl', a: p.id }); ev('loot', p.x, p.y, n + ' merge' + (n > 1 ? 's' : '') + '!', { r: best.rar });
  say(p, 'Merged ' + n * 3 + ' items into ' + n + '. Best result: ' + RARITY[best.rar].n + ' ' + best.name + '.'); toast(p, n + ' merge' + (n > 1 ? 's' : '') + ' done', '#ffe97a'); sendInv(p);
}
function upgradeItem(p, uid) {
  if (!nearNpc(p, 'smith')) return say(p, 'Talk to the Blacksmith in the village to upgrade equipment.');
  let it = null; for (const s of SLOTS) if (p.eq[s] && p.eq[s].uid === uid) it = p.eq[s];
  if (!it) return say(p, 'The Blacksmith only upgrades equipment you are wearing.'); if (it.plus >= 9) return say(p, it.name + ' is already +9.');
  const cost = upCostFor(it); if (p.gold < cost) return say(p, 'The Blacksmith wants ' + cost + ' gold.');
  p.gold -= cost; const s = NPCS.smith;
  if (Math.random() < UP_RATE[it.plus]) { it.plus++; send(p.c, { t: 'forge', ok: 1, uid, plus: it.plus }); ev('fx', s.x, s.y, 50, { s: 'lvl' }); if (it.plus >= 7) broadcast({ t: 'chat', n: '*', m: p.name + ' forged a +' + it.plus + ' ' + it.name + '!' }); }
  else { const drop = it.plus >= 5; if (drop) it.plus--; send(p.c, { t: 'forge', ok: 0, uid, plus: it.plus, drop }); ev('fx', s.x, s.y, 40, { s: 'rage' }); }
  afterGearChange(p);
}

function onMsg(c, m) {
  if (m.t === 'join') {
    if (c.p) return;
    const name = String(m.name || '').replace(/[^\w \-]/g, '').trim().slice(0, 14);
    if (name.length < 2) return send(c, { t: 'err', m: 'Name must be 2-14 letters/digits.' });
    for (const o of players.values()) if (o.name.toLowerCase() === name.toLowerCase()) return send(c, { t: 'err', m: 'That hero is already online.' });
    const sv = saves[name.toLowerCase()];
    const pw = String(m.pw || '').slice(0, 64), ph = pw ? crypto.createHash('sha256').update(name.toLowerCase() + ':' + pw).digest('hex') : '';
    if (sv && sv.ph && sv.ph !== ph) return send(c, { t: 'err', m: 'Wrong password for this hero.' });
    const cls = sv ? sv.cls : (CLASSES[m.cls] ? m.cls : 'blade'), lvl = sv ? sv.lvl : 1;
    const inv = Object.assign(Object.fromEntries(Object.keys(ITEMS).map(k => [k, 0])), sv ? (sv.inv || { hp: sv.pots || 0 }) : { hp: 3, mp: 1 });
    const p = { id: nextId++, c, name: sv ? sv.name : name, cls, lvl, xp: sv ? sv.xp : 0, gold: sv ? sv.gold : 100, w: 0, inv, bag: ((sv && sv.bag) || []).map(sanitize), eq: Object.assign({ weapon: null, helm: null, armor: null, boots: null, ring: null, amulet: null }, sv && sv.eq),
      sk: Object.assign(newSk(), sv && sv.sk), sp: sv ? (sv.sp !== undefined ? sv.sp : lvl) : 1, buf: { atk: 0, def: 0, spd: 0, xp: 0, rage: 0 }, potCd: 0, g: {},
      ph: sv ? (sv.ph || ph) : ph, data: (sv && sv.data) || {},
      x: CX + rnd(-50, 50), y: CY + rnd(30, 95), dir: { x: 0, y: 0 }, dest: null, target: 0, cd: 0, cd1: 0, cd2: 0, cd3: 0, dead: 0 };
    for (const s of SLOTS) sanitize(p.eq[s]);
    if (!p.eq.weapon) p.eq.weapon = starterWeapon(p, sv && sv.w);
    stats(p); p.hp = p.maxhp; p.mp = p.maxmp; c.p = p; players.set(p.id, p);
    typeIndex(); const types = {}; for (const k in MOBTYPES) types[k] = { n: MOBTYPES[k].name, r: MOBTYPES[k].r, c: MOBTYPES[k].color, st: !!MOBTYPES[k].stone, boss: !!MOBTYPES[k].boss, lvl: MOBTYPES[k].lvl, shape: MOBTYPES[k].shape };
    send(c, { t: 'init', id: p.id, name: p.name, cls: p.cls, world: worldInfo(), types, tl: TYPE_LIST, classes: CLASSES, items: ITEMS, maxRank: MAXRANK, pMax: PMAX, bagMax: BAGMAX, slots: SLOTS, rarity: RARITY.map(r => r.n), upRate: UP_RATE, stat: Object.fromEntries(Object.entries(STATDEF).map(([k, v]) => [k, { n: v.n, pct: !!v.pct }])), resumed: !!sv, server: CONFIG.serverName, admin: isAdmin(p) });
    sendInv(p);
    broadcast({ t: 'chat', n: '*', m: p.name + ' entered ' + CONFIG.serverName + '.' });
    if (CONFIG.motd) say(p, CONFIG.motd);
    fire('join', p);
    if (p.sp > 0) say(p, 'You have ' + p.sp + ' unspent skill point(s) - press K!');
    return;
  }
  const p = c.p; if (!p) return;
  switch (m.t) {
    case 'dir': p.dir = { x: clamp1(m.x), y: clamp1(m.y) }; if (p.dir.x || p.dir.y) p.dest = null; break;
    case 'move': if (!p.dead && isFinite(m.x) && isFinite(m.y)) { p.dest = { x: +m.x, y: +m.y }; p.target = 0; } break;
    case 'target': { const t = mobs.get(+m.id); if (t && !t.dead && !p.dead) { p.target = t.id; p.dest = null; } break; }
    case 'skill': skill(p, +m.n); break;
    case 'use': useItem(p, String(m.i)); break;
    case 'learn': { const k = String(m.k); if (SKILLS.includes(k) && p.sp > 0 && p.sk[k] < maxRank(k)) { const o = p.maxhp; p.sk[k]++; p.sp--; stats(p); p.hp = Math.min(p.maxhp, p.hp + Math.max(0, p.maxhp - o)); sendInv(p); } break; }
    case 'equip': {
      if (p.dead) break; const i = p.bag.findIndex(it => it.uid === m.uid); if (i < 0) break; const it = p.bag[i];
      if (p.lvl < it.req) { say(p, it.name + ' requires level ' + it.req + '.'); break; }
      const old = p.eq[it.slot]; p.eq[it.slot] = it; p.bag.splice(i, 1); if (old) p.bag.splice(i, 0, old); afterGearChange(p); break;
    }
    case 'unequip': { const it = p.eq[m.slot]; if (!it || p.dead) break; if (p.bag.length >= BAGMAX) { say(p, 'Your bag is full.'); break; } p.eq[m.slot] = null; p.bag.push(it); afterGearChange(p); break; }
    case 'merge': doMerge(p, m.uids); break;
    case 'automerge': autoMerge(p, m.max); break;
    case 'sell': { if (!nearNpc(p, 'merchant')) { say(p, 'Sell items to the Merchant in the village.'); break; } const i = p.bag.findIndex(it => it.uid === m.uid); if (i < 0) break; const v = sellValue(p.bag[i]); p.gold += v; p.bag.splice(i, 1); ev('gold', p.x, p.y, '+' + v + 'g'); sendInv(p); break; }
    case 'sellall': { if (!nearNpc(p, 'merchant')) { say(p, 'Sell items to the Merchant in the village.'); break; } const mx = Math.max(0, Math.min(4, m.rar | 0)); let tot = 0, n = 0; p.bag = p.bag.filter(it => { if (it.rar <= mx) { tot += sellValue(it); n++; return false; } return true; }); p.gold += tot; say(p, n ? 'Sold ' + n + ' item(s) for ' + tot + ' gold.' : 'Nothing to sell.'); sendInv(p); break; }
    case 'buy': {
      const it = ITEMS[String(m.i)]; if (!it) break; if (!nearNpc(p, 'merchant')) return say(p, 'Visit the Merchant in the village to buy.');
      const n = Math.max(1, Math.min(50, m.n | 0)), cost = n * it.price; if (p.gold < cost) return say(p, 'Not enough gold.');
      p.gold -= cost; p.inv[m.i] = (p.inv[m.i] || 0) + n; say(p, 'Bought ' + n + ' x ' + it.n + '.'); break;
    }
    case 'upgrade': upgradeItem(p, String(m.uid || (p.eq.weapon && p.eq.weapon.uid) || '')); break;
    case 'chat': {
      const t = String(m.m || '').slice(0, 120).trim(); if (!t) break;
      if (t[0] === '/') {
        const parts = t.slice(1).split(/\s+/), cmd = parts.shift().toLowerCase();
        if (cmd === 'help') { say(p, 'Commands: ' + Object.keys(commands).filter(k => !commands[k].admin || isAdmin(p)).map(k => '/' + k).join(' ')); break; }
        const cm = commands[cmd]; if (!cm) { say(p, 'Unknown command. Try /help'); break; }
        if (cm.admin && !isAdmin(p)) { say(p, 'That command is for admins only.'); break; }
        try { const r = cm.fn(p, parts, t); if (typeof r === 'string') say(p, r); } catch (e) { say(p, 'Command error: ' + e.message); }
        break;
      }
      if (fire('chat', p, t) !== false) broadcast({ t: 'chat', n: p.name, m: t });
      break;
    }
  }
}

// ================= PLUGIN SYSTEM =================
// Drop .js files (or folders with index.js) into ./plugins. Names starting with "_" are ignored. See PLUGINS.md.
function makeApi(pname) {
  return {
    name: pname, config: CONFIG, rates: RATES, log: (...a) => console.log('[' + pname + ']', ...a), consts: { W, H, CX, CY, VILLAGE, BAGMAX }, MOBTYPES, ITEMS, CLASSES, TIERS, RARITY, STATDEF, SLOTS, NPCS,
    on(ev, fn) { (hooks[ev] = hooks[ev] || []).push({ fn, plugin: pname }); },
    command(name, opts, fn) { if (typeof opts === 'function') { fn = opts; opts = {}; } commands[String(name).toLowerCase()] = { fn, admin: !!opts.admin, help: opts.help || '', plugin: pname }; },
    addMob(id, def) { MOBTYPES[id] = Object.assign({ name: id, lvl: 5, hp: 50, dmg: 5, spd: 100, xp: 10, gold: [1, 5], r: 16, aggro: 120, color: '#cccccc' }, def); return MOBTYPES[id]; },
    addToTier(tier, id, asBoss) { const T = TIERS[tier]; if (!T) return; const l = asBoss ? (T.bosses = T.bosses || []) : T.types; if (!l.includes(id) || asBoss) l.push(id); },
    addItem(id, def) { ITEMS[id] = Object.assign({ n: id, price: 100, d: '', w: 0, color: '#cccccc' }, def); return ITEMS[id]; },
    addClass(id, def) { CLASSES[id] = Object.assign({}, CLASSES.blade, { name: id, desc: '', color: '#cccccc' }, def); return CLASSES[id]; },
    genGear, giveGear: (p, it) => addGear(p, it), dropAt: (x, y, d, owner) => dropAt(x, y, d, owner),
    players: () => [...players.values()], mobs: () => [...mobs.values()],
    findPlayer: n => [...players.values()].find(p => p.name.toLowerCase() === String(n).toLowerCase()),
    spawn(type, x, y, opts) { if (!MOBTYPES[type]) throw new Error('unknown mob ' + type); const m = spawnMob(type, x, y, tierOf(x, y), opts); if (opts && opts.temp) m.summoned = true; m.awake = true; return m; },
    say, toast, broadcast: msg => broadcast({ t: 'chat', n: '*', m: String(msg) }),
    giveItem(p, k, n) { if (!ITEMS[k]) return false; p.inv[k] = (p.inv[k] || 0) + (n === undefined ? 1 : n); return true; },
    giveGold(p, n) { p.gold = Math.max(0, p.gold + n); }, giveXp: (p, n) => gainXp(p, n), refresh: p => afterGearChange(p),
    heal(p) { p.hp = p.maxhp; p.mp = p.maxmp; },
    teleport(p, x, y) { p.x = +x; p.y = +y; clampWorld(p); p.dest = null; p.target = 0; },
    setLevel(p, l) { p.lvl = Math.max(1, Math.min(200, l | 0)); p.xp = 0; const spent = SKILLS.reduce((s, k) => s + p.sk[k], 0) - 1; p.sp = Math.max(0, p.lvl - spent); stats(p); p.hp = p.maxhp; p.mp = p.maxmp; sendInv(p); },
    effect(x, y, radius, style) { ev('fx', x, y, radius || 60, { s: style || 'buff' }); }, text(x, y, txt, kind) { ev(kind || 'xp', x, y, String(txt)); },
    isAdmin, kick(p) { try { p.c.sock.end(); } catch (e) {} }, data: () => (pdata[pname] = pdata[pname] || {}),
    stats: () => ({ players: players.size, mobs: mobs.size, awake: [...mobs.values()].filter(m => m.awake || m.target).length, loot: loot.size, tickMs: Math.round(tickMs * 100) / 100 }),
  };
}
function loadPlugins() {
  const dir = path.join(__dirname, 'plugins'); let list = []; try { list = fs.readdirSync(dir); } catch (e) { return; }
  console.log('  Loading plugins...');
  for (const f of list.sort()) {
    if (f.startsWith('_') || f.startsWith('.')) continue;
    const full = path.join(dir, f), name = f.replace(/\.js$/, ''); let entry = null;
    try { const st = fs.statSync(full); if (st.isDirectory()) { if (fs.existsSync(path.join(full, 'index.js'))) entry = full; } else if (f.endsWith('.js')) entry = full; } catch (e) {}
    if (!entry || CONFIG.disabledPlugins.includes(name)) continue;
    try { const mod = require(entry), init = typeof mod === 'function' ? mod : mod.init, pn = (typeof mod === 'object' && mod.name) || name; init(makeApi(pn)); console.log('    + ' + pn + (mod.version ? ' v' + mod.version : '')); }
    catch (e) { console.log('    ! FAILED ' + name + ': ' + e.message); }
  }
}

// ================= HTTP / WS =================
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  if (req.url.split('?')[0] === '/api/info') {
    let scripts = []; try { scripts = fs.readdirSync(path.join(__dirname, 'public', 'plugins')).filter(x => x.endsWith('.js') && !x.startsWith('_')).sort(); } catch (e) {}
    const cl = {}; for (const k in CLASSES) cl[k] = { name: CLASSES[k].name, desc: CLASSES[k].desc || '', color: CLASSES[k].color || '' };
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ serverName: CONFIG.serverName, classes: cl, scripts, world: worldInfo(), online: players.size }));
  }
  let f = req.url.split('?')[0]; if (f === '/') f = '/index.html';
  const fp = path.join(__dirname, 'public', path.normalize(f).replace(/^(\.\.[\/\\])+/, ''));
  if (!fp.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end(); }
  fs.readFile(fp, (e, d) => { if (e) { res.writeHead(404); return res.end('Not found'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(d); });
});
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key']; if (!key) return sock.destroy();
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  sock.setNoDelay(true);
  const c = { sock, buf: Buffer.alloc(0), p: null, closed: false };
  sock.on('data', d => { c.buf = Buffer.concat([c.buf, d]); parseFrames(c); });
  const bye = () => { if (c.closed) return; c.closed = true; if (c.p) { fire('leave', c.p); savePlayer(c.p); players.delete(c.p.id); for (const m of mobs.values()) if (m.target === c.p.id) m.target = 0; broadcast({ t: 'chat', n: '*', m: c.p.name + ' left.' }); } };
  sock.on('close', bye); sock.on('error', bye);
});
console.log('\n  ' + CONFIG.serverName.toUpperCase());
loadPlugins(); populate();
server.listen(PORT, () => console.log('\n  Server is running!  Open http://localhost:' + PORT + '\n  Friends on your network can join via http://<your-LAN-IP>:' + PORT + '\n  (' + mobs.size + ' monsters, map ' + W + 'x' + H + ', ' + TIERS.length + ' zones)  Edit rates.json any time to change XP / gold / drops.\n'));
