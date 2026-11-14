'use strict';
// Bandits (Gloomwood basic enemy): the three equipped looks of the existing Bandit kit, sculpted at an ordinary-enemy
// budget, each in a normal and an Elite form. The look is still chosen by the existing kit (EquipKit.pick, a hash of
// the monster id) and Elite still means the existing Alpha flag; only the models are new.
//   cutthroat  hood and face scarf, a short layered cowl, a cross-belt of knives, twin knives
//   brigand    a round kettle hat, a studded leather jerkin, broad tassets and thigh flaps, one leather shoulder pad,
//              a hand axe and a wooden buckler
//   marauder   a pointed nasal helm, a heavy fur mantle, an iron-studded chest strap, iron pauldrons, a broad falchion
//   Elite      blackened metal, blood-red cloth, darker leather and a glowing ember edge on every blade
// Humanoid rig; units match the other humanoids (the client scales it to the old model's height).
const K = require('./kit');
const { F, H, B, POS, GRIP, both, rotX, rotZ, frameOf, LR, mixc } = K;
const { roundCone: RC, ellipsoid: EL, torus: TO, box: BX, Sculpt, norm, add, mul, sub, len, clamp, lerp, rng } = F;
const BONES = H.bonesFrom(POS);

const PAL = elite => ({
  skin: [.66, .5, .4], skinDark: [.38, .26, .2], hair: [.18, .13, .1],
  leather: elite ? [.2, .13, .09] : [.36, .24, .15], leatherDark: elite ? [.12, .08, .06] : [.24, .16, .1],
  trousers: elite ? [.1, .09, .1] : [.2, .19, .2], cloth: elite ? [.36, .06, .07] : [.2, .2, .22], cloth2: elite ? [.24, .05, .06] : [.44, .17, .15],
  metal: elite ? [.18, .17, .19] : [.48, .49, .5], darkmetal: elite ? [.09, .09, .1] : [.28, .28, .3], trim: elite ? [.5, .32, .18] : [.66, .52, .3],
  fur: elite ? [.32, .26, .2] : [.44, .36, .26], wood: [.3, .2, .12], glow: [1, .5, .18],
});
const LOOKS = ['cutthroat', 'brigand', 'marauder'];

function body(D) {
  const S = new Sculpt();
  K.body(S, { m: 1.02, tag: 'cloth2' });                                                                       // a clothed body
  // a lean, hard face with a stubbled jaw, a straight nose, deep-set eyes
  S.add(EL([0, 77.4, 1.6], [4.6, 5.6, 5.2]), { bone: B.head, tag: 'skin', k: 1.2 });
  S.add(EL([0, 79, 5.4], [4.2, 1.1, 1.4]), { bone: B.head, tag: 'skin', k: .6 });
  S.add(RC([0, 78, 6.6], [0, 75.6, 7.8], .8, 1), { bone: B.head, tag: 'skin', k: .4 });
  both(s => S.sub(EL([s * 2, 77.4, 6.2], [1, .7, .8]), { k: .3 }));
  S.add(EL([0, 73.2, 4.4], [3.8, 2.2, 3]), { bone: B.jaw, tag: 'stubble', k: .9 });
  // bare hands and neck in skin; the rest is the clothed body
  both(s => { const L = LR(s); S.add(EL([s * 15.5, 34.6, 3.6], [1.9, 2.9, 2.5]), { bone: B['hand' + L], tag: 'skin', k: .8 }); });
  S.add(RC([0, 66, 0], [0, 72.5, 1.5], 3.6, 3.2), { bone: B.neck, tag: 'skin', k: 1.2 });
  return S;
}

function gear(D) {
  const S = new Sculpt(), o = (tag, bone, extra) => Object.assign({ tag, bone, k: .45 }, extra), look = D.look, R = rng(D.seed);
  // shared: boots, trousers wraps, a belt
  both(s => { const L = LR(s), f = p => [s * p[0], p[1], p[2]]; S.add(RC(f([7, 15, 1]), f([7, 4, .4]), 4, 3.6), o('leatherDark', B['shin' + L], { k: .5 })); S.add(EL(f([7, 2.8, 3]), [3, 2.6, 5.4]), o('leatherDark', B['foot' + L]));
    S.add(TO(f([7, 16, 1]), 3.9, .5, rotX(.05)), o('leather', B['shin' + L]));
    S.add(RC(f([6.6, 40, .8]), f([7, 22, .8]), 6, 5.2), o('trousers', B['thigh' + L], { k: .8 })); S.add(RC(f([7, 22, .8]), f([7, 15, 1]), 5.2, 4.6), o('trousers', B['shin' + L], { k: .6 }));
    S.add(RC(f([15.2, 48, 2]), f([15.4, 39, 3.4]), 2.6, 2.3), o('leather', B['farm' + L], { k: .4 })); });
  S.add(TO([0, 43, .8], 9.6, 1.1, [[1, 0, 0], [0, 1, 0], [0, 0, 1.1]]), o('leather', B.root)); S.add(BX([0, 43, 10.6], [1.6, 1.4, .5], null, .3), o('trim', B.root));
  if (look === 'cutthroat') {
    // a deep hood, a scarf over the lower face, a short layered cowl, a cross-belt of knives
    S.add(EL([0, 78.6, .6], [6.4, 7, 6.6]), o('cloth', B.head, { k: .8 })); S.sub(EL([0, 76.6, 6.6], [4.2, 5.4, 4]), { k: .8 }); S.add(RC([0, 80, -4], [0, 74, -8], 3, 1), o('cloth', B.head, { k: .6 }));
    S.add(EL([0, 73.6, 5], [4.4, 2.6, 2.8]), o('cloth2', B.jaw, { k: .6 }));
    const top = []; for (let i = 0; i <= 8; i++) { const a = (i / 8 - .5) * 2.8; top.push([Math.sin(a) * 11, 68 - Math.abs(Math.sin(a)) * 1.2, -Math.cos(a) * 6 + 1]); } K.sheet(S, top, 16, { bone: B.chest, tag: 'cloth', thick: .55, folds: 6, foldDepth: .8, flare: .2, rag: .4, seed: D.seed, out: [0, 0, -1] });
    both(s => S.add(RC([s * 9, 66, 4], [-s * 8, 46, 7], .7, .7), o('leather', B.chest, { k: .2 })));
    for (let i = 0; i < 4; i++) { const t = .2 + i * .2, p = add([9, 66, 4.6], mul([-17, -20, 3], t)); S.add(BX(p, [.5, 1.8, .4], rotZ(.7), .1), o('metal', B.chest, { k: .05 })); }
  }
  if (look === 'brigand') {
    // a round kettle hat with a broad brim, a studded jerkin, tassets, thigh flaps, one leather pad on the left shoulder
    S.add(EL([0, 80.8, 1], [5.6, 4, 5.8]), o('metal', B.head, { k: .4 })); S.add(TO([0, 79, 1], 7.6, .9, null), o('metal', B.head, { k: .3 }));
    S.add(EL([0, 57, 1.2], [12.4, 10.6, 8.6]), o('leather', B.chest, { k: 1.2 })); S.add(EL([0, 47, 1.2], [10.4, 6.6, 7.6]), o('leather', B.spine, { k: 1.2 }));
    for (let i = 0; i < 20; i++) { const a = (i % 5 - 2) * .35, y = 62 - Math.floor(i / 5) * 4.6, p = [Math.sin(a) * 9.6, y, 1.2 + Math.cos(a) * 8.4]; S.add(EL(p, [.55, .55, .55]), o('trim', B.chest, { k: .05 })); }
    for (const [x, b] of [[-5, B.skirtR], [5, B.skirtL], [0, B.skirtF]]) S.add(EL([x, 37, 8.6], [4.6, 5, 1.2], rotX(.1)), o('leather', b, { k: .4 }));
    both(s => S.add(EL([s * 7.6, 33, 5], [3.6, 5, 1.2], rotX(.1)), o('leather', B['thigh' + LR(s)], { k: .4 })));
    S.add(EL([14, 67, 0], [5.6, 2.6, 6.4], rotZ(-.42)), o('leather', B.uarmL, { k: .3 }));
    // the buckler on the left forearm
    const bc = [17.2, 44, 5]; S.add(EL(bc, [5.2, 5.2, .8], [[0, 0, 1], [0, 1, 0], [-1, 0, 0]]), o('wood', B.farmL, { k: .3 })); S.add(TO(bc, 5, .5, [[0, 0, 1], [1, 0, 0], [0, 1, 0]]), o('metal', B.farmL)); S.add(EL(add(bc, [.8, 0, 0]), [1.6, 1.6, 1]), o('metal', B.farmL));
  }
  if (look === 'marauder') {
    // a pointed nasal helm, a heavy fur mantle, a studded chest strap, iron pauldrons both sides
    S.add(EL([0, 80.4, 1], [5.6, 4.6, 5.8]), o('metal', B.head, { k: .4 })); S.add(RC([0, 83.4, 1], [0, 87.6, .4], 2.4, .3), o('metal', B.head, { k: .5 }));
    S.add(BX([0, 76.6, 7], [.5, 2.4, .5], rotX(-.15), .2), o('metal', B.head)); S.add(TO([0, 78.4, 1], 5.7, .5, [[1, 0, 0], [0, 1, 0], [0, 0, 1.05]]), o('trim', B.head));
    S.add(EL([0, 57, 1], [12, 10, 8]), o('leather', B.chest, { k: 1.2 }));
    S.add(RC([-11, 66, 3], [10, 46, 8.4], 1.1, 1.1), o('leatherDark', B.chest, { k: .2 })); for (let i = 0; i < 6; i++) S.add(EL(add([-11, 66, 3.8], mul([21, -20, 5.4], (i + .5) / 6)), [.6, .6, .6]), o('trim', B.chest, { k: .05 }));
    S.add(EL([0, 66, -1.6], [14.4, 4.6, 9.6]), o('fur', B.chest, { k: 1.8 }));
    both(s => { const L = LR(s), f = p => [s * p[0], p[1], p[2]]; for (let j = 0; j < 3; j++) S.add(EL(f([14 + j * .5, 67.4 - j * 2.3, 0]), [5.8 - j * .5, 2.4, 6.4 - j * .5], rotZ(s * -.42)), o(j ? 'metal' : 'trim', B['uarm' + L], { k: .3 })); });
  }
  return S;
}

function weapons(D) {
  const S = new Sculpt(), look = D.look;
  const blade = (bone, grip, dir, len, w, kind) => { const d = norm(dir), at = t => add(grip, mul(d, t)), fr = frameOf(d), o = (tag, x) => Object.assign({ tag, bone, k: .15 }, x);
    S.add(RC(at(-3.6), at(1.4), .55, .55), o('leatherDark')); S.add(EL(at(-4), [.8, .8, .8]), o('trim'));
    if (kind === 'axe') { S.add(RC(at(-6), at(16), .6, .55), o('wood')); const h = at(14), out = mul(fr[0], -1); for (let i = 0; i < 6; i++) { const v = -2.5 + i, wv = 4.4 * Math.sqrt(Math.max(0, 1 - (v / 3.2) ** 2)); S.add(BX(add(add(h, mul(out, 1 + wv / 2)), mul(d, v)), [wv / 2 + .2, .55, .25], [out, d, fr[2]], .08), o('metal')); S.add(EL(add(add(h, mul(out, 1.4 + wv)), mul(d, v)), [.3, .6, .28], [out, d, fr[2]]), o('edge', { k: .05 })); } return; }
    S.add(BX(at(1.8), [kind === 'falchion' ? 2.6 : 1.6, .4, .55], fr, .15), o('trim'));
    const n = 6; for (let i = 0; i < n; i++) { const t0 = 2.4 + i * len / n, ww = w * (kind === 'falchion' ? (i < 4 ? 1 + i * .1 : 1.4 - (i - 3) * .45) : 1 - i * .12); S.add(BX(at(t0 + len / (2 * n)), [ww, len / (2 * n) + .05, .22], fr, .06), o('metal'));
      S.add(EL(add(at(t0 + len / (2 * n)), mul(fr[0], ww + .1)), [.25, len / (2 * n) + .1, .2], fr), o('edge', { k: .03 })); }
    S.add(RC(at(2.4 + len), at(2.4 + len + 1.6), w * .45, .04), o('metal'));
  };
  if (look === 'cutthroat') { blade(B.weapon, GRIP, [0, 1, .3], 9, 1, 'knife'); blade(B.handL, [15.4, 35, 4.2], [0, 1, .3], 9, 1, 'knife'); }
  if (look === 'brigand') blade(B.weapon, GRIP, [0, 1, .25], 0, 0, 'axe');
  if (look === 'marauder') blade(B.weapon, GRIP, [0, 1, .2], 18, 1.6, 'falchion');
  return S;
}

function details(D) { const S = new Sculpt(); both(s => S.add(EL([s * 2, 77.4, 6.2], [.6, .5, .4]), { bone: B.head, tag: 'eye', k: .1 })); return S; }

function custom(D) {
  return ({ p, n, s, tag, fine, big }) => {
    const C = D.colors;
    if (tag === 'eye') return { c: [.12, .1, .08], sp: 1, gl: .9, ty: 0, st: 0 };
    if (tag === 'stubble') return { c: mixc(C.skin, C.hair, .55 + fine * .2), sp: .2, gl: .3, ty: 2, st: .6 };
    if (tag === 'edge') return D.elite ? { c: C.glow, a: .08, sp: .5, gl: .5, ty: 0, st: 0 } : { c: [.86, .88, .9], sp: 1, gl: .95, ty: 8, st: .2 };
    if (tag === 'trousers') return { c: mul(C.trousers, .85 + fine * .3), sp: .1, gl: .2, ty: 6, st: .9 };
    if (tag === 'leatherDark') return { c: mul(C.leatherDark, .85 + fine * .3), sp: .3, gl: .4, ty: 3, st: .7 };
    if (tag === 'cloth2' || tag === 'cloth') { const c = C[tag]; return { c: mixc(mul(c, .62), c, clamp(.3 + big * .7 + n[1] * .2, 0, 1)), sp: .1, gl: .25, ty: 6, st: .9 }; }
    if ((tag === 'metal' || tag === 'trim') && !D.elite) { const rust = clamp((F.noise3(p[0] * .6, p[1] * .6, p[2] * .6, 6) - .55) * 2.5, 0, 1); if (rust > .2) return { c: mixc(C[tag], [.38, .2, .1], rust * .7), sp: .3, gl: .4, ty: 8, st: .7 }; }
    return null;
  };
}

function make(look) {
  return { build: (variant, { lod = 0 } = {}) => {
    const elite = variant === 1, D = { look, elite, seed: 9100 + LOOKS.indexOf(look) * 10 + variant, colors: PAL(elite) };
    const b = body(D); b.build(3.5); const g = gear(D); g.build(3); const w = weapons(D); w.build(2); const d = details(D); d.build(2);
    const R = lod ? [1.8, 1.6, 1.1, .8] : [.95, .92, .45, .4];
    const { parts, log } = K.finish(D, [['body', b, R[0], 1.4], ['gear', g, R[1], .8], ['weapons', w, R[2], .5], ['detail', d, R[3], .5]], custom(D));
    return { parts, bones: BONES, clips: lod ? null : H.clips({ weight: .4, grip: -.1, stance: .8, kneelDrop: 14, fallDrop: 12 }), log };
  } };
}
module.exports = { make, LOOKS };
