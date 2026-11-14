'use strict';
// Void Lord, Region Boss of Voidreach: a tall void sorcerer in layered robes (not a skeleton king), a horned crown of
// black crystal over a hollow, shadowed face with burning violet eyes, a staff holding a void orb.
//   A standard   layered violet robes with a high collar, a horned crystal crown, the orb staff, floating shards
//   B empowered  crystal-armoured: black crystal pauldrons and gauntlets, crystal growths along the spine and
//                robe hem, a larger staff with a crystal blade beneath the orb
//   C ancient    an ascended rift god: a halo ring of runes behind the head, a second ring at the waist, wings of
//                floating crystal blades, the robe dissolving into void light at the hem, it hovers
// Humanoid rig; units match the other humanoid bosses.
const K = require('./kit');
const { F, H, B, POS: BASE, GRIP, both, rotX, rotZ, frameOf, LR, mixc } = K;
const { roundCone: RC, ellipsoid: EL, torus: TO, box: BX, Sculpt, norm, add, mul, sub, len, clamp, lerp, rng } = F;

const POS = Object.assign({}, BASE);
const BONES = H.bonesFrom(POS);
const DESIGN = [
  { key: 'a', name: 'standard', seed: 1501, colors: { skin: [.2, .16, .26], cloth: [.24, .12, .38], cloth2: [.1, .06, .16], trim: [.7, .55, .9], crystal: [.12, .06, .2], glow: [.8, .3, 1], darkmetal: [.1, .08, .14] }, eye: [.9, .35, 1] },
  { key: 'b', name: 'empowered', seed: 1502, colors: { skin: [.18, .14, .24], cloth: [.18, .08, .3], cloth2: [.07, .04, .12], trim: [.8, .4, 1], crystal: [.1, .05, .18], glow: [.95, .3, 1], darkmetal: [.08, .06, .12] }, eye: [1, .3, 1] },
  { key: 'c', name: 'ancient', seed: 1503, colors: { skin: [.22, .18, .3], cloth: [.12, .08, .26], cloth2: [.04, .03, .1], trim: [1, .8, .5], crystal: [.14, .08, .24], glow: [.6, .5, 1], darkmetal: [.08, .06, .14] }, eye: [.75, .7, 1] },
];

function anatomy(D) {
  const S = new Sculpt();
  K.body(S, { m: .95, legs: true });
  // a long, gaunt head, hollow-cheeked, hidden in a hood-shadow
  S.add(EL([0, 76.6, 1.6], [4.6, 6, 5]), { bone: B.head, tag: 'skin', k: 1.2 }); both(s => S.sub(EL([s * 2, 77, 6], [1.2, .9, 1]), { k: .3 }));
  S.add(EL([0, 72, 3.6], [3.4, 2.4, 3]), { bone: B.jaw, tag: 'skin', k: .8 });
  return S;
}

function robes(D) {
  const S = new Sculpt(), key = D.key, o = (tag, bone, extra) => Object.assign({ tag, bone, k: .5 }, extra);
  // a fitted inner robe, a flared outer robe to the ground, open in front; sleeves widening to the wrist; a high collar
  S.add(EL([0, 58, .6], [14.4, 12.4, 10]), o('cloth', B.chest, { k: 1.6 })); S.add(EL([0, 47, .8], [11.6, 9, 8.6]), o('cloth', B.spine, { k: 1.6 })); S.add(EL([0, 66.4, -.6], [11, 4, 8]), o('cloth', B.chest, { k: 2 }));
  const ring = (y, r, z0) => { const out = []; for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI * 1.75 + Math.PI * .125 + Math.PI / 2; out.push([Math.cos(a) * r, y, Math.sin(a) * r * .85 + z0]); } return out; };
  K.sheet(S, ring(44, 11, -.5), key === 'c' ? 34 : 42, { bone: B.root, tag: 'cloth', thick: .8, folds: 9, foldDepth: 1.2, flare: .22, rag: key === 'c' ? .5 : .05, seed: D.seed, out: [0, 0, -1],
    boneOf: (t, i) => (t < .3 ? B.root : i < 4 ? B.skirtR : i > 8 ? B.skirtL : B.skirtB) });
  K.sheet(S, ring(43, 9, .5).slice(0, 4).concat(ring(43, 9, .5).slice(10)), 38, { bone: B.skirtF, tag: 'cloth2', thick: .6, folds: 4, foldDepth: .8, flare: .12, seed: D.seed + 2, out: [0, 0, 1] });
  both(s => { const L = LR(s), f = p => [s * p[0], p[1], p[2]]; S.add(RC(f([13, 64, 0]), f([14.6, 50, 1.4]), 5.6, 5.8), o('cloth', B['uarm' + L], { k: 1.2 })); S.add(EL(f([12.6, 65, 0]), [6.4, 6, 6.6]), o('cloth', B['uarm' + L], { k: 1.2 }));
    S.add(RC(f([14.6, 50, 1.4]), f([15.4, 40, 3.2]), 4.6, 6.4), o('cloth', B['farm' + L], { k: .8 })); S.sub(EL(f([15.4, 38, 3.2]), [4.6, 2.4, 4.6]), { k: .6 });
    S.add(TO(f([15.3, 40.4, 3.2]), 5.8, .5, rotX(-.1)), o('trim', B['farm' + L])); });
  // the hood and a high pointed collar
  S.add(EL([0, 79, -.6], [6.8, 7.6, 7]), o('cloth', B.head, { k: 1 })); S.sub(EL([0, 76.4, 6.4], [4.8, 6.4, 4.8]), { k: 1 });
  both(s => S.add(BX([s * 6.6, 72, 1], [3.6, 6.6, .7], rotZ(s * .35), .4), o('cloth2', B.chest, { k: .6 })));
  for (const y of [44, 56]) S.add(TO([0, y, .8], y > 50 ? 12 : 10.2, .55, [[1, 0, 0], [0, 1, 0], [0, 0, .8]]), o('trim', y > 50 ? B.chest : B.root));
  // the horned crystal crown over the hood
  both(s => { const b0 = [s * 4, 84, -.6]; K.crystals(S, b0, [s * .4, 1, -.3], { count: 3, length: key === 'a' ? 10 : 14, r: 1, seed: D.seed + (s > 0 ? 5 : 6), bone: B.head, tag: 'crystal', spread: .2 }); });
  S.add(TO([0, 83, -.4], 6, .7, [[1, 0, 0], [0, 1, 0], [0, 0, 1.05]]), o('darkmetal', B.head));
  // B: crystal pauldrons and gauntlets, spine crystals, crystals on the hem
  if (key === 'b') { both(s => { const L = LR(s), f = p => [s * p[0], p[1], p[2]];
      K.crystals(S, f([13.6, 68, -.5]), [s * .5, 1, -.2], { count: 8, length: 11, r: 2.6, seed: D.seed + (s > 0 ? 1 : 2), bone: B['uarm' + L], tag: 'crystal', spread: .5 });
      S.add(RC(f([15, 44, 2]), f([15.5, 38, 3.2]), 3.4, 3.4), o('crystal', B['farm' + L], { k: .5 })); });
    for (let i = 0; i < 6; i++) K.crystals(S, [0, 66 - i * 4.6, -8.4], [0, .4, -1], { count: 2, length: 8 - i * .6, r: 1.2, seed: D.seed + 20 + i, bone: i < 3 ? B.chest : B.spine, tag: 'crystal' });
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; K.crystals(S, [Math.cos(a) * 15, 2, Math.sin(a) * 13], [Math.cos(a) * .4, 1, Math.sin(a) * .4], { count: 2, length: 7, r: 1.2, seed: D.seed + 40 + i, bone: B.root, tag: 'crystal' }); } }
  // C: rune halo and waist ring, crystal-blade wings
  if (key === 'c') { S.add(TO([0, 80, -9], 11, .8, rotX(Math.PI / 2)), o('trim', B.head, { k: .2 })); S.add(TO([0, 80, -9], 9.4, .45, rotX(Math.PI / 2)), o('glow', B.head, { k: .1 }));
    S.add(TO([0, 40, 0], 19, .55, rotX(.12)), o('glow', B.root, { k: .1 }));
    both(s => { for (let i = 0; i < 5; i++) { const a = .3 + i * .28, base = [s * 8, 62, -8], dir = norm([s * Math.cos(a), Math.sin(a), -.25]); K.crystals(S, add(base, mul(dir, 6 + i * 2)), dir, { count: 1, length: 14 - i * 1.4, r: 1.6, seed: D.seed + i + (s > 0 ? 50 : 60), bone: B.back, tag: 'crystal', spread: .02 }); } }); }
  return S;
}

// the staff: a tall black haft, three crystal claws clutching a floating void orb (B: a crystal blade beneath)
function weapon(D) {
  const S = new Sculpt(), key = D.key, dir = norm([0, 1, .12]), at = t => add(GRIP, mul(dir, t)), fr = frameOf(dir), o = (tag, extra) => Object.assign({ tag, bone: B.weapon, k: .3 }, extra);
  S.add(RC(at(-26), at(52), .9, .9), o('darkmetal')); for (const t of [-20, 0, 30]) S.add(TO(at(t), 1.15, .35, fr), o('trim'));
  const orb = at(58); for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2, d = add(mul(fr[0], Math.cos(a)), mul(fr[2], Math.sin(a))); S.add(RC(at(51), add(orb, mul(d, 3.6)), .8, .5), o('crystal')); S.add(RC(add(orb, mul(d, 3.6)), add(add(orb, mul(d, 2)), mul(dir, 4)), .5, .1), o('crystal')); }
  S.add(EL(orb, [2.8, 2.8, 2.8]), o('glow', { k: .2 }));
  if (key === 'b') K.crystals(S, at(-26), mul(dir, -1), { count: 3, length: 10, r: .8, seed: D.seed + 7, bone: B.weapon, tag: 'crystal', spread: .15 });
  if (key === 'c') S.add(TO(orb, 4.6, .3, rotX(.6)), o('glow', { k: .05 }));
  return S;
}

function details(D) {
  const S = new Sculpt();
  both(s => S.add(EL([s * 2, 77, 5.8], [.9, .5, .5]), { bone: B.head, tag: 'eye', k: .1, c: [s * 2, 77, 5.8] }));
  // floating shards circling the shoulders (on the back bone so they sway)
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; K.crystals(S, [Math.cos(a) * 20, 60 + Math.sin(a * 2) * 6, Math.sin(a) * 14 - 2], [Math.cos(a * 3), 1, Math.sin(a * 2)], { count: 1, length: 5, r: 1, seed: D.seed + 80 + i, bone: B.back, tag: 'crystal', spread: .1 }); }
  return S;
}

function custom(D) {
  return ({ p, n, s, tag, fine, big }) => {
    if (tag === 'eye') return { c: mixc(D.eye, [1, 1, 1], .3), a: .03, sp: 1, gl: 1, ty: 0, st: 0 };
    if (tag === 'crystal') { const edge = F.noise3(p[0] * .8, p[1] * .8, p[2] * .8, 4) > .7; return { c: edge ? D.colors.glow : mul(D.colors.crystal, .8 + fine * .5), a: edge ? .2 : 1, sp: 1, gl: .95, ty: 4, st: .2 }; }
    if (tag === 'cloth' || tag === 'cloth2') { const base = D.colors[tag], c = mixc(mul(base, .55), base, clamp(.3 + big * .7 + n[1] * .2, 0, 1));
      if (D.key === 'c' && p[1] < 18) return { c: mixc(c, D.colors.glow, clamp((18 - p[1]) / 14, 0, 1)), a: lerp(1, .2, clamp((18 - p[1]) / 14, 0, 1)), sp: .2, gl: .3, ty: 6, st: .6 };
      if (Math.abs(Math.sin(p[1] * 1.6 + Math.atan2(p[2], p[0]) * 3)) < .05 && fine > .4) return { c: D.colors.trim, sp: .8, gl: .7, ty: 8, st: .3 };
      return { c, sp: .15, gl: .3, ty: 6, st: .9 }; }
    if (tag === 'skin') return { c: mul(D.colors.skin, .8 + fine * .3), sp: .3, gl: .4, ty: 3, st: .5 };
    return null;
  };
}

function build(variant, { lod = 0 } = {}) {
  const D = Object.assign({}, DESIGN[variant]), t0 = Date.now();
  const body = anatomy(D); body.build(3); const r = robes(D); r.build(3); const w = weapon(D); w.build(3); const fine = details(D); fine.build(2.5);
  const R = lod ? [1.3, 1.2, .9, .5] : [.6, .5, .38, .25];
  const { parts, log } = K.finish(D, [['body', body, R[0], 1.2], ['robes', r, R[1], .9], ['weapon', w, R[2], .5], ['detail', fine, R[3], .5]], custom(D));
  log.push((Date.now() - t0) + ' ms');
  return { parts, bones: BONES, clips: lod ? null : H.clips({ weight: .5, grip: 0, stance: .4, hover: D.key === 'c', banner: true }), log, design: D };
}
module.exports = { build, DESIGN, BONES, B };
