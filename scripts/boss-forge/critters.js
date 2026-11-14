'use strict';
// Meadows basic enemies on shared rigs at an ordinary-enemy budget:
//   Green Slime   the King Slime's soft-body rig without the regalia: a wobbling jelly drop with bubbles and big eyes;
//                 Alpha: darker toxic jelly with a ring of crystal spines
//   Tusk Boar     the quadruped rig: a high shoulder hump, a bristly mane ridge, a long flat snout, upturned tusks,
//                 tufted ears, short legs with cloven hooves, a curly tail; Alpha: hide plates over the back, a second
//                 larger pair of tusks, a taller mane, red eyes
//   Shroomling    the humanoid rig: a walking mushroom, a broad spotted cap with gills, a stout stem with a scowling
//                 face, stubby arms and feet; Alpha: glowing spots and gills, a ragged veil, warts on the stem
const K = require('./kit');
const F = require('./forge');
const V = require('./varcolac');
const A = require('./alphawolf');
const Slime = require('./kingslime');
const { mixc, both } = K;
const { roundCone: RC, ellipsoid: EL, torus: TO, box: BX, Sculpt, norm, add, mul, sub, len, clamp, lerp, rng } = F;

// ---------------- slime ----------------
const SLIME = [
  { key: 'n', noCrown: 1, seed: 6101, jelly: [.32, .82, .38], deep: [.1, .45, .16], core: [.75, 1, .55], colors: { glow: [.6, 1, .5], gem: [.5, 1, .4] }, eye: [.05, .05, .05], res: [[.9, .6, .5], [1.8, 1.1, 1]] },
  { key: 'n', noCrown: 1, spines: 1, seed: 6102, jelly: [.2, .55, .14], deep: [.05, .24, .05], core: [.85, 1, .25], colors: { glow: [.7, 1, .2], gem: [.6, 1, .3] }, eye: [.6, 0, 0], res: [[.9, .6, .5], [1.8, 1.1, 1]] },
];

// ---------------- boar (quadruped rig) ----------------
const { B: QB, BONES: QBONES } = A;
const BOAR = [
  { seed: 6201, hide: [.36, .24, .16], dark: [.16, .1, .07], snout: [.62, .46, .4], tusk: [.92, .88, .76], eye: [.1, .05, .02], colors: { fur: [.36, .24, .16], horn: [.92, .88, .76], glow: [1, .3, .1] } },
  { seed: 6202, alpha: 1, hide: [.28, .18, .12], dark: [.1, .06, .05], snout: [.55, .38, .34], tusk: [.95, .9, .78], eye: [1, .2, .1], colors: { fur: [.28, .18, .12], horn: [.95, .9, .78], bone: [.7, .6, .45], glow: [1, .3, .1] } },
];
function boarBody(D) {
  const S = new Sculpt(), Aa = (sh, o) => S.add(sh, Object.assign({ tag: 'hide' }, o));
  // a wedge-shaped body: high heavy shoulders, sloping to small hips; legs short and thin
  Aa(EL([0, 30, 6], [11, 12, 12]), { bone: QB.chest, k: 3 }); Aa(EL([0, 36.4, 4], [8, 6.6, 9]), { bone: QB.chest, k: 3 });   // hump
  Aa(EL([0, 27, -6], [9.6, 10, 11]), { bone: QB.root, k: 3 }); Aa(EL([0, 26, -15], [8.4, 8.4, 7]), { bone: QB.hips, k: 3 });
  // head: a long wedge ending in a flat disc snout
  Aa(RC([0, 32, 13], [0, 30, 22], 7, 5.4), { bone: QB.neck, k: 2.4 });
  Aa(RC([0, 29.6, 22], [0, 25.6, 33], 5, 3.2), { bone: QB.head, k: 1.6 });
  S.add(EL([0, 25.2, 33.6], [3.2, 2.8, 1.2]), { bone: QB.head, tag: 'snout', k: .6 }); both(s => S.sub(EL([s * 1.1, 25.2, 34.6], [.6, .8, .6]), { k: .2 }));
  Aa(RC([0, 24.4, 24], [0, 23, 31], 2.8, 2), { bone: QB.jaw, k: 1 });
  both(s => { S.sub(EL([s * 3, 31, 25.6], [.8, .6, .7]), { k: .2 });
    Aa(RC([s * 3.4, 33.6, 20], [s * 5.6, 37.6, 18], 1.6, .3), { bone: s > 0 ? QB.earL : QB.earR, k: .6 }); });
  both(s => { const b = s > 0 ? 0 : 4, f = p => [s * p[0], p[1], p[2]];
    Aa(RC(f([6.6, 27, 9]), f([6.6, 13, 8]), 4.6, 2.2), { bone: QB.flShoulder + b, k: 1.8 }); Aa(RC(f([6.6, 13, 8]), f([6.4, 3, 9]), 2.6, 2), { bone: QB.flElbow + b, k: 1 });
    S.add(EL(f([6.4, 1.8, 9.6]), [1.8, 1.8, 2.2]), { bone: QB.flPaw + b, tag: 'hoof', k: .5 });
    Aa(RC(f([6, 25, -15]), f([6.4, 14, -10]), 4.6, 2.4), { bone: QB.hlHip + b, k: 2 }); Aa(RC(f([6.4, 14, -10]), f([6.4, 3, -15]), 2.6, 2), { bone: QB.hlKnee + b, k: 1 });
    S.add(EL(f([6.4, 1.8, -14.4]), [1.8, 1.8, 2.2]), { bone: QB.hlPaw + b, tag: 'hoof', k: .5 }); });
  // a thin curly tail
  let p = [0, 27, -20.6], d = [0, .3, -1]; for (let i = 0; i < 6; i++) { const q = add(p, mul(norm(d), 1.4)); Aa(RC(p, q, .6, .5), { bone: QB.tail1 + Math.min(3, i >> 1), k: .3 }); p = q; d = [Math.sin(i * 1.4), Math.cos(i * 1.4), -.4]; }
  return S;
}
function boarDetails(D) {
  const S = new Sculpt();
  both(s => {
    // tusks curving up and back from the lower jaw (alpha: a second, larger pair)
    const tusk = (b0, l, r) => { let p = b0, dd = [s * .5, .7, -.15]; for (let i = 0; i < 5; i++) { const q = add(p, mul(norm(dd), l / 5)); S.add(RC(p, q, r * (1 - i / 6), r * (1 - (i + 1) / 6) + .05), { bone: QB.jaw, tag: 'tusk', k: .1, root: b0, L: l }); p = q; dd = add(dd, [s * -.08, .02, -.2]); } };
    tusk([s * 2.4, 24, 29.6], 8, .9); if (D.alpha) tusk([s * 2.8, 24.4, 26.6], 11, 1.2);
    S.add(EL([s * 3, 31, 25.8], [.7, .5, .55]), { bone: QB.head, tag: 'eye', k: .1 });
  });
  // the bristly mane ridge from the brow along the hump (taller on the alpha), hide plates on the alpha
  for (let i = 0; i < 18; i++) { const z = 26 - i * 2.4, y = z > 14 ? 33 + (26 - z) * .3 : z > 0 ? 41 - (14 - z) * .1 : 39.6 - Math.abs(z) * .4, b = [0, y - 1, z], h = (D.alpha ? 7 : 4.6) * (i < 4 ? .6 : i > 13 ? .5 : 1);
    S.add(RC(b, add(b, [0, h, -h * .4]), 1.3, .15), { bone: z > 14 ? QB.neck : z > 0 ? QB.chest : QB.root, tag: 'bristle', k: .4, root: b, L: h }); }
  if (D.alpha) for (let i = 0; i < 5; i++) S.add(EL([0, 39 - i * .8, 6 - i * 5], [7 - i * .4, 1.4, 3.2]), { bone: i < 2 ? QB.chest : QB.root, tag: 'plate', k: .5 });
  return S;
}
function boarCustom(D) {
  return ({ p, n, s, tag, fine, big }) => {
    const t = s.root && s.L ? clamp(len(sub(p, s.root)) / s.L, 0, 1) : .5;
    if (tag === 'hide') { const c = mixc(D.hide, D.dark, clamp((n[1] + .2) * .7 + (big - .5) * .6, 0, 1)); return { c: mul(c, .88 + fine * .24), sp: .2, gl: .3, ty: 1, st: 1 }; }
    if (tag === 'snout') return { c: D.snout, sp: .5, gl: .6, ty: 3, st: .4 };
    if (tag === 'hoof') return { c: [.1, .08, .07], sp: .6, gl: .7, ty: 4, st: .5 };
    if (tag === 'tusk') return { c: mixc([.7, .64, .5], D.tusk, t), sp: .6, gl: .7, ty: 4, st: .3 };
    if (tag === 'bristle') return { c: mixc(D.dark, [.5, .42, .34], t * .6), sp: .1, gl: .2, ty: 1, st: 1 };
    if (tag === 'plate') return { c: mul([.5, .42, .32], .8 + fine * .3), sp: .4, gl: .5, ty: 4, st: .8 };
    if (tag === 'eye') return { c: D.eye, a: D.alpha ? .05 : 1, sp: 1, gl: 1, ty: 0, st: 0 };
    return null;
  };
}
function boarBuild(variant, { lod = 0 } = {}) {
  const D = Object.assign({}, BOAR[variant]), b = boarBody(D); b.build(3.5); const d = boarDetails(D); d.build(2);
  const R = lod ? [1.6, 1] : [.8, .4];
  const { parts, log } = K.finish(D, [['body', b, R[0], 2], ['detail', d, R[1], .5]], boarCustom(D));
  return { parts, bones: QBONES, clips: lod ? null : V.clips(Object.assign({ hunch: 0, key: 'a' }, { eclipseRot: (ph, E) => E(0, 0, 0) })), log };
}

// ---------------- shroomling (humanoid rig) ----------------
const { H, B: HB, POS } = K;
const SBONES = H.bonesFrom(POS);
const SHROOM = [
  { seed: 6301, cap: [.78, .22, .16], spot: [.98, .95, .88], stem: [.9, .86, .74], gill: [.8, .7, .6], eye: [.05, .05, .05], colors: { glow: [.6, 1, .5] } },
  { seed: 6302, alpha: 1, cap: [.6, .12, .2], spot: [.7, 1, .5], stem: [.84, .8, .68], gill: [.6, 1, .5], eye: [.7, 1, .4], colors: { glow: [.6, 1, .5] } },
];
function shroomBody(D) {
  const S = new Sculpt(), R = rng(D.seed);
  // a stout stem from the hips to the head, slightly bulbous at the base, with stubby legs and arms
  S.add(RC([0, 18, 0], [0, 54, 1], 13, 10.4), { bone: HB.spine, tag: 'stem', k: 3 }); S.add(RC([0, 54, 1], [0, 64, 1], 10.4, 9), { bone: HB.chest, tag: 'stem', k: 3 }); S.add(EL([0, 22, 0], [14, 10, 13]), { bone: HB.root, tag: 'stem', k: 4 });
  both(s => { const L = s > 0 ? 'L' : 'R', f = p => [s * p[0], p[1], p[2]];
    S.add(RC(f([6, 14, 0]), f([7, 4, 1]), 4.6, 3.6), { bone: HB['thigh' + L], tag: 'stem', k: 1.6 }); S.add(EL(f([7, 2.6, 3]), [4, 2.6, 5.4]), { bone: HB['foot' + L], tag: 'stem', k: 1.2 });
    S.add(RC(f([11, 48, 0]), f([16, 36, 3]), 3.4, 2.6), { bone: HB['uarm' + L], tag: 'stem', k: 1.4 }); S.add(EL(f([16.4, 33.6, 3.6]), [2.8, 3, 2.8]), { bone: HB['hand' + L], tag: 'stem', k: 1 }); });
  // the cap: a broad dome over the head, gills underneath
  const C = new Sculpt(); S.cap = C; C.add(EL([0, 66, 0], [26, 13, 24]), { bone: HB.chest, tag: 'cap', k: 2 }); C.sub(EL([0, 54, 0], [27, 9, 25]), { k: 2 });
  for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; S.add(RC([Math.cos(a) * 9, 59, Math.sin(a) * 8.6], [Math.cos(a) * 23, 57.6, Math.sin(a) * 21.4], .4, .3), { bone: HB.chest, tag: 'gill', k: .3 }); }
  if (D.alpha) for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; S.add(RC([Math.cos(a) * 22, 57, Math.sin(a) * 20.4], [Math.cos(a) * 21, 46 - (i % 3) * 2, Math.sin(a) * 19.4], .9, .3), { bone: HB.chest, tag: 'veil', k: .4 }); }
  // the face on the stem: deep eyes under scowling brows, a frown
  both(s => { S.sub(EL([s * 4, 46, 11], [2, 2.4, 2]), { k: .4 }); S.add(RC([s * 6.6, 50.6, 10.4], [s * 1.6, 48.8, 12], .9, .8), { bone: HB.chest, tag: 'stem', k: .4 }); });
  S.sub(EL([0, 39, 12], [4, 1, 2]), { k: .3 });
  if (D.alpha) for (let i = 0; i < 12; i++) S.add(EL([(R() - .5) * 20, 22 + R() * 30, (R() - .5) * 20], [1.2, 1.2, 1.2]), { bone: HB.chest, tag: 'wart', k: .4 });
  return S;
}
function shroomDetails(D) {
  const S = new Sculpt(), R = rng(D.seed + 3);
  both(s => S.add(EL([s * 4, 46, 10.6], [1.4, 1.8, 1]), { bone: HB.chest, tag: 'eye', k: .1 }));
  for (let i = 0; i < 18; i++) { const a = R() * Math.PI * 2, rr = R() * .8, x = Math.cos(a) * 25 * rr, z = Math.sin(a) * 23 * rr, y = 66 + 13 * Math.sqrt(Math.max(0, 1 - rr * rr)) - .3;
    S.add(EL([x, y, z], [lerp(2.4, 4.4, R()), 1.5, lerp(2.4, 4.4, R())]), { bone: HB.chest, tag: 'spot', k: .3 }); }
  return S;
}
function shroomCustom(D) {
  return ({ p, n, s, tag, fine, big }) => {
    if (tag === 'stem' || tag === 'wart') return { c: mul(mixc(D.stem, mul(D.stem, .7), clamp((big - .4) * 1.2, 0, 1)), .92 + fine * .12), sp: .2, gl: .35, ty: 3, st: .7 };
    if (tag === 'cap') return { c: mul(mixc(D.cap, mul(D.cap, .65), clamp((big - .4) * 1.2 + (1 - n[1]) * .3, 0, 1)), .92 + fine * .12), sp: .5, gl: .6, ty: 3, st: .4 };
    if (tag === 'gill') return { c: D.gill, a: D.alpha ? .2 : 1, sp: .1, gl: .2, ty: 6, st: .8 };
    if (tag === 'veil') return { c: [.92, .9, .84], a: .9, sp: .1, gl: .2, ty: 6, st: .8 };
    if (tag === 'spot') return { c: D.spot, a: D.alpha ? .1 : 1, sp: .3, gl: .4, ty: 3, st: .3 };
    if (tag === 'eye') return { c: D.eye, a: D.alpha ? .05 : 1, sp: 1, gl: 1, ty: 0, st: 0 };
    return null;
  };
}
function shroomBuild(variant, { lod = 0 } = {}) {
  const D = Object.assign({}, SHROOM[variant]), b = shroomBody(D); b.build(3.5); const cap = b.cap; cap.build(3); const d = shroomDetails(D); d.build(2);
  const R = lod ? [1.9, 1.3] : [1.05, .8];
  const { parts, log } = K.finish(D, [['body', b, R[0], 2], ['cap', cap, R[0], 2], ['detail', d, R[1], .5]], shroomCustom(D));
  return { parts, bones: SBONES, clips: lod ? null : H.clips({ weight: .8, stance: .3, kneelDrop: 8, fallDrop: 8 }), log };
}

module.exports = {
  slime: { build: (v, o) => Slime.buildWith(SLIME[v], o) },
  boar: { build: boarBuild },
  shroom: { build: shroomBuild },
};
