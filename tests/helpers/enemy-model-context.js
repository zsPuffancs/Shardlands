'use strict';
// A headless context for the procedural enemy models: the real part(), club(), mix(), hex() and MODEL table from
// public/game.js, public/enemy-models.js on top, and a draw call that records every primitive.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const ROOT = path.join(__dirname, '../..'), read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
function fnSource(src, name) { // a top-level function declaration, braces balanced
  const at = src.indexOf('\nfunction ' + name + '('); assert.ok(at >= 0, name + ' not found'); let i = src.indexOf('{', at), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(at + 1, i + 1);
}
// a headless context with the real part(), club(), sword(), mix(), hex() from game.js and a recording draw call
function context(files = {}) {
  const game = files.game || read('public/game.js'), models = files.models || read('public/enemy-models.js');
  const calls = [], ctx = { Math, Object, performance: { now: () => ctx.__now }, __now: 10000, calls, window: {}, PI: Math.PI, BONE: [.95, .93, .82] };
  ctx.D = (mesh, ...a) => calls.push([mesh, ...a]); ctx.M = new Proxy({}, { get: (_, k) => k }); ctx.burst = () => {};
  vm.createContext(ctx);
  vm.runInContext(['const hex = ' + game.match(/const hex = ([^\n]*);/)[1] + ';', 'const mix = ' + game.match(/const mix = ([^\n]*);/)[1] + ';',
    fnSource(game, 'part'), fnSource(game, 'club'), fnSource(game, 'sword'), 'const GOLD = [.88, .72, .28];', 'this.hex = hex; this.mix = mix; this.part = part; this.club = club; this.sword = sword;'].join('\n'), ctx);
  const src = game.slice(game.indexOf('const MODEL = {'), game.indexOf('\n};', game.indexOf('const MODEL = {')) + 3);
  vm.runInContext(['human', 'beast', 'drake', 'slime', 'spider', 'golem', 'shroom', 'wraith'].map(n => 'function ' + n + '() {}').join('\n') + '\n' + src + '\nthis.MODEL = MODEL;', ctx);
  ctx.ORIGINAL = Object.fromEntries(Object.entries(ctx.MODEL).map(([k, v]) => [k, v]));
  vm.runInContext(models, ctx);
  return ctx;
}

const POSES = [['idle', { mv: 0, ph: 0, atkT: -1e9, flash: 0 }], ['walk', { mv: 1, ph: 2.3, atkT: -1e9, flash: 0 }], ['attack', { mv: .4, ph: 1, atkT: 9850, flash: 0 }], ['hit', { mv: 0, ph: 0, atkT: -1e9, flash: 9950 }]];
// geometry fingerprint of a model in fixed poses (rounded, so it is stable across platforms)
function geometry(ctx, o) {
  const out = {};
  for (const [name, e] of POSES) {
    ctx.calls.length = 0; o.fn({ id: 7, rx: 500, ry: 700, yaw: .8, ...e }, o);
    out[name] = crypto.createHash('md5').update(JSON.stringify(ctx.calls.map(c => c.map(v => typeof v === 'number' ? +v.toFixed(4) : Array.isArray(v) ? v.map(x => +x.toFixed(4)) : v)))).digest('hex');
  }
  return out;
}
module.exports = { context, fnSource, geometry, POSES, read };
