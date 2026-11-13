'use strict';
// Shardlands entry point. Compose game services and manage the server lifecycle.
const path = require('node:path');
const { createSender } = require('./public/state-delta');
const { IndexedEntities } = require('./src/shared/spatial-index');
const { withLocalizedText, localizedText } = require('./src/shared/localized-text');
const { loadServerConfig } = require('./src/server/server-config');
const { openJsonStore, createGameSaves, coordinateSaves, recoverSaveGroup } = require('./src/server/persistence');
const { W, H, CX, CY, rnd, rint, pick, attachUniverse, clampWorld, maps, setSettlement, worldInfo } = require('./src/world/game-world');
const { createUniverse, newSeed } = require('./src/world/universe');
const { createRegions } = require('./src/world/regions');
const { createTeams } = require('./src/multiplayer/teams');
const { TIERS, MOBTYPES, createMonsterSpawner, markWorldBoss } = require('./src/combat/monsters');
const { createEquipment } = require('./src/economy/equipment');
const { createInventory } = require('./src/economy/inventory');
const { createProgression } = require('./src/player/characters');
const { createLoot } = require('./src/economy/loot');
const { createCombat } = require('./src/combat/combat');
const { createAdventure } = require('./src/progression/adventure');
const { createPlayerSessions } = require('./src/player/player-session');
const { createPluginHost } = require('./src/server/plugin-host');
const { createSimulation } = require('./src/combat/simulation');
const { createWebServer } = require('./src/server/web-server');
const { createAtlas } = require('./src/world/world-atlas');
const { createMobTypeIndex, createSnapshotPublisher } = require('./src/multiplayer/snapshots');
const { startServer } = require('./src/server/server-lifecycle');

const { config, rates, balance } = loadServerConfig(__dirname);
const worldView = map => worldInfo(map, { monsterPolicy: balance.values.monsters, combatPolicy: balance.values.combat });
const port = process.env.PORT || config.port || 3000;
recoverSaveGroup(__dirname, ['saves.json', 'plugin-data.json', 'universe.json']);
const saveStore = openJsonStore(path.join(__dirname, 'saves.json'), { tracked: true });
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
const send = createSender((connection, message) => transport.send(connection, withLocalizedText(message, 'm')));
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
  store: universeStore, config, constructionEconomy: balance.values.settlement, broadcast, messageText: localizedText, isAdmin: player => sessions.isAdmin(player),
});
attachUniverse(universe.identity);
setSettlement(maps[0], universe.settlement(1));
// The World Boss of each founding zone is chosen by the seed; make those bosses bigger and tougher.
for (let tier = 1; tier <= TIERS.length; tier++) markWorldBoss(universe.regionFor(tier).worldBoss.type);
const { savePlayer, saveAll: saveGameState } = createGameSaves({ players, saveStore, pluginStore, extraStores: [universeStore] });
const { spawnMob, populateMonsters, populateZone, respawnMonster } = createMonsterSpawner({
  mobs, rates, monsterPolicy: balance.values.monsters, world: { width: W, height: H, centerX: CX, centerY: CY }, allocateId, rnd, rint, pick, clampWorld,
});
const regions = createRegions({ worldView, ...notifications, universe, players, mobs, spawnMob, config, populateZone, refreshMobTypes });
const saveAll = () => { regions.checkpoint(); return saveGameState(); };
const coordinatedSave = coordinateSaves({ background: true, directory: __dirname, stores: { 'saves.json': saveStore, 'plugin-data.json': pluginStore, 'universe.json': universeStore }, beforeSave: () => { regions.checkpoint(); for (const player of players.values()) savePlayer(player); } });
saveAll.checkpoint = coordinatedSave.checkpoint;
universe.onTierUnlocked = regions.unlock;
const equipment = createEquipment({ rates });
const inventory = createInventory({ forgePolicy: balance.values.forging, ...notifications, genGear: equipment.genGear, rerollGear: equipment.rerollGear, applyAffix: equipment.applyAffix, isItemReserved: (player, uid) => teams.isItemReserved(player, uid), persistPlayer: savePlayer, isPlayerOnline: player => players.get(player.id) === player && player.c.p === player && !player.c.closed });
const teams = createTeams({ ...notifications, players, afterGearChange: inventory.afterGearChange, isExternalItemReserved: inventory.isAutoAffixReserved });
const adventure = createAdventure({ send, say, persistPlayer: savePlayer, durableSave: () => saveStore.save(), sendInventory: inventory.sendInv });
setInterval(() => teams.tick(Date.now()), 1000).unref();
const { gainXp, learnSkill, processLevels } = createProgression({ ...notifications, sendInv: inventory.sendInv, progressionPolicy: balance.values.progression });
const lootService = createLoot({
  ...notifications, ...equipment, addGear: inventory.addGear, players, loot, rates, allocateId, gearRecipient: teams.gearRecipient, onPickup: adventure.pickup, goldPolicy: balance.values.gold, lootPolicy: balance.values.loot,
});
const combat = createCombat({
  teams, adventure, combatPolicy: balance.values.combat, goldPolicy: balance.values.gold,
  ...notifications, players, mobs, rates, spawnMob, gainXp, dropLoot: lootService.dropLoot,
});
const publishSnapshots = createSnapshotPublisher({
  players, mobs, loot, drainEvents, refreshMobTypes, send, canSend: connection => transport.canSend(connection),
});
const simulation = createSimulation({
  ...notifications, ...combat, players, mobs, loot, rates, respawnMonster, publishSnapshots,
  processJobs: activePlayers => { inventory.processJobs(); processLevels(activePlayers); adventure.flush(activePlayers); },
  updateEncounters: regions.tick, pickupTick: lootService.pickupTick, getTransportStats: () => transport.stats(),
});
const pluginHost = createPluginHost({
  ...notifications, ...inventory, directory: __dirname, config, generatorVersion: universe.state.generatorVersion, rates, players, mobs, loot,
  pluginData: pluginStore.data, getNextId: () => nextEntityId,
  eventCount: () => events.length, truncateEvents: count => { events.length = count; },
  genGear: equipment.genGear, dropAt: lootService.dropAt, spawnMob, gainXp,
  isAdmin: player => sessions.isAdmin(player), serverStats: simulation.serverStats,
});
const sessions = createPlayerSessions({
  ...notifications, worldView, forgePolicy: balance.values.forging, inventory, adventure, config, players, mobs, saves: saveStore.data, allocateId,
  resyncUi: (connection, channel) => send.resync(connection, channel),
  refreshMobTypes, universe, regions, teams, commands: pluginHost.commands, skill: combat.skill, learnSkill, savePlayer,
});
const { server, transport } = createWebServer({
  atlas: createAtlas({ universe }),
  publicDirectory: path.join(__dirname, 'public'), config, players, clientScripts: pluginHost.clientScripts,
  handleMessage: sessions.handleMessage,
  onLeave: sessions.leavePlayer,
});

console.log('\n  ' + config.serverName.toUpperCase());
console.log('  Universe: ' + universe.state.name + ' (seed ' + universe.state.seed + ', World Tier ' + universe.state.worldTier + ')' + (universe.founded ? ' - newly founded' : ''));
pluginHost.loadPlugins();
pluginHost.commands.retrytier = { admin: true, help: 'Retry the retained pending World Tier unlock without another boss kill.', fn(player) {
  void universe.retryPendingUnlock().then(result => say(player, 'World Tier preparation: ' + result.status + (result.tier ? ' (Tier ' + result.tier + ')' : ''))).catch(error => console.error('[retrytier]', error));
  return 'World Tier preparation requested. Generation diagnostics are available in universe.unlockStatus() on the server.';
} };
for (const [name, command] of Object.entries(teams.chatCommands)) if (!pluginHost.commands[name]) pluginHost.commands[name] = { fn: command.fn, admin: false, help: command.help };
if (universe.state.generatorVersion === 1) populateMonsters(universe.layoutRandom('spawns'));
else console.log('  Generator v2: encounters activate around players within bounded live budgets.');
regions.openUnlockedRegions();
if (universe.state.generatorVersion === 2) void universe.resumePendingUnlock().catch(error => console.error('[tier recovery]', error));
if (maps.length > 1) console.log('  World Portal open: ' + (maps.length - 1) + ' region(s) beyond the founding lands');
if (universe.founded) universeStore.save().catch(error => console.error(error));
// Seed randomizer: back up the current universe, then leave only the seed for the next start to found from.
async function reseedUniverse(requestedSeed) {
  universe.suspendUnlocks();
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
  beforeShutdown: () => { universe.suspendUnlocks(); inventory.cancelAllAutoAffix('cancelled'); },
  server, transport, port, saveAll, reseed: reseedUniverse, tick: simulation.tick, tickIntervalMs: simulation.tickIntervalMs,
  getStatus: simulation.serverStats, monsterCount: () => mobs.size, width: W, height: H, zoneCount: TIERS.length,
});
