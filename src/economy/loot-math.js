'use strict';
const { MAX_GEAR_DROPS, positiveAmount } = require('../shared/safety-limits');
const { STONE_REWARDS } = require('./stone-rewards');
// The production drop path and offline expectations share this policy.
function dropSpecification(monster, template, rates, reward) {
  const guardian = !!monster.summoned, stone = !!template.stone, boss = !!template.boss;
  const alpha = !!monster.alpha && !guardian, worldBoss = !!template.worldBoss;
  return {
    potionCount: stone || boss ? 4 : alpha ? 2 : 0,
    potionChance: Math.min(1, .16 * rates.potionDropRate * reward.loot),
    gearChance: (.14 + .02 * Math.min(monster.tier, 6)) * rates.gearDropRate * reward.loot,
    fixedGearCount: stone ? 4 + STONE_REWARDS.completion.extraGear + Math.floor(monster.tier / 2) : worldBoss ? 7 : boss ? 5 : alpha ? 2 : null,
    gearCap: reward.maxGear ?? MAX_GEAR_DROPS,
    minimumRarity: worldBoss ? 3 : stone ? STONE_REWARDS.completion.minimumRarity : boss ? 2 : alpha ? 1 : 0,
    rarityBonus: (boss ? 3 : stone ? 2.2 : alpha ? 1.2 : 0) + monster.tier * .15,
  };
}
function expectedGearDrops(specification) {
  if (specification.fixedGearCount !== null) return Math.min(specification.gearCap, positiveAmount(specification.fixedGearCount));
  const low = Math.floor(specification.gearChance), fraction = specification.gearChance - low;
  return Math.min(specification.gearCap, positiveAmount(low)) * (1 - fraction) + Math.min(specification.gearCap, positiveAmount(low + 1)) * fraction;
}
module.exports = { dropSpecification, expectedGearDrops };
