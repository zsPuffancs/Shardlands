'use strict';
// Skeleton (basic enemy, Ashen Barrens): a risen warrior. Ordinary-enemy budget (about 15k triangles, 3k far): a
// proper skull with sockets and teeth, ribs, a spine, joints; scraps of rusted mail and a dented open helm, a torn
// loincloth, a notched short sword and a cracked round shield. Variant 0 normal, variant 1 Alpha: a horned iron helm,
// a spiked pauldron, a glowing ribcage, eyes burning brighter, a heavier broad blade, a bone-trimmed shield.
// Humanoid rig and clips; units match the other humanoids (the client scales it to the primitive model's height).
const K = require('./kit');
const { F, H, B, POS: BASE, GRIP, both, rotX, rotZ, frameOf, LR, mixc } = K;
const { roundCone: RC, ellipsoid: EL, torus: TO, box: BX, Sculpt, norm, add, mul, sub, len, clamp, lerp, rng } = F;

const POS = Object.assign({}, BASE), BONES = H.bonesFrom(POS);
const SK = [0, 77, 1.6];
const DESIGN = [
  { key: 'n', name: 'skeleton', seed: 4101, colors: { bone: [.8, .76, .64], metal: [.36, .32, .28], darkmetal: [.16, .13, .11], mail: [.3, .27, .24], cloth: [.3, .22, .16], leather: [.24, .16, .1], wood: [.3, .2, .12], trim: [.5, .4, .26], glow: [.35, 1, 1] }, eye: [.35, 1, 1] },
  { key: 'a', name: 'alpha', seed: 4102, colors: { bone: [.72, .68, .58], metal: [.28, .26, .24], darkmetal: [.1, .09, .09], mail: [.24, .22, .2], cloth: [.36, .08, .08], leather: [.2, .13, .08], wood: [.24, .16, .1], trim: [.6, .2, .12], glow: [.3, 1, .9] }, eye: [.4, 1, .95] },
];

function bones(D) { const S = new Sculpt(); K.skeleton(S, { thick: 1.45, limb: .95 }); K.skull(S, SK, { r: 5.2, jawOpen: .2 });
  // the neck: cervical vertebrae from the ribcage up into the skull
  for (let i = 0; i < 5; i++) { const y = 66 + i * 1.6, bone = i < 2 ? B.neck : B.head; S.add(EL([0, y, -1.6 + i * .3], [1.5, .75, 1.3]), { bone, tag: 'bone', k: .3 }); S.add(RC([0, y, -1.6 + i * .3], [0, y - .4, -3.4 + i * .3], .5, .25), { bone, tag: 'bone', k: .2 }); }
  return S; }

function gear(D) {
  const S = new Sculpt(), o = (tag, bone, extra) => Object.assign({ tag, bone, k: .4 }, extra), alpha = D.key === 'a', R = rng(D.seed);
  // a dented open helm (normal) or a horned iron helm (alpha)
  S.add(EL([SK[0], SK[1] + 2.4, SK[2] - .6], [5.6, 4.2, 6]), o('metal', B.head, { k: .5 })); S.sub(EL([SK[0], SK[1] - .6, SK[2] + 5], [4.6, 4.4, 4]), { k: .6 });
  S.sub(EL([2.6, SK[1] + 4.6, SK[2] + 3], [1.6, 1, 1.2]), { k: .4 });                                                  // dent
  S.add(TO([SK[0], SK[1] + .2, SK[2] - .6], 5.7, .5, [[1, 0, 0], [0, 1, 0], [0, 0, 1.05]]), o('trim', B.head));
  if (alpha) both(s => { let p = [s * 4.6, SK[1] + 3.6, SK[2] - .4], d = norm([s, .6, -.2]); for (let i = 0; i < 5; i++) { const q = add(p, mul(d, 2)); S.add(RC(p, q, 1.2 - i * .2, 1 - i * .2), o('bone', B.head, { k: .2 })); p = q; d = norm(add(d, [s * -.1, .25, -.05])); } });
  // torn mail shirt hanging off the ribs, a belt, a ragged loincloth
  // a rusted breastplate scrap over the left ribs, held by a strap
  S.add(EL([-3.4, 58, 5.4], [5.4, 6, 2]), o('metal', B.chest, { k: .6 })); S.sub(EL([-3.4, 58, 3.4], [5, 5.6, 2]), { k: .4 }); S.sub(BX([1.6, 54, 6], [2, 3, 3], rotZ(.6)), { k: .2 });
  S.add(RC([-9, 66, 0], [6, 50, 5.6], .7, .7), o('leather', B.chest, { k: .2 }));
  S.add(TO([0, 43, .6], 7.4, .8, [[1, 0, 0], [0, 1, 0], [0, 0, 1.1]]), o('leather', B.root));
  for (const [z, b] of [[1, B.skirtF], [-1, B.skirtB]]) { const top = []; for (let i = 0; i <= 4; i++) top.push([(i - 2) * 2.2, 42, z * 7.6]); K.sheet(S, top, 16, { bone: b, tag: 'cloth', thick: .7, folds: 2, foldDepth: .5, flare: .1, rag: .5, seed: D.seed + z, out: [0, 0, z] }); }
  // a spiked pauldron on the alpha
  if (alpha) { for (let j = 0; j < 3; j++) S.add(EL([14 + j * .5, 67 - j * 2.2, 0], [5.4 - j * .5, 2.2, 6 - j * .5], rotZ(-.42)), o(j ? 'darkmetal' : 'trim', B.uarmL, { k: .3 }));
    for (let j = 0; j < 3; j++) S.add(RC([15 + j * 2, 69 - j, -2 + j * 2], [18 + j * 2.6, 75 - j, -3 + j * 2], .9, .08), o('darkmetal', B.uarmL, { k: .15 })); }
  // a cracked round shield on the left forearm
  const sc = [17.4, 42, 6], sf = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]];
  S.add(EL(sc, [alpha ? 7.4 : 6.6, alpha ? 7.4 : 6.6, .9], sf), o('wood', B.farmL, { k: .3 })); S.add(TO(sc, alpha ? 7.2 : 6.4, .5, [[0, 0, 1], [1, 0, 0], [0, 1, 0]]), o(alpha ? 'bone' : 'metal', B.farmL));
  S.add(EL(add(sc, [.8, 0, 0]), [2, 2, 1.2], sf), o('metal', B.farmL)); S.sub(BX(add(sc, [0, 3, 2]), [.4, 4, 3], rotZ(.5)), { k: .1 });
  return S;
}

// a notched short sword (normal) or a broad cleaving blade (alpha), upright in the right hand
function weapon(D) {
  const S = new Sculpt(), alpha = D.key === 'a', dir = norm([0, 1, .2]), at = t => add(GRIP, mul(dir, t)), fr = frameOf(dir), o = (tag, extra) => Object.assign({ tag, bone: B.weapon, k: .2 }, extra);
  S.add(RC(at(-5), at(2), .7, .7), o('leather')); S.add(EL(at(-5.6), [1, 1, 1]), o('metal')); S.add(BX(at(2.6), [4, .6, .8], fr, .2), o('metal'));
  const L = alpha ? 24 : 20, W = alpha ? 2.6 : 1.6;
  for (let i = 0; i < 8; i++) { const t0 = 3 + i * L / 8, w = W * (i < 7 ? 1 : .5); S.add(BX(at(t0 + L / 16), [w, L / 16 + .1, .3], fr, .08), o('metal', { k: .08 })); }
  S.add(RC(at(3 + L - .5), at(3 + L + 3), W * .4, .05), o('metal'));
  for (const t of [9, 15]) S.sub(EL(add(at(t), mul(fr[0], W + .3)), [.8, .8, .8]), { k: .1 });                          // notches
  if (alpha) S.add(BX(at(3 + L * .5), [.3, L * .42, .32], fr, .05), o('glow', { k: .05 }));
  return S;
}

function details(D) {
  const S = new Sculpt(), r = 5.2;
  both(s => S.add(EL([SK[0] + s * .38 * r, SK[1], SK[2] + .72 * r], [1, .9, .7]), { bone: B.head, tag: 'eye', k: .1 }));
  if (D.key === 'a') S.add(EL([0, 57, 0], [3, 4, 2.4]), { bone: B.chest, tag: 'glow', k: .4 });
  return S;
}

function custom(D) {
  return ({ p, n, s, tag, fine, big }) => {
    if (tag === 'eye') return { c: mixc(D.eye, [1, 1, 1], .2), a: .05, sp: 1, gl: 1, ty: 0, st: 0 };
    if (tag === 'bone') { const grime = clamp((big - .4) * 1.4 + (1 - n[1]) * .15, 0, 1); return { c: mul(mixc(D.colors.bone, [.36, .3, .22], grime * .65), .9 + fine * .16), sp: .35, gl: .45, ty: 4, st: .7 }; }
    if (tag === 'metal' || tag === 'mail' || tag === 'darkmetal' || tag === 'trim') { const rust = clamp((F.noise3(p[0] * .5, p[1] * .5, p[2] * .5, 6) - .45) * 2.4, 0, 1);
      if (rust > .25) return { c: mixc(D.colors[tag] || D.colors.metal, [.42, .2, .08], rust * .8), sp: .3, gl: .4, ty: tag === 'mail' ? 7 : 8, st: .8 }; }
    return null;
  };
}

function build(variant, { lod = 0 } = {}) {
  const D = Object.assign({}, DESIGN[variant]), t0 = Date.now();
  const b = bones(D); b.build(3); const g = gear(D); g.build(3); const w = weapon(D); w.build(3); const d = details(D); d.build(2);
  const R = lod ? [1.1, 1.3, 1.1, .8] : [.85, .82, .6, .42];
  const { parts, log } = K.finish(D, [['bones', b, R[0], .8], ['gear', g, R[1], .7], ['weapon', w, R[2], .5], ['detail', d, R[3], .5]], custom(D));
  log.push((Date.now() - t0) + ' ms');
  return { parts, bones: BONES, clips: lod ? null : H.clips({ weight: .4, grip: -.1, stance: .5, kneelDrop: 12, fallDrop: 10 }), log, design: D };
}
module.exports = { build, DESIGN, BONES, B };
