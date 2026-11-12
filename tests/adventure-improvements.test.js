'use strict';
// Prepared for explicit execution on user request. This change does not install test hooks.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const { openJsonStore, coordinateSaves, recoverSaveGroup } = require('../src/server/persistence');
const { createAdventure, CONTRACTS } = require('../src/progression/adventure');
const { createTeams } = require('../src/multiplayer/teams');
const { createRegions } = require('../src/world/regions');
const { createEncounterRuntime } = require('../src/world/encounter-runtime');
const { createEncounterParticipation } = require('../src/combat/encounter-participation');
const { bossPressure } = require('../src/combat/enemy-scaling');
const { mobSnapshot } = require('../src/multiplayer/snapshots');
const { maps, addMap, setSettlement, boardPosition, NPCS } = require('../src/world/game-world');
const { evaluate } = require('../public/affix-usage');
const noop = () => {};
function hero(id = 1) { const p = { id, name: 'Hero' + id, cls: 'blade', c: {}, lvl: 10, hp: 100, maxhp: 100, souls: 0, gold: 1000, xp: 99, eq: {}, bag: [], data: {}, x: NPCS.merchant.x, y: NPCS.merchant.y }; p.c.p = p; return p; }
function temp(t) { const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shardlands-checkpoint-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true })); return directory; }

test('coordinated snapshots recover both wallet and world after a partial multi-file save', async t => {
  const directory = temp(t), playerStore = openJsonStore(path.join(directory, 'players.json'));
  playerStore.data.hero = { gold: 900 };
  const world = { data: { donated: 100 }, save: async () => { throw Error('disk failure after wallet write'); } };
  coordinateSaves({ directory, stores: { 'players.json': playerStore, 'world.json': world } });
  await assert.rejects(playerStore.save(), /disk failure/);
  assert.equal(fs.existsSync(path.join(directory, 'save-journal.json')), true);
  recoverSaveGroup(directory, ['players.json', 'world.json']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'players.json'))).hero.gold, 900);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'world.json'))).donated, 100);
  assert.equal(fs.existsSync(path.join(directory, 'save-journal.json')), false);
});
test('a save requested during IO is included before the shared checkpoint promise resolves', { timeout: 2000 }, async t => {
  const directory = temp(t), writes = []; let release;
  const blocked = new Promise(resolve => { release = resolve; }); let first = true;
  const store = { data: { gold: 10 }, save: async snapshot => { writes.push(snapshot.gold); if (first) { first = false; await blocked; } } };
  const save = coordinateSaves({ directory, stores: { 'players.json': store } });
  const pending = save();
  // The writer signals the precise IO stage; no sleeps or timing assumptions.
  while (!writes.length) await new Promise(resolve => setImmediate(resolve));
  store.data.gold = 5; const concurrent = save(); release();
  assert.equal(concurrent, pending); await pending; assert.deepEqual(writes, [10, 5]);
});
test('a malformed checkpoint journal stops recovery without replacing existing saves', t => {
  const directory = temp(t); fs.writeFileSync(path.join(directory, 'players.json'), '{"gold":10}'); fs.writeFileSync(path.join(directory, 'save-journal.json'), '{"version":99,"stores":{}}');
  assert.throws(() => recoverSaveGroup(directory, ['players.json']), /Invalid save journal/);
  assert.equal(fs.readFileSync(path.join(directory, 'players.json'), 'utf8'), '{"gold":10}');
});
test('funding treats prototype-like character names as ordinary donors and retains them after JSON round trips', () => {
  const service = createRegions({ universe: { state: { generatorVersion: 1 }, regionFor: () => ({ name: 'Camp' }), save: noop, recordOnce: noop }, players: new Map(), mobs: new Map(), send: noop, say: noop, ev: noop });
  for (const [index, name] of ['constructor', '__proto__', 'toString'].entries()) {
    const map = addMap(20 + index, { regionTier: 27 + index }), record = { kind: 'camp', style: 'dark', built: {} }; setSettlement(map, record);
    const player = { name, gold: 1000, ...boardPosition(map) }; service.buildStall(player, 'merchant', 100);
    assert.equal(player.gold, 900); assert.equal(record.funds.merchant.donors[name], 100);
    record.funds = JSON.parse(JSON.stringify(record.funds)); service.buildStall(player, 'merchant', 100);
    assert.equal(record.funds.merchant.donors[name], 200); assert.equal(player.gold, 800);
    service.buildStall(player, 'merchant', '10'); assert.equal(player.gold, 800);
  }
});
test('wounded bosses retain elapsed enrage time and recovery across encounter reconstruction', () => {
  const players = new Map([[1, { id: 1, x: 6000, y: 6000 }]]), mobs = new Map();
  const saved = { a: { health: .5, ps: 1, partyDamageScale: 1, fightElapsed: 125000, recoveryLeft: 700 } };
  const runtime = createEncounterRuntime({ players, mobs, spawnMob: (type, x, y) => { const monster = { id: 10, ty: type, x, y, hp: 100, mh: 100, boss: true, worldBoss: true }; mobs.set(10, monster); return monster; } });
  runtime.register({ id: 1, map: maps[0], zoneIndex: 0, min: 0, max: 99999, loadPlan: () => ({ encounters: [{ id: 'boss', x: 6000, y: 6000, spawnIds: ['a'] }], spawns: [{ id: 'a', encounterId: 'boss', type: 'warlord', x: 6000, y: 6000 }] }), storage: () => saved });
  runtime.tick(500000); const monster = mobs.get(10); assert.equal(monster.hp, 50); assert.equal(bossPressure(monster, 500000).enraged, true); assert.equal(monster.recoverUntil, 500700);
  const player = hero(); player.x = 6000; player.y = 6000; const start = monster.fightStart;
  const participation = createEncounterParticipation({ players: new Map([[player.id, player]]) }); participation.begin(player, monster); assert.equal(monster.fightStart, start);
  participation.reset(monster); assert.equal(monster.fightStart, 0); assert.equal(monster.recoverUntil, 0);
});
test('boss fields survive actual full and field-delta decoding without per-frame server fields', () => {
  const source = fs.readFileSync(require.resolve('../public/game'), 'utf8'), browser = vm.createContext({ I: { tl: ['boss'] }, mo: [] });
  vm.runInContext(source.slice(source.indexOf('const mobRows = new Map()'), source.indexOf('const playerRows = new Map()')), browser);
  const c = { mobDeltas: true, mobFieldDeltas: true }, monster = { id: 1, ty: 'boss', x: 6000, y: 6000, hp: 50, mh: 100, lvl: 10, boss: true, worldBoss: true, fightStart: 1000, cast: { s: 'slam', startedAt: 1100, at: 2250 } };
  browser.updateMobSnapshot(JSON.parse(JSON.stringify(mobSnapshot(c, [monster], { boss: 0 }))));
  assert.equal(browser.mo[0].phase, 1); assert.equal(browser.mo[0].castEnd, 2250); assert.equal(browser.mo[0].enrageAt, 121000);
  monster.cast = null; monster.recoverUntil = 3550; const patch = JSON.parse(JSON.stringify(mobSnapshot(c, [monster], { boss: 0 }))); browser.updateMobSnapshot(patch);
  assert.ok(patch.mf); assert.equal(browser.mo[0].castEnd, 0); assert.equal(browser.mo[0].recoverEnd, 3550); assert.deepEqual(mobSnapshot(c, [monster], { boss: 0 }), {});
});
test('affix usefulness accounts for the replaced slot and caps combined equipment totals', () => {
  const weapon = { uid: 'w', slot: 'weapon', afx: { k: 'aspd', v: 30 } }, ring = { uid: 'r', slot: 'ring', afx: { k: 'aspd', v: 25 } };
  assert.deepEqual(evaluate({ weapon, ring }, { uid: 'new', slot: 'weapon' }, 'aspd', 20, { aspd: 40 }), { cap: 40, before: 40, after: 40, contribution: 15, wasted: 5 });
  assert.equal(evaluate({ weapon, ring }, ring, 'cdmg', 100, { aspd: 40 }), null);
});
test('round robin is leader-selected and skips dead, distant and full-bag recipients', () => {
  const a = hero(), b = hero(2), players = new Map([[1, a], [2, b]]), service = createTeams({ players, send: noop, say: noop, toast: noop, fire: noop, afterGearChange: noop });
  service.chatCommands.invite.fn(a, [b.name]); service.chatCommands.accept.fn(b);
  assert.equal(service.gearRecipient(b, a), b); service.handlers.team(b, { op: 'loot' }); assert.equal(service.gearRecipient(b, a), b);
  service.handlers.team(a, { op: 'loot' }); assert.equal(service.gearRecipient(b, a), a); assert.equal(service.gearRecipient(a, a), b);
  b.dead = 1; assert.equal(service.gearRecipient(a, a), a); b.dead = 0; a.bag = Array(90).fill({}); assert.equal(service.gearRecipient(a, a), b);
  b.x += 99999; assert.equal(service.gearRecipient(a, a), a);
});
test('contracts count eligible kills only and concurrent reward claims pay once without touching XP or gold', async () => {
  const player = hero(), packets = [], service = createAdventure({ send: (c, message) => packets.push(message), say: noop });
  await service.handle(player, { op: 'accept', kind: 'clear' });
  const monster = { ty: 'wolf', lvl: 10, x: 6000, y: 6000 };
  service.kill(player, { ...monster, summoned: true }); service.kill(player, { ...monster, lvl: 1 });
  // The current XP policy permits gap 13; gap 25 is the first excluded level.
  player.lvl = 20; service.kill(player, { ...monster, lvl: 7 }); assert.equal(player.data.adventure.active.progress, 2);
  player.lvl = 40; service.kill(player, { ...monster, lvl: 15 }); assert.equal(player.data.adventure.active.progress, 2); player.lvl = 10;
  for (let i = 2; i < CONTRACTS.clear.target; i++) service.kill(player, monster);
  await Promise.all([service.handle(player, { op: 'claim' }), service.handle(player, { op: 'claim' })]);
  assert.equal(player.souls, 2); assert.equal(player.gold, 1000); assert.equal(player.xp, 99); assert.equal(player.data.adventure.claimed.length, 1); assert.equal(player.data.adventure.active, null);
  await service.handle(player, { op: 'accept', kind: 'clear' }); assert.equal(player.data.adventure.active, null);
  player.data.adventure.day = '2000-01-01'; await service.handle(player, { op: 'accept', kind: 'clear' }); assert.equal(player.data.adventure.active.kind, 'clear');
  player.x = 6000; player.y = 6000; player.data.adventure.active.progress = 12; await service.handle(player, { op: 'claim' }); assert.equal(player.souls, 2);
});
test('bestiary records only encountered families and actually collected drops, preserves saves and localization', async () => {
  const player = hero(), packets = [], service = createAdventure({ send: (c, message) => packets.push(message), say: noop });
  await service.handle(player, { op: 'inspect' }); assert.deepEqual(packets.at(-1).entries, {});
  const monster = { ty: 'wolf', lvl: 10, x: 6000, y: 6000 }; service.observe(player, monster); service.kill(player, monster); service.pickup(player, { source: 'wolf', kind: 'gold' }, 40);
  await service.handle(player, { op: 'inspect' }); const view = packets.at(-1); assert.deepEqual(Object.keys(view.entries), ['wolf']); assert.equal(view.entries.wolf.kills, 1); assert.equal(view.entries.wolf.drops.gold, 40);
  const restored = hero(); restored.data = JSON.parse(JSON.stringify(player.data)); await service.handle(restored, { op: 'inspect' }); assert.equal(packets.at(-1).entries.wolf.kills, 1);
  let catalog; vm.runInNewContext(fs.readFileSync(require.resolve('../public/locales/hu'), 'utf8'), { GameText: { addCatalog: (code, entries) => { catalog = entries; } } });
  for (const file of ['../src/progression/adventure', '../public/adventure-ui']) for (const match of fs.readFileSync(require.resolve(file), 'utf8').matchAll(/(?:text|localizedText)\('((?:adventure|boss|affix|team)\.[^']+)'\s*[,)]/g)) assert.ok(Object.hasOwn(catalog, match[1]), match[1]);
  for (const category of ['normal', 'alpha', 'stone', 'boss', 'worldBoss']) assert.ok(Object.hasOwn(catalog, 'adventure.category.' + category), category);
});

test('journal updates batch changed entries at 250ms and unsupported future journals do not break combat', async () => {
  const player = hero(), packets = [], service = createAdventure({ send: (c, message) => packets.push(message), say: noop });
  await service.handle(player, { op: 'inspect' }); const initial = packets.length;
  const monster = { ty: 'wolf', lvl: 10, x: 6000, y: 6000 };
  for (let i = 0; i < 100; i++) service.kill(player, monster);
  assert.equal(packets.length, initial); service.flush([player], 1000); assert.equal(packets.length, initial + 1); assert.equal(packets.at(-1).entries.wolf.kills, 100);
  service.kill(player, monster); service.flush([player], 1100); assert.equal(packets.length, initial + 1); service.flush([player], 1250); assert.equal(packets.at(-1).entries.wolf.kills, 101);
  await service.handle(player, { op: 'close' }); service.kill(player, monster); service.flush([player], 1500); assert.equal(packets.length, initial + 2);
  player.data.adventure = { version: 999, future: true }; assert.doesNotThrow(() => service.kill(player, monster)); assert.deepEqual(player.data.adventure, { version: 999, future: true });
});
