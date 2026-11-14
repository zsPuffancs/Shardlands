'use strict';
// The three dragons (Region Bosses): Elder Drake (Ember Wastes), Frost Wyrm (Frostfang Peaks), Abyssal Wyrm (Voidreach).
// One winged-quadruped rig (30 bones: root, hips, chest, three neck bones, head, jaw, three per leg, three per wing,
// four tail bones) and one sculpting skeleton; each dragon has its own head, crest, armour and wing membrane, and
// three variants that change the geometry, not only the colours.
//   Elder Drake     A violet fire drake with a horned crown   B ember-armoured: plated back, crown of horns, glowing
//                   chest furnace                             C ancient: four great horns, a molten core showing
//                                                              through cracked scales, ragged wings
//   Frost Wyrm      A pale blue wyrm, a crest of ice spines   B ice-crystal armour along back, tail and wings
//                   C ancient: a glacial skeleton showing through clear ice, a crown of icicles, frost-rimed wings
//   Abyssal Wyrm    A dark violet wyrm with a frilled head    B tentacles from the jaw and wing tips, eyes lining the
//                   wings                                      C ancient: a starry void body, a halo of orbiting
//                                                              shards, membranes dissolving into void light
const K = require('./kit');
const F = require('./forge');
const { mixc } = K;
const { roundCone: RC, ellipsoid: EL, torus: TO, box: BX, Sculpt, norm, add, mul, sub, len, cross, clamp, lerp, rng, qAxis, qMul } = F;
const both = f => { f(1); f(-1); };

// ---------------- rig ----------------
const P = {
  root: [0, 26, 0], hips: [0, 27, -12], chest: [0, 29, 10], neck1: [0, 34, 17], neck2: [0, 41, 22], neck3: [0, 47, 25], head: [0, 50, 29], jaw: [0, 47.6, 32],
  flA: [7, 26, 12], flB: [8, 14, 13], flC: [8, 3, 15], frA: [-7, 26, 12], frB: [-8, 14, 13], frC: [-8, 3, 15],
  hlA: [7, 25, -12], hlB: [8, 13, -8], hlC: [8, 3, -12], hrA: [-7, 25, -12], hrB: [-8, 13, -8], hrC: [-8, 3, -12],
  wlA: [6, 35, 8], wlB: [22, 44, 2], wlC: [38, 46, -6], wrA: [-6, 35, 8], wrB: [-22, 44, 2], wrC: [-38, 46, -6],
  t1: [0, 26, -22], t2: [0, 23, -34], t3: [0, 19, -45], t4: [0, 15, -55],
};
const PAR = { root: null, hips: 'root', chest: 'root', neck1: 'chest', neck2: 'neck1', neck3: 'neck2', head: 'neck3', jaw: 'head', flA: 'chest', flB: 'flA', flC: 'flB', frA: 'chest', frB: 'frA', frC: 'frB',
  hlA: 'hips', hlB: 'hlA', hlC: 'hlB', hrA: 'hips', hrB: 'hrA', hrC: 'hrB', wlA: 'chest', wlB: 'wlA', wlC: 'wlB', wrA: 'chest', wrB: 'wrA', wrC: 'wrB', t1: 'hips', t2: 't1', t3: 't2', t4: 't3' };
const NAMES = Object.keys(P), B = Object.fromEntries(NAMES.map((n, i) => [n, i]));
const BONES = NAMES.map(n => ({ name: n, parent: PAR[n] ? B[PAR[n]] : -1, pos: P[n] }));
const S1 = s => (s > 0 ? 'l' : 'r');

const SPECIES = {
  elderdrake: { seed: 3100, horns: 'crown', crest: 'frill', breath: 'fire',
    V: [{ key: 'a', scale: [.46, .14, .3], belly: [.82, .55, .3], dark: [.12, .05, .16], membrane: [.42, .16, .34], horn: [.82, .74, .58], glow: [1, .55, .18], eye: [1, .7, .1] },
        { key: 'b', scale: [.22, .1, .3], belly: [.9, .5, .2], dark: [.08, .03, .1], membrane: [.32, .1, .22], horn: [.2, .16, .14], glow: [1, .42, .1], eye: [1, .5, .05], plates: 1, furnace: 1 },
        { key: 'c', scale: [.16, .08, .16], belly: [.6, .3, .14], dark: [.04, .02, .04], membrane: [.26, .1, .12], horn: [.86, .8, .66], glow: [1, .5, .1], eye: [1, .8, .3], cracks: 1, bigHorns: 1, ragged: 1 }] },
  frostwyrm: { seed: 3200, horns: 'swept', crest: 'spines', breath: 'frost',
    V: [{ key: 'a', scale: [.56, .76, .9], belly: [.9, .96, 1], dark: [.24, .4, .58], membrane: [.62, .82, .96], horn: [.86, .94, 1], glow: [.6, .92, 1], eye: [.4, .85, 1] },
        { key: 'b', scale: [.46, .66, .84], belly: [.86, .94, 1], dark: [.16, .3, .48], membrane: [.54, .76, .94], horn: [.8, .92, 1], glow: [.55, .9, 1], eye: [.3, .8, 1], ice: 1 },
        { key: 'c', scale: [.7, .86, .96], belly: [.94, .98, 1], dark: [.34, .5, .66], membrane: [.8, .92, 1], horn: [.94, .98, 1], glow: [.7, .95, 1], eye: [.6, .95, 1], glacial: 1, icicles: 1, ragged: 1 }] },
  abyssalwyrm: { seed: 3300, horns: 'back', crest: 'fan', breath: 'void',
    V: [{ key: 'a', scale: [.18, .06, .24], belly: [.42, .2, .6], dark: [.05, .02, .08], membrane: [.24, .06, .32], horn: [.26, .18, .32], glow: [.7, .25, 1], eye: [.85, .3, 1] },
        { key: 'b', scale: [.14, .05, .2], belly: [.36, .14, .5], dark: [.04, .01, .06], membrane: [.2, .04, .26], horn: [.2, .14, .26], glow: [.8, .3, 1], eye: [1, .3, .9], tentacles: 1, wingEyes: 1 },
        { key: 'c', scale: [.1, .06, .2], belly: [.3, .2, .6], dark: [.02, .01, .05], membrane: [.12, .06, .26], horn: [.4, .3, .6], glow: [.6, .5, 1], eye: [.75, .7, 1], stars: 1, halo: 1, voidWing: 1, ice: 1 }] },
};

// ---------------- sculpt ----------------
function body(D, sp) {
  const S = new Sculpt(), A = (sh, o) => S.add(sh, Object.assign({ tag: 'scale' }, o));
  // torso: deep chest, tapering to the hips
  A(EL([0, 28, 6], [9.6, 9.4, 13]), { bone: B.chest, k: 3 }); A(EL([0, 27, -8], [8.6, 8.4, 11]), { bone: B.root, k: 3 }); A(EL([0, 26.6, -16], [8, 7.6, 7]), { bone: B.hips, k: 3 });
  A(EL([0, 22, 2], [7.4, 4.6, 16]), { bone: B.root, tag: 'belly', k: 3 });
  // neck: an S-curve of shrinking segments
  const neck = [[0, 31, 15], [0, 37, 19], [0, 43, 23], [0, 48, 26]], nr = [7, 5.6, 4.6, 4], nb = [B.chest, B.neck1, B.neck2, B.neck3];
  for (let i = 0; i < 3; i++) A(RC(neck[i], neck[i + 1], nr[i], nr[i + 1]), { bone: nb[i + 1], k: 2 });
  // head: a long skull, brow ridges, nostrils, a heavy jaw; species differ in snout and crest
  const H = sp.id === 'abyssalwyrm' ? 1.1 : 1;
  A(EL([0, 50.4, 29.6], [4.6 * H, 3.8, 5.2]), { bone: B.head, k: 1.4 });
  A(RC([0, 50, 32], [0, 49, 40 * (sp.id === 'frostwyrm' ? 1.03 : 1)], 3.4, 2), { bone: B.head, tag: 'snout', k: 1.2 });
  both(s => { A(EL([s * 2.8, 52.4, 31.6], [1.8, 1.2, 2.8]), { bone: B.head, k: .7 }); S.sub(EL([s * 2.6, 51.4, 33], [.9, .7, .9]), { k: .25 }); S.sub(EL([s * .9, 50, 40.2], [.4, .35, .5]), { k: .1 }); });
  const J = p => { const o = P.jaw, q = sub(p, o), a = .22; return add(o, [q[0], q[1] * Math.cos(a) - q[2] * Math.sin(a), q[1] * Math.sin(a) + q[2] * Math.cos(a)]); };
  A(RC(J([0, 47.4, 32]), J([0, 47, 39.4]), 2.8, 1.5), { bone: B.jaw, tag: 'belly', k: 1 });
  // legs: muscular, digitigrade hind legs, clawed feet
  both(s => { const L = S1(s), f = p => [s * p[0], p[1], p[2]];
    A(RC(f([7, 26, 12]), f([8, 14, 13]), 4.6, 3.2), { bone: B['f' + L + 'A'], k: 1.8 }); A(RC(f([8, 14, 13]), f([8, 3, 15]), 3, 2.4), { bone: B['f' + L + 'B'], k: 1.2 }); A(EL(f([8, 2, 17]), [3, 1.8, 3.6]), { bone: B['f' + L + 'C'], k: .8 });
    A(RC(f([7, 25, -12]), f([8, 13, -8]), 6, 3.6), { bone: B['h' + L + 'A'], k: 2.2 }); A(RC(f([8, 13, -8]), f([8, 3, -12]), 3, 2.4), { bone: B['h' + L + 'B'], k: 1.2 }); A(EL(f([8, 2, -9.6]), [3, 1.8, 3.8]), { bone: B['h' + L + 'C'], k: .8 }); });
  // tail
  const tp = [[0, 26, -20], [0, 23, -34], [0, 19, -45], [0, 15, -55], [0, 12, -63]], tr = [6, 4.4, 3, 1.9, .6];
  for (let i = 0; i < 4; i++) A(RC(tp[i], tp[i + 1], tr[i], tr[i + 1]), { bone: B['t' + (i + 1)], k: 1.6 });
  // wing arms: shoulder -> elbow -> wrist, with three long finger bones from the wrist
  both(s => { const L = S1(s), f = p => [s * p[0], p[1], p[2]];
    A(RC(f([6, 35, 8]), f([22, 44, 2]), 2.6, 1.8), { bone: B['w' + L + 'A'], k: 1.2 }); A(RC(f([22, 44, 2]), f([38, 46, -6]), 1.8, 1.3), { bone: B['w' + L + 'B'], k: .8 }); });
  return S;
}
// wing membrane: a fan of quads between the wing fingers, rendered as thin plates
const FINGERS = s => [[38, 46, -6], [44, 30, -16], [36, 18, -24], [24, 16, -26], [10, 24, -16]].map(p => [s * p[0], p[1], p[2]]);
function wings(D, sp) {
  const S = new Sculpt(), R = rng(sp.seed + 11);
  both(s => { const L = S1(s), wrist = [s * 38, 46, -6], fs = FINGERS(s), bone = B['w' + L + 'C'], arm = B['w' + L + 'B'];
    for (let i = 1; i < 4; i++) S.add(RC(wrist, fs[i], 1, .35), { bone, tag: 'wingbone', k: .3 });
    S.add(RC(wrist, add(wrist, [s * 3, 4, 1]), .9, .1), { bone, tag: 'horn', k: .2 });                      // thumb claw
    // the membrane: thin scales tiled over the triangles wrist/finger/finger, and a trailing panel from the last
    // finger back along the arm to the flank
    const tri = (a, b, c, boneOf) => { const e1 = sub(b, a), e2 = sub(c, a), nrm = norm(cross(e1, e2)), x = norm(e1), y = norm(cross(nrm, x)), n = Math.max(3, Math.ceil(Math.max(len(e1), len(e2)) / 2.1));
      for (let u = 0; u <= n; u++) for (let v = 0; u + v <= n; v++) { const tu = u / n, tv = v / n, edge = 1 - tu - tv; if (D.ragged && tu + tv > .75 && R() < .4) continue; if (D.voidWing && tu + tv > .8 && R() < .5) continue;
        const p = add(add(a, mul(e1, tu)), mul(e2, tv)), sag = mul(nrm, -Math.sin((tu + tv) * Math.PI) * edge * 2.4);
        S.add(EL(add(p, sag), [1.7, 1.7, .18], [x, y, nrm]), { bone: boneOf(tu + tv), tag: 'membrane', k: .9, t: tu + tv }); } };
    for (let i = 1; i < 4; i++) tri(wrist, fs[i], fs[i + 1], () => bone);
    tri([s * 22, 44, 2], wrist, fs[4], t => (t > .5 ? bone : arm)); tri([s * 22, 44, 2], fs[4], [s * 7, 32, -8], t => (t > .6 ? bone : arm));
    if (D.wingEyes) for (let k = 0; k < 4; k++) { const p = add(mul(fs[1 + (k % 3)], .55), mul(wrist, .45)); S.add(EL(add(p, [0, -1 - k, 0]), [1.2, 1.2, .6]), { bone, tag: 'eye', k: .2 }); }
    if (D.tentacles) { let p = fs[2], d = [s * .3, -1, -.4]; for (let k = 0; k < 6; k++) { const q = add(p, mul(norm(d), 2.4)); S.add(RC(p, q, .9 - k * .12, .8 - k * .12), { bone, tag: 'scale', k: .3 }); p = q; d = add(d, [s * .2, .1, .2]); } }
  });
  return S;
}
function armour(D, sp) {
  const S = new Sculpt(), R = rng(sp.seed + D.key.charCodeAt(0));
  // dorsal ridge from the head to the tail tip: plates (drake), spines (frost), a fan frill (abyss)
  const ridge = [[0, 54, 28, B.head], [0, 50, 24, B.neck3], [0, 45, 20.4, B.neck2], [0, 39, 16.4, B.neck1], [0, 37.6, 10, B.chest], [0, 36.6, 2, B.chest], [0, 35.4, -6, B.root], [0, 34, -14, B.hips], [0, 31.4, -22, B.t1], [0, 28, -30, B.t1], [0, 24.6, -38, B.t2], [0, 21.4, -45, B.t3], [0, 17.6, -52, B.t4], [0, 14.4, -58, B.t4]];
  ridge.forEach(([x, y, z, bone], i) => { const h = (i < 2 ? 3 : i < 8 ? 5.4 - Math.abs(i - 5) * .3 : 4.6 - (i - 8) * .6) * (D.plates ? 1.4 : 1);
    if (sp.crest === 'spines' || D.ice) S.add(RC([x, y - 1, z], [x, y + h * 1.4, z - h * .6], h * .25 + .4, .1), { bone, tag: D.ice ? 'ice' : 'horn', k: .2, root: [x, y, z], L: h * 1.6 });
    else if (sp.crest === 'fan') S.add(EL([x, y + h * .5, z], [.35, h * .8, 2.4], null), { bone, tag: 'membrane', k: .4, t: .5 });
    else S.add(BX([x, y + h * .35, z], [.5, h * .55, 2.2], null, .3), { bone, tag: D.plates ? 'plate' : 'horn', k: .3 }); });
  if (D.plates) for (let i = 0; i < 5; i++) both(s => S.add(EL([s * 6.4, 33.4 - i * .3, 10 - i * 5], [3.6, 1.2, 3], [[Math.cos(s * .5), Math.sin(s * .5), 0], [-Math.sin(s * .5), Math.cos(s * .5), 0], [0, 0, 1]]), { bone: i < 3 ? B.chest : B.root, tag: 'plate', k: .4 }));
  // horns
  both(s => { const base = [s * 3, 53, 28], horn = (dir, l, r0, bend, n = 6) => { let p = base, d = norm(dir); for (let i = 0; i < n; i++) { const q = add(p, mul(d, l / n)); S.add(RC(p, q, r0 * (1 - i / n) + .2, r0 * (1 - (i + 1) / n) + .1), { bone: B.head, tag: 'horn', k: .25, root: base, L: l }); p = q; d = norm(add(d, bend)); } };
    if (sp.horns === 'crown') { horn([s * .5, .8, -.6], D.bigHorns ? 14 : 10, 1.5, [s * .05, -.04, -.08]); if (D.key !== 'a') horn([s * 1, .2, -.4], 8, 1.1, [0, .08, -.05]); if (D.bigHorns) horn([s * .8, -.2, -.8], 10, 1.2, [s * -.05, .1, -.05]); }
    else if (sp.horns === 'swept') { horn([s * .3, .3, -1], 13, 1.3, [0, .06, 0]); for (let k = 0; k < 3; k++) S.add(RC([s * 4.4, 49 - k, 30 - k * 2], [s * 7.6, 50 - k * 1.4, 26 - k * 2.4], .7, .1), { bone: B.head, tag: 'horn', k: .2 }); }
    else { horn([s * .2, .1, -1], 10, 1.2, [s * .06, -.05, 0]); S.add(EL([s * 5, 51, 27], [.4, 3.6, 3.4], [[1, 0, 0], [0, 1, 0], [0, 0, 1]]), { bone: B.head, tag: 'membrane', k: .3, t: .3 }); } });
  if (D.icicles) for (let i = 0; i < 9; i++) { const a = (i / 8 - .5) * 2.4, b = [Math.sin(a) * 4, 54, 28 + Math.cos(a) * 2]; S.add(RC(b, add(b, [Math.sin(a) * 2, 7 + (i % 3) * 2, -2]), 1, .1), { bone: B.head, tag: 'ice', k: .2, root: b, L: 9 }); }
  if (D.ice) for (let i = 0; i < 10; i++) { const s = i % 2 ? 1 : -1; K.crystals(S, [s * 7, 32 - (i >> 1) * .6, 12 - (i >> 1) * 6], [s * .6, 1, -.2], { count: 3, length: 6, r: 1.2, seed: sp.seed + i, bone: i < 4 ? B.chest : B.root, tag: 'ice', spread: .4 }); }
  // teeth, claws, eyes
  const J = p => { const o = P.jaw, q = sub(p, o), a = .22; return add(o, [q[0], q[1] * Math.cos(a) - q[2] * Math.sin(a), q[1] * Math.sin(a) + q[2] * Math.cos(a)]); };
  both(s => { for (let i = 0; i < 7; i++) { const z = 33 + i * 1.1, a = [s * (2.6 - i * .14), 48.6, z]; S.add(RC(a, add(a, [0, -1.6 - (i === 1 ? 1 : 0), .2]), .3, .05), { bone: B.head, tag: 'tooth', k: .05 }); const b = J([s * (2.2 - i * .12), 47.8, z]); S.add(RC(b, add(b, [0, 1.3, .2]), .28, .05), { bone: B.jaw, tag: 'tooth', k: .05 }); }
    S.add(EL([s * 2.7, 51.8, 33.4], [.9, .5, .7]), { bone: B.head, tag: 'eye', k: .1 });
    const L = S1(s); for (const [pb, z] of [['f', 17], ['h', -9.6]]) for (const dx of [-1.6, 0, 1.6]) { const a = [s * (8 + dx), 1.6, z + 3]; S.add(RC(a, add(a, [0, -.8, 1.8]), .5, .1), { bone: B[pb + L + 'C'], tag: 'horn', k: .1 }); } });
  if (D.tentacles) both(s => { let p = J([s * 1.6, 46.6, 34]), d = [s * .2, -1, .3]; for (let k = 0; k < 6; k++) { const q = add(p, mul(norm(d), 1.8)); S.add(RC(p, q, .7 - k * .1, .6 - k * .1), { bone: B.jaw, tag: 'scale', k: .25 }); p = q; d = add(d, [s * .1, .15, -.1]); } });
  if (D.furnace) S.add(EL([0, 24, 14], [4.6, 4, 3]), { bone: B.chest, tag: 'glow', k: 1 });
  if (D.halo) for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; K.crystals(S, [Math.cos(a) * 10, 60 + Math.sin(a) * 4, 22 + Math.sin(a) * 10], [Math.cos(a * 2), 1, 0], { count: 1, length: 4, r: .8, seed: sp.seed + 50 + i, bone: B.head, tag: 'ice', spread: .1 }); }
  if (D.glacial) for (let i = 0; i < 9; i++) K.boneLimb(S, [0, 36 - i * .2, 12 - i * 3], [7, 24, 12 - i * 3], .5, i < 4 ? B.chest : B.root, { tag: 'bone' });
  return S;
}

// ---------------- clips ----------------
function clips() {
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1], TAU = Math.PI * 2, E = (x = 0, y = 0, z = 0) => qMul(qMul(qAxis(Y, y), qAxis(X, x)), qAxis(Z, z)), sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const wing = (rot, fold, flap) => both(s => { const L = S1(s); rot[B['w' + L + 'A']] = E(0, s * fold * .6, s * (flap - fold * .4)); rot[B['w' + L + 'B']] = E(0, -s * fold * .9, s * flap * .5); rot[B['w' + L + 'C']] = E(0, -s * fold * .5, s * flap * .3); });
  const tail = (rot, ph, a) => { for (let i = 1; i <= 4; i++) rot[B['t' + i]] = E(0, Math.sin(ph - i * .7) * a, 0); };
  const neck = (rot, x, y) => { rot[B.neck1] = E(x * .4, y * .3); rot[B.neck2] = E(x * .3, y * .3); rot[B.neck3] = E(x * .3, y * .4); };
  const legs = (rot, ph, amp, lift) => { for (const [n, o] of [['fl', 0], ['fr', Math.PI], ['hl', Math.PI], ['hr', 0]]) { const a = ph + o; rot[B[n + 'A']] = E(-Math.sin(a) * amp); rot[B[n + 'B']] = E(Math.max(0, Math.cos(a)) * lift * (n[0] === 'f' ? -1 : 1)); } };
  return {
    Idle: { dur: 4, track: t => { const ph = t / 4 * TAU, rot = {}; wing(rot, .5, Math.sin(ph) * .05); tail(rot, ph, .12); neck(rot, Math.sin(ph * 2) * .05, Math.sin(ph) * .15); rot[B.jaw] = E(Math.max(0, Math.sin(ph * 2)) * .08); return { rot, root: [0, Math.sin(ph * 2) * .4, 0] }; } },
    Walk: { dur: 1.4, track: t => { const ph = t / 1.4 * TAU, rot = {}; legs(rot, ph, .35, .5); wing(rot, .55, Math.sin(ph) * .05); tail(rot, ph, .2); neck(rot, .05, Math.sin(ph) * .08); return { rot, root: [0, -Math.abs(Math.sin(ph)) * .8, 0] }; } },
    Run: { dur: .9, track: t => { const ph = t / .9 * TAU, rot = {}; legs(rot, ph, .55, .8); wing(rot, .2, Math.sin(ph * 2) * .4); tail(rot, ph, .3); neck(rot, .15, 0); rot[B.root] = E(.06); return { rot, root: [0, -Math.abs(Math.sin(ph)) * 1.4 + .6, 0] }; } },
    // a lunging bite
    Attack: { dur: .62, track: t => { const u = t / .62, w = sm(0, .4, u) * (1 - sm(.4, .55, u)), h = sm(.4, .55, u) * (1 - sm(.7, 1, u)), rot = {}; wing(rot, .5 - w * .3, w * .3); neck(rot, -w * .5 + h * .6, 0); rot[B.head] = E(h * .3); rot[B.jaw] = E(w * .5 + h * .1); tail(rot, u * 4, .2); return { rot, root: [0, w * 1.5, h * 6 - w * 2] }; } },
    // breath: rears up, wings spread, neck forward, jaw wide
    Attack2: { dur: 1.1, track: t => { const u = t / 1.1, h = sm(0, .3, u) * (1 - sm(.8, 1, u)), rot = {}; wing(rot, .5 - h * .6, h * .6 + Math.sin(u * 20) * .05 * h); rot[B.chest] = E(-h * .25); neck(rot, -h * .2 + sm(.3, .45, u) * h * .5, 0); rot[B.jaw] = E(h * .7); rot[B.flA] = rot[B.frA] = E(-h * .6); tail(rot, u * 6, .15); return { rot, root: [0, h * 4, 0] }; } },
    RecieveHit: { dur: .4, track: t => { const k = Math.sin(t / .4 * Math.PI), rot = {}; neck(rot, -k * .3, k * .2); wing(rot, .5, k * .25); rot[B.jaw] = E(k * .3); return { rot, root: [0, 0, -k * 2] }; } },
    // collapses: legs give, it rolls onto its side, wings fall open, neck slumps
    Death: { dur: 1.8, track: t => { const u = t / 1.8, c = sm(0, .45, u), f = sm(.35, .9, u), rot = {}; for (const n of ['fl', 'fr', 'hl', 'hr']) rot[B[n + 'A']] = E(c * .8); wing(rot, .5 - f * .4, f * .6); neck(rot, f * .6, f * .6); rot[B.head] = E(f * .3); rot[B.jaw] = E(.3 * u); rot[B.root] = E(0, 0, f * 1.3); tail(rot, 1, f * .3); return { rot, root: [0, -c * 10 - f * 4, 0] }; } },
  };
}

// ---------------- paint ----------------
function custom(D, sp) {
  return ({ p, n, s, tag, fine, big }) => {
    const t = s.root && s.L ? clamp(len(sub(p, s.root)) / s.L, 0, 1) : (s.t === undefined ? .5 : s.t);
    if (tag === 'scale' || tag === 'snout' || tag === 'belly' || tag === 'plate') {
      const dorsal = clamp((n[1] + .1) * 1.1, 0, 1); let c = mixc(D.scale, D.dark, clamp(dorsal * .6 + (big - .5) * .7, 0, 1)); if (tag === 'belly' || n[1] < -.35) c = mixc(c, D.belly, tag === 'belly' ? .8 : .5);
      if (D.cracks && Math.abs(F.noise3(p[0] * .25, p[1] * .25, p[2] * .25, 5) - .5) < .025) return { c: D.glow, a: .08, sp: .5, gl: .5, ty: 0, st: 0 };
      if (sp.id === 'abyssalwyrm' && Math.abs(n[1]) < .5 && Math.abs(Math.sin(p[2] * .45)) < .12 && Math.abs(p[1] - 27) < 4) return { c: D.glow, a: .08, sp: .5, gl: .5, ty: 0, st: 0 };
      if (D.stars && fine > .93) return { c: [1, 1, 1], a: .1, sp: .5, gl: .5, ty: 0, st: 0 };
      if (D.glacial) return { c: mixc(c, [.9, .97, 1], .3), a: .7, sp: 1, gl: .95, ty: 7, st: .5 };
      if (tag === 'plate') return { c: mul(mixc(D.dark, D.horn, .3), .9 + fine * .2), sp: .9, gl: .8, ty: 8, st: .5 };
      if (tag === 'belly') { const band = Math.abs(Math.sin(p[2] * .9)) < .2; return { c: band ? mul(c, .7) : c, sp: .5, gl: .55, ty: 3, st: .6 }; }
      return { c: mul(c, .9 + fine * .2), sp: .55, gl: .6, ty: 7, st: 1 };
    }
    if (tag === 'membrane') { const c = mixc(mul(D.membrane, .5), D.membrane, t); if (D.voidWing && t > .6) return { c: mixc(D.membrane, D.glow, (t - .6) * 2.5), a: .2, sp: .4, gl: .5, ty: 0, st: 0 };
      const vein = Math.abs(F.noise3(p[0] * .4, p[1] * .4, p[2] * .4, 9) - .5) < .03; return { c: vein ? mul(c, .55) : c, a: D.key === 'c' && sp.id === 'frostwyrm' ? .6 : 1, sp: .35, gl: .5, ty: 3, st: .6 }; }
    if (tag === 'wingbone') return { c: mul(D.dark, 1.2), sp: .5, gl: .6, ty: 4, st: .5 };
    if (tag === 'horn') return { c: mixc(mul(D.horn, .4), D.horn, Math.pow(t, .6)), sp: .5, gl: .6, ty: 4, st: .8 };
    if (tag === 'ice') return { c: mixc([.5, .75, .95], [.92, .98, 1], t), a: lerp(.65, .35, t), sp: 1, gl: .97, ty: 5, st: .2 };
    if (tag === 'tooth') return { c: [.92, .9, .84], sp: .6, gl: .7, ty: 4, st: .3 };
    if (tag === 'eye') return { c: mixc(D.eye, [1, 1, 1], .2), a: .05, sp: 1, gl: 1, ty: 0, st: 0 };
    if (tag === 'glow') return { c: D.glow, a: .03, sp: .5, gl: .5, ty: 0, st: 0 };
    if (tag === 'bone') return { c: [.9, .94, 1], a: .5, sp: .6, gl: .7, ty: 4, st: .4 };
    return null;
  };
}

function makeBoss(id) {
  const sp = Object.assign({ id }, SPECIES[id]);
  const build = (variant, { lod = 0 } = {}) => {
    const D = Object.assign({ seed: sp.seed + variant }, sp.V[variant]), t0 = Date.now(); D.colors = { skin: D.scale, horn: D.horn, glow: D.glow, bone: [.9, .94, 1] };
    const b = body(D, sp); b.build(3.5); const w = wings(D, sp); w.build(3); const a = armour(D, sp); a.build(2.5);
    const R = lod ? [1.1, 1.2, .55] : [.5, .5, D.plates ? .3 : .24];
    const { parts, log } = K.finish(D, [['body', b, R[0], 2], ['wings', w, R[1], 1], ['armour', a, R[2], .5]], custom(D, sp));
    log.push((Date.now() - t0) + ' ms');
    return { parts, bones: BONES, clips: lod ? null : clips(), log, design: D };
  };
  return { build, BONES, B };
}
module.exports = { makeBoss, BONES, B };
