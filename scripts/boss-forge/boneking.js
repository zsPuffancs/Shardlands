'use strict';
// The Bone King, Region Boss of the Ashen Barrens: a crowned skeleton tyrant in royal robes (no plate: that is the
// Ossuary King), an oversized skull, a femur-and-skull sceptre-mace.
//   A standard   a gold crown, a faded crimson tabard and ermine-trimmed mantle, a bone sceptre-mace
//   B empowered  a fan of fused bones rising behind him like a throne back, spectral green chains from both wrists,
//                bone spurs on the shoulders, a heavier mace studded with teeth
//   C ancient    a lich: a tall jewelled crown, a soul lantern in the left hand, glowing runes cut into every bone,
//                a black robe with gold embroidery, eyes and ribcage lit from within
// Humanoid rig; units match the other humanoid bosses (top ~95).
const K = require('./kit');
const { F, H, B, POS: BASE, GRIP, both, rotX, rotZ, frameOf, LR, mixc } = K;
const { roundCone: RC, ellipsoid: EL, torus: TO, box: BX, Sculpt, norm, add, mul, sub, len, clamp, lerp, rng } = F;

const POS = Object.assign({}, BASE);
const BONES = H.bonesFrom(POS);
const SK = [0, 77, 1.6], SKR = 6.6; // an oversized skull

const DESIGN = [
  { key: 'a', name: 'standard', seed: 1201, colors: { bone: [.84, .79, .64], metal: [.4, .38, .34], trim: [.9, .7, .28], cloth: [.46, .08, .08], fur: [.92, .9, .84], leather: [.24, .16, .1], gem: [.8, .1, .12], glow: [.45, 1, .55] }, eye: [.45, 1, .55] },
  { key: 'b', name: 'empowered', seed: 1202, colors: { bone: [.8, .76, .6], metal: [.3, .3, .3], trim: [.8, .6, .22], cloth: [.32, .05, .06], fur: [.8, .78, .72], leather: [.2, .13, .08], gem: [.2, .9, .4], glow: [.35, 1, .5] }, eye: [.35, 1, .5] },
  { key: 'c', name: 'ancient', seed: 1203, colors: { bone: [.74, .72, .62], metal: [.22, .2, .24], trim: [.95, .78, .32], cloth: [.06, .05, .07], fur: [.2, .18, .22], leather: [.12, .1, .1], gem: [.2, 1, .6], glow: [.4, 1, .7] }, eye: [.4, 1, .75] },
];

function anatomy(D) {
  const S = new Sculpt();
  K.skeleton(S, { thick: 1.35, scale: 1.08 });
  K.skull(S, SK, { r: SKR, jawOpen: .16 });
  return S;
}

function robes(D) {
  const S = new Sculpt(), o = (tag, bone, extra) => Object.assign({ tag, bone, k: .5 }, extra), key = D.key;
  // tabard front and back from the collar to the knees, a sash belt, the mantle over the shoulders
  for (const [z, b, w] of [[1, B.skirtF, 7.5], [-1, B.skirtB, 8.5]]) { const top = []; for (let i = 0; i <= 5; i++) { const a = (i / 5 - .5) * 1.4; top.push([Math.sin(a) * w, 66, z * (4.6 + Math.cos(a) * 2.2)]); }
    K.sheet(S, top, 50, { bone: b, tag: 'cloth', thick: .5, folds: 4, foldDepth: .9, flare: .1, rag: key === 'c' ? .1 : .3, seed: D.seed + z, out: [0, 0, z], boneOf: t => (t < .5 ? B.chest : b) }); }
  S.add(TO([0, 43, .6], 8.6, 1.1, [[1, 0, 0], [0, 1, 0], [0, 0, 1.1]]), o('trim', B.root));
  S.add(EL([0, 66.6, -.6], [14.6, 4.2, 8.4]), o('fur', B.chest, { k: 1.6 }));                        // ermine (A, B) / black fur (C) mantle
  both(s => { const L = LR(s), f = p => [s * p[0], p[1], p[2]];
    S.add(EL(f([13.2, 66.6, 0]), [5, 3.4, 6]), o('fur', B['uarm' + L], { k: 1 }));
    S.add(RC(f([14.4, 47, 1.6]), f([15.2, 40, 3]), 2.2, 2), o('trim', B['farm' + L], { k: .3 }));     // gold cuffs
    if (key === 'b') for (let j = 0; j < 4; j++) S.add(RC(f([13 + j * 1.6, 70 - j, -2 + j * 1.2]), f([16 + j * 2.6, 78 - j * .4, -4 + j * 1.4]), 1.1, .1), o('bone', B['uarm' + L], { k: .2 })); });
  // the crown
  const c = SK, r = SKR;
  S.add(TO([c[0], c[1] + r * .72, c[2] - .3], r * .9, .9, [[1, 0, 0], [0, 1, 0], [0, 0, 1.05]]), o('trim', B.head, { k: .3 }));
  const spikes = key === 'c' ? 9 : 7, tall = key === 'c' ? 9 : 4.5;
  for (let i = 0; i < spikes; i++) { const a = i / spikes * Math.PI * 2, b0 = [c[0] + Math.sin(a) * r * .9, c[1] + r * .72, c[2] - .3 + Math.cos(a) * r * .95], l = tall * (i % 2 ? .6 : 1);
    S.add(RC(b0, add(b0, [Math.sin(a) * .8, l, Math.cos(a) * .8]), 1, .2), o('trim', B.head, { k: .2 })); if (!(i % 2)) S.add(EL(add(b0, [0, 1.4, 0]), [.7, .9, .5]), o('gem', B.head, { k: .1 })); }
  if (key === 'c') S.add(EL([c[0], c[1] + r * .72 + 2.6, c[2] + r * .95], [1.6, 2.2, .9]), o('gem', B.head, { k: .2 }));
  // B: a fan of fused bones rising behind him, a throne back
  if (key === 'b') { for (let i = 0; i < 11; i++) { const a = (i / 10 - .5) * 2.2, b0 = [Math.sin(a) * 6, 58, -9], l = 26 + Math.cos(a) * 14, tip = add(b0, [Math.sin(a) * l * .7, Math.cos(a) * l, -6]);
      K.boneLimb(S, b0, tip, 1.1, B.back, { tag: 'bone' }); }
    for (const y of [72, 86]) S.add(TO([0, y, -12.6], 14 + (y - 72) * .3, .8, rotX(Math.PI / 2 - .2)), o('bone', B.back, { k: .3 })); }
  return S;
}

// the sceptre-mace: a femur haft topped with a skull bound in gold (A), studded with teeth (B); the lich holds a staff
function weapon(D) {
  const S = new Sculpt(), key = D.key, dir = norm([0, 1, .2]), at = t => add(GRIP, mul(dir, t)), fr = frameOf(dir), o = (tag, extra) => Object.assign({ tag, bone: B.weapon, k: .3 }, extra);
  K.boneLimb(S, at(-8), at(key === 'c' ? 40 : 26), 1.2, B.weapon);
  const head = at(key === 'c' ? 44 : 30); K.skull(S, head, { r: key === 'b' ? 4.4 : 3.6, jawOpen: .4, bone: B.weapon, jawBone: B.weapon });
  S.add(TO(add(head, [0, -2.6, 0]), 3.4, .6, fr), o('trim'));
  if (key === 'b') for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; S.add(RC(add(head, [Math.cos(a) * 4, -1 + (i % 2) * 2, Math.sin(a) * 4]), add(head, [Math.cos(a) * 7, -1 + (i % 2) * 2, Math.sin(a) * 7]), .8, .1), o('tooth', { k: .1 })); }
  if (key === 'c') S.add(EL(add(head, [0, 5.4, 0]), [2.2, 2.6, 2.2]), o('glow', { k: .4 }));
  return S;
}

function details(D) {
  const S = new Sculpt(), r = SKR, c = SK;
  both(s => S.add(EL([c[0] + s * .38 * r, c[1] + .02 * r, c[2] + .78 * r], [1.4, 1.3, 1]), { bone: B.head, tag: 'eye', k: .1, c: [c[0] + s * .38 * r, c[1], c[2] + .78 * r] }));
  // B: spectral chains hanging from both wrists
  if (D.key === 'b') both(s => { const L = LR(s); let p = [s * 15.4, 38, 3]; for (let i = 0; i < 9; i++) { const q = add(p, [s * .5, -2.2, (i % 2 ? .6 : -.6)]); S.add(TO(mul(add(p, q), .5), 1, .3, i % 2 ? null : rotZ(Math.PI / 2)), { bone: B['hand' + L], tag: 'glow', k: .05 }); p = q; } });
  // C: the soul lantern in the left hand and a light inside the ribcage
  if (D.key === 'c') { const h = [16, 30, 4]; for (let i = 0; i < 3; i++) S.add(RC(add(h, [0, 4.4 - i * 1.5, 0]), add(h, [0, 3 - i * 1.5, 0]), .2, .2), { bone: B.handL, tag: 'metal', k: .1 });
    S.add(BX(add(h, [0, -2, 0]), [2.2, 3, 2.2], null, .4), { bone: B.handL, tag: 'metal', k: .2 }); S.add(EL(add(h, [0, -2, 0]), [1.8, 2.6, 1.8]), { bone: B.handL, tag: 'glow', k: .2 });
    S.add(EL([0, 57, 0], [3.4, 4.4, 2.6]), { bone: B.chest, tag: 'glow', k: .4 }); }
  return S;
}

function custom(D) {
  return ({ p, n, s, tag, fine, big }) => {
    if (tag === 'eye') { const q = sub(p, s.c), r0 = Math.hypot(q[0], q[1]); return { c: mixc(D.eye, [1, 1, 1], clamp(.8 - r0 * .4, 0, .6)), a: .04, sp: 1, gl: 1, ty: 0, st: 0 }; }
    if (tag === 'bone' && D.key === 'c' && Math.abs(F.noise3(p[0] * .5, p[1] * .9, p[2] * .5, 7) - .5) < .025) return { c: D.colors.glow, a: .08, sp: .5, gl: .5, ty: 0, st: 0 };
    if (tag === 'bone') { const grime = clamp((big - .45) * 1.4 + (1 - n[1]) * .1, 0, 1); return { c: mul(mixc(D.colors.bone, [.38, .32, .24], grime * .6), .92 + fine * .16) }; }
    if (tag === 'cloth' && D.key === 'c' && Math.abs(Math.sin(p[1] * .9 + Math.sin(p[0] * .7) * 2)) < .08) return { c: D.colors.trim, sp: .9, gl: .8, ty: 8, st: .4 };
    if (tag === 'fur' && D.key !== 'c' && F.noise3(p[0] * .9, p[1] * .9, p[2] * .9, 3) > .74) return { c: [.08, .08, .08] }; // ermine spots
    return null;
  };
}

function build(variant, { lod = 0 } = {}) {
  const D = Object.assign({}, DESIGN[variant]), t0 = Date.now();
  const body = anatomy(D); body.build(3); const cloth = robes(D); cloth.build(3); const weap = weapon(D); weap.build(3); const fine = details(D); fine.build(2);
  const R = lod ? [1, 1.2, .9, .4] : [.38, .5, .36, .2];
  const { parts, log } = K.finish(D, [['body', body, R[0], .8], ['robes', cloth, R[1], .8], ['weapon', weap, R[2], .5], ['detail', fine, R[3], .5]], custom(D));
  log.push((Date.now() - t0) + ' ms');
  return { parts, bones: BONES, clips: lod ? null : H.clips({ weight: .7, grip: -.1, banner: D.key === 'b', stance: .6 }), log, design: D };
}
module.exports = { build, DESIGN, BONES, B };
