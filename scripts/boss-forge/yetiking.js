'use strict';
// Yeti King, Region Boss of Frostfang Peaks: a huge snow ape, white shaggy fur, a blue-grey face, forward-curving horns,
// huge shoulders, long arms with clawed fists, short bowed legs, an ice crown.
//   A standard   white mane, an ice crown, bare-handed (great clawed fists)
//   B empowered  armoured in glacier ice: crystal plates on shoulders, forearms and back, an ice-crusted mane, a jagged
//                ice crown, ice knuckle spikes
//   C ancient    a frost spirit: an aurora mane glowing green-to-violet at the tips, ancient carved stone ornaments
//                braided into the fur, glowing rune bands on the arms, a halo of floating ice shards behind the head
// Humanoid rig; units match the other humanoid bosses.
const K = require('./kit');
const { F, H, B, POS: BASE, both, rotX, rotZ, LR, mixc } = K;
const { roundCone: RC, ellipsoid: EL, torus: TO, box: BX, Sculpt, norm, add, mul, sub, len, clamp, lerp, rng } = F;

const HS = 1.05, PIV = [0, 70, 2], DROP = [0, -3, 3.6];
const hd = p => [PIV[0] + (p[0] - PIV[0]) * HS, PIV[1] + (p[1] - PIV[1]) * HS, PIV[2] + (p[2] - PIV[2]) * HS];
const SC = shape => F.scaled(shape, PIV, HS), h0 = p => add(p, DROP);
const POS = Object.assign({}, BASE); for (const k of ['head', 'jaw', 'hair']) POS[k] = hd(add(POS[k], DROP));
const BONES = H.bonesFrom(POS);

const DESIGN = [
  { key: 'a', name: 'standard', seed: 1401, colors: { skin: [.46, .54, .64], skinDark: [.26, .32, .42], fur: [.93, .95, .98], hair: [.93, .95, .98], horn: [.78, .74, .64], glow: [.5, .85, 1] }, eye: [.4, .8, 1] },
  { key: 'b', name: 'empowered', seed: 1402, colors: { skin: [.4, .48, .6], skinDark: [.22, .28, .38], fur: [.84, .9, .96], hair: [.84, .9, .96], horn: [.7, .72, .76], glow: [.45, .8, 1] }, eye: [.3, .7, 1] },
  { key: 'c', name: 'ancient', seed: 1403, colors: { skin: [.44, .46, .58], skinDark: [.24, .24, .36], fur: [.88, .9, .96], hair: [.88, .9, .96], horn: [.86, .82, .7], glow: [.4, 1, .75], metal: [.5, .52, .56] }, eye: [.5, 1, .8] },
];

function anatomy(D) {
  const S = new Sculpt(), A = (shape, o) => S.add(shape, Object.assign({ tag: 'fur' }, o));
  K.body(S, { m: 1.6, tag: 'fur', hands: false });
  A(EL([0, 63, -3], [15, 9, 9]), { bone: B.chest, k: 4 }); both(s => A(EL([s * 11, 68, -1], [8, 6.4, 7.6]), { bone: B.chest, k: 4 }));
  both(s => { const L = LR(s), f = p => [s * p[0], p[1], p[2]];
    A(RC(f([16, 48, 1.6]), f([17.4, 33, 4]), 5.4, 4.6), { bone: B['farm' + L], k: 2 });
    S.add(EL(f([17.6, 29.6, 4.6]), [4, 4.4, 4.4]), { bone: B['hand' + L], tag: 'skin', k: 1.2 });
    for (let i = 0; i < 4; i++) S.add(RC(f([16.4 + i * .9, 26.6, 6 + i * .5]), f([16.2 + i * .9, 24, 8.4 + i * .3]), .8, .25), { bone: B['hand' + L], tag: 'horn', k: .2 }); });
  // the face: blue-grey skin, a heavy brow, a flat ape nose, a wide fanged mouth
  const Hh = (shape, o) => S.add(SC(shape), Object.assign({ bone: B.head, tag: 'skin' }, o));
  A(SC(EL(h0([0, 77.4, -.4]), [6.6, 6.6, 6.6])), { bone: B.head, k: 1.6 });
  Hh(EL(h0([0, 76.6, 4.8]), [4.8, 4.4, 2.4]), { k: 1 }); Hh(EL(h0([0, 79.2, 6]), [4.6, 1.3, 1.6]), { k: .7 });
  Hh(EL(h0([0, 76, 7.2]), [2, 1.4, 1.2]), { k: .5 }); both(s => S.sub(SC(EL(h0([s * 2.2, 78, 7.2]), [1, .7, .8])), { k: .3 }));
  S.add(SC(EL(h0([0, 72.6, 5.6]), [4.8, 2.4, 3.4])), { bone: B.jaw, tag: 'skin', k: 1 });
  return S;
}

function extras(D) {
  const S = new Sculpt(), key = D.key, o = (tag, bone, extra) => Object.assign({ tag, bone, k: .4 }, extra);
  // horns curving forward from the temples
  both(s => { let p = h0([s * 5.6, 81, -.6]), d = norm([s * .9, .5, -.2]); for (let i = 0; i < 8; i++) { const q = add(p, mul(d, 2.3)); S.add(SC(RC(p, q, 1.9 - i * .2, 1.7 - i * .2)), o('horn', B.head, { k: .3, root: h0([s * 5.6, 81, -.6]), L: 18 })); p = q; d = norm(add(d, [s * -.12, -.12, .24])); } });
  // the crown: ice crystals (A), a jagged ice crown (B), a halo of floating shards (C)
  const crownC = h0([0, 83.4, -.6]);
  if (key !== 'c') K.crystals(S, crownC, [0, 1, 0], { count: key === 'b' ? 11 : 7, length: key === 'b' ? 11 : 7, r: 3.6, seed: D.seed, bone: B.head, spread: .45 });
  else for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, c = add(h0([0, 80, -9]), [Math.cos(a) * 11, Math.sin(a) * 11, 0]); S.add(RC(add(c, [Math.cos(a) * -1.6, Math.sin(a) * -1.6, 0]), add(c, [Math.cos(a) * 2.6, Math.sin(a) * 2.6, 0]), 1, .1), o('ice', B.head, { k: .2, root: c, L: 4 })); }
  if (key === 'c') S.add(TO(h0([0, 80, -9]), 11, .35, rotX(Math.PI / 2)), o('glow', B.head, { k: .1 }));
  // fanged mouth
  both(s => S.add(SC(RC(h0([s * 2, 73.6, 7.2]), h0([s * 2.1, 71, 7.4]), .55, .1)), o('tooth', B.head, { k: .1 })));
  both(s => S.add(SC(EL(h0([s * 2.2, 78, 7.6]), [.75, .5, .5])), { bone: B.head, tag: 'eye', k: .1, c: hd(h0([s * 2.2, 78, 7.6])) }));
  // B: glacier ice armour
  if (key === 'b') { both(s => { const L = LR(s), f = p => [s * p[0], p[1], p[2]];
      K.crystals(S, f([14, 70, -1]), [s * .6, 1, -.2], { count: 7, length: 12, r: 3, seed: D.seed + (s > 0 ? 3 : 4), bone: B['uarm' + L], spread: .5 });
      for (let j = 0; j < 3; j++) S.add(BX(f([17, 44 - j * 4, 4.6]), [3.6, 1.8, 2.6], rotZ(s * .2), .6), o('ice', B['farm' + L], { k: .5, root: f([17, 44, 4.6]), L: 10 }));
      K.crystals(S, f([17.6, 31, 8]), [0, -.2, 1], { count: 4, length: 5, r: 1.6, seed: D.seed + 9, bone: B['hand' + L], spread: .25 }); });
    for (const [x, y] of [[-6, 64], [6, 64], [0, 56], [-4, 48], [4, 48]]) K.crystals(S, [x, y, -11], [x * .05, .4, -1], { count: 3, length: 9, r: 1.6, seed: D.seed + x + y, bone: B.chest }); }
  // C: carved stone ornaments braided into the mane, rune bands
  if (key === 'c') { for (let i = 0; i < 7; i++) { const a = (i / 6 - .5) * 2.4, p = [Math.sin(a) * 13, 64 - Math.cos(a) * 3, 9 + Math.cos(a) * 1]; S.add(BX(p, [1.4, 1.8, .8], rotZ(a), .4), o('metal', B.chest, { k: .2 })); }
    both(s => { const L = LR(s); for (let j = 0; j < 2; j++) S.add(TO([s * (16.6 + j * .3), 44 - j * 6, 2.6 + j], 5, .5, rotX(-.1)), o('glow', B['farm' + L], { k: .1 })); }); }
  return S;
}

// shaggy fur all over, a long mane on shoulders and back
function addLocks(S, D) {
  return K.locks(S, D.seed * 7 + 1, (p, n, s) => {
    if (s.tag !== 'fur') return null;
    if (p[1] > 58 && n[2] < .5) return { chance: .9, len: [8, 15], r: 1.5, flow: [0, -1, -.4], up: .3, tag: 'fur' };
    if (p[1] > 30 && p[1] <= 58) return { chance: .55, len: [5, 9], r: 1.25, flow: [0, -1, 0], up: .3, tag: 'fur' };
    return { chance: .4, len: [4, 7], r: 1.1, flow: [0, -1, .2], up: .3, tag: 'fur' };
  }, 1.4);
}

function custom(D) {
  return ({ p, n, s, tag, fine, big }) => {
    if (tag === 'eye') { const q = mul(sub(p, s.c), 1 / HS), r0 = Math.hypot(q[0], q[1] * 1.6); return { c: mixc(mul(D.eye, .45), mixc(D.eye, [1, 1, 1], .6), clamp(1.1 - r0, 0, 1)), a: .05, sp: 1, gl: 1, ty: 0, st: 0 }; }
    if (tag === 'fur') { const t = s.root && s.L ? clamp(len(sub(p, s.root)) / s.L, 0, 1) : 0, c = mul(mixc(mul(D.colors.fur, .88), D.colors.fur, Math.pow(t, .6)), .95 + fine * .08);
      if (D.key === 'c' && t > .86) { const hue = clamp((p[1] - 30) / 50, 0, 1); return { c: mixc([.35, 1, .7], [.7, .45, 1], hue), a: .6, sp: .3, gl: .4, ty: 2, st: .6 }; }
      if (D.key === 'b' && t > .75 && fine > .5) return { c: [.75, .9, 1], sp: 1, gl: .9, ty: 5, st: .3 };
      return { c, a: .92, sp: .15, gl: .3, ty: 2, st: 1 }; }
    return null;
  };
}

function build(variant, { lod = 0 } = {}) {
  const D = Object.assign({}, DESIGN[variant]), t0 = Date.now();
  const body = anatomy(D); body.build(4); const n = addLocks(body, D); body.build(3); const ex = extras(D); ex.build(2.5);
  const R = lod ? [1.3, .7] : [.64, .3];
  const { parts, log } = K.finish(D, [['body', body, R[0], 1.6], ['extras', ex, R[1], .5]], custom(D));
  log.push('locks ' + n + ', ' + (Date.now() - t0) + ' ms');
  return { parts, bones: BONES, clips: lod ? null : H.clips({ weight: 1, grip: .1, stance: 1.2 }), log, design: D };
}
module.exports = { build, DESIGN, BONES, B };
