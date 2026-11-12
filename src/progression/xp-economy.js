'use strict';
const { rewardCategory } = require('../shared/generated/entities');
const { STONE_REWARDS } = require('../economy/stone-rewards');
// Shared production XP mathematics. This module never reads time, players, saves or World Tier.
const MAX_PLAYER_LEVEL = 10000;
const XP_BALANCE = Object.freeze({
  overlevelCutoff: 25, fullOverlevelGap: 5, underlevelMinimumWindow: 5,
  overlevelCurve: Object.freeze([[5, 1], [6, .95], [10, .65], [15, .30], [20, .10], [25, 0]].map(Object.freeze)),
  underlevelCurve: Object.freeze([[10, 1], [15, .90], [25, .55], [40, .22], [60, .02]].map(Object.freeze)),
  relativeBudgetCap: 1.5,
  earlyTaperLevel: 10,
  fractions: Object.freeze({ normal: .025, alpha: .075, stone: STONE_REWARDS.completion.matureXpFraction, boss: .15, worldBoss: .25, summoned: 0, anomaly: .10 }),
  earlyFractions: Object.freeze({ normal: .20, alpha: .30, stone: STONE_REWARDS.completion.earlyXpFraction, boss: .45, worldBoss: .60, summoned: 0, anomaly: .25 }),
  maxEncounterFraction: .75, gearSoftCapPercent: 100, wisdomMultiplier: 1.5,
  pluginMultiplierCap: 2, serverRateCap: 1000000, partySizeCap: 5, partyHpPerMember: .45, partyDamagePerMember: .08,
  partyEfficiencyPerMember: .05, sharingRadius: 1000, minimumDamageFraction: .01, participationWindowMs: 45000,
});
const validLevel = level => Number.isSafeInteger(level) && level >= 1 && level <= MAX_PLAYER_LEVEL;
const xpNeed = level => Math.floor(55 * level ** 1.85);
const smooth = t => t * t * (3 - 2 * t);
const partySize = value => Number.isFinite(value) ? Math.max(1, Math.min(XP_BALANCE.partySizeCap, Math.floor(value))) : 1;
const partyHpScale = size => 1 + XP_BALANCE.partyHpPerMember * (partySize(size) - 1);
const partyDamageScale = size => 1 + XP_BALANCE.partyDamagePerMember * (partySize(size) - 1);
const partyPoolScale = size => partyHpScale(size) * (1 + XP_BALANCE.partyEfficiencyPerMember * (partySize(size) - 1));
function partyAllocation(members = 1, healthScale = partyHpScale(members)) {
  const paidHealthScale = Number.isFinite(healthScale) && healthScale >= 1 ? healthScale : 1;
  const pool = Math.min(partyHpScale(members), paidHealthScale) * (1 + XP_BALANCE.partyEfficiencyPerMember * (partySize(members) - 1));
  return pool / partySize(members);
}
function encounterCategory(monster = {}, template = {}) {
  return rewardCategory(monster, template);
}
function categoryFraction(category, level) {
  if (!Object.hasOwn(XP_BALANCE.fractions, category) || !validLevel(level)) return 0;
  const taper = Math.max(0, 1 - (level - 1) / (XP_BALANCE.earlyTaperLevel - 1));
  const base = XP_BALANCE.fractions[category];
  return base + (XP_BALANCE.earlyFractions[category] - base) * taper ** 2;
}
function interpolateGap(gap, points) {
  if (gap <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [end, value] = points[i], [start, previous] = points[i - 1];
    if (gap <= end) return previous + (value - previous) * smooth((gap - start) / (end - start));
  }
  return points.at(-1)[1];
}
// Signed gap = recipient minus enemy. Smoothstep knots have matching zero slopes.
function gapMultiplier(gap) {
  if (!Number.isFinite(gap)) return 0;
  if (gap >= 0) return interpolateGap(gap, XP_BALANCE.overlevelCurve);
  const stronger = -gap;
  return stronger <= 60 ? interpolateGap(stronger, XP_BALANCE.underlevelCurve) : .02 / (1 + ((stronger - 60) / 10) ** 2);
}
function levelGapScale(playerLevel, monsterLevel) {
  return validLevel(playerLevel) && validLevel(monsterLevel) && playerLevel < MAX_PLAYER_LEVEL ? gapMultiplier(playerLevel - monsterLevel) : 0;
}
const encounterBaseXp = (level, category) => validLevel(level) ? xpNeed(level) * categoryFraction(category, level) : 0;
function encounterShare({ playerLevel, monsterLevel, category = 'normal', members = 1, healthScale = partyHpScale(members), rewardScale = 1 }) {
  const relative = levelGapScale(playerLevel, monsterLevel);
  if (!relative || !Number.isFinite(rewardScale) || rewardScale <= 0) return 0;
  // A far stronger monster cannot import its entire high-level XP budget into a low-level hero.
  const reference = Math.min(monsterLevel, playerLevel + XP_BALANCE.underlevelMinimumWindow, MAX_PLAYER_LEVEL);
  const fraction = categoryFraction(category, reference);
  const base = Math.min(xpNeed(reference), xpNeed(playerLevel) * XP_BALANCE.relativeBudgetCap) * fraction;
  return Math.min(Number.MAX_SAFE_INTEGER, base * rewardScale) * relative * partyAllocation(members, healthScale);
}
function gearXpMultiplier(bonus) {
  if (!Number.isFinite(bonus) || bonus <= 0) return 1;
  const cap = XP_BALANCE.gearSoftCapPercent;
  return 1 + cap / 100 * (bonus / (cap + bonus));
}
function applyXpBonuses(amount, { gearBonus = 0, wisdom = false, serverRate = 1, limit = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(serverRate) || serverRate <= 0 || !Number.isFinite(limit) || limit <= 0) return 0;
  const value = amount * gearXpMultiplier(gearBonus) * (wisdom ? XP_BALANCE.wisdomMultiplier : 1) * Math.min(XP_BALANCE.serverRateCap, serverRate);
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(limit), Math.round(value)));
}
function finalizeXpAward(beforeHook, proposed, { combat = false, limit = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isFinite(proposed) || proposed <= 0 || !Number.isFinite(beforeHook) || beforeHook <= 0 || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.max(0, Math.floor(Math.min(Number.MAX_SAFE_INTEGER, limit, combat ? beforeHook * XP_BALANCE.pluginMultiplierCap : Number.MAX_SAFE_INTEGER, Math.round(proposed))));
}
const encounterLimit = (level, options = {}) => validLevel(level) && level < MAX_PLAYER_LEVEL ? Math.floor(xpNeed(level) * XP_BALANCE.maxEncounterFraction * partyAllocation(options.members, options.healthScale)) : 0;
function calculateEncounterXp(options) {
  const limit = encounterLimit(options.playerLevel, options), base = encounterShare(options);
  const boosted = applyXpBonuses(base, { ...options, limit });
  const multiplier = options.pluginMultiplier === undefined ? 1 : options.pluginMultiplier;
  return finalizeXpAward(boosted, boosted * multiplier, { combat: true, limit });
}
module.exports = { MAX_PLAYER_LEVEL, XP_BALANCE, validLevel, xpNeed, partyHpScale, partyDamageScale, partyPoolScale, partyAllocation, encounterCategory, categoryFraction, gapMultiplier, levelGapScale, encounterBaseXp, encounterShare, gearXpMultiplier, applyXpBonuses, finalizeXpAward, encounterLimit, calculateEncounterXp };
