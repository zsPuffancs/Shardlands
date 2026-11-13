'use strict';
// Feathered Sovereign, World Boss of the Ember Wastes and the volcanic regions: a colossal feathered serpent.
//   A fiery    crimson scales with a gold belly, turquoise and gold plumes, ember eyes and a glowing throat
//   B ash      grey-black scales flecked with embers, charcoal plumes, a smouldering throat (smoke in the effects)
//   C molten   obsidian scales split by glowing seams, plumes burning from orange to white at the tips
// The body lies coiled on the ground and rises in an S to a feather-ruffed head; wings of individual feathers open
// from the rising body. A 28-bone serpent rig (spine chain, head, jaw, crest, two wings). Units match the old model
// (top ~88, facing +z, coil on y = 0).
const K = require('./kit');
const { F, mixc, both } = K;
const { roundCone: RC, ellipsoid: EL, Sculpt, norm, add, mul, sub, len, cross, dot, clamp, lerp, rng, qAxis, qMul } = F;

// ---------------- the body's path ----------------
const CTRL = [[3.2, 1.6, -4], [8.4, 3, -3], [12, 4.4, -9], [8.4, 5.6, -15.6], [-1.6, 6.4, -18.4], [-11.6, 6.8, -14.4], [-15.6, 7.2, -5], [-13, 7.4, 5], [-5, 7.6, 10.4], [4.4, 8.4, 9],
  [8.4, 12, 3], [6.6, 20, -2.4], [1.4, 31, -4.2], [-2, 42, -.6], [-.6, 51.6, 5.2], [.6, 58.6, 11], [0, 62.6, 16.4], [0, 64.2, 20.6]];
const cr = (p0, p1, p2, p3, t) => [0, 1, 2].map(k => .5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t));
const PATH = (() => { const out = []; for (let i = 0; i < CTRL.length - 1; i++) for (let s = 0; s < 8; s++) out.push(cr(CTRL[Math.max(0, i - 1)], CTRL[i], CTRL[i + 1], CTRL[Math.min(CTRL.length - 1, i + 2)], s / 8)); out.push(CTRL[CTRL.length - 1]); return out; })();
const ARC = (() => { const a = [0]; for (let i = 1; i < PATH.length; i++) a.push(a[i - 1] + len(sub(PATH[i], PATH[i - 1]))); return a.map(v => v / a[a.length - 1]); })();
const at = u => { let i = 1; while (i < ARC.length - 1 && ARC[i] < u) i++; const t = (u - ARC[i - 1]) / Math.max(1e-6, ARC[i] - ARC[i - 1]); return add(PATH[i - 1], mul(sub(PATH[i], PATH[i - 1]), clamp(t, 0, 1))); };
const tangent = u => norm(sub(at(Math.min(1, u + .004)), at(Math.max(0, u - .004))));
const radius = u => (u < .32 ? .8 + 8.8 * Math.sin(Math.min(1, u / .32) * Math.PI / 2) : 9.6 - (u - .32) / .68 * 3.6);
const RISE = .55; // where the body leaves the coil

// ---------------- skeleton ----------------
const NSPINE = 22, HEAD = [0, 66, 24.4];
const BONES = []; for (let i = 0; i < NSPINE; i++) BONES.push({ name: 'spine' + i, parent: i - 1, pos: at(i / NSPINE) });
BONES.push({ name: 'head', parent: NSPINE - 1, pos: at(1) }, { name: 'jaw', parent: NSPINE, pos: [0, 62.4, 26.4] }, { name: 'crest', parent: NSPINE, pos: [0, 71, 22] });
const WING_U = .76, WING_BONE = Math.floor(WING_U * NSPINE), WP = at(WING_U);
BONES.push({ name: 'wingL', parent: WING_BONE, pos: add(WP, [5, 1, -2]) }, { name: 'wingR', parent: WING_BONE, pos: add(WP, [-5, 1, -2]) }, { name: 'tailPlume', parent: 0, pos: at(0) });
const B = Object.fromEntries(BONES.map((b, i) => [b.name, i]));
const boneAtU = u => Math.min(NSPINE - 1, Math.floor(u * NSPINE));

const DESIGN = [
  { key: 'a', name: 'fiery', seed: 801, scale: [.62, .1, .07], scaleDark: [.3, .04, .03], belly: [.95, .72, .3], plumeA: [.08, .72, .66], plumeB: [.96, .76, .2], eye: [1, .7, .15], glow: [1, .55, .12], rim: [.14, .05, .02] },
  { key: 'b', name: 'ash', seed: 802, scale: [.2, .19, .19], scaleDark: [.07, .065, .065], belly: [.45, .41, .37], plumeA: [.15, .14, .14], plumeB: [.34, .3, .27], eye: [1, .5, .12], glow: [1, .42, .1], rim: [.08, .05, .04] },
  { key: 'c', name: 'molten', seed: 803, scale: [.07, .06, .07], scaleDark: [.02, .02, .025], belly: [.24, .1, .05], plumeA: [1, .42, .06], plumeB: [1, .74, .24], eye: [1, .85, .4], glow: [1, .5, .1], rim: [.2, .07, .01] },
];

// a feather: a flattened leaf of vane with a rachis, from root along dir; up = the vane's face normal
let STYLE = { len: 1, ragged: 0, curl: 0, seed: 1 };
function feather(S, root, dir, length, width, face, bone, tag, extra = {}) {
  length *= STYLE.len;
  const d = norm(dir), side = norm(cross(face, d)), nrm = norm(cross(d, side)), rows = [side, d, nrm];
  for (let i = 0; i < 6; i++) { const tm = (i + .5) / 6, w = width * Math.sin(tm * Math.PI * .92 + .2), c = add(root, mul(d, length * tm));
    const curl = STYLE.curl ? mul(side, Math.sin(tm * Math.PI * 1.6 + root[0]) * length * .07 * STYLE.curl) : [0, 0, 0];
    S.add(EL(add(add(c, mul(nrm, -length * .16 * tm * tm)), curl), [w, length / 7.5, .42], rows), Object.assign({ bone, tag, k: .7, root, L: length, fside: side }, extra)); }
  if (STYLE.ragged) { const R = rng(Math.floor(root[0] * 97 + root[1] * 31 + root[2] * 13) + 7); for (let i = 0; i < 3; i++) if (R() < STYLE.ragged) S.sub(EL(add(add(root, mul(d, length * lerp(.55, .95, R()))), mul(side, (R() - .5) * width * 1.6)), [width * .45, length * .08, 1]), { k: .15 }); }
  S.add(RC(root, add(root, mul(d, length * .95)), .3, .08), Object.assign({ bone, tag: tag + 'Shaft', k: .15, root, L: length }, extra));
}

const HSC = 1.42, HPIV = [0, 64, 19];
const headScaled = (S, from) => { for (let i = from; i < S.shapes.length; i++) { const sh = S.shapes[i], sc = F.scaled(sh, HPIV, HSC); Object.assign(sc, { op: sh.op, tag: sh.tag, bone: sh.bone, k: sh.k * HSC, u: sh.u, root: sh.root && hs(sh.root), L: sh.L && sh.L * HSC, c: sh.c && hs(sh.c) }); S.shapes[i] = sc; } };
const hs = p => add(HPIV, mul(sub(p, HPIV), HSC));
function body(D) {
  const S = new Sculpt(), N = 70;
  for (let i = 0; i < N; i++) { const u0 = i / N, u1 = (i + 1) / N, b = boneAtU((u0 + u1) / 2);
    S.add(RC(at(u0), at(u1), radius(u0), radius(u1)), { bone: b, tag: 'scale', k: 1.6, u: (u0 + u1) / 2 });
    // a dorsal ridge of raised scale plates
    if (i % 2 === 0 && u0 > .08) { const t = tangent(u0), up = u0 < RISE ? [0, 1, 0] : norm(sub([0, 0, -1], mul(t, dot([0, 0, -1], t)))), r = radius(u0);
      const base = add(at(u0), mul(up, r * .92));
      if (D.key === 'c') S.add(RC(base, add(base, add(mul(up, r * (.6 + (i % 4) * .15)), mul(t, -r * .35))), r * .2, .05), { bone: b, tag: 'shard', k: .3, u: u0 });
      else { S.add(EL(base, [r * (D.key === 'b' ? .34 : .26), r * .2, r * (D.key === 'b' ? .42 : .34)], frameAlong(t, up)), { bone: b, tag: 'ridge', k: .5, u: u0 }); if (D.key === 'b') S.sub(EL(add(base, mul(up, r * .1)), [r * .05, r * .3, r * .5], frameAlong(t, up)), { k: .05 }); } } }
  // ash: smouldering vents in the coil; molten: drips hanging from the jaw and the belly
  if (D.key === 'b') for (const u of [.1, .2, .3, .42]) { const c0 = at(u), v = add(c0, [0, radius(u) * .9, 0]); S.sub(EL(v, [1.8, 1.4, 1.8]), { k: .5 }); S.add(EL(add(v, [0, -.8, 0]), [1.2, .5, 1.2]), { bone: boneAtU(u), tag: 'vent', k: .2, u }); }
  if (D.key === 'c') for (const u of [.62, .7, .8, .88]) { const t = tangent(u), bd = norm(sub([0, 0, 1], mul(t, dot([0, 0, 1], t)))), p0 = add(at(u), mul(bd, radius(u) * .85)); for (let k = 0; k < 3; k++) S.add(EL(add(p0, [0, -1.2 - k * 1.3, .4 * k]), [.9 - k * .2, 1.1 - k * .2, .9 - k * .2]), { bone: boneAtU(u), tag: 'drip', k: .5, u }); }
  // the head: a broad skull, a tapering snout with a hooked tip, brow plates, an open lower jaw
  const h = HEAD, first = S.shapes.length;
  S.add(EL(h, [5.2, 4.2, 6]), { bone: B.head, tag: 'scale', k: 1.4, u: 1 });
  S.add(RC(add(h, [0, -.2, 2]), add(h, [0, -1.4, 13]), 3.8, 1.8), { bone: B.head, tag: 'scale', k: 1.2, u: 1 }); S.add(EL(add(h, [0, .6, 7]), [2.6, 1.4, 5.4]), { bone: B.head, tag: 'scale', k: 1, u: 1 });
  S.add(RC(add(h, [0, -.2, 12.8]), add(h, [0, -2.2, 14.6]), 1.5, .5), { bone: B.head, tag: 'beak', k: .6, u: 1 });
  both(s => { S.add(EL(add(h, [s * 2.9, 2.2, 4.6]), [1.6, .55, 3.8]), { bone: B.head, tag: 'brow', k: .9 }); S.sub(EL(add(h, [s * 3.2, 1.1, 5.2]), [1.15, .9, 1.2]), { k: .3 });
    S.sub(EL(add(h, [s * .9, .1, 11.6]), [.4, .35, .5]), { k: .15 }); });
  const J = p => { const o = add(h, [0, -2.4, -1]), q = sub(p, o), a = .26; return add(o, [q[0], q[1] * Math.cos(a) - q[2] * Math.sin(a), q[1] * Math.sin(a) + q[2] * Math.cos(a)]); };
  S.add(RC(J(add(h, [0, -3, 1])), J(add(h, [0, -3.5, 10.6])), 2.7, 1.3), { bone: B.jaw, tag: 'belly', k: .9, u: 1 });
  S.sub(RC(add(h, [0, -2.5, 3]), add(h, [0, -2.9, 12.4]), 1.6, .8), { k: .5 });
  headScaled(S, first);
  return S;
}
function frameAlong(t, up) { const y = norm(t), x = norm(cross(up, y)), z = cross(y, x); return [x, y, z]; }

// plumes: a ruff behind the head, a crest, wings, back tufts and a tail fan
function plumage(D) {
  const S = new Sculpt(), R = rng(D.seed), h = HEAD;
  STYLE = D.key === 'b' ? { len: .78, ragged: .7, curl: 0 } : D.key === 'c' ? { len: 1.18, ragged: 0, curl: 1 } : { len: 1, ragged: 0, curl: 0 };
  // ruff: two rings of long feathers radiating behind the head
  for (const [ring, n, L, back] of [[0, 22, 15, -3], [1, 16, 10, -1]]) for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, out = [Math.cos(a), Math.sin(a) * .9, 0], base = hs(add(add(h, [0, -1.4, back]), mul(out, 4.6))), dir = norm(add(out, [0, .1, -.55 - ring * .2]));
    feather(S, base, dir, L * 1.25 * lerp(.85, 1.15, R()), 2 - ring * .3, [0, 0, 1], B.head, ring ? 'plumeB' : (i % 2 ? 'plumeA' : 'plumeB'), { k: .3 }); }
  // crest: tall feathers sweeping up and back from the brow
  for (let i = 0; i < 7; i++) { const a = (i / 6 - .5) * 1.4, base = hs(add(h, [Math.sin(a) * 3, 3.4, 1 - Math.abs(a) * 2])); feather(S, base, [Math.sin(a) * .5, 1, -.8], 16 - Math.abs(a) * 5, 1.5, [Math.cos(a) * .2, .4, 1], B.crest, i % 2 ? 'plumeA' : 'plumeB'); }
  // wings: fans of primaries with a row of coverts over their roots
  both(s => { const root = add(WP, [s * 5, 1, -2]), bone = s > 0 ? B.wingL : B.wingR;
    for (let i = 0; i < 9; i++) { const a = (i / 8) * 1.5, dir = norm([s * Math.cos(a * .9 + .1), Math.sin(a * .9 + .1) * 1.1 + .25, -.35 - i * .03]); feather(S, add(root, mul(dir, 2)), dir, 34 - i * 1.6, 3, [0, .3, 1], bone, i % 2 ? 'plumeA' : 'plumeB'); }
    for (let i = 0; i < 7; i++) { const a = (i / 6) * 1.4, dir = norm([s * Math.cos(a * .9 + .15), Math.sin(a * .9 + .15) * 1.1 + .25, -.3]); feather(S, add(root, mul(dir, 1)), dir, 15, 2.3, [0, .3, 1], bone, 'plumeB', { cover: 1 }); }
    S.add(EL(root, [3, 3.4, 4]), { bone, tag: 'scale', k: 1.6, u: WING_U }); });
  // tufts along the back of the rising body
  for (let u = RISE + .03; u < .95; u += .035) { const t = tangent(u), back = norm(sub([0, 0, -1], mul(t, dot([0, 0, -1], t)))), base = add(at(u), mul(back, radius(u) * .8));
    feather(S, base, norm(add(mul(t, -1), mul(back, .6))), 7 + R() * 3, 1.2, back, boneAtU(u), u * 100 % 2 < 1 ? 'plumeA' : 'plumeB'); }
  // a fan of feathers at the tail tip
  for (let i = 0; i < 7; i++) { const a = (i / 6 - .5) * 1.6, t = tangent(.01), dir = norm(add(mul(t, -1), [Math.sin(a) * .8, .5, Math.cos(a) * .3])); feather(S, at(.005), dir, 10, 1.4, [0, 1, 0], B.tailPlume, i % 2 ? 'plumeA' : 'plumeB'); }
  return S;
}

function details(D) {
  const S = new Sculpt(), h = HEAD, J = p => { const o = add(h, [0, -2.4, -1]), q = sub(p, o), a = .26; return add(o, [q[0], q[1] * Math.cos(a) - q[2] * Math.sin(a), q[1] * Math.sin(a) + q[2] * Math.cos(a)]); };
  both(s => {
    S.add(EL(add(h, [s * 3.1, 1.1, 5.3]), [.8, .62, .85]), { bone: B.head, tag: 'eye', k: .1, c: add(h, [s * 3.1, 1.1, 5.3]) });
    const f0 = add(h, [s * 1.5, -2.8, 9.6]); S.add(RC(f0, add(f0, [s * .1, -3.4, .6]), .5, .05), { bone: B.head, tag: 'tooth', k: .08, root: f0, L: 3.4 });   // fangs
    for (let i = 0; i < 4; i++) { const p = add(h, [s * (2.2 - i * .2), -2.8, 4 + i * 1.4]); S.add(RC(p, add(p, [0, -1, .2]), .3, .05), { bone: B.head, tag: 'tooth', k: .05, root: p, L: 1 }); }
    for (let i = 0; i < 4; i++) { const p = J(add(h, [s * (1.8 - i * .15), -3.2, 4.6 + i * 1.4])); S.add(RC(p, add(p, [0, 1, .2]), .3, .05), { bone: B.jaw, tag: 'tooth', k: .05, root: p, L: 1 }); }
  });
  S.add(EL(add(h, [0, -3.4, 5.6]), [2, .6, 3.6]), { bone: B.head, tag: 'throat', k: .4 });                                  // the glowing throat
  headScaled(S, 0);
  return S;
}

function custom(D) {
  return ({ p, n, s, tag, fine, big, evalAll }) => {
    const key = D.key;
    if (tag === 'scale' || tag === 'ridge' || tag === 'brow') {
      const u = s.u === undefined ? 1 : s.u, t = tangent(Math.min(.999, u)), c0 = at(Math.min(1, u)), out = norm(sub(p, c0));
      const bellyDir = u < RISE ? [0, -1, 0] : norm(sub([0, 0, 1], mul(t, dot([0, 0, 1], t)))), belly = dot(out, bellyDir);
      // diamonds down the back, belly plates in bands, seams of fire on the molten one
      const along = u * 260, around = Math.atan2(dot(out, cross(t, bellyDir)), dot(out, bellyDir)) * 4;
      const diamond = Math.abs(((along + around) % 6 + 6) % 6 - 3) + Math.abs(((along - around) % 6 + 6) % 6 - 3) < 2.4;
      let c = mixc(D.scale, D.scaleDark, clamp(.3 + (big - .5) * .8 + (diamond ? .35 : 0), 0, 1)); c = mul(c, .9 + fine * .2);
      if (tag === 'ridge') c = mixc(c, D.plumeB, key === 'b' ? .1 : .35);
      if (belly > .45) { const band = Math.abs(Math.sin(along * .9)) < .18; c = mixc(D.belly, mul(D.belly, .55), band ? .8 : 0); return { c, sp: .35, gl: .5, ty: 3, st: .5 }; }
      if (key === 'c') { const seam = Math.abs(Math.sin(along * .8 + Math.sin(around) * 1.2)) < .1 || Math.abs(Math.sin(around * 1.5 + along * .1)) < .07; if (seam) return { c: mixc(D.glow, [1, .85, .4], fine), a: .15, sp: .5, gl: .5, ty: 0, st: 0 }; }
      if (key === 'b' && fine > .78 && big > .5) return { c: D.glow, a: .3, sp: .3, gl: .4, ty: 0, st: 0 };                          // embers in the ash
      return { c, sp: key === 'c' ? .9 : .5, gl: key === 'c' ? .85 : .6, ty: 7, st: s.bone === B.head ? .55 : 1 };
    }
    if (tag === 'shard') return { c: mixc([.03, .03, .04], [.2, .16, .2], fine), sp: 1, gl: .95, ty: 5, st: .3 };
    if (tag === 'vent' || tag === 'drip') return { c: mixc(D.glow, [1, .85, .4], fine), a: .12, sp: .5, gl: .5, ty: 0, st: 0 };
    if (tag === 'beak') return { c: mixc([.85, .7, .3], [.3, .2, .08], clamp(1 - len(sub(p, hs(add(HEAD, [0, -1.4, 13])))) / 3, 0, 1)), sp: .7, gl: .75, ty: 4, st: .4 };
    if (tag === 'belly') return { c: mixc(D.belly, mul(D.belly, .6), fine), sp: .35, gl: .5, ty: 3, st: .5 };
    if (tag === 'plumeA' || tag === 'plumeB') {
      const t = clamp(len(sub(p, s.root)) / s.L, 0, 1), col = D[tag], barb = Math.abs(Math.sin(dot(sub(p, s.root), s.fside || [1, 0, 0]) * 3 + t * 22)) < .25;
      let c = mixc(mul(col, .55), col, Math.pow(t, .6)); c = mul(c, barb ? .82 : 1);
      if (key === 'c') { c = mixc(c, [1, .95, .7], Math.pow(t, 3) * .9); return { c, a: 1 - Math.pow(t, 2) * .8, sp: .4, gl: .5, ty: 6, st: .5 }; }
      if (key === 'a' && t > .82) c = mixc(c, [.98, .9, .55], (t - .82) * 3);
      return { c, sp: key === 'a' ? .6 : .2, gl: key === 'a' ? .7 : .35, ty: 6, st: .5 };
    }
    if (tag === 'plumeAShaft' || tag === 'plumeBShaft') return { c: key === 'c' ? [1, .8, .4] : [.9, .86, .74], a: key === 'c' ? .3 : 1, sp: .5, gl: .6, ty: 4, st: .3 };
    if (tag === 'eye') { const q = sub(p, s.c), slit = Math.abs(q[2]) < .16 * HSC && Math.abs(q[1]) < .7 * HSC; return { c: slit ? mul(D.eye, .15) : mixc(mul(D.eye, .6), mixc(D.eye, [1, 1, .9], .6), clamp(1.2 - Math.abs(q[1]) / HSC, 0, 1)), a: slit ? .9 : .04, sp: 1, gl: 1, ty: 0, st: 0 }; }
    if (tag === 'throat') return { c: D.glow, a: .1, sp: .5, gl: .5, ty: 0, st: 0 };
    if (tag === 'tooth') return { c: mixc([.7, .64, .5], [.96, .93, .84], clamp(len(sub(p, s.root)) / s.L, 0, 1)), sp: .5, gl: .6, ty: 4, st: .3 };
    return null;
  };
}

// ---------------- clips ----------------
const E = (x = 0, y = 0, z = 0) => qMul(qMul(qAxis([0, 1, 0], y), qAxis([1, 0, 0], x)), qAxis([0, 0, 1], z));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const RISE_BONE = Math.floor(RISE * NSPINE);
function clips() {
  const sway = (rot, ph, amp, bend = 0) => { for (let i = RISE_BONE; i < NSPINE; i++) { const k = (i - RISE_BONE) / (NSPINE - RISE_BONE); rot[i] = E(bend * (k - .3) + Math.sin(ph * 2 + i * .6) * .015, Math.sin(ph + i * .55) * amp * (.4 + k), 0); } };
  const wings = (rot, a, flap) => { rot[B.wingL] = E(0, 0, -a - flap); rot[B.wingR] = E(0, 0, a + flap); };
  const TAU = Math.PI * 2;
  return {
    Idle: { dur: 4, track: t => { const ph = t / 4 * TAU, rot = {}; sway(rot, ph, .035); rot[B.head] = E(Math.sin(ph * 2) * .05, -Math.sin(ph) * .12); rot[B.jaw] = E(.04 + Math.max(0, Math.sin(ph * 2 + 1)) * .08); rot[B.crest] = E(Math.sin(ph * 2 + .5) * .06); wings(rot, .05, Math.sin(ph * 2) * .1); rot[B.tailPlume] = E(0, Math.sin(ph * 3) * .15); return { rot }; } },
    Run: { dur: 1, track: t => { const ph = t * TAU, rot = {}; for (let i = 1; i < RISE_BONE; i++) rot[i] = E(0, Math.sin(ph + i * .8) * .06); sway(rot, ph, .07, .02); rot[B.head] = E(.06, -Math.sin(ph) * .1); wings(rot, -.15, Math.sin(ph * 2) * .3); return { rot, root: [0, Math.abs(Math.sin(ph)) * .6, 0] }; } },
    Walk: { dur: 1.4, track: t => { const ph = t / 1.4 * TAU, rot = {}; for (let i = 1; i < RISE_BONE; i++) rot[i] = E(0, Math.sin(ph + i * .8) * .04); sway(rot, ph, .05); wings(rot, 0, Math.sin(ph * 2) * .15); return { rot }; } },
    // a strike: draw back, lunge forward with the jaws open
    Attack: { dur: .62, track: t => { const u = t / .62, rot = {}, back = smooth(0, .4, u) * (1 - smooth(.4, .55, u)), hit = smooth(.4, .55, u) * (1 - smooth(.7, 1, u));
      for (let i = RISE_BONE; i < NSPINE; i++) { const k = (i - RISE_BONE) / (NSPINE - RISE_BONE); rot[i] = E((-back * .07 + hit * .11) * (.5 + k), 0); }
      rot[B.head] = E(-back * .3 + hit * .25); rot[B.jaw] = E(back * .5 + hit * .2); wings(rot, back * .5, 0); return { rot }; } },
    // the roar: rearing high, wings flung open, crest raised
    Attack2: { dur: 1.2, track: t => { const u = t / 1.2, rot = {}, h = smooth(0, .25, u) * (1 - smooth(.8, 1, u));
      for (let i = RISE_BONE; i < NSPINE; i++) rot[i] = E(-h * .05, Math.sin(u * 30 + i) * .01 * h); rot[B.head] = E(-h * .45); rot[B.jaw] = E(h * .6); rot[B.crest] = E(-h * .3); wings(rot, h * .9, Math.sin(u * 24) * .1 * h); return { rot }; } },
    RecieveHit: { dur: .4, track: t => { const k = Math.sin(t / .4 * Math.PI), rot = {}; for (let i = RISE_BONE; i < NSPINE; i++) rot[i] = E(-k * .03, k * .02); rot[B.head] = E(-k * .25, k * .2); rot[B.jaw] = E(k * .3); wings(rot, k * .3, 0); return { rot }; } },
    // the rising body sinks and falls forward onto the coil
    Death: { dur: 1.8, track: t => { const u = smooth(0, 1, t / 1.8), rot = {}; for (let i = RISE_BONE; i < NSPINE; i++) { const k = (i - RISE_BONE) / (NSPINE - RISE_BONE); rot[i] = E(u * .16 * (1 - k * .4), u * .05); }
      rot[B.head] = E(u * .3, 0, u * .5); rot[B.jaw] = E(u * .4); wings(rot, -u * .6, 0); rot[B.crest] = E(u * .4); return { rot }; } },
  };
}

function build(variant, { lod = 0 } = {}) {
  const D = Object.assign({}, DESIGN[variant], { colors: {} }), t0 = Date.now();
  const bod = body(D); bod.build(4); const plume = plumage(D); plume.build(3); const fine = details(D); fine.build(2);
  const R = lod ? [1.15, D.key === 'c' ? 1.1 : .95, .4] : [.5, D.key === 'c' ? .5 : .42, .16];
  const { parts, log } = K.finish(D, [['body', bod, R[0], 2.6], ['plumage', plume, R[1], .6], ['detail', fine, R[2], .5]], custom(D));
  log.push((Date.now() - t0) + ' ms');
  return { parts, bones: BONES, clips: lod ? null : clips(), log, design: D };
}

module.exports = { build, DESIGN, BONES, B };
