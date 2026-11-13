'use strict';
// Oni Warlord, World Boss of the Ashen Barrens and the warfields: a towering demon general.
//   A traditional  red skin, a white mane, black-and-red lacquered lamellar armour laced in gold, an iron kanabo
//   B commander    blue skin, heavier armour with a throat guard, a crested kabuto with gold kuwagata and great horns,
//                  a war banner on his back
//   C feral        bare to the waist, cracked burning scars, a broken horn and a third horn, wild black hair, a rope
//                  belt over a torn hakama, a kanabo glowing at the studs
// Humanoid rig (humanoid.js). Model units match the old primitive model (top ~92, facing +z, feet on y = 0).
const F = require('./forge');
const H = require('./humanoid');
const { roundCone: RC, ellipsoid: EL, torus: TO, box: BX, Sculpt, mesh, skinWeights, rng, fbm, noise3, clamp, lerp, norm, sub, add, mul, len } = F;
const { ao, smooth, mixc, rotZ, rotX } = require('./varcolac');
const { B } = H;

const POS = {
  root: [0, 40, 0], spine: [0, 49, .5], chest: [0, 59, .5], neck: [0, 69, 1], head: [0, 74.5, 1.5], jaw: [0, 72.6, 3.6],
  clavL: [4, 67, 0], uarmL: [13, 65, 0], farmL: [14.6, 50, 1.4], handL: [15.4, 37, 3.2],
  clavR: [-4, 67, 0], uarmR: [-13, 65, 0], farmR: [-14.6, 50, 1.4], handR: [-15.4, 37, 3.2], weapon: [-15.4, 35, 4],
  thighL: [6.4, 40, 0], shinL: [7, 22, 1.2], footL: [7, 4.2, 0], thighR: [-6.4, 40, 0], shinR: [-7, 22, 1.2], footR: [-7, 4.2, 0],
  skirtF: [0, 41, 6], skirtB: [0, 41, -6], skirtL: [8, 41, 0], skirtR: [-8, 41, 0], back: [0, 62, -6], hair: [0, 79, -2],
};
// the head is sculpted at human scale and enlarged about the neck: a demon's head, half again as heavy
const HS = 1.22, PIV = [0, 70, 1.5], hd = p => [PIV[0] + (p[0] - PIV[0]) * HS, PIV[1] + (p[1] - PIV[1]) * HS, PIV[2] + (p[2] - PIV[2]) * HS];
const unhd = p => [PIV[0] + (p[0] - PIV[0]) / HS, PIV[1] + (p[1] - PIV[1]) / HS, PIV[2] + (p[2] - PIV[2]) / HS];
const SC = shape => F.scaled(shape, PIV, HS);
for (const k of ['head', 'jaw', 'hair']) POS[k] = hd(POS[k]);
const BONES = H.bonesFrom(POS);
const both = f => { f(1); f(-1); };
const mulR = (A, Bm) => A.map(r => [0, 1, 2].map(c => r[0] * Bm[0][c] + r[1] * Bm[1][c] + r[2] * Bm[2][c]));
const rotY = a => [[Math.cos(a), 0, -Math.sin(a)], [0, 1, 0], [Math.sin(a), 0, Math.cos(a)]];

const DESIGN = [
  { key: 'a', name: 'traditional', seed: 401, skin: [.66, .16, .11], skinDark: [.36, .07, .06], lacquer: [.55, .06, .06], plate: [.07, .06, .07], lace: [.86, .66, .24], hair: [.92, .9, .85], eye: [1, .8, .2], horn: [.88, .82, .66], rim: [.12, .05, .03], fx: [1, .55, .2] },
  { key: 'b', name: 'commander', seed: 402, skin: [.2, .32, .62], skinDark: [.08, .13, .3], lacquer: [.1, .1, .14], plate: [.72, .54, .16], lace: [.62, .1, .1], hair: [.08, .08, .1], eye: [1, .9, .45], horn: [.9, .86, .74], rim: [.05, .07, .14], fx: [.7, .85, 1] },
  { key: 'c', name: 'feral', seed: 403, skin: [.42, .07, .05], skinDark: [.18, .03, .025], lacquer: [.2, .12, .08], plate: [.14, .1, .07], lace: [.75, .62, .4], hair: [.06, .05, .05], eye: [1, .55, .1], horn: [.8, .74, .6], rim: [.18, .05, .01], fx: [1, .45, .1] },
];

// ---------------- the demon's body ----------------
function anatomy(D) {
  const S = new Sculpt(), A = (shape, o) => S.add(shape, o), Sb = (shape, o) => S.sub(shape, o), m = D.key === 'c' ? 1.22 : 1.12;
  // torso
  A(EL([0, 41.5, 0], [9.2, 6.4, 6.4]), { bone: B.root, tag: 'skin', k: 2.5 });
  A(EL([0, 49, 1.2], [8.4, 7, 6]), { bone: B.spine, tag: 'skin', k: 2.5 });
  A(EL([0, 59, .6], [11.8 * m, 8.4, 7.2]), { bone: B.chest, tag: 'skin', k: 2.6 });
  both(s => A(EL([s * 5.2, 60.5, 4.8], [5.6 * m, 4.4, 3.2]), { bone: B.chest, tag: 'skin', k: 1.4 }));              // pectorals
  both(s => A(EL([s * 8.6, 55, -1], [4.2 * m, 7.4, 5.2]), { bone: B.chest, tag: 'skin', k: 1.8 }));                 // lats
  A(EL([0, 66.5, -1], [7.6 * m, 3.8, 4.4]), { bone: B.chest, tag: 'skin', k: 2 });                                   // trapezius
  for (let r = 0; r < 3; r++) both(s => A(EL([s * 2.1, 53.5 - r * 3.4, 6.2 - r * .3], [2, 1.6, 1.1]), { bone: B.spine, tag: 'skin', k: .7 })); // abdominals
  Sb(RC([0, 64.5, 7], [0, 46, 7.4], .38, .3), { k: .6 });                                                             // the line down the torso
  // neck, skull and the oni face
  A(RC([0, 66, 0], hd([0, 72.5, 1.5]), 4.6, 3.9 * HS), { bone: B.neck, tag: 'skin', k: 1.6 });
  A(SC(EL([0, 77.4, 1.4], [5.3, 5.8, 5.8])), { bone: B.head, tag: 'skin', k: 1.4 });
  A(SC(EL([0, 79.2, 5.6], [4.9, 1.6, 2])), { bone: B.head, tag: 'brow', k: .8 });                                        // heavy brow
  both(s => A(SC(EL([s * 2.6, 78.8, 6.4], [2.2, 1.2, 1.4], rotZ(-s * .45))), { bone: B.head, tag: 'brow', k: .6 }));       // scowl knots
  both(s => A(SC(EL([s * 3.5, 75.4, 5.6], [1.8, 1.5, 1.6])), { bone: B.head, tag: 'skin', k: .8 }));                     // cheekbones
  A(SC(EL([0, 76.2, 7.7], [1.8, 1.7, 1.6])), { bone: B.head, tag: 'skin', k: .7 }); both(s => A(SC(EL([s * 1.4, 75.4, 7.6], [1, .9, 1])), { bone: B.head, tag: 'skin', k: .5 })); // broad nose
  both(s => Sb(SC(EL([s * .85, 75.1, 8.5], [.42, .3, .4])), { k: .15 }));
  A(SC(EL([0, 73.6, 6.4], [3.9, 1.3, 1.6])), { bone: B.head, tag: 'lip', k: .6 });                                         // snarling upper lip
  A(SC(EL([0, 72.2, 4.6], [4.6, 2.3, 3.4])), { bone: B.jaw, tag: 'skin', k: 1.1 }); A(SC(EL([0, 71, 5.6], [2.6, 1.4, 1.8])), { bone: B.jaw, tag: 'skin', k: .8 }); // jaw, chin
  Sb(SC(EL([0, 72.9, 7.2], [3.3, .55, 1.6])), { k: .3 });                                                                   // the open, grinning mouth
  both(s => Sb(SC(EL([s * 2.3, 77.6, 6.6], [1.25, .8, 1], rotZ(s * .35))), { k: .3 }));                                   // eye sockets
  both(s => A(SC(EL([s * 5.4, 77.4, 1.2], [1.1, 2.6, 1.8], mulR(rotZ(s * -.5), rotY(s * .3)))), { bone: B.head, tag: 'skin', k: .5 })); // pointed ears
  // shoulders and arms
  both(s => { const L = s > 0 ? 'L' : 'R', f = p => [s * p[0], p[1], p[2]];
    A(EL(f([12.4, 65, 0]), [4.8 * m, 4.6, 5]), { bone: B['uarm' + L], tag: 'skin', k: 1.8 });
    A(RC(f([13, 64, 0]), f([14.6, 50, 1.4]), 4.4 * m, 3.4), { bone: B['uarm' + L], tag: 'skin', k: 1.5 });
    A(EL(f([13.8, 57, 2.4]), [3 * m, 4.6, 3]), { bone: B['uarm' + L], tag: 'skin', k: 1.2 });                       // biceps
    A(RC(f([14.6, 50, 1.4]), f([15.4, 38.4, 3.2]), 3.4, 2.5), { bone: B['farm' + L], tag: 'skin', k: 1.2 });
    A(EL(f([15, 45.5, 2.4]), [2.8 * m, 4, 2.6]), { bone: B['farm' + L], tag: 'skin', k: 1 });
    // hands: a fist on the weapon (right), an open clawed hand (left)
    A(EL(f([15.5, 34.6, 3.6]), [1.8, 2.8, 2.4]), { bone: B['hand' + L], tag: 'skin', k: .8 });
    for (let i = 0; i < 4; i++) { const z = 2.1 + i * 1.05, k0 = f([15.5 + s * .6, 32.4, z]);
      if (s < 0) { const k1 = f([15.5 - .9, 31.2, z + .2]), k2 = f([15.5 - 1.6, 32.6, z]); A(RC(k0, k1, .62, .55), { bone: B.handR, tag: 'skin', k: .3 }); A(RC(k1, k2, .55, .48), { bone: B.handR, tag: 'skin', k: .25 }); }
      else { const k1 = f([15.9, 29.6, z + .5]), k2 = f([15.9, 27.6, z + 1.3]); A(RC(k0, k1, .6, .52), { bone: B.handL, tag: 'skin', k: .3 }); A(RC(k1, k2, .52, .42), { bone: B.handL, tag: 'skin', k: .25 }); } }
    A(RC(f([15 - s * .2, 34, 5.4]), f([14.6, 32.4, 6.4]), .75, .6), { bone: B['hand' + L], tag: 'skin', k: .3 });     // thumb
  });
  // legs
  both(s => { const L = s > 0 ? 'L' : 'R', f = p => [s * p[0], p[1], p[2]];
    A(RC(f([6.4, 40, 0]), f([7, 22, 1.2]), 5.8 * m, 4), { bone: B['thigh' + L], tag: 'skin', k: 2 });
    A(EL(f([6.8, 31, 2.6]), [4.4 * m, 7, 3.6]), { bone: B['thigh' + L], tag: 'skin', k: 1.4 });
    A(RC(f([7, 22, 1.2]), f([7, 5, 0]), 3.9, 2.6), { bone: B['shin' + L], tag: 'skin', k: 1.4 });
    A(EL(f([7, 16, -1]), [3.2 * m, 5.6, 3]), { bone: B['shin' + L], tag: 'skin', k: 1.1 });
    A(EL(f([7, 2.2, 2.8]), [2.8, 2.2, 5.2]), { bone: B['foot' + L], tag: 'skin', k: 1 });
    for (let i = 0; i < 3; i++) A(EL(f([5.8 + i * 1.2, 1.5, 7.4]), [.75, .9, 1.2]), { bone: B['foot' + L], tag: 'skin', k: .4 });
  });
  // horns and hair
  const horn = (base, dir, length, r0, bend, bone, tag = 'horn', segs = 5) => { let p = base, d = norm(dir); for (let i = 0; i < segs; i++) { const l = length / segs, q = add(p, mul(d, l)); S.add(SC(RC(p, q, r0 * (1 - i / segs) + .12, r0 * (1 - (i + 1) / segs) + .08)), { bone, tag, k: .25, root: hd(base), L: length * HS }); p = q; d = norm(add(d, bend)); } };
  if (D.key === 'a') both(s => horn([s * 2.9, 81.2, 3.6], [s * .45, 1, .15], 13, 1.6, [s * .1, -.06, -.12], B.head));
  if (D.key === 'b') both(s => horn([s * 3.6, 80.4, 2.4], [s * 1, .55, .05], 22, 2.2, [0, .22, -.07], B.head));
  if (D.key === 'c') {
    horn([2.9, 81.2, 3.6], [.45, 1, .15], 13, 1.7, [.1, -.06, -.12], B.head);                                            // the whole horn
    horn([-2.9, 81.2, 3.6], [-.45, 1, .15], 5, 1.7, [0, 0, 0], B.head, 'horn', 2);                                       // broken off
    for (const [dx, dy, dz] of [[-.6, .3, .2], [.5, .1, -.3], [0, .5, .4]]) S.sub(SC(EL(add([-2.9, 81.2, 3.6], add(mul(norm([-.45, 1, .15]), 4.8), [dx, dy, dz])), [.9, .7, .8])), { k: .1 });
    horn([0, 82.4, 5], [0, 1, .5], 9, 1.2, [0, -.02, -.18], B.head);                                                       // the third horn
  }
  return S;
}

// locks of hair (mane and beard), placed on a coarse sample of the head
function addHair(S, D) {
  const R = rng(D.seed * 13 + 5), m = mesh(S, .9); let n = 0;
  m.pos.forEach((p, i) => {
    const nn = m.normals[i], near = S.near(p, 2); if (!near.length) return; const s = near[0].s; if (s.bone !== B.head && s.bone !== B.neck && s.bone !== B.jaw) return;
    let chance = 0, L = [6, 13], r = 1.15, flow = [0, -.6, -1], up = .25; const q = unhd(p);
    if (s.tag === 'skin' && s.bone === B.head && q[1] > 76 && q[2] < 4.5) chance = D.key === 'b' ? .05 : 1;                        // mane on the crown and back
    if (s.bone === B.neck && q[2] < 0) { chance = D.key === 'b' ? 0 : .9; L = [9, 16]; }
    if (s.bone === B.jaw && q[2] > 3 && nn[1] < .2) { chance = D.key === 'b' ? 0 : .8; L = [4, 9]; flow = [0, -1, .3]; r = .9; }    // beard
    if (!chance || R() > chance) return;
    const l = lerp(L[0], L[1], R()) * (D.key === 'c' ? 1.15 : 1), jit = [R() - .5, R() - .5, R() - .5], d = norm(add(add(mul(nn, up + (D.key === 'c' ? .25 : 0)), mul(norm(flow), .8)), mul(jit, .5)));
    const root = add(p, mul(nn, -.4)), p1 = add(add(root, mul(d, l * .38)), [0, -l * .06, 0]), p2 = add(add(p1, mul(d, l * .34)), [0, -l * .16, 0]), p3 = add(add(p2, mul(d, l * .28)), [0, -l * .26, 0]);
    const bone = s.bone === B.jaw ? B.jaw : q[1] > 74 ? B.hair : B.neck, o = { bone, tag: 'hairlock', k: .4, root, L: l };
    S.add(RC(root, p1, r, r * .75), o); S.add(RC(p1, p2, r * .75, r * .45), Object.assign({}, o, { k: .3 })); S.add(RC(p2, p3, r * .45, .1), Object.assign({}, o, { k: .2 })); n++;
  });
  return n;
}

// ---------------- armour and clothing ----------------
function armour(D) {
  const S = new Sculpt(), o = (tag, bone, extra) => Object.assign({ tag, bone, k: .3 }, extra), heavy = D.key === 'b';
  if (D.key !== 'c') {
    // dō: a cuirass of seven overlapping lacquered lames, a solid breastplate at the top
    // (the lames follow the torso's own width and depth at each height, and blend into one shell)
    const prof = y => { const t = clamp((y - 46) / 18, 0, 1); return [lerp(10.2, 13.8, Math.sin(t * Math.PI * .5)) + (heavy ? .5 : 0), lerp(7.6, 9.2, t)]; };
    for (let i = 0; i < 8; i++) { const y = 45.6 + i * 2.4, [w, d] = prof(y); S.add(EL([0, y, 1], [w, 1.55, d]), o('lame', i < 2 ? B.spine : B.chest, { row: i, k: .9 })); }
    S.add(EL([0, 64.6, 2], [10.6, 3, 8]), o('plate', B.chest, { k: 1.2 }));
    both(s => S.add(RC([s * 6, 66.5, -3.5], [s * 7.2, 64, 5.4], 1, 1), o('lace', B.chest)));                             // shoulder cords
    S.add(TO([0, 44.6, .8], 11, 1, [[1, 0, 0], [0, 1, 0], [0, 0, 1.36]]), o('belt', B.root));
    // kusazuri: four skirt panels of five lames each, flaring out
    const panel = (bone, cx, cz, yaw) => { for (let j = 0; j < 5; j++) { const y = 41.5 - j * 3.2, out = j * .45; S.add(BX([cx + Math.sin(yaw) * out, y, cz + Math.cos(yaw) * out], [heavy ? 5.6 : 5, 1.55, .55], mulR(rotX(-.16), rotY(yaw)), .3), o('lame', bone, { row: j })); } };
    panel(B.skirtF, 0, 8, 0); panel(B.skirtB, 0, -7.6, Math.PI); panel(B.skirtL, 10.2, .4, Math.PI / 2); panel(B.skirtR, -10.2, .4, -Math.PI / 2);
    // sode: big rectangular shoulder guards
    both(s => { const L = s > 0 ? 'L' : 'R'; for (let j = 0; j < (heavy ? 6 : 5); j++) S.add(BX([s * (17 + j * .25), 66 - j * 2.7, 0], [.55, 1.5, heavy ? 6.6 : 5.8], rotZ(s * .18), .3), o('lame', B['uarm' + L], { row: j })); });
    // kote and suneate: dark sleeves with plates, splinted shin guards
    both(s => { const L = s > 0 ? 'L' : 'R', f = p => [s * p[0], p[1], p[2]];
      S.add(RC(f([14.6, 49, 1.4]), f([15.4, 39, 3.2]), 3.7, 2.9), o('cloth', B['farm' + L]));
      for (let j = 0; j < 3; j++) S.add(BX(f([15.2, 47 - j * 3.2, 4.6]), [1.6, 1.3, .5], rotX(-.15), .25), o('plate', B['farm' + L]));
      S.add(RC(f([7, 21, 1.6]), f([7, 7, .6]), 4.3, 3.2), o('cloth', B['shin' + L]));
      for (let j = -2; j <= 2; j++) { const a = j * .38; S.add(BX(f([7 + Math.sin(a) * 4, 14, .9 + Math.cos(a) * 4]), [.8, 6.4, .45], rotY(s * a), .3), o('plate', B['shin' + L])); }
      S.add(EL(f([7, 22.6, 4.6]), [2.6, 2.2, 1.2]), o('plate', B['shin' + L]));                                               // knee cap
      S.add(RC(f([6.6, 38, .4]), f([7.2, 22, 1.6]), 7.4, 5.4), o('hakama', B['thigh' + L], { k: .8 }));                         // hakama under the armour
    });
    S.add(EL([0, 40.5, .4], [10.6, 5, 8]), o('hakama', B.root, { k: 1 }));
    if (heavy) {
      // nodowa throat guard, kabuto with neck guard and gold kuwagata crest, a war banner on the back
      S.add(EL([0, 68.6, 3.4], [5.6, 1.8, 3.6]), o('plate', B.chest));
      S.add(SC(EL([0, 81.4, 1.2], [6.6, 5, 6.8])), o('helm', B.head));
      for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; S.add(SC(RC([Math.cos(a) * 6.3, 79.6, 1.2 + Math.sin(a) * 6.5], [Math.cos(a) * 2, 86, 1.2 + Math.sin(a) * 2], .28, .2)), o('rivet', B.head)); }
      S.add(SC(TO([0, 86.2, 1.2], 1.4, .45, [[1, 0, 0], [0, 1, 0], [0, 0, 1]])), o('crest', B.head));
      for (let j = 0; j < 4; j++) S.add(SC(EL([0, 77.6 - j * 2.2, -1.2 - j * .5], [8.2 + j * 1.3, 1.1, 6.4 + j * 1], )), o('lame', B.head, { row: j }));
      S.sub(SC(BX([0, 73, 13], [13, 8, 10])), { k: .8 });                                                                           // open face
      both(s => S.add(SC(EL([s * 7.6, 77.8, 6.6], [2.2, 1.6, .6], rotY(-s * .5))), o('crest', B.head)));                          // fukigaeshi
      both(s => { let p = [s * 1.6, 82.4, 7.4], d = norm([s * .3, 1, .25]); for (let i = 0; i < 6; i++) { const q = add(p, mul(d, 2.7)); S.add(SC(RC(p, q, 1.25 - i * .14, 1.1 - i * .14)), o('crest', B.head, { k: .2 })); p = q; d = norm(add(d, [s * .2, -.03, -.05])); } });
      S.add(RC([0, 50, -9.4], [0, 108, -10.2], .45, .4), o('pole', B.back));                                                  // sashimono
      S.add(BX([0, 96, -10.2], [4.4, 10, .45], null, .15), o('banner', B.back));
      S.add(RC([-4.6, 106.4, -10.2], [4.6, 106.4, -10.2], .35, .35), o('pole', B.back));
    }
  } else {
    // feral: a torn hakama, a thick twisted rope belt, bound wrists
    both(s => { const L = s > 0 ? 'L' : 'R', f = p => [s * p[0], p[1], p[2]];
      S.add(RC(f([6.6, 41, .2]), f([7.6, 14, 1.6]), 7, 6), o('hakama', B['thigh' + L], { k: 1 }));
      for (let j = 0; j < 4; j++) S.sub(RC(f([7.6 + Math.cos(j) * 6, 26, 1.6 + Math.sin(j * 2) * 6]), f([7.6 + Math.cos(j) * 6.6, 14, 1.6 + Math.sin(j * 2) * 6.6]), .7, .7), { k: .5 }); // pleats
      for (let j = 0; j < 6; j++) S.sub(BX(f([7.6 + (j - 2.5) * 2.2, 13.2 + (j % 3), 2]), [1, 2.4, 8], rotZ(.3 * (j % 2 ? 1 : -1))), { k: .3 });          // torn hem
      for (let j = 0; j < 4; j++) S.add(TO(f([15.1, 40 + j * 1.3, 3]), 2.9, .38, mulR(rotX(-.15), rotZ(s * .1))), o('rope', B['farm' + L]));
    });
    S.add(EL([0, 42, .4], [10.2, 4.4, 7.6]), o('hakama', B.root, { k: 1 }));
    for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2, x = Math.cos(a) * 10.6, z = .6 + Math.sin(a) * 7.8; S.add(EL([x, 45 + Math.sin(i * 1.7) * .3, z], [1.3, 1.2, 1.3]), o('rope', B.root, { k: .5 })); }
    for (let i = 0; i < 3; i++) S.add(RC([1.5 + i * .5, 44.5, 8.6], [2 + i * 1.6, 36 - i * 2, 9.8], .7, .5), o('rope', B.skirtF));                     // knot ends
  }
  return S;
}

// the kanabo: an iron club, thickening to a studded head, held in the right fist pointing down and forward
function weapon(D) {
  const S = new Sculpt(), grip = [-15.4, 35, 4.2], dir = norm([0, -1, .4]), at = t => add(grip, mul(dir, t)), o = (tag, extra) => Object.assign({ tag, bone: B.weapon, k: .3 }, extra);
  const L = D.key === 'b' ? 36.5 : 35.5;
  S.add(RC(at(-8), at(4), 1.25, 1.35), o('grip'));                                                                   // wrapped grip
  S.add(TO(at(-8.6), 1.4, .45, frameOf(dir)), o('iron'));                                                              // pommel ring
  S.add(RC(at(4), at(L), 1.8, 3.6), o('iron', { k: .6 }));
  for (let side = 0; side < 8; side++) S.sub(BX(at(L * .6), [.2, L * .3, 9], mulR(frameOf(dir), rotY(side / 8 * Math.PI * 2)).map(r => r), 0), { k: .05 }); // faceted
  for (const t of [5, L - .4]) S.add(TO(at(t), t < 10 ? 2 : 3.7, .55, frameOf(dir)), o('band'));
  // studs on the head of the club
  const fr = frameOf(dir);
  for (let i = 0; i < 9; i++) for (let k = 0; k < 8; k++) { const t = 13 + i * (L - 15) / 8, a = k / 8 * Math.PI * 2 + (i % 2) * .4, rad = 1.8 + (3.6 - 1.8) * ((t - 4) / (L - 4));
    const radial = add(mul(fr[0], Math.cos(a)), mul(fr[2], Math.sin(a))), base = add(at(t), mul(radial, rad * .9)); S.add(RC(base, add(base, mul(radial, D.key === 'c' ? 1.7 : 1.4)), .55, .08), o('stud', { k: .1, root: base, L: 1.5 })); }
  return S;
}
// rows: two axes perpendicular to d and d itself (local y = d)
function frameOf(d) { const a = Math.abs(d[0]) < .9 ? [1, 0, 0] : [0, 0, 1], x = norm(F.cross(a, d)), z = F.cross(d, x); return [x, d, z]; }

// eyes and teeth (fine)
function details(D) {
  const S = new Sculpt();
  both(s => {
    S.add(SC(EL([s * 2.3, 77.6, 6.9], [1.05, .62, .7], rotZ(s * .35))), { bone: B.head, tag: 'eye', k: .1, c: hd([s * 2.3, 77.6, 6.9]) });
    // lower tusks rising past the lip, upper fangs
    const t0 = [s * 2.6, 72.7, 6.6], t1 = add(t0, [s * .3, 3.2, .6]); S.add(SC(RC(t0, t1, .62, .1)), { bone: B.jaw, tag: 'tooth', k: .1, root: hd(t0), L: 3.3 * HS });
    S.add(SC(RC([s * 1.5, 73.4, 7.6], [s * 1.4, 72.4, 7.9], .38, .05)), { bone: B.head, tag: 'tooth', k: .08, root: hd([s * 1.5, 73.4, 7.6]), L: HS });
    for (let i = 0; i < 3; i++) S.add(SC(EL([s * (.5 + i * .55), 73.25, 8 - i * .2], [.28, .38, .25])), { bone: B.head, tag: 'tooth', k: .05, root: hd([0, 73.6, 8]), L: HS });
    // claws on the open left hand
    if (s > 0) for (let i = 0; i < 4; i++) { const z = 2.1 + i * 1.05, a = [15.9, 27.6, z + 1.3]; S.add(RC(a, add(a, [0, -1.6, .6]), .38, .05), { bone: B.handL, tag: 'claw', k: .08, root: a, L: 1.7 }); }
  });
  return S;
}

// ---------------- surface ----------------
const T = { FUR_BACK: 1, FUR_DOWN: 2, SKIN: 3, HORN: 4, STONE: 5, CLOTH: 6, SCALE: 7, METAL: 8 };
// burning scars across the feral chest and arms: line segments in model space
const SCARS = [[[-7, 63, 6], [4, 52, 7.4]], [[3, 64, 7], [9, 56, 5.2]], [[-10, 58, 4.6], [-4, 49, 6.6]], [[13, 60, 3.6], [15, 52, 3.4]], [[-14.6, 47, 3.6], [-15.2, 41, 4.2]], [[-1, 81, 7], [-3.6, 76.5, 7.2]]];
const segDist = (p, a, b) => { const ab = sub(b, a), t = clamp(F.dot(sub(p, a), ab) / F.dot(ab, ab), 0, 1); return len(sub(p, add(a, mul(ab, t)))); };
function paint(D, S, m, evalAll) {
  const colors = [], mat = [], detail = [];
  for (let i = 0; i < m.pos.length; i++) {
    const p = m.pos[i], n = m.normals[i], near = S.near(p, 2.5), s = near.length ? near[0].s : { tag: 'skin' }, tag = s.tag;
    const big = fbm(p, .08, 3, D.seed), fine = noise3(p[0] * 1.8, p[1] * 1.8, p[2] * 1.8, D.seed + 3), hp = p[1] > 66 ? unhd(p) : p;
    let c = D.skin, a = 1, sp = .3, gl = .45, ty = T.SKIN, st = .7;
    if (tag === 'skin' || tag === 'brow' || tag === 'lip') {
      // skin: darker in the creases and on the back, flushed on the face and knuckles, faint veins
      c = mixc(D.skin, D.skinDark, clamp(.25 + (big - .5) * .8 - n[1] * .15 + (n[2] < -.3 ? .2 : 0), 0, 1)); c = mul(c, .9 + fine * .2);
      if (tag === 'lip') c = mul(c, .6); if (tag === 'brow') c = mul(c, .85);
    }
    if (D.key === 'c' && (tag === 'skin' || tag === 'brow')) { let dm = 9; for (const [a0, b0] of SCARS) dm = Math.min(dm, segDist(hp, a0, b0)); if (dm < .9) { c = mixc(D.fx, [1, .9, .5], clamp(1 - dm, 0, 1)); a = clamp(dm * .9, 0, 1) * .5; } else if (dm < 1.8) c = mixc(c, [.12, .02, .01], (1.8 - dm) * .8); }
    if (tag === 'hairlock') { const t = clamp(len(sub(p, s.root)) / s.L, 0, 1); c = mixc(mul(D.hair, .65), D.hair, Math.pow(t, .8)); c = mul(c, .88 + fine * .2); ty = T.FUR_DOWN; st = 1; sp = .2; gl = .35; }
    if (tag === 'horn') { const t = clamp(len(sub(p, s.root)) / s.L, 0, 1); c = mixc(mul(D.horn, .45), D.horn, Math.pow(t, .7)); if (t > .85) c = mixc(c, [.2, .16, .12], (t - .85) * 4); ty = T.HORN; st = .9; sp = .4; gl = .55; }
    if (tag === 'lame') { // lacquered lames, laced in vertical rows
      const lacing = Math.abs(Math.sin((p[0] + p[2] * .3) * 1.3)) < .16; c = lacing ? D.lace : (s.row % 2 ? D.lacquer : D.plate); if (!lacing) c = mul(c, .9 + fine * .15);
      sp = lacing ? .2 : .8; gl = lacing ? .3 : .85; ty = lacing ? T.CLOTH : 0; st = lacing ? .6 : 0;
    }
    if (tag === 'plate') { c = mixc(D.plate, mul(D.plate, .7), fine); sp = D.key === 'b' ? 1 : .8; gl = .8; ty = D.key === 'b' ? T.METAL : 0; st = .3; }
    if (tag === 'lace' || tag === 'belt') { c = mul(D.lace, .85 + fine * .2); sp = .2; gl = .35; ty = T.CLOTH; st = .8; }
    if (tag === 'cloth') { c = mixc([.08, .07, .07], [.16, .13, .12], fine); ty = T.CLOTH; st = .8; sp = .1; gl = .25; }
    if (tag === 'hakama') { c = D.key === 'c' ? mixc([.16, .13, .1], [.3, .25, .2], big) : D.key === 'b' ? mixc([.06, .07, .12], [.12, .13, .2], big) : mixc([.1, .08, .08], [.2, .17, .16], big); ty = T.CLOTH; st = 1; sp = .08; gl = .2; }
    if (tag === 'rope') { c = mixc([.5, .42, .28], [.74, .64, .46], fine); ty = T.CLOTH; st = 1; sp = .1; gl = .2; }
    if (tag === 'helm') { c = mixc([.06, .06, .08], [.14, .13, .16], fine); sp = 1; gl = .85; ty = T.METAL; st = .4; }
    if (tag === 'rivet' || tag === 'crest') { c = mixc([.6, .44, .12], [.96, .8, .36], clamp(.4 + fine * .6, 0, 1)); sp = 1; gl = .85; ty = T.METAL; st = .4; }
    if (tag === 'pole') { c = [.12, .08, .06]; ty = T.HORN; st = .5; sp = .3; gl = .5; }
    if (tag === 'banner') { const q = [p[0], p[1] - 96]; c = Math.hypot(q[0], q[1] - 2) < 2.4 ? [.95, .93, .88] : Math.hypot(q[0], q[1] - 2) < 3 ? [.1, .08, .08] : [.62, .08, .08]; ty = T.CLOTH; st = .7; sp = .1; gl = .25; }
    if (tag === 'grip') { const band = Math.sin(F.dot(p, [0, -1, .4]) * 3) > 0; c = band ? [.22, .12, .07] : [.12, .07, .05]; ty = T.CLOTH; st = .8; sp = .2; gl = .3; }
    if (tag === 'iron' || tag === 'band') { c = mixc([.09, .09, .1], [.22, .21, .22], clamp(fine + big * .3 - .1, 0, 1)); sp = .9; gl = .55; ty = T.METAL; st = 1; if (tag === 'band') { c = mul(c, 1.4); gl = .7; } }
    if (tag === 'stud') { const t = clamp(len(sub(p, s.root)) / s.L, 0, 1); c = mixc([.2, .2, .22], [.6, .6, .64], t); sp = 1; gl = .8; ty = T.METAL; st = .3; if (D.key === 'c') { c = mixc(c, D.fx, t * .9); a = 1 - t * .9; } }
    if (tag === 'eye') { const q = mul(sub(p, s.c), 1 / HS), r0 = Math.hypot(q[0] * .8, q[1] * 1.4); c = r0 < .22 ? mul(D.eye, .2) : mixc(mul(D.eye, .5), mixc(D.eye, [1, 1, .85], .55), clamp(1.1 - r0, 0, 1)); a = r0 < .22 ? .8 : .04; sp = 1; gl = 1; ty = 0; st = 0; }
    if (tag === 'tooth') { const t = clamp(len(sub(p, s.root)) / s.L, 0, 1); c = mixc([.66, .6, .46], [.94, .91, .82], t); sp = .55; gl = .65; ty = T.HORN; st = .3; }
    if (tag === 'claw') { c = [.1, .08, .08]; sp = .6; gl = .7; ty = T.HORN; st = .4; }
    // the mouth interior
    if (Math.abs(hp[0]) < 3.3 && hp[1] > 71.8 && hp[1] < 73.8 && hp[2] > 4.5 && Math.abs(n[0]) < .8 && evalAll(add(p, mul(n, 1))) < .4 && tag !== 'tooth') { c = D.key === 'c' ? [.5, .14, .04] : [.3, .05, .05]; sp = .5; gl = .7; ty = T.SKIN; st = .2; }
    const occ = ao(evalAll, p, n);
    c = a > .99 ? mul(c, lerp(.3, 1, occ)) : mul(c, lerp(.85, 1, occ));
    colors.push([c[0], c[1], c[2], a]); mat.push([sp, gl]); detail.push([ty / 8, st]);
  }
  return { colors, mat, detail };
}

function build(variant, { lod = 0 } = {}) {
  const D = Object.assign({}, DESIGN[variant]), t0 = Date.now(), log = [];
  const body = anatomy(D); body.build(4); const locks = addHair(body, D); body.build(3);
  const arm = armour(D); arm.build(3); const weap = weapon(D); weap.build(3); const fine = details(D); fine.build(2);
  const evalAll = p => Math.min(body.eval(p), arm.eval(p), weap.eval(p), fine.eval(p));
  const R = lod ? [1.2, 1.15, .9, .3] : [.5, .52, .44, .14];
  const parts = [['body', body, R[0]], ['armour', arm, R[1]], ['weapon', weap, R[2]], ['detail', fine, R[3]]].map(([name, S, h]) => {
    const m = mesh(S, h, { clipY: -.05 }); if (!m.pos.length) return null;
    for (const p of m.pos) if (p[1] < 0) p[1] = 0; // soles and the club's tip rest on the ground, never below it
    const { J, W } = skinWeights(S, m.pos, name === 'body' ? 1.6 : .8), pnt = paint(D, S, m, evalAll);
    log.push(name + ': ' + m.pos.length + ' verts, ' + m.tris.length / 3 + ' tris'); return Object.assign({ name }, m, pnt, { J, W });
  }).filter(Boolean);
  log.push('hair locks: ' + locks + ', ' + (Date.now() - t0) + ' ms');
  return { parts, bones: BONES, clips: lod ? null : H.clips({ weight: .8, grip: 0, banner: D.key === 'b', stance: 1 }), log, design: D };
}

module.exports = { build, DESIGN, BONES, B };
