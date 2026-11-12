'use strict';
const { MAX_CURRENCY, validAmount } = require('../shared/safety-limits');
const { LEGACY_CONSTRUCTION_COSTS, SETTLEMENT_ECONOMY } = require('./settlement-economy-config');

function validateCosts(costs) {
  if (!costs || Object.keys(LEGACY_CONSTRUCTION_COSTS).some(key => !Object.hasOwn(costs, key) || !validAmount(costs[key]) || costs[key] < 1)) throw new RangeError('Invalid settlement construction costs; saved project preserved.');
  return costs;
}

function constructionCostsForTier(tier, config = SETTLEMENT_ECONOMY) {
  if (!Number.isSafeInteger(tier) || tier < 1 || !config || !Number.isSafeInteger(config.version) || config.version < 1 || !Number.isSafeInteger(config.startingTier) || config.startingTier < 1 || !Number.isFinite(config.scalingCoefficient) || config.scalingCoefficient < 0 || !Number.isFinite(config.scalingExponent) || config.scalingExponent < 0) throw new RangeError('Invalid settlement economy configuration or World Tier.');
  validateCosts(config.baseCosts);
  const depth = Math.max(0, tier - config.startingTier);
  const growth = config.scalingCoefficient === 0 ? 0 : config.scalingCoefficient * depth ** config.scalingExponent;
  const multiplier = 1 + growth;
  return Object.fromEntries(Object.entries(LEGACY_CONSTRUCTION_COSTS).map(([key]) => {
    const baseCost = config.baseCosts[key];
    // Saturate before multiplication, including overflow in a future ruleset's growth expression.
    const cost = !Number.isFinite(multiplier) || multiplier >= MAX_CURRENCY / baseCost ? MAX_CURRENCY : Math.min(MAX_CURRENCY, Math.round(baseCost * multiplier));
    return [key, cost];
  }));
}

function snapshotConstructionCosts(record, tier, { legacy = false, config = SETTLEMENT_ECONOMY } = {}) {
  if (record.constructionCosts !== undefined) { validateCosts(record.constructionCosts); return false; }
  record.constructionCosts = legacy ? { ...LEGACY_CONSTRUCTION_COSTS } : constructionCostsForTier(tier, config);
  record.constructionEconomyVersion = legacy ? 0 : config.version;
  return true;
}

// Read-only: callers never reprice a saved settlement, even if configuration later changes.
const settlementConstructionCosts = record => validateCosts(record?.constructionCosts ?? LEGACY_CONSTRUCTION_COSTS);
module.exports = { constructionCostsForTier, snapshotConstructionCosts, settlementConstructionCosts };
