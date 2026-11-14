'use strict';
// Goblin Cutthroat (Gloomwood basic enemy): hunched and skinny, a big head with long drooping ears, a hooked nose, a
// toothy grin, yellow eyes, thin arms with big hands, a ragged tunic, a satchel, its dagger.
// Alpha: a crest of black hair, red war paint, bone ear rings, a scar. Humanoid rig at an ordinary-enemy budget.
const K = require('./kit');
const { F, H, B, POS: BASE, GRIP, both, rotX, rotZ, frameOf, LR, mixc } = K;
const { roundCone: RC, ellipsoid: EL, torus: TO, box: BX, Sculpt, norm, add, mul, sub, len, clamp, lerp, rng } = F;

// a big head, low and forward on a hunched neck
const HS = 1.5, PIV = [0, 70, 3], DROP = [0, -6, 5];
const hd = p => [PIV[0] + (p[0] - PIV[0]) * HS, PIV[1] + (p[1] - PIV[1]) * HS, PIV[2] + (p[2] - PIV[2]) * HS];
const SC = sh => F.scaled(sh, PIV, HS), h0 = p => add(p, DROP);
const POS = Object.assign({}, BASE); for (const k of ['head', 'jaw', 'hair']) POS[k] = hd(add(POS[k], DROP));
const BONES = H.bonesFrom(POS);

const DESIGN = [
  { seed: 7101, colors: { skin: [.42, .56, .24], skinDark: [.2, .3, .1], cloth: [.36, .3, .2], leather: [.3, .2, .12], metal: [.5, .5, .52], hair: [.06, .05, .05], bone: [.84, .8, .68] }, eye: [1, .85, .2] },
  { seed: 7102, alpha: 1, colors: { skin: [.36, .5, .2], skinDark: [.16, .26, .08], cloth: [.3, .1, .08], leather: [.24, .15, .09], metal: [.4, .4, .42], hair: [.04, .03, .03], bone: [.88, .84, .72] }, eye: [1, .5, .1] },
];

function body(D) {
  const S = new Sculpt(), A = (sh, o) => S.add(sh, Object.assign({ tag: 'skin' }, o));
  K.body(S, { m: .75 });
  const Hh = (sh, o) => A(SC(sh), Object.assign({ bone: B.head }, o));
  Hh(EL(h0([0, 77, 1]), [5.2, 4.8, 5.4]), { k: 1.4 }); Hh(EL(h0([0, 78.4, 5]), [4.6, 1.2, 1.6]), { k: .7 });
  Hh(RC(h0([0, 77.6, 6.4]), h0([0, 74.4, 9.6]), 1.2, .5), { k: .6 });                                                  // hooked nose
  both(s => { S.sub(SC(EL(h0([s * 2.2, 77, 6.2]), [1, .8, .8])), { k: .3 }); Hh(RC(h0([s * 4.6, 77.6, 1]), h0([s * 11.6, 76, -3]), 1.6, .3), { k: .5 }); Hh(EL(h0([s * 7.4, 77.2, -.8]), [3, .5, 1.6], rotZ(s * .2)), { k: .5 }); });
  A(SC(EL(h0([0, 72.6, 4.4]), [4.4, 2.2, 3.6])), { bone: B.jaw, k: 1 }); S.sub(SC(EL(h0([0, 73.6, 7.8]), [3.6, .6, 1.4])), { k: .2 });
  return S;
}
function gear(D) {
  const S = new Sculpt(), o = (tag, bone, extra) => Object.assign({ tag, bone, k: .5 }, extra);
  // a ragged tunic, a rope belt, a satchel, wrapped feet
  S.add(EL([0, 54, .8], [10, 9, 7]), o('cloth', B.chest, { k: 1.4 })); S.add(EL([0, 45, .8], [8.6, 6, 6.4]), o('cloth', B.spine, { k: 1.4 }));
  for (const [z, b] of [[1, B.skirtF], [-1, B.skirtB]]) { const top = []; for (let i = 0; i <= 4; i++) top.push([(i - 2) * 2.4, 41, z * 6.6]); K.sheet(S, top, 14, { bone: b, tag: 'cloth', thick: .5, folds: 2, foldDepth: .5, flare: .1, rag: .6, seed: D.seed + z, out: [0, 0, z] }); }
  S.add(TO([0, 42, .8], 8, .7, [[1, 0, 0], [0, 1, 0], [0, 0, 1.1]]), o('leather', B.root));
  S.add(BX([8.4, 38, 4], [2.6, 3, 1.6], null, .8), o('leather', B.root)); S.add(RC([-6, 64, 3], [8, 42, 5], .45, .45), o('leather', B.chest, { k: .2 }));
  both(s => { const L = LR(s); for (let j = 0; j < 3; j++) S.add(TO([s * 7, 5 + j * 2.4, .6], 3.4, .4, rotX(.05)), o('cloth', B['shin' + L])); });
  if (D.alpha) { for (let i = 0; i < 9; i++) { const z = 3 - i * 1.4; S.add(SC(RC(h0([0, 81, z]), h0([0, 85 - Math.abs(i - 3) * .4, z - 1.2]), .8, .2)), o('hair', B.head, { k: .2 })); }
    both(s => S.add(SC(TO(h0([s * 9.4, 76.4, -2]), .8, .25, null)), o('bone', B.head, { k: .1 }))); }
  return S;
}
// the dagger, held point-forward in the right hand
function weapon(D) {
  const S = new Sculpt(), dir = norm([0, 1, .35]), at = t => add(GRIP, mul(dir, t)), fr = frameOf(dir), o = (tag, extra) => Object.assign({ tag, bone: B.weapon, k: .15 }, extra);
  S.add(RC(at(-3.4), at(1.6), .55, .55), o('leather')); S.add(BX(at(2), [2.2, .4, .6], fr, .15), o('metal'));
  for (let i = 0; i < 5; i++) S.add(BX(at(3 + i * 1.6), [1.1 * (1 - i * .14), .9, .22], fr, .06), o('metal'));
  S.add(RC(at(10.6), at(12.6), .5, .04), o('metal'));
  return S;
}
function details(D) {
  const S = new Sculpt();
  both(s => S.add(SC(EL(h0([s * 2.2, 77, 6.4]), [.8, .55, .5])), { bone: B.head, tag: 'eye', k: .1 }));
  for (let i = 0; i < 7; i++) S.add(SC(RC(h0([(i - 3) * .9, 73.8, 7.6]), h0([(i - 3) * .9, 72.8, 7.8]), .35, .1)), { bone: B.head, tag: 'tooth', k: .05 });
  return S;
}
function custom(D) {
  return ({ p, n, s, tag, fine, big }) => {
    if (tag === 'eye') return { c: D.eye, a: .1, sp: 1, gl: 1, ty: 0, st: 0 };
    if (tag === 'skin') { let c = mixc(D.colors.skin, D.colors.skinDark, clamp(.3 + (big - .5) * .9 - n[1] * .15, 0, 1)); c = mul(c, .9 + fine * .2);
      if (D.alpha && p[1] > 70 && Math.abs(Math.sin(p[0] * .7)) < .25 && n[2] > .3) c = mixc(c, [.55, .05, .03], .8); return { c, sp: .35, gl: .45, ty: 3, st: .8 }; }
    return null;
  };
}
function build(variant, { lod = 0 } = {}) {
  const D = Object.assign({}, DESIGN[variant]); const b = body(D); b.build(3.5); const g = gear(D); g.build(3); const w = weapon(D); w.build(2); const d = details(D); d.build(2);
  const R = lod ? [1.6, 1.5, 1, .8] : [.8, .8, .5, .4];
  const { parts, log } = K.finish(D, [['body', b, R[0], 1.4], ['gear', g, R[1], .8], ['weapon', w, R[2], .5], ['detail', d, R[3], .5]], custom(D));
  return { parts, bones: BONES, clips: lod ? null : H.clips({ weight: .3, grip: .2, stance: 1.2, kneelDrop: 12, fallDrop: 10 }), log };
}
module.exports = { build, BONES, B };
