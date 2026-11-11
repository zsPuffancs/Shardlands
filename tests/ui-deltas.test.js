'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Delta = require('../public/state-delta');
const { mobSnapshot } = require('../snapshots');
const wire = value => JSON.parse(JSON.stringify(value));
function transport() {
  const packets = [], connection = { uiDeltas: true }; let now = 1000, failing = false;
  const send = Delta.createSender((c, message) => { if (failing) return false; packets.push(wire(message)); return true; }, () => now);
  const requests = [], receiver = Delta.createReceiver(channel => requests.push(channel));
  return { connection, send, packets, receiver, requests, fail(value) { failing = value; }, time(value) { now = value; }, transmit(message) { const size = packets.length; send(connection, message); return packets.length > size ? receiver.receive(packets.at(-1)) : null; } };
}
const item = (uid, plus = 0) => ({ uid, name: 'Iron Sword', plus, slot: 'weapon', stats: { dmg: 10, hp: 3 } });
test('inventory changes send only changed items and preserve bag ordering, equipment and removed stats', () => {
  const t = transport(); let state = { t: 'inv', bag: [item('a'), item('b'), item('c')], eq: { weapon: null }, gs: { hp: 5 }, skb: {}, souls: 0 };
  assert.deepEqual(t.transmit(state), state); assert.equal(t.transmit(state), null);
  state.bag[1].plus = 2; assert.deepEqual(t.transmit(state), state);
  let op = t.packets.at(-1).ops.find(op => op[0] === 2); assert.equal(op[3].length, 1); assert.equal(op[3][0].uid, 'b'); assert.ok(!JSON.stringify(t.packets.at(-1)).includes('"uid":"a"'));
  state.eq.weapon = state.bag.shift(); delete state.eq.weapon.stats.hp; state.gs = {}; state.souls = 10;
  assert.deepEqual(t.transmit(state), state);
  state.bag.splice(1, 0, item('new')); assert.deepEqual(t.transmit(state), state); op = t.packets.at(-1).ops.find(op => op[0] === 2); assert.deepEqual(op[5], ['b', 'new', 'c']);
  state.bag = []; state.eq.weapon = null; state.souls = 0; assert.deepEqual(t.transmit(state), state);
});
test('team updates send changed members and recover after disband/rejoin', () => {
  const t = transport(), state = { t: 'team', team: { id: 1, leader: 1, share: true, members: [{ id: 1, hp: 100 }, { id: 2, hp: 100 }] } };
  t.transmit(state); state.team.members[1].hp = 0; assert.deepEqual(t.transmit(state), state);
  assert.deepEqual(t.packets.at(-1).ops[0][3], [{ id: 2, hp: 0 }]);
  state.team.members.pop(); state.team.leader = 2; state.team.share = false; assert.deepEqual(t.transmit(state), state);
  assert.deepEqual(t.transmit({ t: 'team', team: null }), { t: 'team', team: null }); assert.deepEqual(t.transmit(state), state);
});
test('trade confirmations are small field patches and cancellation removes old offers', () => {
  const t = transport(), state = { t: 'trade', open: true, with: 'Other', mine: { uids: ['a'], gold: 10, ok: false }, theirs: { items: [item('b')], gold: 20, ok: false } };
  t.transmit(state); state.mine.ok = true; assert.deepEqual(t.transmit(state), state);
  assert.deepEqual(t.packets.at(-1).ops, [[0, ['mine', 'ok'], true]]);
  state.theirs.items.push(item('c')); state.mine.ok = false; assert.deepEqual(t.transmit(state), state);
  assert.deepEqual(t.transmit({ t: 'trade', open: false, done: true }), { t: 'trade', open: false, done: true });
  assert.deepEqual(t.transmit(state), state);
});
test('chronicle appends one event without retransmitting or reordering old history', () => {
  const t = transport(), state = { t: 'universe', u: { seed: 'world', tier: 1, history: [{ id: 1, type: 'founded' }], regions: [{ tier: 1, name: 'Home' }], legends: [], stats: { stones: 0 } } };
  t.transmit(state); state.u.history.push({ id: 2, type: 'worldBoss' }); state.u.tier = 2; state.u.regions.push({ tier: 2, name: 'Next' }); state.u.legends.push({ name: 'Hero', renown: 5 });
  assert.deepEqual(t.transmit(state), state);
  const op = t.packets.at(-1).ops.find(op => op[0] === 2 && op[1].at(-1) === 'history'); assert.deepEqual(op[3], [{ id: 2, type: 'worldBoss' }]); assert.equal(op.length, 5);
  state.u.history.shift(); state.u.history.push({ id: 3, type: 'stoneFirst' }); assert.deepEqual(t.transmit(state), state);
});
test('revision mismatch requests a full state once; sender resync restores the newest state', () => {
  const t = transport(); t.transmit({ t: 'team', team: { hp: 10 } });
  t.send(t.connection, { t: 'team', team: { hp: 9 } }); // simulate a missing patch
  t.send(t.connection, { t: 'team', team: { hp: 8 } });
  assert.equal(t.receiver.receive(t.packets.at(-1)), null); assert.equal(t.receiver.receive(t.packets.at(-1)), null); assert.deepEqual(t.requests, ['team']);
  t.send.resync(t.connection, 'team'); assert.equal(t.receiver.receive(t.packets.at(-1)).team.hp, 8);
  assert.equal(t.transmit({ t: 'team', team: { hp: 7 } }).team.hp, 7);
  t.receiver.reset(); t.send(t.connection, { t: 'team', team: { hp: 6 } }); assert.equal(t.receiver.receive(t.packets.at(-1)), null);
});
test('failed sends do not advance baselines, periodic full state and legacy clients work', () => {
  const t = transport(); t.transmit({ t: 'trade', open: false }); t.fail(true); assert.equal(t.send(t.connection, { t: 'trade', open: true }), false);
  t.fail(false); assert.deepEqual(t.transmit({ t: 'trade', open: true }), { t: 'trade', open: true }); assert.equal(t.requests.length, 0);
  t.time(32000); t.transmit({ t: 'trade', open: true }); assert.equal(t.packets.at(-1).t, 'trade'); assert.ok(t.packets.at(-1).uiVersion);
  t.connection.uiDeltas = false; t.transmit({ t: 'trade', open: true }); assert.equal(t.packets.at(-1).uiVersion, undefined);
});
test('UI mutation cannot corrupt cached patch state, invalid patches are atomic', () => {
  const t = transport(), state = { t: 'inv', bag: [item('a')], eq: {} };
  const shown = t.transmit(state); shown.bag[0].plus = 99;
  state.bag.push(item('b')); assert.deepEqual(t.transmit(state), state);
  const malformed = { t: 'uiPatch', channel: 'inv', base: t.packets.at(-1).version, version: t.packets.at(-1).version + 1, ops: [[0, ['bag'], []], [0, ['__proto__', 'bad'], 1]] };
  assert.equal(t.receiver.receive(malformed), null); assert.deepEqual(t.requests, ['inv']); assert.equal({}.bad, undefined);
});
test('monster field deltas reconstruct movement, damage, type changes, additions and removals', () => {
  const source = fs.readFileSync(require.resolve('../public/game.js'), 'utf8'), browser = vm.createContext({ I: { tl: ['wolf', 'boar'] }, mo: [] });
  vm.runInContext(source.slice(source.indexOf('const mobRows = new Map()'), source.indexOf('const playerRows = new Map()')), browser);
  const c = { mobDeltas: true, mobFieldDeltas: true }, mobs = [{ id: 1, ty: 'wolf', x: 10, y: 10, hp: 40, mh: 40, lvl: 1 }, { id: 2, ty: 'wolf', x: 20, y: 20, hp: 40, mh: 40, lvl: 1 }];
  const send = rows => { const message = wire(mobSnapshot(c, rows, { wolf: 0, boar: 1 })); browser.updateMobSnapshot(message); return message; };
  send(mobs); mobs[0].x = 11; let message = send(mobs); assert.deepEqual(message.mf, [[1, 2, 11]]); assert.equal(browser.mo[0].x, 11);
  mobs[0].hp = 0; mobs[0].ty = 'boar'; message = send(mobs); assert.deepEqual(message.mf, [[1, 9, 1, 0]]); assert.equal(browser.mo[0].ty, 'boar'); assert.equal(browser.mo[0].hp, 0);
  mobs.push({ id: 3, ty: 'wolf', x: 30, y: 30, hp: 40, mh: 40, lvl: 1 }); send(mobs); assert.equal(browser.mo.length, 3);
  send(mobs.slice(1)); assert.deepEqual(wire(browser.mo.map(row => row.id)), [2, 3]);
  send([]); assert.equal(browser.mo.length, 0);
  const old = { mobDeltas: true }; mobSnapshot(old, mobs, { wolf: 0, boar: 1 }); mobs[0].x++; assert.ok(mobSnapshot(old, mobs, { wolf: 0, boar: 1 }).md);
});
