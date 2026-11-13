'use strict';
// The Reaper, World Boss of the Death Zone: the embodiment of death. Robed and hovering, not an armoured skeleton.
//   A spectral       a deep black hooded robe in layered tatters, nothing in the hood but two green lights, a dark
//                    scythe with a green-lit edge
//   B skeletal       a skull grinning in the hood, ribs showing through a torn robe, a rusted, notched scythe
//   C supernatural   a pale robe dissolving into blue light toward the hem, a glowing face in the hood, a halo of
//                    soul orbs with faces, a scythe of cold light
// Humanoid rig with hidden legs (the robe follows the skirt bones). Units match the old model (top ~100).
const K = require('./kit');
const { F, H, B, POS: BASE, GRIP, both, mulR, rotX, rotY, rotZ, frameOf, LR, mixc } = K;
const { roundCone: RC, ellipsoid: EL, torus: TO, box: BX, Sculpt, norm, add, mul, sub, len, clamp, lerp, rng } = F;

const POS = Object.assign({}, BASE), BONES = H.bonesFrom(POS);
const HOOD = [0, 79, 1.2];

const DESIGN = [
  { key: 'a', name: 'spectral', seed: 701, colors: { cloth: [.07, .07, .08], bone: [.8, .78, .7], metal: [.16, .17, .18], darkmetal: [.08, .08, .09], glow: [.35, 1, .5], wood: [.12, .1, .09] }, eye: [.35, 1, .5] },
  { key: 'b', name: 'skeletal', seed: 702, colors: { cloth: [.11, .09, .08], bone: [.84, .8, .68], metal: [.3, .26, .22], darkmetal: [.14, .12, .1], glow: [.55, .95, .6], wood: [.2, .14, .09] }, eye: [.55, .95, .6] },
  { key: 'c', name: 'supernatural', seed: 703, colors: { cloth: [.42, .5, .62], bone: [.8, .86, .94], metal: [.6, .78, 1], darkmetal: [.3, .4, .55], glow: [.6, .86, 1], wood: [.36, .44, .56] }, eye: [.7, .92, 1] },
];

// the robe: a long bell of cloth from the shoulders to just above the ground, deep vertical folds, a torn hem
function robe(D) {
  const S = new Sculpt(), R = rng(D.seed), key = D.key, top = 66, hem = 12;
  const boneAt = (a, y) => { if (y > 46) return y > 56 ? B.chest : B.spine; const x = Math.sin(a), z = Math.cos(a); return Math.abs(z) > Math.abs(x) ? (z > 0 ? B.skirtF : B.skirtB) : (x > 0 ? B.skirtL : B.skirtR); };
  const panels = 18, rows = 15;
  for (let i = 0; i < panels; i++) for (let r = 0; r <= rows; r++) {
    const a = i / panels * Math.PI * 2, t = r / rows, y = lerp(top, hem, t), fold = Math.sin(a * 6 + t * 1.5) * (.4 + t * 1.6), rx = 8.8 + t * 6.2 + fold, rz = 6.8 + t * 5 + fold * .8;
    if (t > .82 && R() < (key === 'c' ? .5 : .32) * (t - .7) * 4) continue;                                                       // ragged hem
    const c = [Math.sin(a) * rx, y, Math.cos(a) * rz + (t > .5 ? -1.4 * t : 0)];
    S.add(EL(c, [rx * Math.PI / panels * 1.1 + 1, (top - hem) / rows * .9, 2.4]), { bone: boneAt(a, y), tag: 'robe', k: 2.2, t });
  }
  // the hood: a deep cowl open to the front, its peak falling back
  S.add(EL(HOOD, [7.6, 8.6, 8.2]), { bone: B.head, tag: 'robe', k: 2, t: 0 });
  S.add(RC([0, 84, -2], [0, 89.6, -7.4], 4.2, .6), { bone: B.head, tag: 'robe', k: 2.2, t: 0 });                                  // pointed peak
  S.add(EL([0, 70, 1], [11.6, 4.4, 9.6]), { bone: B.chest, tag: 'robe', k: 2.6, t: 0 });                                     // cowl round the shoulders
  S.sub(EL([0, 78.2, 6.6], [5.2, 6.4, 6.2]), { k: 1.2 });                                                                   // the opening
  // wide sleeves hanging from the arms, open at the wrist
  both(s => { const L = LR(s), f = p => [s * p[0], p[1], p[2]];
    S.add(RC(f([12.6, 65, 0]), f([14.6, 50, 1.4]), 5.2, 5.6), { bone: B['uarm' + L], tag: 'robe', k: 1.4, t: .1 });
    S.add(RC(f([14.6, 50, 1.4]), f([15.6, 38.6, 3.4]), 5.6, 6.6), { bone: B['farm' + L], tag: 'robe', k: 1.4, t: .2 });
    S.add(EL(f([15.4, 40, 1]), [5.4, 6.4, 5.2]), { bone: B['farm' + L], tag: 'robe', k: 1.6, t: .3 });                          // the hanging cuff
    S.sub(RC(f([15.4, 44, 3.2]), f([15.6, 35.4, 3.6]), 3.6, 4.4), { k: .8 }); });
  // long tattered strips trailing from the hem, of uneven lengths, almost brushing the ground
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 + R() * .2, rx = 15, rz = 11.8, base = [Math.sin(a) * rx, 15, Math.cos(a) * rz - .6], l = lerp(8, 13, R()), out = [Math.sin(a), 0, Math.cos(a)];
    let prev = base; for (let k = 1; k <= 4; k++) { const q = add(base, [out[0] * k * .9, -l * k / 4, out[2] * k * .9]); S.add(EL(mul(add(prev, q), .5), [2.2 - k * .3, l / 8 + .6, .6], [norm(F.cross([0, 1, 0], out)), [0, 1, 0], out]), { bone: boneAt(a, 10), tag: 'robe', k: 1, t: .9 + k * .03 }); prev = q; } }
  // layered tatters hanging from the shoulders over the robe
  for (const side of [-1, 1]) K.sheet(S, [[side * 4, 69, 6], [side * 9, 68, 4.6], [side * 13, 66, 1]], 26, { bone: B.chest, tag: 'robe', thick: .55, folds: 2, foldDepth: .8, flare: .12, rag: .9, seed: D.seed + side * 3, out: [side * .4, 0, 1], boneOf: t => (t < .4 ? B.chest : B.skirtF) });
  if (key === 'b') { S.sub(EL([3.6, 56, 9], [5, 6.4, 5]), { k: 1 }); S.sub(EL([-5, 48, 9.6], [3.4, 4, 4]), { k: .8 }); }      // torn open over the ribs
  return S;
}

// what is inside: hands (always), the skull (skeletal), ribs (skeletal), a glowing face (supernatural)
function inner(D) {
  const S = new Sculpt();
  both(s => K.hand(S, s, 'bone', { r: .9, bony: true }));
  both(s => { const f = p => [s * p[0], p[1], p[2]]; K.boneLimb(S, f([15, 42, 2.4]), f([15.4, 37.6, 3.2]), .7, B['farm' + LR(s)]); });
  if (D.key === 'b') { const sk = K.skull(S, [0, 78.6, 3], { r: 4.8, jawOpen: .2 }); S.eyes = sk.eyes; K.skeleton(S, { ribs: true, spine: false, pelvis: false, arms: false, legs: false, thick: 1.4 }); }
  else if (D.key === 'c') { S.add(EL([0, 78.6, 4.6], [3.6, 4.6, 2.4]), { bone: B.head, tag: 'ghost', k: 1 }); both(s => S.sub(EL([s * 1.5, 79.6, 6.8], [.9, .7, .8]), { k: .3 })); S.sub(EL([0, 75.6, 6.8], [1.2, .7, .8]), { k: .3 }); S.eyes = [[1.5, 79.6, 6.2], [-1.5, 79.6, 6.2]]; }
  else S.eyes = [[1.6, 79, 4.2], [-1.6, 79, 4.2]];
  for (const e of S.eyes) S.add(EL(e, [.75, .55, .5]), { bone: B.head, tag: 'eye', k: .1, c: e });
  return S;
}

// the scythe: a tall snath held upright, a long curved blade sweeping forward from the top
function scythe(D) {
  const S = new Sculpt(), dir = norm([0, 1, .1]), at = t => add(GRIP, mul(dir, t)), fr = frameOf(dir), o = (tag, extra) => Object.assign({ tag, bone: B.weapon, k: .3 }, extra), key = D.key;
  const blade = key === 'b' ? 'rust' : key === 'c' ? 'lightblade' : 'darkmetal';
  let p = at(-28); for (let i = 0; i < 9; i++) { const q = add(at(-28 + (i + 1) * 10.2), [Math.sin(i * .9) * .25, 0, Math.sin(i * .6) * .35]); S.add(RC(p, q, 1, .95), o(key === 'c' ? 'lightwood' : 'wood')); p = q; }
  S.add(RC(at(-6), at(-4), 1.3, 1.3), o('darkmetal')); S.add(RC(at(10), at(12), 1.3, 1.3), o('darkmetal'));                   // grips
  both(s => S.add(RC(at(6), add(at(6), [0, 1, 4.6]), .7, .6), o('wood')));                                                    // the handle peg
  const head = at(64); S.add(EL(head, [1.8, 2.6, 2.4], fr), o('darkmetal'));
  // the blade: a long tapering crescent sweeping forward and down from the top of the snath
  let prev = head, w = 5.4; for (let i = 1; i <= 16; i++) { const a = i / 16, ang = a * 1.95, q = add(head, [Math.sin(a * 2.6) * .8, -Math.pow(a, 1.6) * 17 + Math.sin(ang) * 4, Math.sin(ang * .85) * 36 * (1 - a * .12)]);
    const d = norm(sub(q, prev)), side = norm(F.cross(d, [1, 0, 0])), wid = w * (1 - a * .82) + .2, c = add(mul(add(prev, q), .5), mul(side, -wid * .45));
    S.add(BX(c, [len(sub(q, prev)) * .62, wid * .55, .32], [d, side, F.cross(d, side)], .15), o(blade, { k: .4, edge: a })); prev = q; }
  if (key === 'b') for (const i of [5, 9, 12]) { const a = i / 16; S.sub(EL(add(head, [0, -Math.pow(a, 1.6) * 15 + Math.sin(a * 1.95) * 3 - 2.4, Math.sin(a * 1.95 * .85) * 30 * (1 - a * .12)]), [.9, .9, .9]), { k: .1 }); } // notches
  return S;
}

// supernatural: a halo of soul orbs with faces behind the head
function halo(D) {
  const S = new Sculpt(); if (D.key !== 'c') return S;
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, c = [Math.cos(a) * 13, 86 + Math.sin(a) * 13, -9];
    S.add(EL(c, [2.2, 2.4, 2]), { bone: B.back, tag: 'soul', k: .3, c }); both(s => S.sub(EL(add(c, [s * .7, .5, 1.8]), [.45, .55, .5]), { k: .2 })); S.sub(EL(add(c, [0, -.8, 1.8]), [.5, .7, .5]), { k: .2 }); }
  S.add(TO([0, 86, -9.6], 13, .25, [[1, 0, 0], [0, 0, 1], [0, 1, 0]]), { bone: B.back, tag: 'soul', k: .2, c: [0, 86, -9.6] });
  return S;
}

function custom(D) {
  return ({ p, n, s, tag, fine, big, evalAll }) => {
    const key = D.key, C = D.colors;
    if (tag === 'robe') {
      let c = mixc(mul(C.cloth, .45), C.cloth, clamp(.35 + big * .8 + n[1] * .15, 0, 1)); c = mul(c, .9 + fine * .2);
      // the inside of the hood is darkness
      const inHood = p[1] > 70 && p[2] > 0 && len(sub(p, [0, 78.2, 6.6])) < 7.4 && n[2] < .5; if (inHood) return { c: [.01, .01, .012], sp: 0, gl: 0, ty: 0, st: 0 };
      if (key === 'c') { const fade = clamp((30 - p[1]) / 22 + (fine - .5) * .5, 0, 1); return { c: mixc(c, C.glow, fade), a: 1 - fade * .9, sp: .1, gl: .25, ty: 6, st: .9 * (1 - fade) }; }
      if (key === 'a' && p[1] < 12) return { c: mixc(c, C.glow, clamp((12 - p[1]) / 6, 0, 1) * .5), sp: .1, gl: .25, ty: 6, st: .9 };
      return { c, sp: .08, gl: .2, ty: 6, st: 1 };
    }
    if (tag === 'eye') { const r0 = len(sub(p, s.c)); return { c: mixc(D.eye, [1, 1, 1], clamp(.7 - r0, 0, .6)), a: .03, sp: 1, gl: 1, ty: 0, st: 0 }; }
    if (tag === 'ghost') return { c: mixc(C.bone, C.glow, .5), a: .35, sp: .6, gl: .8, ty: 0, st: 0 };
    if (tag === 'soul') { const q = sub(p, s.c); return { c: mixc(C.glow, [1, 1, 1], clamp(q[2] * .2, 0, .5)), a: .2, sp: .5, gl: .6, ty: 0, st: 0 }; }
    if (tag === 'rust') return { c: mixc([.26, .15, .08], [.45, .3, .2], clamp(fine + big - .5, 0, 1)), sp: .4, gl: .3, ty: 8, st: .9 };
    if (tag === 'lightblade') return { c: C.glow, a: .25, sp: 1, gl: 1, ty: 0, st: 0 };
    if (tag === 'lightwood') return { c: mixc(C.wood, C.glow, .3), sp: .4, gl: .5, ty: 4, st: .6 };
    if (tag === 'darkmetal' && key === 'a' && s.edge > 0) { const nearEdge = evalAll(add(p, mul(n, -.6))) > -.2; return { c: mixc(C.darkmetal, [.16, .17, .18], .5), sp: 1, gl: .9 }; }
    if (tag === 'bone') return { c: mixc(C.bone, mul(C.bone, .45), clamp((1 - n[1]) * .2 + (big - .5) * .6, 0, 1)) };
    return null;
  };
}

function build(variant, { lod = 0 } = {}) {
  const D = Object.assign({}, DESIGN[variant]), t0 = Date.now();
  const cloth = robe(D); cloth.build(4); const body = inner(D); body.build(2.5); const weap = scythe(D); weap.build(3); const ring = halo(D); ring.build(3);
  const R = lod ? [1.2, .6, .9, .7] : [.5, .3, .42, .3];
  const { parts, log } = K.finish(D, [['robe', cloth, R[0], 2.2], ['inner', body, R[1], .6], ['scythe', weap, R[2], .5], ['halo', ring, R[3], .5]], custom(D), { ground: false });
  log.push((Date.now() - t0) + ' ms');
  return { parts, bones: BONES, clips: lod ? null : H.clips({ weight: .2, grip: 0, banner: true, stance: 0, hover: true, kneelDrop: 8, fallDrop: 6 }), log, design: D };
}

module.exports = { build, DESIGN, BONES, B };
