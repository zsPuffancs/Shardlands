'use strict';
// Sculpted basic-enemy models (scripts/boss-forge -> public/assets/enemies, drawn by public/enemy-models-sculpt.js):
// ordinary-enemy budgets, the clip set, a distinct Alpha model; normal/Alpha follows the existing Alpha flag only;
// without the hero renderer, for bosses and far away the primitive model is drawn; enemy stats are untouched.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ROOT = path.join(__dirname, '..'), DIR = path.join(ROOT, 'public/assets/enemies');
const IDS = ['skeleton', 'wolf', 'frostwolf', 'slime', 'boar', 'shroom', 'goblin', 'orc', 'spider', 'hellhound', 'frostfang', 'ogre', 'wraith', 'shade', 'drake', 'golem', 'icegolem', 'yeti', 'voidweaver', 'voidknight'];
const glb = f => { const b = fs.readFileSync(f), jl = b.readUInt32LE(12), g = JSON.parse(b.slice(20, 20 + jl).toString()); let tris = 0, verts = 0; for (const m of g.meshes) for (const p of m.primitives) { tris += g.accessors[p.indices].count / 3; verts += g.accessors[p.attributes.POSITION].count; } return { g, size: b.length, tris, verts }; };

test('enemy models fit the ordinary-enemy budget and carry the clips', () => {
  for (const id of IDS) for (const v of 'na') for (const far of [false, true]) {
    const f = id + '-' + v + (far ? '-far' : ''), { g, size, tris } = glb(path.join(DIR, f + '.glb'));
    assert.ok(size < (far ? .4 : 1.5) * 1048576, f + ': size'); assert.ok(g.skins[0].joints.length <= 32, f + ': bones');
    assert.ok(far ? tris < 16000 : tris > 10000 && tris < 45000, f + ': ' + tris + ' triangles');
    if (!far) for (const clip of ['Idle', 'Walk', 'Run', 'Attack', 'RecieveHit', 'Death']) assert.ok(g.animations.some(a => a.name === clip), f + ': clip ' + clip);
  }
  // the Alpha is its own sculpt: different vertex count or a different spread of geometry (extra spikes, plates...)
  const shape = f => { const b = fs.readFileSync(f), jl = b.readUInt32LE(12), g = JSON.parse(b.slice(20, 20 + jl).toString()); let ext = 0; for (const m of g.meshes) for (const p of m.primitives) { const a = g.accessors[p.attributes.POSITION]; ext += (a.max[0] - a.min[0]) + (a.max[1] - a.min[1]) + (a.max[2] - a.min[2]); } return ext; };
  for (const id of IDS) { const n = path.join(DIR, id + '-n.glb'), a = path.join(DIR, id + '-a.glb'); const parts = f => { const b = fs.readFileSync(f), jl = b.readUInt32LE(12), g = JSON.parse(b.slice(20, 20 + jl).toString()); return g.meshes.map(m => m.primitives.reduce((t, p) => t + g.accessors[p.attributes.POSITION].count, 0)); };
    const pn = parts(n), pa = parts(a); assert.ok(Math.abs(glb(n).verts - glb(a).verts) > 500 || Math.abs(shape(n) - shape(a)) > 5 || pn.length !== pa.length || pn.some((c, i) => Math.abs(c - pa[i]) > 100), id + ': the Alpha is its own sculpt'); }
});
test('normal/Alpha from the existing flag; primitive model for bosses, far enemies and without GL; stats untouched', () => {
  const ctx = { window: {}, performance: { now: () => 0 }, console }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/enemy-models-sculpt.js'), 'utf8'), ctx);
  const E = ctx.window.EnemyModels;
  assert.equal(E.draw({ rx: 0, ry: 0, yaw: 0 }, {}, { id: 1, ty: 'skeleton' }, { top: 70, sc: 1.05 }), false, 'no GL: primitive model');
  assert.equal(E.draw({}, { boss: true }, { id: 1, ty: 'skeleton' }, {}), false); assert.equal(E.draw({}, {}, { id: 1, ty: 'wolf' }, {}), false);
  const src = fs.readFileSync(path.join(ROOT, 'public/enemy-models-sculpt.js'), 'utf8'); assert.match(src, /const v = m\.al \? 1 : 0/);
  const { MOBTYPES } = require('../src/combat/monsters'), s = MOBTYPES.skeleton;
  assert.deepEqual([s.lvl, s.r, s.hp, s.dmg, s.spd], [16, 17, 700, 42, 105]);
});
