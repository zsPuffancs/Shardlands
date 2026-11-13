'use strict';
// Ossuary King, World Boss of the necropolis regions: the ancient ruler of the undead.
//   A ancient royal  black plate trimmed in gold, a jewelled gold crown, a purple cape, a gold-hilted greatsword
//   B heavy          a breastplate of fused ribs, bone spikes on the shoulders, skull trophies on the belt, a crown of
//                    bones, a bone-hilted blade
//   C decayed        the plate rotted away to bare ribs and spine, one corroded pauldron, a tattered cape and loincloth,
//                    a broken, tilted crown, a chipped and rusted sword
// A towering skeleton in plate (unlike the Reaper's robes). Humanoid rig; units match the old model (top ~96).
const K = require('./kit');
const { F, H, B, POS: BASE, GRIP, both, mulR, rotX, rotY, rotZ, frameOf, LR, mixc } = K;
const { roundCone: RC, ellipsoid: EL, torus: TO, box: BX, Sculpt, norm, add, mul, sub, len, clamp, rng } = F;

const HS = 1.34, PIV = [0, 70, 1.5], hd = p => [PIV[0] + (p[0] - PIV[0]) * HS, PIV[1] + (p[1] - PIV[1]) * HS, PIV[2] + (p[2] - PIV[2]) * HS];
const SC = shape => F.scaled(shape, PIV, HS);
const POS = Object.assign({}, BASE); for (const k of ['head', 'jaw', 'hair']) POS[k] = hd(POS[k]);
const BONES = H.bonesFrom(POS);
const SKULL = [0, 77.6, 1.8];

const DESIGN = [
  { key: 'a', name: 'ancient royal', seed: 601, colors: { bone: [.84, .8, .68], darkmetal: [.1, .1, .13], metal: [.32, .32, .38], trim: [.92, .74, .3], cloth: [.36, .1, .46], gem: [.7, .1, .2], glow: [.45, .78, 1], leather: [.2, .12, .1] }, eye: [.45, .8, 1] },
  { key: 'b', name: 'heavy', seed: 602, colors: { bone: [.88, .85, .76], darkmetal: [.13, .12, .14], metal: [.3, .28, .32], trim: [.8, .76, .66], cloth: [.12, .09, .1], gem: [.2, .9, .5], glow: [.5, 1, .7], leather: [.16, .11, .09] }, eye: [.55, 1, .7] },
  { key: 'c', name: 'decayed', seed: 603, colors: { bone: [.68, .62, .48], darkmetal: [.24, .19, .14], metal: [.34, .27, .2], trim: [.5, .56, .42], cloth: [.22, .16, .2], gem: [.3, .8, .4], glow: [.4, .95, .55], leather: [.18, .13, .1] }, eye: [.45, 1, .55] },
];

function anatomy(D) {
  const S = new Sculpt(), c = D.key === 'c';
  K.skeleton(S, { ribs: true, spine: true, pelvis: true, arms: true, legs: true, thick: 1.85, scale: 1.18 });
  const tmp = new Sculpt(); const sk = K.skull(tmp, SKULL, { r: 5.3, jawOpen: .14 });
  for (const s of tmp.shapes) { const sc = F.scaled(s, PIV, HS); Object.assign(sc, { op: s.op, tag: s.tag, bone: s.bone, k: s.k }); S.shapes.push(sc); }
  S.eyes = sk.eyes.map(hd);
  if (c) S.sub(EL([-6.6, 50, 4], [3, 4, 3]), { k: .4 });                                                                  // missing ribs
  return S;
}

function armour(D) {
  const S = new Sculpt(), o = (tag, bone, extra) => Object.assign({ tag, bone, k: .5 }, extra), key = D.key;
  const plate = key === 'c' ? 'darkmetal' : 'darkmetal';
  if (key === 'a') {
    S.add(EL([0, 57.5, .6], [12.6, 10.6, 7.2]), o(plate, B.chest, { k: 1 })); both(s => S.add(EL([s * 5.4, 59.6, 5.2], [5.2, 4.2, 2.6]), o(plate, B.chest, { k: 1.2 }))); S.add(EL([0, 47.5, 1.2], [10.4, 5.6, 7.4]), o(plate, B.spine, { k: 1 }));
    S.add(TO([0, 64.6, 1.4], 9.8, .55, [[1, 0, 0], [0, 1, 0], [0, 0, 1.12]]), o('trim', B.chest));
    S.add(RC([0, 66, 9.2], [0, 50, 9.6], .55, .5), o('trim', B.chest)); S.add(EL([0, 59, 9.6], [2.4, 2.6, .9]), o('trim', B.chest)); S.add(EL([0, 59, 10.2], [1.1, 1.3, .6]), o('gem', B.chest));
    for (let i = 0; i < 3; i++) S.add(EL([0, 45.5 - i * 1.9, 1.3], [11.2 - i * .3, 1.2, 8.2]), o(i === 0 ? 'trim' : plate, B.spine, { k: .3 }));
    for (const [bone, cx, cz, yaw] of [[B.skirtF, 0, 8, 0], [B.skirtB, 0, -7.6, Math.PI], [B.skirtL, 10, .4, Math.PI / 2], [B.skirtR, -10, .4, -Math.PI / 2]])
      for (let j = 0; j < 3; j++) S.add(BX([cx + Math.sin(yaw) * j * .4, 39 - j * 3.4, cz + Math.cos(yaw) * j * .4], [5, 1.7, .5], mulR(rotX(-.15), rotY(yaw)), .3), o(j === 2 ? 'trim' : plate, bone));
  } else if (key === 'b') {
    // a breastplate of fused, thickened ribs over a dark plate
    S.add(EL([0, 56, .8], [12.2, 10.6, 8.2]), o('darkmetal', B.chest, { k: 1 }));
    for (let i = 0; i < 6; i++) both(s => { const y = 64 - i * 2.6; let prev = [s * .8, y, 8.6]; for (let k = 1; k <= 6; k++) { const a = k / 6 * Math.PI * .6, p = [s * Math.sin(a) * 13, y - k * .5, 8.6 - (1 - Math.cos(a)) * 9]; S.add(RC(prev, p, 1.05, .95), o('bone', B.chest, { k: .3 })); prev = p; } });
    S.add(RC([0, 66, 9.6], [0, 48, 9.2], 1.4, 1.1), o('bone', B.chest));
    // belt with skull trophies
    S.add(TO([0, 44, 1.2], 10.6, 1.1, [[1, 0, 0], [0, 1, 0], [0, 0, 1.3]]), o('leather', B.root));
    for (const [x, z, bone] of [[-6.6, 7.4, B.skirtF], [6.6, 7.4, B.skirtF], [-10.6, 0, B.skirtR], [10.6, 0, B.skirtL]]) { const t = new Sculpt(); K.skull(t, [x, 38.6, z], { r: 2.2, jawOpen: .3, bone, jawBone: bone }); for (const sh of t.shapes) S.shapes.push(Object.assign(sh, { k: Math.min(sh.k, .3) })); S.add(RC([x, 41.4, z * .96], [x, 43.6, z * .9], .3, .3), o('leather', bone)); }
    for (let j = 0; j < 4; j++) S.add(BX([0, 39 - j * 3.2, 7.8 + j * .3], [5.4, 1.5, .5], rotX(-.15), .3), o('darkmetal', B.skirtF));
  } else {
    // decayed: a rotting loincloth, a corroded pauldron, rusted belt
    S.add(TO([0, 44, 1], 9, .8, [[1, 0, 0], [0, 1, 0], [0, 0, 1.3]]), o('leather', B.root));
    K.sheet(S, [[-6, 43.6, 6.8], [-3, 43.8, 7.6], [0, 43.8, 7.8], [3, 43.8, 7.6], [6, 43.6, 6.8]], 20, { bone: B.skirtF, tag: 'cloth', thick: .5, folds: 3, foldDepth: .8, flare: .1, rag: .9, seed: D.seed + 4, out: [0, 0, 1] });
  }
  // pauldrons
  both(s => { const L = LR(s); if (key === 'c' && s > 0) return; for (let j = 0; j < 4; j++) S.add(EL([s * (14 + j * .4), 66.8 - j * 2.2, 0], [5.6 - j * .3, 2.7, 6.4 - j * .4], rotZ(s * -.4)), o(j === 0 ? 'trim' : plate, B['uarm' + L], { k: .3 }));
    if (key === 'b') for (let j = 0; j < 4; j++) { const a = [s * (13 + j * 1.6), 69.2 - j * .9, -2.6 + j * 1.8]; S.add(RC(a, add(a, [s * 2.4, 6 - j, -.6]), .9, .05), o('bone', B['uarm' + L], { k: .2 })); }
    if (key !== 'c') { const f = p => [s * p[0], p[1], p[2]]; S.add(RC(f([14.6, 47.5, 1.6]), f([15.4, 39.4, 3.2]), 3.1, 2.6), o(plate, B['farm' + L], { k: .4 })); S.add(TO(f([15.3, 40, 3.2]), 2.8, .5, rotX(-.1)), o('trim', B['farm' + L]));
      S.add(RC(f([7, 21, 1.6]), f([7, 6.4, .6]), 3.4, 2.7), o(plate, B['shin' + L], { k: .4 })); S.add(EL(f([7, 22.4, 3.6]), [2.4, 2.2, 1.2]), o('trim', B['shin' + L]));
      S.add(RC(f([6.6, 38, .4]), f([7, 25, 1.4]), 3.8, 3), o(plate, B['thigh' + L], { k: .5 })); S.add(EL(f([7, 2.6, 3]), [2.6, 2.4, 5]), o(plate, B['foot' + L])); } });
  // the cape, from the shoulders
  const top = []; for (let i = 0; i <= 8; i++) { const a = (i / 8 - .5) * 2.5; top.push([Math.sin(a) * 12, 67 - Math.abs(Math.sin(a)) * 1.5, -3.6 - Math.cos(a) * 4.4]); }
  if (key !== 'b') K.sheet(S, top, key === 'c' ? 44 : 56, { bone: B.back, tag: 'cloth', thick: .7, folds: 7, foldDepth: 1.3, flare: .16, rag: key === 'c' ? .8 : 0, seed: D.seed, boneOf: t => (t < .35 ? B.back : B.skirtB) });
  // the crown
  const crown = new Sculpt(), cc = [0, 81.4, 1.6], tilt = key === 'c' ? rotZ(.22) : null;
  const put = p => (tilt ? add(cc, [tilt[0][0] * (p[0] - cc[0]) + tilt[1][0] * (p[1] - cc[1]), tilt[0][1] * (p[0] - cc[0]) + tilt[1][1] * (p[1] - cc[1]), p[2] - cc[2]]) : p);
  if (key === 'b') for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, base = [Math.cos(a) * 5.4, 80.6, cc[2] + Math.sin(a) * 5.6], l = k % 2 ? 5.4 : 8.6; crown.add(RC(base, add(base, [Math.cos(a) * 1.6, l, Math.sin(a) * 1.6]), 1, .1), { bone: B.head, tag: 'bone', k: .3 }); }
  else { crown.add(TO(put(cc), 5.6, .85, [[1, 0, 0], [0, 1, 0], [0, 0, 1.04]]), { bone: B.head, tag: 'trim', k: .3 });
    for (let k = 0; k < 8; k++) { if (key === 'c' && (k === 2 || k === 3)) continue; const a = k / 8 * Math.PI * 2, base = put([Math.cos(a) * 5.6, cc[1] + .4, cc[2] + Math.sin(a) * 5.8]), tip = put([Math.cos(a) * 5.8, cc[1] + (k % 2 ? 3.4 : 5.4), cc[2] + Math.sin(a) * 6]);
      crown.add(RC(base, tip, 1, .2), { bone: B.head, tag: 'trim', k: .3 }); crown.add(EL(tip, [.6, .6, .6]), { bone: B.head, tag: k % 2 ? 'trim' : 'gem', k: .2 }); }
    crown.add(EL(put([0, cc[1] + .2, cc[2] + 6]), [1, 1.2, .6]), { bone: B.head, tag: 'gem', k: .2 }); }
  for (const s of crown.shapes) { const sc = F.scaled(s, PIV, HS); Object.assign(sc, { op: s.op, tag: s.tag, bone: s.bone, k: s.k }); S.shapes.push(sc); }
  return S;
}

// a greatsword planted point-down at the right side
function weapon(D) {
  const S = new Sculpt(), dir = norm([0, -1, .36]), at = t => add(GRIP, mul(dir, t)), fr = frameOf(dir), o = (tag, extra) => Object.assign({ tag, bone: B.weapon, k: .25 }, extra), key = D.key;
  const hilt = key === 'b' ? 'bone' : key === 'a' ? 'trim' : 'darkmetal', blade = key === 'c' ? 'rust' : 'metal', L = 33;
  S.add(RC(at(-7), at(3.4), .85, .85), o(key === 'b' ? 'bone' : 'leather')); S.add(EL(at(-7.8), [1.5, 1.5, 1.5]), o(hilt));
  S.add(BX(at(3.8), [6.4, .75, .9], [fr[0], fr[1], fr[2]], .4), o(hilt)); both(s => S.add(EL(add(at(3.8), mul(fr[0], s * 6.6)), [1.1, 1.1, 1.1]), o(key === 'b' ? 'bone' : 'gem')));
  for (let i = 0; i < 12; i++) { const t = 5 + i * (L - 5) / 12, w = 2.2 - i * .06; S.add(BX(at(t), [w, (L - 5) / 24 + .2, .42], [fr[0], fr[1], fr[2]], .2), o(blade, { k: .4 })); }
  S.add(RC(at(L), at(L + 2.8), .9, .05), o(blade));
  S.add(RC(at(5), at(L - 2), .25, .2), o('fuller'));
  if (key === 'c') for (const t of [12, 20, 27]) S.sub(EL(add(at(t), mul(fr[0], 2.4)), [1, .9, 1]), { k: .1 });            // chipped edge
  return S;
}

function details(D, S0) {
  const S = new Sculpt();
  for (const e of S0.eyes) { S.add(EL(add(e, [0, 0, -1.2]), [.8, .8, .7]), { bone: B.head, tag: 'eye', k: .1, c: add(e, [0, 0, -1.2]) }); }
  return S;
}

function custom(D) {
  return ({ p, n, s, tag, fine, big }) => {
    if (tag === 'eye') { const r0 = len(sub(p, s.c)); return { c: mixc(D.eye, [1, 1, 1], clamp(.8 - r0, 0, .6)), a: .03, sp: 1, gl: 1, ty: 0, st: 0 }; }
    if (tag === 'rust') return { c: mixc([.28, .16, .08], [.46, .32, .22], clamp(fine + big - .5, 0, 1)), sp: .4, gl: .3, ty: 8, st: .9 };
    if (tag === 'fuller') return { c: D.key === 'c' ? [.2, .12, .07] : mul(D.colors.metal, .6), sp: 1, gl: .8, ty: 8, st: .3 };
    if (tag === 'bone') { const grime = clamp((1 - n[1]) * .25 + (big - .5) * .6 + (p[1] < 30 ? .2 : 0), 0, 1); return { c: mixc(D.colors.bone, mul(D.colors.bone, .45), grime) }; }
    if ((tag === 'darkmetal' || tag === 'metal') && D.key === 'c') return { c: mixc(D.colors.darkmetal, [.42, .24, .12], clamp(big + fine * .4 - .3, 0, 1)), sp: .5, gl: .35 };
    if (tag === 'cloth' && D.key === 'a' && p[1] < 20) return { c: mixc(D.colors.cloth, [.86, .7, .3], p[1] < 14 ? .8 : 0) };             // gold hem
    return null;
  };
}

function build(variant, { lod = 0 } = {}) {
  const D = Object.assign({}, DESIGN[variant]), t0 = Date.now();
  const body = anatomy(D); body.build(3); const arm = armour(D); arm.build(3); const weap = weapon(D); weap.build(3); const fine = details(D, body); fine.build(2);
  const R = lod ? [1.05, 1.15, .9, .4] : [.42, .5, .4, .2];
  const { parts, log } = K.finish(D, [['body', body, R[0], 1.2], ['armour', arm, R[1], .8], ['weapon', weap, R[2], .5], ['detail', fine, R[3], .5]], custom(D));
  log.push((Date.now() - t0) + ' ms');
  return { parts, bones: BONES, clips: lod ? null : H.clips({ weight: .7, grip: 0, stance: .7 }), log, design: D };
}

module.exports = { build, DESIGN, BONES, B };
