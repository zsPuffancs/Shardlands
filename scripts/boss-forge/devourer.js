'use strict';
// The Devourer, World Boss of Gloomwood and the wildwood regions: a crocodile-headed, lion-maned, hippo-bodied
// devourer that has ruled the forest for centuries.
//   A ancient     olive scaled head, tawny mane, a broad collar of gold and lapis plates, a gold brow band
//   B overgrown   moss-green mane, a mossy back carrying saplings, mushrooms and flowers, roots binding the legs
//   C corrupted   black hide, a ridge of bone spikes, ribs bursting through the flank, green fire in eyes and throat
// Same skeleton layout as the Vârcolac (29 bones; the last one carries the back growths). Model units match the old
// primitive model (top ~60, facing +z, feet on y = 0).
const F = require('./forge');
const V = require('./varcolac');
const { roundCone: RC, ellipsoid: EL, torus: TO, box: BX, Sculpt, mesh, skinWeights, rng, fbm, noise3, clamp, lerp, norm, sub, add, mul, len } = F;
const { ao, smooth, mixc, rotZ, rotX, clips: baseClips } = V;

const BONES = [
  ['root', -1, [0, 27, -4]], ['hips', 0, [0, 27, -16]], ['chest', 0, [0, 30, 8]], ['neck', 2, [0, 31, 16]], ['head', 3, [0, 33, 23]], ['jaw', 4, [0, 30.6, 26]],
  ['earL', 4, [3.6, 36, 22]], ['earR', 4, [-3.6, 36, 22]],
  ['flShoulder', 2, [8.6, 29, 10]], ['flElbow', 8, [9, 17, 8]], ['flWrist', 9, [8.8, 7, 11]], ['flPaw', 10, [8.8, 3, 13]],
  ['frShoulder', 2, [-8.6, 29, 10]], ['frElbow', 12, [-9, 17, 8]], ['frWrist', 13, [-8.8, 7, 11]], ['frPaw', 14, [-8.8, 3, 13]],
  ['hlHip', 1, [8.2, 25, -16]], ['hlKnee', 16, [8.6, 13, -14]], ['hlHock', 17, [8.6, 5, -16]], ['hlPaw', 18, [8.6, 2.4, -15.5]],
  ['hrHip', 1, [-8.2, 25, -16]], ['hrKnee', 20, [-8.6, 13, -14]], ['hrHock', 21, [-8.6, 5, -16]], ['hrPaw', 22, [-8.6, 2.4, -15.5]],
  ['tail1', 1, [0, 27, -27]], ['tail2', 24, [0, 22.5, -33]], ['tail3', 25, [0, 17.5, -37]], ['tail4', 26, [0, 13.5, -39.5]],
  ['back', 0, [0, 38, -8]],
].map(([name, parent, pos]) => ({ name, parent, pos }));
const B = Object.fromEntries(BONES.map((b, i) => [b.name, i]));
const both = f => { f(1); f(-1); };

const DESIGN = [
  { key: 'a', name: 'ancient', seed: 101, mane: 1.15, maneLen: [5, 10],
    hide: [.44, .36, .33], hideDark: [.26, .2, .19], scale: [.3, .36, .2], scaleDark: [.14, .18, .1], belly: [.62, .55, .44], mane1: [.5, .34, .14], mane2: [.86, .66, .32], eye: [1, .76, .2], glow: [1, .76, .2], rim: [.12, .1, .05] },
  { key: 'b', name: 'overgrown', seed: 202, mane: 1.05, maneLen: [4, 8.5],
    hide: [.36, .33, .27], hideDark: [.21, .19, .15], scale: [.24, .3, .18], scaleDark: [.11, .15, .09], belly: [.5, .5, .4], mane1: [.16, .26, .1], mane2: [.42, .58, .2], eye: [.95, .9, .35], glow: [.9, 1, .5], rim: [.05, .1, .03] },
  { key: 'c', name: 'corrupted', seed: 303, mane: .5, maneLen: [4, 9],
    hide: [.09, .085, .09], hideDark: [.035, .03, .035], scale: [.1, .1, .1], scaleDark: [.03, .03, .035], belly: [.2, .18, .17], mane1: [.04, .04, .045], mane2: [.2, .26, .2], eye: [.5, 1, .3], glow: [.45, 1, .3], rim: [.04, .14, .03] },
];

// ---------------- anatomy ----------------
function anatomy(D) {
  const S = new Sculpt(), A = (shape, o) => S.add(shape, o), Sb = (shape, o) => S.sub(shape, o), c = D.key === 'c';
  // hippo hindquarters and a deep, sagging barrel
  A(EL([0, 27, -12], [12.2, 11, 13.5]), { bone: B.root, tag: 'hide', k: 3 });
  A(EL([0, 28, -20], [10.6, 10.2, 8.4]), { bone: B.hips, tag: 'hide', k: 3 });
  A(EL([0, 20.5, -5], [10, 6.4, 12]), { bone: B.root, tag: 'belly', k: 3 });
  // lion forequarters
  A(EL([0, 29.5, 7], [10.6, 11, 11]), { bone: B.chest, tag: 'fore', flow: [0, -.3, -1], k: 3 });
  A(EL([0, 35.5, 5], [7.4, 5, 8.6]), { bone: B.chest, tag: 'fore', flow: [0, .1, -1], k: 3 });
  both(s => A(EL([s * 8, 30, 9.5], [4.8, 8, 7]), { bone: s > 0 ? B.flShoulder : B.frShoulder, tag: 'fore', flow: [0, -1, -.3], k: 2 }));
  // hippo hide folds where the barrel meets the haunch, and wrinkles over the knees
  both(s => { Sb(RC([s * 11.6, 33, -4], [s * 11.2, 18, -6], .55, .5), { k: .5 }); Sb(RC([s * 11.8, 32, -7.5], [s * 11.4, 19, -9], .45, .4), { k: .45 });
    Sb(EL([s * 11.4, 23, -17], [1.6, 4, 2.2]), { k: 1.2 }); });
  if (c) { // ribs bursting through the left flank, the hide torn open around them
    Sb(EL([9.6, 27, -4], [3.6, 6.4, 7]), { k: 1.2 });
    for (let i = 0; i < 5; i++) A(RC([7.4, 33 - i * .3, 1 - i * 2.6], [10.8, 22 - i * .2, -.4 - i * 2.8], .62, .48), { bone: B.root, tag: 'bone', k: .35 });
  }
  // neck and the crocodile head
  A(RC([0, 29, 11], [0, 32, 20], 8.2, 6.4), { bone: B.neck, tag: 'fore', flow: [0, .1, -1], k: 2.6 });
  A(EL([0, 33.2, 23.6], [6.4, 4.8, 6.6]), { bone: B.head, tag: 'scale', k: 1.6 });
  both(s => A(EL([s * 3.3, 36.6, 24.6], [2.1, 1.7, 2.4]), { bone: B.head, tag: 'scale', k: .8 }));               // raised eye turrets
  both(s => A(EL([s * 5.4, 32, 22.6], [1.8, 3, 4.2]), { bone: B.head, tag: 'scale', k: 1 }));                     // jaw muscles
  for (const [z, rx, ry, rz, y] of [[30.6, 5.1, 3, 5.2, 32.9], [35.8, 4.3, 2.6, 5.2, 32.5], [40.6, 3.6, 2.2, 4, 32.2]]) A(EL([0, y, z], [rx, ry, rz]), { bone: B.head, tag: 'snout', k: 1.2 });
  A(EL([0, 33.3, 44.3], [2.6, 1.8, 2]), { bone: B.head, tag: 'snout', k: .8 });                                     // nose knob
  both(s => Sb(EL([s * .9, 34.6, 44.8], [.5, .42, .5]), { k: .2 }));
  for (let i = 0; i < 9; i++) for (const s of [-1, 1]) { const z = 27 + i * 2, x = s * (2.2 - i * .1); A(EL([x, 34.3 - i * .18 + (i < 3 ? 1.1 : 0), z], [.8, .5, .8]), { bone: B.head, tag: 'scute', k: .3 }); } // osteoderms on the snout
  // lower jaw, open in the bind pose
  const J = p => { const o = [0, 30.6, 26], q = sub(p, o), a = .2; return add(o, [q[0], q[1] * Math.cos(a) - q[2] * Math.sin(a), q[1] * Math.sin(a) + q[2] * Math.cos(a)]); };
  for (const [z, rx, ry, rz, y] of [[30.6, 4.8, 2.2, 5.4, 29.8], [36, 4, 2, 5.2, 29.7], [41, 3.2, 1.8, 4, 29.8]]) A(EL(J([0, y, z]), [rx, ry, rz]), { bone: B.jaw, tag: 'jaw', k: 1 });
  Sb(BX([0, 31.3, 36], [3.6, .55, 9.6]), { k: .35 });                                                                 // the mouth line
  // tail
  const tp = [[0, 27, -27], [0, 23.5, -31.5], [0, 20, -34.5], [0, 17, -36.5], [0, 15, -37.5]], tr = [4.4, 3.4, 2.4, 1.5, .6];
  for (let i = 0; i < 4; i++) A(RC(tp[i], tp[i + 1], tr[i], tr[i + 1]), { bone: B.tail1 + i, tag: 'hide', k: 1.6 });
  // lion forelegs: heavy, with broad paws
  both(s => { const b = s > 0 ? 0 : 4, f = p => [s * p[0], p[1], p[2]];
    A(RC(f([8.6, 29, 10]), f([9, 17, 8]), 5, 3.8), { bone: B.flShoulder + b, tag: 'fore', flow: [0, -1, -.2], k: 2 });
    A(EL(f([9, 22, 8.2]), [4, 6, 4.2]), { bone: B.flShoulder + b, tag: 'fore', flow: [0, -1, -.2], k: 1.5 });
    A(RC(f([9, 17, 8]), f([8.8, 7, 11]), 3.6, 2.9), { bone: B.flElbow + b, tag: 'foreleg', flow: [0, -1, 0], k: 1.3 });
    A(RC(f([8.8, 7, 11]), f([8.8, 3, 13]), 2.9, 3), { bone: B.flWrist + b, tag: 'foreleg', flow: [0, -1, .2], k: 1 });
    A(EL(f([8.8, 2.6, 14]), [3.8, 2.6, 4.6]), { bone: B.flPaw + b, tag: 'paw', k: .9 });
    for (const [dx, dz] of [[-2.6, 17.2], [-.9, 18.4], [.9, 18.4], [2.6, 17.2]]) A(EL(f([8.8 + dx, 1.6, dz]), [1.25, 1.35, 1.6]), { bone: B.flPaw + b, tag: 'paw', k: .5 }); });
  // hippo hind legs: pillars with flat, four-nailed feet
  both(s => { const b = s > 0 ? 0 : 4, f = p => [s * p[0], p[1], p[2]];
    A(RC(f([8.2, 25, -16]), f([8.6, 13, -14]), 6.6, 5), { bone: B.hlHip + b, tag: 'hide', k: 2.2 });
    A(RC(f([8.6, 13, -14]), f([8.6, 5, -16]), 5, 4.5), { bone: B.hlKnee + b, tag: 'hide', k: 1.6 });
    A(EL(f([8.6, 2.4, -15.4]), [4.8, 2.4, 5.2]), { bone: B.hlPaw + b, tag: 'hide', k: 1.2 });
    both(t => Sb(RC(f([8.6 + t * 2.2, 12.5, -10]), f([8.6 + t * 4.4, 12, -14]), .4, .4), { k: .35 })); });
  // the back: bone spikes (corrupted) or a mossy mat (overgrown)
  if (c) [[0, 41, 6], [0, 40.2, 1], [0, 39, -4], [0, 38.5, -9], [0, 38.2, -14], [0, 37, -19], [0, 34, -24]].forEach((q, i) => { const L = [12, 16, 18, 16, 14, 11, 8][i];
    for (const s of [-1, 0, 1]) { const base = [s * 2.6, q[1] - 1 - Math.abs(s) * .8, q[2]], tip = add(base, [s * L * .32, L * (s ? .7 : 1), -L * .3]); A(RC(base, tip, s ? .9 : 1.3, .07), { bone: i < 2 ? B.chest : i < 5 ? B.root : B.hips, tag: 'spike', k: .4, root: base, L }); } });
  if (D.key === 'b') A(EL([0, 37.2, -10], [9.6, 2.8, 13]), { bone: B.back, tag: 'moss', k: 2.6 });
  return S;
}

// the lion's mane and hide tufts, placed on a coarse sample of the anatomy
function addMane(S, D) {
  const R = rng(D.seed * 7919 + 1), m = mesh(S, 1.05); let n = 0;
  m.pos.forEach((p, i) => {
    const nn = m.normals[i], near = S.near(p, 3); if (!near.length) return; const s = near[0].s;
    let chance = 0, L = [1, 2], r = .7, up = .25, region = 'body';
    if ((s.tag === 'fore' && (s.bone === B.neck || p[1] > 30 && p[2] > 2)) || (s.tag === 'scale' && p[2] < 21.5)) { chance = .9 * D.mane; L = D.maneLen; r = 1.5; up = .3; region = 'mane'; }
    else if (s.tag === 'fore' || s.tag === 'foreleg') { chance = p[1] > 8 ? .2 : 0; L = [1.4, 2.4]; r = .75; }
    else if (s.tag === 'tail' && p[2] < -38) { chance = .9; L = [3, 6]; r = 1; region = 'tail'; }
    if (D.key === 'a' && p[1] > 18 && p[1] < 34 && p[2] > 12 && Math.abs(p[0]) < 13) chance = 0; // the collar sits on bare neck fur
    if (!chance || R() > chance) return;
    const len0 = lerp(L[0], L[1], R()), flow = s.flow || [0, -.3, -1], jit = [R() - .5, R() - .5, R() - .5];
    const d = norm(add(add(mul(nn, up), mul(norm(flow), 1 - up * .5)), mul(jit, .45))), droop = region === 'mane' ? .3 : .16, root = add(p, mul(nn, -.6));
    const p1 = add(add(root, mul(d, len0 * .38)), [0, -len0 * droop * .15, 0]), p2 = add(add(p1, mul(d, len0 * .34)), [0, -len0 * droop * .45, 0]), p3 = add(add(p2, mul(d, len0 * .28)), [0, -len0 * droop * .75, 0]);
    const rr = r * lerp(.8, 1.25, R()), o = { bone: s.bone, tag: 'tuft', region, k: .45, root, L: len0, base: s.tag };
    S.add(RC(root, p1, rr, rr * .78), o); S.add(RC(p1, p2, rr * .78, rr * .5), Object.assign({}, o, { k: .3 })); S.add(RC(p2, p3, rr * .5, .14), Object.assign({}, o, { k: .2, tip: 1 })); n++;
  });
  return n;
}

// fine parts: teeth, claws, toenails, eyes
function details(D) {
  const S = new Sculpt(), J = p => { const o = [0, 30.6, 26], q = sub(p, o), a = .2; return add(o, [q[0], q[1] * Math.cos(a) - q[2] * Math.sin(a), q[1] * Math.sin(a) + q[2] * Math.cos(a)]); };
  const tooth = (a, dir, l, r, bone) => { const m = add(a, mul(dir, l * .55)), e = add(a, mul(dir, l)); S.add(RC(a, m, r, r * .62), { bone, tag: 'tooth', k: .08, root: a, L: l }); S.add(RC(m, e, r * .62, .04), { bone, tag: 'tooth', k: .06, root: a, L: l, tip: 1 }); };
  both(s => {
    // a crocodile's interlocking rows: upper teeth hang outside the lower jaw, lower teeth rise outside the upper
    for (let i = 0; i < 12; i++) { const z = 28.4 + i * 1.42, x = s * (4.1 - i * .085 - (i > 8 ? (i - 8) * .2 : 0)), big = i === 3 || i === 9 ? 1.5 : 1;
      tooth([x, 31.1, z], norm([s * .18, -1, .1]), (1.5 + (i % 3) * .3) * big * (D.key === 'c' ? 1.25 : 1), .34 * big, B.head);
      if (i < 10) tooth(J([x * .93, 30.3, z + .7]), norm([s * .2, 1, .05]), (1.3 + (i % 2) * .35) * (i === 2 || i === 7 ? 1.4 : 1), .3, B.jaw); }
    for (const [x, z, k] of [[3.3, 26.4, 1]]) S.add(EL([s * x, 36.9, z], [1.15, .8, 1.05], rotZ(s * .25)), { bone: B.head, tag: 'eye', k: .1, c: [s * x, 36.9, z], side: s });
    // claws on the lion paws, nails on the hippo feet
    const fb = s > 0 ? B.flPaw : B.frPaw, hb = s > 0 ? B.hlPaw : B.hrPaw;
    for (const [dx, dz] of [[-2.6, 17.2], [-.9, 18.4], [.9, 18.4], [2.6, 17.2]]) { const a = [s * (8.8 + dx), 2, dz + 1.2], l = D.key === 'c' ? 4.4 : 3.6, m = add(a, [0, .2, l * .55]), e = add(m, [0, -1.9, l * .45]); S.add(RC(a, m, .62, .46), { bone: fb, tag: 'claw', k: .1, root: a, L: l }); S.add(RC(m, e, .46, .05), { bone: fb, tag: 'claw', k: .08, root: a, L: l, tip: 1 }); }
    for (const dx of [-3, -1, 1, 3]) S.add(EL([s * (8.6 + dx), 1.3, -10.6], [1, .9, .8]), { bone: hb, tag: 'nail', k: .2 });
  });
  return S;
}

// collar and brow band (ancient), saplings, roots and fungi (overgrown), throat fire (corrupted): rigid accessories
function accessories(D) {
  const S = new Sculpt(), R = rng(D.seed * 31 + 7), o = (tag, bone, extra) => Object.assign({ tag, bone, k: .25 }, extra);
  if (D.key === 'a') {
    // a broad pectoral collar (wesekh) of alternating gold and lapis plates draped over the chest
    const cc = [0, 34, 16.6];
    for (let row = 0; row < 4; row++) { const rad = 5.4 + row * 2.1, count = 7 + row * 2;
      for (let i = 0; i < count; i++) { const a = -Math.PI / 2 + (i / (count - 1) - .5) * 2.3, x = Math.cos(a) * rad, y = cc[1] + Math.sin(a) * rad, z = cc[2] + 2.2 - Math.abs(x) * .14 - row * .1;
        S.add(BX([x, y, z], [.78 + row * .1, .95, .35], mulR(rotZ(-(a + Math.PI / 2)), rotX(.25)), .22), o((i + row) % 2 ? 'gold' : 'lapis', B.chest)); } }
    S.add(TO([cc[0], cc[1], cc[2] + 1], 13.6, .5, [[1, 0, 0], [0, 0, 1], [0, 1, 0]]), o('gold', B.chest));
    S.sub(BX([0, cc[1] + 8, cc[2]], [16, 8, 4]), { k: .2 });                                                          // keep only the lower arc of the rim
    S.add(TO([0, 33.9, 23.4], 6.1, .5, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]), o('gold', B.head));                    // brow band
    S.add(EL([0, 38.3, 21.6], [1.2, 1.2, .5]), o('lapis', B.head)); S.add(TO([0, 38.3, 21.6], 1.3, .3, [[1, 0, 0], [0, 0, 1], [0, 1, 0]]), o('gold', B.head));
  } else if (D.key === 'b') {
    // saplings with leaf crowns, shelf fungi and flowers on the mossy back
    for (const [x, z, h] of [[-4.8, -13, 12], [5.4, -6, 9], [1, -18.5, 8], [-1.5, -1, 6]]) {
      const base = [x, 38, z], top = add(base, [x * .08, h, (R() - .5) * 2]); S.add(RC(base, top, .8, .35), o('wood', B.back));
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, c = add(top, [Math.cos(a) * h * .22, (R() - .2) * h * .2, Math.sin(a) * h * .22]); S.add(EL(c, [h * .2, h * .13, h * .2]), o('leaf', B.back, { k: .9 })); }
    }
    for (let k = 0; k < 14; k++) { const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 8, c = [Math.cos(a) * r, 39.6 + R() * .4, -10 + Math.sin(a) * r * 1.3]; S.add(EL(c, [.55, .4, .55]), o('flower', B.back, { k: .1, hue: k % 3 })); }
    for (const [x, y, z] of [[11.4, 26, -14], [11, 23, -10], [-11.6, 25, -12]]) S.add(EL([x, y, z], [1.4, .45, 1.8], rotZ(Math.sign(x) * -.3)), o('fungus', B.root, { k: .3 }));
    // roots spiralling down the legs into the ground
    for (const [lx, lz, b] of [[8.8, 11, B.flWrist], [-8.8, 11, B.frWrist], [8.6, -15, B.hlKnee], [-8.6, -15, B.hrKnee]]) { let prev = null;
      for (let t = 0; t <= 14; t++) { const a = t * .7, y = 14 - t * .95, rad = (Math.abs(lz) > 12 ? 5.2 : 3.8) + .3 * Math.sin(t), p = [lx + Math.cos(a) * rad, y, lz + Math.sin(a) * rad]; if (prev) S.add(RC(prev, p, .55, .5), o('root', y > 6 ? b : b + 1 + (Math.abs(lz) > 12 ? 1 : 0), { k: .3 })); prev = p; } }
  } else {
    // sickly green fire in the throat and the torn flank
    S.add(EL([0, 30.8, 30], [3, .7, 5]), o('fire', B.head, { k: .5 })); S.add(EL([9.2, 27, -4], [1.4, 4.6, 5]), o('fire', B.root, { k: .8 }));
  }
  return S;
}
const mulR = (A, Bm) => A.map(r => [0, 1, 2].map(c => r[0] * Bm[0][c] + r[1] * Bm[1][c] + r[2] * Bm[2][c]));

// ---------------- surface ----------------
const T = { FUR_BACK: 1, FUR_DOWN: 2, SKIN: 3, HORN: 4, STONE: 5, CLOTH: 6, SCALE: 7, METAL: 8 };
function paint(D, S, m, evalAll) {
  const colors = [], mat = [], detail = [];
  for (let i = 0; i < m.pos.length; i++) {
    const p = m.pos[i], n = m.normals[i], near = S.near(p, 2.5), s = near.length ? near[0].s : { tag: 'hide' }, tag = s.tag;
    const big = fbm(p, .07, 3, D.seed), fine = noise3(p[0] * 1.6, p[1] * 1.6, p[2] * 1.6, D.seed + 3), dorsal = smooth(-.2, .9, n[1]);
    let c = D.hide, a = 1, sp = .25, gl = .4, ty = T.SKIN, st = .9;
    if (tag === 'hide' || tag === 'belly' || tag === 'bone' && false) { c = mixc(D.hide, D.hideDark, clamp(dorsal * .7 + (big - .5), 0, 1)); c = mixc(c, D.belly, smooth(.2, .9, -n[1]) * .6); c = mul(c, .88 + fine * .24); sp = .35; gl = .45; }
    if (tag === 'fore' || tag === 'foreleg' || tag === 'paw') { c = mixc(D.mane1, D.mane2, clamp(.35 - dorsal * .3 + (big - .5) * .8, 0, 1)); c = mixc(c, D.belly, smooth(.3, .9, -n[1]) * .3); ty = tag === 'fore' ? T.FUR_BACK : T.FUR_DOWN; sp = .1; gl = .18; st = .8; if (tag === 'paw') c = mul(c, .7); }
    if (tag === 'tuft') { const t = clamp(len(sub(p, s.root)) / s.L, 0, 1); c = mixc(mul(D.mane1, .75), D.mane2, Math.pow(t, 1.3) * (s.region === 'mane' ? .9 : .5)); c = mul(c, .9 + fine * .2); ty = s.base === 'foreleg' ? T.FUR_DOWN : T.FUR_BACK; sp = .1; gl = .18; st = 1; }
    if (tag === 'scale' || tag === 'snout' || tag === 'scute' || tag === 'jaw') {
      c = mixc(D.scale, D.scaleDark, clamp(dorsal * .6 + (big - .5) * .7, 0, 1)); if (tag === 'jaw' || n[1] < -.3) c = mixc(c, D.belly, .55); if (tag === 'scute') c = mul(c, .7);
      ty = T.SCALE; st = 1; sp = .35; gl = .5;
    }
    // mouth interior between the jaws
    if (Math.abs(p[0]) < 3.6 && p[2] > 27.5 && p[2] < 45 && p[1] > 29.8 && p[1] < 32.2 && Math.abs(n[0]) < .85 && evalAll(add(p, mul(n, 1.1))) < .5) { c = D.key === 'c' ? [.12, .3, .1] : [.42, .16, .16]; sp = .6; gl = .7; ty = T.SKIN; st = .3; if (D.key === 'c') a = .4; }
    if (tag === 'bone' || tag === 'spike') { const t = s.root ? clamp(len(sub(p, s.root)) / s.L, 0, 1) : .5; c = mixc([.55, .5, .42], [.86, .82, .72], t); sp = .4; gl = .5; ty = T.HORN; st = .6; }
    if (tag === 'moss') { c = mixc([.16, .26, .08], [.34, .46, .16], clamp(big + fine * .3 - .2, 0, 1)); ty = T.FUR_BACK; st = 1; sp = .05; gl = .1; }
    if (tag === 'tooth') { const t = clamp(len(sub(p, s.root)) / s.L, 0, 1); c = mixc(D.key === 'c' ? [.4, .38, .3] : [.66, .6, .46], [.92, .9, .8], t); sp = .55; gl = .65; ty = T.HORN; st = .3; }
    if (tag === 'claw') { const t = clamp(len(sub(p, s.root)) / s.L, 0, 1); c = mixc([.06, .05, .05], D.key === 'c' ? [.35, .55, .3] : [.5, .46, .4], Math.pow(t, 1.5)); sp = .6; gl = .75; ty = T.HORN; st = .6; }
    if (tag === 'nail') { c = [.2, .18, .16]; sp = .4; gl = .5; ty = T.HORN; st = .5; }
    if (tag === 'eye') { const q = sub(p, s.c), slit = Math.abs(q[2] - .1) < .14 && Math.abs(q[1]) < .6; c = slit ? mul(D.eye, .2) : mixc(mul(D.eye, .5), mixc(D.eye, [1, 1, .85], .5), clamp(1 - Math.hypot(q[1] * 1.3, q[2]) * .9, 0, 1)); a = slit ? .8 : .04; sp = 1; gl = 1; ty = 0; st = 0; }
    if (tag === 'gold') { c = mixc([.62, .44, .12], [.95, .78, .36], clamp(.4 + fine * .6, 0, 1)); sp = 1; gl = .82; ty = T.METAL; st = .5; }
    if (tag === 'lapis') { c = mixc([.08, .16, .5], [.2, .34, .78], fine); sp = .7; gl = .85; ty = T.STONE; st = .4; }
    if (tag === 'wood') { c = mixc([.22, .15, .08], [.34, .24, .13], fine); ty = T.HORN; st = .8; sp = .1; gl = .2; }
    if (tag === 'leaf') { c = mixc([.14, .3, .08], [.36, .56, .16], clamp(fine + (p[1] - 44) * .03, 0, 1)); ty = T.CLOTH; st = .6; sp = .15; gl = .3; }
    if (tag === 'flower') { c = [[.95, .55, .7], [.98, .92, .55], [.85, .8, .98]][s.hue]; sp = .2; gl = .4; ty = 0; st = 0; }
    if (tag === 'fungus') { c = mixc([.55, .36, .18], [.86, .7, .48], smooth(-.2, .6, n[1])); sp = .2; gl = .3; ty = T.SKIN; st = .5; }
    if (tag === 'root') { c = mixc([.2, .13, .07], [.32, .22, .12], fine); ty = T.HORN; st = 1; sp = .1; gl = .2; }
    if (tag === 'fire') { c = D.glow; a = .1; }
    const occ = ao(evalAll, p, n);
    c = a > .99 ? mul(c, lerp(.32, 1, occ)) : mul(c, lerp(.85, 1, occ));
    colors.push([c[0], c[1], c[2], a]); mat.push([sp, gl]); detail.push([ty / 8, st]);
  }
  return { colors, mat, detail };
}

function clips(D) {
  // the Vârcolac's quadruped clips, heavier: the back bone sways the growths a little instead of turning an eclipse
  return baseClips(Object.assign({ hunch: 0 }, D, { eclipseRot: (ph, E) => E(Math.sin(ph) * .02, 0, Math.sin(ph * 2) * .025) }));
}

function build(variant, { lod = 0 } = {}) {
  const D = Object.assign({}, DESIGN[variant]), t0 = Date.now(), log = [];
  const body = anatomy(D); body.build(4); const tufts = addMane(body, D); body.build(3.5);
  const fine = details(D); fine.build(2); const acc = accessories(D); acc.build(3);
  const evalAll = p => Math.min(body.eval(p), fine.eval(p), acc.eval(p));
  const H = lod ? [1.1, .32, .7] : [.5, .15, .3];
  const parts = [['body', body, H[0]], ['detail', fine, H[1]], ['accessories', acc, H[2]]].map(([name, S, h]) => {
    const m = mesh(S, h, { clipY: -.05 }); if (!m.pos.length) return null;
    const { J, W } = skinWeights(S, m.pos, name === 'body' ? 2.2 : 1), pnt = paint(D, S, m, evalAll);
    log.push(name + ': ' + m.pos.length + ' verts, ' + m.tris.length / 3 + ' tris'); return Object.assign({ name }, m, pnt, { J, W });
  }).filter(Boolean);
  log.push('mane tufts: ' + tufts + ', ' + (Date.now() - t0) + ' ms');
  return { parts, bones: BONES, clips: lod ? null : clips(D), log, design: D };
}

module.exports = { build, DESIGN, BONES, B };
