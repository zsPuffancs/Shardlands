'use strict';
const { spawnCategory } = require('../shared/generated/entities');
// Pure monster-gold policy. No dependency on forge, XP, persistence or World Tier.
const { MAX_CURRENCY, RATE_BOUNDS } = require('../shared/safety-limits');
const GOLD_BALANCE = Object.freeze({ maxLevel: 10000, progressionCostBase: 100, progressionLevelDivisor: 12, normalCostFraction: .065, variation: .20, legacyExponent: 1.5, legacyAlphaMultiplier: 5, legacyStoneMultiplier: 1.5, multipliers: Object.freeze({ normal: 1, alpha: 4, stone: 8, boss: 80, worldBoss: 240 }) });
const FRONTIER_MODEL = 'frontier-linear-v1', FOUNDING_MODEL = 'founding-legacy-v1';
const validLevel = level => Number.isSafeInteger(level) && level >= 1 && level <= GOLD_BALANCE.maxLevel;
function product(a, b) { return Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0 ? a > MAX_CURRENCY / b ? MAX_CURRENCY : a * b : 0; }
function goldCategory(monster, template) { return spawnCategory(template, monster.alpha); }
function frontierAverageGold(level, category = 'normal') {
  if (!validLevel(level) || !Object.hasOwn(GOLD_BALANCE.multipliers, category)) return 0;
  return GOLD_BALANCE.normalCostFraction * GOLD_BALANCE.progressionCostBase * (1 + level / GOLD_BALANCE.progressionLevelDivisor) * GOLD_BALANCE.multipliers[category];
}
function monsterGoldScaling({ level, baseLevel, alpha = false, generated = false }) {
  if (generated) return { goldModel: FRONTIER_MODEL, gm: 1 };
  const gm = validLevel(level) && Number.isFinite(baseLevel) && baseLevel > 0 ? (level / baseLevel) ** GOLD_BALANCE.legacyExponent * (alpha ? GOLD_BALANCE.legacyAlphaMultiplier : 1) : 0;
  return { goldModel: FOUNDING_MODEL, gm: Number.isFinite(gm) ? Math.min(MAX_CURRENCY, gm) : 0 };
}
function monsterGoldBudget({ monster, template, generated = false, rate = 1, roll = .5 }) {
  if (!validLevel(monster.lvl) || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(roll)) return 0;
  rate = Math.min(RATE_BOUNDS.goldRate, rate); roll = Math.max(0, Math.min(1, roll));
  const model = monster.goldModel || (generated ? FRONTIER_MODEL : FOUNDING_MODEL);
  if (model === FRONTIER_MODEL) return product(frontierAverageGold(monster.lvl, goldCategory(monster, template)) * (1 - GOLD_BALANCE.variation + 2 * GOLD_BALANCE.variation * roll), rate);
  if (model !== FOUNDING_MODEL) return 0;
  const range = monster.gb || template.gold;
  if (!Array.isArray(range) || range.length !== 2 || !range.every(value => Number.isSafeInteger(value) && value >= 0) || range[1] < range[0] || !Number.isFinite(monster.gm) || monster.gm < 0) return 0;
  const width = range[1] - range[0], base = range[0] + Math.min(width, Math.floor(roll * (width + 1)));
  return product(product(product(base, monster.gm), rate), template.stone ? GOLD_BALANCE.legacyStoneMultiplier : 1);
}
function applyGoldFind(amount, bonus = 0) {
  if (!Number.isFinite(bonus)) return 0;
  return Math.min(MAX_CURRENCY, Math.max(0, Math.round(product(amount, Math.max(0, 1 + bonus / 100)))));
}
function distributeGold(budget, bonuses = [0]) {
  if (!Array.isArray(bonuses) || !bonuses.length) return [];
  if (!Number.isFinite(budget) || budget <= 0) return bonuses.map(() => 0);
  if (bonuses.length === 1) return [applyGoldFind(Math.min(MAX_CURRENCY, budget), bonuses[0])];
  // Split one integer pool before personal Gold Find. Remainders follow the existing killer-first order.
  const total = Math.min(MAX_CURRENCY, Math.max(0, Math.round(budget))), share = Math.floor(total / bonuses.length), remainder = total - share * bonuses.length;
  return bonuses.map((bonus, index) => applyGoldFind(share + (index < remainder ? 1 : 0), bonus));
}
function monsterGoldRewards(options) {
  const scale = options.rewardScale ?? 1;
  if (scale === 1) return distributeGold(monsterGoldBudget(options), options.bonuses || [0]);
  // Guardian/completion scaling precedes rates, Gold Find and the existing shared-pool rounding.
  const rate = options.rate ?? 1;
  const budget = Number.isFinite(scale) && scale >= 0 && Number.isFinite(rate) && rate >= 0
    ? product(product(monsterGoldBudget({ ...options, rate: 1 }), scale), Math.min(RATE_BOUNDS.goldRate, rate)) : 0;
  return distributeGold(budget, options.bonuses || [0]);
}
module.exports = { GOLD_BALANCE, FRONTIER_MODEL, FOUNDING_MODEL, goldCategory, frontierAverageGold, monsterGoldScaling, monsterGoldBudget, applyGoldFind, distributeGold, monsterGoldRewards };
