'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BASE_PLAYER_MOVE_SPEED, MAX_PLAYER_MOVE_SPEED, playerMoveSpeed, newSk, stats } = require('../src/player/characters');
const { maps, addMap, mapOf, clampWorld } = require('../src/world/game-world');
const { createSimulation } = require('../src/combat/simulation');
const { createPlayerSessions } = require('../src/player/player-session');
const { createCombat } = require('../src/combat/combat');
const noop = () => {};
function player(x, y) {
  const p = { id: 1, cls: 'archer', lvl: 100, eq: {}, sk: newSk(), buf: {}, x, y, dir: { x: 0, y: 0 }, target: 0, cd: 0 };
  stats(p); p.hp = p.maxhp; p.mp = p.maxmp; return p;
}
function simulate(p) { return createSimulation({ players: new Map([[1, p]]), mobs: new Map(), loot: new Map(), rates: {}, respawnMonster: noop, hitMob: noop, hurtPlayer: noop, startCast: noop, resolveCast: noop, pickupTick: noop, ev: noop, fire: noop, publishSnapshots: noop, getTransportStats: () => ({}) }); }
test('base movement stays 190 and combined gear/passive/elixir bonuses never exceed 400', () => {
  const p = player(6000, 6000), now = Date.now(); assert.equal(playerMoveSpeed(p, now), BASE_PLAYER_MOVE_SPEED);
  p.buf.spd = now + 1000; assert.equal(playerMoveSpeed(p, now), 256.5);
  p.sk.swift = 99; p.g.spd = 60; assert.equal(playerMoveSpeed(p, now), MAX_PLAYER_MOVE_SPEED);
  p.g.spd = 100000; assert.equal(playerMoveSpeed(p, now), 400);
  p.dir = { x: 1, y: 1 }; const before = { x: p.x, y: p.y }; simulate(p).tick(); assert.ok(Math.hypot(p.x - before.x, p.y - before.y) <= 400 * .05 + 1e-9); assert.equal(p.spdNow, 400);
});
test('all four walls and corners retain their original map at maximum speed', () => {
  for (const map of [maps[0], addMap(1, { tier: 7 }), addMap(32, { tier: 8 })]) {
    const minX = map.x0 + 20, maxX = map.x0 + map.w - 20, minY = map.y0 + 20, maxY = map.y0 + map.h - 20;
    for (const direction of [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: -1 }, { x: 1, y: 1 }]) {
      const p = player(direction.x < 0 ? minX : direction.x > 0 ? maxX : map.cx, direction.y < 0 ? minY : direction.y > 0 ? maxY : map.cy);
      p.sk.swift = 99; p.g.spd = 60; p.buf.spd = Date.now() + 60000; p.dir = direction;
      const sim = simulate(p); for (let i = 0; i < 20; i++) sim.tick();
      assert.equal(mapOf(p), map); assert.ok(p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
    }
  }
});
test('explicit source-map clamping survives overshoot into a neighboring cell', () => {
  for (const index of [1, 32]) {
    const map = maps[index], p = { x: map.x0 - 500, y: map.y0 - 500 }; clampWorld(p, map);
    assert.equal(p.x, map.x0 + 20); assert.equal(p.y, map.y0 + 20); assert.equal(mapOf(p), map);
  }
});
test('out-of-bounds click destinations clamp inside the current map', () => {
  const map = maps[1], p = player(map.cx, map.cy), connection = { p };
  const sessions = createPlayerSessions({ config: { admins: [] }, players: new Map([[1, p]]), mobs: new Map() });
  sessions.handleMessage(connection, { t: 'move', x: -100000, y: 100000 });
  assert.deepEqual(p.dest, { x: map.x0 + 20, y: map.y0 + map.h - 20 }); assert.equal(mapOf(p), map);
});
test('boss charges aimed past a generated map edge remain in that map', () => {
  const map = maps[1], boss = { id: 2, ty: 'alphawolf', x: map.x0 + 30, y: 2000, r: 24, alt: false };
  const target = player(map.x0 + 20, 2000);
  const combat = createCombat({ mobs: new Map(), players: new Map([[1, target]]), rates: {}, spawnMob: noop, ev: noop, fire: noop, gainXp: noop, dropLoot: noop, broadcast: noop, say: noop });
  combat.startCast(boss, target, 10, Date.now()); assert.equal(boss.cast.s, 'charge'); assert.equal(boss.cast.tx, map.x0 + 20); assert.equal(mapOf({ x: boss.cast.tx, y: boss.cast.ty }), map);
});
