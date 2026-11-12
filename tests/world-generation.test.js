'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { generateRegion, createUniverse, seededRandom } = require('../src/world/universe');
const { TIERS, createMonsterSpawner } = require('../src/combat/monsters');
const { stream, sampleAnnulus, generateSpawnPlan, validateSpawnPlan, normalizeBudgets, HARD_BUDGETS } = require('../src/world/world-generation');
const { createEncounterRuntime } = require('../src/world/encounter-runtime');
const { IndexedEntities } = require('../src/shared/spatial-index');
const fixtures = require('./fixtures/generation-v1.json');
const area = { x0: 0, y0: 0, w: 5000, h: 5000, cx: 2500, cy: 2500 };
const zone = { outer: true, generated: true, min: 400, max: 99999, types: ['wolf', 'boar'], bosses: ['wb8'], worldBoss: 'wb8', count: 260, stones: 32, stone: 'stone', alphas: 8, lv: [60, 70] };
const plan = (seed = 'test', extra = {}) => generateSpawnPlan({ seed, tier: 8, zone, area, ...extra });
function universe(data = {}, config = {}) { return createUniverse({ store: { data, save: async () => {} }, config, isAdmin: () => false, messageText: () => '', broadcast: () => {} }); }
test('v1 descriptors and all founding spawn coordinates retain pre-audit golden hashes', () => {
  for (const fixture of fixtures) {
    assert.deepEqual([1, 3, 7, 8, 20, 1000].map(tier => generateRegion(fixture.seed, tier, { elements: { fire: 2, void: 5 } }, 1)), fixture.regions);
    const mobs = new Map(); let id = 0;
    const spawner = createMonsterSpawner({ mobs, rates: { monsterHp: 1.6, deathZoneMonsters: 1800 }, world: { width: 10600, height: 10600, centerX: 5300, centerY: 5300 }, allocateId: () => ++id, rnd: (a, b) => (a + b) / 2, rint: a => a, pick: values => values[0] });
    spawner.populateMonsters(seededRandom(fixture.seed, 'spawns'));
    const rows = [...mobs.values()].map(m => [m.ty, m.x, m.y, m.tier, m.alpha]);
    assert.equal(mobs.size, fixture.count); assert.equal(crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex'), fixture.layoutSha256);
  }
});
test('existing unversioned saves pin v1; new universes use v2 and freeze generation settings', () => {
  const old = universe({}, { worldSeed: 'old', generatorVersion: 1 }).state; delete old.generatorVersion;
  assert.equal(universe(old).state.generatorVersion, 1);
  const fresh = universe({}, { worldSeed: 'new', worldGeneration: { budgets: { monsters: 100 } } }); assert.equal(fresh.state.generatorVersion, 2);
  const saved = JSON.parse(JSON.stringify(fresh.state)); assert.deepEqual(universe(saved, { worldGeneration: { budgets: { monsters: 600 } } }).state.generationSettings.budgets, { monsters: 100 });
});
test('v2 plans are reproducible, serializable and do not use Math.random', () => {
  const original = Math.random; Math.random = () => { throw Error('Unseeded random'); };
  try {
    const a = plan('stable'), b = plan('stable'); assert.deepEqual(a, b); assert.deepEqual(a, JSON.parse(JSON.stringify(a)));
    assert.notDeepEqual(a, plan('different')); assert.deepEqual(generateRegion('stable', 20, {}, 2), generateRegion('stable', 20, {}, 2));
  } finally { Math.random = original; }
});
test('independent purpose streams and canonical family order isolate unrelated changes', () => {
  const a = plan('streams'), b = plan('streams', { budgets: { resources: 20 } }), c = plan('streams', { zone: { ...zone, types: [...zone.types].reverse() } });
  assert.deepEqual(a.spawns, b.spawns); assert.deepEqual(a.spawns, c.spawns);
  const first = stream('x|y', 8, 2, 'bosses'), second = stream('x', 8, 2, 'y|bosses'); assert.notEqual(first(), second());
});
test('area-uniform sampler passes predeclared KS and angular chi-square thresholds', () => {
  const random = stream('distribution-test', 1, 2, 'samples'), n = 50000, values = [], angles = Array(12).fill(0), min = 400, max = 1250;
  for (let i = 0; i < n; i++) { const p = sampleAnnulus(random, 0, 0, min, max), radius2 = p.x * p.x + p.y * p.y; values.push((radius2 - min * min) / (max * max - min * min)); angles[Math.min(11, Math.floor((Math.atan2(p.y, p.x) + Math.PI) / (2 * Math.PI) * 12))]++; }
  values.sort((a, b) => a - b); let d = 0; values.forEach((value, i) => { d = Math.max(d, (i + 1) / n - value, value - i / n); });
  const chi2 = angles.reduce((sum, count) => sum + (count - n / 12) ** 2 / (n / 12), 0);
  assert.ok(d < 1.95 / Math.sqrt(n), 'KS D=' + d); assert.ok(chi2 < 31.264, 'angular chi-square=' + chi2);
});
test('spacing, protected wilderness, boundaries, budgets and boss paths validate', () => {
  const p = plan('constraints', { protectedAreas: [{ id: 'wilderness', x: 1000, y: 1000, radius: 300 }] });
  assert.deepEqual(validateSpawnPlan(p).errors, []); assert.equal(p.encounters.filter(e => e.kind === 'boss').length, 1);
  assert.ok(p.spawns.some(s => s.type === 'wb8'));
  for (const spawn of p.spawns) assert.ok(Number.isFinite(spawn.x) && Number.isFinite(spawn.y));
  const damaged = structuredClone(p); damaged.encounters[1].x = damaged.encounters[0].x; damaged.encounters[1].y = damaged.encounters[0].y; assert.equal(validateSpawnPlan(damaged).valid, false);
});
test('budgets clamp extreme inputs; tier extremes remain finite without tier-sized allocations', () => {
  const budgets = normalizeBudgets({ monsters: 1e30, stones: -10, alphas: Infinity, bosses: NaN }); assert.equal(budgets.monsters, HARD_BUDGETS.monsters); assert.equal(budgets.stones, 0);
  for (const tier of [8, 1000, 1000000, Number.MAX_SAFE_INTEGER]) {
    const region = generateRegion('extreme', tier, { elements: { fire: 1e30 } }, 2); assert.ok(region.levels.every(level => Number.isFinite(level) && level <= 10000));
    assert.equal(validateSpawnPlan(plan('extreme-' + tier, { tier })).valid, true);
  }
  const state = universe().state; state.worldTier = Number.MAX_SAFE_INTEGER; state.regions = {}; assert.ok(Object.keys(universe(state).state.regions).length <= 8);
  for (const tier of [0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => generateRegion('invalid', tier, {}, 2), RangeError);
  assert.throws(() => generateRegion('invalid', 8, {}, 3), RangeError);
});
test('v2 summaries exclude persistent spawn definitions and live state', () => {
  const u = universe(); u.regionFor(1).spawnPlan = { huge: true }; u.regionFor(1).spawnState = { health: 1 };
  assert.ok(!JSON.stringify(u.summary()).includes('spawnPlan')); assert.ok(!JSON.stringify(u.summary()).includes('spawnState'));
});
test('encounter activation obeys global/map caps and restores wounded/dead state after unload', () => {
  const players = new IndexedEntities(), mobs = new IndexedEntities(), saved = {}; let id = 0, loads = 0;
  const map = require('../src/world/game-world').maps[0];
  const definition = { encounters: [{ id: 'camp:0', x: 6000, y: 6000, spawnIds: ['a', 'b', 'c'] }], spawns: ['a', 'b', 'c'].map(id => ({ id, encounterId: 'camp:0', x: 6000, y: 6000, type: 'wolf', level: 1 })) };
  const runtime = createEncounterRuntime({ players, mobs, maxActive: 2, maxPerMap: 2, unloadAfterMs: 0, spawnMob: (ty, x, y, tier, options) => { const m = { id: ++id, ty, x, y, hp: 100, mh: 100, stoneStep: 5, dead: 0 }; mobs.set(m.id, m); return m; } });
  runtime.register({ id: 1, map, zoneIndex: 0, min: 400, max: 1250, loadPlan: () => { loads++; return definition; }, storage: () => saved });
  runtime.tick(1000); assert.equal(loads, 0); assert.equal(mobs.size, 0);
  players.set(1, { id: 1, x: 6000, y: 6000 }); runtime.tick(1500); assert.equal(loads, 1); assert.equal(mobs.size, 2);
  const [a, b] = [...mobs.values()]; a.hp = 50; a.stoneStep = 3; b.hp = 0; b.dead = 10000; runtime.checkpoint();
  players.clear(); runtime.tick(2000); assert.equal(mobs.size, 0); assert.equal(saved.a.health, .5); assert.equal(saved.b.deadUntil, 10000);
  players.set(1, { id: 1, x: 6000, y: 6000 }); runtime.tick(2500); const reloaded = [...mobs.values()]; assert.equal(reloaded[0].hp, 50); assert.equal(reloaded[0].stoneStep, 3); assert.equal(reloaded[1].dead, 10000); assert.equal(mobs.size, 2);
});

test('thousands of registered regions remain dormant without generating or instantiating them', () => {
  const { maps, addMap } = require('../src/world/game-world'), players = new IndexedEntities(), mobs = new IndexedEntities(); let loads = 0, id = 0;
  const runtime = createEncounterRuntime({ players, mobs, maxActive: 1, maxPerMap: 1, spawnMob: (ty, x, y) => { const monster = { id: ++id, ty, x, y, hp: 100, mh: 100 }; mobs.set(monster.id, monster); return monster; } });
  for (let i = 1; i <= 1000; i++) {
    const map = addMap(i, {}), state = {};
    runtime.register({ id: i, map, zoneIndex: 0, min: 400, max: 99999, outer: true, loadPlan: () => { loads++; return { encounters: [{ id: 'camp', x: 3000, y: 2500, spawnIds: ['a'] }], spawns: [{ id: 'a', encounterId: 'camp', x: 3000, y: 2500, type: 'wolf', level: 1 }] }; }, storage: () => state });
  }
  runtime.tick(1000); assert.equal(loads, 0); assert.equal(mobs.size, 0);
  players.set(1, { id: 1, x: maps[500].cx, y: maps[500].cy }); runtime.tick(1500); assert.equal(loads, 1); assert.equal(mobs.size, 1);
  maps.splice(1);
});
test('generation failure is isolated and rate-limited without deleting saved state', () => {
  const players = new IndexedEntities(), mobs = new IndexedEntities(), errors = [], saved = { a: { health: .5 } }; players.set(1, { id: 1, x: 6000, y: 6000 });
  const runtime = createEncounterRuntime({ players, mobs, spawnMob: () => {}, onError: error => errors.push(error) });
  runtime.register({ id: 1, map: require('../src/world/game-world').maps[0], min: 400, max: 1250, loadPlan: () => { throw Error('invalid plan'); }, storage: () => saved });
  assert.doesNotThrow(() => runtime.tick(1000)); runtime.tick(1500); assert.equal(errors.length, 1); assert.deepEqual(saved, { a: { health: .5 } });
});
test('v2 frontier activation reproduces exact spawn definitions, levels and health after restart', () => {
  const { createRegions } = require('../src/world/regions'), { maps } = require('../src/world/game-world');
  function setup(data) {
    maps.splice(1); TIERS.splice(7);
    const u = universe(data || {}, { worldSeed: 'restart-proof' }); u.state.worldTier = 8; u.regionFor(8);
    const players = new IndexedEntities(), mobs = new IndexedEntities(); let id = 0;
    const spawner = createMonsterSpawner({ mobs, rates: { monsterHp: 1.6 }, world: { width: 10600, height: 10600, centerX: 5300, centerY: 5300 }, allocateId: () => ++id, rnd: () => { throw Error('unseeded runtime generation'); }, rint: () => { throw Error('unseeded level'); }, pick: () => { throw Error('unseeded type'); } });
    const noop = () => {}, regions = createRegions({ universe: u, players, mobs, spawnMob: spawner.spawnMob, populateZone: () => { throw Error('legacy population used by v2'); }, refreshMobTypes: () => ({ types: [] }), send: noop, say: noop, ev: noop });
    regions.openUnlockedRegions(); assert.equal(mobs.size, 0);
    players.set(1, { id: 1, x: maps[1].cx, y: maps[1].cy }); regions.tick(1000);
    return { u, regions, mobs };
  }
  const first = setup(); assert.ok(first.mobs.size > 0); const wounded = [...first.mobs.values()][0]; wounded.hp *= .5;
  first.regions.checkpoint(); const saved = JSON.parse(JSON.stringify(first.u.state)), plan = JSON.stringify(saved.regions[8].spawnPlan);
  const rows = game => [...game.mobs.values()].map(m => [m.spawnId, m.ty, m.x, m.y, m.lvl, m.hp / m.mh]).sort((a, b) => a[0].localeCompare(b[0]));
  const expected = rows(first), second = setup(saved); assert.deepEqual(rows(second), expected); assert.equal(JSON.stringify(second.u.state.regions[8].spawnPlan), plan);
  maps.splice(1); TIERS.splice(7);
});

test('bundled frost-wolf startup uses versioned camps instead of unseeded packs in v2', () => {
  const plugin = require('../plugins/frost_wolf');
  for (const version of [1, 2]) {
    let spawns = 0; const families = [];
    plugin.init({ generatorVersion: version, addMob() {}, addItem() {}, on() {}, consts: { CX: 5300, CY: 5300 }, spawn() { spawns++; }, addToTier: (tier, type) => families.push([tier, type]) });
    assert.equal(spawns, version === 1 ? 9 : 0); assert.deepEqual(families, version === 1 ? [] : [[0, 'frostwolf']]);
  }
});
