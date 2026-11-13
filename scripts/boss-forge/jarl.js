'use strict';
// Frostbound Jarl, World Boss of Frostfang Peaks and the glacier regions: an ancient frozen warlord.
//   A frozen warlord  horned nasal helm, a braided frost beard, a fur mantle over mail, an ice-edged bearded axe
//   B ancient          heavy plate with glowing runes, a closed helm with antler horns, a rimed cloak, a rune axe
//   C battle-scarred   a broken horn, ice spikes growing from shoulders and back, a bare frostbitten arm, a scarred
//                      face, the axe locked in a block of ice
// Humanoid rig; units match the old primitive model (top ~96, facing +z, feet on y = 0).
const K = require('./kit');
const { F, H, B, POS: BASE, GRIP, both, mulR, rotX, rotY, rotZ, frameOf, LR, mixc } = K;
const { roundCone: RC, ellipsoid: EL, torus: TO, box: BX, Sculpt, norm, add, mul, sub, len, clamp, lerp, rng } = F;

const HS = 1.12, PIV = [0, 70, 1.5], hd = p => [PIV[0] + (p[0] - PIV[0]) * HS, PIV[1] + (p[1] - PIV[1]) * HS, PIV[2] + (p[2] - PIV[2]) * HS];
const unhd = p => [PIV[0] + (p[0] - PIV[0]) / HS, PIV[1] + (p[1] - PIV[1]) / HS, PIV[2] + (p[2] - PIV[2]) / HS];
const SC = shape => F.scaled(shape, PIV, HS);
const POS = Object.assign({}, BASE); for (const k of ['head', 'jaw', 'hair']) POS[k] = hd(POS[k]);
const BONES = H.bonesFrom(POS);

const DESIGN = [
  { key: 'a', name: 'frozen warlord', seed: 501, colors: { skin: [.6, .66, .74], skinDark: [.32, .38, .48], hair: [.9, .94, 1], fur: [.5, .46, .42], mail: [.34, .36, .4], metal: [.5, .56, .64], darkmetal: [.16, .18, .22], trim: [.72, .78, .86], leather: [.26, .18, .12], cloth: [.18, .24, .34], horn: [.86, .84, .74], glow: [.55, .88, 1] }, eye: [.55, .88, 1] },
  { key: 'b', name: 'ancient', seed: 502, colors: { skin: [.56, .62, .72], skinDark: [.28, .34, .46], hair: [.94, .97, 1], fur: [.82, .84, .88], mail: [.3, .32, .36], metal: [.36, .42, .52], darkmetal: [.12, .14, .19], trim: [.62, .84, 1], leather: [.2, .16, .14], cloth: [.24, .32, .44], horn: [.8, .76, .66], glow: [.45, .85, 1] }, eye: [.5, .9, 1] },
  { key: 'c', name: 'battle-scarred', seed: 503, colors: { skin: [.58, .64, .72], skinDark: [.3, .34, .44], hair: [.78, .84, .9], fur: [.34, .32, .32], mail: [.3, .3, .32], metal: [.42, .46, .52], darkmetal: [.14, .14, .16], trim: [.5, .54, .6], leather: [.22, .15, .1], cloth: [.16, .2, .26], horn: [.84, .8, .7], glow: [.6, .9, 1] }, eye: [.6, .9, 1] },
];

function anatomy(D) {
  const S = new Sculpt(), A = (shape, o) => S.add(shape, Object.assign({ tag: 'skin' }, o)), c = D.key === 'c';
  K.body(S, { m: 1.14 });
  // a stern, weathered giant's face (the beard covers the mouth)
  A(SC(EL([0, 77.4, 1.4], [5.3, 5.9, 5.9])), { bone: B.head, k: 1.4 });
  A(SC(EL([0, 79.3, 5.8], [4.6, 1.3, 1.6])), { bone: B.head, tag: 'skin', k: .7 });
  both(s => A(SC(EL([s * 3.4, 75.6, 5.4], [1.7, 1.4, 1.5])), { bone: B.head, k: .8 }));
  A(SC(RC([0, 78, 7.3], [0, 75.4, 8.6], .9, 1.2)), { bone: B.head, k: .5 });                                                  // long straight nose
  A(SC(EL([0, 72.6, 4.6], [4.4, 2.4, 3.4])), { bone: B.jaw, k: 1.1 });
  both(s => S.sub(SC(EL([s * 2.2, 77.4, 6.7], [1.15, .7, .9])), { k: .3 }));
  both(s => A(SC(EL([s * 5.5, 77, 1.6], [.9, 1.8, 1.3])), { bone: B.head, k: .5 }));
  if (c) S.sub(SC(RC([-3.6, 80.2, 6], [-1.4, 73.6, 7.6], .28, .24)), { k: .2, tag: 'scar' });
  return S;
}

// helm, armour, mantle or cloak, ice
function armour(D) {
  const S = new Sculpt(), o = (tag, bone, extra) => Object.assign({ tag, bone, k: .5 }, extra), heavy = D.key === 'b', c = D.key === 'c';
  // ---- the helm ----
  S.add(SC(EL([0, 80.8, 1.2], [6.1, 4.8, 6.4])), o('metal', B.head, { k: .4 }));
  S.add(SC(TO([0, 78.4, 1.3], 6.1, .6, [[1, 0, 0], [0, 1, 0], [0, 0, 1.05]])), o('trim', B.head));
  S.add(SC(RC([0, 82.6, 6.6], [0, 85.6, 1], .5, .5)), o('trim', B.head));                                                     // crest ridge
  if (!heavy) S.add(SC(BX([0, 76.4, 7.6], [.55, 2.6, .5], rotX(-.15), .2)), o('metal', B.head));                              // nasal
  else { S.add(SC(EL([0, 75.4, 5.4], [5.4, 5, 3.6])), o('metal', B.head, { k: .4 })); S.sub(SC(BX([0, 77.3, 8.6], [4.3, .38, 3])), { k: .15 }); // closed face plate, eye slit
    for (let i = -3; i <= 3; i++) S.sub(SC(BX([i * .9, 73.6, 8.8], [.18, 1.2, 2])), { k: .1 }); }                                // breathing slots
  const horn = (base, dir, length, r0, bend, segs = 6, tines = 0) => { let p = base, d = norm(dir); for (let i = 0; i < segs; i++) { const l = length / segs, q = add(p, mul(d, l));
      S.add(SC(RC(p, q, r0 * (1 - i / segs) + .15, r0 * (1 - (i + 1) / segs) + .1)), o('horn', B.head, { k: .25, root: hd(base), L: length * HS }));
      if (tines && i >= 2 && i % 2 === 0) { const t = add(q, mul(norm(add([0, 1, 0], mul(d, .3))), length * .26)); S.add(SC(RC(q, t, r0 * .4, .08)), o('horn', B.head, { k: .2, root: hd(base), L: length * HS })); }
      p = q; d = norm(add(d, bend)); } };
  both(s => { const broken = c && s < 0;
    if (heavy) horn([s * 4.6, 82.4, 1], [s * .7, 1, -.1], 17, 1.1, [s * .06, .02, -.08], 7, 1);                                 // antlers
    else horn([s * 5.6, 80.6, 1.6], [s * 1, .25, .1], broken ? 5 : 16, 1.6, [s * -.02, .18, -.03], broken ? 2 : 6); });
  if (c) S.sub(SC(EL([-8.6, 81.6, 1.8], [1.6, 1.4, 1.4])), { k: .1 });                                                          // the snapped stump
  // ---- body armour ----
  if (heavy) {
    S.add(EL([0, 57.5, 1], [13.6, 10.4, 9]), o('darkmetal', B.chest, { k: 1 })); S.add(EL([0, 47.5, 1.2], [10.6, 5.4, 7.6]), o('darkmetal', B.spine, { k: 1 }));
    S.add(EL([0, 60, 7.6], [9.4, 7, 2.2]), o('metal', B.chest, { k: .8 }));                                                     // breastplate face
    for (let i = 0; i < 3; i++) S.add(EL([0, 46 - i * 1.8, 1.2], [11.2 - i * .4, 1.2, 8.2]), o('metal', B.spine, { k: .3 }));     // faulds
    both(s => { const L = LR(s); for (let j = 0; j < 4; j++) S.add(EL([s * (13.4 + j * .5), 66.4 - j * 2.2, 0], [5.4 - j * .3, 2.6, 6.2 - j * .4], rotZ(s * -.4)), o(j ? 'metal' : 'trim', B['uarm' + L], { k: .3 }));
      const f = p => [s * p[0], p[1], p[2]];
      S.add(RC(f([14.6, 49, 1.4]), f([15.4, 38.6, 3.2]), 3.9, 3.1), o('metal', B['farm' + L], { k: .4 })); S.add(TO(f([15.3, 39.2, 3.2]), 3.2, .6, rotX(-.1)), o('trim', B['farm' + L]));
      S.add(RC(f([7, 21.6, 1.6]), f([7, 6.4, .6]), 4.4, 3.4), o('metal', B['shin' + L], { k: .4 })); S.add(EL(f([7, 22.4, 4.4]), [2.8, 2.4, 1.4]), o('trim', B['shin' + L]));
      S.add(RC(f([6.6, 38.5, .4]), f([7.2, 23, 1.6]), 6.6, 5), o('mail', B['thigh' + L], { k: .7 })); S.add(EL(f([7, 3, 3]), [3.2, 3, 5.6]), o('darkmetal', B['foot' + L])); });
    // the rimed cloak, from the shoulders to the calves
    const top = []; for (let i = 0; i <= 8; i++) { const a = (i / 8 - .5) * 2.6; top.push([Math.sin(a) * 12.4, 66.6 - Math.abs(Math.sin(a)) * 1.5, -3.4 - Math.cos(a) * 4.6]); }
    K.sheet(S, top, 50, { bone: B.back, tag: 'cloak', thick: .75, folds: 7, foldDepth: 1.3, flare: .14, rag: .15, seed: D.seed, boneOf: t => (t < .35 ? B.back : B.skirtB) });
  } else {
    // mail shirt to the thighs, a leather belt, leather bracers, trousers and fur boots
    S.add(EL([0, 57.5, .9], [14.6, 11, 9.6]), o('mail', B.chest, { k: 1.2 })); S.add(EL([0, 46, 1.1], [11.8, 8.6, 8.4]), o('mail', B.spine, { k: 1.2 }));
    S.add(EL([0, 36, .6], [12.4, 7, 9]), o('mail', B.root, { k: 1.4 })); S.sub(BX([0, 28, 10], [1.4, 5, 3]), { k: .5 });
    S.add(TO([0, 43, 1.1], 11, 1.1, [[1, 0, 0], [0, 1, 0], [0, 0, 1.38]]), o('leather', B.root)); S.add(BX([0, 43, 9.3], [2, 1.7, .6], null, .3), o('trim', B.root));
    both(s => { const L = LR(s), f = p => [s * p[0], p[1], p[2]], bare = c && s < 0;
      if (!bare) { S.add(RC(f([13.2, 64, 0]), f([14.6, 51, 1.4]), 6, 4.6), o('mail', B['uarm' + L], { k: .6 })); S.add(EL(f([12.6, 65, 0]), [6, 5.6, 6]), o('mail', B['uarm' + L], { k: .8 })); S.add(RC(f([14.7, 47, 1.6]), f([15.4, 39, 3.2]), 3.7, 3), o('leather', B['farm' + L], { k: .4 })); }
      S.add(RC(f([6.6, 33, .4]), f([7.2, 20, 1.6]), 6.2, 4.6), o('cloth', B['thigh' + L], { k: .7 })); S.add(RC(f([7, 20, 1.4]), f([7, 7, .4]), 4.6, 4), o('cloth', B['shin' + L], { k: .6 }));
      S.add(EL(f([7, 3, 3]), [3.4, 3.2, 5.8]), o('leather', B['foot' + L]));
      for (let j = 0; j < 3; j++) S.add(TO(f([7, 11 + j * 3.2, .6]), 4.3, .45, rotX(.05)), o('leather', B['shin' + L])); });   // boot bindings
    S.add(EL([0, 64, -.6], [14, 4.6, 9.6]), o('fur', B.chest, { k: 1.6 }));                                                     // the mantle's base
  }
  if (c) { // ice growing out of the shoulders and back
    both(s => K.crystals(S, [s * 14, 67, -1], [s * .5, 1, -.3], { count: 6, length: 10, r: 1.3, seed: D.seed + (s > 0 ? 1 : 2), bone: B['uarm' + LR(s)] }));
    for (const [x, y] of [[-4, 62], [3.6, 58], [0, 52], [-2.6, 66]]) K.crystals(S, [x, y, -8.6], [0, .5, -1], { count: 4, length: 9, r: 1.1, seed: D.seed + x * 7 + y, bone: B.chest }); }
  return S;
}

// hair, frost beard, the fur mantle
function addLocks(S, D) {
  const heavy = D.key === 'b';
  return K.locks(S, D.seed * 17 + 3, (p, n, s) => {
    const q = p[1] > 66 ? unhd(p) : p;
    if (s.bone === B.jaw && q[2] > 3) return { len: [8, 16], r: 1.05, flow: [0, -1, .25], up: .15, tag: 'beard', bone: B.jaw };
    if (s.bone === B.head && s.tag === 'skin' && q[2] > 3.5 && q[1] < 75 && Math.abs(q[0]) > 2.4) return { len: [5, 10], r: .9, flow: [0, -1, .35], up: .2, tag: 'beard', bone: B.jaw }; // cheeks
    if (!heavy && s.tag === 'fur' && n[1] > -.2) return { chance: .85, len: [5, 10], r: 1.5, flow: [0, -.8, -.6], up: .4, tag: 'fur', bone: B.chest };
    if (s.bone === B.head && s.tag === 'skin' && q[2] < 0 && q[1] < 77) return { len: [10, 18], r: 1, flow: [0, -1, -.5], up: .2, tag: 'hair', bone: B.hair };
    return null;
  });
}

// the axe: a long haft held upright in the right fist, a bearded blade above the head
function weapon(D) {
  const S = new Sculpt(), dir = norm([0, 1, .22]), at = t => add(GRIP, mul(dir, t)), fr = frameOf(dir), o = (tag, extra) => Object.assign({ tag, bone: B.weapon, k: .3 }, extra);
  const L = D.key === 'b' ? 38 : 34;
  S.add(RC(at(-10), at(L + 2), 1.05, .95), o('wood'));
  for (const t of [-10, -2, 4, L - 6]) S.add(TO(at(t), 1.25, .35, fr), o(t > 0 && t < L - 8 ? 'leather' : 'trim'));
  S.add(EL(at(-10.8), [1.4, 1.4, 1.4]), o('trim'));
  // the head: a socket, a bearded crescent blade facing forward-out (-x), a back spike
  const h = at(L - 2), out = mul(fr[0], -1), up = dir, fwd = fr[2];
  S.add(EL(h, [1.8, 3.4, 1.8], fr), o('metal'));
  const blade = (u, v) => add(add(h, mul(out, u)), mul(up, v));
  // a bearded blade: narrow at the socket, sweeping down into a hooked beard, the cutting edge a long crescent
  const edge = v => 1.6 + 8 * Math.sqrt(Math.max(0, 1 - ((v + 2) / 7.2) ** 2)), inner = v => (v < -1 ? 1.2 + (-1 - v) * 1.02 : 1.2);
  for (let i = 0; i <= 16; i++) { const v = -9 + i * .9, a = inner(v), b = edge(v); if (b - a < .8) continue; S.add(BX(blade((a + b) / 2, v), [(b - a) / 2, .55, .26 + (b - (a + b) / 2) * .0], [out, up, fwd], .12), o('metal', { k: .45 })); }
  for (let i = 0; i <= 18; i++) { const v = -9 + i * 1, p = blade(edge(v) + .1, v); S.add(EL(p, [.55, .75, .34], [out, up, fwd]), o(D.key === 'a' ? 'ice' : 'metal', { k: .3, root: h, L: 11, edge: 1 })); }
  S.add(RC(blade(-1.5, 0), blade(-6, -.6), 1, .1), o('metal'));
  if (D.key === 'b') for (let i = 0; i < 4; i++) S.add(EL(blade(4 + i * 1.3, -1.4 + (i % 2) * 2.2), [.38, .7, .45], [out, up, fwd]), o('glow', { k: .1 }));
  if (D.key === 'c') K.crystals(S, blade(5, 0), [0, .3, 0], { count: 9, length: 9, r: 2, seed: D.seed + 9, bone: B.weapon, spread: 1.2 });
  return S;
}

function details(D) {
  const S = new Sculpt();
  both(s => S.add(SC(EL([s * 2.2, 77.4, 6.9], [.9, .5, .6])), { bone: B.head, tag: 'eye', k: .1, c: hd([s * 2.2, 77.4, 6.9]) }));
  // two braids of the beard, bound with ice beads
  both(s => { let p = [s * 2.2, 70.6, 7.4]; for (let i = 0; i < 9; i++) { const q = add(p, [s * .15, -1.4, .15 - i * .05]); S.add(SC(EL(q, [.95, .9, .9])), { bone: B.jaw, tag: i === 4 || i === 8 ? 'ice' : 'beard', k: .2, root: p, L: 1 }); p = q; } });
  if (D.key === 'b') for (const [x, y] of [[0, 62], [-3.6, 57.5], [3.6, 57.5], [0, 54]]) S.add(EL([x, y, 9.3], [1.2, 1.6, .5]), { bone: B.chest, tag: 'glow', k: .1 }); // runes
  return S;
}

const RUNES = [[[-6, 64, 9], [-2, 56, 9.4]], [[6, 64, 9], [2, 56, 9.4]], [[-6, 56, 9.2], [6, 56, 9.2]], [[0, 66, 9], [0, 52, 9.6]]];
const segDist = (p, a, b) => { const ab = sub(b, a), t = clamp(F.dot(sub(p, a), ab) / F.dot(ab, ab), 0, 1); return len(sub(p, add(a, mul(ab, t)))); };
function custom(D) {
  return ({ p, n, s, tag, fine, big }) => {
    const hp = p[1] > 66 ? unhd(p) : p;
    if (tag === 'eye') { const q = mul(sub(p, s.c), 1 / HS), r0 = Math.hypot(q[0], q[1] * 1.6); return { c: mixc(mul(D.eye, .5), mixc(D.eye, [1, 1, 1], .6), clamp(1.1 - r0, 0, 1)), a: .04, sp: 1, gl: 1, ty: 0, st: 0 }; }
    if (tag === 'skin') { // frostbite: whitening on the extremities, the bare arm and the scar
      let frost = p[1] < 38 && Math.abs(p[0]) > 13 ? .45 : 0; if (D.key === 'c' && p[0] < -9 && p[1] > 36) frost = .55 + fine * .3;
      const scar = D.key === 'c' && segDist(hp, [-3.6, 80.2, 6], [-1.4, 73.6, 7.6]) < .6;
      return { c: scar ? [.85, .9, .96] : mixc(null || mul(D.colors.skin, .95 + fine * .1), [.88, .94, 1], clamp(frost, 0, 1)) };
    }
    if (tag === 'cloak') { const frost = clamp((36 - p[1]) / 30 + fine * .3 - .2, 0, 1); return { c: mixc(mixc(mul(D.colors.cloth, .6), D.colors.cloth, big), [.86, .93, 1], frost * .8), sp: .1 + frost * .5, gl: .25 + frost * .6, ty: 6, st: .9 }; }
    if (tag === 'darkmetal' || tag === 'metal') { // runes cut into the breastplate glow (ancient); frost settles on upward faces
      if (D.key === 'b' && p[2] > 7 && p[1] > 50 && p[1] < 68) { let dm = 9; for (const [a, b] of RUNES) dm = Math.min(dm, segDist(p, a, b)); if (dm < .35) return { c: D.colors.glow, a: .08, ty: 0, st: 0 }; }
      if (n[1] > .55) return { c: mixc(null || mul(D.colors[tag], .9 + fine * .2), [.85, .92, 1], (n[1] - .55) * 1.2) };
    }
    return null;
  };
}
const smoothF = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function build(variant, { lod = 0 } = {}) {
  const D = Object.assign({}, DESIGN[variant]), t0 = Date.now();
  const body = anatomy(D); body.build(4); const arm = armour(D); arm.build(3);
  const n = addLocks(arm, D) + addLocks(body, D); body.build(3); arm.build(3);
  const weap = weapon(D); weap.build(3); const fine = details(D); fine.build(2);
  const R = lod ? [1.2, 1.15, .9, .35] : [.5, .5, .4, .15];
  const { parts, log } = K.finish(D, [['body', body, R[0], 1.6], ['armour', arm, R[1], .8], ['weapon', weap, R[2], .5], ['detail', fine, R[3], .5]], custom(D));
  log.push('locks: ' + n + ', ' + (Date.now() - t0) + ' ms');
  return { parts, bones: BONES, clips: lod ? null : H.clips({ weight: .9, grip: -.1, banner: D.key === 'b', stance: 1 }), log, design: D };
}

module.exports = { build, DESIGN, BONES, B };
