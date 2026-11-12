'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { IndexedEntities, nearby } = require('../src/shared/spatial-index');
const { playerStateDelta, snapshotMobs, createSnapshotPublisher } = require('../src/multiplayer/snapshots');
const { createLoot } = require('../src/economy/loot');
const { createSimulation } = require('../src/combat/simulation');
const { createCombat } = require('../src/combat/combat');
const { newSk, stats, CLASSES } = require('../src/player/characters');
const { MOBTYPES } = require('../src/combat/monsters');
const noop = () => {};
function hero(id = 1, x = 6000, y = 6000) {
  const player = { id, name: 'Hero' + id, c: {}, cls: 'archer', lvl: 10, eq: {}, bag: [], cd1: 0, cd2: 0, cd3: 0, sk: newSk(), buf: {}, inv: { hp: 1 }, sp: 1, xp: 0, gold: 0, x, y, dir: { x: 0, y: 0 }, target: 0, cd: 0 };
  stats(player); player.hp = player.maxhp; player.mp = player.maxmp; return player;
}
function monster(id, x = 6000, y = 6000, type = 'wolf') {
  return { id, x, y, sx: x, sy: y, hx: x, hy: y, ty: type, r: 14, hp: 40, mh: 40, lvl: 1, dmg: 4, xp: 1, tier: 0, wake: 0, awake: false, target: 0, dead: 0, stoneStep: 5 };
}
function simulation(players, mobs, extra = {}) {
  return createSimulation({ players, mobs, loot: new Map(), rates: { monsterDamage: 1 }, respawnMonster: m => { m.dead = 0; }, hitMob: noop, hurtPlayer: noop, startCast: noop, resolveCast: m => { m.cast = null; }, pickupTick: noop, ev: noop, fire: noop, publishSnapshots: noop, getTransportStats: () => ({}), ...extra });
}
test('spatial queries match brute force at boundaries, after moves and deletes', () => {
  const entities = new IndexedEntities();
  for (let i = 0; i < 2000; i++) entities.set(i, { id: i, x: (i * 797) % 18000 - 1000, y: (i * 337) % 18000 - 1000 });
  for (const radius of [0, 58, 600, 1150, 1700]) for (const point of [{ x: 0, y: 0 }, { x: 600, y: -600 }, { x: 16000, y: 100 }]) {
    assert.deepEqual(nearby(entities, point, radius).map(e => e.id), [...entities.values()].filter(e => Math.abs(e.x - point.x) <= radius && Math.abs(e.y - point.y) <= radius).map(e => e.id));
  }
  const e = entities.get(1); e.x = e.y = 0; entities.update(e); assert.ok(nearby(entities, e, 0).includes(e));
  entities.delete(1); assert.ok(!nearby(entities, e, 0).includes(e)); entities.clear(); assert.equal(entities.spatial.members.size, 0); assert.equal(entities.spatial.cells.size, 0);
});
test('indexed monster snapshots preserve range, dead filtering and limit', () => {
  const mobs = new IndexedEntities(); for (let i = 0; i < 700; i++) mobs.set(i, { ...monster(i, 6000 + i, 6000), dead: i % 10 === 0 ? 1 : 0 });
  assert.deepEqual(snapshotMobs(mobs, hero()).map(m => m.id), snapshotMobs(new Map(mobs), hero()).map(m => m.id));
});
test('player state delta catches in-place edits, replacement and deleted keys', () => {
  const c = {}, p = { inv: { hp: 1 }, sk: { s1: 1 } };
  assert.deepEqual(playerStateDelta(c, { ...p }).inv, p.inv);
  assert.equal(playerStateDelta(c, { ...p }).inv, undefined);
  p.inv.hp--; assert.equal(playerStateDelta(c, { ...p }).inv.hp, 0);
  delete p.inv.hp; assert.deepEqual(playerStateDelta(c, { ...p }).inv, {});
  assert.equal(playerStateDelta(c, { inv: {}, sk: { s1: 1 } }).sk, undefined);
});
test('pickup preserves protection, first-player priority, full bags and expiry', () => {
  const players = new IndexedEntities(), loot = new IndexedEntities(); const first = hero(), second = hero(2); players.set(1, first); players.set(2, second); let id = 0;
  const service = createLoot({ players, loot, allocateId: () => ++id, rates: {}, ev: noop, say: noop, toast: noop, broadcast: noop, addGear: () => false });
  const now = Date.now();
  service.dropAt(6000, 6000, { kind: 'gold', v: 10 }, 2); service.pickupTick(now); assert.equal(first.gold, 0); assert.equal(second.gold, 10);
  service.dropAt(6000, 6000, { kind: 'gold', v: 5 }, 0); service.pickupTick(now); assert.equal(first.gold, 5);
  const gear = service.dropAt(6000, 6000, { kind: 'gear', item: {} }, 0); service.pickupTick(now); assert.ok(loot.has(gear.id));
  const exp = service.dropAt(6000, 6000, { kind: 'gold', v: 100, exp: now - 1 }, 0); service.pickupTick(now); assert.ok(!loot.has(exp.id)); assert.equal(first.gold, 5);
  players.delete(2); service.dropAt(6000, 6000, { kind: 'gold', v: 7 }, 2); service.pickupTick(now); assert.equal(first.gold, 12);
});
test('AI uses local candidates and retains returning monsters and pending casts', () => {
  const players = new IndexedEntities(), mobs = new IndexedEntities(), p = hero(); players.set(1, p);
  const local = monster(1, 6030), distant = monster(2, 19000); mobs.set(1, local); mobs.set(2, distant);
  let reads = 0; Object.defineProperty(distant, 'ty', { get() { reads++; return 'wolf'; } });
  const sim = simulation(players, mobs); sim.tick(); assert.equal(local.target, 1); assert.equal(reads, 0);
  local.target = 0; local.awake = true; local.hp = 20; local.hx = 6200;
  p.x = 19000; players.update(p); const before = local.x; sim.tick(); assert.notEqual(local.x, before);
  local.cast = { at: 0 }; let casts = 0; const other = simulation(players, mobs, { resolveCast: m => { casts++; m.cast = null; } }); other.tick(); assert.equal(casts, 1);
});
test('distant lifecycle checks expire summons and respawn monsters without players', () => {
  const mobs = new IndexedEntities(), dead = monster(1, 19000), summon = monster(2, 19000);
  dead.dead = Date.now() - 100; summon.expiresAt = Date.now() - 100; mobs.set(1, dead); mobs.set(2, summon);
  simulation(new IndexedEntities(), mobs).tick(); assert.equal(dead.dead, 0); assert.ok(!mobs.has(2));
});
test('distant stones sleep while a local stone still warns and resolves its pulse', () => {
  const players = new IndexedEntities(), mobs = new IndexedEntities(), p = hero(); players.set(1, p);
  const stoneType = Object.keys(MOBTYPES).find(k => MOBTYPES[k].stone), local = monster(1, 6010, 6000, stoneType), far = monster(2, 19000, 6000, stoneType);
  local.stoneStep = far.stoneStep = 4; mobs.set(1, local); mobs.set(2, far);
  const events = []; const sim = simulation(players, mobs, { ev: (...args) => events.push(args), hurtPlayer: () => events.push(['hurt']) });
  sim.tick(); assert.ok(local.cast); assert.equal(far.cast, undefined);
  local.cast.at = 0; sim.tick(); assert.ok(events.some(e => e[0] === 'hurt'));
});
test('skill queries preserve nearest targets and mana costs', () => {
  const p = hero(), mobs = new IndexedEntities(); for (let i = 1; i <= 6; i++) mobs.set(i, { ...monster(i, 6000 + i * 20), hp: 100000, mh: 100000 }); mobs.set(99, monster(99, 19000));
  const hits = []; const combat = createCombat({ players: new Map([[1, p]]), mobs, teams: { monsterScale: () => 1 }, rates: {}, ev: noop, fire: (name, player, m) => { if (name === 'damage') hits.push(m.id); }, gainXp: noop, dropLoot: noop, spawnMob: noop, broadcast: noop, say: noop });
  const mana = p.mp; combat.skill(p, 1); assert.deepEqual(hits, [1, 2, 3]); assert.equal(p.mp, mana - CLASSES.archer.s1c);
});
test('network publisher keeps inventory deltas optional and filters far/protected loot', () => {
  const mobs = new IndexedEntities(), loot = new IndexedEntities(), p = hero(), messages = [];
  p.c.meDeltas = true;
  loot.set(1, { id: 1, x: 6000, y: 6000, exp: Date.now() + 10000, kind: 'gold', owner: 2, free: Date.now() + 10000 });
  loot.set(2, { id: 2, x: 19000, y: 6000, exp: Date.now() + 10000 });
  const publish = createSnapshotPublisher({ mobs, loot, drainEvents: () => [], refreshMobTypes: () => ({ indices: {} }), send: (c, m) => messages.push(m), canSend: () => true });
  publish([p], Date.now()); publish([p], Date.now()); assert.ok(messages[0].me.inv); assert.equal(messages[1].me.inv, undefined); assert.deepEqual(messages[0].lo, []);
  p.c.meDeltas = false; publish([p], Date.now()); assert.ok(messages.at(-1).me.inv);
});

test('overloaded simulation sheds only alternate snapshots and reports overruns', () => {
  const original = process.hrtime.bigint; let index = 0, publications = 0;
  const values = [0n, 60000000n, 65000000n, 100000000n, 160000000n, 165000000n];
  try {
    process.hrtime.bigint = () => values[index++];
    const sim = simulation(new IndexedEntities(), new IndexedEntities(), { publishSnapshots: () => publications++ });
    sim.tick(); assert.equal(publications, 0); sim.tick(); assert.equal(publications, 1);
    const status = sim.serverStats(); assert.equal(status.tickOverruns, 2); assert.equal(status.snapshotsSkipped, 1);
  } finally { process.hrtime.bigint = original; }
});
