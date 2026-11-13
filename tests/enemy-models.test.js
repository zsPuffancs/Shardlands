'use strict';
// Enemy models (public/enemy-models.js): every normal monster and its Alpha variant has its own model; the Skeleton, the
// Bandit (model, animated character, equipment), the bosses and the shared builders in game.js stay byte for byte as
// they were; the approved Day 1 base models keep their geometry; every model draws finite geometry in every pose.
const test = require('node:test'), assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { context, fnSource, geometry, POSES, read } = require('./helpers/enemy-model-context');
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const game = read('public/game.js'), world = read('public/world.js');
const modelEntry = (src, key) => { const m = src.match(new RegExp('(^|[ {,])' + key + ': \\{ fn: [^}]*\\}', 'm')); assert.ok(m, key + ' entry'); return m[0].trim(); };
const FROZEN = JSON.parse(read('tests/fixtures/enemy-model-sources.json')), DAY1_GEOMETRY = JSON.parse(read('tests/fixtures/day1-model-geometry.json')).hashes;
const DAY1 = ['wolf', 'boar', 'slime', 'shroom', 'goblin', 'orc', 'spider', 'ogre', 'wraith'];
const LATER = ['hellhound', 'drake', 'golem', 'frostfang', 'yeti', 'icegolem', 'shade', 'voidweaver', 'voidknight'];
const NORMAL = [...DAY1, ...LATER];
const UNTOUCHED = ['skeleton', 'bandit', 'alphawolf', 'kingslime', 'warlord', 'broodmother', 'boneking', 'ogrechief', 'elderdrake', 'infernal', 'yetiking', 'frostwyrm', 'voidlord', 'abyssalwyrm', 'deathlord'];

test('shared builders, the game.js model table and the Bandit equipment are unchanged', () => {
  for (const name of FROZEN.builders) assert.equal(md5(fnSource(game, name)), FROZEN.hashes['fn:' + name], name + ' must not change');
  for (const key of FROZEN.excluded) assert.equal(md5(modelEntry(game, key)), FROZEN.hashes['model:' + key], key + ' model entry in game.js must not change');
  assert.equal(md5(read('public/equipment-kit.js')), FROZEN.hashes['file:public/equipment-kit.js'], 'Bandit equipment kit must not change');
  assert.equal(md5(fnSource(world, 'gearFor')), FROZEN.hashes['fn:gearFor'], 'Bandit gear selection must not change');
  assert.match(world, /const MOBCHAR = \{ bandit: \{ m: 'Rogue', sc: 1\.05, tint: \[1, \.72, \.68\], gear: 'bandit' \} \};/, 'only the Bandit keeps an animated hero model, with its gear');
});

test('every normal monster gets its own model and Alpha; the Skeleton, the Bandit and every boss keep theirs', () => {
  const ctx = context(), M = ctx.window.EnemyModels, fns = { ...M.DAY1, ...M.LATER };
  for (const [k, v] of Object.entries(ctx.ORIGINAL)) {
    if (NORMAL.includes(k)) {
      assert.equal(ctx.MODEL[k].fn, fns[k], k + ' uses its new model'); assert.equal(ctx.MODEL[k].sc, v.sc, k + ' keeps its size'); assert.equal(ctx.MODEL[k].top, v.top, k + ' keeps its nameplate height');
      assert.equal(ctx.MODEL[k]._a.alpha, true); assert.equal(ctx.MODEL[k]._a.fn, fns[k]); assert.ok(Math.abs(ctx.MODEL[k]._a.sc - v.sc * 1.3) < 1e-9, k + ' Alpha keeps the 1.3x size');
    } else assert.equal(ctx.MODEL[k], v, k + ' untouched');
  }
  for (const k of UNTOUCHED) assert.equal(ctx.MODEL[k], ctx.ORIGINAL[k], k + ' untouched');
  assert.equal(new Set(Object.values(fns)).size, NORMAL.length, 'one distinct model per species');
});

test('the approved Day 1 base models keep their exact geometry', () => {
  const ctx = context();
  for (const k of DAY1) for (const [pose, h] of Object.entries(geometry(ctx, ctx.MODEL[k]))) assert.equal(h, DAY1_GEOMETRY[k + ':' + pose], k + ' ' + pose + ' must not change');
});

test('every model and Alpha draws finite, low-poly geometry when idle, walking, attacking and hit', () => {
  const ctx = context();
  for (const k of NORMAL) for (const o of [ctx.MODEL[k], ctx.MODEL[k]._a]) for (const [name, e] of POSES) {
    ctx.calls.length = 0; o.fn({ id: 7, rx: 500, ry: 700, yaw: .8, ...e }, o);
    const label = k + (o.alpha ? ' Alpha ' : ' ') + name;
    assert.ok(ctx.calls.length >= 10 && ctx.calls.length <= 160, label + ': ' + ctx.calls.length + ' parts');
    for (const c of ctx.calls) { for (const v of c.slice(1, 9)) assert.ok(Number.isFinite(v), label + ': non-finite ' + JSON.stringify(c)); assert.ok(Array.isArray(c[9]) && c[9].every(Number.isFinite), label + ': colour'); }
    const ys = ctx.calls.map(c => c[2]); assert.ok(Math.min(...ys) > -3 && Math.max(...ys) < 300, label + ': stands on the ground');
  }
});

test('each Alpha is its base creature plus its own features, never just a bigger copy', () => {
  const ctx = context(), shapes = {};
  for (const k of NORMAL) {
    const pose = { id: 7, rx: 0, ry: 0, yaw: 0, mv: 0, ph: 0, atkT: -1e9, flash: 0 }, run = o => { ctx.calls.length = 0; o.fn({ ...pose }, o); return ctx.calls.map(c => [c[0], c[9].map(v => +v.toFixed(3)).join()]); };
    const base = run(ctx.MODEL[k]), alpha = run(ctx.MODEL[k]._a);
    assert.ok(alpha.length >= base.length + 4, k + ': Alpha adds features (' + base.length + ' -> ' + alpha.length + ' parts)');
    const extra = new Map(); for (const [m, c] of alpha) extra.set(m + c, (extra.get(m + c) || 0) + 1); for (const [m, c] of base) extra.set(m + c, extra.get(m + c) - 1);
    const added = [...extra.entries()].filter(([, n]) => n > 0).map(([key]) => key).sort();
    shapes[k] = added.join('|');
    const shared = base.filter(([m, c]) => alpha.some(([m2, c2]) => m2 === m && c2 === c)).length; assert.ok(shared >= base.length * .7, k + ': Alpha keeps the base creature');
  }
  assert.equal(new Set(Object.values(shapes)).size, NORMAL.length, 'no two Alphas share the same treatment');
});

test('models are deterministic per frame and animate', () => {
  const ctx = context();
  for (const k of NORMAL) for (const o of [ctx.MODEL[k], ctx.MODEL[k]._a]) {
    const run = e => { ctx.calls.length = 0; o.fn({ id: 3, rx: 0, ry: 0, yaw: 0, atkT: -1e9, flash: 0, ...e }, o); return JSON.stringify(ctx.calls); };
    if (k !== 'wraith' && k !== 'shade') assert.equal(run({ mv: 1, ph: 1 }), run({ mv: 1, ph: 1 }), k + ' same pose, same geometry');
    assert.notEqual(run({ mv: 0, ph: 0 }), run({ mv: 1, ph: 2.2 }), k + ' moves differently from idle');
    assert.notEqual(run({ mv: 0, ph: 0 }), run({ mv: 0, ph: 0, atkT: 9850 }), k + ' attacks');
  }
});
