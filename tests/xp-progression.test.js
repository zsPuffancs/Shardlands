'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const xp = require('../src/progression/xp-economy');
const { generateSpawnPlan, validateSpawnPlan } = require('../src/world/world-generation');
const { POLICY_VERSION, bandsFor, validateProgression, accessibility } = require('../src/world/progression-generation');
const { PROFILES, createDangerSpec } = require('../src/world/danger-geography');
const { createUniverse } = require('../src/world/universe');
const { buildRegionPlan } = require('../src/world/region-blueprint');
const { createAtlas } = require('../src/world/world-atlas');
const { createMonsterSpawner, MOBTYPES, TIERS } = require('../src/combat/monsters');
const { createCombat } = require('../src/combat/combat');
const { createEncounterRuntime } = require('../src/world/encounter-runtime');
const { maps } = require('../src/world/game-world');
const { newSk, stats } = require('../src/player/characters');
const noop = () => {};
const area = { x0: 0, y0: 0, w: 5000, h: 5000, cx: 2500, cy: 2500 };
function plan(seed = 'progression', levels = [100, 145], options = {}) {
  return generateSpawnPlan({ seed, tier: 8, area, progressionVersion: POLICY_VERSION,
    zone: { generated: true, outer: true, min: 400, max: 99999, lv: levels, types: ['wolf', 'boar'], stones: 32, stone: 'stone', bosses: ['alphawolf'], worldBoss: 'alphawolf', alphas: 8, count: 260, portal: { id: 'portal', x: 2500, y: 2562 } },
    dangerSpec: createDangerSpec({ seed, tier: 8, biome: options.biome || 'wildwood', options: options.danger }), ...options });
}
function world(data = {}) { return createUniverse({ store: { data, save: async () => {} }, config: { worldSeed: 'progression-save' }, broadcast: noop, messageText: noop, isAdmin: () => false }); }
function spawner(mobs) { let id = 0; return createMonsterSpawner({ mobs, rates: { monsterHp: 1 }, world: { width: 10600, height: 10600, centerX: 5300, centerY: 5300 }, allocateId: () => ++id, rnd: (a, b) => (a + b) / 2, rint: a => a, pick: values => values[0] }); }

test('smooth penalty matches all signed targets and has continuous monotone boundaries', () => {
  for (const [gap, target] of [[-60, .02], [-40, .22], [-25, .55], [-15, .9], [-10, 1], [-5, 1], [0, 1], [5, 1], [6, .95], [10, .65], [15, .3], [20, .1], [25, 0], [26, 0]]) {
    assert.ok(Math.abs(xp.gapMultiplier(gap) - target) < 1e-12, String(gap));
    assert.ok(Math.abs(xp.gapMultiplier(gap + 1e-5) - xp.gapMultiplier(gap - 1e-5)) < 1e-5, 'continuous ' + gap);
  }
  for (let gap = 0; gap <= 200; gap += .02) {
    assert.ok(xp.gapMultiplier(gap) <= xp.gapMultiplier(gap - .02) + 1e-12);
    assert.ok(xp.gapMultiplier(-gap) <= xp.gapMultiplier(-gap + .02) + 1e-12);
    assert.ok(xp.gapMultiplier(gap) >= 0 && xp.gapMultiplier(-gap) <= 1);
  }
  for (const invalid of [NaN, Infinity, -Infinity, null, '5']) assert.equal(xp.gapMultiplier(invalid), 0);
  for (const invalid of [0, -1, 10001, NaN, Infinity, 1.5, '100']) assert.equal(xp.levelGapScale(invalid, 100), 0);
  assert.equal(xp.levelGapScale(10000, 10000), 0);
});

test('all categories apply the same penalty with per-recipient budgets and safe bonuses', () => {
  for (const category of Object.keys(xp.XP_BALANCE.fractions)) for (const playerLevel of [1, 10, 100, 5000, 9999, 10000]) for (const members of [1, 2, 5]) {
    for (const delta of [-100, -25, -20, -15, -10, -6, -5, 0, 5, 10, 15, 25, 40, 60, 500]) {
      const monsterLevel = Math.max(1, Math.min(10000, playerLevel + delta));
      const options = { playerLevel, monsterLevel, category, members, gearBonus: Number.MAX_VALUE, wisdom: true, pluginMultiplier: Number.MAX_VALUE, serverRate: Number.MAX_VALUE };
      const award = xp.calculateEncounterXp(options);
      assert.ok(Number.isSafeInteger(award) && award >= 0 && award <= xp.encounterLimit(playerLevel, options));
      if (category === 'summoned' || playerLevel - monsterLevel >= 25 || playerLevel === 10000) assert.equal(award, 0);
    }
  }
  assert.equal(xp.levelGapScale(100, 115), xp.levelGapScale(5000, 5015));
  assert.ok(xp.encounterShare({ playerLevel: 100, monsterLevel: 10000, category: 'worldBoss' }) < xp.xpNeed(100) * .001);
});

test('normalized bands match reference intervals and shrink safely at the level ceiling', () => {
  assert.deepEqual(bandsFor([100, 145], 'camp').map(band => [band.min, band.max]), [[100, 108], [109, 120], [121, 135], [136, 145]]);
  assert.deepEqual(bandsFor([100, 145], 'stone').map(band => [band.min, band.max]), [[100, 108], [109, 122], [123, 136], [137, 145]]);
  for (const levels of [[9999, 10000], [10000, 10000]]) {
    const bands = bandsFor(levels, 'stone');
    assert.equal(bands[0].min, levels[0]); assert.equal(bands.at(-1).max, levels[1]);
    for (let i = 1; i < bands.length; i++) assert.equal(bands[i - 1].max + 1, bands[i].min);
  }
});

test('many seeds, every biome/span and extreme tiers have a complete ordinary and stone progression path', t => {
  let generated = 0;
  for (const biome of Object.keys(PROFILES)) for (const span of [20, 25, 35, 45]) for (let i = 0; i < 2; i++) {
    const seed = 'coverage-' + biome + '-' + span + '-' + i, levels = [100 + i * 4900, 100 + i * 4900 + span];
    const result = plan(seed, levels, { biome }), report = validateProgression(result);
    assert.equal(report.valid, true, JSON.stringify({ seed, errors: report.errors }));
    assert.equal(report.gapCount, 0); assert.ok(report.entry.accessible);
    assert.equal(validateSpawnPlan(result).valid, true);
    assert.ok(report.segments.every(segment => segment.normalCount >= 4 && segment.stoneCount >= 1));
    for (const entry of result.encounters.filter(e => e.kind === 'camp')) {
      const levels = result.spawns.filter(s => s.encounterId === entry.id).map(s => s.level);
      assert.ok(Math.max(...levels) - Math.min(...levels) <= 2, 'coherent camp');
    }
    for (const kind of ['camp', 'stone']) {
      const source = result.spawns.filter(spawn => spawn.kind === kind), actual = source.map(spawn => spawn.level);
      assert.ok(Math.max(...actual) - Math.min(...actual) >= span - 2);
      for (const band of kind === 'camp' ? report.normalBands : report.stoneBands) assert.ok(Math.abs(band.percent / 100 - band.weight) < .15);
    }
    generated++;
  }
  for (const levels of [[1, 21], [9980, 10000], [9998, 10000], [10000, 10000]]) assert.equal(validateProgression(plan('ceiling-' + levels[0], levels)).valid, true);
  t.diagnostic('Validated ' + generated + ' seed/biome/span combinations and 3 ceiling ranges.');
});

test('level assignment preserves geometry, IDs, families and budget streams byte-for-byte', () => {
  const current = plan('identity'), legacy = plan('identity', [100, 145], { progressionVersion: 0 });
  const withoutLevels = value => value.spawns.map(({ level, ...spawn }) => spawn);
  assert.deepEqual(current.encounters, legacy.encounters); assert.deepEqual(withoutLevels(current), withoutLevels(legacy));
  assert.deepEqual(current.paths, legacy.paths); assert.deepEqual(current.danger, legacy.danger);
  assert.deepEqual(current, plan('identity'));
  const before = JSON.stringify(current); validateProgression(current); assert.equal(JSON.stringify(current), before);
  assert.throws(() => plan('unknown', [100, 145], { progressionVersion: 999 }), /Unsupported progression/);
});

test('small budgets either satisfy coverage or return bounded structured diagnostics; dense danger remains playable', () => {
  assert.equal(validateProgression(plan('small-valid', [100, 120], { budgets: { monsters: 40, stones: 4, alphas: 0 } })).valid, true);
  for (const budgets of [{ monsters: 0, stones: 0 }, { monsters: 4, stones: 1 }]) {
    assert.throws(() => plan('small-invalid', [100, 145], { budgets }), error => error.code === 'INVALID_PROGRESSION' && error.diagnostics.valid === false && error.diagnostics.errors.length > 0);
  }
  const dense = plan('dense', [100, 145], { biome: 'volcanic', danger: { baseline: .65, noise: .25 } });
  assert.equal(validateProgression(dense).valid, true);
  const isolated = structuredClone(dense);
  isolated.encounters.find(e => e.kind === 'boss').radius = 100000;
  const report = validateProgression(isolated);
  assert.equal(report.valid, false); assert.equal(report.entry.accessible, false); assert.ok(report.largestGap > 0);
  assert.ok(Object.values(accessibility(isolated)).every(entry => !entry.accessible));
  const noSettlement = plan('no-settlement', [100, 145], { protectedAreas: [] });
  assert.equal(validateProgression(noSettlement).valid, true, 'no settlement buildings or player encampments required');
});

test('saved legacy and current plans are immutable; previews use the same production policy and frozen snapshot', () => {
  const universe = world(); universe.state.worldTier = 8;
  const record = universe.regionFor(8); delete record.progressionVersion;
  record.spawnPlan = buildRegionPlan(universe.state, record);
  const saved = JSON.stringify(record), atlas = createAtlas({ universe });
  assert.equal(atlas.inspect({ tier: 8 }).progression.legacy, true);
  assert.equal(JSON.stringify(record), saved);
  const before = JSON.stringify(universe.state), preview = atlas.inspect({ tier: 9, preview: true });
  assert.equal(preview.progression.version, POLICY_VERSION); assert.equal(preview.progression.valid, true);
  assert.equal(JSON.stringify(universe.state), before);
  const next = universe.regionFor(9); assert.deepEqual(buildRegionPlan(universe.state, next), preview.plan);
  next.spawnPlan = preview.plan; const persisted = JSON.stringify(next);
  const resumed = world(JSON.parse(JSON.stringify(universe.state))); assert.equal(JSON.stringify(resumed.regionFor(9)), persisted);
  assert.equal(resumed.regionFor(1).progressionVersion, undefined, 'founding untouched');
  assert.equal(JSON.stringify(resumed.regionFor(8)), saved);
});

test('Atlas endpoints return structured progression failures without writes and protect them from remote access', () => {
  const universe = world(); universe.state.generationSettings.budgets = { monsters: 0, stones: 0 };
  const atlas = createAtlas({ universe }), before = JSON.stringify(universe.state);
  const request = { method: 'GET', url: '/dev/atlas/api/region?tier=8&mode=preview', headers: { host: 'localhost:3000' }, socket: { remoteAddress: '127.0.0.1' } };
  let status, body;
  const response = { setHeader: noop, writeHead: value => { status = value; }, end: value => { body = JSON.parse(value); } };
  assert.equal(atlas.handle(request, response), true); assert.equal(status, 422);
  assert.equal(body.code, 'INVALID_PROGRESSION'); assert.equal(body.progression.valid, false); assert.ok(body.progression.errors.includes('missing-stone-population'));
  request.socket.remoteAddress = '192.168.1.5'; atlas.handle(request, response); assert.equal(status, 403); assert.equal(body.progression, undefined);
  assert.equal(JSON.stringify(universe.state), before);
});

test('balance report executes historical XP math and covers every generated progression step', () => {
  const report = require('../scripts/xp-progression-balance').report();
  const boundary = report.rows.find(row => row.level === 100 && row.gap === 13 && row.category === 'stone');
  assert.equal(boundary.before.xp, 0); assert.ok(boundary.after.xp > 0);
  for (const region of report.regions) {
    assert.equal(region.rows.length, (region.levels[1] - region.levels[0] + 1) * 2);
    assert.equal(region.diagnostics.valid, true);
    for (const row of region.rows) assert.ok(row.level === 10000 ? row.after.best === 0 : row.after.best > 0);
  }
});

test('planned stone levels drive real HP, category XP, runtime reload and respawn', () => {
  const mobs = new Map(), spawn = spawner(mobs);
  const low = spawn.spawnMob('stone', 6000, 6000, 0, { level: 100 }), high = spawn.spawnMob('stone', 6000, 6000, 0, { level: 145 });
  assert.equal(high.lvl, 145); assert.ok(high.mh > low.mh); assert.equal(high.xp, xp.encounterBaseXp(145, 'stone'));
  assert.ok(xp.calculateEncounterXp({ playerLevel: 145, monsterLevel: high.lvl, category: 'stone' }) > xp.calculateEncounterXp({ playerLevel: 145, monsterLevel: low.lvl, category: 'stone' }));
  high.hp = 0; high.dead = Date.now(); high.stoneStep = 1; spawn.respawnMonster(high);
  assert.equal(high.lvl, 145); assert.equal(high.hp, high.mh); assert.equal(high.stoneStep, 5);
  mobs.clear();
  const state = {}, players = new Map([[1, { id: 1, x: 6000, y: 6000 }]]);
  const runtime = createEncounterRuntime({ players, mobs, spawnMob: spawn.spawnMob, unloadAfterMs: 0 });
  const definition = { id: 'stone:0:0', encounterId: 'stone:0', type: 'stone', x: 6000, y: 6000, level: 145 };
  runtime.register({ id: 'stone-region', map: maps[0], zoneIndex: 0, min: 0, max: 99999, outer: true, storage: () => state, loadPlan: () => ({ spawns: [definition], encounters: [{ id: 'stone:0', x: 6000, y: 6000, spawnIds: [definition.id] }] }) });
  runtime.tick(1000); const stone = [...mobs.values()][0]; stone.hp = stone.mh / 2; stone.stoneStep = 3;
  runtime.checkpoint(); players.clear(); runtime.tick(1500); assert.equal(mobs.size, 0);
  players.set(1, { id: 1, x: 6000, y: 6000 }); runtime.tick(2000);
  const restored = [...mobs.values()][0]; assert.equal(restored.lvl, 145); assert.equal(restored.hp, restored.mh / 2); assert.equal(restored.stoneStep, 3);
});

test('stone guardian waves inherit parent levels and pay bounded 30%/50% normal XP once', t => {
  // A random critical hit can legitimately one-shot the Stone and skip its waves.
  // This test exercises wave rewards, so fix combat randomness without changing damage rules.
  t.mock.method(Math, 'random', () => .5);
  const original = TIERS[0]; TIERS[0] = { ...original, progressionVersion: 1 }; t.after(() => { TIERS[0] = original; });
  const mobs = new Map(), spawn = spawner(mobs), player = { id: 1, name: 'Hero', cls: 'archer', lvl: 145, xp: 0, gold: 0, eq: {}, bag: [], inv: {}, sk: newSk(), buf: {}, x: 6000, y: 6000 };
  stats(player); player.hp = player.maxhp; player.mp = player.maxmp;
  const stone = spawn.spawnMob('stone', 6020, 6000, 0, { level: 145 });
  const awards = [], drops = [];
  const combat = createCombat({ mobs, players: new Map([[1, player]]), rates: { xpRate: 1, respawnSeconds: 10 }, spawnMob: spawn.spawnMob, ev: noop, fire: noop, gainXp: (p, amount) => awards.push(amount), dropLoot: (...args) => drops.push(args), broadcast: noop, say: noop });
  combat.hitMob(player, stone, stone.mh * .65);
  const guardians = [...mobs.values()].filter(mob => mob.summoned);
  assert.ok(guardians.length); assert.ok(guardians.some(mob => mob.alpha)); assert.ok(stone.stoneStep < 5);
  const expected = [];
  for (const guardian of guardians) {
    const rewardScale = guardian.alpha ? .5 : .3;
    assert.equal(guardian.lvl, stone.lvl); assert.equal(guardian.xp, xp.encounterBaseXp(guardian.lvl, 'normal') * rewardScale);
    assert.equal(xp.encounterCategory(guardian, MOBTYPES[guardian.ty]), 'summoned');
    expected.push(xp.encounterShare({ playerLevel: player.lvl, monsterLevel: guardian.lvl, category: 'normal', rewardScale }));
    combat.hitMob(player, guardian, guardian.mh * 2);
    combat.hitMob(player, guardian, guardian.mh * 2);
  }
  assert.deepEqual(awards, expected);
  combat.hitMob(player, stone, stone.mh * 2); assert.equal(awards.length, expected.length + 1);
  assert.equal(awards.at(-1), xp.encounterShare({ playerLevel: 145, monsterLevel: 145, category: 'stone' }));
});
