'use strict';
// Sculpted Metin Stones (scripts/boss-forge/metin.js -> public/assets/metin, drawn by public/metin-stones.js): each
// model is a valid hero model with its damage-stage clips, the stage follows replicated health only, and the primitive
// stone stays the fallback. Visual only: the stone templates (health, rewards, summoning) are untouched.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ROOT = path.join(__dirname, '..'), DIR = path.join(ROOT, 'public/assets/metin');
const IDS = ['meadows', 'ember', 'frost', 'gloom', 'war'];

function glb(file) {
  const b = fs.readFileSync(file), jl = b.readUInt32LE(12), g = JSON.parse(b.slice(20, 20 + jl).toString());
  let tris = 0, verts = 0; for (const m of g.meshes) for (const p of m.primitives) { tris += g.accessors[p.indices].count / 3; verts = Math.max(verts, g.accessors[p.attributes.POSITION].count); }
  return { g, size: b.length, tris, verts };
}

test('every stone model and its distance model fit the hero path budgets and carry the stage clips', () => {
  for (const id of IDS) for (const far of [false, true]) {
    const { g, size, tris, verts } = glb(path.join(DIR, id + (far ? '-far' : '') + '.glb'));
    assert.ok(size < (far ? 1.5 : 5) * 1048576, id + ': file size');
    assert.ok(g.skins[0].joints.length <= 32, id + ': 32 bones'); assert.ok(verts <= 65535, id + ': 16-bit indices');
    assert.ok(far ? tris < 60000 : tris > 100000 && tris < 260000, id + ': ' + tris + ' triangles');
    for (const clip of ['Intact', 'Damaged', 'Near', 'Break']) assert.ok(g.animations.some(a => a.name === clip), id + ': clip ' + clip);
    for (const p of g.meshes.flatMap(m => m.primitives)) for (const a of ['POSITION', 'NORMAL', 'COLOR_0', 'TEXCOORD_0', 'TEXCOORD_1', 'JOINTS_0', 'WEIGHTS_0']) assert.ok(p.attributes[a] !== undefined, id + ': ' + a);
  }
});

test('the damage stage comes from replicated health, so every client shows the same stage', () => {
  const ctx = { window: {}, performance: { now: () => 0 }, console }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/metin-stones.js'), 'utf8'), ctx);
  const S = ctx.window.MetinStones;
  assert.equal(S.stageOf(100, 100), 1); assert.equal(S.stageOf(67, 100), 1); assert.equal(S.stageOf(66, 100), 2);
  assert.equal(S.stageOf(34, 100), 2); assert.equal(S.stageOf(33, 100), 3); assert.equal(S.stageOf(0, 100), 3);
  assert.equal(S.designOf('stone'), 'meadows'); assert.equal(S.designOf('wolf'), null);
  // without the hero renderer (no GL here) nothing is drawn by the module: the caller keeps the primitive stone
  assert.equal(S.draw({ rx: 0, ry: 0 }, { st: true }, { id: 1, ty: 'stone', hp: 1, mh: 1 }), false);
  assert.equal(S.shatter(0, 0, 'stone'), false); assert.equal(S.summon(0, 0), false);
});

test('the client falls back to the primitive stone and stone gameplay stays as it was', () => {
  const game = fs.readFileSync(path.join(ROOT, 'public/game.js'), 'utf8');
  assert.match(game, /if \(t\.st\) \{ if \(!\(window\.MetinStones && MetinStones\.draw\(e, t, m\)\)\) stoneModel\(e, t\); \}/);
  assert.match(game, /function stoneModel\(e, t\)/);
  const { MOBTYPES } = require('../src/combat/monsters');
  const s = MOBTYPES.stone; assert.equal(s.stone, true); assert.equal(s.lvl, 5); assert.equal(s.r, 28); assert.deepEqual(s.gold, [400, 800]);
});
