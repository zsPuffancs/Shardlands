'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const BagView = require('../public/bag-view');
const { createInventory } = require('../inventory');
const { createTeams } = require('../teams');
const { createPlayerSessions } = require('../player-session');
const { newSk, stats } = require('../characters');
const { createGameSaves } = require('../persistence');
const { NPCS } = require('../game-world');
const noop = () => {};
const item = (uid, extra = {}) => ({ uid, name: 'Iron Sword', slot: 'weapon', fam: 'sword', rar: 0, ilvl: 10, plus: 0, req: 1, stats: { dmg: 10 }, ...extra });
function hero(id = 1) { const player = { id, name: 'Hero' + id, c: {}, cls: 'archer', lvl: 100, xp: 123, sp: 5, gold: 10000, souls: 99, eq: {}, bag: [], inv: { hp: 3 }, sk: newSk(), buf: {}, x: NPCS.merchant.x, y: NPCS.merchant.y }; stats(player); player.hp = player.maxhp; player.mp = player.maxmp; return player; }
function service(extra = {}) { const packets = [], effects = []; const inventory = createInventory({ send: (connection, packet) => packets.push(packet), say: noop, toast: noop, broadcast: noop, ev: (...args) => effects.push(args), fire: (...args) => effects.push(args), genGear: (slot, level, rarity) => item('merged', { slot, ilvl: level, rar: rarity }), ...extra }); return { inventory, packets, effects }; }
function prepare(inventory, packets, player, uid) { assert.equal(inventory.prepareDestroy(player, uid), true); return packets.at(-1); }
const labels = { locale: 'en', slots: ['weapon', 'helm', 'armor', 'boots', 'ring', 'amulet'], rarityNames: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'], slotNames: { weapon: 'Weapon', helm: 'Helmet' }, statNames: { dmg: 'Damage', xpb: 'XP Bonus' }, affixes: { ls: { name: 'Lifesteal', prefix: 'Vampiric' } } };

test('bag search matches all pages, names/types/rarities/affixes/stats case insensitively', () => {
  const bag = Array.from({ length: 90 }, (_, i) => item('item-' + i, { name: 'Plain Sword ' + i })); bag[75] = item('target', { name: 'Vampiric Dragonbone Blade', rar: 4, stats: { xpb: 20 }, afx: { k: 'ls', v: 2 } });
  for (const query of ['DRAGONBONE', 'legendary', 'VAMPIRIC', 'lifesteal', 'xp bonus', 'blade weapon']) assert.deepEqual(BagView.select(bag, { query }, labels).items.map(item => item.uid), ['target'], query);
  assert.equal(BagView.select(bag, { query: 'sword' }, labels).items.length, 90);
  assert.equal(BagView.select(bag, { query: 'missing' }, labels).items.length, 0);
  assert.equal(BagView.select(bag, { query: 'blade', rarities: [0, 1] }, labels).items.length, 0);
});

test('rarity/type/status/level filters compose with AND, while selected rarity/slot values use OR', () => {
  const bag = [item('a', { rar: 4, ilvl: 100 }), item('b', { rar: 5, ilvl: 120, slot: 'ring', lk: 1 }), item('c', { rar: 4, ilvl: 130, plus: 2, afx: { k: 'ls', v: 1 } }), item('d', { rar: 3, ilvl: 200 })];
  const uids = state => BagView.select(bag, state, labels).items.map(item => item.uid);
  assert.deepEqual(uids({ rarities: [4, 5], slots: ['weapon', 'ring'], minLevel: '100', maxLevel: '125' }), ['a', 'b']);
  assert.deepEqual(uids({ status: 'locked' }), ['b']); assert.deepEqual(uids({ status: 'unlocked', rarities: [4, 5] }), ['a', 'c']); assert.deepEqual(uids({ status: 'upgraded' }), ['c']); assert.deepEqual(uids({ status: 'affixed' }), ['c']);
  for (const value of ['-1', '1.5', 'Infinity', 'abc', '9007199254740992']) assert.equal(BagView.select(bag, { minLevel: value }, labels).errors.length, 1);
  assert.equal(BagView.select(bag, { minLevel: '125', maxLevel: '100' }, labels).items.length, 0);
  assert.deepEqual(uids(BagView.defaults()), ['a', 'b', 'c', 'd']);
});

test('stable sorting preserves UID/data and original order, across filtering and pagination', () => {
  const bag = [item('a', { name: 'Zeta', rar: 4, ilvl: 100 }), item('b', { name: 'Alpha', rar: 5, ilvl: 90 }), item('c', { name: 'alpha', rar: 5, ilvl: 90, slot: 'ring' }), item('d', { name: 'Beta', rar: 0, ilvl: 120 })];
  const before = JSON.stringify(bag), uids = state => BagView.select(bag, state, labels).items.map(item => item.uid);
  assert.deepEqual(uids({ sort: 'rarity-desc' }), ['b', 'c', 'a', 'd']); assert.deepEqual(uids({ sort: 'rarity-asc' }), ['d', 'a', 'b', 'c']);
  assert.deepEqual(uids({ sort: 'level-desc' }), ['d', 'a', 'b', 'c']); assert.deepEqual(uids({ sort: 'level-asc' }), ['b', 'c', 'a', 'd']);
  assert.deepEqual(uids({ sort: 'name-asc' }), ['b', 'c', 'd', 'a']); assert.deepEqual(uids({ sort: 'name-desc' }), ['a', 'd', 'b', 'c']); assert.deepEqual(uids({ sort: 'slot' }), ['a', 'b', 'd', 'c']);
  assert.deepEqual(uids({ sort: 'original' }), ['a', 'b', 'c', 'd']); assert.deepEqual(uids({ rarities: [5], sort: 'name-asc' }), ['b', 'c']);
  const page = BagView.page(bag, { rarities: [5], sort: 'name-asc' }, labels, { index: 2, size: 30, capacity: 90 }); assert.equal(page.page, 0); assert.equal(page.pageCount, 1); assert.equal(page.total, 4);
  assert.equal(BagView.page(bag, {}, labels).pageCount, 3); assert.equal(JSON.stringify(bag), before);
});

test('destruction needs an owned UID and fresh server confirmation, removes one item and pays nothing', () => {
  const player = hero(), saved = []; player.bag = [item('a'), item('b')]; const before = { gold: player.gold, souls: player.souls, xp: player.xp, inv: { ...player.inv }, sp: player.sp };
  const { inventory, packets, effects } = service({ persistPlayer: p => saved.push(JSON.stringify(p.bag)) });
  assert.equal(inventory.destroyItem(player, 'a', 'guessed'), false); const preview = prepare(inventory, packets, player, 'a');
  assert.equal(preview.item.uid, 'a'); assert.equal(player.bag.length, 2); assert.equal(inventory.destroyItem(player, 'a', preview.token), true);
  assert.deepEqual(player.bag.map(item => item.uid), ['b']); assert.equal(packets.at(-1).ok, true); assert.equal(saved.length, 1); assert.deepEqual(effects, []);
  for (const [key, value] of Object.entries(before)) assert.deepEqual(player[key], value);
  assert.equal(inventory.destroyItem(player, 'a', preview.token), false); assert.deepEqual(player.bag.map(item => item.uid), ['b']); assert.equal(saved.length, 1);
});

test('locked/equipped/foreign/reserved/ambiguous items and invalid UIDs cannot be destroyed', () => {
  const player = hero(); player.bag = [item('locked', { lk: 1 }), item('reserved'), item('dup'), item('dup')]; player.eq.weapon = item('equipped');
  const { inventory } = service({ isItemReserved: (player, uid) => uid === 'reserved' }), before = JSON.stringify(player);
  for (const uid of ['', ' ', {}, [], null, 1, 'x'.repeat(129), 'bad\nuid', 'locked', 'reserved', 'equipped', 'foreign', 'hp', 'dup']) assert.equal(inventory.prepareDestroy(player, uid), false, String(uid));
  assert.equal(JSON.stringify(player), before);
});

test('Legendary/Mythic safeguards and final-state/expiry checks are server-authoritative', () => {
  for (const rarity of [4, 5]) {
    const player = hero(); player.bag = [item('valuable', { rar: rarity })]; const { inventory, packets } = service(); let preview = prepare(inventory, packets, player, 'valuable');
    assert.equal(preview.deliberate, true); assert.equal(inventory.destroyItem(player, 'valuable', preview.token, false), false);
    preview = prepare(inventory, packets, player, 'valuable'); assert.equal(inventory.destroyItem(player, 'valuable', preview.token, true), true);
  }
  for (const mutate of [p => { p.bag[0].lk = 1; }, p => { p.bag[0].plus++; }, p => { p.bag[0].stats.dmg++; }, p => { p.eq.weapon = p.bag.pop(); }, p => { p.dead = 1; }]) {
    const player = hero(); player.bag = [item('a')]; const { inventory, packets } = service(), preview = prepare(inventory, packets, player, 'a'); mutate(player); const before = JSON.stringify(player);
    assert.equal(inventory.destroyItem(player, 'a', preview.token, true), false); assert.equal(JSON.stringify(player), before);
  }
  const player = hero(); player.bag = [item('a')]; const { inventory, packets } = service(), preview = prepare(inventory, packets, player, 'a'); const now = Date.now; Date.now = () => preview.expiresAt;
  try { assert.equal(inventory.destroyItem(player, 'a', preview.token), false); assert.equal(player.bag.length, 1); } finally { Date.now = now; }
});

test('sorting never changes which UID is equipped, locked, sold, merged or destroyed', () => {
  const player = hero(), { inventory, packets } = service(); player.bag = [item('low', { rar: 0 }), item('high', { rar: 3, ilvl: 90 }), item('second')];
  const displayed = BagView.page(player.bag, { sort: 'rarity-desc' }, labels); assert.equal(displayed.visible[0].uid, 'high');
  inventory.lockItem(player, displayed.visible[0].uid); assert.equal(player.bag[1].lk, 1); inventory.lockItem(player, 'high');
  inventory.equipItem(player, 'high'); assert.equal(player.eq.weapon.uid, 'high'); inventory.unequipItem(player, 'weapon');
  const preview = prepare(inventory, packets, player, 'high'); assert.equal(inventory.destroyItem(player, 'high', preview.token), true);
  inventory.doMerge(player, ['low', 'second']); assert.deepEqual(player.bag.map(item => item.uid), ['merged']);
  inventory.sellItem(player, 'merged'); assert.equal(player.bag.length, 0);
});

test('trade reservations are rechecked after a preview and successful destruction survives save/reload', () => {
  const a = hero(), b = hero(2), players = new Map([[a.id, a], [b.id, b]]); a.bag = [item('a')];
  const teams = createTeams({ players, send: noop, say: noop, toast: noop, fire: noop, afterGearChange: noop });
  teams.chatCommands.invite.fn(a, [b.name]); teams.chatCommands.accept.fn(b);
  const saveStore = { data: {}, save: async () => {} }, pluginStore = { data: {}, save: async () => {} }, saves = createGameSaves({ players, saveStore, pluginStore });
  const { inventory, packets } = service({ isItemReserved: teams.isItemReserved, persistPlayer: saves.savePlayer }); let preview = prepare(inventory, packets, a, 'a');
  teams.handlers.trade(a, { op: 'request', name: b.name }); teams.handlers.trade(b, { op: 'accept' }); teams.handlers.trade(a, { op: 'offer', uids: ['a'], gold: 0 });
  assert.equal(teams.isItemReserved(a, 'a'), true); assert.equal(inventory.destroyItem(a, 'a', preview.token), false); assert.equal(a.bag.length, 1);
  teams.handlers.trade(a, { op: 'cancel' }); preview = prepare(inventory, packets, a, 'a'); inventory.destroyItem(a, 'a', preview.token);
  const reloaded = JSON.parse(JSON.stringify(saveStore.data.hero1)); assert.deepEqual(reloaded.bag, []); assert.equal(reloaded.gold, a.gold); assert.equal(reloaded.souls, a.souls);
});

test('authenticated message dispatch only targets the connected hero and ignores spoofed item attributes', () => {
  const player = hero(), other = hero(2), { inventory, packets } = service(); player.bag = [item('mine', { rar: 4 })]; other.bag = [item('foreign')];
  const sessions = createPlayerSessions({ config: { admins: [] }, players: new Map([[1, player], [2, other]]), mobs: new Map(), saves: {}, send: noop, inventory });
  sessions.handleMessage({}, { t: 'prepareDestroy', uid: 'mine' }); assert.equal(packets.length, 0);
  const connection = { p: player }; sessions.handleMessage(connection, { t: 'prepareDestroy', uid: 'foreign', playerId: 2 }); assert.equal(packets.at(-1).ok, false);
  sessions.handleMessage(connection, { t: 'prepareDestroy', uid: 'mine', rar: 0 }); const preview = packets.at(-1);
  sessions.handleMessage(connection, { t: 'destroy', uid: 'mine', token: preview.token, rar: 0, playerId: 2, deliberate: false }); assert.equal(player.bag.length, 1); assert.equal(other.bag.length, 1);
});

test('existing trade execution transfers stable UIDs once after a sorted view and protects locks on offer', () => {
  const a = hero(), b = hero(2), players = new Map([[1, a], [2, b]]), events = [], packets = [];
  a.bag = [item('a-low'), item('a-high', { rar: 4 }), item('locked', { lk: 1 })]; b.bag = [item('b')];
  const teams = createTeams({ players, send: (connection, packet) => packets.push(packet), say: noop, toast: noop, fire: (...args) => events.push(args), afterGearChange: noop });
  const confirm = player => { const state = packets.findLast(packet => packet.t === 'trade' && packet.open); teams.handlers.trade(player, { op: 'confirm', id: state.id, revision: state.revision }); };
  teams.chatCommands.invite.fn(a, [b.name]); teams.chatCommands.accept.fn(b);
  teams.handlers.trade(a, { op: 'request', name: b.name }); teams.handlers.trade(b, { op: 'accept' });
  const selected = BagView.select(a.bag, { sort: 'rarity-desc' }, labels).items[0].uid;
  teams.handlers.trade(a, { op: 'offer', uids: [selected, 'locked'], gold: 5 }); teams.handlers.trade(b, { op: 'offer', uids: ['b'], gold: 2 });
  assert.equal(teams.isItemReserved(a, selected), true); assert.equal(teams.isItemReserved(a, 'locked'), false);
  confirm(a); confirm(b);
  assert.deepEqual(a.bag.map(item => item.uid), ['a-low', 'locked', 'b']); assert.deepEqual(b.bag.map(item => item.uid), [selected]); assert.equal(a.gold, 9997); assert.equal(b.gold, 10003); assert.equal(events.filter(event => event[0] === 'trade').length, 1);
  confirm(a); assert.equal(events.filter(event => event[0] === 'trade').length, 1);
});
