'use strict';
const { stream } = require('./world-generation');
const LEVEL_RANGE_VERSION = 1;
const MIN_REGION_LEVEL_SPAN = 20, MAX_REGION_LEVEL_SPAN = 45, MAX_REGION_LEVEL = 10000;
const FIRST_FRONTIER_TIER = 8, FIRST_FRONTIER_LEVEL = 60;
// After this many minimum-width steps, every valid starting level reaches the ceiling.
const MAX_LEVEL_STEPS = Math.ceil(MAX_REGION_LEVEL / MIN_REGION_LEVEL_SPAN);
function validateTier(tier) {
  if (!Number.isSafeInteger(tier) || tier < FIRST_FRONTIER_TIER) throw new RangeError('Frontier tier must be a safe integer of at least 8.');
}
function advanceRange(seed, tier, previousMaximum) {
  const width = stream(seed, tier, LEVEL_RANGE_VERSION, 'region-level-span').int(MIN_REGION_LEVEL_SPAN, MAX_REGION_LEVEL_SPAN);
  const start = Math.min(MAX_REGION_LEVEL, Math.max(1, Math.floor(previousMaximum)));
  // At the level ceiling, shorten the interval rather than moving its lower bound backwards.
  return [start, Math.min(MAX_REGION_LEVEL, start + width)];
}
// Resolve missing predecessors mathematically, without creating their regions or reading history.
// The backward scan and forward sum are bounded by the level ceiling, not by World Tier.
function resolveRegionLevels(seed, tier, regions = {}) {
  validateTier(tier);
  const first = Math.max(FIRST_FRONTIER_TIER - 1, tier - MAX_LEVEL_STEPS);
  let startTier = first + 1, previousMaximum = first === FIRST_FRONTIER_TIER - 1 ? FIRST_FRONTIER_LEVEL : MAX_REGION_LEVEL;
  for (let previousTier = tier - 1; previousTier >= first; previousTier--) {
    const savedMaximum = regions[previousTier]?.levels?.[1];
    if (Number.isFinite(savedMaximum) && savedMaximum >= 1) {
      previousMaximum = savedMaximum; startTier = previousTier + 1; break;
    }
  }
  let levels;
  for (let nextTier = startTier; nextTier <= tier; nextTier++) {
    if (previousMaximum >= MAX_REGION_LEVEL) return [MAX_REGION_LEVEL, MAX_REGION_LEVEL];
    levels = advanceRange(seed, nextTier, previousMaximum);
    previousMaximum = levels[1];
  }
  return levels;
}
// Existing saved descriptors are never rewritten. Direct callers can supply a known predecessor.
function regionLevelRange(seed, tier, previousMaximum) {
  validateTier(tier);
  return Number.isFinite(previousMaximum) ? advanceRange(seed, tier, previousMaximum) : resolveRegionLevels(seed, tier);
}
module.exports = { LEVEL_RANGE_VERSION, MIN_REGION_LEVEL_SPAN, MAX_REGION_LEVEL_SPAN, MAX_REGION_LEVEL, regionLevelRange, resolveRegionLevels };
