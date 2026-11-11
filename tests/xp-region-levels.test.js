'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createCombat, XP_LEVEL_GAP_LIMIT } = require('../combat');
const { createProgression, newSk, stats } = require('../characters');
const { regionLevelRange } = require('../region-levels');
const { createUniverse, generateRegion } = require('../universe');
const noop = () => {};
function hero(id, level) { const p = { id, name: 'Hero' + id, cls: 'archer', lvl: level, xp: 0, gold: 0, eq: {}, bag: [], inv: {}, sk: newSk(), buf: {}, x: 6000, y: 6000, sp: 0, target: 1 }; stats(p); p.hp = p.maxhp; p.mp = p.maxmp; return p; }
function kill(type, killer, members = [killer], rate = 1) {
  const awards = [], drops = [], progression = createProgression({ fire: noop, ev: noop, say: noop, toast: noop, broadcast: noop, sendInv: noop });
  const monster = { id: 1, ty: type, lvl: 100, hp: 1, mh: 1, xp: 100, r: 14, x: 6020, y: 6000, tier: 0, stoneStep: 5 };
  const combat = createCombat({ mobs: new Map([[1, monster]]), players: new Map(members.map(p => [p.id, p])), rates: { xpRate: rate, respawnSeconds: 10 }, spawnMob: noop, ev: noop, fire: noop, gainXp: (p, xp) => { awards.push([p.id, xp]); progression.gainXp(p, xp); }, dropLoot: (p, mob, sharers) => drops.push({ p, mob, sharers }), broadcast: noop, say: noop, teams: { monsterScale: () => 1, sharesLoot: () => members.length > 1, nearbyMembers: () => members, XP_BONUS_PER_MEMBER: .15 } });
  combat.hitMob(killer, monster, 1000000); return { awards, drops, monster };
}
test('a level gap of exactly 13 or more awards zero XP for ordinary mobs, bosses and stones, keeping drops', () => {
  assert.equal(XP_LEVEL_GAP_LIMIT, 13);
  for (const type of ['wolf', 'alphawolf', 'stone']) for (const gap of [13, 14, 100]) {
    const p = hero(1, 100 + gap), result = kill(type, p);
    assert.deepEqual(result.awards, []); assert.equal(p.xp, 0); assert.equal(result.drops.length, 1); assert.equal(result.drops[0].mob, result.monster);
  }
});
test('a gap of 12, equal levels and stronger monsters still award XP', () => {
  for (const type of ['wolf', 'alphawolf', 'stone']) for (const gap of [12, 0, -13]) {
    const p = hero(1, 100 + gap), result = kill(type, p); assert.equal(result.awards.length, 1); assert.ok(p.xp > 0); assert.equal(result.drops.length, 1);
  }
  const p = hero(1, 100); assert.deepEqual(kill('stone', p, [p], 0).awards, []);
});
test('team XP eligibility is individual while gold/drop sharers remain unchanged', () => {
  const high = hero(1, 113), low = hero(2, 100), mixed = kill('wolf', high, [high, low]);
  assert.deepEqual(mixed.awards, [[2, 100]]); assert.equal(high.xp, 0); assert.equal(low.xp, 100); assert.deepEqual(mixed.drops[0].sharers, [high, low]);
  const a = hero(1, 100), b = hero(2, 100), both = kill('wolf', a, [a, b]); assert.deepEqual(both.awards, [[1, Math.round(100 * 1.15 / 2)], [2, Math.round(100 * 1.15 / 2)]]);
  const oldA = hero(1, 113), oldB = hero(2, 114); assert.deepEqual(kill('stone', oldA, [oldA, oldB]).awards, []);
});
function world(data = {}, config = {}) { return createUniverse({ store: { data, save: async () => {} }, config, isAdmin: () => false, messageText: () => '', broadcast: noop }); }
test('10000 seeded level ranges are reproducible and span 20..45 levels', () => {
  const widths = new Set();
  for (let i = 0; i < 10000; i++) {
    const seed = 'range-' + Math.floor(i / 100), tier = 8 + i % 100, previous = 60 + i % 100 * 30;
    const levels = regionLevelRange(seed, tier, previous), width = levels[1] - levels[0];
    assert.ok(Number.isInteger(width) && width >= 20 && width <= 45); assert.equal(levels[0], previous); assert.deepEqual(levels, regionLevelRange(seed, tier, previous)); widths.add(width);
  }
  assert.equal(widths.size, 26);
});
test('existing v1/v2 region descriptors and spawn plans stay untouched; newly unlocked regions use wide ranges', () => {
  for (const version of [1, 2]) {
    const seed = 'saved-world-' + version, state = world({}, { worldSeed: seed, generatorVersion: version }).state;
    state.worldTier = 8; state.regions[8] = { ...generateRegion(seed, 8, {}, version), spawnPlan: { version: 2, marker: 'preserve' } }; delete state.levelRangeVersion;
    const before = JSON.stringify(state.regions[8]), resumed = world(state), next = resumed.regionFor(9);
    assert.equal(JSON.stringify(state.regions[8]), before); assert.equal(next.levels[0], state.regions[8].levels[1]); assert.ok(next.levels[1] - next.levels[0] >= 20 && next.levels[1] - next.levels[0] <= 45); assert.equal(next.levelRangeVersion, 1);
    const saved = JSON.parse(JSON.stringify(state)); assert.deepEqual(world(saved).regionFor(9), next);
    const following = resumed.regionFor(10); assert.equal(following.levels[0], next.levels[1]);
  }
});
test('level spans stay valid at the existing level ceiling and extreme tiers without loops proportional to tier', () => {
  for (const tier of [1000000, Number.MAX_SAFE_INTEGER]) for (const previous of [undefined, 9999, 10000]) {
    const [min, max] = regionLevelRange('extreme', tier, previous); assert.ok(min >= 1 && max <= 10000); assert.ok(max - min >= 20 && max - min <= 45);
  }
  for (const tier of [0, 7, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => regionLevelRange('bad', tier), RangeError);
});
