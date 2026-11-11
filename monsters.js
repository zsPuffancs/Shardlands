'use strict';
const { MAX_PLAYER_LEVEL, encounterBaseXp, encounterCategory } = require('./xp-economy');

const STONE_BASE_LEVEL = 5;
const STONE_BASE_HEALTH = 6000;
const STONE_HEALTH_EXPONENT = 1.4;

function stoneTemplate(definition) {
  const levelRatio = definition.lvl / STONE_BASE_LEVEL;
  return { ...definition, hp: Math.round(STONE_BASE_HEALTH * levelRatio ** STONE_HEALTH_EXPONENT) };
}

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
  stone:       stoneTemplate({ name: 'Spirit Stone',     lvl: 5, dmg: 0, spd: 0, xp: 600,   gold: [400, 800],     r: 28, aggro: 0, color: '#5cc8ff', stone: true, shape: 'crystal' }),
  jadestone:   stoneTemplate({ name: 'Jade Stone',       lvl: 12, dmg: 0, spd: 0, xp: 1800,  gold: [900, 1800],    r: 28, aggro: 0, color: '#4ee08a', stone: true, shape: 'crystal' }),
  bonestone:   stoneTemplate({ name: 'Bone Obelisk',     lvl: 20, dmg: 0, spd: 0, xp: 4500,  gold: [1800, 3600],   r: 30, aggro: 0, color: '#e8e0c0', stone: true, shape: 'obelisk' }),
  emberstone:  stoneTemplate({ name: 'Ember Stone',      lvl: 28, dmg: 0, spd: 0, xp: 9000,  gold: [3000, 6000],   r: 30, aggro: 0, color: '#ff7a2a', stone: true, shape: 'obelisk' }),
  froststone:  stoneTemplate({ name: 'Frost Stone',      lvl: 37, dmg: 0, spd: 0, xp: 16000, gold: [5000, 9000],   r: 30, aggro: 0, color: '#9fe8ff', stone: true, shape: 'crystal' }),
  voidstone:   stoneTemplate({ name: 'Void Stone',       lvl: 46, dmg: 0, spd: 0, xp: 26000, gold: [7000, 13000],  r: 30, aggro: 0, color: '#b45cff', stone: true, shape: 'crystal' }),
  doomstone:   stoneTemplate({ name: 'Doom Stone',       lvl: 56, dmg: 0, spd: 0, xp: 45000, gold: [12000, 20000], r: 32, aggro: 0, color: '#ff2a3a', stone: true, shape: 'obelisk' }),
};
const TIERS = [
  { name: 'Whispering Meadows', min: 400,  max: 1250, lv: [1, 6],   types: ['wolf', 'slime', 'boar', 'shroom'],        bosses: ['alphawolf', 'kingslime'],   bossCount: 2, count: 170, stones: 10, stone: 'stone',      alphas: 5 },
  { name: 'Gloomwood',          min: 1250, max: 2100, lv: [7, 14],  types: ['goblin', 'orc', 'spider', 'bandit'],      bosses: ['warlord', 'broodmother'],   bossCount: 2, count: 230, stones: 12, stone: 'jadestone',  alphas: 6 },
  { name: 'Ashen Barrens',      min: 2100, max: 2900, lv: [15, 22], types: ['skeleton', 'ogre', 'wraith'],             bosses: ['boneking', 'ogrechief'],    bossCount: 2, count: 240, stones: 15, stone: 'bonestone',  alphas: 6 },
  { name: 'Ember Wastes',       min: 2900, max: 3650, lv: [23, 30], types: ['hellhound', 'drake', 'golem'],            bosses: ['elderdrake', 'infernal'],   bossCount: 2, count: 230, stones: 18, stone: 'emberstone', alphas: 6 },
  { name: 'Frostfang Peaks',    min: 3650, max: 4350, lv: [30, 40], types: ['frostfang', 'yeti', 'icegolem'],          bosses: ['frostwyrm', 'yetiking'],    bossCount: 2, count: 240, stones: 21, stone: 'froststone', alphas: 7 },
  { name: 'Voidreach',          min: 4350, max: 4950, lv: [40, 50], types: ['shade', 'voidweaver', 'voidknight'],      bosses: ['voidlord', 'abyssalwyrm'],  bossCount: 2, count: 240, stones: 24, stone: 'voidstone',  alphas: 7 },
  { name: 'Death Zone',         min: 4950, max: 99999, lv: [50, 60], types: ['voidknight', 'shade', 'voidweaver', 'yeti', 'icegolem', 'hellhound', 'golem', 'drake', 'frostfang'],
    bosses: ['deathlord', 'deathlord', 'deathlord', 'deathlord', 'voidlord', 'abyssalwyrm', 'frostwyrm', 'yetiking'], count: 'death', stones: 30, stone: 'doomstone', alphas: 30, scale: true, outer: true },
];
// boss signature attacks (they alternate with a ground slam)
const SPECIAL = { alphawolf: 'charge', kingslime: 'summon', warlord: 'charge', broodmother: 'summon', boneking: 'summon', ogrechief: 'slam', elderdrake: 'breath', infernal: 'meteor', yetiking: 'charge', frostwyrm: 'breath', voidlord: 'meteor', abyssalwyrm: 'breath', deathlord: 'meteor' };
// On generated maps every monster is scaled from the same reference instead of from its own base level.
// Scaling a level-1 Wild Wolf to level 225 made it ten times stronger than anything else there.
// Each monster keeps a little of its own character: how tough it is next to the others of its founding zone.
const GENERATED_REFERENCE = {
  monster: { lvl: 47, hp: 5200, dmg: 180, xp: 2100, gold: [700, 1400] },    // a Voidreach monster
  boss: { lvl: 60, hp: 300000, dmg: 450, xp: 120000, gold: [20000, 40000] }, // the Lord of Death
  stone: { lvl: 56, hp: null, xp: 45000, gold: [12000, 20000] },              // the Doom Stone
};
const characterCache = new Map();
function character(type, key) {
  const id = type + ':' + key; if (characterCache.has(id)) return characterCache.get(id);
  const zone = TIERS.find(t => !t.generated && (t.types.includes(type) || (t.bosses || []).includes(type)));
  const template = MOBTYPES[type]; let factor = 1;
  if (zone && template) {
    const peers = (template.boss ? [...new Set(zone.bosses)] : zone.types).map(t => MOBTYPES[t]).filter(Boolean);
    const mean = peers.reduce((sum, peer) => sum + peer[key], 0) / peers.length;
    if (mean > 0) factor = Math.max(0.75, Math.min(1.35, template[key] / mean));
  }
  characterCache.set(id, factor); return factor;
}
function generatedTemplate(template, zone) {
  if (!template || !zone || !zone.generated) return template;
  const type = Object.keys(MOBTYPES).find(key => MOBTYPES[key] === template) || '';
  const base = template.archetype ? MOBTYPES[template.archetype] : template, baseType = template.archetype || type;
  if (template.stone) { const ref = GENERATED_REFERENCE.stone, doom = MOBTYPES.doomstone; return { ...template, lvl: ref.lvl, hp: doom ? doom.hp : template.hp, xp: ref.xp, gold: ref.gold }; }
  const ref = template.boss ? GENERATED_REFERENCE.boss : GENERATED_REFERENCE.monster;
  return { ...template, lvl: ref.lvl, hp: Math.round(ref.hp * character(baseType, 'hp')), dmg: Math.round(ref.dmg * character(baseType, 'dmg')), xp: ref.xp, gold: ref.gold, r: template.r };
}
// Character and monster levels share the same finite ceiling; World Tier is independent.
const MAX_LEVEL = MAX_PLAYER_LEVEL;
// World Bosses (the one boss per World Tier that unlocks the next) are bigger and tougher than other bosses.
const WORLD_BOSS_HEALTH = 3, WORLD_BOSS_SIZE = 1.5;
function markWorldBoss(type) { const template = MOBTYPES[type]; if (!template || template.worldBoss) return; template.worldBoss = true; template.r = Math.round(template.r * WORLD_BOSS_SIZE); }
const STONE_DMG = [30, 70, 120, 180, 250, 330, 430];

function createMonsterSpawner({ mobs, rates, world, allocateId, rnd, rint, pick, clampWorld }) {
  const { width, height, centerX, centerY } = world;
  const maxHealth = monster => Math.max(1, Math.round(monster.hb * rates.monsterHp));

  function spawnMob(type, x, y, tier, options) {
    options = options || {};
    const template = generatedTemplate(MOBTYPES[type], TIERS[tier]);
    const zone = TIERS[tier] || TIERS[0];
    const [minZoneLevel, maxZoneLevel] = zone.lv;
    const baseLevel = template.lvl || Math.round((minZoneLevel + maxZoneLevel) / 2);
    let spawnLevel = baseLevel;
    if (options.level !== undefined) {
      if (!Number.isInteger(options.level) || options.level < 1 || options.level > MAX_LEVEL) {
        throw new RangeError('Monster level must be an integer from 1 to ' + MAX_LEVEL + '.');
      }
      spawnLevel = options.level;
    } else if (!template.stone && (zone.scale || baseLevel < minZoneLevel)) {
      const zoneLevel = zone.scale && template.boss ? maxZoneLevel + rint(0, 5) : rint(minZoneLevel, maxZoneLevel);
      spawnLevel = Math.max(baseLevel, zoneLevel);
    }

    const levelRatio = spawnLevel / baseLevel;
    const isAlpha = Boolean(options.alpha);
    const levelDamageMultiplier = levelRatio ** 1.37;
    const healthExponent = template.stone ? STONE_HEALTH_EXPONENT : 1.9;
    const healthMultiplier = levelRatio ** healthExponent * (isAlpha ? 5 : 1) * (template.worldBoss ? WORLD_BOSS_HEALTH : 1);
    const damageMultiplier = levelDamageMultiplier * (isAlpha ? 1.6 : 1);
    const goldMultiplier = levelRatio ** 1.5 * (isAlpha ? 5 : 1);
    if (clampWorld) { const point = { x, y }; clampWorld(point, zone.area); x = point.x; y = point.y; }
    else { x = Math.max(20, Math.min(width - 20, x)); y = Math.max(20, Math.min(height - 20, y)); }
    const monster = {
      id: allocateId(), ty: type, x, y, hx: x, hy: y, sx: x, sy: y, tier, lvl: spawnLevel,
      hb: template.hp * healthMultiplier, dmg: template.dmg * damageMultiplier,
      xp: encounterBaseXp(spawnLevel, encounterCategory({ alpha: isAlpha }, template)), gm: goldMultiplier, gb: template.gold,
      r: Math.round(template.r * (isAlpha ? 1.3 : 1)), alpha: isAlpha ? 1 : 0,
      boss: Boolean(template.boss), cd: 0, target: 0, dead: 0, stoneStep: 5, slamT: 0,
      slamAt: 0, awake: false, wake: 0,
    };
    if (template.stone) monster.pulseMultiplier = levelDamageMultiplier;
    monster.mh = maxHealth(monster);
    monster.hp = monster.mh;
    mobs.set(monster.id, monster);
    return monster;
  }

  function randomSpawnPoint(zone, rnd) {
    // A zone on its own map carries that map as zone.area; the founding zones use the founding world.
    const area = zone.area || { x0: 0, y0: 0, w: width, h: height, cx: centerX, cy: centerY };
    if (zone.outer) {
      for (let attempt = 0; attempt < 50; attempt++) {
        const x = area.x0 + rnd(60, area.w - 60), y = area.y0 + rnd(60, area.h - 60);
        if (Math.hypot(x - area.cx, y - area.cy) >= zone.min + 20) return { x, y };
      }
      return { x: area.x0 + 80, y: area.y0 + 80 };
    }
    const angle = rnd(0, Math.PI * 2), distance = rnd(zone.min, zone.max);
    return { x: area.cx + Math.cos(angle) * distance, y: area.cy + Math.sin(angle) * distance };
  }

  // The layout (camps, stones, alphas, bosses) comes from one random stream. Pass a seeded
  // stream and the same seed always lays the world out the same way.
  function populateMonsters(random) {
    for (const [tier, zone] of TIERS.entries()) if (!zone.generated) populateZone(tier, random);
  }
  function populateZone(tier, random) {
    random = random || Math.random;
    const rnd = (a, b) => a + random() * (b - a), rint = (a, b) => Math.floor(rnd(a, b + 1)), pick = list => list[Math.floor(random() * list.length)];
    const zone = TIERS[tier];
    {
      const monsterCount = zone.count === 'death' ? Math.round(rates.deathZoneMonsters) : (zone.count || 60);
      // Each camp mainly spawns one family of monsters.
      for (let spawned = 0; spawned < monsterCount;) {
        const center = randomSpawnPoint(zone, rnd);
        const family = pick(zone.types);
        const campSize = tier === 0 ? rint(2, 4) : zone.outer ? rint(4, 8) : rint(3, 6);
        for (let i = 0; i < campSize; i++) {
          const type = random() < 0.75 ? family : pick(zone.types);
          spawnMob(type, center.x + rnd(-120, 120), center.y + rnd(-120, 120), tier);
        }
        spawned += campSize;
      }
      for (let i = 0; i < (zone.stones || 0); i++) {
        const point = randomSpawnPoint(zone, rnd);
        spawnMob(zone.stone || 'stone', point.x, point.y, tier, zone.generated ? { level: zone.lv[0] } : undefined);
      }
      for (let i = 0; i < (zone.alphas || 0); i++) {
        const point = randomSpawnPoint(zone, rnd);
        spawnMob(pick(zone.types), point.x, point.y, tier, { alpha: true });
      }
      for (const boss of zone.bosses || []) {
        for (let i = 0; i < (zone.bossCount || 1); i++) {
          const point = randomSpawnPoint(zone, rnd);
          spawnMob(boss, point.x, point.y, tier);
        }
      }
    }
  }

  function respawnMonster(monster) {
    monster.combatEpoch = (monster.combatEpoch || 0) + 1; monster.combatActive = false; monster.partyDamageScale = 1;
    monster.dead = 0;
    monster.ps = 1;
    monster.mh = maxHealth(monster);
    monster.hp = monster.mh;
    monster.target = 0;
    monster.stoneStep = 5;
    monster.cast = null;
    monster.x = monster.hx = monster.sx;
    monster.y = monster.hy = monster.sy;
  }

  return { spawnMob, populateMonsters, populateZone, respawnMonster };
}

module.exports = { MAX_LEVEL, WORLD_BOSS_HEALTH, WORLD_BOSS_SIZE, markWorldBoss, MOBTYPES, TIERS, SPECIAL, STONE_DMG, createMonsterSpawner };
