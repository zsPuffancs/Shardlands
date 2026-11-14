'use strict';
// Shared building blocks for the humanoid World Bosses (Frostbound Jarl, Ossuary King, Reaper): a heroic body, a
// skeleton, locks of hair and fur, cloth sheets with folds, ice crystals, a weapon frame, a material library, and the
// mesh / skin / paint step. Each boss module composes these and adds its own head, armour and weapon.
const F = require('./forge');
const H = require('./humanoid');
const { roundCone: RC, ellipsoid: EL, torus: TO, box: BX, Sculpt, mesh, skinWeights, rng, fbm, noise3, clamp, lerp, norm, sub, add, mul, len, cross, dot } = F;
const { ao, smooth, mixc, rotZ, rotX } = require('./varcolac');
const { B } = H;

const both = f => { f(1); f(-1); };
const mulR = (A, Bm) => A.map(r => [0, 1, 2].map(c => r[0] * Bm[0][c] + r[1] * Bm[1][c] + r[2] * Bm[2][c]));
const rotY = a => [[Math.cos(a), 0, -Math.sin(a)], [0, 1, 0], [Math.sin(a), 0, Math.cos(a)]];
// rows: two axes perpendicular to d, and d itself as the middle row (local y = d)
const frameOf = d => { const a = Math.abs(d[0]) < .9 ? [1, 0, 0] : [0, 0, 1], x = norm(cross(a, d)), z = cross(d, x); return [x, d, z]; };
const LR = s => (s > 0 ? 'L' : 'R');

// the standard pose of the humanoid bosses (matches oni.js): hips 40, shoulders 65, head ~75, arms hanging
const POS = {
  root: [0, 40, 0], spine: [0, 49, .5], chest: [0, 59, .5], neck: [0, 69, 1], head: [0, 74.5, 1.5], jaw: [0, 72.6, 3.6],
  clavL: [4, 67, 0], uarmL: [13, 65, 0], farmL: [14.6, 50, 1.4], handL: [15.4, 37, 3.2],
  clavR: [-4, 67, 0], uarmR: [-13, 65, 0], farmR: [-14.6, 50, 1.4], handR: [-15.4, 37, 3.2], weapon: [-15.4, 35, 4],
  thighL: [6.4, 40, 0], shinL: [7, 22, 1.2], footL: [7, 4.2, 0], thighR: [-6.4, 40, 0], shinR: [-7, 22, 1.2], footR: [-7, 4.2, 0],
  skirtF: [0, 41, 6], skirtB: [0, 41, -6], skirtL: [8, 41, 0], skirtR: [-8, 41, 0], back: [0, 62, -6], hair: [0, 79, -2],
};
const GRIP = [-15.4, 35, 4.2];

// ---------------- a heroic body (torso, arms with hands, legs) ----------------
// m: muscle scale; the right hand closes around the weapon grip, the left hangs open
function body(S, { m = 1.1, tag = 'skin', legs = true, hands = true } = {}) {
  const A = (shape, o) => S.add(shape, Object.assign({ tag }, o));
  A(EL([0, 41.5, 0], [9.2, 6.4, 6.4]), { bone: B.root, k: 2.5 });
  A(EL([0, 49, 1.2], [8.4 * m, 7, 6]), { bone: B.spine, k: 2.5 });
  A(EL([0, 59, .6], [11.8 * m, 8.4, 7.2]), { bone: B.chest, k: 2.6 });
  both(s => A(EL([s * 5.2, 60.5, 4.8], [5.6 * m, 4.4, 3.2]), { bone: B.chest, k: 1.4 }));
  both(s => A(EL([s * 8.6, 55, -1], [4.2 * m, 7.4, 5.2]), { bone: B.chest, k: 1.8 }));
  A(EL([0, 66.5, -1], [7.6 * m, 3.8, 4.4]), { bone: B.chest, k: 2 });
  A(RC([0, 66, 0], [0, 72.5, 1.5], 4.6, 3.9), { bone: B.neck, k: 1.6 });
  both(s => { const L = LR(s), f = p => [s * p[0], p[1], p[2]];
    A(EL(f([12.4, 65, 0]), [4.8 * m, 4.6, 5]), { bone: B['uarm' + L], k: 1.8 });
    A(RC(f([13, 64, 0]), f([14.6, 50, 1.4]), 4.4 * m, 3.4), { bone: B['uarm' + L], k: 1.5 });
    A(EL(f([13.8, 57, 2.4]), [3 * m, 4.6, 3]), { bone: B['uarm' + L], k: 1.2 });
    A(RC(f([14.6, 50, 1.4]), f([15.4, 38.4, 3.2]), 3.4, 2.5), { bone: B['farm' + L], k: 1.2 });
    A(EL(f([15, 45.5, 2.4]), [2.8 * m, 4, 2.6]), { bone: B['farm' + L], k: 1 });
    if (hands) hand(S, s, tag);
    if (legs) {
      A(RC(f([6.4, 40, 0]), f([7, 22, 1.2]), 5.8 * m, 4), { bone: B['thigh' + L], k: 2 });
      A(EL(f([6.8, 31, 2.6]), [4.4 * m, 7, 3.6]), { bone: B['thigh' + L], k: 1.4 });
      A(RC(f([7, 22, 1.2]), f([7, 5, 0]), 3.9, 2.6), { bone: B['shin' + L], k: 1.4 });
      A(EL(f([7, 16, -1]), [3.2 * m, 5.6, 3]), { bone: B['shin' + L], k: 1.1 });
      A(EL(f([7, 2.4, 2.8]), [2.8, 2.4, 5.2]), { bone: B['foot' + L], k: 1 });
    }
  });
}
// a hand: palm, four two-segment fingers (curled round the grip on the right), a thumb; r scales the fingers
function hand(S, s, tag, { r = 1, bony = false } = {}) {
  const L = LR(s), f = p => [s * p[0], p[1], p[2]], bone = B['hand' + L], A = (shape, k) => S.add(shape, { bone, tag, k });
  if (!bony) A(EL(f([15.5, 34.6, 3.6]), [1.8, 2.8, 2.4]), .8); else A(EL(f([15.5, 35, 3.6]), [1.1, 1.8, 1.7]), .5);
  for (let i = 0; i < 4; i++) { const z = 2.1 + i * 1.05, k0 = f([15.5 + s * .6, 32.4, z]);
    if (s < 0) { const k1 = f([15.5 - .9, 31.2, z + .2]), k2 = f([15.5 - 1.6, 32.6, z]); A(RC(k0, k1, .62 * r, .55 * r), .3); A(RC(k1, k2, .55 * r, .48 * r), .25); }
    else { const k1 = f([15.9, 29.6, z + .5]), k2 = f([15.9, 27.6, z + 1.3]); A(RC(k0, k1, .6 * r, .52 * r), .3); A(RC(k1, k2, .52 * r, .42 * r), .25); if (bony) for (const k of [k1, k2]) A(EL(k, [.62 * r, .5 * r, .62 * r]), .15); } }
  A(RC(f([15 - s * .2, 34, 5.4]), f([14.6, 32.4, 6.4]), .75 * r, .6 * r), .3);
}

// ---------------- a skeleton (Ossuary King, Reaper) ----------------
// long bones with knobbed ends, a ribcage, a spine, a pelvis; tag 'bone'. parts: { ribs, spine, pelvis, arms, legs }
function boneLimb(S, a, b, r, bone, o = {}) { S.add(RC(a, b, r, r * .85), Object.assign({ bone, tag: 'bone', k: .4 }, o)); for (const [p, k] of [[a, 1.45], [b, 1.35]]) S.add(EL(p, [r * k, r * k * .9, r * k]), Object.assign({ bone, tag: 'bone', k: .35 }, o)); }
function skeleton(S, { ribs = true, spine = true, pelvis = true, arms = true, legs = true, scale = 1, thick = 1, limb } = {}) {
  const lt = limb === undefined ? thick : limb; // limb bone thickness (defaults to the body's)
  const o = (bone, extra) => Object.assign({ bone, tag: 'bone', k: .3 }, extra);
  if (spine) for (let i = 0; i < 14; i++) { const y = 42 + i * 2.05, z = -2.6 + Math.sin(i / 13 * Math.PI) * 1.4, bone = i < 4 ? B.root : i < 8 ? B.spine : B.chest;
    S.add(EL([0, y, z], [1.5 * thick, .8 * thick, 1.3 * thick]), o(bone)); S.add(RC([0, y, z - 1], [0, y - .8, z - 2.6], .45, .25), o(bone)); both(s => S.add(RC([0, y, z - .4], [s * 1.9, y + .2, z - .8], .35, .25), o(bone))); }
  if (ribs) { for (let i = 0; i < 9; i++) both(s => { const y = 63 - i * 2, w = (9.2 - Math.abs(i - 3) * .45) * scale, d = 6.4 * scale; let prev = [s * 1, y, -2.4];
      for (let k = 1; k <= 8; k++) { const a = k / 8 * Math.PI * .95, p = [s * Math.sin(a) * w, y - k * .35 - (i > 6 ? 1 : 0), -2.4 + (1 - Math.cos(a)) * d * .5 + 1]; S.add(RC(prev, p, .55 * thick, .5 * thick), o(B.chest, { k: .2 })); prev = p; } });
    S.add(RC([0, 63.5, 4.6], [0, 50.5, 4.2], .9, .7), o(B.chest)); S.add(EL([0, 64.5, 3.8], [1.8, 1.2, 1]), o(B.chest));
    both(s => S.add(RC([s * 1.5, 66, 2.4], [s * 9, 66.5, -1], .7, .6), o(B.chest)));                                         // collarbones
    both(s => S.add(EL([s * 7.5, 62, -4.6], [3.2, 4.6, .8], rotZ(s * .25)), o(B.chest))); }                                 // shoulder blades
  if (pelvis) { both(s => S.add(EL([s * 5.6, 43, -.6], [4, 3.6, 2], mulR(rotZ(s * -.5), rotY(s * .4))), o(B.root))); S.add(EL([0, 39.5, 1.6], [3.6, 1.4, 1.4]), o(B.root));
    both(s => S.sub(EL([s * 5.4, 42.6, 1.4], [1.6, 1.4, 3]), { k: .2 })); }
  both(s => { const L = LR(s), f = p => [s * p[0], p[1], p[2]];
    if (arms) { S.add(EL(f([11.4, 65.4, -.4]), [2.2, 1.8, 2.2]), o(B['uarm' + L])); boneLimb(S, f([13, 64.4, 0]), f([14.6, 50, 1.4]), 1.15 * lt, B['uarm' + L]); boneLimb(S, f([14.6, 50, 1.4]), f([15.4, 38.4, 3.2]), .85 * lt, B['farm' + L]);
      S.add(RC(f([14.4, 49.4, 2.4]), f([15.6, 38.6, 4]), .6, .5), o(B['farm' + L])); hand(S, s, 'bone', { r: .82, bony: true }); }
    if (legs) { boneLimb(S, f([6.4, 41, 0]), f([7, 22, 1.2]), 1.5 * lt, B['thigh' + L]); boneLimb(S, f([7, 22, 1.2]), f([7, 5, 0]), 1.2 * lt, B['shin' + L]); S.add(RC(f([8.4, 21, .4]), f([8.2, 5.6, -.6]), .55, .45), o(B['shin' + L]));
      S.add(EL(f([7, 2, 2.4]), [1.9, 1.4, 4.2]), o(B['foot' + L])); for (let i = 0; i < 4; i++) S.add(RC(f([6 + i * .8, 1.6, 5.4]), f([5.8 + i * .9, .8, 8.4]), .42, .32), o(B['foot' + L], { k: .15 })); }
  });
}
// a skull: cranium, brow, deep sockets, nasal cavity, cheekbones, teeth and a jaw. c = centre of the cranium
function skull(S, c, { r = 5.4, jawOpen = .12, tag = 'bone', bone = B.head, jawBone = B.jaw } = {}) {
  const o = (b, extra) => Object.assign({ bone: b, tag, k: .6 }, extra), at = (x, y, z) => [c[0] + x * r, c[1] + y * r, c[2] + z * r];
  S.add(EL(at(0, .15, -.1), [r, r * 1.05, r * 1.15]), o(bone, { k: 1 }));
  S.add(EL(at(0, -.45, .55), [r * .72, r * .5, r * .5]), o(bone, { k: .8 }));                                                // maxilla
  both(s => S.add(EL(at(s * .62, -.32, .55), [r * .3, r * .22, r * .3]), o(bone, { k: .5 })));                              // cheekbones
  S.add(EL(at(0, .3, .78), [r * .8, r * .2, r * .26]), o(bone, { k: .4 }));                                                // brow
  both(s => S.sub(EL(at(s * .38, .02, .95), [r * .28, r * .26, r * .32]), { k: .25 }));                                    // sockets
  S.sub(EL(at(0, -.3, 1.02), [r * .1, r * .17, r * .2]), { k: .15 });                                                       // nasal cavity
  both(s => S.sub(EL(at(s * .95, -.1, -.1), [r * .12, r * .25, r * .2]), { k: .2 }));                                       // temples
  const J = p => { const o0 = at(0, -.5, -.2), q = sub(p, o0); return add(o0, [q[0], q[1] * Math.cos(jawOpen) - q[2] * Math.sin(jawOpen), q[1] * Math.sin(jawOpen) + q[2] * Math.cos(jawOpen)]); };
  S.add(EL(J(at(0, -.92, .45)), [r * .6, r * .2, r * .5]), o(jawBone, { k: .5 })); both(s => S.add(RC(J(at(s * .55, -.85, .3)), J(at(s * .62, -.4, -.25)), r * .14, r * .12), o(jawBone, { k: .3 })));
  for (let i = 0; i < 10; i++) { const a = (i / 9 - .5) * 2.2, x = Math.sin(a) * r * .5, z = Math.cos(a) * r * .45 + r * .55;
    S.add(EL([c[0] + x, c[1] - r * .7, c[2] + z * .95], [r * .055, r * .09, r * .05]), o(bone, { tag: 'tooth', k: .05 }));
    S.add(EL(J([c[0] + x * .95, c[1] - r * .78, c[2] + z * .92]), [r * .05, r * .08, r * .05]), o(jawBone, { tag: 'tooth', k: .05 })); }
  return { eyes: [at(.38, .02, .82), at(-.38, .02, .82)] };
}

// ---------------- hair, beard and fur locks on a coarse sample of a sculpt ----------------
// pick(p, n, shape) -> null or { len: [a, b], r, flow, up, bone, tag }
function locks(S, seed, pick, h = .95) {
  const R = rng(seed), m = mesh(S, h); let n = 0;
  m.pos.forEach((p, i) => {
    const nn = m.normals[i], near = S.near(p, 2); if (!near.length) return; const spec = pick(p, nn, near[0].s, R); if (!spec || R() > (spec.chance === undefined ? 1 : spec.chance)) return;
    const l = lerp(spec.len[0], spec.len[1], R()), jit = [R() - .5, R() - .5, R() - .5], d = norm(add(add(mul(nn, spec.up || .25), mul(norm(spec.flow || [0, -1, -.4]), .8)), mul(jit, spec.jitter || .5)));
    const droop = spec.droop === undefined ? .25 : spec.droop, root = add(p, mul(nn, -.4)), p1 = add(add(root, mul(d, l * .38)), [0, -l * droop * .2, 0]), p2 = add(add(p1, mul(d, l * .34)), [0, -l * droop * .6, 0]), p3 = add(add(p2, mul(d, l * .28)), [0, -l * droop, 0]);
    const r = spec.r || 1, o = { bone: spec.bone === undefined ? near[0].s.bone : spec.bone, tag: spec.tag || 'hair', k: .4, root, L: l, base: near[0].s.tag };
    S.add(RC(root, p1, r, r * .75), o); S.add(RC(p1, p2, r * .75, r * .45), Object.assign({}, o, { k: .3 })); S.add(RC(p2, p3, r * .45, .1), Object.assign({}, o, { k: .2 })); n++;
  });
  return n;
}

// ---------------- cloth: a hanging sheet with folds and an optional ragged hem ----------------
// top: points along the top edge (left to right), drop: how far it hangs, depth: thickness; folds deepen downwards.
function sheet(S, top, drop, { bone, tag = 'cloth', thick = .7, folds = 6, foldDepth = 1.2, flare = .25, rag = 0, seed = 1, out = [0, 0, -1], boneOf } = {}) {
  const R = rng(seed), rows = Math.max(3, Math.round(drop / 3.2)), o = (b, extra) => Object.assign({ bone: b, tag, k: .9 }, extra);
  for (let i = 0; i < top.length; i++) for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1), p = top[i], next = top[Math.min(top.length - 1, i + 1)], prev = top[Math.max(0, i - 1)], along = norm(sub(next, prev)), outward = norm(out);
    const wave = Math.sin(i / Math.max(1, top.length - 1) * folds * Math.PI) * foldDepth * (.3 + t), c = add(add(p, [0, -drop * t, 0]), add(mul(outward, wave + flare * drop * t * t), mul(along, (i - (top.length - 1) / 2) * flare * t * .4)));
    if (rag && t > .7 && R() < rag * (t - .6)) continue;                                                                 // ragged, torn hem
    const w = len(sub(next, prev)) * .5 + .4; S.add(EL(c, [w * .62 + .7, drop / rows * 1.05, thick], frameRows(along, [0, 1, 0])), o(boneOf ? boneOf(t, i) : bone, { k: 1.5 }));
  }
}
// rows: x along 'along', y up, z = normal
function frameRows(along, up) { const x = norm(along), z = norm(cross(x, up)), y = cross(z, x); return [x, y, z]; }

// ---------------- an ice crystal cluster ----------------
function crystals(S, base, dir, { count = 5, length = 6, r = .9, seed = 3, bone, tag = 'ice', spread = .5 } = {}) {
  const R = rng(seed);
  for (let i = 0; i < count; i++) { const d = norm(add(dir, [(R() - .5) * spread * 2, (R() - .5) * spread, (R() - .5) * spread * 2])), l = length * lerp(.5, 1.1, R()), a = add(base, [(R() - .5) * r * 2, 0, (R() - .5) * r * 2]);
    S.add(RC(a, add(a, mul(d, l * .8)), r * lerp(.6, 1, R()), r * .55), { bone, tag, k: .15, root: a, L: l }); S.add(RC(add(a, mul(d, l * .8)), add(a, mul(d, l)), r * .55, .05), { bone, tag, k: .1, root: a, L: l }); }
}

// ---------------- materials ----------------
const T = { FUR_BACK: 1, FUR_DOWN: 2, SKIN: 3, HORN: 4, STONE: 5, CLOTH: 6, SCALE: 7, METAL: 8 };
const tOf = (s, p) => (s.root && s.L ? clamp(len(sub(p, s.root)) / s.L, 0, 1) : .5);
// a material for a shape tag; D.colors supplies the palette (skin, metal, trim, cloth, leather, fur, hair, glow, eye ...)
function material(D, tag, s, p, n, big, fine) {
  const C = D.colors, col = (k, d) => s.color || C[k] || d;
  switch (tag) {
    case 'skin': { const c = mixc(col('skin'), C.skinDark || mul(col('skin'), .55), clamp(.25 + (big - .5) * .8 - n[1] * .15, 0, 1)); return { c: mul(c, .9 + fine * .2), sp: .3, gl: .45, ty: T.SKIN, st: .7 }; }
    case 'bone': { const c = mixc(col('bone', [.82, .78, .66]), mul(col('bone', [.82, .78, .66]), .55), clamp(.2 + (big - .5) * .9 + (1 - n[1]) * .1, 0, 1)); return { c: mul(c, .9 + fine * .15), sp: .35, gl: .5, ty: T.HORN, st: .5 }; }
    case 'tooth': return { c: mixc([.6, .55, .42], [.9, .87, .78], fine), sp: .5, gl: .6, ty: T.HORN, st: .3 };
    case 'metal': return { c: mul(col('metal', [.4, .42, .46]), .85 + fine * .3), sp: 1, gl: .78, ty: T.METAL, st: .45 };
    case 'darkmetal': return { c: mul(col('darkmetal', [.12, .12, .14]), .85 + fine * .3), sp: .9, gl: .7, ty: T.METAL, st: .6 };
    case 'mail': return { c: mul(col('mail', [.3, .31, .34]), .8 + fine * .3), sp: .9, gl: .6, ty: T.SCALE, st: .9 };
    case 'gold': case 'trim': return { c: mixc(mul(col('trim', [.88, .7, .3]), .7), col('trim', [.88, .7, .3]), clamp(.4 + fine * .6, 0, 1)), sp: 1, gl: .85, ty: T.METAL, st: .35 };
    case 'cloth': { const c = col('cloth', [.3, .1, .3]); return { c: mixc(mul(c, .6), c, clamp(.3 + big * .7 + n[1] * .2, 0, 1)), sp: .1, gl: .25, ty: T.CLOTH, st: .9 }; }
    case 'leather': return { c: mixc(col('leather', [.26, .17, .11]), mul(col('leather', [.26, .17, .11]), .6), fine), sp: .35, gl: .45, ty: T.SKIN, st: .7 };
    case 'fur': case 'hair': case 'beard': { const t = tOf(s, p), k = tag === 'fur' ? 'fur' : 'hair', c = col(k, [.5, .45, .4]); return { c: mul(mixc(mul(c, .6), c, Math.pow(t, .8)), .88 + fine * .2), sp: .15, gl: .3, ty: T.FUR_DOWN, st: 1 }; }
    case 'horn': { const t = tOf(s, p), c = col('horn', [.86, .8, .64]); return { c: mixc(mul(c, .45), c, Math.pow(t, .7)), sp: .4, gl: .55, ty: T.HORN, st: .9 }; }
    case 'ice': { const t = tOf(s, p); return { c: mixc([.4, .62, .8], [.86, .96, 1], t * .7 + fine * .3), a: lerp(.75, .45, t), sp: 1, gl: .95, ty: T.STONE, st: .3 }; }
    case 'wood': return { c: mixc([.2, .13, .08], [.34, .23, .14], fine), sp: .2, gl: .35, ty: T.HORN, st: .8 };
    case 'glow': return { c: col('glow', [.5, 1, .6]), a: .05, sp: .5, gl: .5, ty: 0, st: 0 };
    case 'gem': return { c: col('gem', [.6, .1, .2]), a: .5, sp: 1, gl: 1, ty: 0, st: 0 };
    default: return null;
  }
}
// paint every vertex: material by tag, then the boss's own touches (custom), then baked ambient occlusion
function paint(D, S, m, evalAll, custom) {
  const colors = [], mat = [], detail = [];
  for (let i = 0; i < m.pos.length; i++) {
    const p = m.pos[i], n = m.normals[i], near = S.near(p, 2.5), s = near.length ? near[0].s : { tag: 'skin' };
    const big = fbm(p, .08, 3, D.seed), fine = noise3(p[0] * 1.8, p[1] * 1.8, p[2] * 1.8, D.seed + 3);
    let r = Object.assign({ c: [.5, .5, .5], a: 1, sp: .3, gl: .4, ty: 0, st: 0 }, material(D, s.tag, s, p, n, big, fine) || {});
    if (custom) { const over = custom({ p, n, s, tag: s.tag, big, fine, evalAll, r }); if (over) r = Object.assign(r, over); }
    const occ = ao(evalAll, p, n), c = r.a > .99 ? mul(r.c, lerp(.3, 1, occ)) : mul(r.c, lerp(.85, 1, occ));
    colors.push([c[0], c[1], c[2], r.a]); mat.push([r.sp, r.gl]); detail.push([r.ty / 8, r.st]);
  }
  return { colors, mat, detail };
}

// mesh each sculpt, skin it, paint it; soles never below the ground. parts: [[name, sculpt, resolution, falloff]]
function finish(D, parts, custom, { ground = true } = {}) {
  parts = parts.filter(([, S]) => S.shapes.some(sh => sh.op === 'add'));
  const log = [], evalAll = p => Math.min(...parts.map(([, S]) => S.eval(p)));
  const out = parts.map(([name, S, h, falloff]) => {
    const m = mesh(S, h, { clipY: -.05 }); if (!m.pos.length) return null;
    if (ground) for (const p of m.pos) if (p[1] < 0) p[1] = 0;
    const { J, W } = skinWeights(S, m.pos, falloff || 1), pnt = paint(D, S, m, evalAll, custom);
    log.push(name + ': ' + m.pos.length + ' verts, ' + m.tris.length / 3 + ' tris'); return Object.assign({ name }, m, pnt, { J, W });
  }).filter(Boolean);
  return { parts: out, log };
}

module.exports = { F, H, B, POS, GRIP, T, both, mulR, rotX, rotY, rotZ, frameOf, LR, body, hand, skeleton, boneLimb, skull, locks, sheet, crystals, material, paint, finish, smooth, mixc, tOf };
