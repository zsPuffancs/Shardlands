'use strict';
// Spider Broodmother, Region Boss of Gloomwood: a huge spider queen with a swollen patterned abdomen, an eye cluster,
// curved fangs, bristled jointed legs, an egg sac slung beneath her.
//   A standard   violet and black, a pale skull pattern on the abdomen, a silk egg sac with glowing eggs
//   B empowered  armoured: black chitin plates and spines over legs and back, glowing green venom glands swelling on
//                the abdomen, dripping fangs, a second pair of pedipalp blades
//   C ancient    a crystal queen: a translucent crystal abdomen with a glowing heart, crystal spikes on the legs, a
//                silk mantle of webbing draped from her back, a crown of eyes
// An 8-legged rig (28 bones): root, thorax, abdomen, head, fangs, palps, and three bones per leg; a walking gait that
// moves alternate tetrads of legs.
const K = require('./kit');
const F = require('./forge');
const { mixc } = K;
const { roundCone: RC, ellipsoid: EL, torus: TO, box: BX, Sculpt, norm, add, mul, sub, len, clamp, lerp, rng, qAxis, qMul } = F;
const both = f => { f(1); f(-1); };

const LEGS = [ // per side: hip angle (around y, 0 = forward), reach
  [.5, 30], [1.1, 26], [1.9, 26], [2.5, 30]];
const BL = [['root', -1, [0, 18, 0]], ['thorax', 0, [0, 18, 4]], ['abdomen', 0, [0, 21, -12]], ['head', 1, [0, 18, 14]], ['fangs', 3, [0, 15, 18]], ['palps', 3, [0, 16, 17]]];
const legPts = (s, i) => { const [a, reach] = LEGS[i], dir = [s * Math.sin(a), 0, Math.cos(a)], hip = add([s * 5, 18, 4], mul(dir, 3)), knee = add(add(hip, mul(dir, reach * .38)), [0, 16, 0]), ankle = add(add(hip, mul(dir, reach * .82)), [0, 4, 0]), foot = add(add(hip, mul(dir, reach)), [0, -18, 0]);
  return [hip, knee, ankle, [foot[0], 0.6, foot[2]]]; };
both(s => LEGS.forEach((l, i) => { const [hip, knee, ankle] = legPts(s, i), n = (s > 0 ? 'L' : 'R') + i, p = 1; BL.push(['leg' + n + 'a', p, hip], ['leg' + n + 'b', BL.length, knee], ['leg' + n + 'c', BL.length + 1, ankle]); }));
const BONES = BL.map(([name, parent, pos]) => ({ name, parent, pos }));
const B = Object.fromEntries(BONES.map((b, i) => [b.name, i]));

const DESIGN = [
  { key: 'a', name: 'standard', seed: 2301, body: [.3, .14, .36], dark: [.07, .04, .09], pale: [.86, .8, .7], hair: [.18, .1, .2], colors: { glow: [1, .35, .3], horn: [.08, .06, .08] }, eye: [1, .25, .2] },
  { key: 'b', name: 'empowered', seed: 2302, body: [.2, .09, .24], dark: [.03, .02, .04], pale: [.5, .9, .3], hair: [.1, .06, .12], colors: { glow: [.55, 1, .2], horn: [.05, .04, .05], darkmetal: [.05, .04, .06] }, eye: [.6, 1, .2] },
  { key: 'c', name: 'ancient', seed: 2303, body: [.24, .2, .4], dark: [.08, .06, .14], pale: [.85, .8, 1], hair: [.3, .26, .4], colors: { glow: [.75, .55, 1], horn: [.3, .26, .4] }, eye: [.8, .65, 1] },
];

function body(D) {
  const S = new Sculpt(), key = D.key;
  S.add(EL([0, 18, 5], [8, 5.6, 9]), { bone: B.thorax, tag: 'chitin', k: 2 });
  S.add(EL([0, 18.4, 14.4], [5, 4.4, 4.4]), { bone: B.head, tag: 'chitin', k: 1.6 });
  S.add(EL([0, 22, -14], [13, 12, 16]), { bone: B.abdomen, tag: key === 'c' ? 'crystal' : 'abdomen', k: 3 });
  S.add(EL([0, 18.6, -1.6], [4, 3.6, 3]), { bone: B.abdomen, tag: 'chitin', k: 1.4 });                  // pedicel
  S.add(EL([0, 14, -28.6], [2.4, 2.4, 1.8]), { bone: B.abdomen, tag: 'chitin', k: 1 });                // spinnerets
  // legs: coxa, femur arching up, patella, tibia sloping down to the ground, bristles on the femur
  both(s => LEGS.forEach((l, i) => { const [hip, knee, ankle, foot] = legPts(s, i), n = (s > 0 ? 'L' : 'R') + i;
    S.add(RC(hip, knee, 2.4, 1.9), { bone: B['leg' + n + 'a'], tag: 'leg', k: .7 }); S.add(EL(knee, [2.2, 2.2, 2.2]), { bone: B['leg' + n + 'b'], tag: 'joint', k: .6 });
    S.add(RC(knee, ankle, 1.8, 1.4), { bone: B['leg' + n + 'b'], tag: 'leg', k: .6 }); S.add(RC(ankle, foot, 1.3, .5), { bone: B['leg' + n + 'c'], tag: 'leg', k: .5 }); }));
  // fangs and pedipalps
  both(s => { S.add(RC([s * 1.6, 16.6, 17.6], [s * 1.4, 12, 19.4], 1.2, .9), { bone: B.fangs, tag: 'chitin', k: .5 }); S.add(RC([s * 1.4, 12, 19.4], [s * .6, 9.4, 18], .8, .1), { bone: B.fangs, tag: 'fang', k: .2 });
    S.add(RC([s * 3, 17, 16], [s * 5, 15, 22], 1, .8), { bone: B.palps, tag: 'leg', k: .4 }); S.add(RC([s * 5, 15, 22], [s * 4.4, 12, 25], .8, .5), { bone: B.palps, tag: 'leg', k: .3 }); });
  return S;
}

function extras(D) {
  const S = new Sculpt(), key = D.key, R = rng(D.seed);
  // eyes: two big front eyes, a ring of smaller ones (C: a crown of eyes)
  both(s => { S.add(EL([s * 1.7, 20.2, 18], [1.3, 1.3, 1.1]), { bone: B.head, tag: 'eye', k: .1 }); S.add(EL([s * 3.4, 20.8, 16.6], [.8, .8, .8]), { bone: B.head, tag: 'eye', k: .1 }); S.add(EL([s * 2.4, 22.2, 15], [.7, .7, .7]), { bone: B.head, tag: 'eye', k: .1 }); });
  if (key === 'c') for (let i = 0; i < 9; i++) { const a = (i / 8 - .5) * 2.6; S.add(EL([Math.sin(a) * 4, 23 + Math.cos(a) * .8, 13 + Math.cos(a) * 2.4], [.6, .6, .6]), { bone: B.head, tag: 'eye', k: .1 }); }
  // bristles on the legs and abdomen
  both(s => LEGS.forEach((l, i) => { const [hip, knee, ankle] = legPts(s, i), n = (s > 0 ? 'L' : 'R') + i; for (let k = 0; k < 7; k++) { const t = (k + .5) / 7, p = add(hip, mul(sub(knee, hip), t)), d = norm(add(sub(knee, hip), [0, 6, 0])); S.add(RC(p, add(p, add(mul(d, 1.6), [s * .8, 1.2, 0])), .28, .05), { bone: B['leg' + n + 'a'], tag: 'hair', k: .05 }); }
    if (key !== 'a') for (let k = 0; k < 3; k++) { const t = (k + .5) / 3, p = add(knee, mul(sub(ankle, knee), t)); key === 'b' ? S.add(RC(p, add(p, [s * 1.4, 3, 0]), .8, .05), { bone: B['leg' + n + 'b'], tag: 'spike', k: .1 }) : K.crystals(S, p, [s * .3, 1, 0], { count: 1, length: 4, r: .7, seed: D.seed + i * 3 + k, bone: B['leg' + n + 'b'], tag: 'crystal', spread: .1 }); } }));
  // A: a silk egg sac beneath the abdomen with glowing eggs
  if (key === 'a') { S.add(EL([0, 10, -16], [6, 5, 6.4]), { bone: B.abdomen, tag: 'silk', k: 1 }); for (let i = 0; i < 8; i++) S.add(EL(add([0, 10, -16], [(R() - .5) * 9, (R() - .5) * 6, (R() - .5) * 9]), [1.2, 1.2, 1.2]), { bone: B.abdomen, tag: 'egg', k: .4 }); }
  // B: chitin armour plates and spines along the abdomen, venom glands, a second blade pair
  if (key === 'b') { for (let i = 0; i < 5; i++) S.add(EL([0, 33 - i * .6, -6 - i * 4.6], [8 - Math.abs(i - 2), 1.4, 3.2]), { bone: B.abdomen, tag: 'plate', k: .6 });
    for (let i = 0; i < 6; i++) { const z = -4 - i * 4; both(s => S.add(RC([s * 6, 31 - i * .4, z], [s * 9, 38 - i * .6, z - 2], 1, .1), { bone: B.abdomen, tag: 'spike', k: .2 })); }
    both(s => { S.add(EL([s * 11, 22, -14], [2.4, 4, 4]), { bone: B.abdomen, tag: 'gland', k: 1 }); S.add(RC([s * 4, 17.6, 15], [s * 9, 22, 22], .9, .1), { bone: B.palps, tag: 'spike', k: .1 }); }); }
  // C: a silk mantle of webbing draped from the abdomen, a crystal heart
  if (key === 'c') { S.add(EL([0, 22, -14], [4, 4.6, 4]), { bone: B.abdomen, tag: 'heart', k: .4 }); const top = []; for (let i = 0; i <= 8; i++) { const a = (i / 8 - .5) * 2.6; top.push([Math.sin(a) * 12, 32 - Math.abs(Math.sin(a)) * 3, -14 - Math.cos(a) * 6]); }
    K.sheet(S, top, 26, { bone: B.abdomen, tag: 'silk', thick: .35, folds: 7, foldDepth: 1, flare: .3, rag: .5, seed: D.seed, out: [0, 0, -1] }); }
  return S;
}

// a spider's gait: legs in alternating tetrads lift and swing; a rearing strike; a web-spitting rear-up
function clips() {
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1], TAU = Math.PI * 2, sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const legRot = (s, i, swing, lift) => { const r = {}, n = (s > 0 ? 'L' : 'R') + i; r[B['leg' + n + 'a']] = qMul(qAxis(Y, swing * s), qAxis(Z, lift * s)); r[B['leg' + n + 'b']] = qAxis(Z, -lift * .5 * s); return r; };
  const gait = (dur, amp, lift) => ({ dur, track: t => { const ph = t / dur * TAU, s = { rot: {} };
    both(sd => LEGS.forEach((l, i) => { const g = ((i + (sd > 0 ? 0 : 1)) % 2) * Math.PI, a = Math.sin(ph + g), up = Math.max(0, Math.cos(ph + g)); Object.assign(s.rot, legRot(sd, i, a * amp, up * lift)); }));
    s.rot[B.abdomen] = qAxis(X, Math.sin(ph * 2) * .03); s.root = [0, Math.abs(Math.sin(ph)) * .6, 0]; return s; } });
  const still = () => ({ rot: {} });
  return {
    Idle: { dur: 3, track: t => { const ph = t / 3 * TAU, s = still(); s.rot[B.abdomen] = qAxis(X, Math.sin(ph) * .04); s.rot[B.palps] = qAxis(X, Math.sin(ph * 3) * .15); s.rot[B.fangs] = qAxis(X, Math.max(0, Math.sin(ph * 2)) * .1);
      both(sd => LEGS.forEach((l, i) => Object.assign(s.rot, legRot(sd, i, Math.sin(ph + i) * .02, 0)))); s.root = [0, Math.sin(ph) * .3, 0]; return s; } },
    Walk: gait(.9, .22, .25), Run: gait(.55, .3, .35),
    Attack: { dur: .62, track: t => { const u = t / .62, w = sm(0, .4, u) * (1 - sm(.4, .55, u)), h = sm(.4, .55, u) * (1 - sm(.7, 1, u)), s = still();
      s.rot[B.thorax] = qAxis(X, -w * .3 + h * .2); s.rot[B.head] = qAxis(X, -w * .2 + h * .3); s.rot[B.fangs] = qAxis(X, w * .5 - h * .4);
      both(sd => { Object.assign(s.rot, legRot(sd, 0, -w * .4, w * .9 - h * .3)); }); s.root = [0, w * 3, h * 6 - w * 2]; return s; } },
    Attack2: { dur: 1.1, track: t => { const u = t / 1.1, h = sm(0, .3, u) * (1 - sm(.75, 1, u)), s = still(); s.rot[B.abdomen] = qAxis(X, -h * .6); s.rot[B.thorax] = qAxis(X, -h * .25);
      both(sd => { Object.assign(s.rot, legRot(sd, 0, -h * .3, h * 1.1)); Object.assign(s.rot, legRot(sd, 1, -h * .2, h * .6)); }); s.root = [0, h * 2, 0]; return s; } },
    RecieveHit: { dur: .4, track: t => { const k = Math.sin(t / .4 * Math.PI), s = still(); s.rot[B.thorax] = qAxis(X, k * .15); s.root = [0, 0, -k * 2]; return s; } },
    // curls up: legs fold over the body and it rolls onto its back
    Death: { dur: 1.8, track: t => { const u = t / 1.8, c = sm(0, .5, u), f = sm(.3, .9, u), s = still();
      both(sd => LEGS.forEach((l, i) => { const n = (sd > 0 ? 'L' : 'R') + i; s.rot[B['leg' + n + 'a']] = qAxis(Z, c * 1 * sd); s.rot[B['leg' + n + 'b']] = qAxis(Z, -c * 1.4 * sd); s.rot[B['leg' + n + 'c']] = qAxis(Z, -c * .8 * sd); }));
      s.rot[B.root] = qAxis(Z, f * 2.8); s.root = [0, f * 8 - f * f * 6, 0]; return s; } },
  };
}

function custom(D) {
  return ({ p, n, s, tag, fine, big }) => {
    const t = s.root && s.L ? clamp(len(sub(p, s.root)) / s.L, 0, 1) : .5;
    if (tag === 'eye') return { c: mixc(D.eye, [1, 1, 1], .25), a: .1, sp: 1, gl: 1, ty: 0, st: 0 };
    if (tag === 'abdomen') { // the pale skull pattern on the back of the abdomen
      const q = sub(p, [0, 22, -14]), up = n[1] > .3, skull = up && (Math.hypot(q[0] / 7, (q[2] + 2) / 6) < 1 && !(Math.hypot((Math.abs(q[0]) - 2.6) / 1.8, (q[2] + 1) / 1.6) < 1) || Math.abs(q[0]) < .6 && q[2] < -7 && q[2] > -12);
      const stripes = Math.abs(Math.sin(q[2] * .7)) < .2 && !up; let c = mixc(D.body, D.dark, clamp((big - .4) * 1.4, 0, 1));
      if (skull) c = D.pale; else if (stripes) c = mixc(c, D.pale, .5); return { c: mul(c, .9 + fine * .2), sp: .5, gl: .55, ty: 1, st: .7 }; }
    if (tag === 'chitin' || tag === 'leg' || tag === 'plate') { const band = tag === 'leg' && Math.abs(Math.sin(p[1] * .9 + p[0] * .3)) < .25; const c = mixc(D.body, D.dark, band ? .1 : .7);
      return { c: mul(c, .9 + fine * .2), sp: .8, gl: .75, ty: tag === 'plate' ? 8 : 4, st: .5 }; }
    if (tag === 'joint') return { c: D.dark, sp: .8, gl: .8, ty: 4, st: .4 };
    if (tag === 'hair') return { c: D.hair, sp: .1, gl: .2, ty: 1, st: 1 };
    if (tag === 'fang' || tag === 'spike') return { c: D.key === 'b' && tag === 'fang' ? mixc([.05, .05, .05], D.colors.glow, .6) : [.06, .05, .06], a: D.key === 'b' && tag === 'fang' ? .5 : 1, sp: .9, gl: .9, ty: 4, st: .4 };
    if (tag === 'silk') return { c: mixc([.82, .8, .78], [.96, .96, .94], fine), a: D.key === 'c' ? .6 : 1, sp: .3, gl: .4, ty: 6, st: .6 };
    if (tag === 'egg' || tag === 'gland' || tag === 'heart') return { c: D.colors.glow, a: .1, sp: 1, gl: 1, ty: 0, st: 0 };
    if (tag === 'crystal') { const edge = F.noise3(p[0] * .6, p[1] * .6, p[2] * .6, 4) > .65; return { c: edge ? D.colors.glow : mixc(D.body, D.pale, .3), a: edge ? .2 : .5, sp: 1, gl: .97, ty: 5, st: .15 }; }
    return null;
  };
}

function build(variant, { lod = 0 } = {}) {
  const D = Object.assign({}, DESIGN[variant]), t0 = Date.now();
  const b = body(D); b.build(3); const ex = extras(D); ex.build(2);
  const R = lod ? [.9, .55] : [.42, .3];
  const { parts, log } = K.finish(D, [['body', b, R[0], .9], ['extras', ex, R[1], .5]], custom(D));
  log.push((Date.now() - t0) + ' ms');
  return { parts, bones: BONES, clips: lod ? null : clips(), log, design: D };
}
module.exports = { build, DESIGN, BONES, B };
