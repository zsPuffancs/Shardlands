'use strict';
// Sculpted basic-enemy models (scripts/boss-forge -> public/assets/enemies, drawn by public/enemy-models-sculpt.js):
// ordinary-enemy budgets, the clip set, a distinct Alpha model; normal/Alpha follows the existing Alpha flag only;
// without the hero renderer, for bosses and far away the primitive model is drawn; enemy stats are untouched.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ROOT = path.join(__dirname, '..'), DIR = path.join(ROOT, 'public/assets/enemies');
const IDS = ['skeleton'];
const glb = f => { const b = fs.readFileSync(f), jl = b.readUInt32LE(12), g = JSON.parse(b.slice(20, 20 + jl).toString()); let tris = 0, verts = 0; for (const m of g.meshes) for (const p of m.primitives) { tris += g.accessors[p.indices].count / 3; verts += g.accessors[p.attributes.POSITION].count; } return { g, size: b.length, tris, verts }; };

test('enemy models fit the ordinary-enemy budget and carry the clips', () => {
  for (const id of IDS) for (const v of 'na') for (const far of [false, true]) {
    const f = id + '-' + v + (far ? '-far' : ''), { g, size, tris } = glb(path.join(DIR, f + '.glb'));
    assert.ok(size < (far ? .4 : 1.5) * 1048576, f + ': size'); assert.ok(g.skins[0].joints.length <= 32, f + ': bones');
    assert.ok(far ? tris < 16000 : tris > 10000 && tris < 45000, f + ': ' + tris + ' triangles');
    if (!far) for (const clip of ['Idle', 'Walk', 'Run', 'Attack', 'RecieveHit', 'Death']) assert.ok(g.animations.some(a => a.name === clip), f + ': clip ' + clip);
  }
  for (const id of IDS) assert.ok(Math.abs(glb(path.join(DIR, id + '-n.glb')).verts - glb(path.join(DIR, id + '-a.glb')).verts) > 500, id + ': the Alpha is its own sculpt');
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
