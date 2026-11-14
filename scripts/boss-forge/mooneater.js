'use strict';
// Moon-Eater, World Boss of Voidreach and the voidscar regions: the Bakunawa, a colossal sea-serpent of the sky that
// swallows moons. It swims through the ground: two humps arch out of the earth behind a neck rising to a vast head
// with gaping jaws, a membrane sail down the back, fin-frills at the jaw and fins at the neck.
//   A cosmic        indigo, speckled with stars, violet sail; a pale cratered moon held in its jaws
//   B corrupted     black, split by glowing void cracks, ragged sail, void tendrils trailing; an eclipsed moon
//   C star-marked   midnight blue traced with constellations, golden fins, stars orbiting its neck; a radiant moon
// A 28-bone serpent rig (spine chain, head, jaw, crest, two fins, tail). Units match the old model (top ~74).
const K = require('./kit');
const { F, mixc, both } = K;
const { roundCone: RC, ellipsoid: EL, torus: TO, Sculpt, norm, add, mul, sub, len, cross, dot, clamp, lerp, rng, qAxis, qMul } = F;

// the path dives under the ground between humps (the ground clip cuts it there)
const CTRL = [[2, -10, -58], [-3, 2, -54], [-6, 14, -47], [-6, 17, -40], [-3, 12, -33], [0, -2, -28], [3, -9, -22], [6, 2, -16], [7, 16, -10], [6, 20, -3], [3, 14, 2],
  [1, 4, 5], [0, 4, 9], [-1, 14, 9], [-1, 30, 7], [0, 44, 8], [0, 54, 12], [0, 59, 16]];
const cr = (p0, p1, p2, p3, t) => [0, 1, 2].map(k => .5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t));
const PATH = (() => { const out = []; for (let i = 0; i < CTRL.length - 1; i++) for (let s = 0; s < 8; s++) out.push(cr(CTRL[Math.max(0, i - 1)], CTRL[i], CTRL[i + 1], CTRL[Math.min(CTRL.length - 1, i + 2)], s / 8)); out.push(CTRL[CTRL.length - 1]); return out; })();
const ARC = (() => { const a = [0]; for (let i = 1; i < PATH.length; i++) a.push(a[i - 1] + len(sub(PATH[i], PATH[i - 1]))); return a.map(v => v / a[a.length - 1]); })();
const at = u => { let i = 1; while (i < ARC.length - 1 && ARC[i] < u) i++; const t = (u - ARC[i - 1]) / Math.max(1e-6, ARC[i] - ARC[i - 1]); return add(PATH[i - 1], mul(sub(PATH[i], PATH[i - 1]), clamp(t, 0, 1))); };
const tangent = u => norm(sub(at(Math.min(1, u + .004)), at(Math.max(0, u - .004))));
const radius = u => (u < .08 ? 2 + u / .08 * 6.4 : u < .7 ? 8.4 + Math.sin(u * 9) * .4 : 8.4 - (u - .7) / .3 * 2);
const RISE = .66;
// the back of the body at u (away from the belly): up on the humps, backwards on the rising neck
const backAt = u => { const t = tangent(u), ref = u < RISE ? [0, 1, 0] : [0, .2, -1]; return norm(sub(ref, mul(t, dot(ref, t)))); };

const NSPINE = 22, HEAD = [0, 62, 20];
const BONES = []; for (let i = 0; i < NSPINE; i++) BONES.push({ name: 'spine' + i, parent: i - 1, pos: at(i / NSPINE) });
BONES.push({ name: 'head', parent: NSPINE - 1, pos: at(1) }, { name: 'jaw', parent: NSPINE, pos: [0, 58.4, 18.6] }, { name: 'crest', parent: NSPINE, pos: [0, 66, 16] });
const FIN_U = .8, FIN_BONE = Math.floor(FIN_U * NSPINE), FP = at(FIN_U);
BONES.push({ name: 'wingL', parent: FIN_BONE, pos: add(FP, [7, 0, 1]) }, { name: 'wingR', parent: FIN_BONE, pos: add(FP, [-7, 0, 1]) }, { name: 'tailPlume', parent: 0, pos: at(0) });
const B = Object.fromEntries(BONES.map((b, i) => [b.name, i]));
const boneAtU = u => Math.min(NSPINE - 1, Math.floor(u * NSPINE));

const DESIGN = [
  { key: 'a', name: 'cosmic', seed: 901, skin: [.15, .13, .36], skinDark: [.05, .04, .14], belly: [.42, .38, .62], fin: [.5, .28, .82], star: [.88, .9, 1], glow: [.7, .62, 1], moon: [.9, .9, .84], rim: [.08, .06, .18] },
  { key: 'b', name: 'corrupted', seed: 902, skin: [.06, .05, .08], skinDark: [.015, .01, .02], belly: [.16, .12, .18], fin: [.22, .08, .3], star: [.75, .3, 1], glow: [.68, .25, 1], moon: [.05, .04, .06], rim: [.12, .04, .2] },
  { key: 'c', name: 'star-marked', seed: 903, skin: [.08, .13, .32], skinDark: [.02, .04, .12], belly: [.3, .38, .58], fin: [.95, .74, .3], star: [1, .94, .62], glow: [1, .9, .55], moon: [1, .97, .82], rim: [.1, .1, .16] },
];
const frameAlong = (t, up) => { const y = norm(t), x = norm(cross(up, y)), z = cross(y, x); return [x, y, z]; };
const J = p => { const o = [0, 58.4, 18.6], q = sub(p, o), a = .62; return add(o, [q[0], q[1] * Math.cos(a) - q[2] * Math.sin(a), q[1] * Math.sin(a) + q[2] * Math.cos(a)]); };

function body(D) {
  const S = new Sculpt(), N = 80;
  for (let i = 0; i < N; i++) { const u0 = i / N, u1 = (i + 1) / N; S.add(RC(at(u0), at(u1), radius(u0), radius(u1)), { bone: boneAtU((u0 + u1) / 2), tag: 'hide', k: 1.8, u: (u0 + u1) / 2 }); }
  // the head: a broad skull swept back into horns, a long upper jaw, a deep lower jaw dropped wide open
  const h = HEAD;
  S.add(EL(h, [6.6, 5.4, 7.4]), { bone: B.head, tag: 'hide', k: 1.6, u: 1 });
  S.add(RC(add(h, [0, .4, 3]), add(h, [0, -.6, 17]), 5.2, 3.2), { bone: B.head, tag: 'hide', k: 1.4, u: 1 });
  S.add(EL(add(h, [0, 2.6, 8]), [3.4, 1.8, 7.4]), { bone: B.head, tag: 'hide', k: 1.2, u: 1 });
  both(s => { S.add(EL(add(h, [s * 4.4, 3.6, 4.6]), [2, 1, 4.6]), { bone: B.head, tag: 'brow', k: .9 }); S.sub(EL(add(h, [s * 4.1, 1.9, 6.6]), [1.5, 1.1, 1.5]), { k: .3 });
    S.sub(EL(add(h, [s * 1.4, .6, 17.6]), [.6, .5, .7]), { k: .2 });
    let p = add(h, [s * 4.4, 4, -2]), d = norm([s * .5, .4, -1]); for (let i = 0; i < 5; i++) { const q = add(p, mul(d, 3.4)); S.add(RC(p, q, 1.6 - i * .28, 1.35 - i * .28), { bone: B.crest, tag: 'horn', k: .3, root: add(h, [s * 4.4, 4, -2]), L: 17 }); p = q; d = norm(add(d, [0, .12, -.05])); } });
  S.add(RC(J(add(h, [0, -3.6, 2])), J(add(h, [0, -4.4, 16])), 4.4, 2.6), { bone: B.jaw, tag: 'belly', k: 1.2, u: 1 });
  S.sub(RC(add(h, [0, -2.6, 4]), add(h, [0, -3, 18]), 2.6, 1.6), { k: .6 });
  return S;
}

// fins and sails: spines with a membrane between them
function membrane(S, spines, bone, tag, D, ragged = 0) {
  const R = rng(D.seed + spines.length);
  spines.forEach(([a, b, bn], i) => { const bb = bn === undefined ? bone : bn; S.add(RC(a, b, .55, .12), { bone: bb, tag: tag + 'Spine', k: .25, root: a, L: len(sub(b, a)) });
    if (i + 1 >= spines.length) return; const [a2, b2] = spines[i + 1], P = (t, u) => lerp3(lerp3(a, b, t), lerp3(a2, b2, t), u);
    for (let k = 0; k < 7; k++) for (let m = 0; m < 3; m++) { const t = (k + .5) / 7, u = (m + .5) / 3; if (ragged && t > .5 && R() < ragged) continue;
      const p = P(t, u), du = sub(P(t, u + .02), P(t, u - .02)), dt = sub(P(t + .02, u), P(t - .02, u)), nrm = norm(cross(du, dt));
      const w = Math.max(.5, len(du) / .04 / 3 * .75), h = Math.max(.5, len(dt) / .04 / 7 * .8), x = norm(du), y = norm(cross(nrm, x));
      S.add(EL(p, [w, h, .22], [x, y, nrm]), { bone: bb, tag, k: .5, root: a, L: len(sub(b, a)), t }); } });
}
const lerp3 = (a, b, t) => add(a, mul(sub(b, a), t));
function fins(D) {
  const S = new Sculpt(), key = D.key, rag = key === 'b' ? .45 : 0;
  // the dorsal sail: along the humps and the rising neck
  for (const [u0, u1, n, hmax] of [[.1, .3, 9, 12], [.36, .58, 10, 14], [.66, .95, 12, 13]]) { const sp = [];
    for (let i = 0; i < n; i++) { const u = lerp(u0, u1, i / (n - 1)), back = backAt(u), base = add(at(u), mul(back, radius(u) * .85)), hgt = hmax * Math.sin((i + .5) / n * Math.PI) * (.6 + .4 * Math.sin(i * 1.7) ** 2);
      sp.push([base, add(add(base, mul(back, hgt)), mul(tangent(u), -hgt * .45)), boneAtU(u)]); }
    membrane(S, sp, 0, 'fin', D, rag); }
  // fin-frills behind the jaw and fins at the base of the neck
  both(s => { const h = HEAD, base = add(h, [s * 5.6, -1.4, -2]), sp = []; for (let i = 0; i < 6; i++) { const a = (i / 5 - .5) * 1.6, d = norm([s * Math.cos(a) * .9, Math.sin(a), -.6]); sp.push([add(base, mul(d, 1)), add(base, mul(d, 11 + (i % 2) * 3)), B.head]); } membrane(S, sp, B.head, 'fin', D, rag);
    const fb = add(FP, [s * 7, 0, 1]), fs = []; for (let i = 0; i < 6; i++) { const a = i / 5 * 1.3, d = norm([s * Math.cos(a), -.3 + Math.sin(a) * .4, -.4 - a * .3]); fs.push([fb, add(fb, mul(d, 22 - i * 1.6)), s > 0 ? B.wingL : B.wingR]); } membrane(S, fs, s > 0 ? B.wingL : B.wingR, 'fin', D, rag); });
  // a tail fin where the body first breaks the ground
  if (key === 'b') for (let i = 0; i < 9; i++) { const u = .1 + i * .07, back = backAt(u), b0 = add(at(u), mul(back, -radius(u) * .2)); let p = add(b0, [i % 2 ? 6 : -6, 0, 0]), d = norm([i % 2 ? .8 : -.8, -.2, .3]);
    for (let k = 0; k < 6; k++) { const q = add(p, add(mul(d, 2.6), [0, -.4, Math.sin(k + i) * .6])); S.add(RC(p, q, .9 - k * .13, .8 - k * .13), { bone: boneAtU(u), tag: 'tendril', k: .3, root: p, L: 15 }); p = q; d = norm(add(d, [0, -.15, .1])); } }
  return S;
}

// teeth, eyes, barbels, the moon, orbiting stars
function details(D) {
  const S = new Sculpt(), h = HEAD, key = D.key;
  both(s => {
    S.add(EL(add(h, [s * 4.1, 1.9, 6.4]), [1.1, .85, 1.1]), { bone: B.head, tag: 'eye', k: .1, c: add(h, [s * 4.1, 1.9, 6.4]) });
    for (let i = 0; i < 9; i++) { const z = 4 + i * 1.5, x = s * (3.8 - i * .2), p = add(h, [x, -2.6, z]), l = i === 6 ? 4.6 : 1.8 + (i % 2) * .8; S.add(RC(p, add(p, [0, -l, .3]), .48, .05), { bone: B.head, tag: 'tooth', k: .05, root: p, L: l }); }
    for (let i = 0; i < 8; i++) { const z = 4 + i * 1.5, p = J(add(h, [s * (3.4 - i * .2), -4.4, z])), q = J(add(h, [s * (3.4 - i * .2), -1.6 - (i === 5 ? 2.4 : 0), z + .3])); S.add(RC(p, q, .45, .05), { bone: B.jaw, tag: 'tooth', k: .05, root: p, L: 3 }); }
    let p = add(h, [s * 2.6, -1.6, 16]), d = norm([s * .5, -.6, .3]); for (let i = 0; i < 8; i++) { const q = add(p, mul(d, 2)); S.add(RC(p, q, .5 - i * .05, .45 - i * .05), { bone: B.head, tag: 'barbel', k: .2, root: add(h, [s * 2.6, -1.6, 16]), L: 16 }); p = q; d = norm(add(d, [s * -.05, -.12, -.15])); }
  });
  // the moon, held between the jaws
  const mc = add(h, [0, -5.2, 11]);
  S.add(EL(mc, [5.2, 5.2, 5.2]), { bone: B.head, tag: 'moon', k: .2, c: mc });
  if (key !== 'b') { const R = rng(D.seed + 3); for (let i = 0; i < 10; i++) { const a = R() * Math.PI * 2, b = (R() - .3) * 1.4, d = [Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)]; S.sub(EL(add(mc, mul(d, 5.2)), [lerp(.6, 1.6, R()), lerp(.6, 1.6, R()), lerp(.6, 1.6, R())]), { k: .4 }); } }
  else S.add(TO(mc, 5.7, .35, [[1, 0, 0], [0, 0, 1], [0, 1, 0]]), { bone: B.head, tag: 'corona', k: .2 });
  // star-marked: a ring of stars orbiting the neck
  if (key === 'c') for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, c = add(at(.84), [Math.cos(a) * 15, Math.sin(a) * 4 + 2, Math.sin(a) * 15]); for (const d of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) S.add(EL(c, d.map(v => (v ? 1.6 : .4))), { bone: FIN_BONE, tag: 'star', k: .3 }); }
  return S;
}

const STARS = (() => { const R = rng(7), out = []; for (let i = 0; i < 46; i++) out.push([R(), R() * Math.PI * 2]); return out; })();
function custom(D) {
  return ({ p, n, s, tag, fine, big }) => {
    const key = D.key;
    if (tag === 'hide' || tag === 'brow' || tag === 'belly') {
      const u = s.u === undefined ? 1 : s.u, t = tangent(Math.min(.999, u)), out = norm(sub(p, at(Math.min(1, u)))), bd = mul(backAt(Math.min(.999, u)), -1), belly = tag === 'belly' || dot(out, bd) > .5;
      let c = mixc(D.skin, D.skinDark, clamp(.35 + (big - .5) * .9, 0, 1)); c = mul(c, .88 + fine * .25);
      if (belly) { const band = Math.abs(Math.sin(u * 300)) < .2; c = mixc(D.belly, mul(D.belly, .55), band ? .7 : 0); return { c, sp: .4, gl: .55, ty: 3, st: .5 }; }
      const ang = Math.atan2(dot(out, cross(t, bd)), dot(out, bd)), cell = [Math.floor(u * 120), Math.floor((ang + Math.PI) * 3)];
      const cu = u * 120 - cell[0] - .5, ca = (ang + Math.PI) * 3 - cell[1] - .5, cr = F.noise3(cell[0] * 1.7, cell[1] * 1.3, 0, 5);
      if (key === 'a' && cr > .72 && cu * cu + ca * ca < .03 + (cr - .72) * .3) return { c: D.star, a: .1, sp: .5, gl: .6, ty: 0, st: 0 };            // stars
      if (key === 'b') { const crack = Math.abs(Math.sin(u * 140 + Math.sin(ang * 2) * 2.2)) < .06 || Math.abs(Math.sin(ang * 4 + u * 30)) < .04; if (crack) return { c: D.glow, a: .12, sp: .4, gl: .4, ty: 0, st: 0 }; }
      if (key === 'c') { // constellations: bright points joined by faint lines
        for (const [su, sa] of STARS) { const du = (u - su) * 120, da = Math.atan2(Math.sin(ang - sa), Math.cos(ang - sa)) * 6; if (du * du + da * da < .5) return { c: D.star, a: .06, sp: .5, gl: .6, ty: 0, st: 0 }; }
        if (Math.abs(Math.sin(u * 70 + ang * 2)) < .03 && fine > .45) return { c: mixc(c, D.star, .7), a: .5, ty: 0, st: 0 };
      }
      return { c, sp: .55, gl: .65, ty: 7, st: s.bone === B.head ? .5 : .9 };
    }
    if (tag === 'fin' || tag === 'finSpine') { const t = s.t === undefined ? .5 : s.t; let c = mixc(mul(D.fin, .45), D.fin, t); if (tag === 'finSpine') c = mul(c, .7);
      if (key === 'c') return { c, sp: 1, gl: .85, ty: 8, st: .3 };
      return { c, a: tag === 'fin' ? lerp(1, .55, t) : 1, sp: .5, gl: .7, ty: 6, st: .5 }; }
    if (tag === 'tendril') { const t = clamp(len(sub(p, s.root)) / s.L, 0, 1); return { c: mixc(D.skinDark, D.glow, t), a: 1 - t * .8, sp: .4, gl: .5, ty: 3, st: .5 }; }
    if (tag === 'horn') return { c: mixc(mul(D.fin, .4), [.86, .84, .9], clamp(len(sub(p, s.root)) / s.L, 0, 1)), sp: .6, gl: .7, ty: 4, st: .7 };
    if (tag === 'tooth') return { c: mixc([.7, .66, .6], [.95, .94, .9], clamp(len(sub(p, s.root)) / s.L, 0, 1)), sp: .6, gl: .7, ty: 4, st: .3 };
    if (tag === 'barbel') return { c: mixc(D.skin, D.glow, clamp(len(sub(p, s.root)) / s.L, 0, 1)), a: key === 'b' ? .6 : 1, sp: .4, gl: .5, ty: 3, st: .4 };
    if (tag === 'eye') { const q = sub(p, s.c), slit = Math.abs(q[2]) < .18 && Math.abs(q[1]) < .7; return { c: slit ? [.02, .02, .03] : mixc(mul(D.glow, .6), [1, 1, 1], clamp(1 - Math.abs(q[1]), 0, .7)), a: slit ? 1 : .04, sp: 1, gl: 1, ty: 0, st: 0 }; }
    if (tag === 'moon') { if (key === 'b') return { c: [.02, .015, .03], sp: .3, gl: .4, ty: 5, st: .4 }; const r = len(sub(p, s.c)); return { c: mixc(mul(D.moon, .6), D.moon, clamp((r - 4.4) * 1.3 + fine * .3, 0, 1)), a: key === 'c' ? .35 : .55, sp: .2, gl: .3, ty: 5, st: 1 }; }
    if (tag === 'corona' || tag === 'star') return { c: D.glow, a: .05, sp: .5, gl: .5, ty: 0, st: 0 };
    return null;
  };
}

// the Sovereign's serpent clips suit the Moon-Eater's spine chain as well (same bone layout)
function clips() {
  const sov = require('./sovereign');
  return sov.clipsFor(Math.floor(RISE * NSPINE), NSPINE, B);
}

function build(variant, { lod = 0 } = {}) {
  const D = Object.assign({}, DESIGN[variant]), t0 = Date.now(); D.colors = { skin: D.skin, skinDark: D.skinDark, glow: D.glow, horn: [.86, .84, .9] };
  const bod = body(D); bod.build(4); const fin = fins(D); fin.build(3); const fine = details(D); fine.build(2.5);
  const R = lod ? [1.2, .9, .45] : [.52, .38, .2];
  const { parts, log } = K.finish(D, [['body', bod, R[0], 2.6], ['fins', fin, R[1], .6], ['detail', fine, R[2], .5]], custom(D));
  log.push((Date.now() - t0) + ' ms');
  return { parts, bones: BONES, clips: lod ? null : clips(), log, design: D };
}

module.exports = { build, DESIGN, BONES, B };
