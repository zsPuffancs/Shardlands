'use strict';
// Alpha Wolf, Region Boss of Whispering Meadows: the leader of the meadow packs, a big natural grey wolf (not the
// Vârcolac's monster): long legs, a deep chest, a thick ruff, a long muzzle, tall ears, a brush tail.
//   A standard   a grey pack leader, a thick pale ruff, old scars across the muzzle
//   B empowered  a war-wolf: bone spikes along the spine, a spiked iron collar, bone plates over the shoulders,
//                fresh war scars, a torn ear, a heavier ruff
//   C ancient    a spirit wolf: glowing runes down the flanks, a ghostly mane and tail glowing at the tips, a crescent
//                mark on the brow, spectral flames over the shoulders
// The Vârcolac's 29-bone quadruped rig and clips (same bone order), wolf proportions; facing +z.
const K = require('./kit');
const F = require('./forge');
const V = require('./varcolac');
const { mixc } = K;
const { roundCone: RC, ellipsoid: EL, torus: TO, box: BX, Sculpt, norm, add, mul, sub, len, clamp, lerp, rng } = F;
const { rotZ, rotX } = V;

const BONES = [
  ['root', -1, [0, 31, -3]], ['hips', 0, [0, 31, -15]], ['chest', 0, [0, 33, 8]], ['neck', 2, [0, 36, 15]], ['head', 3, [0, 40, 21]], ['jaw', 4, [0, 37, 24]],
  ['earL', 4, [3, 44.6, 20]], ['earR', 4, [-3, 44.6, 20]],
  ['flShoulder', 2, [6, 32, 9]], ['flElbow', 8, [6.4, 19, 7]], ['flWrist', 9, [6.2, 6, 9]], ['flPaw', 10, [6.2, 2.4, 10.4]],
  ['frShoulder', 2, [-6, 32, 9]], ['frElbow', 12, [-6.4, 19, 7]], ['frWrist', 13, [-6.2, 6, 9]], ['frPaw', 14, [-6.2, 2.4, 10.4]],
  ['hlHip', 1, [5.6, 30, -15]], ['hlKnee', 16, [6, 18, -10]], ['hlHock', 17, [6, 8, -18]], ['hlPaw', 18, [6, 2.4, -16]],
  ['hrHip', 1, [-5.6, 30, -15]], ['hrKnee', 20, [-6, 18, -10]], ['hrHock', 21, [-6, 8, -18]], ['hrPaw', 22, [-6, 2.4, -16]],
  ['tail1', 1, [0, 31, -22]], ['tail2', 24, [0, 27, -28]], ['tail3', 25, [0, 22, -32]], ['tail4', 26, [0, 17.5, -34]],
  ['back', 0, [0, 40, -4]],
].map(([name, parent, pos]) => ({ name, parent, pos }));
const B = Object.fromEntries(BONES.map((b, i) => [b.name, i]));
const both = f => { f(1); f(-1); };

const DESIGN = [
  { key: 'a', name: 'standard', seed: 2101, colors: { fur: [.5, .5, .52], skinDark: [.2, .2, .22], hair: [.82, .8, .76], bone: [.84, .8, .68], metal: [.32, .3, .3], glow: [.6, .8, 1] }, coat: [.42, .43, .46], back: [.22, .22, .24], pale: [.85, .83, .78], eye: [1, .78, .2] },
  { key: 'b', name: 'empowered', seed: 2102, colors: { fur: [.36, .34, .34], skinDark: [.14, .13, .13], hair: [.6, .58, .54], bone: [.86, .8, .66], metal: [.3, .29, .3], darkmetal: [.12, .11, .11], glow: [1, .3, .15] }, coat: [.3, .29, .3], back: [.13, .12, .12], pale: [.66, .62, .58], eye: [1, .3, .1] },
  { key: 'c', name: 'ancient', seed: 2103, colors: { fur: [.7, .74, .8], skinDark: [.3, .34, .4], hair: [.9, .94, 1], bone: [.86, .84, .76], glow: [.4, .85, 1] }, coat: [.64, .68, .76], back: [.4, .44, .52], pale: [.92, .95, 1], eye: [.45, .9, 1] },
];

function anatomy(D) {
  const S = new Sculpt(), A = (shape, o) => S.add(shape, Object.assign({ tag: 'fur' }, o));
  // a deep chest, a tucked waist, lean haunches
  A(EL([0, 32, 6], [8.4, 9.6, 10]), { bone: B.chest, k: 3, flow: [0, -.2, -1] });
  A(EL([0, 31.5, -5], [6.6, 7, 10]), { bone: B.root, k: 3, flow: [0, -.1, -1] });
  A(EL([0, 31, -16], [7.4, 7.4, 7.6]), { bone: B.hips, k: 3, flow: [0, -.2, -1] });
  A(EL([0, 26, 5], [6.4, 4, 8]), { bone: B.chest, k: 2.4 });
  // neck and head: a long muzzle, a strong stop, high cheekbones, tall ears
  A(RC([0, 33.5, 11], [0, 38, 18], 7.4, 5.6), { bone: B.neck, k: 2.6, flow: [0, -.2, -1] });
  A(EL([0, 40, 20.6], [4.8, 4.4, 5]), { bone: B.head, k: 1.6 });
  A(RC([0, 39.6, 24], [0, 38.4, 31.6], 3, 1.7), { bone: B.head, tag: 'muzzle', k: 1.4 });
  both(s => A(EL([s * 3.2, 39, 22.6], [1.7, 1.7, 2.4]), { bone: B.head, k: .9 }));
  A(EL([0, 38.7, 32.2], [1.3, 1, 1.1]), { bone: B.head, tag: 'nose', k: .4 });
  both(s => S.sub(EL([s * 1.95, 41.3, 24.4], [.75, .5, .7]), { k: .25 }));
  const J = p => { const o = [0, 37, 24], q = sub(p, o), a = .15; return add(o, [q[0], q[1] * Math.cos(a) - q[2] * Math.sin(a), q[1] * Math.sin(a) + q[2] * Math.cos(a)]); };
  A(RC(J([0, 36.6, 24]), J([0, 36.4, 31]), 2.2, 1.2), { bone: B.jaw, tag: 'muzzle', k: 1 });
  both(s => { const L = s > 0 ? B.earL : B.earR, torn = D.key === 'b' && s < 0; A(RC([s * 3, 43.4, 20.4], [s * 3.8, torn ? 46.8 : 49, 19], 1.8, .3), { bone: L, k: .7 });
    if (torn) S.sub(EL([s * 4, 47, 19.6], [1, 1, 1]), { k: .1 }); });
  // legs: long, slender, with hocks and dog paws
  both(s => { const b = s > 0 ? 0 : 4, f = p => [s * p[0], p[1], p[2]];
    A(RC(f([6, 32, 9]), f([6.4, 19, 7]), 3.8, 2.6), { bone: B.flShoulder + b, k: 1.8, flow: [0, -1, -.2] });
    A(RC(f([6.4, 19, 7]), f([6.2, 6, 9]), 2.3, 1.7), { bone: B.flElbow + b, k: 1 });
    A(RC(f([6.2, 6, 9]), f([6.2, 2.6, 10.4]), 1.7, 1.8), { bone: B.flWrist + b, k: .8 });
    A(EL(f([6.2, 1.9, 11.4]), [2.2, 1.8, 2.8]), { bone: B.flPaw + b, k: .7 });
    A(RC(f([5.6, 30, -15]), f([6, 18, -10]), 5, 3), { bone: B.hlHip + b, k: 2.2, flow: [0, -1, -.3] });
    A(RC(f([6, 18, -10]), f([6, 8, -18]), 2.6, 1.8), { bone: B.hlKnee + b, k: 1.2 });
    A(RC(f([6, 8, -18]), f([6, 2.6, -16]), 1.8, 1.6), { bone: B.hlHock + b, k: .8 });
    A(EL(f([6, 1.9, -15]), [2.1, 1.7, 2.8]), { bone: B.hlPaw + b, k: .7 }); });
  // the tail
  const tp = [[0, 31, -22], [0, 27, -28], [0, 22, -32], [0, 17.5, -34], [0, 14, -34.6]], tr = [2.8, 2.6, 2.4, 2, 1.2];
  for (let i = 0; i < 4; i++) A(RC(tp[i], tp[i + 1], tr[i], tr[i + 1]), { bone: B.tail1 + i, k: 1.4, tail: 1 });
  return S;
}

// fur over everything, a thick ruff round the neck and chest, a brush tail
function addFur(S, D) {
  const heavy = (D.key === 'b' ? 1.25 : 1) * (D.fur || 1);
  return K.locks(S, D.seed * 31 + 7, (p, n, s) => {
    if (s.tag === 'nose' || s.tag === 'muzzle' && p[2] > 26) return null;
    if (s.tail) return { chance: .95, len: [4, 7], r: 1.1, flow: [0, -.6, -1], up: .4, tag: 'fur', bone: s.bone };
    if (s.bone === B.neck || (s.bone === B.chest && p[2] > 8 && p[1] > 26) || (s.bone === B.head && p[2] < 19)) return { chance: .95, len: [5 * heavy, 9 * heavy], r: 1.3, flow: [0, -.6, -.8], up: .3, tag: 'ruff', bone: s.bone };
    if (p[1] < 9) return null;
    return { chance: .5, len: [2.4, 4.2], r: .85, flow: s.flow || [0, -.6, -.6], up: .2, tag: 'fur', bone: s.bone };
  }, D.lockRes || 1.05);
}

function extras(D) {
  const S = new Sculpt(), key = D.key;
  const J = p => { const o = [0, 37, 24], q = sub(p, o), a = .15; return add(o, [q[0], q[1] * Math.cos(a) - q[2] * Math.sin(a), q[1] * Math.sin(a) + q[2] * Math.cos(a)]); };
  both(s => {
    S.add(EL([s * 1.95, 41.3, 24.9], [.7, .45, .55]), { bone: B.head, tag: 'eye', k: .1, c: [s * 1.95, 41.3, 24.9] });
    for (const [z, l] of [[29.6, 2.4], [27.6, 1.2], [26, 1]]) { const a = [s * (z > 29 ? 1.4 : 1.9), 37.8, z]; S.add(RC(a, add(a, [0, -l, .3]), .38, .06), { bone: B.head, tag: 'tooth', k: .05, root: a, L: l }); }
    { const a = J([s * 1.3, 36.9, 29.4]); S.add(RC(a, add(a, [0, 1.9, .3]), .34, .06), { bone: B.jaw, tag: 'tooth', k: .05, root: a, L: 1.9 }); }
    for (const [paw, z] of [[B.flPaw, 11.4], [B.hlPaw, -15]]) for (const dx of [-1.3, -.45, .45, 1.3]) { const a = [s * (6.2 + dx), 1.4, z + 2.4]; S.add(RC(a, add(a, [0, -.8, 1.1]), .35, .1), { bone: paw + (s > 0 ? 0 : 4), tag: 'claw', k: .05 }); }
  });
  // B: bone spikes on the spine, a spiked iron collar, bone plates on the shoulders
  if (key === 'b') {
    [[0, 43.6, 4], [0, 42, -2], [0, 40.6, -8], [0, 39.6, -14], [0, 37.4, -19]].forEach((q, i) => { const l = [7, 9, 8, 6, 4][i]; S.add(RC(q, add(q, [0, l, -l * .4]), 1.1, .08), { bone: i < 2 ? B.chest : i < 4 ? B.root : B.hips, tag: 'bone', k: .3 }); });
    S.add(TO([0, 35.6, 14.4], 6.2, 1, [[1, 0, 0], [0, .55, .84], [0, -.84, .55]]), { bone: B.neck, tag: 'darkmetal', k: .2 });
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, c = [Math.cos(a) * 6.8, 35.6 + Math.sin(a) * .84 * 6.8 * .55, 14.4 - Math.sin(a) * 6.8 * .84]; S.add(RC(c, add(c, mul(norm(sub(c, [0, 35.6, 14.4])), 2.6)), .5, .05), { bone: B.neck, tag: 'metal', k: .05 }); }
    both(s => S.add(EL([s * 7.4, 36, 8], [2.4, 4.6, 5.4], rotZ(s * .3)), { bone: s > 0 ? B.flShoulder : B.frShoulder, tag: 'bone', k: .6 }));
  }
  // C: spectral flames over the shoulders and a crescent on the brow
  if (key === 'c') {
    both(s => { for (let i = 0; i < 5; i++) { const b = [s * (4 + i * .6), 40 + (i % 2), 8 - i * 3]; S.add(RC(b, add(b, [s * .8, 5 + (i % 2) * 2, -2]), 1.1, .1), { bone: B.chest, tag: 'spirit', k: .5, root: b, L: 7 }); } });
    for (let i = 0; i < 7; i++) { const a = (i / 6 - .5) * 2.2; S.add(EL([Math.sin(a) * 1.6, 43.4 + Math.cos(a) * 1.2, 22.4], [.35, .35, .35]), { bone: B.head, tag: 'glow', k: .2 }); }
  }
  // species features for the basic enemies built on this body
  if (D.iceSpine) [[0, 43.6, 4], [0, 42, -2], [0, 40.6, -8], [0, 39.6, -14]].forEach((q, i) => K.crystals(S, q, [0, 1, -.3], { count: 3, length: 6 + (i % 2) * 2, r: 1.2, seed: D.seed + i, bone: i < 2 ? B.chest : B.root, tag: 'ice', spread: .35 }));
  if (D.horns) both(s => { let p = [s * 2.4, 43, 19], d = norm([s * .3, .5, -1]); for (let i = 0; i < 5; i++) { const q = add(p, mul(d, 1.8)); S.add(RC(p, q, .9 - i * .14, .8 - i * .14), { bone: B.head, tag: 'horn', k: .2, root: [s * 2.4, 43, 19], L: 9 }); p = q; d = norm(add(d, [0, .2, .1])); } });
  if (D.sabre) both(s => { const a = [s * 1.5, 37.8, 29.4]; S.add(RC(a, add(a, [0, -4.2, .2]), .55, .08), { bone: B.head, tag: 'tooth', k: .05, root: a, L: 4.2 }); });
  if (D.maneFlames) for (let i = 0; i < 9; i++) { const z = 16 - i * 3.6, b = [0, 42.4 - i * .5, z]; S.add(RC(b, add(b, [0, 4 + (i % 2) * 2, -2]), 1.2, .1), { bone: i < 3 ? B.neck : i < 6 ? B.chest : B.root, tag: 'flame', k: .4, root: b, L: 6 }); }
  if (D.hackles) for (let i = 0; i < 8; i++) { const b = [0, 42.6 - i * .3, 10 - i * 3]; S.add(RC(b, add(b, [0, 3.4, -1.4]), .9, .1), { bone: i < 4 ? B.chest : B.root, tag: 'ruffTip', k: .3 }); }
  return S;
}

const RUNES = [[[7.4, 34, 2], [7.6, 28, -6]], [[7.6, 28, -6], [7.2, 34, -12]], [[-7.4, 34, 2], [-7.6, 28, -6]], [[-7.6, 28, -6], [-7.2, 34, -12]]];
const segDist = (p, a, b) => { const ab = sub(b, a), t = clamp(F.dot(sub(p, a), ab) / F.dot(ab, ab), 0, 1); return len(sub(p, add(a, mul(ab, t)))); };
function custom(D) {
  return ({ p, n, s, tag, fine, big }) => {
    if (tag === 'eye') { const q = sub(p, s.c), r0 = Math.hypot(q[0], q[1] * 1.4); return { c: mixc(mul(D.eye, .5), mixc(D.eye, [1, 1, .9], .5), clamp(1 - r0, 0, 1)), a: .04, sp: 1, gl: 1, ty: 0, st: 0 }; }
    if (tag === 'nose') return { c: [.05, .05, .05], sp: .9, gl: .9, ty: 3, st: .3 };
    if (tag === 'flame') { const t = s.root ? clamp(len(sub(p, s.root)) / s.L, 0, 1) : .5; return { c: mixc(D.colors.glow, [1, .9, .5], t), a: .06, sp: .5, gl: .5, ty: 0, st: 0 }; }
    if (tag === 'ruffTip') return { c: D.pale, sp: .1, gl: .2, ty: 1, st: 1 };
    if (tag === 'claw') return { c: [.12, .11, .1], sp: .7, gl: .8, ty: 4, st: .5 };
    if (tag === 'spirit') { const t = s.root ? clamp(len(sub(p, s.root)) / s.L, 0, 1) : .5; return { c: mixc(D.colors.glow, [.9, 1, 1], t), a: lerp(.3, .05, t), sp: .5, gl: .5, ty: 0, st: 0 }; }
    if (tag === 'fur' || tag === 'ruff' || tag === 'muzzle') {
      const t = s.root && s.L ? clamp(len(sub(p, s.root)) / s.L, 0, 1) : 0, dorsal = clamp((n[1] + .1) * 1.2, 0, 1), under = clamp(-n[1] * 1.5, 0, 1);
      let c = mixc(D.coat, D.back, dorsal * .7 + (big - .5) * .4); c = mixc(c, D.pale, Math.max(under * .8, tag === 'ruff' ? .5 : 0, tag === 'muzzle' && p[1] < 39 ? .7 : 0)); c = mul(c, .88 + fine * .2 + t * .08);
      if (D.key === 'c') { let dm = 9; for (const [a, b] of RUNES) dm = Math.min(dm, segDist(p, a, b)); if (dm < .55 && !s.root) return { c: D.colors.glow, a: .08, sp: .5, gl: .5, ty: 0, st: 0 };
        if (t > .8 && (tag === 'ruff' || p[2] < -26)) return { c: mixc(D.pale, D.colors.glow, .7), a: .35, sp: .3, gl: .4, ty: 2, st: .6 }; }
      if (D.seams && !s.root && Math.abs(F.noise3(p[0] * .35, p[1] * .35, p[2] * .35, 8) - .5) < .025) return { c: D.colors.glow, a: .08, sp: .5, gl: .5, ty: 0, st: 0 };
      if (D.eyeBurn && tag === 'muzzle') {}
      const scar = D.key !== 'c' && tag === 'muzzle' && Math.abs(Math.sin(p[2] * 2.2 + p[0] * 3)) < .08 && p[0] > 0; if (scar) c = mixc(c, [.62, .5, .48], .7);
      return { c, sp: .12, gl: .25, ty: tag === 'muzzle' ? 3 : 1, st: tag === 'muzzle' ? .5 : 1 };
    }
    return null;
  };
}

function build(variant, opts) { return buildWith(DESIGN[variant], opts); }
function buildWith(design, { lod = 0 } = {}) {
  const D = Object.assign({}, design), t0 = Date.now();
  const body = anatomy(D); body.build(4); const n = addFur(body, D); body.build(3); const ex = extras(D); ex.build(2);
  const R = D.res ? (lod ? D.res[1] : D.res[0]) : lod ? [1, .5] : [.42, .2];
  const { parts, log } = K.finish(D, [['body', body, R[0], 2], ['extras', ex, R[1], .5]], custom(D));
  log.push('locks ' + n + ', ' + (Date.now() - t0) + ' ms');
  return { parts, bones: BONES, clips: lod ? null : V.clips(Object.assign({ hunch: 0 }, D, { eclipseRot: (ph, E) => E(Math.sin(ph) * .02, 0, 0) })), log, design: D };
}
module.exports = { build, buildWith, DESIGN, BONES, B };
