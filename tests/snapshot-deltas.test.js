'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { ownStateDelta, createSnapshotPublisher } = require('../src/multiplayer/snapshots');
const { IndexedEntities } = require('../src/shared/spatial-index');
const { stats, newSk } = require('../src/player/characters');
const { addMap } = require('../src/world/game-world');
const source = fs.readFileSync(require.resolve('../public/game.js'), 'utf8');
const browser = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('const playerRows = new Map()'), source.indexOf('function onMsg(m)')), browser);
const wire = value => JSON.parse(JSON.stringify(value));
function hero(id = 1, x = 6000) {
  const p = { id, name: 'Hero' + id, c: { mobDeltas: true, stateDeltas: true, listDeltas: true }, cls: 'archer', lvl: 10, eq: {}, bag: [], sk: newSk(), buf: {}, inv: { hp: 3, mp: 1 }, sp: 1, xp: 0, gold: 100, x, y: 6000, target: 0, dead: 0, cd1: 0, cd2: 0, cd3: 0 };
  stats(p); p.hp = p.maxhp; p.mp = p.maxmp; return p;
}
function fixture() {
  const players = new IndexedEntities(), mobs = new IndexedEntities(), loot = new IndexedEntities(), observer = hero();
  players.set(observer.id, observer);
  const sent = []; let accepting = true, fail = false;
  const publish = createSnapshotPublisher({ players, mobs, loot, drainEvents: () => [], refreshMobTypes: () => ({ indices: { wolf: 0 } }), canSend: () => accepting, send: (connection, message) => {
    if (fail) return false;
    if (connection === observer.c) sent.push(wire(message)); return true;
  } });
  return { players, mobs, loot, observer, sent, tick(now = 1000) { publish([...players.values()], now); return sent.filter(m => m.t === 's').at(-1); }, block(value) { accepting = !value; }, fail(value) { fail = value; } };
}
test('every own-state field uses a delta, including zero values and cleared nested objects', () => {
  const c = {}, state = { x: 1, hp: 100, g: 5, tg: 9, dead: 0, inv: { hp: 3 }, sk: { s1: 1 }, buf: { atk: 1000 } };
  const first = wire(ownStateDelta(c, { ...state })); assert.deepEqual(first, state);
  assert.deepEqual(ownStateDelta(c, { ...state }), {});
  state.inv.hp = 0; state.buf = {}; state.g = 0; state.tg = 0; state.dead = 5000;
  const patch = wire(ownStateDelta(c, { ...state })); assert.deepEqual(Object.keys(patch).sort(), ['inv', 'buf', 'g', 'tg', 'dead'].sort());
  const reconstructed = wire(browser.applyOwnSnapshot(first, { me: patch })); assert.deepEqual(reconstructed, state);
  const reset = wire(browser.applyOwnSnapshot(reconstructed, { sf: 1, me: { hp: 50 } })); assert.deepEqual(reset, { hp: 50 });
});
test('loot additions, replacements, ownership changes, expiry and deletion round-trip through the client', () => {
  const f = fixture(), cache = new Map(); const apply = message => wire(browser.applyEntityList(cache, message, 'lo', 'ld', 'lr'));
  assert.deepEqual(apply(f.tick()), []);
  const drop = { id: 10, x: 6001, y: 6000, kind: 'gold', name: 'gold', exp: 100000, owner: 0 };
  f.loot.set(10, drop); let message = f.tick(1050); assert.equal(message.lo, undefined); assert.equal(apply(message)[0].id, 10);
  assert.equal(f.tick(1100).ld, undefined);
  drop.name = 'changed'; assert.equal(apply(f.tick(1150))[0].n, 'changed');
  drop.owner = 99; drop.free = 2000; assert.deepEqual(apply(f.tick(1200)), []);
  assert.equal(apply(f.tick(2000))[0].id, 10);
  drop.exp = 2000; assert.deepEqual(apply(f.tick(2050)), []);
  drop.exp = 100000; assert.equal(apply(f.tick(2100))[0].id, 10);
  f.loot.delete(10); assert.deepEqual(apply(f.tick(2150)), []);
});
test('near players update at 20 Hz, far movement at 5 Hz, urgent state and removals immediately', () => {
  const f = fixture(), near = hero(2, 6200), far = hero(3, 7000), cache = new Map();
  f.players.set(2, near); f.players.set(3, far);
  const apply = m => wire(browser.applyEntityList(cache, m, 'pl', 'pd', 'pr'));
  apply(f.tick()); near.x++; far.x++; let message = f.tick(1050);
  assert.deepEqual(message.pd.map(row => row.id), [2]); apply(message); assert.equal(cache.get(3).x, 7000);
  far.x++; message = f.tick(1200); assert.equal(message.pd.find(row => row.id === 3).x, 7002); apply(message);
  far.hp--; message = f.tick(1250); assert.equal(message.pd[0].hp, far.hp); apply(message);
  far.dead = 10000; assert.equal(f.tick(1300).pd[0].d, 1);
  far.x = 6300; f.players.update(far); assert.equal(f.tick(1350).pd[0].x, 6300);
  far.x = 8000; f.players.update(far); message = f.tick(1400); assert.deepEqual(message.pr, [3]); apply(message); assert.ok(!cache.has(3));
  f.players.delete(2); message = f.tick(1450); assert.deepEqual(message.pr, [2]); apply(message); assert.equal(cache.size, 0);
  f.players.set(3, hero(3, 7100)); assert.equal(f.tick(1500).pd[0].id, 3);
});
test('map changes, periodic baselines, blocked and failed sends force complete snapshots', () => {
  const f = fixture(); assert.equal(f.tick().sf, 1); assert.equal(f.tick(1050).sf, undefined);
  assert.equal(f.tick(11000).sf, 1);
  f.block(true); f.tick(11050); f.block(false); assert.equal(f.tick(11100).sf, 1);
  f.fail(true); f.tick(11150); f.fail(false); assert.equal(f.tick(11200).sf, 1);
  addMap(1, { tier: 0 }); f.observer.x = 18500; f.observer.y = 2500; f.players.update(f.observer);
  const moved = f.tick(11250); assert.equal(moved.sf, 1); assert.equal(moved.me.x, 2500); assert.ok(moved.me.inv); assert.deepEqual(moved.pl, []); assert.deepEqual(moved.lo, []); assert.ok(Array.isArray(moved.mo));
});
test('legacy clients retain full own-state and player/loot lists', () => {
  const f = fixture(); f.observer.c.stateDeltas = false; f.observer.c.listDeltas = false; f.observer.c.meDeltas = false;
  f.tick(); const message = f.tick(1050); assert.ok(message.me.inv); assert.equal(message.me.g, 100); assert.deepEqual(message.pl, []); assert.deepEqual(message.lo, []); assert.equal(message.sf, undefined);
});
test('unchanged and changing own-state reconstruct exactly across many snapshots', () => {
  const f = fixture(); let state = null;
  for (let i = 0; i < 100; i++) {
    if (i % 5 === 0) f.observer.gold++;
    if (i % 7 === 0) f.observer.inv.hp++;
    f.observer.x += 1;
    if (i === 20) f.observer.buf.atk = 9000;
    if (i === 70) delete f.observer.buf.atk;
    const message = f.tick(1000 + i * 50); state = wire(browser.applyOwnSnapshot(state, message));
    const c = f.observer.c; c.stateDeltas = false; c.meDeltas = false;
    const full = f.tick(1000 + i * 50).me; c.stateDeltas = true;
    assert.deepEqual(state, full);
  }
});
