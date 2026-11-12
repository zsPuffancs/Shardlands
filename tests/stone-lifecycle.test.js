'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const policy = require('../src/economy/stone-rewards');
const stoneTemplate = { stone: true }, normalTemplate = {};
test('Stone lifecycle permits are finite, single-use and cannot be renewed by healing or resetting stages', () => {
  const stone = { id: 1, stoneStep: 5 }, mobs = new Map([[1, stone]]), guardians = [];
  policy.prepareStoneRewards(stone);
  let id = 1, normals = 0, alphas = 0;
  for (const stage of [4, 3, 2, 1]) {
    stone.stoneStep = stage;
    const wave = policy.reserveStoneWave(stone, stage);
    for (let index = 0; index < 13; index++) {
      const guardian = { id: ++id, summoned: true, alpha: false }; mobs.set(guardian.id, guardian);
      const permit = policy.reserveGuardianReward(guardian, wave);
      if (permit.xp) { normals++; guardians.push(guardian); assert.equal(permit.xp, .3); assert.equal(permit.gold, .3); }
    }
    for (let index = 0; index < 2; index++) {
      const guardian = { id: ++id, summoned: true, alpha: true }; mobs.set(guardian.id, guardian);
      const permit = policy.reserveGuardianReward(guardian, wave);
      if (permit.xp) { alphas++; guardians.push(guardian); assert.equal(permit.xp, .5); assert.equal(permit.gold, .5); }
    }
  }
  assert.equal(normals, 48); assert.equal(alphas, 3);
  stone.stoneStep = 5;
  assert.equal(policy.reserveStoneWave(stone, 4), null);
  for (const guardian of guardians) {
    assert.ok(policy.claimMonsterRewards(guardian, normalTemplate, mobs).xp > 0);
    assert.equal(policy.claimMonsterRewards(guardian, normalTemplate, mobs).xp, 0);
    assert.ok(policy.takeLootPermit(guardian, normalTemplate).gold > 0);
    assert.equal(policy.takeLootPermit(guardian, normalTemplate).gold, 0);
  }
  assert.equal(policy.claimMonsterRewards(stone, stoneTemplate, mobs).kind, 'stone');
  assert.equal(policy.claimMonsterRewards(stone, stoneTemplate, mobs).kind, 'none');
  assert.equal(policy.takeLootPermit(stone, stoneTemplate).gold, 2);
  assert.equal(policy.takeLootPermit(stone, stoneTemplate).gold, 0);
});
test('boss summons/spoofed sources never receive permits; genuine respawn invalidates old tickets and starts a new lifecycle', () => {
  const stone = { id: 1, stoneStep: 5 }, mobs = new Map([[1, stone]]), guardian = { id: 2, summoned: true };
  mobs.set(guardian.id, guardian); policy.prepareStoneRewards(stone);
  policy.reserveGuardianReward(guardian, policy.reserveStoneWave(stone, 4));
  const bossSummon = { id: 3, summoned: true }; mobs.set(3, bossSummon);
  assert.equal(policy.claimMonsterRewards(bossSummon, normalTemplate, mobs).gold, 0);
  assert.equal(policy.claimMonsterRewards({ ...stone }, stoneTemplate, mobs).gold, 0);
  policy.resetStoneRewards(stone); stone.stoneStep = 5; policy.prepareStoneRewards(stone);
  assert.equal(policy.claimMonsterRewards(guardian, normalTemplate, mobs).gold, 0);
  const next = { id: 4, summoned: true }; mobs.set(4, next);
  policy.reserveGuardianReward(next, policy.reserveStoneWave(stone, 4));
  assert.equal(policy.claimMonsterRewards(next, normalTemplate, mobs).xp, .3);
});
