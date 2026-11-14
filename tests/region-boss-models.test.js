'use strict';
// Sculpted Region Boss models (scripts/boss-forge -> public/assets/region-bosses, drawn by public/region-boss-models.js):
// every variant is a valid hero model with the clips the animation picker uses, the three variants differ in geometry,
// the variant follows the monster id (same on every client), and without the hero renderer nothing changes.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ROOT = path.join(__dirname, '..'), DIR = path.join(ROOT, 'public/assets/region-bosses');
const IDS = ['warlord', 'boneking', 'ogrechief', 'yetiking', 'voidlord', 'deathlord'];

function glb(file) {
  const b = fs.readFileSync(file), jl = b.readUInt32LE(12), g = JSON.parse(b.slice(20, 20 + jl).toString());
  let tris = 0, verts = 0, maxV = 0; for (const m of g.meshes) for (const p of m.primitives) { tris += g.accessors[p.indices].count / 3; const n = g.accessors[p.attributes.POSITION].count; verts += n; maxV = Math.max(maxV, n); }
  return { g, size: b.length, tris, verts, maxV };
}
test('every Region Boss variant and its distance model fit the hero path and carry the clips', () => {
  for (const id of IDS) for (const v of 'abc') for (const far of [false, true]) {
    const f = id + '-' + v + (far ? '-far' : ''), { g, size, tris, maxV } = glb(path.join(DIR, f + '.glb'));
    assert.ok(size < (far ? 1.5 : 6.5) * 1048576, f + ': size'); assert.ok(g.skins[0].joints.length <= 32, f + ': bones'); assert.ok(maxV <= 65535, f + ': 16-bit indices');
    assert.ok(far ? tris < 60000 : tris > 100000 && tris < 260000, f + ': ' + tris + ' triangles');
    if (!far) for (const clip of ['Idle', 'Walk', 'Run', 'Attack', 'Attack2', 'RecieveHit', 'Death']) assert.ok(g.animations.some(a => a.name === clip), f + ': clip ' + clip);
  }
});
test('the three variants are different sculpts, not recolours', () => {
  for (const id of IDS) { const n = 'abc'.split('').map(v => glb(path.join(DIR, id + '-' + v + '.glb')).verts);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(Math.abs(n[i] - n[j]) > 2000, id + ' variants ' + i + '/' + j + ' differ in geometry'); }
});
test('variant from the monster id; primitive model without the hero renderer; boss stats untouched', () => {
  const ctx = { window: {}, performance: { now: () => 0 }, console }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/region-boss-models.js'), 'utf8'), ctx);
  const R = ctx.window.RegionBossModels;
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(R.variantOf), [0, 1, 2, 0, 1, 2]);
  assert.equal(R.draw({ rx: 0, ry: 0, yaw: 0 }, { boss: true }, { id: 1, ty: 'warlord' }, { top: 74, sc: 1.6 }), false, 'no GL: the caller draws the primitive model');
  assert.equal(R.draw({}, { boss: true }, { id: 1, ty: 'wolf' }, {}), false);
  assert.equal(R.draw({}, { boss: true, wb: 1 }, { id: 1, ty: 'warlord' }, {}), false, 'World Bosses keep their own models');
  assert.ok(Math.abs(R.scaleFor(R.BOSSES.warlord, { top: 74, sc: 1.6 }) * R.BOSSES.warlord.height - 74 * 1.6 * .9) < 1e-9);
  const game = fs.readFileSync(path.join(ROOT, 'public/game.js'), 'utf8');
  assert.match(game, /if \(t\.boss && window\.RegionBossModels && RegionBossModels\.draw\(e, t, m, o\)\)/);
  const { MOBTYPES } = require('../src/combat/monsters'); const w = MOBTYPES.warlord;
  assert.deepEqual([w.hp, w.dmg, w.spd, w.r, w.aggro, w.lvl], [4200, 46, 100, 30, 260, 13]);
});
