'use strict';
// Lord of Death, Region Boss of the Death Zone: a towering death knight in black plate (not the Reaper's robes), a
// skull-faced great helm, a long tattered cape, a two-handed greatsword.
//   A standard   blackened full plate with bone-white trim, a skull-visored great helm with a crest, a tattered cape,
//                a black greatsword with a pale edge
//   B empowered  soul-cage armour: the breastplate opens into a cage of black ribs holding green souls, chains
//                hanging from the pauldrons, spiked pauldrons, a larger serrated greatsword dripping spectral light
//   C ancient    the ascended pale king: a tall pale crown of blades over the helm, horns, a wraith cape glowing at the
//                hem, the plate traced with glowing runes, the greatsword glowing along its fuller
// Humanoid rig; units match the other humanoid bosses.
const K = require('./kit');
const { F, H, B, POS: BASE, GRIP, both, rotX, rotZ, frameOf, LR, mixc } = K;
const { roundCone: RC, ellipsoid: EL, torus: TO, box: BX, Sculpt, norm, add, mul, sub, len, clamp, lerp, rng } = F;

const POS = Object.assign({}, BASE);
const BONES = H.bonesFrom(POS);
const DESIGN = [
  { key: 'a', name: 'standard', seed: 1601, colors: { skin: [.3, .3, .3], metal: [.3, .3, .33], darkmetal: [.1, .1, .11], trim: [.8, .78, .7], cloth: [.08, .07, .08], bone: [.82, .8, .72], glow: [.35, 1, .55] }, eye: [.35, 1, .55] },
  { key: 'b', name: 'empowered', seed: 1602, colors: { skin: [.3, .3, .3], metal: [.26, .27, .28], darkmetal: [.08, .08, .09], trim: [.5, .55, .5], cloth: [.06, .07, .07], bone: [.7, .72, .66], glow: [.3, 1, .6] }, eye: [.3, 1, .6] },
  { key: 'c', name: 'ancient', seed: 1603, colors: { skin: [.3, .3, .3], metal: [.34, .35, .4], darkmetal: [.1, .1, .12], trim: [.9, .92, .96], cloth: [.07, .08, .1], bone: [.9, .9, .88], glow: [.55, .85, 1] }, eye: [.6, .9, 1] },
];

function armour(D) {
  const S = new Sculpt(), key = D.key, o = (tag, bone, extra) => Object.assign({ tag, bone, k: .5 }, extra);
  K.body(S, { m: 1.22, tag: 'darkmetal' });
  // breastplate (A, C) or soul cage (B)
  if (key !== 'b') { S.add(EL([0, 58, 1.4], [14, 11, 9.6]), o('metal', B.chest, { k: 1.2 })); S.add(EL([0, 60, 8], [9.4, 7.4, 2.4]), o('metal', B.chest, { k: .8 })); S.add(RC([0, 66, 10.2], [0, 50, 10.8], .6, .5), o('trim', B.chest, { k: .2 })); }
  else { S.add(EL([0, 58, -2], [14, 11, 7]), o('metal', B.chest, { k: 1.2 }));
    for (let i = 0; i < 6; i++) both(s => { const y = 65 - i * 3, w = 11 - Math.abs(i - 2) * .6; let prev = [s * 1.2, y, 6]; for (let k = 1; k <= 6; k++) { const a = k / 6 * Math.PI * .5, p = [s * Math.sin(a) * w, y - k * .4, 6 + Math.cos(a) * 4 - 1]; S.add(RC(prev, p, .7, .6), o('darkmetal', B.chest, { k: .2 })); prev = p; } });
    S.add(RC([0, 66, 10], [0, 48, 10.4], 1, .8), o('darkmetal', B.chest, { k: .2 })); }
  for (let i = 0; i < 4; i++) S.add(EL([0, 46 - i * 2.2, 1.4], [11.6 - i * .3, 1.4, 8.6]), o(i % 2 ? 'metal' : 'darkmetal', B.spine, { k: .3 }));
  // tassets and greaves
  for (const [x, b] of [[-6, B.skirtR], [6, B.skirtL], [0, B.skirtF]]) for (let j = 0; j < 3; j++) S.add(EL([x, 38 - j * 3.6, 7 + (x ? 0 : 1)], [x ? 5 : 6, 2, 2.4], rotX(.1)), o(j % 2 ? 'darkmetal' : 'metal', b, { k: .3 }));
  both(s => { const L = LR(s), f = p => [s * p[0], p[1], p[2]];
    S.add(RC(f([7, 21.6, 1.8]), f([7, 6, .6]), 4.8, 3.6), o('metal', B['shin' + L], { k: .4 })); S.add(EL(f([7, 22.6, 4.6]), [3, 2.6, 1.6]), o('trim', B['shin' + L]));
    S.add(EL(f([7, 3, 3]), [3.4, 3, 6]), o('metal', B['foot' + L])); S.add(RC(f([6.6, 38.5, .4]), f([7.2, 23, 1.6]), 6.8, 5.2), o('darkmetal', B['thigh' + L], { k: .7 }));
    // pauldrons: layered, with bone trim (A), spikes and chains (B), blade-like (C)
    for (let j = 0; j < 4; j++) S.add(EL(f([14 + j * .5, 67.6 - j * 2.3, 0]), [6.4 - j * .4, 2.8, 7.2 - j * .4], rotZ(s * -.42)), o(j ? 'metal' : 'trim', B['uarm' + L], { k: .3 }));
    if (key === 'b') { for (let j = 0; j < 3; j++) S.add(RC(f([15 + j * 2.6, 71 - j * 1.2, -2 + j * 2.2]), f([19 + j * 3.6, 80 - j * 1.4, -3 + j * 2.6]), 1.4, .1), o('metal', B['uarm' + L], { k: .2 }));
      let p = f([18, 64, 5]); for (let i = 0; i < 8; i++) { const q = add(p, [0, -2, (i % 2 ? .5 : -.5)]); S.add(TO(mul(add(p, q), .5), 1, .3, i % 2 ? null : rotZ(Math.PI / 2)), o('metal', B['uarm' + L], { k: .05 })); p = q; } }
    if (key === 'c') S.add(RC(f([15, 70, -3]), f([24, 82, -6]), 1.8, .1), o('trim', B['uarm' + L], { k: .3 }));
    S.add(RC(f([14.6, 48, 1.6]), f([15.4, 39, 3.2]), 4, 3.4), o('metal', B['farm' + L], { k: .4 })); S.add(TO(f([15.3, 39.6, 3.2]), 3.4, .6, rotX(-.1)), o('trim', B['farm' + L])); });
  // the great helm: a tall rounded bascinet drawn to a point at the front, a ridge down the face, a narrow eye slit,
  // breathing holes, cheek flanges and a crest
  S.add(EL([0, 78.4, .8], [5.8, 7.4, 6.2]), o('metal', B.head, { k: 1 }));
  S.add(EL([0, 75.6, 3.8], [5, 5.6, 4.4]), o('metal', B.head, { k: 1.4 }));
  S.add(RC([0, 84.2, 4.2], [0, 70.4, 8.2], .55, .45), o('trim', B.head, { k: .4 }));
  S.sub(EL([0, 78, 7.8], [4.4, .55, 2.4]), { k: .15 });
  for (let i = 0; i < 5; i++) for (const s2 of [-1, 1]) S.sub(EL([s2 * (1.2 + (i % 3) * .9), 73.4 - Math.floor(i / 3) * 1.4, 7.6], [.3, .3, .8]), { k: .05 });
  both(s => S.add(EL([s * 4.8, 74, 3.6], [1.2, 3.2, 2.6], rotZ(s * .2)), o('darkmetal', B.head, { k: .5 })));
  S.add(RC([0, 85, 2.4], [0, 86.2, -6], .9, .6), o('trim', B.head, { k: .3 }));
  if (key === 'c') { for (let i = 0; i < 9; i++) { const a = (i / 8 - .5) * 2.4, b0 = [Math.sin(a) * 6, 82.6, Math.cos(a) * 6 - .6], l = 6 + (1 - Math.abs(i - 4) / 4) * 9; S.add(RC(b0, add(b0, [Math.sin(a) * 1.2, l, Math.cos(a) * .6]), .9, .1), o('trim', B.head, { k: .2 })); }
    both(s => { let p = [s * 5.6, 80, -1], d = norm([s, .4, -.3]); for (let i = 0; i < 6; i++) { const q = add(p, mul(d, 2.6)); S.add(RC(p, q, 1.5 - i * .2, 1.3 - i * .2), o('bone', B.head, { k: .2 })); p = q; d = norm(add(d, [s * -.1, .25, -.05])); } }); }
  // the cape
  const top = []; for (let i = 0; i <= 9; i++) { const a = (i / 9 - .5) * 2.6; top.push([Math.sin(a) * 13, 67 - Math.abs(Math.sin(a)) * 1.5, -4 - Math.cos(a) * 4]); }
  K.sheet(S, top, key === 'c' ? 66 : 58, { bone: B.back, tag: 'cloth', thick: .7, folds: 7, foldDepth: 1.4, flare: .16, rag: key === 'a' ? .3 : .5, seed: D.seed, boneOf: t => (t < .35 ? B.back : B.skirtB) });
  return S;
}

// the greatsword, held upright in the right hand
function weapon(D) {
  const S = new Sculpt(), key = D.key, dir = norm([0, 1, .18]), at = t => add(GRIP, mul(dir, t)), fr = frameOf(dir), o = (tag, extra) => Object.assign({ tag, bone: B.weapon, k: .25 }, extra);
  const L = key === 'b' ? 50 : 46, W = key === 'b' ? 3.4 : 2.8;
  S.add(RC(at(-9), at(3), 1, 1), o('cloth')); S.add(EL(at(-10), [1.6, 1.6, 1.6]), o('trim')); S.add(BX(at(3.6), [7, 1, 1.4], fr, .3), o('trim'));
  if (key !== 'a') both(s => S.add(RC(add(at(3.6), mul(fr[0], s * 7)), add(add(at(3.6), mul(fr[0], s * 9)), mul(dir, 3)), .8, .1), o('trim')));
  for (let i = 0; i < 12; i++) { const t0 = 4 + i * L / 12, w = W * (i < 10 ? 1 : (12 - i) / 2.4); S.add(BX(at(t0 + L / 24), [w, L / 24 + .1, .45], fr, .1), o('darkmetal', { k: .1, edge: 1 })); }
  S.add(RC(at(4 + L - 1), at(4 + L + 4), W * .3, .05), o('darkmetal'));
  if (key === 'b') for (let i = 0; i < 10; i++) both(s => S.add(RC(add(at(8 + i * 4), mul(fr[0], s * W)), add(add(at(9.6 + i * 4), mul(fr[0], s * (W + 1.6))), mul(dir, .6)), .5, .05), o('darkmetal', { k: .05 })));
  S.add(BX(at(4 + L * .45), [.5, L * .4, .52], fr, .1), o(key === 'a' ? 'metal' : 'glow', { k: .05 }));
  return S;
}

function details(D) {
  const S = new Sculpt();
  both(s => S.add(EL([s * 2.2, 78, 6.9], [1.1, .4, .5]), { bone: B.head, tag: 'eye', k: .1, c: [s * 2.2, 77.4, 6.8] }));
  if (D.key === 'b') for (let i = 0; i < 4; i++) S.add(EL([(i - 1.5) * 3, 55 + (i % 2) * 5, 4.4], [1.6, 2.2, 1.4]), { bone: B.chest, tag: 'glow', k: .6 }); // souls in the cage
  return S;
}

const RUNES = [[[-8, 64, 9], [-3, 54, 10]], [[8, 64, 9], [3, 54, 10]], [[0, 66, 10.5], [0, 50, 10.8]], [[-6, 50, 9], [6, 50, 9]]];
const segDist = (p, a, b) => { const ab = sub(b, a), t = clamp(F.dot(sub(p, a), ab) / F.dot(ab, ab), 0, 1); return len(sub(p, add(a, mul(ab, t)))); };
function custom(D) {
  return ({ p, n, s, tag, fine, big }) => {
    if (tag === 'eye') return { c: mixc(D.eye, [1, 1, 1], .4), a: .03, sp: 1, gl: 1, ty: 0, st: 0 };
    if (tag === 'cloth' && D.key === 'c' && p[1] < 20) { const k = clamp((20 - p[1]) / 16, 0, 1); return { c: mixc(D.colors.cloth, D.colors.glow, k * .8), a: lerp(1, .25, k), sp: .2, gl: .3, ty: 6, st: .5 }; }
    if ((tag === 'metal' || tag === 'darkmetal') && D.key === 'c') { let dm = 9; for (const [a, b] of RUNES) dm = Math.min(dm, segDist(p, a, b)); if (dm < .4) return { c: D.colors.glow, a: .08, sp: .5, gl: .5, ty: 0, st: 0 }; }
    if (s.edge && D.key !== 'a') { const fin = Math.abs(F.dot(sub(p, s.root || p), [0, 0, 0])) < 1; }
    return null;
  };
}

function build(variant, { lod = 0 } = {}) {
  const D = Object.assign({}, DESIGN[variant]), t0 = Date.now();
  const arm = armour(D); arm.build(3); const w = weapon(D); w.build(3); const fine = details(D); fine.build(2.5);
  const R = lod ? [1.2, .9, .5] : [.5, .38, .3];
  const { parts, log } = K.finish(D, [['armour', arm, R[0], 1], ['weapon', w, R[1], .5], ['detail', fine, R[2], .5]], custom(D));
  log.push((Date.now() - t0) + ' ms');
  return { parts, bones: BONES, clips: lod ? null : H.clips({ weight: .9, grip: -.1, stance: .8, banner: true }), log, design: D };
}
module.exports = { build, DESIGN, BONES, B };
