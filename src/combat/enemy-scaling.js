'use strict';
// Enemy scaling: one place that decides how much health and damage a monster has.
//
// A monster's numbers are derived from a power budget: what a reference hero of the monster's level, who has
// kept their gear up to date (Rare +3 from level 30), can deal and take. Health is "how many seconds that hero
// needs", damage is "how many hits that hero survives". The budget is computed from the live player formulas
// (characters.js, equipment.js incl. the item stat soft cap), so player and monster growth stay in step at
// every level instead of drifting apart (the old level^1.9 health curve outgrew soft-capped gear).
//
//   health = budget seconds x archetype x category x world depth   (divided by the default monsterHp rate)
//   damage = hero EHP / hits x archetype x category x world depth   (divided by the default monsterDamage rate)
//
// Health and damage have separate targets and separate world curves, so they can be balanced independently.
const ENEMY_SCALING = Object.freeze({
  version: 1,
  // The server's default rates.json values. Targets below are what a player meets at these defaults;
  // an admin raising monsterHp / monsterDamage still makes everything proportionally harder.
  defaultRates: Object.freeze({ monsterHp: 1.6, monsterDamage: 1.4 }),
  // Seconds a reference hero needs to kill an on-level normal monster alone, ramping in over the first levels.
  normalTimeToKill: Object.freeze({ start: 2.5, full: 5, rampLevels: 25 }),
  // Hits of an on-level normal monster that kill a reference hero (before healing).
  normalHitsToKill: Object.freeze({ start: 24, full: 14, rampLevels: 25 }),
  // How far one monster type may stand out from the others of its founding zone (its identity).
  archetypeRange: Object.freeze([0.6, 1.6]),
  // Multipliers on top of the level budget. boss / worldBoss health ramps with World Tier.
  categories: Object.freeze({
    normal: Object.freeze({ hp: 1, dmg: 1 }),
    alpha: Object.freeze({ hp: 3, dmg: 1.5 }),
    boss: Object.freeze({ hp: Object.freeze([8, 12]), hpRampTiers: 7, dmg: 1.8 }),
    worldBoss: Object.freeze({ hp: Object.freeze([15, 20]), hpRampTiers: 15, dmg: 2 }),
    stone: Object.freeze({ hp: 12, dmg: 2.2 }),
  }),
  // Every world after the founding lands (World Tier 8+) is harder than the last: sublinear, never flat.
  // factor = 1 + perDepth x depth^exponent, depth = World Tier - 7. Damage grows faster than health on purpose:
  // deeper worlds should hit harder rather than turn monsters into damage sponges.
  world: Object.freeze({ firstFrontierTier: 8, exponent: 0.7, hpPerDepth: 0.05, dmgPerDepth: 0.08 }),
  // Extra health per extra party member (2-5 heroes). Bosses grow more so a group cannot melt them;
  // damage only grows by xp-economy's partyDamagePerMember so joining a group is not a punishment.
  partyHpPerMember: Object.freeze({ normal: 0.45, alpha: 0.5, stone: 0.5, boss: 0.6, worldBoss: 0.7 }),
  // Alphas notice heroes from further away.
  alpha: Object.freeze({ aggroRange: 1.35 }),
  // Boss behaviour. Phases start below the given health share. castInterval scales the time between
  // telegraphed attacks, castDamage their damage, attackSpeed the ordinary hits.
  boss: Object.freeze({
    phases: Object.freeze([
      Object.freeze({ below: 1, castInterval: 1, castDamage: 1, attackSpeed: 1 }),
      Object.freeze({ below: 0.6, castInterval: 0.75, castDamage: 1.15, attackSpeed: 1.1 }),
      Object.freeze({ below: 0.3, castInterval: 0.55, castDamage: 1.3, attackSpeed: 1.25 }),
    ]),
    // After a telegraphed attack the boss recovers: it stands still, does not hit, and takes extra damage.
    recoverMs: 1300, finalPhaseRecoverMs: 900, punishBonus: 1.25,
    // World Bosses grow more dangerous the longer a fight lasts.
    worldBossEnrage: Object.freeze({ afterMs: 120000, attackSpeed: 1.25, castDamage: 1.2, castInterval: 0.85 }),
  }),
  // The reference hero the budget is built on: an average of the three classes.
  reference: Object.freeze({ earlyBuild: Object.freeze({ rarity: 0, plus: 0 }), steadyBuild: Object.freeze({ rarity: 2, plus: 3 }), steadyLevel: 30 }),
});

const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const ramp = (spec, level) => spec.start + (spec.full - spec.start) * smooth((level - 1) / Math.max(1, spec.rampLevels - 1));
const levelOf = level => Math.max(1, Math.min(10000, Math.floor(Number(level)) || 1));

// ---------- reference hero (live player formulas) ----------
const PRIMARY_EXTRA_ORDER = ['dmg', 'crit', 'hp', 'def', 'spd', 'mp'];
const PASSIVE_SPLIT = Object.freeze({ might: .24, vit: .2, guard: .14, critdmg: .14, crit: .1, haste: .1, lifesteal: .08 });
const AFFIX_FOR = { weapon: 'cdmg', ring: 'aspd', amulet: 'ls' };
// Required lazily: characters -> equipment -> game-world -> monsters -> this file.
const live = () => ({ characters: require('../player/characters'), equipment: require('../economy/equipment') });
function referenceHero({ level, cls = 'blade', rarity = 2, plus = 3, id = 1 }) {
  const { characters, equipment } = live(), { SLOTS, NO_DMG, RARITY, PRIMARY, statRanges, affixRange } = equipment;
  level = levelOf(level); rarity = Math.max(0, Math.min(5, rarity | 0));
  const eq = {};
  for (const slot of SLOTS) {
    const item = { uid: slot + ':' + id, slot, ilvl: level, rar: rarity, plus, stats: {} };
    for (const key in PRIMARY[slot]) item.stats[key] = 0;
    for (const key of PRIMARY_EXTRA_ORDER.filter(key => !(key in item.stats) && !(NO_DMG[slot] && (key === 'dmg' || key === 'crit'))).slice(0, RARITY[rarity].x)) item.stats[key] = 0;
    const ranges = statRanges(item); for (const key in item.stats) item.stats[key] = (ranges[key][0] + ranges[key][1]) / 2;
    if (AFFIX_FOR[slot]) { const range = affixRange(item, AFFIX_FOR[slot]); if (range) item.afx = { k: AFFIX_FOR[slot], v: range.base }; }
    eq[slot] = item;
  }
  // One skill point per level: the three actives first (up to rank 5), the rest spread over passives.
  const sk = characters.newSk(); let points = level;
  for (const key of ['s1', 'mend', 'frenzy']) { const add = Math.min(5 - sk[key], points); sk[key] += add; points -= add; }
  for (const key in PASSIVE_SPLIT) sk[key] = Math.min(characters.PMAX, Math.floor(points * PASSIVE_SPLIT[key]));
  const player = { id, name: 'Reference', cls, lvl: level, eq, sk, buf: {}, bag: [] };
  characters.stats(player); player.hp = player.maxhp;
  return player;
}
// Sustained single-target damage per second: auto attacks plus the class skill on cooldown (no elixirs, no AoE).
function heroDps(player) {
  const { characters } = live(), cls = characters.CLASSES[player.cls], rank = Math.max(1, player.sk.s1 || 1);
  const hit = characters.playerDmg(player) * (1 + characters.critCh(player) * (characters.critMul(player) - 1));
  const attackMs = 800 * (1 - characters.passive(player, 'haste')) * (1 - characters.gearAttackSpeed(player));
  return hit * 1000 / attackMs + hit * cls.s1m * (1 + 0.18 * (rank - 1)) * 1000 / (2000 - 100 * (rank - 1));
}
const heroEhp = player => player.maxhp / Math.max(0.05, 1 - live().characters.defRed(player));

const budgetCache = new Map();
// What a reference hero of this level deals per second and can absorb (average of the classes).
function referencePower(level) {
  level = levelOf(level); if (budgetCache.has(level)) return budgetCache.get(level);
  const { reference } = ENEMY_SCALING, classes = ['blade', 'archer', 'mage'];
  const measure = build => { let dps = 0, ehp = 0; for (const cls of classes) { const hero = referenceHero({ level, cls, ...build }); dps += heroDps(hero); ehp += heroEhp(hero); } return { dps: dps / classes.length, ehp: ehp / classes.length }; };
  const steady = measure(reference.steadyBuild);
  let power = steady;
  if (level < reference.steadyLevel) {
    const early = measure(reference.earlyBuild), t = (level - 1) / (reference.steadyLevel - 1);
    power = { dps: early.dps + (steady.dps - early.dps) * t, ehp: early.ehp + (steady.ehp - early.ehp) * t };
  }
  if (budgetCache.size > 12000) budgetCache.clear();
  budgetCache.set(level, power); return power;
}

// ---------- monster numbers ----------
const worldDepth = worldTier => Math.max(0, (Number.isFinite(worldTier) ? Math.floor(worldTier) : 1) - ENEMY_SCALING.world.firstFrontierTier + 1);
function worldFactor(worldTier) {
  const { world } = ENEMY_SCALING, depth = worldDepth(worldTier), curve = depth ** world.exponent;
  return { depth, hp: 1 + world.hpPerDepth * curve, dmg: 1 + world.dmgPerDepth * curve };
}
function categoryMultiplier(category, worldTier = 1) {
  const spec = ENEMY_SCALING.categories[category] || ENEMY_SCALING.categories.normal;
  let hp = spec.hp;
  if (Array.isArray(hp)) { const t = Math.max(0, Math.min(1, ((worldTier || 1) - 1) / Math.max(1, spec.hpRampTiers - 1))); hp = hp[0] + (hp[1] - hp[0]) * t; }
  return { hp, dmg: spec.dmg };
}
// Health and damage of one monster, before rates.monsterHp / rates.monsterDamage and party scaling.
// archetype: { hp, dmg } identity factors (see monsters.js character()).
function monsterStats({ level, category = 'normal', worldTier = 1, archetype = { hp: 1, dmg: 1 } }) {
  level = levelOf(level);
  const power = referencePower(level), world = worldFactor(worldTier), mult = categoryMultiplier(category, worldTier);
  const [low, high] = ENEMY_SCALING.archetypeRange, clamp = v => Math.max(low, Math.min(high, Number.isFinite(v) ? v : 1));
  const hp = power.dps * ramp(ENEMY_SCALING.normalTimeToKill, level) * clamp(archetype.hp) * mult.hp * world.hp / ENEMY_SCALING.defaultRates.monsterHp;
  const dmg = power.ehp / ramp(ENEMY_SCALING.normalHitsToKill, level) * clamp(archetype.dmg) * mult.dmg * world.dmg / ENEMY_SCALING.defaultRates.monsterDamage;
  return { hp: Math.max(1, Math.min(Number.MAX_SAFE_INTEGER / 1e6, hp)), dmg: Math.max(1, Math.min(Number.MAX_SAFE_INTEGER / 1e6, dmg)) };
}
function partyHealthScale(category, members) {
  const size = Number.isFinite(members) ? Math.max(1, Math.min(5, Math.floor(members))) : 1;
  const per = ENEMY_SCALING.partyHpPerMember[category] ?? ENEMY_SCALING.partyHpPerMember.normal;
  return 1 + per * (size - 1);
}

// ---------- boss behaviour ----------
function bossPhase(monster) {
  const share = monster && monster.mh > 0 ? monster.hp / monster.mh : 1, phases = ENEMY_SCALING.boss.phases;
  let index = 0; for (let i = 0; i < phases.length; i++) if (share <= phases[i].below) index = i;
  return index;
}
// Combined pressure for a boss right now: its HP phase and, for World Bosses, how long the fight has lasted.
function bossPressure(monster, now = Date.now()) {
  if (!monster || !monster.boss) return { phase: 0, castInterval: 1, castDamage: 1, attackSpeed: 1, enraged: false };
  const phase = bossPhase(monster), spec = ENEMY_SCALING.boss.phases[phase], enrage = ENEMY_SCALING.boss.worldBossEnrage;
  const enraged = !!(monster.worldBoss && monster.fightStart && now - monster.fightStart >= enrage.afterMs);
  return {
    phase, enraged,
    castInterval: spec.castInterval * (enraged ? enrage.castInterval : 1),
    castDamage: spec.castDamage * (enraged ? enrage.castDamage : 1),
    attackSpeed: spec.attackSpeed * (enraged ? enrage.attackSpeed : 1),
  };
}
const recoverMs = phase => phase >= ENEMY_SCALING.boss.phases.length - 1 ? ENEMY_SCALING.boss.finalPhaseRecoverMs : ENEMY_SCALING.boss.recoverMs;

module.exports = { ENEMY_SCALING, referenceHero, heroDps, heroEhp, referencePower, worldDepth, worldFactor, categoryMultiplier, monsterStats, partyHealthScale, bossPhase, bossPressure, recoverMs };
