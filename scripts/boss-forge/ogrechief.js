'use strict';
// Ogre Chieftain, Region Boss of the Ashen Barrens: a hulking purple-skinned ogre with a great gut, a small sunk head
// on massive shoulders, a snaggle-toothed underbite, jug ears and a crude crown.
//   A standard   hide loincloth, a crude iron crown, rope belt with pouches, a spiked wooden club
//   B empowered  iron-bound: riveted iron bands on the arms and gut, a pauldron of stacked iron plates, a chain
//                hauling a boulder lashed to a log as a club, a heavier spiked crown
//   C ancient    an ogre shaman: blue painted runes that glow, a feather headdress with bones, totems on its back,
//                a skull-topped totem staff, beads and charms
// Humanoid rig, wider and heavier proportions; units match the other humanoid bosses.
const K = require('./kit');
const { F, H, B, POS: BASE, GRIP, both, rotX, rotZ, frameOf, LR, mixc } = K;
const { roundCone: RC, ellipsoid: EL, torus: TO, box: BX, Sculpt, norm, add, mul, sub, len, clamp, lerp, rng } = F;

const HS = .9, PIV = [0, 70, 2], DROP = [0, -4.5, 3];
const hd = p => [PIV[0] + (p[0] - PIV[0]) * HS, PIV[1] + (p[1] - PIV[1]) * HS, PIV[2] + (p[2] - PIV[2]) * HS];
const SC = shape => F.scaled(shape, PIV, HS), h0 = p => add(p, DROP);
const POS = Object.assign({}, BASE); for (const k of ['head', 'jaw', 'hair']) POS[k] = hd(add(POS[k], DROP));
const BONES = H.bonesFrom(POS);

const DESIGN = [
  { key: 'a', name: 'standard', seed: 1301, colors: { skin: [.46, .36, .6], skinDark: [.24, .17, .34], leather: [.34, .24, .14], fur: [.4, .32, .22], metal: [.36, .34, .32], darkmetal: [.16, .15, .14], trim: [.5, .4, .24], horn: [.8, .76, .6], glow: [.4, .7, 1] }, eye: [1, .8, .3] },
  { key: 'b', name: 'empowered', seed: 1302, colors: { skin: [.42, .3, .56], skinDark: [.2, .13, .3], leather: [.26, .17, .1], fur: [.26, .2, .16], metal: [.34, .34, .36], darkmetal: [.12, .12, .13], trim: [.46, .2, .14], horn: [.8, .76, .6], glow: [1, .4, .2] }, eye: [1, .4, .2] },
  { key: 'c', name: 'ancient', seed: 1303, colors: { skin: [.44, .4, .56], skinDark: [.22, .2, .32], leather: [.3, .22, .14], fur: [.52, .46, .38], metal: [.4, .36, .3], darkmetal: [.16, .14, .12], trim: [.76, .6, .3], horn: [.88, .84, .7], glow: [.35, .75, 1], bone: [.86, .82, .7] }, eye: [.4, .8, 1] },
];

function anatomy(D) {
  const S = new Sculpt(), A = (shape, o) => S.add(shape, Object.assign({ tag: 'skin' }, o));
  K.body(S, { m: 1.5 });
  A(EL([0, 47, 4.6], [13.6, 11.4, 10.4]), { bone: B.spine, k: 4 });                  // the gut
  A(EL([0, 63, -2.6], [13.4, 7.6, 8]), { bone: B.chest, k: 3 });                     // shoulder mass
  both(s => A(EL([s * 9, 68.4, -1], [7, 5, 6.6]), { bone: B.chest, k: 3 }));
  both(s => { const L = LR(s); A(RC([s * 15.6, 48, 1.8], [s * 16.4, 37, 3.6], 4.6, 3.8), { bone: B['farm' + L], k: 1.5 }); A(EL([s * 16, 33.6, 3.8], [3.4, 3.6, 3.6]), { bone: B['hand' + L], k: 1.2 }); }); // big fists
  // a small sunk head: low brow, piggy eyes, bulbous nose, snaggle-toothed underbite, jug ears
  const Hh = (shape, o) => A(SC(shape), Object.assign({ bone: B.head }, o));
  Hh(EL(h0([0, 77, .8]), [5.4, 5, 5.4]), { k: 1.4 }); Hh(EL(h0([0, 78.6, 5]), [5, 1.4, 1.8]), { k: .8 });
  Hh(EL(h0([0, 75.6, 7]), [2.4, 2.2, 2.2]), { k: .8 });
  both(s => S.sub(SC(EL(h0([s * 2.2, 77.4, 6.4]), [.9, .7, .8])), { k: .3 }));
  A(SC(EL(h0([0, 71.4, 5.2]), [5.6, 3, 4.4])), { bone: B.jaw, k: 1.2 });
  both(s => { Hh(EL(h0([s * 6.6, 77, .4]), [1.2, 2.8, 2.2], rotZ(s * -.3)), { k: .5 }); S.sub(SC(EL(h0([s * 7.2, 77, .8]), [.6, 1.6, 1.2])), { k: .2 }); });
  return S;
}

function gear(D) {
  const S = new Sculpt(), o = (tag, bone, extra) => Object.assign({ tag, bone, k: .5 }, extra), key = D.key, R = rng(D.seed);
  // hide loincloth and belt
  S.add(TO([0, 40.4, 3], 13, 1.6, [[1, 0, 0], [0, 1, 0], [0, 0, 1.0]]), o(key === 'b' ? 'darkmetal' : 'leather', B.root));
  for (const [z, b] of [[1, B.skirtF], [-1, B.skirtB]]) { const top = []; for (let i = 0; i <= 5; i++) { const a = (i / 5 - .5) * 1.4; top.push([Math.sin(a) * 11, 39, z * (8 + Math.cos(a) * 3)]); }
    K.sheet(S, top, 20, { bone: b, tag: 'fur', thick: .45, folds: 3, foldDepth: .8, flare: .12, rag: .4, seed: D.seed + z, out: [0, 0, z] }); }
  for (let i = 0; i < 3; i++) S.add(EL([-8 + i * 7, 37, 13], [2.2, 2.6, 1.6]), o('leather', B.root, { k: .4 }));      // pouches
  // legs wrapped in hide, bare feet
  both(s => { const L = LR(s), f = p => [s * p[0], p[1], p[2]]; for (let j = 0; j < 3; j++) S.add(TO(f([7, 12 + j * 4, .8]), 4.4, .5, rotX(.06)), o('leather', B['shin' + L])); });
  // the crown: a crude band of iron spikes (A, B) or a feather headdress (C)
  if (D.horns) both(s => { let p = h0([s * 4.6, 80, 0]), d = norm([s, .4, .2]); for (let i = 0; i < 7; i++) { const q = add(p, mul(d, 3)); S.add(SC(RC(p, q, 2 - i * .24, 1.76 - i * .24)), o('horn', B.head, { k: .2 })); p = q; d = norm(add(d, [s * -.15, .1, .25])); } });
  if (key !== 'c' && !D.noCrown) { const c = h0([0, 80.4, .6]); S.add(SC(TO(c, 5.4, .8, [[1, 0, 0], [0, 1, 0], [0, 0, 1.05]])), o('metal', B.head));
    for (let i = 0; i < (key === 'b' ? 9 : 6); i++) { const a = i / (key === 'b' ? 9 : 6) * Math.PI * 2, b0 = add(c, [Math.sin(a) * 5.4, 0, Math.cos(a) * 5.6]); S.add(SC(RC(b0, add(b0, [Math.sin(a) * .5, key === 'b' ? 5 : 3.4, Math.cos(a) * .5]), .9, .15)), o('metal', B.head, { k: .2 })); } }
  else { const c = h0([0, 80, .2]); S.add(SC(TO(c, 5.4, .9, [[1, 0, 0], [0, 1, 0], [0, 0, 1.05]])), o('leather', B.head));
    for (let i = 0; i < 9; i++) { const a = (i / 8 - .5) * 2.4 + Math.PI, b0 = add(c, [Math.sin(a) * 5, .6, Math.cos(a) * 5.2]), tip = add(b0, [Math.sin(a) * 3, 9 + (1 - Math.abs(i - 4) / 4) * 5, Math.cos(a) * 4]);
      S.add(SC(RC(b0, tip, .4, .15)), o('horn', B.head, { k: .1 })); S.add(SC(EL(mul(add(b0, mul(sub(tip, b0), 1.4)), .58), [.9, 3.6, .3], null)), o('feather', B.head, { k: .3, root: b0, L: 12 })); } }
  // B: iron bands, stacked plate pauldron on the left, plates on the gut
  if (key === 'b') { both(s => { const L = LR(s), f = p => [s * p[0], p[1], p[2]]; for (let j = 0; j < 3; j++) S.add(TO(f([15.8, 46 - j * 3, 2.4]), 4.8, .6, rotX(-.1)), o('darkmetal', B['farm' + L])); });
    for (let j = 0; j < 4; j++) S.add(EL([15 + j * .6, 69 - j * 2.4, 0], [7.4 - j * .5, 2.8, 8 - j * .6], rotZ(-.45)), o(j ? 'metal' : 'trim', B.uarmL, { k: .3 }));
    S.add(EL([0, 46, 14.6], [10, 8, 1.6]), o('darkmetal', B.spine, { k: .8 })); for (let i = 0; i < 8; i++) S.add(EL([(i % 4 - 1.5) * 5, 50 - Math.floor(i / 4) * 7, 15.8], [.6, .6, .6]), o('metal', B.spine, { k: .1 })); }
  // C: totems on the back, beads and charms
  if (key === 'c') { for (const [x, h] of [[-6, 36], [6, 30]]) { const b0 = [x, 56, -12], t = add(b0, [x * .3, h, -3]); S.add(RC(b0, t, 1, .9), o('wood', B.back, { k: .2 }));
      K.skull(S, add(t, [0, 2.6, 0]), { r: 2.4, jawOpen: .3, bone: B.back, jawBone: B.back }); for (let k = 0; k < 3; k++) S.add(SC(EL(add(t, [x * .1, -4 - k * 3, 1.8]), [.7, 2.6, .25])), o('feather', B.back, { k: .2, root: t, L: 9 })); }
    for (let i = 0; i < 13; i++) { const a = (i / 12 - .5) * 2.8, p = [Math.sin(a) * 11.6, 70 - Math.cos(a) * 7, 8 + Math.cos(a) * 4]; S.add(EL(p, [.8, .8, .8]), o(i % 3 ? 'gem' : 'bone', B.chest, { k: .1 })); } }
  return S;
}

// a spiked club (A), a boulder lashed to a log (B), a skull totem staff (C)
function weapon(D) {
  const S = new Sculpt(), key = D.key, dir = norm([0, 1, .3]), at = t => add(GRIP, mul(dir, t)), fr = frameOf(dir), o = (tag, extra) => Object.assign({ tag, bone: B.weapon, k: .3 }, extra), R = rng(D.seed + 9);
  if (key === 'a') { S.add(RC(at(-6), at(30), 1.6, 4.4), o('wood', { k: .6 })); for (let i = 0; i < 12; i++) { const t = 14 + R() * 16, a = R() * Math.PI * 2, r = 1.6 + (t + 6) / 36 * 2.8, n = add(mul(fr[0], Math.cos(a)), mul(fr[2], Math.sin(a))); S.add(RC(add(at(t), mul(n, r - .4)), add(at(t), mul(n, r + 2.2)), .5, .08), o('metal', { k: .1 })); } }
  else if (key === 'b') { S.add(RC(at(-6), at(30), 1.8, 2.2), o('wood')); const b = at(32); S.add(EL(b, [6.4, 5.6, 6]), o('stone', { k: .8 })); for (let i = 0; i < 5; i++) S.sub(EL(add(b, [(R() - .5) * 10, (R() - .5) * 9, (R() - .5) * 10]), [2, 2, 2]), { k: .6 });
    for (let j = 0; j < 3; j++) S.add(TO(add(b, [0, (j - 1) * 3, 0]), 6.2, .45, [[1, 0, 0], [0, .4, .9], [0, -.9, .4]]), o('darkmetal')); for (const t of [-4, 6, 16, 26]) S.add(TO(at(t), 2.1, .5, fr), o('darkmetal')); }
  else { S.add(RC(at(-12), at(44), 1.1, 1.1), o('wood')); const top = at(48); K.skull(S, top, { r: 3.6, jawOpen: .3, bone: B.weapon, jawBone: B.weapon });
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; S.add(SC(EL(add(top, [Math.cos(a) * 3, -4, Math.sin(a) * 3]), [.6, 3, .2])), o('feather', { root: top, L: 8 })); }
    S.add(EL(add(top, [0, 5.4, 0]), [1.6, 1.6, 1.6]), o('glow', { k: .2 })); for (const t of [0, 20, 36]) S.add(TO(at(t), 1.4, .4, fr), o('leather')); }
  return S;
}

function details(D) {
  const S = new Sculpt();
  both(s => S.add(SC(EL(h0([s * 2.2, 77.4, 6.8]), [.7, .5, .5])), { bone: B.head, tag: 'eye', k: .1, c: hd(h0([s * 2.2, 77.4, 6.8])) }));
  const tusk = (x, l, tilt) => { const b0 = h0([x, 72.4, 8]); S.add(SC(RC(b0, add(b0, [tilt, l, .6]), .8, .2)), { bone: B.jaw, tag: 'tooth', k: .2, root: b0, L: l }); };
  tusk(-2.4, D.key === 'b' ? 4.6 : 3.6, -.4); tusk(1.6, 2, .3); if (D.key !== 'a') tusk(3, 2.6, .5);
  if (D.key === 'b' || D.noseRing) both(s => S.add(SC(TO(h0([s * 1.4, 75.2, 8.6]), .7, .2, rotX(Math.PI / 2))), { bone: B.head, tag: 'metal', k: .05 })); // a nose ring
  return S;
}

const RUNES = [[[-9, 60, 9], [-3, 52, 13]], [[9, 60, 9], [3, 52, 13]], [[-14, 62, 2], [-16, 52, 2]], [[14, 62, 2], [16, 52, 2]], [[0, 44, 15], [0, 54, 13]]];
const segDist = (p, a, b) => { const ab = sub(b, a), t = clamp(F.dot(sub(p, a), ab) / F.dot(ab, ab), 0, 1); return len(sub(p, add(a, mul(ab, t)))); };
function custom(D) {
  return ({ p, n, s, tag, fine, big }) => {
    if (tag === 'eye') { const q = mul(sub(p, s.c), 1 / HS), r0 = Math.hypot(q[0], q[1] * 1.6); return { c: mixc(mul(D.eye, .45), mixc(D.eye, [1, 1, .8], .6), clamp(1.1 - r0, 0, 1)), a: .05, sp: 1, gl: 1, ty: 0, st: 0 }; }
    if (tag === 'skin') { let c = mixc(D.colors.skin, D.colors.skinDark, clamp(.3 + (big - .5) * .9 - n[1] * .15, 0, 1)); c = mul(c, .9 + fine * .2);
      if (D.key === 'c') { let dm = 9; for (const [a, b] of RUNES) dm = Math.min(dm, segDist(p, a, b)); if (dm < .7) return { c: D.colors.glow, a: .1, sp: .5, gl: .5, ty: 0, st: 0 }; }
      if (D.key === 'a' && F.noise3(p[0] * .4, p[1] * .4, p[2] * .4, 2) > .72) c = mixc(c, [.3, .22, .2], .4); // warts and blotches
      return { c, sp: .4, gl: .5, ty: 3, st: .9 }; }
    if (tag === 'feather') { const t = s.root && s.L ? clamp(len(sub(p, s.root)) / s.L, 0, 1) : .5; return { c: mixc([.2, .14, .1], t > .7 ? [.9, .3, .15] : [.85, .82, .74], t), sp: .2, gl: .35, ty: 6, st: .6 }; }
    if (tag === 'stone') return { c: mul([.42, .4, .38], .8 + fine * .3), sp: .2, gl: .35, ty: 5, st: 1 };
    return null;
  };
}

function build(variant, opts) { return buildWith(DESIGN[variant], opts); }
function buildWith(design, { lod = 0 } = {}) {
  const D = Object.assign({}, design), t0 = Date.now();
  const body = anatomy(D); body.build(4); const g = gear(D); g.build(3); const weap = weapon(D); weap.build(3); const fine = details(D); fine.build(2);
  const R = D.res ? (lod ? D.res[1] : D.res[0]) : lod ? [1.3, 1.2, 1, .4] : [.56, .5, .45, .18];
  const { parts, log } = K.finish(D, [['body', body, R[0], 1.8], ['gear', g, R[1], .8], ['weapon', weap, R[2], .5], ['detail', fine, R[3], .5]], custom(D));
  log.push((Date.now() - t0) + ' ms');
  return { parts, bones: BONES, clips: lod ? null : H.clips({ weight: 1, grip: -.15, stance: 1 }), log, design: D };
}
module.exports = { build, buildWith, DESIGN, BONES, B };
