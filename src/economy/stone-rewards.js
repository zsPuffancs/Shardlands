'use strict';
// Server-only policy and lifecycle permits. No inventory/schema changes or player-controlled flags.
const STONE_REWARDS = Object.freeze({
  guardian: Object.freeze({ kind: 'stoneGuardian', xp: .30, gold: .30, loot: .25, maxGear: 1, soulChance: 0, souls: 0 }),
  alpha: Object.freeze({ kind: 'stoneAlphaGuardian', xp: .50, gold: .50, loot: .40, maxGear: 1, soulChance: .08, souls: 1 }),
  completion: Object.freeze({ matureXpFraction: .20, earlyXpFraction: .45, gold: 2, souls: Object.freeze([3, 6]), extraGear: 1, minimumRarity: 1 }),
  maxGuardians: 48, maxAlphaGuardians: 3, normalPerWave: 12, alphaPerWave: 1,
});
const NORMAL_REWARD = Object.freeze({ kind: 'normal', xp: 1, gold: 1, loot: 1 });
const NO_REWARD = Object.freeze({ kind: 'none', xp: 0, gold: 0, loot: 0 });
const COMPLETION_REWARD = Object.freeze({ kind: 'stone', xp: 1, gold: STONE_REWARDS.completion.gold, loot: 1 });
const lifecycles = new WeakMap(), tickets = new WeakMap(), lootPermits = new WeakMap();
function prepareStoneRewards(stone) {
  if (stone.summoned) return null;
  let state = lifecycles.get(stone);
  if (!state) {
    const step = Number.isInteger(stone.stoneStep) && stone.stoneStep >= 0 && stone.stoneStep <= 5 ? stone.stoneStep : 0;
    state = { lowestStep: step, finished: step === 0, guardians: 0, alphas: 0 };
    lifecycles.set(stone, state);
  }
  return state;
}
function reserveStoneWave(stone, stage) {
  const state = lifecycles.get(stone);
  if (!state || state.finished || stone.summoned || !Number.isInteger(stage) || stage < 1 || stage > 4 || stage >= state.lowestStep) return null;
  state.lowestStep = stage;
  return { stone, state, normals: STONE_REWARDS.normalPerWave, alphas: stage <= 3 ? STONE_REWARDS.alphaPerWave : 0 };
}
function reserveGuardianReward(monster, wave) {
  if (!wave || lifecycles.get(wave.stone) !== wave.state) return NO_REWARD;
  const alpha = !!monster.alpha, remaining = alpha ? 'alphas' : 'normals', counter = alpha ? 'alphas' : 'guardians';
  const maximum = alpha ? STONE_REWARDS.maxAlphaGuardians : STONE_REWARDS.maxGuardians;
  if (wave[remaining] < 1 || wave.state[counter] >= maximum) return NO_REWARD;
  wave[remaining]--; wave.state[counter]++;
  const policy = alpha ? STONE_REWARDS.alpha : STONE_REWARDS.guardian;
  tickets.set(monster, { stone: wave.stone, state: wave.state, policy });
  return policy;
}
function claimMonsterRewards(monster, template, mobs) {
  if (monster.summoned) {
    const ticket = tickets.get(monster); tickets.delete(monster);
    if (!ticket || mobs.get(monster.id) !== monster || mobs.get(ticket.stone.id) !== ticket.stone || lifecycles.get(ticket.stone) !== ticket.state) return NO_REWARD;
    lootPermits.set(monster, ticket.policy);
    return ticket.policy;
  }
  if (!template.stone) return NORMAL_REWARD;
  const state = prepareStoneRewards(monster);
  if (!state || state.finished || mobs.get(monster.id) !== monster) return NO_REWARD;
  state.finished = true; state.lowestStep = 0;
  // Zero is the spent/dead stage. Normal respawn alone restores stage 5 and a fresh lifecycle.
  monster.stoneStep = 0; lootPermits.set(monster, COMPLETION_REWARD);
  return COMPLETION_REWARD;
}
function takeLootPermit(monster, template) {
  if (!monster.summoned && !template.stone) return NORMAL_REWARD;
  const policy = lootPermits.get(monster); lootPermits.delete(monster);
  return policy || NO_REWARD;
}
function savedStoneStep(monster) {
  const state = lifecycles.get(monster);
  if (!state) return monster.stoneStep;
  const step = Number.isInteger(monster.stoneStep) ? Math.max(0, Math.min(5, monster.stoneStep)) : state.lowestStep;
  return Math.min(step, state.lowestStep);
}
function resetStoneRewards(monster) { lifecycles.delete(monster); tickets.delete(monster); lootPermits.delete(monster); }
module.exports = { STONE_REWARDS, prepareStoneRewards, reserveStoneWave, reserveGuardianReward, claimMonsterRewards, takeLootPermit, savedStoneStep, resetStoneRewards };
