'use strict';
// Vârcolac, the Meadows World Boss: a sculpted, rigged, animated wolf-demon in three manifestations.
//   A ancient   heavy and grizzled: a massive silver-tipped mane, grey muzzle, silver bands, a golden eclipse with rays
//   B moonborn  sleek and long-limbed: short pale coat, a flowing spectral mane, glowing crescent marks, a full moon
//   C feral     gaunt and hunched: black-red bristles, a spiked dorsal ridge, ribs, scars, a torn ear, four eyes,
//               tusk-like fangs and a cracked blood-red eclipse
// Model units match the old primitive model (shoulder ~42, top ~76, facing +z, feet on y = 0).
const F = require('./forge');
const { roundCone: RC, ellipsoid: EL, torus: TO, box: BX, Sculpt, mesh, skinWeights, rng, fbm, noise3, clamp, lerp, norm, sub, add, mul, dot, len, cross, qAxis, qMul, frame } = F;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rotX = a => [[1, 0, 0], [0, Math.cos(a), Math.sin(a)], [0, -Math.sin(a), Math.cos(a)]]; // rows: world -> local
const rotZ = a => [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
const mulR = (A, B) => A.map(r => [0, 1, 2].map(c => r[0] * B[0][c] + r[1] * B[1][c] + r[2] * B[2][c]));
const mirror = p => [-p[0], p[1], p[2]];

// ---------------- skeleton ----------------
const BONES = [
  ['root', -1, [0, 32, -4]], ['hips', 0, [0, 32, -15]], ['chest', 0, [0, 35, 8]], ['neck', 2, [0, 40, 17]], ['head', 3, [0, 45.5, 25]], ['jaw', 4, [0, 41.6, 28.2]],
  ['earL', 4, [3.7, 49.5, 24.4]], ['earR', 4, [-3.7, 49.5, 24.4]],
  ['flShoulder', 2, [7, 37, 11]], ['flElbow', 8, [7.6, 23.5, 8.5]], ['flWrist', 9, [7.1, 9, 12.4]], ['flPaw', 10, [7, 3, 14.6]],
  ['frShoulder', 2, [-7, 37, 11]], ['frElbow', 12, [-7.6, 23.5, 8.5]], ['frWrist', 13, [-7.1, 9, 12.4]], ['frPaw', 14, [-7, 3, 14.6]],
  ['hlHip', 1, [6.4, 31, -16]], ['hlKnee', 16, [7, 19.5, -10.5]], ['hlHock', 17, [7, 9.2, -20.2]], ['hlPaw', 18, [7.1, 3, -17.8]],
  ['hrHip', 1, [-6.4, 31, -16]], ['hrKnee', 20, [-7, 19.5, -10.5]], ['hrHock', 21, [-7, 9.2, -20.2]], ['hrPaw', 22, [-7.1, 3, -17.8]],
  ['tail1', 1, [0, 33, -23]], ['tail2', 24, [0, 29.5, -30]], ['tail3', 25, [0, 24, -35]], ['tail4', 26, [0, 18, -38.5]],
  ['eclipse', 2, [0, 63, -5]],
].map(([name, parent, pos]) => ({ name, parent, pos }));
const B = Object.fromEntries(BONES.map((b, i) => [b.name, i]));
const PIVOT = [0, 45.5, 25];
// the head transform of a variant: scaled about the skull and lowered / pulled back by the hunch
const headT = D => { const hs = D.head || 1, hy = -D.hunch * 5, hz = -D.hunch * 3; return p => [PIVOT[0] + (p[0] - PIVOT[0]) * hs, PIVOT[1] + (p[1] - PIVOT[1]) * hs + hy, PIVOT[2] + (p[2] - PIVOT[2]) * hs + hz]; };
const headInv = D => { const hs = D.head || 1, hy = -D.hunch * 5, hz = -D.hunch * 3; return p => [PIVOT[0] + (p[0] - PIVOT[0]) / hs, PIVOT[1] + (p[1] - hy - PIVOT[1]) / hs, PIVOT[2] + (p[2] - hz - PIVOT[2]) / hs]; };
const HEADBONES = new Set(['head', 'jaw', 'earL', 'earR']);
const bonesFor = D => { const H = headT(D); return BONES.map(b => Object.assign({}, b, { pos: HEADBONES.has(b.name) ? H(b.pos) : b.pos })); };
const ECLIPSE_TILT = -.42;

// ---------------- variant design ----------------
const DESIGN = [
  { key: 'a', name: 'ancient', seed: 11, head: 1.24, bulk: 1.08, legs: 1, gaunt: 0, hunch: 0, mane: 1.25, maneLen: [6, 12], bodyFur: 1, furLen: [1.8, 3.2], earLen: 7.6, fangs: 1, eyes: 2, spikes: 0,
    fur: { dark: [.085, .08, .078], mid: [.2, .185, .175], light: [.42, .4, .38], tip: [.9, .9, .92], muzzle: [.66, .64, .62] },
    eye: [1, .74, .22], mark: [.74, .76, .8], rim: [.12, .1, .05], glow: [1, .7, .22] },
  { key: 'b', name: 'moonborn', seed: 23, head: 1.16, bulk: .92, legs: 1.06, gaunt: 0, hunch: -.04, mane: .9, maneLen: [7, 15], bodyFur: .45, furLen: [1.2, 2], earLen: 9.6, fangs: .9, eyes: 2, spikes: 0,
    fur: { dark: [.42, .45, .52], mid: [.66, .69, .76], light: [.86, .88, .92], tip: [.93, .96, 1], muzzle: [.8, .82, .88] },
    eye: [.6, .86, 1], mark: [.55, .82, 1], rim: [.05, .1, .2], glow: [.6, .85, 1] },
  { key: 'c', name: 'feral', seed: 37, head: 1.26, bulk: .96, legs: 1.02, gaunt: 1, hunch: .1, mane: 1.05, maneLen: [5, 10], bodyFur: .8, furLen: [1.6, 3], earLen: 7.2, fangs: 1.5, eyes: 4, spikes: 1,
    fur: { dark: [.03, .024, .025], mid: [.065, .045, .045], light: [.15, .085, .075], tip: [.5, .1, .06], muzzle: [.1, .06, .055] },
    eye: [1, .14, .05], mark: [.5, .1, .08], rim: [.16, .02, .01], glow: [1, .12, .04] },
];

// ---------------- anatomy ----------------
function anatomy(D) {
  const S = new Sculpt(), k = D.bulk, g = D.gaunt, L = D.legs, hu = D.hunch;
  const A = (shape, o) => S.add(shape, o), Sb = (shape, o) => S.sub(shape, o);
  const hy = -hu * 5, hz = -hu * 3;                                                   // head height and reach (hunch)
  const both = f => { f(1); f(-1); };
  // torso
  A(EL([0, 33.5, 8], [10.4 * k, 11.4, 12.6]), { bone: B.chest, tag: 'body', flow: [0, -.25, -1], k: 2.5 });
  A(EL([0, 25.6, 11.4], [7 * k, 6.6, 7.4]), { bone: B.chest, tag: 'chest', flow: [0, -1, -.2], k: 2.5 });
  A(EL([0, 41 + hu * 2, 6.5], [6.2 * k, 4.4, 8.4]), { bone: B.chest, tag: 'withers', flow: [0, .1, -1], k: 2.5 });
  A(EL([0, 32.8, -4], [8.2 * k * (1 - g * .14), 8.4 * (1 - g * .1), 10.4]), { bone: B.root, tag: 'body', flow: [0, -.3, -1], k: 3 });
  A(EL([0, 33.2, -15.4], [7.6 * k, 7, 8.2]), { bone: B.hips, tag: 'body', flow: [0, -.3, -1], k: 2.6 });
  Sb(EL([0, 22.6, -5], [9, 4.2 + g * 1.4, 9.5]), { k: 3.2 });                              // tucked belly
  both(s => A(EL([s * 7, 37.5, 10.2], [4.8 * k, 7.8, 7]), { bone: s > 0 ? B.flShoulder : B.frShoulder, tag: 'body', flow: [0, -.4, -1], k: 2 }));
  both(s => A(EL([s * 5.7, 29.6, -16.2], [3.9 * k, 8.2, 7.2]), { bone: s > 0 ? B.hlHip : B.hrHip, tag: 'body', flow: [0, -.5, -1], k: 2 }));
  if (g) for (let i = 0; i < 6; i++) both(s => { const z = 9 - i * 3.2, y0 = 36 - i * .4; A(RC([s * (7.6 - i * .15), y0, z], [s * (8.6 - i * .2), y0 - 9 + i * .6, z - 1.4], .7, .5), { bone: i < 3 ? B.chest : B.root, tag: 'rib', flow: [0, -1, 0], k: 1.2 }); });
  // the mane's underlying mass: a heavy ruff around the neck and over the shoulders (the locks grow out of it)
  const mv = D.mane * (D.key === 'b' ? .55 : 1);
  if (mv > 0) { A(EL([0, 41, 14.5], [9.6 * mv + 1.5, 8.6 * mv + 1, 8.4]), { bone: B.neck, tag: 'neck', flow: [0, .1, -1], k: 3 }); A(EL([0, 32.5, 17], [7.6 * mv + 1, 8 * mv, 5.4]), { bone: B.chest, tag: 'chest', flow: [0, -1, -.1], k: 3 }); }
  // neck and head
  const H = headT(D);
  A(RC([0, 37, 12], H([0, 43, 22.6]), 8.4 * k, 5.6), { bone: B.neck, tag: 'neck', flow: [0, .2, -1], k: 2.6 });
  // skull: broad crown with heavy temporal muscle, a sharp stop under a scowling brow
  A(EL(H([0, 46.2, 25.2]), [5.8, 5.4, 6.4]), { bone: B.head, tag: 'head', flow: [0, .15, -1], k: 1.6 });
  both(s => A(EL(H([s * 3.5, 48, 24.6]), [2.7, 2.4, 4.1]), { bone: B.head, tag: 'head', flow: [0, .2, -1], k: 1.4 }));
  both(s => A(EL(H([s * 2.5, 48, 29.6]), [2.75, 1.4, 2.6], rotZ(-s * .42)), { bone: B.head, tag: 'brow', flow: [0, .2, -1], k: .9 }));
  Sb(RC(H([0, 48.9, 27.6]), H([0, 47.5, 31]), .38, .3), { k: .3 });                                    // frown furrow
  both(s => A(EL(H([s * 4.6, 44.4, 28]), [2.2, 2.6, 4]), { bone: B.head, tag: 'cheek', flow: [0, 0, -1], k: 1.2 }));
  both(s => A(EL(H([s * 4.2, 42.4, 26]), [2.6, 3, 3.4]), { bone: B.head, tag: 'cheek', flow: [0, -.2, -1], k: 1.2 }));
  // muzzle: tapering but blocky, canine roots bulging at the sides, a broad wet nose
  A(RC(H([0, 45.2, 30]), H([0, 44.3, 37]), 3.6, 2.55), { bone: B.head, tag: 'muzzle', flow: [0, .2, -1], k: 1.1 });
  A(EL(H([0, 46, 32.6]), [2.25, 1.5, 4]), { bone: B.head, tag: 'muzzle', flow: [0, .2, -1], k: 1 });
  A(EL(H([0, 43.5, 35]), [2.9, 2.2, 3.6]), { bone: B.head, tag: 'muzzle', flow: [0, -.4, -1], k: 1 });
  both(s => A(EL(H([s * 1.95, 43.2, 35.8]), [1.5, 1.7, 2.2]), { bone: B.head, tag: 'muzzle', flow: [0, -.5, 1], k: .7 }));
  both(s => A(RC(H([s * 1.95, 42.7, 31.4]), H([s * 1.5, 42.5, 37.3]), 1.5, 1.15), { bone: B.head, tag: 'lip', flow: [0, -1, 0], k: .6 }));
  A(EL(H([0, 44.65, 38.3]), [1.8, 1.3, 1.25]), { bone: B.head, tag: 'nose', k: .5 });
  both(s => Sb(EL(H([s * .72, 44.35, 39.35]), [.48, .34, .45]), { k: .2 }));
  Sb(RC(H([0, 44, 39.4]), H([0, 43.2, 38.9]), .16, .16), { k: .12 });                                // philtrum
  // the snarl: arched wrinkles over the bridge, the lip drawn up off the canines
  for (const z of [32.6, 33.9, 35.1]) { const a = H([-2.3, 45.1 - (z - 32.6) * .25, z]), m = H([0, 46.05 - (z - 32.6) * .3, z + .45]), b = H([2.3, 45.1 - (z - 32.6) * .25, z]); Sb(RC(a, m, .24, .24), { k: .22, tag: 'wrinkle' }); Sb(RC(m, b, .24, .24), { k: .22, tag: 'wrinkle' }); }
  both(s => Sb(EL(H([s * 2.05, 42.15, 36.1]), [.85, 1.05, 1.3]), { k: .4 }));
  // lower jaw, open in the bind pose; the mouth is cut between the jaws
  const jaw = (p) => { const o = H([0, 41.6, 28.2]), q = sub(p, o), a = .2; return add(o, [q[0], q[1] * Math.cos(a) - q[2] * Math.sin(a), q[1] * Math.sin(a) + q[2] * Math.cos(a)]); };
  A(RC(jaw(H([0, 41.1, 28.5])), jaw(H([0, 40.5, 36.4])), 2.3, 1.45), { bone: B.jaw, tag: 'jaw', flow: [0, -.3, -1], k: .7 });
  A(EL(jaw(H([0, 40, 35.2])), [1.55, 1.1, 1.6]), { bone: B.jaw, tag: 'jaw', flow: [0, -1, 0], k: .6 });
  both(s => A(RC(jaw(H([s * 1.5, 41.2, 29])), jaw(H([s * 1.1, 40.8, 36])), 1.1, .8), { bone: B.jaw, tag: 'lip', flow: [0, -1, 0], k: .5 }));
  Sb(RC(H([0, 41.6, 31]), H([0, 41.45, 38.8]), .75, .55), { k: .35 });
  both(s => Sb(RC(H([s * 1.6, 41.6, 30]), H([s * 1.9, 41.4, 36]), .45, .35), { k: .3 }));
  // eye sockets
  both(s => Sb(EL(H([s * 2.75, 46.55, 31.15]), [1.3, .85, 1.0], rotZ(s * .38)), { k: .35 }));
  if (D.eyes > 2) both(s => Sb(EL(H([s * 3.55, 47.6, 29.6]), [.7, .5, .6], rotZ(s * .45)), { k: .25 }));
  // ears
  both(s => {
    const torn = D.key === 'c' && s > 0, l = torn ? D.earLen * .62 : D.earLen, root = H([s * 3.6, 49, 24.4]), tip = add(root, [s * .22 * l, .95 * l, -.4 * l]);
    A(RC(root, tip, 2.4, .2), { bone: s > 0 ? B.earL : B.earR, tag: 'ear', flow: [0, 1, -.2], k: .9 });
    Sb(RC(add(root, [s * .15, 1, 1.25]), add(tip, [0, -.8, .55]), 1.45, .1), { k: .35 });
    if (torn) { Sb(EL(add(root, [s * .9, l * .9, -.6]), [1.6, 1.1, 2.6]), { k: .2 }); Sb(EL(add(root, [s * -.6, l * .55, -.7]), [.8, .7, 2.4]), { k: .15 }); }
  });
  // forelegs
  both(s => {
    const b = s > 0 ? 0 : 4, f = p => [s * p[0], p[1], p[2]];
    A(RC(f([7.2, 36, 11]), f([7.7, 23.5, 8.5]), 5 * k, 3.5), { bone: B.flShoulder + b, tag: 'leg', flow: [0, -1, -.3], k: 1.8 });
    A(EL(f([7.5, 30, 8.2]), [3.8 * k, 6.6, 4]), { bone: B.flShoulder + b, tag: 'leg', flow: [0, -1, -.3], k: 1.4 });
    A(RC(f([7.7, 23.5, 8.5]), f([7.1, 9 * L, 12.4]), 3.4, 2.1), { bone: B.flElbow + b, tag: 'leg', flow: [0, -1, 0], k: 1.2 });
    A(EL(f([7.5, 19, 9.6]), [3, 5.6, 2.9]), { bone: B.flElbow + b, tag: 'leg', flow: [0, -1, 0], k: 1.2 });
    A(RC(f([7.1, 9 * L, 12.4]), f([7, 3, 14.6]), 1.9, 2.1), { bone: B.flWrist + b, tag: 'lowleg', flow: [0, -1, .2], k: .9 });
    A(EL(f([7, 2.2, 15.6]), [2.9, 2.2, 3.6]), { bone: B.flPaw + b, tag: 'paw', flow: [0, -.3, 1], k: .8 });
    for (const [dx, dz, r] of [[-1.95, 17.5, 1], [-.66, 18.7, 1.12], [.66, 18.7, 1.12], [1.95, 17.5, 1]]) A(EL(f([7 + dx, 1.45, dz]), [r, 1.15, 1.35]), { bone: B.flPaw + b, tag: 'toe', flow: [0, 0, 1], k: .45 });
    A(EL(f([7, 1.1, 14.4]), [2.1, 1, 2.2]), { bone: B.flPaw + b, tag: 'pad', k: .4 });
  });
  // hind legs
  both(s => {
    const b = s > 0 ? 0 : 4, f = p => [s * p[0], p[1], p[2]];
    A(RC(f([6.4, 31, -16]), f([7, 19.5, -10.5]), 5.6 * k, 3.7), { bone: B.hlHip + b, tag: 'leg', flow: [0, -1, -.4], k: 2 });
    A(RC(f([7, 19.5, -10.5]), f([7, 9.2 * L, -20.2]), 3.4, 1.8), { bone: B.hlKnee + b, tag: 'leg', flow: [0, -1, -.2], k: 1.3 });
    A(EL(f([7, 15.5, -16.4]), [2.6, 5, 3]), { bone: B.hlKnee + b, tag: 'leg', flow: [0, -1, -.2], k: 1.2 });
    A(RC(f([7, 9.2 * L, -20.2]), f([7.1, 3, -17.8]), 1.7, 2), { bone: B.hlHock + b, tag: 'lowleg', flow: [0, -1, .2], k: .9 });
    A(EL(f([7.1, 2.1, -16.9]), [2.7, 2.1, 3.4]), { bone: B.hlPaw + b, tag: 'paw', flow: [0, -.3, 1], k: .8 });
    for (const [dx, dz, r] of [[-1.8, -15, .95], [-.6, -14, 1.05], [.6, -14, 1.05], [1.8, -15, .95]]) A(EL(f([7.1 + dx, 1.4, dz]), [r, 1.1, 1.3]), { bone: B.hlPaw + b, tag: 'toe', flow: [0, 0, 1], k: .45 });
  });
  // tail
  const tp = [[0, 33, -23], [0, 29.5, -30], [0, 24, -35], [0, 18, -38.5], [0, 13.5, -40.5]], tr = [3.4, 2.8, 2.2, 1.6, .8];
  for (let i = 0; i < 4; i++) A(RC(tp[i], tp[i + 1], tr[i], tr[i + 1]), { bone: B.tail1 + i, tag: 'tail', flow: norm(sub(tp[i + 1], tp[i])), k: 1.4 });
  // scars (feral)
  if (D.key === 'c') for (const [a, b] of [[[8.8, 38, 12], [9.6, 30, 4]], [[9.2, 36, 9.5], [10, 29.5, 2.5]], [[-8.6, 34, -2], [-9.2, 27, -8]], [[-2.6, 49.5, 28.5], [-4.4, 45, 31.6]]]) Sb(RC(H(a[0] > 2 || a[0] < -2 ? a : a), b, .38, .3), { k: .25, tag: 'scar' });
  return S;
}

// a coarse surface sample of the anatomy (for placing fur): points, normals and the anatomical shape under them
function surfaceSample(S, h) { const m = mesh(S, h); return m.pos.map((p, i) => { const near = S.near(p, 3); return { p, n: m.normals[i], s: near.length ? near[0].s : null }; }).filter(x => x.s); }

function addFur(S, D) {
  const R = rng(D.seed * 7919 + 1), samples = surfaceSample(S, 1.05), tufts = [];
  const HEADY = 40 - D.hunch * 5;
  for (const { p, n, s } of samples) {
    const tag = s.tag; if (['nose', 'lip', 'jaw', 'pad', 'toe', 'paw', 'rib', 'ear'].includes(tag)) continue;
    let chance = 0, lenR = D.furLen, r = .75, up = .25, region = 'body';
    // the mane: neck, withers, the top of the chest and shoulders, the back of the skull and the cheek ruff
    const maneW = (tag === 'neck' ? 1 : tag === 'withers' ? .95 : 0) + (tag === 'body' && s.bone === B.chest && p[1] > 34 ? .8 : 0) + (tag === 'chest' ? .7 : 0) + (tag === 'head' && p[2] < 25.5 ? .8 : 0) + (tag === 'cheek' && n[1] < .4 && p[2] < 28.5 ? .9 : 0);
    if (maneW > 0) { chance = Math.min(1, .85 * maneW * D.mane); lenR = D.maneLen; r = D.key === 'b' ? .9 : 1.55; up = D.key === 'c' ? .45 : .3; region = 'mane'; if (tag === 'cheek') { lenR = [3, 5.5]; r = .9; up = .2; } if (tag === 'chest') { lenR = [D.maneLen[0] * .7, D.maneLen[1] * .8]; up = .1; } }
    else if (tag === 'tail') { chance = .75; lenR = [4, 8.5]; r = 1.1; up = .25; region = 'tail'; }
    else if (tag === 'body' || tag === 'withers') { chance = .3 * D.bodyFur; if (p[1] > 37 && Math.abs(p[0]) < 4.5) { chance = .55; lenR = [D.furLen[1], D.furLen[1] * 1.8]; region = 'back'; } }
    else if (tag === 'leg') { chance = p[1] > 20 ? .2 * D.bodyFur : .06; lenR = [1.2, 2.2]; r = .7; }
    else if (tag === 'head' || tag === 'brow' || tag === 'cheek' || tag === 'muzzle') { chance = tag === 'muzzle' ? .05 : .12; lenR = [1, 1.8]; r = .6; up = .2; }
    if (n[1] < -.55 && region !== 'mane' && region !== 'tail') chance *= .25;      // belly
    if (R() > chance) continue;
    const L = lerp(lenR[0], lenR[1], R()), flow = s.flow || [0, -.3, -1], jit = [R() - .5, R() - .5, R() - .5];
    let d = norm(add(add(mul(n, up), mul(norm(flow), 1 - up * .5)), mul(jit, .45)));
    if (region === 'mane' && D.key === 'c') d = norm(add(d, [0, .25, 0]));         // feral bristles stand up
    const droop = (region === 'mane' ? .3 : region === 'tail' ? .22 : .16) * (D.key === 'c' ? .4 : 1), root = add(p, mul(n, -.6));
    const p1 = add(add(root, mul(d, L * .38)), [0, -L * droop * .15, 0]), p2 = add(add(p1, mul(d, L * .34)), [0, -L * droop * .45, 0]), p3 = add(add(p2, mul(d, L * .28)), [0, -L * droop * .75, 0]);
    const rr = r * lerp(.8, 1.25, R()), o = { bone: s.bone, tag: 'tuft', region, k: .45, root, L, base: s.tag };
    tufts.push(S.add(RC(root, p1, rr, rr * .78), o), S.add(RC(p1, p2, rr * .78, rr * .5), Object.assign({}, o, { k: .3 })), S.add(RC(p2, p3, rr * .5, .14), Object.assign({}, o, { k: .2, tip: 1 })));
  }
  // B: a flowing spectral mane of long tendrils off the neck and back
  if (D.key === 'b') for (let i = 0; i < 26; i++) {
    const t = i / 25, side = i % 2 ? 1 : -1, root = [side * lerp(3.8, 1.4, t), lerp(43, 41, t), lerp(19, -2, t)], L = lerp(11, 7, t) * lerp(.85, 1.15, R());
    const a = add(root, [side * 2.2, 2.6, -L * .45]), b = add(a, [side * 1.4, -1, -L * .55]);
    S.add(RC(root, a, 1, .55), { bone: t < .5 ? B.neck : B.chest, tag: 'tendril', k: .5, root, L }); S.add(RC(a, b, .55, .08), { bone: t < .5 ? B.neck : B.chest, tag: 'tendril', tip: 1, k: .3, root, L });
  }
  // C: a ridge of bone-like bristle spikes down the spine
  if (D.spikes) { const pts = [[0, 46.5, 20], [0, 46.2, 15], [0, 45.5, 10.5], [0, 44.5, 6], [0, 42.5, 1.5], [0, 40.6, -3], [0, 40, -8], [0, 40.4, -13], [0, 40, -18], [0, 38, -22]];
    pts.forEach((q, i) => { const L = [7, 10, 12, 11, 9, 8, 7, 7.5, 6, 4][i], d = norm([0, 1, -.55]), bone = i < 2 ? B.neck : i < 5 ? B.chest : i < 7 ? B.root : B.hips, base = [q[0], q[1] - 2.4 - D.hunch * 3, q[2]];
      for (const s of [-1, 0, 1]) { const off = [s * 1.2, s ? -1.4 : 0, s * -.8], l = s ? L * .55 : L; S.add(RC(add(base, off), add(add(base, off), add(mul(d, l), [s * l * .25, 0, 0])), s ? .8 : 1.15, .06), { bone, tag: 'spike', k: .45, root: add(base, off), L: l }); } }); }
  return tufts.length / 3;
}

// fine parts: teeth, claws, eyes (meshed at a finer resolution)
function details(D) {
  const S = new Sculpt(), H = headT(D), fg = D.fangs;
  const jaw = (p) => { const o = H([0, 41.6, 28.2]), q = sub(p, o), a = .2; return add(o, [q[0], q[1] * Math.cos(a) - q[2] * Math.sin(a), q[1] * Math.sin(a) + q[2] * Math.cos(a)]); };
  const tooth = (a, dir, l, r, bone, tag = 'tooth') => { const m = add(a, mul(dir, l * .55)), e = add(add(a, mul(dir, l)), [0, 0, l * .08]); S.add(RC(a, m, r, r * .6), { bone, tag, k: .08, root: a, L: l }); S.add(RC(m, e, r * .6, .03), { bone, tag, k: .06, root: a, L: l, tip: 1 }); };
  for (const s of [-1, 1]) {
    // upper: canine, two incisors, three premolars, a carnassial
    tooth(H([s * 1.75, 42.3, 36.2]), norm([s * .05, -1, .12]), 3.1 * fg, .6, B.head);
    for (const [x, z] of [[.42, 38.15], [.98, 37.85]]) tooth(H([s * x, 42.45, z]), [0, -1, .1], 1, .28, B.head);
    for (const [z, l] of [[34.8, 1.05], [33.6, 1.15], [32.4, 1.35], [31.2, 1.7]]) tooth(H([s * 1.98, 42.2, z]), [0, -1, 0], l, .35, B.head);
    // lower: canine, incisors, premolars
    tooth(jaw(H([s * 1.25, 40.75, 35.4])), norm([s * .06, 1, .08]), 2.3 * Math.sqrt(fg), .5, B.jaw);
    for (const x of [.35, .8]) tooth(jaw(H([s * x, 40.8, 36.5])), [0, 1, .1], .85, .24, B.jaw);
    for (const z of [33.9, 32.6, 31.3]) tooth(jaw(H([s * 1.5, 40.85, z])), [0, 1, 0], .95, .32, B.jaw);
    // eyes (slanted, glowing), a second pair on the feral form
    S.add(EL(H([s * 2.62, 46.4, 30.8]), [.98, .58, .8], rotZ(s * .38)), { bone: B.head, tag: 'eye', k: .1, c: H([s * 2.6, 46.45, 30.85]), side: s, rz: s * .38 });
    if (D.eyes > 2) S.add(EL(H([s * 3.45, 47.55, 29.4]), [.58, .38, .5], rotZ(s * .45)), { bone: B.head, tag: 'eye', k: .1, c: H([s * 3.45, 47.55, 29.4]), side: s, rz: s * .45 });
    // claws: long, curved, supernatural
    const cl = D.key === 'c' ? 1.35 : D.key === 'a' ? 1.1 : 1;
    for (const [fb, x0, toes] of [[0, 7, [[-1.95, 17.5], [-.66, 18.7], [.66, 18.7], [1.95, 17.5]]], [1, 7.1, [[-1.8, -15], [-.6, -14], [.6, -14], [1.8, -15]]]]) for (const [dx, dz] of toes) {
      const bone = fb ? (s > 0 ? B.hlPaw : B.hrPaw) : (s > 0 ? B.flPaw : B.frPaw), a = [s * (x0 + dx), 1.75, dz + 1], l = (fb ? 2.4 : 3.2) * cl;
      const m = add(a, [0, .1, l * .55]), e = add(m, [0, -1.55, l * .45]); S.add(RC(a, m, .55, .4), { bone, tag: 'claw', k: .1, root: a, L: l }); S.add(RC(m, e, .4, .05), { bone, tag: 'claw', k: .08, root: a, L: l, tip: 1 });
    }
  }
  return S;
}

// the eclipse behind the shoulders (rigid, on its own bone)
function eclipse(D) {
  const S = new Sculpt(), c = BONES[B.eclipse].pos, R = rng(D.seed * 131 + 5), ring = (rad, r) => TO(c, rad, r, [[1, 0, 0], [0, 0, 1], [0, 1, 0]]), o = { bone: B.eclipse, k: .35 };
  if (D.key === 'a') {
    S.add(EL(c, [11, 11, 1.3]), Object.assign({ tag: 'disc' }, o));
    S.add(ring(11.6, .95), Object.assign({ tag: 'corona' }, o));
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, l = i % 2 ? 4.5 : 9, d = [Math.cos(a), Math.sin(a), 0], a0 = add(c, mul(d, 11.8)), w = i % 2 ? .55 : .9; S.add(RC(a0, add(a0, mul(d, l)), w, .05), Object.assign({ tag: 'ray', root: a0, L: l }, o)); }
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; S.sub(BX(add(c, [Math.cos(a) * 9.6, Math.sin(a) * 9.6, 1.3]), [.25, 1.1, .5], rotZ(a)), { k: .12 }); }   // carved rim
    S.sub(TO(add(c, [0, 0, 1.25]), 7.2, .28, [[1, 0, 0], [0, 0, 1], [0, 1, 0]]), { k: .1 });
  } else if (D.key === 'b') {
    S.add(EL(c, [10.5, 10.5, 1.6]), Object.assign({ tag: 'moon' }, o));
    for (let i = 0; i < 14; i++) { const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * 8, cr = lerp(.7, 2.2, R()); for (const sz of [1, -1]) S.sub(EL(add(c, [Math.cos(a) * rr, Math.sin(a) * rr, sz * 1.75]), [cr, cr, .7]), { k: .4 }); }
    S.add(ring(13.6, .32), Object.assign({ tag: 'halo' }, o));
    for (let i = 0; i < 3; i++) { const a = Math.PI / 2 + (i - 1) * .9, q = add(c, [Math.cos(a) * 16.4, Math.sin(a) * 16.4, 0]); S.add(TO(q, 1.5, .32, [[1, 0, 0], [0, 0, 1], [0, 1, 0]]), Object.assign({ tag: 'halo' }, o)); S.sub(EL(add(q, [Math.cos(a) * .9, Math.sin(a) * .9, 0]), [1.45, 1.45, 1]), { k: .1 }); }
  } else {
    S.add(EL(c, [10.8, 10.8, 1.4]), Object.assign({ tag: 'disc' }, o));
    const cracks = [[[0, 0], [3.5, 4], [5, 9.8]], [[0, 0], [-4.2, 2.2], [-9.6, 3]], [[0, 0], [-1, -5], [2.5, -9.8]], [[3.5, 4], [7.8, 3.6]], [[-1, -5], [-6.4, -7]]];
    D.cracks = cracks.map(seg => seg.map(([x, y]) => [c[0] + x, c[1] + y]));
    for (const seg of D.cracks) for (let i = 0; i + 1 < seg.length; i++) for (const sz of [1, -1]) S.sub(RC([seg[i][0], seg[i][1], c[2] + sz * 1.4], [seg[i + 1][0], seg[i + 1][1], c[2] + sz * 1.4], .5, .5), { k: .15 });
    S.add(ring(11.9, 1), Object.assign({ tag: 'corona' }, o));
    for (const a of [.6, 2.2, 3.9, 5.3]) S.sub(EL(add(c, [Math.cos(a) * 11.9, Math.sin(a) * 11.9, 0]), [1.4, 1.4, 2], rotZ(a)), { k: .1 });       // broken corona
    for (let i = 0; i < 13; i++) { const a = i / 13 * Math.PI * 2 + R() * .3, l = lerp(3.5, 10, R()), d = [Math.cos(a), Math.sin(a), 0], a0 = add(c, mul(d, 12)), bend = [Math.cos(a + 1.4) * l * .25, Math.sin(a + 1.4) * l * .25, (R() - .5) * 2]; S.add(RC(a0, add(add(a0, mul(d, l)), bend), lerp(.6, 1, R()), .05), Object.assign({ tag: 'shard', root: a0, L: l }, o)); }
  }
  return S;
}

// ---------------- surface colour, material and detail ----------------
const T = { FUR_BACK: 1, FUR_DOWN: 2, SKIN: 3, HORN: 4, STONE: 5, CLOTH: 6, SCALE: 7 };
function ao(evalFn, p, n) { let o = 0, w = .5; for (const d of [.8, 2, 4, 7]) { o += w * Math.max(0, d - evalFn(add(p, mul(n, d)))) / d; w *= .55; } return clamp(1 - o * 1.25, 0, 1); }
function rcT(s, p) { return clamp(dot(sub(p, s.a), s.ba) / s.l2, 0, 1); }
function crescent(u, v, r, th) { const a = Math.hypot(u, v) < r, b = Math.hypot(u - r * .42, v + r * .1) < r * .86; return a && !b ? 1 : 0; }

function paint(D, part, S, m, evalAll) {
  const fur = D.fur, colors = [], mat = [], detail = [];
  for (let i = 0; i < m.pos.length; i++) {
    const p = m.pos[i], n = m.normals[i], near = S.near(p, 2.5), s = near.length ? near[0].s : { tag: 'body' }, tag = s.tag;
    let c = fur.mid, a = 1, sp = .1, gl = .18, ty = T.FUR_BACK, st = .85; const hp = headInv(D)(p);
    const big = fbm(p, .06, 3, D.seed), streak = fbm([p[0] * 1.6, p[1] * 1.6, p[2] * .35], .35, 3, D.seed + 9), fine = noise3(p[0] * 1.7, p[1] * 1.7, p[2] * 1.7, D.seed + 3);
    // base coat: dark back, lighter flanks and belly, broken up by patches and strands
    const dorsal = smooth(-.1, .85, n[1]) * smooth(30, 42, p[1]), ventral = smooth(.1, .8, -n[1]) + smooth(26, 18, p[1]) * .5;
    c = mixc(fur.mid, fur.dark, clamp(dorsal * .9 + (big - .5) * .45, 0, 1)); c = mixc(c, fur.light, clamp(ventral * .55 + (D.key === 'b' ? .25 : 0), 0, 1));
    c = mul(c, .82 + streak * .36 + (fine - .5) * .12);
    if (tag === 'tuft' || tag === 'tendril') { const t = s.root ? clamp(len(sub(p, s.root)) / s.L, 0, 1) : 0; c = mixc(mul(c, .8), fur.tip, Math.pow(t, D.key === 'a' ? 1.4 : 2.2) * (s.region === 'mane' || tag === 'tendril' ? .95 : .55)); ty = s.base === 'leg' || s.base === 'lowleg' ? T.FUR_DOWN : T.FUR_BACK; st = 1;
      if (tag === 'tendril') { a = 1 - t * .85; c = mixc(fur.light, D.glow, t); } }
    if (tag === 'leg' || tag === 'lowleg' || tag === 'paw' || tag === 'toe') { ty = T.FUR_DOWN; c = mixc(c, fur.dark, tag === 'leg' ? .15 : .45); }
    if (tag === 'tail') { const t = rcT(s, p); c = mixc(c, fur.dark, .3 + t * .4); }
    if (['head', 'brow', 'cheek', 'muzzle', 'ear', 'jaw', 'lip'].includes(tag)) {
      // face: lighter muzzle and brows, a dark saddle over the skull, grizzle on the ancient one
      const muz = smooth(30, 36, hp[2]), brows = tag === 'brow' ? .7 : 0;
      c = mixc(c, fur.muzzle, clamp(muz * (D.key === 'c' ? .35 : .75) + brows * .5, 0, 1));
      if (D.key === 'a') c = mixc(c, [.72, .72, .72], clamp((fine - .35) * 1.6, 0, .55) * muz);
      if (tag === 'ear') { const inner = n[2] > .3 ? 1 : 0; c = inner ? mixc([.32, .18, .17], fur.dark, D.key === 'c' ? .5 : .1) : mixc(c, fur.dark, .5); ty = T.SKIN; st = .5; }
      if (tag === 'brow') st = 1;
    }
    if (tag === 'lip' || tag === 'jaw' && n[1] > .55) { c = mixc([.05, .035, .04], c, tag === 'lip' ? .15 : .5); sp = .4; gl = .6; ty = T.SKIN; st = .5; }
    if (tag === 'nose') { c = [.035, .03, .032]; sp = .8; gl = .92; ty = T.SKIN; st = .9; }
    if (tag === 'pad') { c = [.05, .04, .04]; sp = .3; gl = .5; ty = T.SKIN; st = .8; }
    if (tag === 'rib') { c = mixc(c, fur.dark, .2); }
    // mouth interior and gums around the cut mouth line
    const ml = Math.abs(hp[0]) < 2.4 && hp[2] > 29.5 && hp[2] < 39 && Math.abs(hp[1] - 41.4) < 1.5 && Math.abs(n[0]) < .8 && evalAll(add(p, mul(n, 1.1))) < .5;
    if (ml) { c = D.key === 'c' ? [.35, .04, .04] : [.28, .07, .08]; sp = .55; gl = .75; ty = T.SKIN; st = .3; }
    // markings
    if (D.key === 'a' && (tag === 'body' || tag === 'leg' || tag === 'tuft' && s.region !== 'mane') && Math.abs(n[0]) > .35) {
      // three silver chevrons sweeping back from the shoulder, and a pale blaze down the foreleg
      for (const [z0, w] of [[12, 1.1], [5, .95], [-2, .8]]) { const u = p[2] - z0 + (p[1] - 34) * .55, v = Math.abs(u) - w * (1 + (streak - .5) * .6); if (v < 0 && p[1] > 27 && p[1] < 41) c = mixc(c, D.mark, .8 * smooth(0, -.45, v)); }
      if (tag === 'leg' && s.bone >= B.flShoulder && s.bone <= B.frWrist && n[2] > .3) c = mixc(c, D.mark, .45);
    }
    if (D.key === 'b') {
      const H = 41.5 - D.hunch * 5; let g = 0;
      if (n[2] > .1 && n[1] > .2 && Math.abs(hp[2] - 30) < 3.5) g = crescent(hp[0], hp[1] - 49.1, 1.5);                       // brow crescent
      for (const sx of [1, -1]) if (sx * n[0] > .5) { g = Math.max(g, crescent(p[2] - 9.5, p[1] - 37, 3.1)); for (let k = 0; k < 4; k++) if (Math.hypot(p[2] - (1 - k * 4.2), p[1] - (36.5 - k * .5)) < .9 - k * .1) g = 1; }
      if (g && (tag === 'body' || tag === 'head' || tag === 'brow' || tag === 'muzzle' || tag === 'tuft')) { c = D.mark; a = .25; }
    }
    if (D.key === 'c') {
      if (tag === 'rib') c = mixc([.16, .07, .065], c, .4);
      if (p[2] > 33 && p[1] < 42 && (tag === 'muzzle' || tag === 'lip' || tag === 'jaw' || tag === 'tuft' && s.base === 'muzzle')) c = mixc(c, [.24, .02, .02], clamp(.3 + big, 0, .85));
      for (const sc of (S.scars || (S.scars = S.shapes.filter(x => x.tag === 'scar' && x.op === 'sub')))) { const d = F.dist(sc, p); if (d < .55) { c = mixc([.55, .22, .2], [.75, .1, .08], d); ty = T.SKIN; st = .7; } }
    }
    // fine parts
    if (tag === 'tooth') { const t = s.root ? clamp(len(sub(p, s.root)) / s.L, 0, 1) : .5; c = mixc(D.key === 'a' ? [.62, .55, .4] : D.key === 'c' ? [.5, .4, .3] : [.78, .76, .7], D.key === 'b' ? [.95, .96, .98] : [.9, .86, .74], t); if (D.key === 'c' && t > .5) c = mixc(c, [.5, .1, .08], .3); sp = .6; gl = .7; ty = T.HORN; st = .25; }
    if (tag === 'claw') { const t = s.root ? clamp(len(sub(p, s.root)) / s.L, 0, 1) : .5; c = mixc([.05, .045, .05], D.key === 'b' ? [.75, .8, .86] : D.key === 'c' ? [.3, .05, .04] : [.45, .42, .38], Math.pow(t, 1.6)); sp = .65; gl = .78; ty = T.HORN; st = .6; }
    if (tag === 'eye') {
      const q = sub(p, s.c), u = q[2] - q[0] * s.side * .35 - .05, r0 = Math.hypot(q[1] * 1.6, u), slit = Math.abs(u) < .06 + .05 * (1 - Math.abs(q[1]) * 2) && Math.abs(q[1]) < .42;
      c = slit ? mul(D.eye, .25) : mixc(mul(D.eye, .45), mixc(D.eye, [1, 1, .85], .55), clamp(1.15 - r0 * 1.3, 0, 1)); a = slit ? .7 : .04; sp = 1; gl = 1; ty = 0; st = 0;
    }
    // eclipse
    if (tag === 'disc') { const r = Math.hypot(p[0], p[1] - BONES[B.eclipse].pos[1]); c = mixc([.05, .042, .045], [.2, .16, .12], smooth(5, 11, r) * .7 + fine * .3); sp = .55; gl = .55; ty = T.STONE; st = 1;
      if (D.key === 'a' && r > 10.4) { c = mixc(c, D.glow, .6); a = .45; }
      if (D.key === 'c' && D.cracks) { let dm = 9; for (const seg of D.cracks) for (let k = 0; k + 1 < seg.length; k++) { const A2 = seg[k], B2 = seg[k + 1], ab = [B2[0] - A2[0], B2[1] - A2[1]], t = clamp(((p[0] - A2[0]) * ab[0] + (p[1] - A2[1]) * ab[1]) / (ab[0] * ab[0] + ab[1] * ab[1]), 0, 1); dm = Math.min(dm, Math.hypot(p[0] - A2[0] - ab[0] * t, p[1] - A2[1] - ab[1] * t)); }
        if (dm < 1.1) { c = mixc(D.glow, [1, .5, .2], clamp(1 - dm, 0, 1)); a = clamp(dm - .2, 0, 1) * .6; } } }
    if (tag === 'corona' || tag === 'ray' || tag === 'shard') { const t = s.root ? clamp(len(sub(p, s.root)) / s.L, 0, 1) : 0; c = mixc(D.glow, D.key === 'a' ? [1, .95, .7] : [1, .35, .1], tag === 'corona' ? .35 : t * .6); a = tag === 'shard' ? .25 + t * .2 : .1; sp = .5; gl = .6; ty = T.STONE; st = .4; }
    if (tag === 'moon') { const r = Math.hypot(p[0], p[1] - BONES[B.eclipse].pos[1]); c = mixc([.86, .88, .93], [.6, .64, .72], clamp(fine * .6 + (1 - ao(evalAll, p, n)) * 1.5, 0, 1)); a = .45; sp = .2; gl = .3; ty = T.STONE; st = 1; }
    if (tag === 'halo') { c = D.glow; a = .05; }
    if (tag === 'spike') { const t = s.root ? clamp(len(sub(p, s.root)) / s.L, 0, 1) : 0; c = mixc([.05, .03, .03], [.55, .48, .4], Math.pow(t, 1.4)); sp = .45; gl = .55; ty = T.HORN; st = .6; }
    // ambient occlusion from the full sculpt (cavities, fur roots, under the jaw), not on glowing parts
    const occ = ao(evalAll, p, n), shade = lerp(.32, 1, occ);
    if (a > .99) c = mul(c, shade); else c = mul(c, lerp(.85, 1, occ));
    colors.push([c[0], c[1], c[2], a]); mat.push([sp, gl]); detail.push([ty / 8, st]);
  }
  return { colors, mat, detail };
}

// ---------------- animation ----------------
function clips(D) {
  const q = (ax, a) => qAxis(ax, a), X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1], E = (x, y, z) => qMul(qMul(q(Y, y || 0), q(X, x || 0)), q(Z, z || 0));
  const legs = (rot, ph, amp, lift) => {
    const sets = [[B.flShoulder, 0], [B.frShoulder, Math.PI], [B.hlHip, Math.PI], [B.hrHip, 0]];
    for (const [b, o] of sets) { const a = ph + o, sw = Math.sin(a), fwd = Math.cos(a) > 0, front = b === B.flShoulder || b === B.frShoulder;
      if (front) { rot[b] = E(-sw * amp); rot[b + 1] = E(fwd ? -Math.max(0, Math.cos(a)) * lift * .6 : 0); rot[b + 2] = E(Math.max(0, Math.cos(a)) * lift); rot[b + 3] = E(-Math.max(0, -Math.sin(a)) * .3 + Math.max(0, Math.cos(a)) * .4); }
      else { rot[b] = E(-sw * amp * .85); rot[b + 1] = E(Math.max(0, Math.cos(a)) * lift * .7); rot[b + 2] = E(-Math.max(0, Math.cos(a)) * lift * .9); rot[b + 3] = E(Math.max(0, Math.cos(a)) * .45); } }
  };
  const tail = (rot, t, sway, lift) => { for (let i = 0; i < 4; i++) rot[B.tail1 + i] = E(-lift * (i ? .3 : 1), Math.sin(t - i * .7) * sway); };
  const ecl = (rot, ph) => { rot[B.eclipse] = D.key === 'c' ? E(0, 0, Math.sin(ph) * .12) : E(0, 0, -ph / 8); };
  const TAU = Math.PI * 2;
  return {
    Idle: { dur: 4, track: t => { const ph = t / 4 * TAU, rot = {}, br = Math.sin(ph * 2);
      rot[B.chest] = E(br * .018); rot[B.neck] = E(Math.sin(ph * 2 + 1) * .03 + D.hunch * .2); rot[B.head] = E(-br * .02, Math.sin(ph) * .14); rot[B.jaw] = E(.02 + Math.max(0, Math.sin(ph * 2 + 2)) * .05);
      const tw = t > 1.2 && t < 1.5 ? Math.sin((t - 1.2) / .3 * Math.PI) : 0; rot[B.earL] = E(-tw * .35, 0, tw * .2); rot[B.earR] = E(0, 0, t > 3 && t < 3.25 ? -Math.sin((t - 3) / .25 * Math.PI) * .25 : 0);
      tail(rot, ph, .12, -.05); ecl(rot, ph); return { rot, root: [0, br * .25, 0] }; } },
    Run: { dur: .8, track: t => { const ph = t / .8 * TAU, rot = {};
      legs(rot, ph, .55, .9); rot[B.hips] = E(Math.sin(ph * 2) * .05); rot[B.chest] = E(-Math.sin(ph * 2) * .04); rot[B.neck] = E(Math.sin(ph * 2 + .6) * .06 + .05); rot[B.head] = E(-Math.sin(ph * 2 + .6) * .05); rot[B.jaw] = E(.08);
      rot[B.earL] = E(-.35); rot[B.earR] = E(-.35); tail(rot, ph, .16, .2); ecl(rot, t / .8 * TAU * .1); return { rot, root: [0, Math.cos(ph * 2) * .9, 0] }; } },
    Walk: { dur: 1.3, track: t => { const ph = t / 1.3 * TAU, rot = {}; legs(rot, ph, .35, .55); rot[B.neck] = E(Math.sin(ph * 2) * .03); rot[B.head] = E(0, Math.sin(ph) * .06); tail(rot, ph, .12, 0); ecl(rot, ph * .2); return { rot, root: [0, Math.cos(ph * 2) * .4, 0] }; } },
    Attack: { dur: .62, track: t => { const u = t / .62, rot = {}, wind = smooth(0, .35, u) * (1 - smooth(.35, .5, u)), strike = smooth(.35, .52, u) * (1 - smooth(.6, 1, u)), open = smooth(0, .3, u) * (1 - smooth(.42, .5, u));
      rot[B.chest] = E(-wind * .16 + strike * .1); rot[B.neck] = E(-wind * .3 + strike * .38); rot[B.head] = E(-wind * .15 + strike * .12); rot[B.jaw] = E(open * .62 + strike * .05);
      rot[B.flShoulder] = E(-strike * .55 - wind * .2); rot[B.frShoulder] = E(-strike * .45 - wind * .25); rot[B.flElbow] = E(-wind * .4); rot[B.frElbow] = E(-wind * .4); rot[B.hlHip] = E(strike * .25); rot[B.hrHip] = E(strike * .25);
      rot[B.earL] = E(-.45); rot[B.earR] = E(-.45); tail(rot, u * 6, .1, .35 * wind + .2); ecl(rot, u); return { rot, root: [0, wind * 1.5, strike * 7 - wind * 2] }; } },
    Attack2: { dur: 1.1, track: t => { const u = t / 1.1, rot = {}, h = smooth(0, .3, u) * (1 - smooth(.78, 1, u));
      rot[B.chest] = E(-h * .14); rot[B.neck] = E(-h * .55); rot[B.head] = E(-h * .35); rot[B.jaw] = E(h * .5 + Math.sin(u * 40) * .02 * h); rot[B.earL] = E(-h * .5); rot[B.earR] = E(-h * .5); tail(rot, u * 5, .08, h * .3); ecl(rot, u * 2); return { rot, root: [0, h * 1.2, -h * 1] }; } },
    RecieveHit: { dur: .4, track: t => { const u = t / .4, k = Math.sin(u * Math.PI) * (1 - u * .4), rot = {}; rot[B.chest] = E(-k * .1, 0, k * .05); rot[B.neck] = E(-k * .25); rot[B.head] = E(-k * .1, k * .15); rot[B.jaw] = E(k * .3); rot[B.earL] = E(-k * .5); rot[B.earR] = E(-k * .5); return { rot, root: [0, 0, -k * 2] }; } },
    Death: { dur: 1.6, track: t => { const u = smooth(0, 1, t / 1.6), fall = smooth(.25, .85, t / 1.6), rot = {};
      rot[B.root] = E(0, 0, fall * 1.42); rot[B.neck] = E(fall * .3, 0, -fall * .2); rot[B.head] = E(fall * .2); rot[B.jaw] = E(.25 * u);
      for (const b of [B.flShoulder, B.frShoulder]) rot[b] = E(-fall * .35); for (const b of [B.hlHip, B.hrHip]) rot[b] = E(fall * .3); for (const b of [B.flElbow, B.frElbow, B.hlKnee, B.hrKnee]) rot[b] = E(fall * .25);
      tail(rot, 0, 0, -fall * .4); rot[B.eclipse] = E(fall * .5, 0, -fall * 1.42); return { rot, root: [0, -u * 0 - fall * 22, 0] }; } },
  };
}

// ---------------- build ----------------
function build(variant, { lod = 0 } = {}) {
  const D = Object.assign({}, DESIGN[variant]), t0 = Date.now(), log = [];
  const body = anatomy(D); body.build(4); const tufts = addFur(body, D); body.build(3.5);
  const fine = details(D); fine.build(2); const ecl = eclipse(D); ecl.build(3);
  const evalAll = p => Math.min(body.eval(p), fine.eval(p), ecl.eval(p));
  const H = lod ? [1.1, .32, .8] : [.5, .15, .36];
  const parts = [['body', body, H[0]], ['detail', fine, H[1]], ['eclipse', ecl, H[2]]].map(([name, S, h]) => {
    const m = mesh(S, h, { clipY: -.05 }); const { J, W } = skinWeights(S, m.pos, name === 'body' ? 2.2 : 1); const pnt = paint(D, name, S, m, evalAll);
    if (name === 'eclipse') { const c0 = BONES[B.eclipse].pos, ca = Math.cos(ECLIPSE_TILT), sa = Math.sin(ECLIPSE_TILT), r = v => [v[0], v[1] * ca - v[2] * sa, v[1] * sa + v[2] * ca];
      m.pos = m.pos.map(p => add(c0, r(sub(p, c0)))); m.normals = m.normals.map(r); }
    log.push(name + ': ' + m.pos.length + ' verts, ' + m.tris.length / 3 + ' tris'); return Object.assign({ name }, m, pnt, { J, W });
  });
  log.push('fur tufts: ' + tufts + ', shapes ' + body.shapes.length + ', ' + (Date.now() - t0) + ' ms');
  const bones = bonesFor(D);
  return { parts, bones, clips: lod ? null : clips(D), log, design: D };
}

module.exports = { build, DESIGN, BONES, B };
if (require.main === module) {
  const fs = require('fs'), path = require('path'), out = process.argv[2] || path.join(__dirname, 'out'), only = process.argv[3];
  fs.mkdirSync(out, { recursive: true });
  for (let v = 0; v < 3; v++) { if (only && !only.includes('abc'[v])) continue;
    for (const lod of [0, 1]) { const r = build(v, { lod }), glb = F.writeGLB(r.parts, r.bones, r.clips); const file = path.join(out, 'varcolac-' + 'abc'[v] + (lod ? '-far' : '') + '.glb'); fs.writeFileSync(file, glb);
      console.log(path.basename(file), (glb.length / 1024 / 1024).toFixed(2) + ' MB', r.log.join(' | '), 'prims', JSON.stringify(glb.stats)); } }
}
