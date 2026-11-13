'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createSummons, canMonsterAttack } = require('../src/combat/summons');
const { createCombat } = require('../src/combat/combat');
const { createSimulation } = require('../src/combat/simulation');
const { stats, newSk } = require('../src/player/characters');
const noop = () => {};
function fixture(t) {
  let now = 10000, id = 0; t.mock.method(Date, 'now', () => now);
  const mobs = new Map(), source = { id: 99, tier: 0, x: 6100, y: 6000, stoneStep: 5 };
  const summons = createSummons({ mobs, spawnMob: (ty, x, y, tier, options = {}) => {
    const m = { id: ++id, ty, x, y, sx: x, sy: y, hx: x, hy: y, tier, alpha: !!options.alpha, lvl: 10, hp: 10000, mh: 10000, r: 14, dmg: 10, cd: 0, wake: 0, dead: 0 };
    mobs.set(m.id, m); return m;
  } });
  const p = { id: 1, name: 'Hero', cls: 'blade', lvl: 10, x: 6000, y: 6000, eq: {}, bag: [], inv: {}, sk: newSk(), buf: {}, dir: { x: 0, y: 0 }, cd: Infinity };
  stats(p); p.hp = p.maxhp; p.mp = p.maxmp;
  const players = new Map([[1, p]]), combat = createCombat({ mobs, players, rates: { monsterDamage: 1 }, spawnMob: noop, ev: noop, fire: noop, gainXp: noop, dropLoot: noop, broadcast: noop, say: noop });
  const wave = (stage = 4) => summons.spawnBatch(source, [false, true].map(alpha => ({ type: 'wolf', x: 6100, y: 6000, options: { alpha } })), { kind: 'stone', stage });
  return { mobs, players, p, source, summons, combat, wave, time: value => { now = value; } };
}
test('normal and Alpha guardians have individual 1200ms deadlines, preserved across consecutive waves', t => {
  const f = fixture(t), first = f.wave(); assert.equal(first.length, 2);
  assert.deepEqual(first.map(m => m.summonKind), ['stoneGuardian', 'stoneAlphaGuardian']);
  for (const m of first) { assert.equal(m.attackReadyAt, 11200); assert.equal(canMonsterAttack(m, 11199), false); assert.equal(canMonsterAttack(m, 11200), true); }
  f.time(10500); const second = f.wave(3);
  assert.ok(second.length); assert.ok(second.every(m => m.attackReadyAt === 11700)); assert.ok(first.every(m => m.attackReadyAt === 11200));
});
test('both guardian types acquire targets and move, but melee starts exactly at the deadline', t => {
  const f = fixture(t), guardians = f.wave(), hits = [];
  for (const m of guardians) m.x = 6070; // Inside the normal wolf's 85-unit aggro range.
  const simulation = createSimulation({ players: f.players, mobs: f.mobs, loot: new Map(), rates: { monsterDamage: 1 }, respawnMonster: noop, hitMob: noop,
    hurtPlayer: (p, m) => hits.push(m.id), startCast: noop, resolveCast: noop, pickupTick: noop, ev: noop, fire: noop, publishSnapshots: noop, getTransportStats: () => ({}) });
  simulation.tick(); assert.ok(guardians.every(m => m.target === 1 && m.x < 6070)); assert.deepEqual(hits, []);
  for (const m of guardians) m.x = 6001;
  f.time(11199); simulation.tick(); assert.deepEqual(hits, []); assert.ok(guardians.every(m => m.cd === 0));
  f.time(11200); simulation.tick(); assert.deepEqual(hits, guardians.map(m => m.id));
});
test('guardians receive player damage during the initial delay', t => {
  const f = fixture(t); for (const m of f.wave()) { const before = m.hp; f.combat.hitMob(f.p, m, 10); assert.ok(m.hp < before); assert.equal(m.attackReadyAt, 11200); }
});
test('central damage and special attack resolution cannot bypass the guardian delay', t => {
  const f = fixture(t);
  for (const m of f.wave()) {
    const hp = f.p.hp; m.x = 6001;
    f.combat.hurtPlayer(f.p, m, 10, 11199); assert.equal(f.p.hp, hp);
    f.combat.startCast(m, f.p, 1, 11199); assert.equal(m.cast, undefined);
    m.cast = { s: 'slam', at: 10000, r: 200 };
    f.combat.resolveCast(m, [f.p], 11199); assert.ok(m.cast); assert.equal(f.p.hp, hp);
    f.combat.resolveCast(m, [f.p], 11200); assert.equal(m.cast, null); assert.ok(f.p.hp < hp);
  }
});
test('natural monsters, boss summons and World Bosses keep their existing immediate attack behavior', t => {
  const f = fixture(t), boss = f.summons.spawnBatch(f.source, [{ type: 'wolf', x: 6001, y: 6000 }])[0];
  assert.equal(boss.summonKind, 'bossSummon'); assert.equal(boss.attackReadyAt, undefined);
  for (const m of [boss, { id: 20, ty: 'wolf' }, { id: 21, ty: 'deathlord', worldBoss: true }]) {
    m.attackReadyAt = 999999; assert.equal(canMonsterAttack(m, 10000), true);
    const before = f.p.hp; f.combat.hurtPlayer(f.p, m, 1, 10000); assert.ok(f.p.hp < before);
  }
});
