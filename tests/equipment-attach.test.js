'use strict';
// Equipment kit on the animated Bandit (Rogue.glb): bones exist, props hide, gear follows the bones through the
// animations, weapons stay in the hands, pieces neither sink into the body nor float, variants are deterministic.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadRig, pose, mul, xf } = require('./helpers/glb-rig');
const { checkVariant, frames, propAsGear } = require('./helpers/gear-check');
const Kit = require('../public/equipment-kit');

const rig = loadRig(path.join(__dirname, '../public/assets/chars/Rogue.glb'));
const R = { names: rig.names, parent: Array.from(rig.parent), joints: rig.joints, ibm: rig.ibm, prims: rig.prims, rest: pose(rig, null, 0) };
const SET = Kit.SETS.bandit, VARIANTS = Object.keys(SET.variants);
// the animations the game plays on a bandit (world.js CHARDEF.Rogue + hit reactions + death), plus walking
const GAME_ANIMS = ['Attacking_Idle', 'Idle', 'Run', 'Walk', 'Dagger_Attack', 'Dagger_Attack2', 'RecieveHit', 'RecieveHit_2', 'Death'];

// skin one baked vertex like the engine (node_j * ibm_j * v)
function skin(nodes, verts, i) { const o = i * 16, jn = verts[o + 8], K = new Float32Array(16); mul(nodes, rig.joints[jn] * 16, rig.ibm, jn * 16, K, 0); return xf(K, 0, verts[o], verts[o + 1], verts[o + 2]); }
const boneIndex = name => rig.joints.indexOf(rig.names.indexOf(name));

test('every bone, frame and hidden prop the Bandit sets use exists in Rogue.glb', () => {
  assert.ok(boneIndex('Fist.L') >= 0, 'Fist.L is a skin joint of Rogue.glb (the second knife hand)');
  assert.ok(rig.joints.length <= 32, 'the engine skins at most 32 joints');
  for (const v of VARIANTS) {
    for (const a of Kit.attachments('bandit', v)) {
      assert.ok(boneIndex(a.bone) >= 0, `${v}: bone ${a.bone} is a skin joint`);
      assert.ok(Kit.PIECES[a.piece], `${v}: piece ${a.piece} exists`);
      if (a.frame) assert.ok(rig.names.includes(a.frame), `${v}: frame node ${a.frame} exists`);
    }
    for (const h of SET.variants[v].hide) assert.ok(rig.prims.some(p => p.nodeName === h), `${v}: prop ${h} exists`);
    for (const elite of [false, true]) { const b = Kit.bake(R, 'bandit', v, elite); assert.ok(b.tris > 200 && b.tris < 2500, `${v}: ${b.tris} triangles`); }
  }
});

test('a missing bone, frame or prop is an error, never silently skipped', () => {
  const variants = SET.variants;
  try {
    variants._t = { hide: [], tint: [1, 1, 1], attach: [{ piece: 'knife', bone: 'Fist.X', at: [0, 1, 0] }] };
    assert.throws(() => Kit.bake(R, 'bandit', '_t'), /missing Fist\.X/);
    variants._t = { hide: ['NoSuchProp'], tint: [1, 1, 1], attach: [{ piece: 'knife', bone: 'Weapon.R', frame: 'Rogue_Dagger' }] };
    assert.throws(() => Kit.bake(R, 'bandit', '_t'), /missing prop NoSuchProp/);
    variants._t = { hide: [], tint: [1, 1, 1], attach: [{ piece: 'knife', bone: 'Head', frame: 'Rogue_Dagger' }] };
    assert.throws(() => Kit.bake(R, 'bandit', '_t'), /Rogue_Dagger is not under Head/);
    variants._t = { hide: [], tint: [1, 1, 1], attach: [{ piece: 'knife', bone: 'Shoelace.L', at: [0, 0, 0] }] };
    assert.throws(() => Kit.bake(R, 'bandit', '_t'), /Shoelace\.L \(not a skin joint\)/);
  } finally { delete variants._t; }
});

test('hiding removes exactly the named built-in props', () => {
  for (const v of VARIANTS) {
    const b = Kit.bake(R, 'bandit', v, false), hidden = rig.prims.filter((p, i) => b.hide[i]).map(p => p.nodeName).sort();
    assert.deepStrictEqual(hidden, SET.variants[v].hide.slice().sort(), v);
    assert.ok(b.hide[rig.prims.findIndex(p => p.skinned)] === 0, 'the body itself is never hidden');
  }
  assert.ok(SET.variants.brigand.hide.includes('Rogue_Dagger') && SET.variants.marauder.hide.includes('Rogue_Dagger') && SET.variants.cutthroat.hide.includes('Rogue_Dagger'), 'every variant replaces the dagger');
});

test('gear sits where it was authored in the default pose and moves rigidly with its bone in every animation', () => {
  for (const v of VARIANTS) {
    const b = Kit.bake(R, 'bandit', v, false), rest = R.rest;
    // default pose: skinning returns the authored positions (bind-pose conversion is exact)
    const list = Kit.attachments('bandit', v);
    assert.strictEqual(list.length, b.parts.length);
    for (const [k, pt] of b.parts.entries()) {
      const a = list[k]; assert.strictEqual(a.piece, pt.piece);
      const i = pt.range[0], p = skin(rest, b.verts, i), jn = b.verts[i * 16 + 8];
      assert.strictEqual(rig.names[rig.joints[jn]], a.bone, `${v}/${pt.piece} skinned to ${a.bone}`);
      assert.ok(p.every(Number.isFinite));
    }
    // every animation: each vertex keeps its offset in its bone's frame (no drift, no swimming)
    for (const [anim, t] of frames(rig, 5, GAME_ANIMS)) {
      const nodes = pose(rig, anim, t);
      for (const pt of b.parts) for (const i of [pt.range[0], (pt.range[0] + pt.range[1]) >> 1, pt.range[1] - 1]) {
        const jn = b.verts[i * 16 + 8], j = rig.joints[jn], p = skin(nodes, b.verts, i), q = skin(rest, b.verts, i);
        const local = xf(Float32Array.from(Kit.inv(Array.from(nodes.subarray(j * 16, j * 16 + 16)))), 0, ...p), local0 = xf(Float32Array.from(Kit.inv(Array.from(rest.subarray(j * 16, j * 16 + 16)))), 0, ...q);
        assert.ok(Math.hypot(local[0] - local0[0], local[1] - local0[1], local[2] - local0[2]) < 1e-3, `${v}/${pt.piece} rigid on ${anim}@${t.toFixed(2)}`);
      }
    }
  }
});

test('weapons stay in the hands through every animation', () => {
  for (const [anim, t] of frames(rig, 9, GAME_ANIMS)) {
    const nodes = pose(rig, anim, t), at = n => { const i = rig.names.indexOf(n); return [nodes[i * 16 + 12], nodes[i * 16 + 13], nodes[i * 16 + 14]]; };
    // left hand: the second knife's grip (mirrored socket, baked on Fist.L) next to Fist.L
    const b = Kit.bake(R, 'bandit', 'cutthroat', false), left = b.parts.find(p => p.bone === 'Fist.L');
    let c = [0, 0, 0]; const n = left.range[1] - left.range[0]; for (let i = left.range[0]; i < left.range[1]; i++) { const p = skin(nodes, b.verts, i); c = [c[0] + p[0] / n, c[1] + p[1] / n, c[2] + p[2] / n]; }
    const f = at('Fist.L'), restC = (() => { let s = [0, 0, 0]; for (let i = left.range[0]; i < left.range[1]; i++) { const p = skin(R.rest, b.verts, i); s = [s[0] + p[0] / n, s[1] + p[1] / n, s[2] + p[2] / n]; } return s; })();
    const rf = [R.rest[rig.names.indexOf('Fist.L') * 16 + 12], R.rest[rig.names.indexOf('Fist.L') * 16 + 13], R.rest[rig.names.indexOf('Fist.L') * 16 + 14]];
    // the knife's centre keeps the same distance from the left fist as in the default pose (it is held, not dragged)
    assert.ok(Math.abs(Math.hypot(c[0] - f[0], c[1] - f[1], c[2] - f[2]) - Math.hypot(restC[0] - rf[0], restC[1] - rf[1], restC[2] - rf[2])) < 1e-3, `${anim}@${t.toFixed(2)}: left knife held`);
  }
  // and the grips are inside the fists in the default pose (within the hand's size, the Rogue's fist is ~0.3 across)
  const b = Kit.bake(R, 'bandit', 'cutthroat', false);
  for (const [bone, name] of [['Weapon.R', 'Weapon.R'], ['Fist.L', 'Fist.L']]) {
    const pt = b.parts.find(p => p.bone === bone), fi = rig.names.indexOf(name), f = [R.rest[fi * 16 + 12], R.rest[fi * 16 + 13], R.rest[fi * 16 + 14]];
    let best = 9; for (let i = pt.range[0]; i < pt.range[1]; i++) { const p = skin(R.rest, b.verts, i); best = Math.min(best, Math.hypot(p[0] - f[0], p[1] - f[1], p[2] - f[2])); }
    assert.ok(best < 0.2, `${bone} grip is in the hand (${best.toFixed(3)})`);
  }
});

test('no piece sinks into the body or floats off it during the game animations', () => {
  // Penetration = how deep gear vertices go inside the skinned body, gap = how far a piece gets from it.
  // Weapons are measured against the model's own dagger in the same frames: the animations fold the wrist over the
  // blade (Dagger_Attack) and swing the pommel past the thigh (Run), so the original art already does that much.
  // Limits in model units (the Rogue is 2.95 tall; 0.1 ~ 2 px for a bandit on screen).
  const fr0 = frames(rig, 5, GAME_ANIMS), d = propAsGear(rig, R.rest, 'Rogue_Dagger', Kit.inv);
  const dagger = checkVariant(rig, d, [Object.assign({ weapon: true }, d.part)], fr0)[d.part.name].pen;
  assert.ok(dagger > 0.05 && dagger < 0.2, 'baseline: the original dagger ' + dagger.toFixed(3));
  const PEN = { weapon: dagger + 0.02, armour: 0.18 }, GAP = 0.12;
  const fr = frames(rig, 5, GAME_ANIMS), report = [];
  for (const v of VARIANTS) {
    const b = Kit.bake(R, 'bandit', v, false);
    const res = checkVariant(rig, b, b.parts.map((p, i) => ({ name: i + ':' + p.piece, range: p.range, weapon: p.weapon })), fr);
    for (const [k, r] of Object.entries(res)) {
      const weapon = /knife|Axe|falchion/.test(k);
      report.push(`${v} ${k} pen ${r.pen.toFixed(3)} gap ${r.gap.toFixed(3)}`);
      assert.ok(r.pen <= (weapon ? PEN.weapon : PEN.armour), `${v} ${k}: ${r.pen.toFixed(3)} deep in ${r.penBone} at ${r.penAt}`);
      if (!weapon) assert.ok(r.gap <= GAP, `${v} ${k}: floats ${r.gap.toFixed(3)} off the body at ${r.gapAt}`);
    }
  }
  assert.ok(report.length >= 15);
});

test('variants are deterministic per monster id and spread across the set', () => {
  const counts = {};
  for (let id = 1; id <= 600; id++) {
    const v = Kit.pick('bandit', id);
    assert.strictEqual(v, Kit.pick('bandit', id), 'same id, same look');
    assert.strictEqual(v, Kit.pick('bandit', String(id)), 'number or string id');
    counts[v] = (counts[v] || 0) + 1;
  }
  assert.deepStrictEqual(Object.keys(counts).sort(), VARIANTS.slice().sort());
  for (const v of VARIANTS) assert.ok(counts[v] > 600 * 0.22, `${v}: ${counts[v]} of 600`);
  // fixed values: the hash must not change between versions, or players would see bandits change gear on update
  assert.deepStrictEqual([1, 2, 3, 42, 1000].map(id => Kit.pick('bandit', id)), ['cutthroat', 'cutthroat', 'brigand', 'brigand', 'brigand']);
  assert.strictEqual(Kit.pick('nosuchset', 1), null);
});

test('elites keep their variant shape with darker metal and a glowing edge', () => {
  for (const v of VARIANTS) {
    const a = Kit.bake(R, 'bandit', v, false), e = Kit.bake(R, 'bandit', v, true);
    assert.strictEqual(a.verts.length, e.verts.length, 'same geometry');
    for (let i = 0; i < a.verts.length; i += 16) assert.strictEqual(a.verts[i], e.verts[i]);
    const uvs = arr => new Set(Array.from({ length: arr.length / 16 }, (_, i) => arr[i * 16 + 6].toFixed(4)));
    assert.notDeepStrictEqual([...uvs(a.verts)].sort(), [...uvs(e.verts)].sort(), 'different swatches');
  }
  const glow = (Kit.SW.emberEdge + 0.5) / Kit.PAL_W, e = Kit.bake(R, 'bandit', 'marauder', true);
  assert.ok(Array.from({ length: e.verts.length / 16 }, (_, i) => e.verts[i * 16 + 6]).some(u => Math.abs(u - glow) < 1e-6), 'elite blade edge glows');
  assert.ok(Kit.PALETTE[Kit.SW.emberEdge * 4 + 3] < 255 && Kit.PALETTE[Kit.SW.iron * 4 + 3] === 255, 'only glow swatches carry alpha');
});

test('gear is one mesh per character: at most one extra draw, and hidden props pay for it', () => {
  for (const v of VARIANTS) {
    const b = Kit.bake(R, 'bandit', v, false), hidden = b.hide.reduce((s, x) => s + x, 0);
    assert.ok(b.verts.length % 16 === 0 && b.verts.length / 16 === b.tris * 3);
    assert.ok(hidden >= 1, `${v} hides at least the dagger, so the gear draw replaces it`);
  }
});
