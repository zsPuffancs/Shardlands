'use strict';
// Infernal Colossus, Region Boss of the Ember Wastes: a hunched titan of fused basalt boulders with magma in every
// seam, a molten core in its chest, a burning maw, huge stone fists.
//   A standard   basalt and magma, a glowing chest core, a few obsidian spires on the shoulders
//   B empowered  an obsidian-armoured furnace: black glass plates over shoulders, forearms and chest, a grated
//                furnace mouth in the chest, chimneys venting on the back
//   C ancient    an ancient titan: a crown of flame-tipped spires, the whole body cracked open on lava, carved runes,
//                cooled-lava stalactites hanging from the arms
// Humanoid rig, gorilla proportions; units match the other humanoid bosses.
const K = require('./kit');
const { F, H, B, POS: BASE, both, rotZ, LR, mixc } = K;
const { roundCone: RC, ellipsoid: EL, box: BX, Sculpt, norm, add, mul, sub, len, clamp, lerp, rng } = F;

const DROP = [0, -9, 6];
const POS = Object.assign({}, BASE); for (const k of ['head', 'jaw', 'hair']) POS[k] = add(POS[k], DROP);
const BONES = H.bonesFrom(POS);
const DESIGN = [
  { key: 'a', name: 'standard', seed: 3401, rock: [.24, .2, .19], rockDark: [.09, .08, .08], lava: [1, .42, .08], lavaHot: [1, .85, .4], colors: { glow: [1, .5, .1] } },
  { key: 'b', name: 'empowered', seed: 3402, rock: [.18, .15, .15], rockDark: [.06, .05, .05], lava: [1, .35, .06], lavaHot: [1, .8, .35], colors: { glow: [1, .45, .08] } },
  { key: 'c', name: 'ancient', seed: 3403, rock: [.2, .14, .12], rockDark: [.07, .04, .04], lava: [1, .5, .1], lavaHot: [1, .95, .55], colors: { glow: [1, .6, .2] } },
];

function body(D) {
  const S = new Sculpt(), R = rng(D.seed), A = (sh, o) => S.add(sh, Object.assign({ tag: 'rock' }, o));
  const lump = (c, r, bone, k = 1.4) => { A(EL(c, r, null), { bone, k }); for (let i = 0; i < 3; i++) S.sub(EL(add(c, [(R() - .5) * r[0] * 2, (R() - .5) * r[1] * 2, (R() - .5) * r[2] * 2]), [r[0] * .4, r[1] * .4, r[2] * .4]), { k: .8 }); };
  // a massive hunched torso of boulders
  lump([0, 60, 0], [15, 11, 11], B.chest, 3); lump([0, 66, -5], [13, 7, 9], B.chest, 3); both(s => lump([s * 12, 68, -2], [8, 7.4, 8], B.chest, 3));
  lump([0, 48, 1], [11, 7, 8.6], B.spine, 3); lump([0, 40, 0], [10, 5, 7], B.root, 3);
  // the head: a small brutish boulder sunk between the shoulders, a heavy jaw
  lump(add([0, 76, 1], DROP), [5.6, 5, 5.4], B.head, 1.6); A(EL(add([0, 77.8, 5], DROP), [5.4, 1.6, 2]), { bone: B.head, k: .8 });
  both(s => S.sub(EL(add([s * 2.2, 76.6, 6.2], DROP), [1, .7, .9]), { k: .3 }));
  lump(add([0, 71.6, 4.6], DROP), [5.4, 2.8, 4.4], B.jaw, 1.2); S.sub(BX(add([0, 73.4, 8.4], DROP), [3.6, .7, 3]), { k: .5 });
  // arms: huge, long, knuckle-walking fists
  both(s => { const L = LR(s), f = p => [s * p[0], p[1], p[2]];
    lump(f([15, 64, 0]), [7, 7, 7], B['uarm' + L], 2); A(RC(f([15, 62, 0]), f([17, 47, 2]), 6.4, 5.4), { bone: B['uarm' + L], k: 2 });
    A(RC(f([17, 47, 2]), f([18, 33, 4]), 5.6, 5.2), { bone: B['farm' + L], k: 1.6 }); lump(f([18.4, 29, 5]), [6.4, 5.6, 6.4], B['hand' + L], 1.4);
    for (let i = 0; i < 4; i++) lump(f([16 + i * 1.4, 24.6, 7 + (i % 2)]), [1.6, 2, 1.8], B['hand' + L], .6);
    // short heavy legs
    A(RC(f([7, 40, 0]), f([8, 22, 1.6]), 6.6, 5.6), { bone: B['thigh' + L], k: 2 }); A(RC(f([8, 22, 1.6]), f([8, 6, .4]), 5.6, 5), { bone: B['shin' + L], k: 1.6 }); lump(f([8, 3, 3]), [5, 3.4, 6.6], B['foot' + L], 1); });
  return S;
}

function extras(D) {
  const S = new Sculpt(), key = D.key, R = rng(D.seed + 5);
  // the molten core and the burning maw
  S.add(EL([0, 61, 9.4], [5, 5, 2.6]), { bone: B.chest, tag: 'core', k: .6 }); S.add(EL(add([0, 73.4, 7.4], DROP), [3, .6, 2]), { bone: B.head, tag: 'core', k: .3 });
  both(s => S.add(EL(add([s * 2.2, 76.6, 6.6], DROP), [.8, .5, .5]), { bone: B.head, tag: 'core', k: .1 }));
  // spires: a few on the shoulders (A), many and flame-tipped as a crown (C)
  const spire = (base, dir, l, r, bone) => { S.add(RC(base, add(base, mul(norm(dir), l * .8)), r, r * .5), { bone, tag: 'obsidian', k: .3 }); S.add(RC(add(base, mul(norm(dir), l * .8)), add(base, mul(norm(dir), l)), r * .5, .05), { bone, tag: key === 'c' ? 'flame' : 'obsidian', k: .2, root: base, L: l }); };
  both(s => { for (let i = 0; i < (key === 'c' ? 5 : 3); i++) spire([s * (10 + i * 2.6), 72 - i, -4 + i * 1.6], [s * .4, 1, -.3], key === 'c' ? 16 - i * 2 : 11 - i * 2, 1.8, B.chest); });
  if (key === 'c') for (let i = 0; i < 7; i++) { const a = (i / 6 - .5) * 2.2; spire(add([Math.sin(a) * 4.4, 80, Math.cos(a) * 3 - 1], DROP), [Math.sin(a) * .5, 1, -.2], 8 + (1 - Math.abs(i - 3) / 3) * 6, 1.1, B.head); }
  // B: obsidian plates, a furnace grate, chimneys
  if (key === 'b') { both(s => { const L = LR(s), f = p => [s * p[0], p[1], p[2]]; for (let j = 0; j < 3; j++) S.add(EL(f([16 + j * .8, 73 - j * 2.6, -1]), [8 - j, 2.4, 8 - j], rotZ(s * -.4)), { bone: B['uarm' + L], tag: 'obsidian', k: .4 });
      S.add(RC(f([17.2, 44, 4]), f([18, 35, 5.6]), 6.4, 6), { bone: B['farm' + L], tag: 'obsidian', k: .6 }); });
    for (let i = -2; i <= 2; i++) S.add(BX([i * 2, 61, 11.4], [.45, 5, .6], null, .1), { bone: B.chest, tag: 'iron', k: .1 });
    S.add(EL([0, 62, 8.6], [8, 8, 2], null), { bone: B.chest, tag: 'obsidian', k: .8 }); S.sub(EL([0, 61, 11], [5.6, 5.6, 3]), { k: .5 });
    for (const x of [-6, 6]) { S.add(RC([x, 66, -10], [x * 1.2, 82, -14], 2.4, 2), { bone: B.chest, tag: 'iron', k: .3 }); S.add(EL([x * 1.2, 82.4, -14], [2, .6, 2]), { bone: B.chest, tag: 'core', k: .1 }); } }
  // C: stalactites of cooled lava hanging from the arms
  if (key === 'c') both(s => { const L = LR(s); for (let i = 0; i < 5; i++) { const b = [s * (19 + (i % 2)), 54 - i * 4, 4 - i]; S.add(RC(b, add(b, [0, -5 - (i % 3) * 2, 0]), 1.2, .1), { bone: B['farm' + L], tag: 'obsidian', k: .2 }); } });
  return S;
}

function custom(D) {
  return ({ p, n, s, tag, fine, big }) => {
    if (tag === 'core') return { c: D.lavaHot, a: .01, sp: .5, gl: .5, ty: 0, st: 0 };
    if (tag === 'flame') { const t = s.root ? clamp(len(sub(p, s.root)) / s.L, 0, 1) : 1; return { c: mixc(D.lava, D.lavaHot, t), a: .05, sp: .5, gl: .5, ty: 0, st: 0 }; }
    if (tag === 'obsidian') return { c: mul([.05, .045, .055], .8 + fine * .5), sp: 1, gl: .95, ty: 4, st: .3 };
    if (tag === 'iron') return { c: mul([.2, .17, .15], .8 + fine * .4), sp: .8, gl: .6, ty: 8, st: .7 };
    if (tag === 'rock') { // basalt with magma glowing in the seams between boulders (deep in the creases), more on the ancient
      const seam = Math.abs(F.noise3(p[0] * .22, p[1] * .22, p[2] * .22, 3) - .5) < (D.key === 'c' ? .022 : .013);
      if (seam) return { c: mixc(D.lava, D.lavaHot, fine), a: .06, sp: .5, gl: .5, ty: 0, st: 0 };
      const ash = clamp((n[1] - .5) * 2, 0, 1) * .5; return { c: mixc(mixc(D.rock, D.rockDark, clamp((big - .4) * 1.4, 0, 1)), [.35, .33, .32], ash), sp: .2, gl: .35, ty: 5, st: 1 }; }
    return null;
  };
}

function build(variant, { lod = 0 } = {}) {
  const D = Object.assign({}, DESIGN[variant]), t0 = Date.now();
  const b = body(D); b.build(4); const ex = extras(D); ex.build(2.5);
  const R = lod ? [1.3, .7] : [.56, .32];
  const { parts, log } = K.finish(D, [['body', b, R[0], 2], ['extras', ex, R[1], .6]], custom(D));
  log.push((Date.now() - t0) + ' ms');
  return { parts, bones: BONES, clips: lod ? null : H.clips({ weight: 1, grip: .2, stance: 1.2, kneelDrop: 14 }), log, design: D };
}
module.exports = { build, DESIGN, BONES, B };
