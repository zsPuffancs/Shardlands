'use strict';
// Orc Warlord, Region Boss of Gloomwood: a scarred green orc chieftain.
//   A standard   iron pauldrons over a leather war-harness, a fur mantle, a broad notched cleaver, a topknot
//   B empowered  spiked black plate, a trophy belt of skulls, three war banners on the back, red war paint,
//                longer tusks and a horned iron half-helm, a cleaver with a serrated spine
//   C ancient    a grey-green elder: a bone crown, glowing ritual tattoos, ritual beads and teeth necklaces, a bone
//                and hide mantle, a long braided beard, a two-handed runic greataxe with a glowing edge
// Humanoid rig (scripts/boss-forge/humanoid.js); units match the other humanoid bosses (top ~95, facing +z).
const K = require('./kit');
const { F, H, B, POS: BASE, GRIP, both, rotX, rotY, rotZ, frameOf, LR, mixc } = K;
const { roundCone: RC, ellipsoid: EL, torus: TO, box: BX, Sculpt, norm, add, mul, sub, len, clamp, lerp, rng } = F;

// the head sits low and forward between the shoulders; scaled up about its pivot
const HS = 1.2, PIV = [0, 70, 3], hd = p => [PIV[0] + (p[0] - PIV[0]) * HS, PIV[1] + (p[1] - PIV[1]) * HS, PIV[2] + (p[2] - PIV[2]) * HS];
const unhd = p => [PIV[0] + (p[0] - PIV[0]) / HS, PIV[1] + (p[1] - PIV[1]) / HS, PIV[2] + (p[2] - PIV[2]) / HS];
const SC = shape => F.scaled(shape, PIV, HS);
const DROP = [0, -2.2, 2.4]; // head lowered and pushed forward
const POS = Object.assign({}, BASE); for (const k of ['head', 'jaw', 'hair']) POS[k] = hd(add(POS[k], DROP));
const BONES = H.bonesFrom(POS);
const h0 = p => add(p, DROP); // head-space helper: author the head at the standard height, then lower it

const DESIGN = [
  { key: 'a', name: 'standard', seed: 1101, colors: { skin: [.36, .52, .24], skinDark: [.16, .26, .1], hair: [.08, .07, .06], fur: [.36, .28, .2], metal: [.42, .42, .44], darkmetal: [.18, .17, .17], trim: [.6, .44, .24], leather: [.3, .19, .11], cloth: [.42, .1, .08], horn: [.86, .8, .64], glow: [1, .5, .2] }, eye: [1, .7, .15] },
  { key: 'b', name: 'empowered', seed: 1102, colors: { skin: [.3, .46, .2], skinDark: [.12, .22, .08], hair: [.06, .05, .05], fur: [.18, .15, .13], metal: [.3, .3, .32], darkmetal: [.09, .09, .1], trim: [.55, .14, .1], leather: [.22, .13, .08], cloth: [.55, .08, .06], horn: [.8, .75, .62], glow: [1, .25, .1], bone: [.84, .8, .68] }, eye: [1, .3, .1] },
  { key: 'c', name: 'ancient', seed: 1103, colors: { skin: [.4, .47, .34], skinDark: [.2, .24, .16], hair: [.82, .82, .78], fur: [.6, .55, .46], metal: [.44, .4, .32], darkmetal: [.16, .14, .12], trim: [.72, .58, .3], leather: [.32, .22, .14], cloth: [.18, .26, .2], horn: [.88, .84, .7], glow: [.35, 1, .55], bone: [.88, .84, .72] }, eye: [.4, 1, .6] },
];

function anatomy(D) {
  const S = new Sculpt(), A = (shape, o) => S.add(shape, Object.assign({ tag: 'skin' }, o));
  K.body(S, { m: 1.34 });
  // a barrel chest and a great trapezius hump that the head hangs forward from
  A(EL([0, 63.5, -3.4], [11, 6.4, 7]), { bone: B.chest, k: 3 });
  A(EL([0, 52, 3.4], [10.4, 8, 6.4]), { bone: B.spine, k: 2.4 });
  both(s => A(EL([s * 7.4, 67.6, -1.8], [6.4, 4.4, 5.6]), { bone: B.chest, k: 2.4 }));
  // the head: a broad skull, a heavy shelf of a brow, small deep eyes, a flat wide nose, a jutting underbite
  const H = (shape, o) => A(SC(shape), Object.assign({ bone: B.head }, o));
  H(EL(h0([0, 77.6, .4]), [5.6, 5.4, 5.6]), { k: 1.6 });
  H(EL(h0([0, 79.6, 4.8]), [5.6, 1.7, 2.2]), { k: .8 });                                               // brow ridge
  both(s => H(EL(h0([s * 3.6, 79.2, 5.4]), [2, 1.3, 1.6]), { k: .6 }));
  H(EL(h0([0, 75.8, 7]), [2.2, 1.7, 1.8]), { k: .7 }); both(s => H(EL(h0([s * 1.5, 75, 7.3]), [1.1, .9, 1]), { k: .4 })); // the nose and nostrils
  both(s => H(EL(h0([s * 3.8, 75.4, 4.8]), [2.2, 2, 2]), { k: .9 }));                                 // cheekbones
  both(s => S.sub(SC(EL(h0([s * 2.3, 77.8, 6.9]), [1.1, .8, .9])), { k: .3 }));                          // deep sockets
  both(s => S.sub(SC(EL(h0([s * 1.2, 74.9, 8.6]), [.45, .4, .6])), { k: .15 }));
  A(SC(EL(h0([0, 71.6, 5.4]), [5.4, 2.8, 4])), { bone: B.jaw, k: 1.2 });                                 // the heavy jaw
  A(SC(EL(h0([0, 72.6, 8.1]), [4, 1.2, 1.4])), { bone: B.jaw, k: .7 });                                  // jutting lower lip
  // ears: long, swept back, notched
  both(s => { const e0 = h0([s * 5.2, 77.6, .6]); H(RC(e0, h0([s * 9.2, 80.4, -3.8]), 1.3, .3), { k: .6 }); H(EL(h0([s * 6.6, 78.4, -1]), [1.3, 2, 1.2], rotZ(s * -.5)), { k: .6 });
    if (D.key !== 'a') S.sub(SC(EL(h0([s * 8, 79.8, -2.8]), [.6, .7, .9])), { k: .1 }); });
  if (D.key === 'c') S.sub(SC(RC(h0([2.6, 81, 6]), h0([4.4, 74, 6.6]), .3, .26)), { k: .2 });             // an old scar across the eye
  return S;
}

// armour, harness, mantle, belt and trophies
function armour(D) {
  const S = new Sculpt(), o = (tag, bone, extra) => Object.assign({ tag, bone, k: .5 }, extra), key = D.key, R = rng(D.seed);
  // trousers and wrapped boots
  both(s => { const L = LR(s), f = p => [s * p[0], p[1], p[2]];
    S.add(RC(f([6.8, 37, .4]), f([7.4, 22, 1.6]), 7.2, 5.4), o('cloth', B['thigh' + L], { k: .9, color: mul(D.colors.leather, .9) }));
    S.add(RC(f([7.2, 20, 1.4]), f([7.2, 7, .4]), 5.2, 4.4), o('leather', B['shin' + L], { k: .6 })); S.add(EL(f([7.2, 3, 3]), [3.8, 3.4, 6.2]), o('leather', B['foot' + L]));
    for (let j = 0; j < 4; j++) S.add(TO(f([7.2, 9 + j * 3, .7]), 4.7, .45, rotX(.08)), o(j % 2 ? 'leather' : 'darkmetal', B['shin' + L]));
    if (key === 'b') S.add(RC(f([7.4, 21, 2]), f([7.4, 8, 1.6]), 4.8, 4), o('darkmetal', B['shin' + L], { k: .4 })); });
  // a wide war-belt with an iron boss buckle, and a loincloth hanging front and back
  S.add(TO([0, 42.6, 1.4], 10.2, 1.7, [[1, 0, 0], [0, 1, 0], [0, 0, 1.12]]), o('leather', B.root));
  S.add(EL([0, 42.6, 10.6], [3.6, 3.2, 1.2]), o(key === 'c' ? 'bone' : 'metal', B.root, { k: .3 }));
  for (const [z, b] of [[1, B.skirtF], [-1, B.skirtB]]) { const top = []; for (let i = 0; i <= 5; i++) { const a = (i / 5 - .5) * 1.2; top.push([Math.sin(a) * 9, 40.6, z * (8.6 + Math.cos(a) * 2)]); }
    K.sheet(S, top, 22, { bone: b, tag: 'cloth', thick: .4, folds: 3, foldDepth: .7, flare: .12, rag: key === 'a' ? .25 : .12, seed: D.seed + z, out: [0, 0, z] }); }
  // torso: a leather harness crossing the chest (A), black plate (B), bone and hide (C)
  if (key === 'b') {
    S.add(EL([0, 58, 2], [15.4, 11.8, 10]), o('darkmetal', B.chest, { k: 1.2 })); S.add(EL([0, 47.6, 2.2], [12, 6, 8.4]), o('darkmetal', B.spine, { k: 1 }));
    S.add(EL([0, 59.6, 9.6], [10, 7.4, 2.4]), o('metal', B.chest, { k: .8 }));
    for (let i = 0; i < 5; i++) { const a = (i - 2) * .32; S.add(RC([Math.sin(a) * 10, 61 - Math.abs(i - 2) * 2, 10.4], [Math.sin(a) * 12, 63 - Math.abs(i - 2) * 2, 15.6], .9, .08), o('metal', B.chest, { k: .2 })); } // chest spikes
  } else {
    both(s => { const p0 = [s * 11.4, 67, -3], p1 = [s * 3, 58, 10.6], p2 = [-s * 9, 45, 8.6]; S.add(RC(p0, p1, 1.4, 1.4), o('leather', B.chest, { k: .3 })); S.add(RC(p1, p2, 1.4, 1.4), o('leather', B.chest, { k: .3 })); });
    S.add(EL([0, 55, 11], [2.6, 2.6, 1]), o(key === 'c' ? 'bone' : 'metal', B.chest, { k: .2 }));
  }
  // pauldrons: stacked iron lames (A), spiked black plate (B), a beast skull and hide (C)
  both(s => { const L = LR(s), f = p => [s * p[0], p[1], p[2]];
    if (key === 'c') { K.skull(S, f([15.6, 70.6, 1]), { r: 3.6, jawOpen: .3, bone: B['uarm' + L], jawBone: B['uarm' + L] }); S.add(EL(f([14.4, 66.6, 0]), [6.6, 3.2, 7]), o('fur', B['uarm' + L], { k: 1 }));
      for (let i = 0; i < 2; i++) S.add(RC(f([17 + i, 73, -1 + i * 2]), f([22 + i * 2, 80, -3 + i * 2]), .9, .15), o('horn', B['uarm' + L], { k: .2 })); }
    else { for (let j = 0; j < 4; j++) S.add(EL(f([14.2 + j * .6, 68.4 - j * 2.4, 0]), [6.6 - j * .5, 2.6, 7.2 - j * .5], rotZ(s * -.45)), o(j ? 'metal' : 'trim', B['uarm' + L], { k: .3, color: key === 'b' ? (j ? D.colors.darkmetal : D.colors.trim) : undefined }));
      if (key === 'b') for (let j = 0; j < 3; j++) S.add(RC(f([15 + j * 2.4, 71 - j * 1.4, -2 + j * 2]), f([18 + j * 3.4, 79 - j * 1.6, -3 + j * 2.4]), 1.3, .1), o('metal', B['uarm' + L], { k: .2 }));
      for (let i = 0; i < 6; i++) S.add(EL(f([14.4 + i * .5, 69.6 - i * .3, -4 + i * 1.6]), [.45, .45, .45]), o('trim', B['uarm' + L], { k: .1 })); }
    // bracers
    S.add(RC(f([14.8, 47, 1.7]), f([15.4, 39.6, 3.2]), 4, 3.4), o(key === 'b' ? 'darkmetal' : 'leather', B['farm' + L], { k: .4 }));
    for (let j = 0; j < 3; j++) S.add(TO(f([15.1, 46 - j * 2.8, 2.4]), 3.9, .4, rotX(-.1)), o('metal', B['farm' + L])); });
  // the mantle over the shoulders and back
  if (key !== 'b') { S.add(EL([0, 66.4, -3.6], [15.4, 4.8, 9]), o('fur', B.chest, { k: 2 })); }
  else { const top = []; for (let i = 0; i <= 8; i++) { const a = (i / 8 - .5) * 2.4; top.push([Math.sin(a) * 13.6, 67 - Math.abs(Math.sin(a)) * 1.5, -5 - Math.cos(a) * 3.6]); }
    K.sheet(S, top, 40, { bone: B.back, tag: 'cloth', thick: .8, folds: 6, foldDepth: 1.4, flare: .16, rag: .3, seed: D.seed, boneOf: t => (t < .4 ? B.back : B.skirtB) }); }
  // B: a horned iron half-helm and trophy skulls on the belt; three war banners on poles from the back
  if (key === 'b') {
    S.add(SC(EL(h0([0, 80.6, .6]), [6.2, 4, 6.4])), o('darkmetal', B.head, { k: .4 })); S.add(SC(TO(h0([0, 78.8, .6]), 6.2, .7, [[1, 0, 0], [0, 1, 0], [0, 0, 1.05]])), o('trim', B.head));
    both(s => { let p = h0([s * 5.6, 81, .6]), d = norm([s, .5, -.2]); for (let i = 0; i < 6; i++) { const q = add(p, mul(d, 2.2)); S.add(SC(RC(p, q, 1.5 - i * .22, 1.3 - i * .22)), o('horn', B.head, { k: .25, root: h0([s * 5.6, 81, .6]), L: 13 })); p = q; d = norm(add(d, [s * -.1, .2, -.05])); } });
    for (const [x, z, a] of [[-9, 6, -.3], [8, 7, .3], [11, -2, .9]]) K.skull(S, [x, 37.6, z], { r: 2.4, jawOpen: .25, bone: B.root, jawBone: B.root });
    for (const [x, tilt, h] of [[-8, -.18, 34], [0, 0, 40], [8, .18, 34]]) { const base = [x, 56, -10.4], top = add(base, [x * .35 + tilt * 12, h, -4]);
      S.add(RC(base, top, 1.1, .9), o('wood', B.back, { k: .2 })); S.add(EL(top, [1.1, 1.1, 1.1]), o('metal', B.back, { k: .1 }));
      const flag = []; for (let i = 0; i <= 4; i++) flag.push(add(sub(top, [0, 3, 0]), [(i - 2) * 1.9, 0, -.6]));
      K.sheet(S, flag, 14, { bone: B.back, tag: 'banner', thick: .3, folds: 2, foldDepth: .5, flare: .05, rag: .45, seed: D.seed + x, out: [0, 0, -1] }); }
  }
  // C: a bone crown, a braided beard, teeth-and-bead necklaces
  if (key === 'c') {
    for (let i = 0; i < 9; i++) { const a = (i / 8 - .5) * 2.6, base = h0([Math.sin(a) * 5.4, 81.6, Math.cos(a) * 5.2 - .6]), l = i === 4 ? 9 : 4.5 + (1 - Math.abs(i - 4) / 4) * 3;
      S.add(SC(RC(base, add(base, [Math.sin(a) * 1.2, l, Math.cos(a) * .6]), .9, .12)), o('bone', B.head, { k: .2 })); }
    S.add(SC(TO(h0([0, 81.2, -.4]), 5.8, .9, [[1, 0, 0], [0, 1, 0], [0, 0, 1.05]])), o('bone', B.head, { k: .3 }));
    for (let r = 0; r < 2; r++) for (let i = 0; i < 15; i++) { const a = (i / 14 - .5) * 2.8, p = [Math.sin(a) * (10 + r * 1.6), 63 - Math.cos(a) * (6 + r * 3) + 3, 7.6 + Math.cos(a) * (3 + r)];
      S.add(i % 3 === 1 ? RC(p, add(p, [0, -2.2, .4]), .5, .1) : EL(p, [.75, .75, .75]), o(i % 3 === 1 ? 'tooth' : i % 3 ? 'gem' : 'bone', B.chest, { k: .1 })); }
  }
  return S;
}

// topknot (A, B), long grey braids and beard (C), the fur mantle
function addLocks(S, D) {
  return K.locks(S, D.seed * 13 + 5, (p, n, s) => {
    const q = p[1] > 66 ? unhd(p) : p;
    if (s.tag === 'fur' && n[1] > -.1) return { chance: .8, len: [5, 10], r: 1.6, flow: [0, -.8, -.6], up: .4, tag: 'fur', bone: s.bone };
    if (D.key === 'c' && s.bone === B.jaw && q[2] > 5) return { chance: .6, len: [5, 9], r: .85, flow: [0, -1, .3], up: .15, tag: 'beard', bone: B.jaw };
    if (D.key === 'c' && s.bone === B.head && s.tag === 'skin' && q[2] < -1 && q[1] < 78) return { len: [12, 20], r: 1, flow: [0, -1, -.5], up: .2, tag: 'hair', bone: B.hair };
    return null;
  });
}

// the weapon: a broad notched cleaver (A), serrated (B), a two-handed runic greataxe (C); held upright in the right fist
function weapon(D) {
  const S = new Sculpt(), key = D.key, dir = norm(D.key === 'c' ? [-.3, 1, .3] : [0, 1, .25]), at = t => add(GRIP, mul(dir, t)), fr = frameOf(dir), o = (tag, extra) => Object.assign({ tag, bone: B.weapon, k: .3 }, extra);
  const out = mul(fr[0], -1), up = dir, fwd = fr[2], P = (u, v) => add(add(at(0), mul(out, u)), mul(up, v));
  if (key !== 'c') {
    S.add(RC(at(-7), at(12), 1.2, 1.1), o('leather')); for (const t of [-6, -2, 2, 6, 10]) S.add(TO(at(t), 1.35, .3, fr), o('darkmetal'));
    S.add(EL(at(-7.8), [1.7, 1.7, 1.7]), o('metal')); S.add(BX(at(12.4), [3.4, .9, 1.6], [out, up, fwd], .3), o('darkmetal'));
    // the blade: broad, a squared hooked tip, a notch bitten out of the edge, a hole for the hand
    const W = 6.2, L = 30; S.add(BX(P(W * .45, 13 + L / 2), [W, L / 2, .5], [out, up, fwd], .25), o('metal', { k: .4, edgeRoot: P(-W * .55, 13), W }));
    S.add(BX(P(W * 1.25, 13 + L - 2.4), [2.2, 2.6, .5], [out, up, fwd], .25), o('metal', { k: .6 }));
    S.sub(EL(P(W * 1.4, 26), [1.6, 2.2, 2]), { k: .2 }); S.sub(EL(P(W * 1.4, 34), [1.1, 1.4, 2]), { k: .2 }); S.sub(EL(P(-.6, 37), [1.1, 1.1, 2]), { k: .2 });
    S.add(BX(P(-W * .5, 13 + L / 2), [.7, L / 2, .9], [out, up, fwd], .2), o('darkmetal', { k: .3 }));     // thick spine
    if (key === 'b') for (let i = 0; i < 9; i++) S.add(RC(P(-W * .5 - .4, 15 + i * 3.2), P(-W * .5 - 2.6, 16.4 + i * 3.2), .8, .1), o('metal', { k: .15 })); // serrated spine
    for (let i = 0; i < 4; i++) S.add(EL(P(-1.4, 16 + i * 6.4), [.55, .55, .6]), o('trim', { k: .1 }));
  } else {
    // a two-handed haft topped by a double crescent blade with a spike, runes glowing along both edges
    S.add(RC(at(-14), at(52), 1.1, 1), o('wood')); for (const t of [-14, -6, 2, 10]) S.add(TO(at(t), 1.3, .35, fr), o('leather'));
    S.add(RC(at(52), at(60), 1, .1), o('metal')); S.add(EL(at(46), [2, 3.6, 2], fr), o('metal'));
    both(s => { for (let i = 0; i <= 14; i++) { const v = -7 + i, w = 10 * Math.sqrt(Math.max(0, 1 - (v / 7.6) ** 2)); if (w < 1.2) continue; S.add(BX(add(at(46 + v), mul(out, s * (1.6 + w / 2))), [w / 2, .55, .32], [out, up, fwd], .1), o('metal', { k: .4 })); }
      for (let i = 0; i <= 14; i++) { const v = -7 + i, w = 10 * Math.sqrt(Math.max(0, 1 - (v / 7.6) ** 2)); if (w < 1.6) continue; S.add(EL(add(at(46 + v), mul(out, s * (1.8 + w))), [.4, .7, .36], [out, up, fwd]), o('glow', { k: .2 })); }
      for (let i = 0; i < 3; i++) S.add(EL(add(at(44 + i * 2), mul(out, s * 5)), [.5, .9, .4], [out, up, fwd]), o('glow', { k: .1 })); });
    for (let i = 0; i < 3; i++) S.add(RC(at(-4 + i * 3), add(at(-6 + i * 3), [.6 * (i - 1), -5, 1]), .25, .15), o('leather', { k: .1 }));
  }
  return S;
}

function details(D) {
  const S = new Sculpt();
  both(s => S.add(SC(EL(h0([s * 2.3, 77.8, 7.3]), [.85, .55, .55])), { bone: B.head, tag: 'eye', k: .1, c: hd(h0([s * 2.3, 77.8, 7.3])) }));
  // tusks rising from the underbite (longer and capped on the empowered warlord, chipped on the elder)
  both(s => { const l = D.key === 'b' ? 5.4 : D.key === 'c' ? 3.2 : 4.2, b0 = h0([s * 2.6, 72.6, 7.8]); S.add(SC(RC(b0, add(b0, [s * .9, l, .5]), .95, .2)), { bone: B.jaw, tag: 'tooth', k: .2, root: b0, L: l });
    if (D.key === 'b') S.add(SC(TO(add(b0, [s * .3, 1.2, .1]), .95, .25, null)), { bone: B.jaw, tag: 'trim', k: .1 }); });
  for (let i = 0; i < 4; i++) S.add(SC(EL(h0([(i - 1.5) * 1.1, 72.8, 8.2]), [.4, .55, .3])), { bone: B.jaw, tag: 'tooth', k: .05 });
  // A and B: a black topknot bound with a ring
  if (D.key !== 'c') { const b0 = h0([0, 82.2, -2]); S.add(SC(RC(b0, h0([0, 86, -3.6]), 1.5, 1.3)), { bone: B.head, tag: 'hair', k: .5, root: b0, L: 14 });
    let p = h0([0, 86, -3.6]); for (let i = 0; i < 6; i++) { const q = add(p, [Math.sin(i) * .3, -1.4, -1]); S.add(SC(RC(p, q, 1.3 - i * .12, 1.2 - i * .12)), { bone: B.hair, tag: 'hair', k: .4, root: b0, L: 14 }); p = q; }
    S.add(SC(TO(h0([0, 84.2, -2.8]), 1.6, .45, rotX(-.4))), { bone: B.head, tag: 'trim', k: .1 }); }
  if (D.key === 'c') both(s => { let p = h0([s * 1.6, 70.6, 8.4]); for (let i = 0; i < 8; i++) { const q = add(p, [s * .1, -1.5, .1]); S.add(SC(EL(q, [.9, .85, .85])), { bone: B.jaw, tag: i === 3 || i === 7 ? 'bone' : 'beard', k: .2, root: p, L: 1 }); p = q; } });
  return S;
}

// war paint, tattoos, scars, the cleaver's bright edge
const segDist = (p, a, b) => { const ab = sub(b, a), t = clamp(F.dot(sub(p, a), ab) / F.dot(ab, ab), 0, 1); return len(sub(p, add(a, mul(ab, t)))); };
const TATTOO = [[[-8, 62, 9], [-3, 55, 10.6]], [[8, 62, 9], [3, 55, 10.6]], [[-12, 58, 6], [-11, 50, 6]], [[12, 58, 6], [11, 50, 6]], [[-3, 55, 10.6], [3, 55, 10.6]]];
function custom(D) {
  return ({ p, n, s, tag, fine, big }) => {
    const hp = p[1] > 66 ? unhd(sub(p, DROP)) : p;
    if (tag === 'eye') { const q = mul(sub(p, s.c), 1 / HS), r0 = Math.hypot(q[0], q[1] * 1.6); return { c: mixc(mul(D.eye, .45), mixc(D.eye, [1, 1, .8], .6), clamp(1.1 - r0, 0, 1)), a: .05, sp: 1, gl: 1, ty: 0, st: 0 }; }
    if (tag === 'skin') {
      let c = mixc(D.colors.skin, D.colors.skinDark, clamp(.3 + (big - .5) * .9 - n[1] * .15, 0, 1)); c = mul(c, .9 + fine * .2);
      if (D.key === 'b' && ((hp[1] > 76 && hp[1] < 79 && Math.abs(hp[0]) < 5 && hp[2] > 4) || (Math.abs(p[0]) > 12 && p[1] > 52 && p[1] < 60 && Math.abs(Math.sin(p[1] * 1.3)) < .3))) c = mixc(c, [.5, .04, .03], .85); // red war paint
      if (D.key === 'c') { let dm = 9; for (const [a, b] of TATTOO) dm = Math.min(dm, segDist(p, a, b)); if (dm < .45 && p[1] < 66) return { c: D.colors.glow, a: .1, sp: .5, gl: .5, ty: 0, st: 0 }; }
      if (D.key === 'c' && segDist(hp, [2.6, 81, 6], [4.4, 74, 6.6]) < .5) c = [.55, .58, .45];
      return { c, sp: .35, gl: .5, ty: 3, st: .8 };
    }
    if (tag === 'metal' && s.edgeRoot) { const d = len(sub(p, s.edgeRoot)); return null; }
    if (tag === 'banner') { const c = D.colors.cloth, emblem = Math.hypot(p[0] - Math.round(p[0] / 8) * 8, p[1] - 88) < 2.6; return { c: emblem ? [.08, .07, .06] : mixc(mul(c, .55), c, clamp(big * 1.2, 0, 1)), sp: .1, gl: .25, ty: 6, st: .9 }; }
    if (tag === 'metal' || tag === 'darkmetal') { const rust = clamp((F.noise3(p[0] * .6, p[1] * .6, p[2] * .6, 4) - .55) * 3, 0, 1) * (D.key === 'b' ? .3 : .8);
      if (rust > .2) return { c: mixc(D.colors[tag], [.35, .18, .08], rust), sp: .3, gl: .4, ty: 8, st: .7 }; }
    return null;
  };
}

function build(variant, { lod = 0 } = {}) {
  const D = Object.assign({}, DESIGN[variant]), t0 = Date.now();
  const body = anatomy(D); body.build(4); const arm = armour(D); arm.build(3);
  const n = addLocks(arm, D) + addLocks(body, D); body.build(3); arm.build(3);
  const weap = weapon(D); weap.build(3); const fine = details(D); fine.build(2);
  const R = lod ? [1.2, 1.15, .9, .35] : [.52, .56, .4, .17];
  const { parts, log } = K.finish(D, [['body', body, R[0], 1.6], ['armour', arm, R[1], .8], ['weapon', weap, R[2], .5], ['detail', fine, R[3], .5]], custom(D));
  log.push('locks: ' + n + ', ' + (Date.now() - t0) + ' ms');
  return { parts, bones: BONES, clips: lod ? null : H.clips({ weight: 1, grip: -.1, banner: D.key === 'b', stance: 1 }), log, design: D };
}

module.exports = { build, DESIGN, BONES, B };
