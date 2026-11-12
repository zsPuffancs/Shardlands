'use strict';
const { SpatialIndex } = require('../shared/spatial-index');
const { mapOf } = require('./game-world');
const { partyDamageScale } = require('../progression/xp-economy');
const { savedStoneStep } = require('../economy/stone-rewards');

// Definitions remain in universe storage; live entities are a bounded, player-driven working set.
function createEncounterRuntime({ players, mobs, spawnMob, maxActive = 2048, maxPerMap = 512, activationRadius = 1700, unloadAfterMs = 30000, onError = error => console.error('[generation]', error) }) {
  const limit = (value, fallback, min, max) => Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;
  maxActive = limit(maxActive, 2048, 1, 8192); maxPerMap = limit(maxPerMap, 512, 1, 2048);
  activationRadius = limit(activationRadius, 1700, 300, 2500); unloadAfterMs = limit(unloadAfterMs, 30000, 0, 300000);
  const regions = new Map(), regionsByMap = new Map(), liveRegions = new Set(); let nextTickAt = 0;
  function register({ id, map, zoneIndex, min, max, outer, loadPlan, storage }) {
    if (regions.has(id)) return;
    const region = { map, zoneIndex, min, max, outer, loadPlan, storage, live: new Map(), seen: new Map(), spawnRetry: new Map(), index: null };
    regions.set(id, region);
    let group = regionsByMap.get(map.index); if (!group) regionsByMap.set(map.index, group = new Set()); group.add(region);
  }
  function save(region, id, monster, now = Date.now()) {
    region.storage()[id] = { health: monster.mh > 0 ? monster.hp / monster.mh : 1, deadUntil: monster.dead || 0, stoneStep: savedStoneStep(monster), ps: monster.ps || 1, partyDamageScale: monster.partyDamageScale || 1, slamT: monster.slamT || 0,
      fightElapsed: monster.fightStart ? Math.max(0, Math.min(86400000, now - monster.fightStart)) : null,
      recoveryLeft: Math.max(0, Math.min(2000, (monster.recoverUntil || 0) - now)) };
  }
  function checkpoint() { for (const region of liveRegions) for (const [id, monster] of region.live) if (mobs.get(monster.id) === monster) save(region, id, monster); }
  function tick(now = Date.now()) {
    if (now < nextTickAt) return; nextTickAt = now + 500;
    const counts = new Map();
    for (const monster of mobs.values()) { const index = mapOf(monster).index; counts.set(index, (counts.get(index) || 0) + 1); }
    const visitorsByMap = new Map(), candidates = new Set(liveRegions);
    for (const player of players.values()) if (!player.dead) {
      const index = mapOf(player).index; let visitors = visitorsByMap.get(index);
      if (!visitors) visitorsByMap.set(index, visitors = []); visitors.push(player);
      for (const region of regionsByMap.get(index) || []) candidates.add(region);
    }
    for (const region of candidates) {
      const visitors = visitorsByMap.get(region.map.index) || [];
      const couldVisit = visitors.some(player => { const radius = Math.hypot(player.x - region.map.cx, player.y - region.map.cy), padding = activationRadius + 200; return radius >= region.min - padding && (region.outer || radius <= region.max + padding); });
      if (couldVisit && !region.index && now >= (region.retryAt || 0)) {
        try {
          region.plan = region.loadPlan(); region.index = new SpatialIndex(600);
          region.definitions = new Map(region.plan.spawns.map(spawn => [spawn.id, spawn]));
          for (const encounter of region.plan.encounters) region.index.update({ ...encounter, x: encounter.x + region.map.x0, y: encounter.y + region.map.y0 });
        } catch (error) { region.index = null; region.retryAt = now + 60000; onError(error); continue; }
      }
      const wanted = new Set();
      if (couldVisit && region.index) for (const player of visitors) for (const encounter of region.index.query(player, activationRadius)) {
        region.seen.set(encounter.id, now); for (const id of encounter.spawnIds) wanted.add(id);
      }
      for (const [id, monster] of region.live) {
        if (mobs.get(monster.id) !== monster) { region.live.delete(id); continue; }
        const definition = region.definitions.get(id);
        if (!wanted.has(id) && now - (region.seen.get(definition.encounterId) || 0) >= unloadAfterMs && !monster.target && !monster.cast) {
          save(region, id, monster, now); mobs.delete(monster.id); region.live.delete(id); counts.set(region.map.index, counts.get(region.map.index) - 1);
        }
      }
      for (const id of wanted) {
        if (region.live.has(id)) continue;
        if (mobs.size >= maxActive || (counts.get(region.map.index) || 0) >= maxPerMap) break;
        const definition = region.definitions.get(id), state = region.storage()[id];
        if (now < (region.spawnRetry.get(id) || 0)) continue;
        let monster;
        try { monster = spawnMob(definition.type, region.map.x0 + definition.x, region.map.y0 + definition.y, region.zoneIndex, { alpha: definition.alpha, ...(definition.level === undefined ? {} : { level: definition.level }) }); }
        catch (error) { region.spawnRetry.set(id, now + 60000); onError(error); continue; }
        region.spawnRetry.delete(id);
        monster.spawnId = id;
        if (state && (!state.deadUntil || state.deadUntil > now)) {
          monster.ps = Number.isFinite(state.ps) ? Math.max(1, Math.min(16, state.ps)) : 1;
          monster.partyDamageScale = Number.isFinite(state.partyDamageScale) ? Math.max(1, Math.min(partyDamageScale(5), state.partyDamageScale)) : 1;
          monster.mh = Math.round(monster.mh * monster.ps);
          monster.hp = Math.max(0, Math.min(1, Number.isFinite(state.health) ? state.health : 1)) * monster.mh;
          monster.dead = state.deadUntil || 0; monster.stoneStep = state.stoneStep ?? 5; monster.slamT = state.slamT || 0;
          if (!monster.dead && (Number.isFinite(state.fightElapsed) || monster.hp < monster.mh)) {
            monster.fightStart = now - Math.max(0, Math.min(86400000, Number.isFinite(state.fightElapsed) ? state.fightElapsed : 0));
            monster.recoverUntil = now + Math.max(0, Math.min(2000, Number.isFinite(state.recoveryLeft) ? state.recoveryLeft : 0));
            monster.combatActive = true;
          }
        }
        region.live.set(id, monster); liveRegions.add(region); counts.set(region.map.index, (counts.get(region.map.index) || 0) + 1);
      }
      if (!region.live.size) liveRegions.delete(region);
      // Keep persisted health/cooldowns current; shutdown also calls checkpoint explicitly.
      for (const [id, monster] of region.live) save(region, id, monster, now);
    }
  }
  return { register, tick, checkpoint, limits: { maxActive, maxPerMap, activationRadius, unloadAfterMs } };
}
module.exports = { createEncounterRuntime };
