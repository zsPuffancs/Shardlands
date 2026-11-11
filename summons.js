'use strict';
const { mapOf } = require('./game-world');
const { MAX_SUMMONS_GLOBAL, MAX_SUMMONS_PER_MAP, MAX_SUMMONS_PER_SOURCE } = require('./safety-limits');
const SUMMON_LIFETIME_MS = 120000;
function createSummons({ mobs, spawnMob }) {
  function spawnBatch(source, requests) {
    const map = mapOf(source); let global = 0, local = 0, owned = 0;
    for (const monster of mobs.values()) if (monster.summoned) {
      global++; if (mapOf(monster) === map) local++; if (monster.summonSourceId === source.id) owned++;
    }
    const available = Math.max(0, Math.min(MAX_SUMMONS_GLOBAL - global, MAX_SUMMONS_PER_MAP - local, MAX_SUMMONS_PER_SOURCE - owned));
    const spawned = [];
    for (const request of requests.slice(0, available)) {
      const monster = spawnMob(request.type, request.x, request.y, source.tier, request.options);
      monster.summoned = true; monster.xp = 0; monster.summonSourceId = source.id; monster.expiresAt = Date.now() + SUMMON_LIFETIME_MS;
      monster.awake = true; monster.target = source.target || 0; monster.hx = source.x; monster.hy = source.y; spawned.push(monster);
    }
    return spawned;
  }
  return { spawnBatch };
}
module.exports = { SUMMON_LIFETIME_MS, createSummons };
