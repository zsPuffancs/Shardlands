'use strict';
// Regions beyond the founding lands. Each one is a generated map with its own village,
// monsters, stones and World Boss, reached through the World Portal.
const { MOBTYPES, TIERS, SPECIAL, WORLD_BOSS_SIZE } = require('./monsters');
const { maps, addMap, mapOf, nearNpc, npcPosition, placeInVillage, worldInfo, REGION_SAFE_RADIUS } = require('./game-world');
const { localizedText: messageText } = require('./localized-text');
const { mobTypesForClient } = require('./snapshots');

const FOUNDING_TIERS = TIERS.length;
const STONE_FOR = { fire: 'emberstone', frost: 'froststone', void: 'voidstone', beast: 'jadestone', war: 'bonestone', undead: 'bonestone' };
// Which founding zone a biome borrows its scenery from on the client.
const LOOK_FOR = { volcanic: 3, glacier: 4, voidscar: 5, wildwood: 1, warfields: 2, necropolis: 6 };
const REGION_MONSTERS = 260, REGION_ALPHAS = 8;

function createRegions({ universe, players, populateZone, refreshMobTypes, send, say, ev }) {
  // Build the map for one World Tier (8 and above). Safe to call again: an open region is returned as is.
  function openRegion(tier) {
    const index = tier - FOUNDING_TIERS, zoneIndex = tier - 1;
    if (index < 1) return null;
    if (maps[index]) return maps[index];
    const region = universe.regionFor(tier), boss = region.worldBoss;
    const archetype = MOBTYPES[boss.archetype] ? boss.archetype : 'deathlord';
    MOBTYPES[boss.type] = { ...MOBTYPES[archetype], r: Math.round(MOBTYPES[archetype].r * WORLD_BOSS_SIZE), name: boss.name, archetype, element: region.element, worldBoss: true };
    SPECIAL[boss.type] = SPECIAL[archetype] || boss.signature || 'charge';
    const map = addMap(index, { tier: zoneIndex, regionTier: tier, look: LOOK_FOR[region.biome] === undefined ? 6 : LOOK_FOR[region.biome] });
    const families = region.families.filter(type => MOBTYPES[type]);
    TIERS[zoneIndex] = {
      name: region.name, min: REGION_SAFE_RADIUS, max: 99999, lv: region.levels.slice(),
      types: families.length ? families : ['voidknight'], bosses: [boss.type], bossCount: 1,
      count: REGION_MONSTERS, stones: region.stones, stone: STONE_FOR[region.element] || 'doomstone', alphas: REGION_ALPHAS,
      scale: true, outer: true, generated: true, area: map,
    };
    populateZone(zoneIndex, universe.layoutRandom('spawns:' + tier));
    region.playable = true;
    return map;
  }
  function openUnlockedRegions() {
    for (let tier = FOUNDING_TIERS + 1; tier <= universe.state.worldTier; tier++) {
      try { openRegion(tier); } catch (error) { console.error('  Could not open World Tier ' + tier + ' (' + error.message + '). The server starts without it.'); }
    }
  }
  // A new region opened while people are playing: everyone learns the new monster types and sees the portal.
  function announce() {
    const types = mobTypesForClient(MOBTYPES), { types: typeList } = refreshMobTypes();
    for (const player of players.values()) {
      send(player.c, { t: 'types', types, tl: typeList });
      send(player.c, { t: 'map', world: worldInfo(mapOf(player)) });
    }
  }
  function unlock(tier) { if (openRegion(tier)) announce(); }

  function portalList(player) {
    const population = new Map(); for (const other of players.values()) { const index = mapOf(other).index; population.set(index, (population.get(index) || 0) + 1); }
    return {
      t: 'portal', here: mapOf(player).index, tier: universe.state.worldTier,
      maps: maps.map(map => {
        if (map.index === 0) return { index: 0, founding: true, levels: [1, 60], players: population.get(0) || 0 };
        const region = universe.regionFor(map.regionTier);
        return { index: map.index, tier: map.regionTier, name: region.name, biome: region.biome, levels: region.levels, boss: region.worldBoss.name, defeated: map.regionTier < universe.state.worldTier, players: population.get(map.index) || 0 };
      }),
    };
  }
  function travel(player, index) {
    const destination = maps[index];
    if (player.dead || !Number.isInteger(index) || !destination) return;
    if (!nearNpc(player, 'portal')) return say(player, messageText('server.travelAtPortal', 'Stand at the World Portal in a village to travel.'));
    if (destination === mapOf(player)) return;
    ev('fx', player.x, player.y, 70, { s: 'summon' });
    placeInVillage(player, destination);
    player.dest = null; player.dir = { x: 0, y: 0 }; player.target = 0; player.chasingTarget = false;
    const portal = npcPosition(destination, 'portal'); ev('fx', portal.x, portal.y, 70, { s: 'summon' });
  }
  return { openRegion, openUnlockedRegions, unlock, portalList, travel };
}

module.exports = { createRegions, FOUNDING_TIERS };
