'use strict';
const registry = require('./generated/registry');
const { BASE_RATES, SETTLEMENT_ECONOMY, DEFAULT_FORGE_POLICY, PROGRESSION_POLICY, GOLD_POLICY, LOOT_POLICY, COMBAT_POLICY, MONSTER_POLICY } = require('./base');
const { RATE_BOUNDS, MAX_CURRENCY } = require('../shared/safety-limits');
const { HARD_BUDGETS } = require('../world/world-generation');
const environment = registry.freeze({ base: { rates: BASE_RATES, settlement: SETTLEMENT_ECONOMY, worldGeneration: { budgets: {}, spacing: {}, danger: {} }, forging: DEFAULT_FORGE_POLICY, progression: PROGRESSION_POLICY, gold: GOLD_POLICY, loot: LOOT_POLICY, combat: COMBAT_POLICY, monsters: MONSTER_POLICY }, rateBounds: RATE_BOUNDS, generationBudgets: HARD_BUDGETS, maxCurrency: MAX_CURRENCY });
/** @param {{ ruleset?: import('./generated/types').RulesetName, overrides?: import('./generated/types').DeepPartial<import('./generated/types').Balance> }} [input] */
const resolveBalance = input => registry.resolveBalance(environment, input);
const resolveLiveUpdate = (current, patch) => registry.resolveLiveUpdate(environment, current, patch);
// Existing production constants are read-only catalog entries, not ignored override knobs.
function formulaCatalog() {
  const equipment = require('../economy/equipment');
  return registry.freeze({
    xp: structuredClone(require('../progression/xp-economy').XP_BALANCE),
    monsters: structuredClone(require('../combat/enemy-scaling').ENEMY_SCALING),
    gold: structuredClone(require('../economy/gold-rewards').GOLD_BALANCE),
    stones: structuredClone(require('../economy/stone-rewards').STONE_REWARDS),
    forging: { success: [...equipment.UP_RATE] },
    worldBoss: { size: require('../shared/generated/entities').WORLD_BOSS_SIZE },
    equipment: { softCapStart: equipment.ITEM_STAT_SOFT_CAP_START, softCapScale: equipment.ITEM_STAT_SOFT_CAP_SCALE, rarity: structuredClone(equipment.RARITY), mergeCosts: [...equipment.MERGE_COST] },
    region: { version: require('../world/region-levels').LEVEL_RANGE_VERSION, minSpan: require('../world/region-levels').MIN_REGION_LEVEL_SPAN, maxSpan: require('../world/region-levels').MAX_REGION_LEVEL_SPAN },
    contracts: structuredClone(require('../progression/adventure').CONTRACTS),
    party: { size: require('../progression/xp-economy').XP_BALANCE.partySizeCap, hpPerMember: require('../progression/xp-economy').XP_BALANCE.partyHpPerMember, damagePerMember: require('../progression/xp-economy').XP_BALANCE.partyDamagePerMember },
    generation: { budgets: { ...HARD_BUDGETS }, spacing: { ...require('../world/world-generation').SPACING } },
  });
}
module.exports = { resolveBalance, resolveLiveUpdate, settingMode: registry.settingMode, RULESETS: registry.RULESETS, formulaCatalog, BASE_RATES, SETTLEMENT_ECONOMY };
