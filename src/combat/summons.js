'use strict';
const { mapOf } = require('../world/game-world');
const { MAX_SUMMONS_GLOBAL, MAX_SUMMONS_PER_MAP, MAX_SUMMONS_PER_SOURCE } = require('../shared/safety-limits');
const { reserveStoneWave, reserveGuardianReward } = require('../economy/stone-rewards');
const { encounterBaseXp } = require('../progression/xp-economy');
const SUMMON_LIFETIME_MS = 120000;
const STONE_GUARDIAN_ATTACK_DELAY_MS = 1200;
function canMonsterAttack(monster, now) {
  const guardian = monster.summonKind === 'stoneGuardian' || monster.summonKind === 'stoneAlphaGuardian';
  return !guardian || !(now < monster.attackReadyAt);
}
function createSummons({ mobs, spawnMob }) {
  function spawnBatch(source, requests, context = {}) {
    const stoneSource = context.kind === 'stone' && !source.summoned;
    const wave = stoneSource ? reserveStoneWave(source, context.stage) : null;
    const map = mapOf(source); let global = 0, local = 0, owned = 0;
    for (const monster of mobs.values()) if (monster.summoned) {
      global++; if (mapOf(monster) === map) local++; if (monster.summonSourceId === source.id) owned++;
    }
    const available = Math.max(0, Math.min(MAX_SUMMONS_GLOBAL - global, MAX_SUMMONS_PER_MAP - local, MAX_SUMMONS_PER_SOURCE - owned));
    const spawned = [];
    for (const request of requests.slice(0, available)) {
      const monster = spawnMob(request.type, request.x, request.y, source.tier, request.options);
      monster.summoned = true; monster.xp = 0; monster.summonSourceId = source.id; monster.expiresAt = Date.now() + SUMMON_LIFETIME_MS;
      monster.summonKind = stoneSource ? monster.alpha ? 'stoneAlphaGuardian' : 'stoneGuardian' : 'bossSummon';
      if (stoneSource) monster.attackReadyAt = Date.now() + STONE_GUARDIAN_ATTACK_DELAY_MS;
      const reward = reserveGuardianReward(monster, wave);
      monster.xp = encounterBaseXp(monster.lvl, 'normal') * reward.xp;
      monster.awake = true; monster.target = source.target || 0; monster.hx = source.x; monster.hy = source.y; spawned.push(monster);
    }
    return spawned;
  }
  return { spawnBatch };
}
module.exports = { SUMMON_LIFETIME_MS, STONE_GUARDIAN_ATTACK_DELAY_MS, canMonsterAttack, createSummons };
