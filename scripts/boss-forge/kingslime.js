'use strict';
// King Slime, Region Boss of Whispering Meadows: a towering, wobbling dome of jelly with a glowing core, big eyes, a
// wide mouth and a crown; things it has swallowed float inside it.
//   A standard   bright green jelly, a gold crown, bubbles and a few swallowed bones and coins inside
//   B empowered  darker toxic jelly studded with green crystals breaking out of its skin, swallowed swords, a shield and
//                a helmet stuck inside, an iron crown with spikes, a dripping lower rim
//   C ancient    golden amber ooze, a tall jewelled crown, a halo of floating droplets, a royal cape of jelly draped
//                behind it, an old king's skeleton suspended inside
// A soft-body rig: the dome squashes and stretches, the top wobbles, eyes and mouth ride their own bones.
const K = require('./kit');
const F = require('./forge');
const { mixc } = K;
const { roundCone: RC, ellipsoid: EL, torus: TO, box: BX, Sculpt, norm, add, mul, sub, len, clamp, lerp, rng, qAxis, qMul } = F;
const both = f => { f(1); f(-1); };

const BONES = [['root', -1, [0, 0, 0]], ['body', 0, [0, 14, 0]], ['top', 1, [0, 34, 0]], ['crown', 2, [0, 48, 0]], ['face', 1, [0, 26, 14]], ['mouth', 4, [0, 19, 17]],
  ['rimF', 0, [0, 5, 18]], ['rimB', 0, [0, 5, -18]], ['rimL', 0, [18, 5, 0]], ['rimR', 0, [-18, 5, 0]], ['inside', 1, [0, 20, 0]], ['halo', 2, [0, 54, -2]]].map(([name, parent, pos]) => ({ name, parent, pos }));
const B = Object.fromEntries(BONES.map((b, i) => [b.name, i]));

const DESIGN = [
  { key: 'a', name: 'standard', seed: 2201, jelly: [.22, .78, .3], deep: [.06, .4, .12], core: [.7, 1, .5], colors: { trim: [.95, .76, .26], bone: [.86, .84, .74], metal: [.5, .5, .52], gem: [.85, .15, .2], glow: [.6, 1, .5] }, eye: [.05, .05, .05] },
  { key: 'b', name: 'empowered', seed: 2202, jelly: [.16, .5, .12], deep: [.04, .2, .04], core: [.8, 1, .2], colors: { trim: [.36, .36, .38], bone: [.8, .78, .7], metal: [.46, .46, .5], darkmetal: [.14, .14, .16], gem: [.4, 1, .3], glow: [.65, 1, .2] }, eye: [.6, 0, 0] },
  { key: 'c', name: 'ancient', seed: 2203, jelly: [.92, .62, .16], deep: [.5, .26, .04], core: [1, .9, .5], colors: { trim: [1, .82, .3], bone: [.9, .88, .78], metal: [.6, .5, .3], gem: [.2, .5, 1], cloth: [.5, .08, .1], glow: [1, .85, .45] }, eye: [.05, .03, .02] },
];

function jelly(D) {
  const S = new Sculpt(), key = D.key, R = rng(D.seed);
  // a broad dome, heavier at the bottom, spreading into a rim on the ground
  S.add(EL([0, 22, 0], [21, 22, 19.5]), { bone: B.body, tag: 'jelly', k: 4 });
  S.add(EL([0, 36, -1], [14, 10, 13]), { bone: B.top, tag: 'jelly', k: 5 });
  S.add(EL([0, 6, 0], [25, 6.4, 23]), { bone: B.root, tag: 'jelly', k: 5 });
  for (const [b, p] of [[B.rimF, [0, 3, 19]], [B.rimB, [0, 3, -19]], [B.rimL, [20, 3, 0]], [B.rimR, [-20, 3, 0]]]) S.add(EL(p, [10, 3.6, 10]), { bone: b, tag: 'jelly', k: 4 });
  // the face: eye sockets, a wide mouth that can open
  both(s => S.sub(EL([s * 6.6, 28, 18.6], [3.6, 4.4, 2.6]), { k: .8 }));
  S.sub(EL([0, 18.6, 19.8], [8.6, 2.4 + (key === 'b' ? 1 : 0), 3.4]), { k: 1 });
  // B: drips around the lower rim and crystals breaking out of the skin
  if (key === 'b') { for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + R() * .3, r = 22; const top = [Math.cos(a) * r, 10 + R() * 6, Math.sin(a) * r * .92]; S.add(RC(top, add(top, [Math.cos(a) * 1.5, -6 - R() * 4, Math.sin(a) * 1.5]), 1.8, .9), { bone: B.body, tag: 'jelly', k: 1.5 }); } }
  // C: a cape of jelly draped from the crown to the ground behind it
  if (key === 'c') { const top = []; for (let i = 0; i <= 8; i++) { const a = (i / 8 - .5) * 2.4; top.push([Math.sin(a) * 15, 40 - Math.abs(Math.sin(a)) * 4, -Math.cos(a) * 11 - 3]); }
    K.sheet(S, top, 38, { bone: B.top, tag: 'cape', thick: .9, folds: 6, foldDepth: 1.4, flare: .3, seed: D.seed, boneOf: t => (t < .4 ? B.top : B.rimB) }); }
  return S;
}

// the jelly is opaque in this renderer, so what it swallowed is stuck half-way out of its skin
const onSkin = (a, y, out = 0) => { const r = Math.sqrt(Math.max(0, 1 - ((y - 22) / 22) ** 2)), rr = 21 * r + out, rz = 19.5 * r + out; return [Math.cos(a) * rr, y, Math.sin(a) * rz]; };
function inner(D) {
  const S = new Sculpt(), key = D.key, R = rng(D.seed + 1);
  for (let i = 0; i < 22; i++) { const a = R() * Math.PI * 2, y = 8 + R() * 30; S.add(EL(onSkin(a, y, -.4), [lerp(.8, 2, R())].map(r => [r, r, r])[0]), { bone: y > 32 ? B.top : B.body, tag: 'bubble', k: .3 }); }
  if (key === 'a') { K.skull(S, onSkin(2.4, 14, -1), { r: 2.8, jawOpen: .3, bone: B.body, jawBone: B.body }); K.boneLimb(S, onSkin(.3, 12, -3), onSkin(.5, 18, 4), .9, B.body);
    for (let i = 0; i < 7; i++) { const a = -1.2 + i * .25, p0 = onSkin(a, 36 + (i % 3), 0); S.add(TO(p0, 1.2, .3, [[1, 0, 0], [0, 0, 1], [0, -1, 0]]), { bone: B.top, tag: 'trim', k: .1 }); } }
  if (key === 'b') { for (const [a, y, tilt] of [[.6, 14, .3], [2.6, 20, -.4], [4.2, 30, .2], [5.4, 12, -.2]]) { const inS = onSkin(a, y, -6), out = norm(sub(onSkin(a, y, 4), inS)), d = norm(add(out, [0, tilt + .3, 0])), tip = add(inS, mul(d, 4));
      const fr = [norm(F.cross(d, [0, 1, .01])), d, norm(F.cross(norm(F.cross(d, [0, 1, .01])), d))]; S.add(BX(add(inS, mul(d, -2)), [.9, 7, .3], fr, .1), { bone: B.body, tag: 'metal', k: .1 });
      S.add(BX(add(tip, mul(d, 1)), [3, .5, .7], fr, .1), { bone: B.body, tag: 'darkmetal', k: .1 }); S.add(RC(add(tip, mul(d, 1.4)), add(tip, mul(d, 6)), .6, .6), { bone: B.body, tag: 'darkmetal', k: .1 }); }
    S.add(EL(onSkin(3.6, 18, 0), [4.4, 5.4, 1], null), { bone: B.body, tag: 'darkmetal', k: .3 }); }
  if (key === 'c') { K.skull(S, onSkin(1.9, 26, -1.2), { r: 3.4, jawOpen: .35, bone: B.body, jawBone: B.body });
    const sh = onSkin(.9, 20, -3); K.boneLimb(S, sh, onSkin(.75, 26, 5), 1, B.body); K.boneLimb(S, onSkin(.75, 26, 5), onSkin(.7, 33, 9), .8, B.body);
    S.add(TO(add(onSkin(1.9, 26, -1.2), [0, 3.4, 0]), 3, .5, null), { bone: B.body, tag: 'trim', k: .1 }); }
  return S;
}

function regalia(D) {
  const S = new Sculpt(), key = D.key, R = rng(D.seed + 2);
  // the crown
  const c = [0, 44.4, -1], r = key === 'c' ? 7 : 6.4;
  S.add(TO(c, r, 1.1, null), { bone: B.crown, tag: key === 'b' ? 'darkmetal' : 'trim', k: .3 });
  const n = key === 'b' ? 9 : 6, h = key === 'c' ? 8 : key === 'b' ? 6 : 4;
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, b0 = add(c, [Math.cos(a) * r, 0, Math.sin(a) * r]); S.add(RC(b0, add(b0, [Math.cos(a) * .6, h * (i % 2 ? .7 : 1), Math.sin(a) * .6]), key === 'b' ? .9 : 1.2, .15), { bone: B.crown, tag: key === 'b' ? 'metal' : 'trim', k: .25 });
    if (key !== 'b' && !(i % 2)) S.add(EL(add(b0, [0, 1.6, 0]), [.9, 1.1, .7]), { bone: B.crown, tag: 'gem', k: .1 }); }
  if (key === 'c') { S.add(EL(add(c, [0, 1.5, r]), [1.6, 2, 1]), { bone: B.crown, tag: 'gem', k: .2 }); S.add(TO([0, 54, -2], 11, .35, [[1, 0, 0], [0, 0, 1], [0, -1, 0]]), { bone: B.halo, tag: 'glow', k: .1 });
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; S.add(EL([Math.cos(a) * 13, 54 + Math.sin(a) * 13, -2], [1, 1.3, 1]), { bone: B.halo, tag: 'droplet', k: .1 }); } }
  // eyes: big glossy domes with pupils
  both(s => { S.add(EL([s * 6.6, 28, 17.6], [3.4, 4.2, 2.4]), { bone: B.face, tag: 'eyewhite', k: .3 }); S.add(EL([s * 6.2, 27.4, 19.6], [1.6, 2.2, 1]), { bone: B.face, tag: 'pupil', k: .2 }); });
  // B: crystals breaking out of the skin
  if (key === 'b') for (let i = 0; i < 9; i++) { const a = R() * Math.PI * 2, y = 16 + R() * 22, base = [Math.cos(a) * 18 * (1 - (y - 16) / 50), y, Math.sin(a) * 16 * (1 - (y - 16) / 50)]; K.crystals(S, base, norm([Math.cos(a), .8, Math.sin(a)]), { count: 4, length: 9, r: 1.6, seed: D.seed + i, bone: y > 30 ? B.top : B.body, tag: 'gem', spread: .4 }); }
  return S;
}

// soft-body clips: squash and stretch on hops, a lunging bite, a swelling summon, a melt on death
function clips() {
  const X = [1, 0, 0], Z = [0, 0, 1], Y = [0, 1, 0], TAU = Math.PI * 2, sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const base = (sq, lean = 0, tw = 0) => { const s = { rot: {}, scl: {}, pos: {} }; s.scl[B.body] = [1 + sq * .5, 1 - sq, 1 + sq * .5]; s.rot[B.body] = qMul(qAxis(X, lean), qAxis(Y, tw)); s.rot[B.top] = qAxis(Z, -lean * .6); return s; };
  const hop = (dur, h) => ({ dur, track: t => { const u = t / dur, up = Math.max(0, Math.sin(u * TAU)), land = Math.max(0, -Math.sin(u * TAU)); const s = base(land * .22 - up * .12, .08); s.root = [0, up * h, 0]; s.rot[B.top] = qAxis(X, -up * .1 + land * .08); s.rot[B.crown] = qAxis(Z, Math.sin(u * TAU * 2) * .06); return s; } });
  return {
    Idle: { dur: 3, track: t => { const ph = t / 3 * TAU, s = base(Math.sin(ph) * .05); s.rot[B.top] = qMul(qAxis(Z, Math.sin(ph) * .05), qAxis(X, Math.sin(ph * 2) * .03)); s.rot[B.crown] = qAxis(Z, Math.sin(ph + 1) * .06); s.scl[B.mouth] = [1, 1 + Math.max(0, Math.sin(ph * 2)) * .3, 1]; s.rot[B.halo] = qAxis(Z, ph / 3); return s; } },
    Walk: hop(1, 5), Run: hop(.7, 9),
    Attack: { dur: .6, track: t => { const u = t / .6, w = sm(0, .4, u) * (1 - sm(.4, .55, u)), h = sm(.4, .55, u) * (1 - sm(.7, 1, u)); const s = base(w * .2 - h * .2, h * .35); s.root = [0, h * 3, h * 9 - w * 2]; s.scl[B.mouth] = [1 + h * .4, 1 + h * 2.4, 1]; return s; } },
    Attack2: { dur: 1.1, track: t => { const u = t / 1.1, h = sm(0, .35, u) * (1 - sm(.75, 1, u)); const s = base(-h * .2); s.scl[B.body] = [1 + h * .25, 1 + h * .25, 1 + h * .25]; s.scl[B.inside] = [1 + h * .3, 1 + h * .3, 1 + h * .3]; s.scl[B.mouth] = [1, 1 + h * 1.8, 1]; return s; } },
    RecieveHit: { dur: .4, track: t => { const k = Math.sin(t / .4 * Math.PI); const s = base(k * .25, -k * .2); s.root = [0, 0, -k * 2]; return s; } },
    Death: { dur: 1.8, track: t => { const u = t / 1.8, m = sm(0, .8, u); const s = base(m * .8); s.scl[B.body] = [1 + m * .8, Math.max(.05, 1 - m * .92), 1 + m * .8]; s.pos[B.crown] = [m * 6, -m * 30, m * 8]; s.rot[B.crown] = qAxis(Z, m * 1.4); for (const b of [B.rimF, B.rimB, B.rimL, B.rimR]) s.scl[b] = [1 + m, 1, 1 + m]; return s; } },
  };
}

function custom(D) {
  return ({ p, n, s, tag, fine, big }) => {
    if (tag === 'jelly' || tag === 'cape') { const rim = clamp(1 - Math.abs(n[1]) * .2 - .4, 0, 1), depth = clamp(1 - p[1] / 44, 0, 1);
      const c = mixc(mixc(D.jelly, D.deep, depth * .6), [1, 1, 1], Math.max(0, n[1] - .7) * .9 * (fine > .4 ? 1 : .4)); return { c, a: lerp(.5, .78, rim) - (tag === 'cape' ? 0 : .1), sp: 1, gl: .97, ty: 3, st: .15 }; }
    if (tag === 'core') return { c: D.core, a: .02, sp: 1, gl: 1, ty: 0, st: 0 };
    if (tag === 'bubble') return { c: mixc(D.jelly, [1, 1, 1], .6), a: .3, sp: 1, gl: 1, ty: 0, st: 0 };
    if (tag === 'droplet') return { c: D.colors.glow, a: .1, sp: 1, gl: 1, ty: 0, st: 0 };
    if (tag === 'eyewhite') return { c: [.96, .97, .96], sp: 1, gl: .95, ty: 0, st: 0 };
    if (tag === 'pupil') return { c: D.eye, a: D.key === 'b' ? .2 : 1, sp: 1, gl: .95, ty: 0, st: 0 };
    if (tag === 'gem' && D.key === 'b') { const t = s.root && s.L ? clamp(len(sub(p, s.root)) / s.L, 0, 1) : .5; return { c: mixc([.1, .4, .1], [.7, 1, .5], t), a: lerp(.6, .2, t), sp: 1, gl: .95, ty: 5, st: .2 }; }
    return null;
  };
}

function build(variant, { lod = 0 } = {}) {
  const D = Object.assign({}, DESIGN[variant]), t0 = Date.now();
  const J = jelly(D); J.build(4); const I = inner(D); I.build(2.5); const Rg = regalia(D); Rg.build(2.5);
  const R = lod ? [1.1, .7, .6] : [.5, .3, .25];
  const { parts, log } = K.finish(D, [['jelly', J, R[0], 6], ['inside', I, R[1], .5], ['regalia', Rg, R[2], .6]], custom(D));
  log.push((Date.now() - t0) + ' ms');
  return { parts, bones: BONES, clips: lod ? null : clips(), log, design: D };
}
module.exports = { build, DESIGN, BONES, B };
