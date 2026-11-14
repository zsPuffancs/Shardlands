'use strict';
// Metin Stones: sculpted, rigged world-encounter monuments, one design per biome. Every stone is one model whose
// breakable pieces are bones, so the damage stages are real geometry: clips Intact, Damaged and Near pose the pieces
// (chunks fallen to the ground, glowing cracks opened, the core exposed and leaking), Break throws everything apart.
// Bones: 0 root, 1 top (the upper block, topples), 2 core, 3 crown, 4 crack2, 5 crack3, 6 leak, 7.. chunks.
// Units match the primitive stone it replaces (top ~92-104, radius ~28-32).
const K = require('./kit');
const { F, mixc } = K;
const { roundCone: RC, ellipsoid: EL, box: BX, Sculpt, norm, add, mul, sub, len, cross, dot, clamp, lerp, rng, qAxis, qMul } = F;

const rotY = a => [[Math.cos(a), 0, -Math.sin(a)], [0, 1, 0], [Math.sin(a), 0, Math.cos(a)]];
// rows = world->local axes for a frame whose local y follows dir
const along = (dir, spin = 0) => { const y = norm(dir), r = Math.abs(y[1]) > .9 ? [1, 0, 0] : [0, 1, 0], x0 = norm(cross(r, y)), z0 = cross(x0, y), c = Math.cos(spin), s = Math.sin(spin);
  const x = add(mul(x0, c), mul(z0, s)), z = cross(x, y); return [x, y, z]; };
const euler = (yaw, pitch = 0, roll = 0) => { const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  const x = [cy * cr + sy * sp * sr, cp * sr, -sy * cr + cy * sp * sr], y = [-cy * sr + sy * sp * cr, cp * cr, sy * sr + cy * sp * cr], z = [sy * cp, -sp, cy * cp]; return [x, y, z]; };

// march from `from` along `dir` until the sculpt's surface; returns the hit point (or null)
function surf(S, from, dir, max = 60) { let t = 0; for (let i = 0; i < 200 && t < max; i++) { const p = add(from, mul(dir, t)), d = S.eval(p); if (d < .05) return p; t += Math.max(.08, d * .8); } return null; }

// a faceted crystal: a square prism (rotated so its edges catch light) with a pyramid-ish tip
function crystal(S, base, dir, length, r, o) {
  const d = norm(dir), fr = along(d, o.spin || 0), body = length * .72, c = add(base, mul(d, body / 2));
  S.add(BX(c, [r, body / 2, r], fr, r * .12), Object.assign({ k: .12 }, o));
  S.add(RC(add(base, mul(d, body - r * .2)), add(base, mul(d, length)), r * 1.02, .05), Object.assign({ k: .15 }, o));
}
function cluster(S, base, dir, n, size, seed, o) {
  const R = rng(seed);
  for (let i = 0; i < n; i++) { const d = norm(add(dir, [(R() - .5) * 1.1, (R() - .5) * .8, (R() - .5) * 1.1])), l = size * lerp(.45, 1, i ? R() : 1), b = add(base, [(R() - .5) * size * .35, (R() - .5) * size * .2, (R() - .5) * size * .35]);
    crystal(S, b, d, l, l * lerp(.13, .2, R()), Object.assign({ spin: R() * 3, root: b, L: l }, o)); }
}
// a curving tube through points (Catmull-Rom), tapering r0 -> r1
function tube(S, pts, r0, r1, o, steps = 4) {
  const cr = (p0, p1, p2, p3, t) => [0, 1, 2].map(k => .5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t));
  const P = []; for (let i = 0; i < pts.length - 1; i++) for (let s = 0; s < steps; s++) P.push(cr(pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(pts.length - 1, i + 2)], s / steps)); P.push(pts[pts.length - 1]);
  for (let i = 0; i < P.length - 1; i++) { const t0 = i / (P.length - 1), t1 = (i + 1) / (P.length - 1); S.add(RC(P[i], P[i + 1], lerp(r0, r1, t0), lerp(r0, r1, t1)), Object.assign({ k: Math.min(1, r0 * .4), root: P[0], L: P.length, t: t0 }, o)); }
  return P;
}

// ---------------- the Verdant Heart (Meadows) ----------------
const MEADOWS = {
  key: 'meadows', seed: 1201, top: 96,
  stone: [.43, .44, .4], stoneDark: [.2, .21, .2], moss: [.2, .34, .1], mossLight: [.42, .55, .18], lichen: [.66, .66, .44],
  bark: [.3, .21, .13], barkDark: [.13, .09, .06], leaf: [.22, .45, .14], glow: [.42, 1, .48], emerald: [.12, .78, .36],
  colors: { skin: [.43, .44, .4], horn: [.3, .21, .13] },
};
const CHUNK_BONE0 = 7;
function meadows(D) {
  const R = rng(D.seed), slab = new Sculpt(), chunkS = [], roots = new Sculpt(), fine = new Sculpt();
  const B = { root: 0, top: 1, core: 2, crown: 3, crack2: 4, crack3: 5, leak: 6 };
  // the monolith: stacked, slightly twisted blocks leaning a touch, tapering to a broken weathered crown
  const lean = y => [y * .05, 0, -y * .015];
  for (let i = 0; i < 5; i++) { const y = 8 + i * 18, w = lerp(15.5, 10.5, i / 4) + (R() - .5) * 1.2, d = lerp(10.5, 7.8, i / 4) + (R() - .5) * .8;
    slab.add(BX(add([0, y, 0], lean(y)), [w, 11, d], euler((R() - .5) * .1, (R() - .5) * .04, (R() - .5) * .05), 3), { bone: y > 60 ? B.top : B.root, tag: 'rock', k: 8 }); }
  // chiselled facets: planar chops at the corners give the monolith its hewn, ancient silhouette
  for (let i = 0; i < 14; i++) { const y = 10 + R() * 80, a = Math.floor(R() * 4) * Math.PI / 2 + Math.PI / 4 + (R() - .5) * .3, w = lerp(15.5, 10.5, y / 90);
    slab.sub(BX(add([Math.cos(a) * (w + 9), y, Math.sin(a) * (w * .7 + 9)], lean(y)), [8, lerp(6, 14, R()), 8], euler(-a, (R() - .5) * .3, (R() - .5) * .3), 1), { k: 2 }); }
  slab.add(EL(add([1.5, 88, 0], lean(88)), [9.5, 6.5, 7]), { bone: B.top, tag: 'rock', k: 3 });
  slab.add(BX(add([-2, 92, .5], lean(92)), [5.5, 5, 5], euler(.4, .2, .35), 1.5), { bone: B.top, tag: 'rock', k: 2 });
  // the plinth: a ring of sunken, tilted foundation stones
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + R() * .3, r = 17 + R() * 3; slab.add(BX([Math.cos(a) * r, 1.5, Math.sin(a) * r * .85], [lerp(4, 6.5, R()), lerp(2.5, 4, R()), lerp(3.5, 5, R())], euler(-a + (R() - .5) * .4, (R() - .5) * .25, (R() - .5) * .25), 1.2), { bone: B.root, tag: 'rock', k: 1.2 }); }
  // erosion: bites out of every edge, horizontal weathering grooves, a broken notch at the crown
  for (let i = 0; i < 46; i++) { const y = 6 + R() * 84, sx = R() < .5 ? -1 : 1, sz = R() < .5 ? -1 : 1, w = lerp(15, 10, y / 90), d = lerp(10, 7.5, y / 90);
    slab.sub(EL(add([sx * w * lerp(.85, 1.05, R()), y, sz * d * lerp(.85, 1.05, R())], lean(y)), [lerp(1.2, 3.4, R()), lerp(1.5, 4.5, R()), lerp(1.2, 3, R())]), { k: 1 }); }
  for (const y of [27]) slab.sub(BX(add([0, y, 0], lean(y)), [20, .3, 13], euler(0, 0, (R() - .5) * .08), .2), { k: .9 });
  slab.sub(EL(add([7, 93, 2], lean(93)), [5, 4, 6]), { k: 1.5 });
  // the heart: a fissure in the front face opening onto the glowing core
  slab.sub(EL(add([0, 39, 8], lean(39)), [8, 12, 7]), { k: 1.6 });
  slab.build(4);
  const front = (x, y) => surf(slab, add([x, y, 30], lean(y)), [0, 0, -1]);
  const side = (s, y, z) => surf(slab, add([s * 30, y, z], lean(y)), [-s, 0, 0]);

  // the core: a cluster of glowing emerald crystal set deep in the stone
  const cc = add([0, 39, 3.5], lean(39));
  fine.add(EL(cc, [3.6, 6, 3.4]), { bone: B.core, tag: 'core', k: .6, c: cc });
  cluster(fine, add(cc, [0, -3, 0]), [0, 1, .25], 5, 9, D.seed + 5, { bone: B.core, tag: 'coreCrystal' });

  // breakable chunks: plates either side of the fissure, edge and back slabs, crown shards
  const CH = [ // centre, half-size, euler, parent bone, stage it falls at (2, 3, or 4 = only when destroyed)
    [[-6.8, 39, 0], [5.6, 11.5, 2.4], [.05, 0, .06], 'root', 2, 'front'], [[7, 41, 0], [5.4, 10.5, 2.4], [-.06, 0, -.05], 'root', 3, 'front'],
    [[12.4, 64, 0], [3, 7, 5.6], [.1, 0, .05], 'top', 2, 'right'], [[-13.6, 24, 1.5], [3, 7.5, 6.4], [-.05, 0, .05], 'root', 3, 'left'],
    [[2, 52, 0], [6.4, 6.5, 2.2], [.04, 0, .03], 'root', 2, 'back'], [[-5.5, 84, 1.5], [4, 5, 4.6], [.2, .1, .3], 'top', 3, 'crown'],
    [[5.5, 78, 0], [4.4, 5.5, 2.2], [-.1, 0, .1], 'top', 4, 'front'], [[0, 15, 0], [7, 4.6, 2.2], [0, 0, .03], 'root', 4, 'front'],
  ];
  const chunkInfo = CH.map(([c0, h, e, parent, stage, face], i) => {
    let c = add(c0, lean(c0[1]));
    if (face === 'front') { const p = front(c0[0], c0[1]) || add(c, [0, 0, 9]); c = add(p, [0, 0, -h[2] * .45]); }
    if (face === 'back') { const p = surf(slab, add([c0[0], c0[1], -30], lean(c0[1])), [0, 0, 1]) || add(c, [0, 0, -9]); c = add(p, [0, 0, h[2] * .45]); }
    const bone = CHUNK_BONE0 + i, chunks = new Sculpt(); chunkS.push(chunks);
    chunks.add(BX(c, h, euler(e[0], e[1], e[2]), 1.4), { bone, tag: 'rock', k: 1 });
    for (let k = 0; k < 4; k++) chunks.sub(EL(add(c, [(R() - .5) * h[0] * 2, (R() - .5) * h[1] * 2, (R() - .5) * h[2] * 2]), [lerp(.8, 2, R()), lerp(.8, 2.4, R()), lerp(.8, 2, R())]), { k: .6 });
    return { c, h, parent: parent === 'top' ? B.top : B.root, stage, bone };
  });

  // runes: carved glyph columns down the left front and both flanks, each stroke a groove with a glowing inlay
  const glyph = (p, nrm, s, seed) => { const Rg = rng(seed), up = [0, 1, 0], rt = norm(cross(up, nrm)), strokes = 2 + Math.floor(Rg() * 3);
    for (let k = 0; k < strokes; k++) { const a = Math.floor(Rg() * 4) * Math.PI / 4, l = s * lerp(.5, 1, Rg()), off = add(mul(rt, (Rg() - .5) * s * .8), mul(up, (Rg() - .5) * s * .9)), dir = add(mul(rt, Math.cos(a)), mul(up, Math.sin(a)));
      const fr = [norm(dir), norm(cross(nrm, dir)), nrm], q = add(p, off);
      slab.sub(BX(q, [l / 2, .5, .8], fr, .1), { k: .15 });
      fine.add(BX(add(q, mul(nrm, -.12)), [l / 2 - .1, .34, .5], fr, .08), { bone: B.root, tag: 'rune', k: .05 }); } };
  const RUNES = [];
  for (let i = 0; i < 6; i++) RUNES.push(['front', -9.6, 12 + i * 5.2]);
  for (let i = 0; i < 7; i++) RUNES.push(['right', 0, 8 + i * 5.6], ['left', -1, 40 + i * 5.2]);
  RUNES.forEach(([face, a, y], i) => {
    if (y > 58) return;
    const p = face === 'front' ? front(a, y) : side(face === 'right' ? 1 : -1, y, a), nrm = face === 'front' ? [0, 0, 1] : face === 'right' ? [1, 0, 0] : [-1, 0, 0];
    if (!p || chunkInfo.some(c => c.stage < 4 && len(sub(p, c.c)) < Math.max(c.h[0], c.h[1]) + 2.5)) return;
    glyph(p, nrm, 4.4, D.seed + 40 + i);
  });
  slab.build(4);

  // cracks that open with damage: glowing seams spreading from the fissure (stage 2), then right through the stone (3)
  const seam = (bone, start, dir, n, w, seed) => { const Rs = rng(seed); let p = start, d = norm(dir);
    for (let i = 0; i < n; i++) { d = norm(add(d, [(Rs() - .5) * .7, (Rs() - .5) * .7, 0])); const q0 = add(p, mul(d, 2.6)), hit = surf(slab, add(q0, [0, 0, 6]), [0, 0, -1], 14) || surf(slab, add(q0, [Math.sign(q0[0]) * 6, 0, 0]), [-Math.sign(q0[0]), 0, 0], 14); if (!hit) break;
      fine.add(RC(p, hit, w * (1 - i / n * .6), w * (1 - (i + 1) / n * .6)), { bone, tag: 'crack', k: .1 }); p = hit;
      if (Rs() < .3) { let b = p, bd = norm(add(d, [(Rs() - .5) * 2, (Rs() - .5) * 2, 0])); for (let j = 0; j < 3; j++) { const q = surf(slab, add(add(b, mul(bd, 2)), [0, 0, 5]), [0, 0, -1], 12); if (!q) break; fine.add(RC(b, q, w * .5, w * .35), { bone, tag: 'crack', k: .1 }); b = q; } } } };
  const fis = front(0, 39) || add(cc, [0, 0, 6]);
  for (let i = 0; i < 5; i++) seam(B.crack2, add(fis, [(i - 2) * 1.5, (i - 2) * 3, 0]), [Math.cos(i * 1.3 + .4), Math.sin(i * 1.7) * 1.2, 0], 6, .55, D.seed + 60 + i);
  for (let i = 0; i < 7; i++) seam(B.crack3, add(fis, [(i - 3) * 1.2, (i - 3) * 4, 0]), [Math.cos(i * 2.1) * 1.4, Math.sin(i * 1.3 + 1), 0], 10, .7, D.seed + 80 + i);
  // energy leaking out of the broken heart (stage 3): ribbons of light and motes around the core
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, p = add(cc, [Math.cos(a) * lerp(7, 12, (i % 3) / 2), (i % 3 - 1) * 7, 5 + Math.sin(a) * 4]); fine.add(EL(p, [.9, 1.6, .9]), { bone: B.leak, tag: 'leak', k: .2 }); }
  tube(fine, [add(cc, [0, 2, 3]), add(cc, [4, 12, 8]), add(cc, [-2, 22, 9]), add(cc, [3, 31, 6])], .9, .15, { bone: B.leak, tag: 'leak' });

  // roots: five old roots erupt from the ground, coil up the stone and burrow through it
  const rootPaths = [];
  for (let i = 0; i < 5; i++) {
    const a0 = i / 5 * Math.PI * 2 + .5, pts = [[Math.cos(a0) * 34, -1, Math.sin(a0) * 30], [Math.cos(a0) * 24, 2.5, Math.sin(a0) * 21]];
    const climb = 22 + (i % 3) * 14 + R() * 6, turns = (i % 2 ? 1 : -1) * lerp(.5, 1, R());
    for (let k = 1; k <= 6; k++) { const t = k / 6, y = 4 + t * climb, a = a0 + turns * t * Math.PI, dir = [Math.cos(a), 0, Math.sin(a) * 1.3];
      const hit = surf(slab, add(add(mul(norm(dir), 30), [0, y, 0]), lean(y)), mul(norm(dir), -1)); if (!hit) continue;
      // every other root dives into the rock at its end: growing through the stone
      const embed = (i % 2 === 0 && k === 6) ? -2.5 : lerp(1.6, .7, t); pts.push(add(hit, mul(norm(dir), embed))); }
    rootPaths.push(tube(roots, pts, lerp(2.6, 3.2, R()), .55, { bone: B.root, tag: 'root' }, 5));
    // feeder roots spreading over the ground
    for (let j = 0; j < 3; j++) { const b = add(pts[1], [(R() - .5) * 4, 0, (R() - .5) * 4]), da = a0 + (R() - .5) * 2.4, l = lerp(9, 16, R());
      tube(roots, [b, add(b, [Math.cos(da) * l * .5, .6, Math.sin(da) * l * .5]), add(b, [Math.cos(da + .3) * l, -.6, Math.sin(da + .3) * l])], 1.2, .3, { bone: B.root, tag: 'root' }, 3); }
  }
  // a root bursting out of the stone itself, high on the right flank, and curling back in
  { const a = side(1, 52, 1), b = side(1, 66, -2); if (a && b) tube(roots, [add(a, [-2, 0, 0]), add(a, [3.5, 3, 2]), add(mul(add(a, b), .5), [5, 0, 3]), add(b, [3, -1, 1]), add(b, [-2, 1, 0])], 2.6, 1.4, { bone: B.top, tag: 'root' }, 5); }

  // vines draped over the crown, leaves along them; moss cushions on every ledge
  for (let i = 0; i < 6; i++) { const x = -9 + i * 3.6 + (R() - .5) * 2, pts = []; for (let k = 0; k < 8; k++) { const y = 92 - k * lerp(5, 7.5, R()); const hit = front(x + Math.sin(k + i) * 2, y) || side(x < 0 ? -1 : 1, y, 2); if (hit) pts.push(add(hit, [0, 0, .5])); }
    if (pts.length < 3) continue; const hi = pts.filter(q => q[1] > 61), lo = pts.filter(q => q[1] <= 61);
    if (hi.length > 1) tube(fine, hi, .5, .4, { bone: B.top, tag: 'vine' }, 3); if (lo.length > 1) tube(fine, lo, .42, .32, { bone: B.root, tag: 'vine' }, 3);
    pts.forEach((p, k) => { if (k === 0) return; for (const s of [-1, 1]) { const lp = add(p, [s * 1.4, -.4, .6]); fine.add(EL(lp, [1.3, .45, .8], euler(s * .6, .5, s * .5)), { bone: p[1] > 60 ? B.top : B.root, tag: 'leaf', k: .15 }); } }); }
  for (let i = 0; i < 40; i++) { const y = 6 + R() * 84, s = R() < .5 ? -1 : 1, p = R() < .5 ? front((R() - .5) * 18, y) : side(s, y, (R() - .5) * 12); if (!p) continue;
    const ns = slab.eval(add(p, [0, 1.2, 0])) - slab.eval(add(p, [0, -1.2, 0])); if (ns < .6) continue; // only where the surface faces up
    fine.add(EL(add(p, [0, .5, 0]), [lerp(1.5, 3, R()), lerp(.6, 1.1, R()), lerp(1.5, 3, R())]), { bone: y > 60 ? B.top : B.root, tag: 'moss', k: .6 }); }

  // emerald crystals: breaking out of the flanks, the plinth and the crown
  for (const [p, dir, n, size, bone] of [[side(1, 30, 3), [1, .5, .3], 6, 11, B.root], [side(-1, 58, -2), [-1, .7, -.2], 5, 9, B.root], [[-19, 1, 11], [-.3, 1, .4], 7, 13, B.root], [[20, 1, -9], [.4, 1, -.3], 5, 10, B.root], [[6, 0, 21], [.2, 1, .7], 4, 7, B.root], [add([1, 93, 0], lean(93)), [.15, 1, .1], 6, 13, B.crown]])
    if (p) cluster(fine, p, dir, n, size, D.seed + Math.round(p[1] * 7 + p[0]), { bone, tag: 'emerald' });

  // bones for the rig
  const bones = [{ name: 'root', parent: -1, pos: [0, 0, 0] }, { name: 'top', parent: 0, pos: add([0, 60, 0], lean(60)) }, { name: 'core', parent: 0, pos: cc }, { name: 'crown', parent: 1, pos: add([1, 93, 0], lean(93)) },
    { name: 'crack2', parent: 0, pos: fis }, { name: 'crack3', parent: 0, pos: fis }, { name: 'leak', parent: 0, pos: cc }];
  chunkInfo.forEach((c, i) => bones.push({ name: 'chunk' + i, parent: c.parent, pos: c.c }));
  // the monolith is meshed as two pieces (base and upper block) so the upper block breaks away cleanly
  const split = bone => { const S = new Sculpt(); for (const sh of slab.shapes) if (sh.op === 'sub' || sh.bone === bone) S.shapes.push(sh); S.build(4); return S; };
  const lower = split(B.root), upper = split(B.top);
  chunkS.forEach(c => c.build(3)); roots.build(3); fine.build(2.5);
  return { parts: [['stone', lower, .8, .4], ['stoneTop', upper, .8, .4], ...chunkS.map((c, i) => ['chunk' + i, c, .75, .2]), ['roots', roots, .8, .5], ['detail', fine, .46, .3]], bones, chunks: chunkInfo, B };
}

// ---------------- painting ----------------
function custom(D) {
  return ({ p, n, s, tag, fine, big }) => {
    if (tag === 'rock') {
      const strata = Math.sin(p[1] * .9 + big * 6) * .5 + .5, streak = F.noise3(p[0] * .7, p[1] * .08, p[2] * .7, D.seed + 9);
      let c = mixc(D.stone, D.stoneDark, clamp(.25 + (big - .5) * 1.2 + strata * .12 + (streak > .62 ? .3 : 0), 0, 1)); c = mul(c, .86 + fine * .28);
      const up = n[1], mossy = clamp((up - .25) * 2.2 + (big - .45) * 1.6 + (p[1] < 10 ? .5 : 0) - (p[1] > 70 ? .2 : 0), 0, 1);
      if (mossy > .35) return { c: mixc(D.moss, D.mossLight, clamp(fine * 1.3 - .2, 0, 1)), sp: .08, gl: .2, ty: 2, st: .5 + mossy * .4 };
      if (F.noise3(p[0] * 1.3, p[1] * 1.3, p[2] * 1.3, D.seed + 11) > .78) return { c: mixc(c, D.lichen, .7), sp: .1, gl: .25, ty: 5, st: .6 };
      return { c, sp: .2, gl: .35, ty: 5, st: 1 };
    }
    const t = s.root && s.L ? clamp(len(sub(p, s.root)) / s.L, 0, 1) : .5;
    switch (tag) {
      case 'root': { const g = s.t === undefined ? .5 : s.t; return { c: mul(mixc(D.barkDark, D.bark, clamp(.3 + fine * .8, 0, 1)), lerp(.8, 1.05, g)), sp: .15, gl: .3, ty: 4, st: 1 }; }
      case 'vine': return { c: mixc(D.barkDark, D.leaf, .5), sp: .1, gl: .3, ty: 3, st: .4 };
      case 'leaf': return { c: mixc(D.leaf, D.mossLight, fine), sp: .25, gl: .45, ty: 6, st: .3 };
      case 'moss': return { c: mixc(D.moss, D.mossLight, fine * 1.2), sp: .05, gl: .15, ty: 2, st: 1 };
      case 'rune': return { c: D.glow, a: .06, sp: .5, gl: .5, ty: 0, st: 0 };
      case 'crack': return { c: mixc(D.glow, [1, 1, .9], .25), a: .03, sp: .5, gl: .5, ty: 0, st: 0 };
      case 'leak': return { c: mixc(D.glow, [1, 1, 1], .3), a: .02, sp: .5, gl: .5, ty: 0, st: 0 };
      case 'core': return { c: mixc(D.glow, [1, 1, .95], .55), a: .01, sp: 1, gl: 1, ty: 0, st: 0 };
      case 'coreCrystal': return { c: mixc(D.emerald, D.glow, .4 + t * .5), a: .12, sp: 1, gl: .95, ty: 0, st: 0 };
      case 'emerald': return { c: mixc(mul(D.emerald, .5), mixc(D.emerald, [.8, 1, .85], .4), t), a: lerp(.6, .3, t), sp: 1, gl: .95, ty: 5, st: .15 };
    }
    return null;
  };
}

// ---------------- clips ----------------
// Intact / Damaged / Near loop (4 s) and pose the stage; Break (1.8 s) plays once when the stone is destroyed.
function clips(info) {
  const { chunks, B } = info, ONE = [1, 1, 1], Z = [1e-3, 1e-3, 1e-3];
  const fallen = (c, i) => { const out = norm([c.c[0] || .01, 0, c.c[2] || .01]), r = 12 + (i * 3.7) % 7, g = add(mul(out, r), [0, Math.min(c.h[0], c.h[1], c.h[2]) + .8 - c.c[1], 0]);
    return { pos: c.parent === B.top ? sub(g, [0, 0, 0]) : g, rot: qAxis(norm([out[2], 0, -out[0]]), 1.35 + (i % 3) * .3) }; };
  const pose = (stage, t) => {
    const s = { rot: {}, pos: {}, scl: {} }, ph = t / 4 * Math.PI * 2;
    const pulse = stage === 1 ? 1 + Math.sin(ph) * .05 : stage === 2 ? 1.06 + Math.sin(ph * 2) * .08 : 1.12 + Math.sin(ph * 5) * .1 + Math.sin(ph * 13) * .05;
    s.scl[B.core] = [pulse, pulse, pulse];
    s.rot[B.crown] = qAxis([0, 1, 0], Math.sin(ph) * .03);
    s.scl[B.crack2] = stage >= 2 ? ONE : Z; s.scl[B.crack3] = stage >= 3 ? ONE : Z;
    const lk = stage >= 3 ? 1 + Math.sin(ph * 3) * .15 : 1e-3; s.scl[B.leak] = [lk, lk, lk]; s.rot[B.leak] = qAxis([0, 1, 0], ph);
    if (stage >= 3) s.rot[B.top] = qAxis(norm([1, 0, .4]), .07 + Math.sin(ph * 2) * .006);
    chunks.forEach((c, i) => { if (c.stage <= stage) { const f = fallen(c, i); s.pos[c.bone] = f.pos; s.rot[c.bone] = f.rot; } else if (stage >= 2 && c.stage === stage + 1) s.rot[c.bone] = qAxis([0, 0, 1], Math.sin(ph * 6 + i) * .015); });
    return s;
  };
  const brk = t => {
    const s = pose(3, 0), k = clamp((t - .35) / 1.1, 0, 1), sink = clamp((t - 1.3) / .5, 0, 1);
    const flare = t < .35 ? 1 + t / .35 * .8 : Math.max(1e-3, 1.8 * (1 - (t - .35) / .35)); s.scl[B.core] = [flare, flare, flare];
    const cr = t < .35 ? 1 + t * 1.2 : 1e-3; s.scl[B.crack2] = s.scl[B.crack3] = [cr, cr, cr]; s.scl[B.leak] = t < .35 ? [1.6, 1.6, 1.6] : Z;
    chunks.forEach((c, i) => { if (c.stage <= 3) return; const out = norm([c.c[0] || .3, 0, c.c[2] || 1]), v = 26 + i * 3; s.pos[c.bone] = [out[0] * v * k, (18 * k - 30 * k * k), out[2] * v * k]; s.rot[c.bone] = qAxis(norm([out[2], .3, -out[0]]), k * 3); });
    s.pos[B.top] = [12 * k, 10 * k - 70 * k * k, 6 * k]; s.rot[B.top] = qAxis(norm([.4, 0, -1]), k * 1.6);
    s.root = [0, -40 * sink * sink, 0]; const sc = 1 - sink * .4; s.scl[B.root] = [1, sc, 1];
    return s;
  };
  return { Intact: { dur: 4, track: t => pose(1, t) }, Damaged: { dur: 4, track: t => pose(2, t) }, Near: { dur: 4, track: t => pose(3, t) }, Break: { dur: 1.8, track: brk } };
}

const DESIGNS = { meadows: { D: MEADOWS, fn: meadows } };
function build(id, { lod = 0 } = {}) {
  const { D: D0, fn } = DESIGNS[id], D = Object.assign({}, D0), t0 = Date.now(), info = fn(D);
  const parts = info.parts.map(([n, S, h, f]) => [n, S, lod ? Math.max(h * 2.4, 1) : h, f]);
  const { parts: out, log } = K.finish(D, parts, custom(D));
  log.push((Date.now() - t0) + ' ms');
  return { parts: out, bones: info.bones, clips: clips(info), log };
}
module.exports = { build, DESIGNS };
