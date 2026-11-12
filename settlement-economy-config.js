'use strict';

// Historical prices are immutable migration data, not balance tuning knobs.
const LEGACY_CONSTRUCTION_COSTS = Object.freeze({ merchant: 250000, smith: 400000, mystic: 400000 });
// Future Rulesets / Balance Registry entries can supply this same small configuration shape.
const SETTLEMENT_ECONOMY = Object.freeze({
  version: 1,
  baseCosts: Object.freeze({ ...LEGACY_CONSTRUCTION_COSTS }),
  startingTier: 8,
  scalingCoefficient: .06,
  scalingExponent: .7,
});

module.exports = { LEGACY_CONSTRUCTION_COSTS, SETTLEMENT_ECONOMY };
