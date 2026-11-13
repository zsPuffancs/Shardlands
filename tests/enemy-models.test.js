'use strict';
// Day 1 enemy models (public/enemy-models.js): only the Day 1 enemies change; the Skeleton, the Bandit (model, equipment),
// the bosses, the later zones and the shared builders in game.js stay byte for byte as they were; every new model
// draws finite geometry in every pose.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
// Fixtures fingerprint canonical Git LF text, independent of Windows checkout CRLF.
const ROOT = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n'), md5 = s => crypto.createHash('md5').update(s).digest('hex');
const game = read('public/game.js'), world = read('public/world.js');
function fnSource(src, name) { // a top-level function declaration, braces balanced
  const at = src.indexOf('\nfunction ' + name + '('); assert.ok(at >= 0, name + ' not found'); let i = src.indexOf('{', at), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(at + 1, i + 1);
}
const modelEntry = (src, key) => { const m = src.match(new RegExp('(^|[ {,])' + key + ': \\{ fn: [^}]*\\}', 'm')); assert.ok(m, key + ' entry'); return m[0].trim(); };
const FROZEN = JSON.parse(read('tests/fixtures/enemy-model-sources.json'));

test('shared builders, excluded enemies and the Bandit equipment are unchanged', () => {
  for (const name of FROZEN.builders) assert.equal(md5(fnSource(game, name)), FROZEN.hashes['fn:' + name], name + ' must not change');
  for (const key of FROZEN.excluded) assert.equal(md5(modelEntry(game, key)), FROZEN.hashes['model:' + key], key + ' model entry must not change');
  assert.equal(md5(read('public/equipment-kit.js')), FROZEN.hashes['file:public/equipment-kit.js'], 'Bandit equipment kit must not change');
  assert.equal(md5(fnSource(world, 'gearFor')), FROZEN.hashes['fn:gearFor'], 'Bandit gear selection must not change');
  assert.match(world, /const MOBCHAR = \{ bandit: \{ m: 'Rogue', sc: 1\.05, tint: \[1, \.72, \.68\], gear: 'bandit' \}, voidknight:/, 'Bandit keeps its animated model and gear');
  assert.doesNotMatch(world.match(/const MOBCHAR = [^\n]*/)[0], /skeleton|goblin|orc/, 'no hero-model recolours for Day 1 enemies, none for the Skeleton');
});

// a headless context with the real part(), club(), mix(), hex() from game.js and a recording draw call
function context() {
  const calls = [], ctx = { Math, Object, performance: { now: () => ctx.__now }, __now: 10000, calls, window: {}, PI: Math.PI, BONE: [.95, .93, .82] };
  ctx.D = (mesh, ...a) => calls.push([mesh, ...a]); ctx.M = new Proxy({}, { get: (_, k) => k }); ctx.burst = () => {};
  vm.createContext(ctx);
  vm.runInContext(['const hex = ' + game.match(/const hex = ([^\n]*);/)[1] + ';', 'const mix = ' + game.match(/const mix = ([^\n]*);/)[1] + ';',
    fnSource(game, 'part'), fnSource(game, 'club'), 'this.hex = hex; this.mix = mix; this.part = part; this.club = club;'].join('\n'), ctx);
  const src = game.slice(game.indexOf('const MODEL = {'), game.indexOf('\n};', game.indexOf('const MODEL = {')) + 3);
  vm.runInContext(['human', 'beast', 'drake', 'slime', 'spider', 'golem', 'shroom', 'wraith'].map(n => 'function ' + n + '() {}').join('\n') + '\n' + src + '\nthis.MODEL = MODEL;', ctx);
  ctx.ORIGINAL = Object.fromEntries(Object.entries(ctx.MODEL).map(([k, v]) => [k, v]));
  vm.runInContext(read('public/enemy-models.js'), ctx);
  return ctx;
}
const DAY1 = ['wolf', 'boar', 'slime', 'shroom', 'goblin', 'orc', 'spider', 'ogre', 'wraith'];

test('only the Day 1 enemies get new models; Skeleton, Bandit, bosses and later enemies keep theirs', () => {
  const ctx = context();
  for (const [k, v] of Object.entries(ctx.ORIGINAL)) {
    if (DAY1.includes(k)) { assert.equal(ctx.MODEL[k].fn, ctx.window.EnemyModels.DAY1[k], k + ' uses its new model'); assert.equal(ctx.MODEL[k].sc, v.sc, k + ' keeps its size'); assert.equal(ctx.MODEL[k].top, v.top, k + ' keeps its nameplate height'); }
    else assert.equal(ctx.MODEL[k], v, k + ' untouched');
  }
  assert.ok(['skeleton', 'bandit', 'alphawolf', 'kingslime', 'warlord', 'broodmother', 'boneking', 'ogrechief', 'hellhound', 'frostfang', 'shade', 'voidweaver'].every(k => ctx.MODEL[k] === ctx.ORIGINAL[k]));
});

test('every new model draws finite, low-poly geometry when idle, walking, attacking, hit and as an Alpha', () => {
  const ctx = context();
  for (const k of DAY1) {
    const o = ctx.MODEL[k];
    for (const [name, e] of [['idle', { mv: 0, ph: 0, atkT: -1e9, flash: 0 }], ['walk', { mv: 1, ph: 2.3, atkT: -1e9, flash: 0 }], ['attack', { mv: .4, ph: 1, atkT: 9850, flash: 0 }], ['hit', { mv: 0, ph: 0, atkT: -1e9, flash: 9950 }]]) {
      for (const alpha of [false, true]) {
        ctx.calls.length = 0; const oo = alpha ? { ...o, sc: (o.sc || 1) * 1.3 } : o;
        o.fn({ id: 7, rx: 500, ry: 700, yaw: .8, ...e }, oo);
        assert.ok(ctx.calls.length >= 10 && ctx.calls.length <= 140, k + ' ' + name + ': ' + ctx.calls.length + ' parts');
        for (const c of ctx.calls) for (const v of c.slice(1, 9)) assert.ok(Number.isFinite(v), k + ' ' + name + ': non-finite ' + JSON.stringify(c));
        for (const c of ctx.calls) assert.ok(Array.isArray(c[9]) && c[9].every(Number.isFinite), k + ' ' + name + ': colour');
        const ys = ctx.calls.map(c => c[2]); assert.ok(Math.min(...ys) > -3 && Math.max(...ys) < 260, k + ' ' + name + ': stands on the ground');
      }
    }
  }
});

test('Day 1 models are deterministic per frame and animate', () => {
  const ctx = context();
  for (const k of DAY1) {
    const o = ctx.MODEL[k], run = e => { ctx.calls.length = 0; o.fn({ id: 3, rx: 0, ry: 0, yaw: 0, atkT: -1e9, flash: 0, ...e }, o); return JSON.stringify(ctx.calls); };
    assert.equal(run({ mv: 1, ph: 1 }), run({ mv: 1, ph: 1 }), k + ' same pose, same geometry');
    assert.notEqual(run({ mv: 0, ph: 0 }), run({ mv: 1, ph: 2.2 }), k + ' moves differently from idle');
    assert.notEqual(run({ mv: 0, ph: 0 }), run({ mv: 0, ph: 0, atkT: 9850 }), k + ' attacks');
  }
});
