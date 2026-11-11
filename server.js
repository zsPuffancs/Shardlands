'use strict';
// Shardlands entry point. Compose game services and manage the server lifecycle.
const path = require('node:path');
const { IndexedEntities } = require('./spatial-index');
const { withLocalizedText, localizedText } = require('./localized-text');
const { loadServerConfig } = require('./server-config');
const { openJsonStore, createGameSaves } = require('./persistence');
const { W, H, CX, CY, rnd, rint, pick, attachUniverse, clampWorld, maps } = require('./game-world');
const { createUniverse, newSeed } = require('./universe');
const { createRegions } = require('./regions');
const { createTeams } = require('./teams');
const { TIERS, MOBTYPES, createMonsterSpawner, markWorldBoss } = require('./monsters');
const { createEquipment } = require('./equipment');
const { createInventory } = require('./inventory');
const { createProgression } = require('./characters');
const { createLoot } = require('./loot');
const { createCombat } = require('./combat');
const { createPlayerSessions } = require('./player-session');
const { createPluginHost } = require('./plugin-host');
const { createSimulation } = require('./simulation');
const { createWebServer } = require('./web-server');
const { createMobTypeIndex, createSnapshotPublisher } = require('./snapshots');
const { startServer } = require('./server-lifecycle');

const { config, rates } = loadServerConfig(__dirname);
const port = process.env.PORT || config.port || 3000;
const saveStore = openJsonStore(path.join(__dirname, 'saves.json'));
const pluginStore = openJsonStore(path.join(__dirname, 'plugin-data.json'));
const universeStore = openJsonStore(path.join(__dirname, 'universe.json'));
const players = new IndexedEntities(), mobs = new IndexedEntities(), loot = new IndexedEntities();
let nextEntityId = 1;
const allocateId = () => nextEntityId++;
const refreshMobTypes = createMobTypeIndex(MOBTYPES);
let events = [];

function emitGameEvent(kind, x, y, value, extra) {
  events.push(withLocalizedText(Object.assign({ k: kind, x: Math.round(x), y: Math.round(y), v: value }, extra), 'v'));
}

function drainEvents() {
  const pendingEvents = events;
  events = [];
  return pendingEvents;
}

function broadcast(message) {
  for (const player of players.values()) send(player.c, message);
}
const send = (connection, message) => transport.send(connection, withLocalizedText(message, 'm'));
const say = (player, message) => send(player.c, { t: 'msg', m: message });
const toast = (player, message, color) => send(player.c, { t: 'toast', m: message, c: color });
// The universe chronicle listens to the same game events as plugins, and hears them first.
function fire(event, ...args) {
  const record = universe.hooks[event];
  if (record) try { record(...args); } catch (error) { console.error('[universe] error in "' + event + '":', error); }
  return pluginHost.fire(event, ...args);
}
const notifications = { send, say, toast, broadcast, ev: emitGameEvent, fire };

const universe = createUniverse({
  store: universeStore, config, broadcast, messageText: localizedText, isAdmin: player => sessions.isAdmin(player),
});
attachUniverse(universe.identity);
// The World Boss of each founding zone is chosen by the seed; make those bosses bigger and tougher.
for (let tier = 1; tier <= TIERS.length; tier++) markWorldBoss(universe.regionFor(tier).worldBoss.type);
const { savePlayer, saveAll } = createGameSaves({ players, saveStore, pluginStore, extraStores: [universeStore] });
const { spawnMob, populateMonsters, populateZone, respawnMonster } = createMonsterSpawner({
  mobs, rates, world: { width: W, height: H, centerX: CX, centerY: CY }, allocateId, rnd, rint, pick, clampWorld,
});
const regions = createRegions({ ...notifications, universe, players, populateZone, refreshMobTypes });
universe.onTierUnlocked = regions.unlock;
const equipment = createEquipment({ rates });
const inventory = createInventory({ ...notifications, genGear: equipment.genGear, rerollGear: equipment.rerollGear, applyAffix: equipment.applyAffix });
const teams = createTeams({ ...notifications, players, afterGearChange: inventory.afterGearChange });
setInterval(() => teams.tick(Date.now()), 1000).unref();
const { gainXp, learnSkill } = createProgression({ ...notifications, sendInv: inventory.sendInv });
const lootService = createLoot({
  ...notifications, ...equipment, addGear: inventory.addGear, players, loot, rates, allocateId,
});
const combat = createCombat({
  teams,
  ...notifications, players, mobs, rates, spawnMob, gainXp, dropLoot: lootService.dropLoot,
});
const publishSnapshots = createSnapshotPublisher({
  mobs, loot, drainEvents, refreshMobTypes, send, canSend: connection => transport.canSend(connection),
});
const simulation = createSimulation({
  ...notifications, ...combat, players, mobs, loot, rates, respawnMonster, publishSnapshots,
  pickupTick: lootService.pickupTick, getTransportStats: () => transport.stats(),
});
const pluginHost = createPluginHost({
  ...notifications, ...inventory, directory: __dirname, config, rates, players, mobs, loot,
  pluginData: pluginStore.data, getNextId: () => nextEntityId,
  eventCount: () => events.length, truncateEvents: count => { events.length = count; },
  genGear: equipment.genGear, dropAt: lootService.dropAt, spawnMob, gainXp,
  isAdmin: player => sessions.isAdmin(player), serverStats: simulation.serverStats,
});
const sessions = createPlayerSessions({
  ...notifications, inventory, config, players, mobs, saves: saveStore.data, allocateId,
  refreshMobTypes, universe, regions, teams, commands: pluginHost.commands, skill: combat.skill, learnSkill, savePlayer,
});
const { server, transport } = createWebServer({
  publicDirectory: path.join(__dirname, 'public'), config, players, clientScripts: pluginHost.clientScripts,
  handleMessage: sessions.handleMessage,
  onLeave: sessions.leavePlayer,
});

console.log('\n  ' + config.serverName.toUpperCase());
console.log('  Universe: ' + universe.state.name + ' (seed ' + universe.state.seed + ', World Tier ' + universe.state.worldTier + ')' + (universe.founded ? ' - newly founded' : ''));
pluginHost.loadPlugins();
for (const [name, command] of Object.entries(teams.chatCommands)) if (!pluginHost.commands[name]) pluginHost.commands[name] = { fn: command.fn, admin: false, help: command.help };
populateMonsters(universe.layoutRandom('spawns'));
regions.openUnlockedRegions();
if (maps.length > 1) console.log('  World Portal open: ' + (maps.length - 1) + ' region(s) beyond the founding lands');
if (universe.founded) universeStore.save().catch(error => console.error(error));
// Seed randomizer: back up the current universe, then leave only the seed for the next start to found from.
async function reseedUniverse(requestedSeed) {
  const backup = 'universe-backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  require('node:fs').writeFileSync(path.join(__dirname, backup), JSON.stringify(universeStore.data));
  const seed = String(requestedSeed || newSeed()).trim().slice(0, 40);
  for (const key of Object.keys(universeStore.data)) delete universeStore.data[key];
  universeStore.data.requestedSeed = seed;
  for (const hook of Object.keys(universe.hooks)) universe.hooks[hook] = () => {};
  await universeStore.save();
  return { seed, backup };
}
startServer({
  server, transport, port, saveAll, reseed: reseedUniverse, tick: simulation.tick, tickIntervalMs: simulation.tickIntervalMs,
  getStatus: simulation.serverStats, monsterCount: () => mobs.size, width: W, height: H, zoneCount: TIERS.length,
});
