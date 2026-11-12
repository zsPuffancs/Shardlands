'use strict';
// Offline combat balance model. Spawns monsters with the production spawner (monsters.js + enemy-scaling.js) and
// measures them against heroes built with the production player formulas (characters.js, equipment.js),
// then estimates time-to-kill (TTK) and time-to-death (TTD).
//   node scripts/combat-balance.js         prints the tables (markdown)
//   The stable scripts/combat-balance.js entry also exports this API for legacy tests.
// Simplifications: single target, no elixirs/potions, the boss's target stands in melee range, casts are averaged.
const characters = require('../../player/characters');
const monsters = require('../../combat/monsters');
const xp = require('../../progression/xp-economy');
const scaling = require('../../combat/enemy-scaling');

const { BASE_RATES } = require('../base');
const { COMBAT_POLICY } = require('../base');
const DEFAULT_RATES = { monsterHp: BASE_RATES.monsterHp, monsterDamage: BASE_RATES.monsterDamage };
const CLASSES = ['blade', 'archer', 'mage'];
const CAST_HIT = 1.6;       // average telegraphed attack (slam 1.8, breath 1.7, charge 1.5, meteor 1.4)
const CAST_GAP_MS = 7000;   // average time between telegraphed attacks (5.5-8.5 s) before phases
const CAST_TIME_MS = 1150;
// Share of a boss fight spent in each health phase (100-60%, 60-30%, 30-0%).
const PHASE_SHARE = [0.4, 0.3, 0.3];

// Healing per second without potions: Second Wind on cooldown, lifesteal on every auto attack, regeneration.
function heroHealing(player) {
  const attackMs = 800 * (1 - characters.passive(player, 'haste')) * (1 - characters.gearAttackSpeed(player));
  const lifesteal = (characters.passive(player, 'lifesteal') + characters.gearLifesteal(player)) * characters.playerDmg(player) * 1000 / attackMs;
  const rank = player.sk.mend, mend = rank > 0 ? player.maxhp * (0.2 + 0.08 * rank) / ((8000 - 500 * rank) / 1000) : 0;
  return lifesteal + mend + player.maxhp * 0.006;
}

// Spawn one monster the way the live game does. Levels 60+ are spawned on a temporary generated frontier zone
// for the given World Tier (8+); lower levels use the founding zone for that level.
function spawn({ category, level, worldTier, type, rates = DEFAULT_RATES, monsterPolicy }) {
  const { TIERS, MOBTYPES } = monsters, mobs = new Map(), restore = []; let id = 0, tier, monsterType = type;
  const generated = level >= 60 || worldTier >= 8;
  try {
    if (generated) {
      worldTier = Math.max(8, worldTier || 8); tier = worldTier - 1;
      const boss = 'balance_wb', saved = TIERS[tier], length = TIERS.length;
      MOBTYPES[boss] = { ...MOBTYPES.deathlord, archetype: 'deathlord', worldBoss: true }; restore.push(() => delete MOBTYPES[boss]);
      TIERS[tier] = { ...TIERS[6], name: 'Balance', generated: true, scale: true, lv: [level, level], types: ['voidknight', 'shade', 'yeti'], bosses: [boss], worldBoss: boss };
      restore.push(() => { if (saved) TIERS[tier] = saved; else { delete TIERS[tier]; TIERS.length = length; } });
      if (!monsterType) monsterType = category === 'worldBoss' ? boss : category === 'boss' ? 'deathlord' : 'voidknight';
    } else {
      tier = Math.max(0, TIERS.slice(0, 7).findIndex(zone => level >= zone.lv[0] && level <= zone.lv[1]));
      const zone = TIERS[tier];
      if (!monsterType) monsterType = category === 'boss' || category === 'worldBoss' ? zone.bosses[0] : zone.types[0];
      const before = MOBTYPES[monsterType];
      if ((category === 'worldBoss') !== !!before.worldBoss) { MOBTYPES[monsterType] = { ...before, worldBoss: category === 'worldBoss' }; restore.push(() => { MOBTYPES[monsterType] = before; }); }
    }
    const spawner = monsters.createMonsterSpawner({ mobs, rates, monsterPolicy, world: { width: 10600, height: 10600, centerX: 5300, centerY: 5300 }, allocateId: () => ++id, rnd: (a, b) => (a + b) / 2, rint: a => a, pick: list => list[0] });
    const monster = spawner.spawnMob(monsterType, 6000, 6000, tier, { level, alpha: category === 'alpha' });
    return { monster, template: { ...MOBTYPES[monsterType] } };
  } finally { for (const undo of restore.reverse()) undo(); }
}

// One encounter against one class. The party all hit the monster; its pressure lands on one hero.
// dodge: share of telegraphed attacks the hero steps out of. pack: number of monsters attacking at once.
function encounterFor({ cls, heroLevel, monsterLevel = heroLevel, worldTier, category = 'normal', party = 1, rarity = 2, plus = 3, dodge = 0.5, pack = 1, rates = DEFAULT_RATES, monsterType, monsterPolicy, combatPolicy = COMBAT_POLICY }) {
  const heroes = Array.from({ length: party }, (_, i) => scaling.referenceHero({ level: heroLevel, cls, rarity, plus, id: i + 1 }));
  const { monster, template } = spawn({ category, level: monsterLevel, worldTier, rates, type: monsterType, monsterPolicy });
  const health = monster.mh * scaling.partyHealthScale(monster.cat, party), dmgScale = xp.partyDamageScale(party);
  const target = heroes[0], reduction = 1 - characters.defRed(target), hit = monster.dmg * rates.monsterDamage * dmgScale * reduction;
  let partyDps = heroes.reduce((sum, hero) => sum + scaling.heroDps(hero), 0), incoming;
  if (template.boss) {
    // Average over the health phases; World Boss enrage is ignored (it only starts after 2 minutes).
    let autos = 0, casts = 0, punish = 0;
    scaling.ENEMY_SCALING.boss.phases.forEach((phase, index) => {
      const cycle = CAST_GAP_MS * phase.castInterval + CAST_TIME_MS, recover = scaling.recoverMs(index), uptime = Math.max(0, 1 - (CAST_TIME_MS + recover) / cycle);
      autos += PHASE_SHARE[index] * hit * 1000 / (1100 / phase.attackSpeed) * uptime;
      casts += PHASE_SHARE[index] * hit * CAST_HIT * phase.castDamage * (1 - dodge) * 1000 / cycle;
      punish += PHASE_SHARE[index] * (recover / cycle) * (combatPolicy.recoveryDamageMultiplier - 1);
    });
    incoming = autos + casts; partyDps *= 1 + punish;
  } else incoming = hit * 1000 / (monster.alpha ? 950 : 1100) * pack;
  const healing = heroHealing(target), net = incoming - healing;
  return {
    monsterHp: health, monsterHit: hit, heroHp: target.maxhp, partyDps, incoming, healing,
    ttk: health * pack / partyDps, ttd: net > 0 ? target.maxhp / net : Infinity, ttdNoHeal: target.maxhp / incoming, hitsToKillHero: Math.ceil(target.maxhp / Math.max(1, hit)),
    castHit: template.boss ? hit * CAST_HIT * scaling.bossPressure({ boss: true, hp: 1, mh: 1 }).castDamage : 0,
  };
}
// Averaged over the three classes.
function encounter(options) {
  const rows = CLASSES.map(cls => encounterFor({ ...options, cls })), avg = key => rows.reduce((s, r) => s + r[key], 0) / rows.length;
  const ttds = rows.map(r => r.ttd), ttd = ttds.some(v => !Number.isFinite(v)) ? (ttds.every(v => !Number.isFinite(v)) ? Infinity : Math.min(...ttds.filter(Number.isFinite))) : avg('ttd');
  return { ...options, monsterLevel: options.monsterLevel || options.heroLevel, party: options.party || 1, category: options.category || 'normal',
    monsterHp: Math.round(avg('monsterHp')), monsterHit: Math.round(avg('monsterHit')), castHit: Math.round(avg('castHit')), heroHp: Math.round(avg('heroHp')),
    ttk: avg('ttk'), ttd, ttdNoHeal: avg('ttdNoHeal'), hitsToKillHero: Math.round(avg('hitsToKillHero')), incoming: avg('incoming'), healing: avg('healing') };
}

const fmt = s => !Number.isFinite(s) ? '∞' : s >= 100 ? Math.round(s) + ' s' : s.toFixed(1) + ' s';
const num = v => Math.round(v).toLocaleString('en');
function table(rows) {
  const lines = ['| Hero lv (gear) | World Tier | Enemy | Party | Enemy HP | Hit on hero | Hero HP | TTK | TTD no heals | TTD with heals |', '|---|---:|---|---:|---:|---:|---:|---:|---:|---:|'];
  for (const r of rows) lines.push('| ' + [r.heroLevel + ' (' + ['C', 'U', 'R', 'E', 'L', 'M'][r.rarity ?? 2] + '+' + (r.plus ?? 3) + ')', r.worldTier || '-', r.category + (r.pack > 1 ? ' ×' + r.pack : ''), r.party, num(r.monsterHp), num(r.monsterHit) + (r.castHit ? ' (cast ' + num(r.castHit) + ')' : ''), num(r.heroHp), fmt(r.ttk), fmt(r.ttdNoHeal), fmt(r.ttd)].join(' | ') + ' |');
  return lines.join('\n');
}
// Low, mid and high reference players.
const PLAYERS = [
  { label: 'low', heroLevel: 10, rarity: 1, plus: 1 },
  { label: 'founding', heroLevel: 45, rarity: 2, plus: 3 },
  { label: 'mid', heroLevel: 150, rarity: 2, plus: 3, worldTier: 10 },
  { label: 'high', heroLevel: 1000, rarity: 3, plus: 5, worldTier: 40 },
];
function report() {
  const rows = [];
  for (const player of PLAYERS) {
    for (const category of ['normal', 'alpha', 'boss', 'worldBoss']) for (const party of [1, 4]) rows.push(encounter({ ...player, category, party }));
    rows.push(encounter({ ...player, category: 'normal', pack: 3 }));
  }
  return rows;
}
// The same on-level hero meeting successive worlds (levels follow the generated ranges: ~32 levels per world).
function worlds(tiers = [8, 9, 10, 15, 25, 50, 100, 200, 300]) {
  return tiers.map(worldTier => { const level = Math.min(10000, 60 + (worldTier - 8) * 32 + 16); return [encounter({ heroLevel: level, worldTier, category: 'normal' }), encounter({ heroLevel: level, worldTier, category: 'worldBoss' })]; });
}
module.exports = { DEFAULT_RATES, heroHealing, spawn, encounter, encounterFor, report, worlds, table, PLAYERS };
