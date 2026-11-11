'use strict';
const { stream } = require('./world-generation');
const LEVEL_RANGE_VERSION = 1;
const MIN_REGION_LEVEL_SPAN = 20, MAX_REGION_LEVEL_SPAN = 45, MAX_REGION_LEVEL = 10000;
// This is versioned independently from spatial generation. Existing saved descriptors are never rewritten.
function regionLevelRange(seed, tier, previousMaximum) {
  if (!Number.isSafeInteger(tier) || tier < 8) throw new RangeError('Frontier tier must be a safe integer of at least 8.');
  const width = stream(seed, tier, LEVEL_RANGE_VERSION, 'region-level-span').int(MIN_REGION_LEVEL_SPAN, MAX_REGION_LEVEL_SPAN);
  const fallback = 60 + Math.min(MAX_REGION_LEVEL, tier - 8) * MIN_REGION_LEVEL_SPAN;
  const start = Math.min(MAX_REGION_LEVEL - width, Math.max(1, Number.isFinite(previousMaximum) ? Math.floor(previousMaximum) : fallback));
  return [start, start + width];
}
module.exports = { LEVEL_RANGE_VERSION, MIN_REGION_LEVEL_SPAN, MAX_REGION_LEVEL_SPAN, MAX_REGION_LEVEL, regionLevelRange };
