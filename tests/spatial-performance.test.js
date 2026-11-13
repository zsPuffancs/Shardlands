'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { IndexedEntities, nearby, anyNearby } = require('../src/shared/spatial-index');
const { createSnapshotPublisher, mobSnapshot, snapshotMobs } = require('../src/multiplayer/snapshots');
const { newSk, stats } = require('../src/player/characters');
const { addMap } = require('../src/world/game-world');

test('seeded add/move/replace/remove queries match ordered and unordered brute-force oracles', () => {
  const entities = new IndexedEntities(); let seed = 1234;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let step = 0; step < 2500; step++) {
    const id = random(150), action = random(4);
    if (action === 0) entities.delete(id);
    else if (action === 1 && entities.has(id)) { const entity = entities.get(id); entity.x = random(6000) - 3000; entity.y = random(6000) - 3000; entities.update(entity); }
    else entities.set(id, { id, x: random(6000) - 3000, y: random(6000) - 3000 });
    // Map replacement retains Map insertion priority only for the same object; spatial replacement
    // intentionally appends the replacement as before. Compare membership order, not ID ordering.
    const point = { x: random(6000) - 3000, y: random(6000) - 3000 }, radius = random(1800);
    const oracle = [...entities.values()].filter(e => Math.abs(e.x - point.x) <= radius && Math.abs(e.y - point.y) <= radius).sort((a, b) => entities.spatial.members.get(a).order - entities.spatial.members.get(b).order);
    assert.deepEqual(nearby(entities, point, radius), oracle);
    assert.deepEqual(nearby(entities, point, radius, false).map(e => e.id).sort((a, b) => a - b), oracle.map(e => e.id).sort((a, b) => a - b));
    assert.equal(anyNearby(entities, point, radius, e => e.id % 3 === 0), oracle.some(e => e.id % 3 === 0));
  }
});

test('boolean existence query short-circuits without sorting or materializing all matches', () => {
  const entities = new IndexedEntities(); for (let id = 0; id < 100; id++) entities.set(id, { id, x: 0, y: 0 });
  let visits = 0; assert.equal(anyNearby(entities, { x: 0, y: 0 }, 10, () => { visits++; return true; }), true); assert.equal(visits, 1);
  assert.equal(anyNearby(new Map(entities), { x: 0, y: 0 }, 10, e => e.id === 99), true);
});
test('bounded nearest-mob selection exactly matches full distance/ID sorting in crowds and ties', () => {
  const mobs = new IndexedEntities();
  for (let id = 5000; id > 0; id--) mobs.set(id, { id, x: 6000 + id * 13 % 1000 - 500, y: 6000 + id * 29 % 1000 - 500, dead: id % 13 === 0 });
  for (const player of [{ x: 6000, y: 6000 }, { x: 6100, y: 6200 }, { x: 7000, y: 7000 }]) {
    const distance = mob => Math.abs(mob.x - player.x) + Math.abs(mob.y - player.y);
    const oracle = [...mobs.values()].filter(mob => !mob.dead && Math.abs(mob.x - player.x) < 1150 && Math.abs(mob.y - player.y) < 1150).sort((a, b) => distance(a) - distance(b) || a.id - b.id).slice(0, 420);
    assert.deepEqual(snapshotMobs(mobs, player), oracle);
  }
});

function hero(id, x, y) {
  const p = { id, name: 'P' + id, x, y, c: {}, cls: 'blade', lvl: 10, eq: {}, bag: [], inv: {}, sk: newSk(), buf: {}, xp: 0, gold: 0, cd1: 0, cd2: 0, cd3: 0 };
  stats(p); p.hp = p.maxhp; p.mp = p.maxmp; return p;
}
test('publication cache shares wire rows without sharing connection baselines; events retain source order', () => {
  const players = new IndexedEntities(), mobs = new IndexedEntities(), loot = new IndexedEntities();
  const a = hero(1, 6000, 6000), b = hero(2, 6001, 6000); players.set(1, a); players.set(2, b);
  const mob = { id: 10, ty: 'wolf', x: 6010, y: 6000, hp: 40, mh: 40, lvl: 1 }; mobs.set(10, mob);
  let events = [{ k: 'a', x: 6500, y: 6000 }, { k: 'b', x: 5500, y: 6000 }, { k: 'c', x: 6000, y: 6000 }]; events.push(events[0]);
  const sent = [], publish = createSnapshotPublisher({ players, mobs, loot, drainEvents: () => { const result = events; events = []; return result; }, refreshMobTypes: () => ({ indices: { wolf: 0 } }), canSend: () => true, send: (c, m) => { sent.push([c, m]); return true; } });
  publish([a, b], 1000);
  assert.equal(sent[0][1].mo[0], sent[1][1].mo[0]);
  assert.deepEqual(sent[0][1].mo, mobSnapshot({}, snapshotMobs(mobs, a), { wolf: 0 }).mo);
  assert.deepEqual(sent[0][1].ev.map(e => e.k), ['a', 'b', 'c', 'a']);
  mob.hp = 3; sent.length = 0; publish([a, b], 1050);
  assert.equal(sent[0][1].mo[0][4], 3); assert.deepEqual(sent[0][1].ev, []);
});
test('map-local rows and events cannot leak into a different region, including during transitions', () => {
  const map = addMap(1, { tier: 0 }), players = new IndexedEntities(), mobs = new IndexedEntities(), loot = new IndexedEntities();
  const p = hero(1, map.x0 + 100, map.y0 + 100); players.set(1, p);
  // Just outside the map's column, but within visibility radius.
  const foreign = { id: 9, ty: 'wolf', x: map.x0 - 1, y: 100, hp: 20, mh: 20, lvl: 1 }; mobs.set(9, foreign);
  const own = { ...foreign, id: 10, x: map.x0 + 110 }; mobs.set(10, own);
  const packets = [], publish = createSnapshotPublisher({ players, mobs, loot, drainEvents: () => [{ k: 'foreign', x: foreign.x, y: foreign.y }, { k: 'own', x: own.x, y: own.y }], refreshMobTypes: () => ({ indices: { wolf: 0 } }), canSend: () => true, send: (c, m) => { packets.push(m); return true; } });
  publish([p], 1000); const packet = packets.at(-1); assert.deepEqual(packet.mo.map(row => row[0]), [10]); assert.equal(packet.mo[0][2], 110); assert.deepEqual(packet.ev.map(e => e.k), ['own']);
  p.x = 6000; p.y = 6000; players.update(p); publish([p], 1050); assert.equal(packets.at(-1).me.x, 6000); assert.deepEqual(packets.at(-1).mo, []);
});
