'use strict';
// Exercise the actual lifecycle gate before unit-testing the separate payout path.
const { prepareStoneRewards, claimMonsterRewards } = require('../../src/economy/stone-rewards');
const { MOBTYPES } = require('../../src/combat/monsters');
function finishStone(monster) {
  if (monster.id === undefined) monster.id = 1;
  if (monster.stoneStep === undefined) monster.stoneStep = 5;
  const mobs = new Map([[monster.id, monster]]);
  prepareStoneRewards(monster);
  monster.hp = 0;
  return claimMonsterRewards(monster, MOBTYPES[monster.ty], mobs);
}
module.exports = { finishStone };
