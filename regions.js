'use strict';
// Regions beyond the founding lands. Each one is a generated map with its own village,
// monsters, stones and World Boss, reached through the World Portal.
const { buildRegionPlan, frontierZone } = require('./region-blueprint');
const { createEncounterRuntime } = require('./encounter-runtime');
const { MOBTYPES, TIERS, SPECIAL, WORLD_BOSS_SIZE } = require('./monsters');
const { maps, addMap, mapOf, nearNpc, npcPosition, placeInVillage, worldInfo, REGION_SAFE_RADIUS, setSettlement } = require('./game-world');
const Settlement = require('./public/settlement');
const { localizedText: messageText } = require('./localized-text');
const { mobTypesForClient } = require('./snapshots');

const FOUNDING_TIERS = TIERS.length;
// Which founding zone a biome borrows its scenery from on the client.
const LOOK_FOR = { volcanic: 3, glacier: 4, voidscar: 5, wildwood: 1, warfields: 2, necropolis: 6 };

function createRegions({ universe, players, mobs, spawnMob, config = {}, populateZone, refreshMobTypes, send, say, ev }) {
  const version2 = universe.state.generatorVersion === 2;
  const runtime = version2 ? createEncounterRuntime({ players, mobs, spawnMob, ...(config.worldGeneration?.activation || {}) }) : null;
  function registerPlan(tier, zone, map, record) {
    runtime.register({ id: tier, map, zoneIndex: tier - 1, min: zone.min, max: zone.max, outer: zone.outer,
      loadPlan() {
        if (!record.spawnPlan) {
          record.spawnPlan = buildRegionPlan(universe.state, record, zone, map);
        }
        if (record.spawnPlan.version !== 2) throw new Error('Unsupported persisted spawn-plan version; save preserved.');
        if (record.spawnPlan.danger && record.spawnPlan.danger.version !== 1) throw new Error('Unsupported saved danger version; save preserved.');
        return record.spawnPlan;
      },
      storage: () => record.spawnState || (record.spawnState = {}),
    });
  }
  if (runtime) for (let tier = 1; tier <= FOUNDING_TIERS; tier++) registerPlan(tier, TIERS[tier - 1], maps[0], universe.regionFor(tier));
  // Build the map for one World Tier (8 and above). Safe to call again: an open region is returned as is.
  function openRegion(tier) {
    const index = tier - FOUNDING_TIERS, zoneIndex = tier - 1;
    if (index < 1) return null;
    if (!Number.isSafeInteger(index) || index > 65535) throw new RangeError('This coordinate-based runtime supports at most 65535 frontier maps; the region description is preserved.');
    if (maps[index]) return maps[index];
    const region = universe.regionFor(tier), boss = region.worldBoss;
    const archetype = MOBTYPES[boss.archetype] ? boss.archetype : 'deathlord';
    MOBTYPES[boss.type] = { ...MOBTYPES[archetype], r: Math.round(MOBTYPES[archetype].r * WORLD_BOSS_SIZE), name: boss.name, archetype, element: region.element, worldBoss: true };
    SPECIAL[boss.type] = SPECIAL[archetype] || boss.signature || 'charge';
    const map = addMap(index, { tier: zoneIndex, regionTier: tier, look: LOOK_FOR[region.biome] === undefined ? 6 : LOOK_FOR[region.biome] });
    setSettlement(map, universe.settlement(tier));
    TIERS[zoneIndex] = frontierZone(region, map);
    if (runtime) registerPlan(tier, TIERS[zoneIndex], map, region);
    else populateZone(zoneIndex, universe.layoutRandom('spawns:' + tier));
    region.playable = true;
    return map;
  }
  function openUnlockedRegions() {
    const tiers = version2 ? Object.keys(universe.state.regions).map(Number).filter(tier => tier > FOUNDING_TIERS && tier <= universe.state.worldTier).sort((a, b) => a - b) : Array.from({ length: Math.max(0, universe.state.worldTier - FOUNDING_TIERS) }, (_, i) => i + FOUNDING_TIERS + 1);
    for (const tier of tiers) {
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
  // Encampments: on fire and void maps players pay for each stall; the first one founds the camp.
  // Anyone can give part of their gold towards a stall. When the total reaches the cost the stall is built,
  // and the biggest contributor gets the deed (on a tie, whoever reached that amount first).
  function buildStall(player, key, requested) {
    const map = mapOf(player), record = map.settlement;
    if (player.dead || !record || record.kind !== 'camp' || !Object.hasOwn(Settlement.STALL_COST, key)) return;
    if (!nearNpc(player, 'camp')) return say(player, messageText('server.campBoardFar', 'Walk up to the encampment board to build.'));
    if (record.built[key]) return say(player, messageText('server.stallBuilt', 'That stall is already built.'));
    const cost = Settlement.STALL_COST[key];
    if (!record.funds) record.funds = {};
    const fund = record.funds[key] || (record.funds[key] = { donors: {}, reached: {} });
    const raised = Object.values(fund.donors).reduce((sum, value) => sum + value, 0), remaining = Math.max(0, cost - raised);
    // No amount means "pay whatever is left"; never take more than the player has or the stall still needs.
    const wanted = requested === undefined || requested === null ? remaining : Math.floor(Number(requested));
    const amount = Math.min(remaining, player.gold, Number.isFinite(wanted) ? wanted : 0);
    if (!(amount > 0)) return say(player, messageText('server.stallNoGold', 'You have no gold to give.'));
    player.gold -= amount;
    fund.donors[player.name] = (fund.donors[player.name] || 0) + amount; fund.reached[player.name] = Date.now();
    const region = universe.regionFor(map.regionTier), board = { x: map.cx + Settlement.CAMP_BOARD.x, y: map.cy + Settlement.CAMP_BOARD.y };
    if (amount < remaining) {
      universe.save();
      say(player, messageText('server.stallDonated', 'You gave {gold} gold towards the {stall}. {left} gold still needed.', { gold: amount, stall: Settlement.STALL_NAMES[key], stallKey: key, left: remaining - amount }));
      ev('fx', board.x, board.y, 40, { s: 'buff' });
      for (const other of players.values()) if (mapOf(other) === map) send(other.c, { t: 'map', world: worldInfo(map) });
      return;
    }
    const donors = Object.keys(fund.donors).sort((a, b) => fund.donors[b] - fund.donors[a] || fund.reached[a] - fund.reached[b]);
    const owner = donors[0], first = !Object.keys(record.built).length;
    record.built[key] = { by: owner, at: Date.now(), gold: fund.donors[owner], donors: donors.length };
    delete record.funds[key];
    setSettlement(map, record);
    if (first) universe.recordOnce('camp:' + map.regionTier, 'campFounded', [owner], { region: region.name });
    if (donors.length === 1) universe.recordOnce('stall:' + map.regionTier + ':' + key, 'stallBuilt', [owner], { stall: Settlement.STALL_NAMES[key], stallKey: key, region: region.name, gold: cost });
    else universe.recordOnce('stall:' + map.regionTier + ':' + key, 'stallFunded', donors, { stall: Settlement.STALL_NAMES[key], stallKey: key, region: region.name, gold: cost, count: donors.length });
    ev('fx', board.x, board.y, 70, { s: 'lvl' });
    // Everyone on this map sees the new stall and its NPC at once.
    for (const other of players.values()) if (mapOf(other) === map) send(other.c, { t: 'map', world: worldInfo(map) });
  }
  return { buildStall, openRegion, openUnlockedRegions, unlock, portalList, travel, tick: runtime ? runtime.tick : () => {}, checkpoint: runtime ? runtime.checkpoint : () => {} };
}

module.exports = { createRegions, FOUNDING_TIERS };
