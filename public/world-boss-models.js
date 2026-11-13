// Shardlands: the eight dedicated World Boss appearances, three variants each.
//
// Visual only. The server sends a look code with the World Boss of each tier (src/world/world-boss-looks.js; 0 for
// every other monster): identity * 3 + variant + 1. The boss still fights as the Region Boss type its tier rolled, so
// these models are sized to that type's World Boss hitbox (t.r) and keep the usual animation inputs (walk phase e.ph,
// movement e.mv, attack e.atkT, hit flash e.flash). Region Boss models (game.js, enemy-models.js) are untouched.
// Built from the engine's primitive meshes like every procedural model; opaque except for a few spectral parts.
(function () {
  'use strict';
  const TAU = Math.PI * 2, HALF = Math.PI / 2, PI = Math.PI, TOOTH = [.95, .93, .84], DARK = [.04, .03, .05];
  const attackOf = (e, now, ms) => { const ap = (now - e.atkT) / ms; return ap < 1 && ap >= 0 ? Math.sin(ap * PI) : 0; };
  const flashOf = (e, now) => (e.flash > now - 120 ? .7 : 0);
  const idleOf = (e, now, period) => Math.sin(now / period + (e.id || 0)) * (1 - e.mv);
  const tip = (p, len, a) => [p[0], p[1] - len * Math.cos(a), p[2] - len * Math.sin(a)];
  const pick = (v, list) => list[v] || list[0];

  // ======================= 1. Vârcolac (Meadows) =======================
  // A huge supernatural wolf that eats the sun and moon: hunched shoulders over long forelegs, a heavy mane, pale
  // markings, burning eyes and an eclipse behind its shoulders.
  //   A ancient: dark fur, silver markings, a golden eclipse corona.
  //   B pale, moon-marked: pale fur, glowing crescent marks, a full pale moon and spectral wisps trailing.
  //   C feral: black fur bristling into spikes, scars and a torn ear, a blood-red eclipse, bared fangs.
  function varcolac(e, o) {
    const now = performance.now(), P = part(e.rx, e.ry, e.yaw, o.sc), v = o.v, gl = flashOf(e, now), mv = e.mv, atk = attackOf(e, now, 340);
    const F = pick(v, [[.16, .13, .14], [.78, .8, .86], [.08, .07, .08]]), L = mix(F, [0, 0, 0], .3), mark = pick(v, [[.78, .8, .84], [.45, .72, 1], [.55, .14, .12]]);
    const eye = pick(v, [[1, .78, .25], [.55, .85, 1], [1, .15, .1]]), corona = pick(v, [[1, .72, .25], [.85, .92, 1], [.85, .08, .05]]);
    const br = idleOf(e, now, 700) * .8, bob = Math.abs(Math.sin(e.ph)) * 1.6 * mv, l = atk * 7;
    for (const side of [-1, 1]) for (const front of [true, false]) {
      const a = Math.sin(e.ph + (front ? 0 : PI) + (side > 0 ? PI : 0)) * .6 * mv, x = side * 6.6;
      if (front) {
        const hip = [x, 30 + bob, 12 + l * .4], kn = tip(hip, 14, a * .9); P(...hip, M.tlimb, 8, 14, 8, F, a * .9, gl * .3);
        const ft = tip(kn, 15, a * .4 - .05); P(...kn, M.tlimb, 5.8, 15, 5.8, L, a * .4 - .05); P(ft[0], ft[1] + 1.4, ft[2] + 1.6, M.ball, 3.6, 2, 4.6, L);
        for (const c of [-1, 0, 1]) P(ft[0] + c * 1.6, ft[1] + .8, ft[2] + 5.6, M.cone, .6, 3, .6, TOOTH, HALF);
      } else {
        const hip = [x, 25 + bob, -13], kn = tip(hip, 10, a - .5); P(...hip, M.tlimb, 8.6, 10, 8.6, F, a - .5, gl * .3);
        const hk = tip(kn, 9, a * .5 + .7); P(...kn, M.tlimb, 5.4, 9, 5.4, L, a * .5 + .7); const ft = tip(hk, 7, a * .3 - .1); P(...hk, M.tlimb, 4.2, 7, 4.2, L, a * .3 - .1);
        P(ft[0], ft[1] + 1.4, ft[2] + 1.6, M.ball, 3.4, 2, 4.4, L);
      }
    }
    P(0, 34 + br + bob, 7, M.ball, 11, 12, 13, F, -.15, gl); P(0, 30 + br + bob, -6, M.ball, 8.6, 9, 10, F, 0, gl); P(0, 29 + br + bob, -14, M.ball, 8, 8, 6, F, 0, gl);
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) P(s * (9.6 - i * .6), 33 + bob - i * 1.2, 8 - i * 6.4, M.box, .7, 8, .8, mark, -.1, v === 1 ? .9 : 0, undefined, s * .45); // markings
    const manes = v === 2 ? 11 : 8;
    for (let k = 0; k < manes; k++) { const a = (k / (manes - 1) - .5) * 2.6; P(Math.sin(a) * 9, 45 + br + bob - Math.abs(a) * 2, 12 - Math.cos(a) * 3, M.cone, v === 2 ? 2.6 : 3.6, v === 2 ? 14 : 11, v === 2 ? 2.4 : 3, k % 2 ? F : L, -1.15, gl, undefined, -a * .55); }
    // eclipse behind the shoulders
    const ey = 58 + br + bob, ez = -2; P(0, ey, ez, M.cyl, 13, 1, 13, v === 1 ? [.9, .92, 1] : DARK, HALF, v === 1 ? .7 : 0);
    P(0, ey, ez - .6, M.ring, 15, 1, 15, corona, HALF, 1, undefined, 0);
    if (v === 1) for (let i = 0; i < 4; i++) { const a = now / 900 + i * TAU / 4; P(Math.cos(a) * 16, 34 + Math.sin(a * 2) * 4, -18 + Math.sin(a) * 6, M.cone, 1.6, 9, 1.6, [.7, .85, 1], PI - .6, .8, .55); }
    // head
    const hz = 26 + l, hy = 44 + bob - atk * 2;
    P(0, hy - 3, hz - 7, M.ball, 7.6, 8, 8, F, 0, gl); P(0, hy, hz, M.ball, 8, 7.2, 8.4, F, 0, gl);
    P(0, hy - 2, hz + 6, M.taper, 4, 11, 3.4, F, HALF - .08); P(0, hy - 4.6, hz + 5.4, M.taper, 3, 10, 2, L, HALF + .2 + atk * .55);
    P(0, hy - .8, hz + 16.4, M.ball, 1.8, 1.4, 1.5, DARK);
    for (const s of [-1, 1]) {
      for (const f of [0, 1]) P(s * (1.6 + f * 1.4), hy - 3.6, hz + 14.6 - f * 3, M.cone, .6, v === 2 ? 3.6 : 2.6, .6, TOOTH, PI);
      P(s * 3.4, hy + 1.6, hz + 5, M.ball, 1.5, 1.1, 1, eye, 0, 1); P(s * 3.5, hy + 3, hz + 4.8, M.box, 3.8, 1, 1.8, L, 0, 0, undefined, s * .4);
      if (!(v === 2 && s > 0)) P(s * 4, hy + 5, hz - 2, M.cone, 2.4, 9, 1.6, F, -.2, gl, undefined, s * -.2); else P(s * 4, hy + 4.6, hz - 2, M.cone, 2.4, 4.6, 1.6, F, -.2, gl, undefined, s * -.2); // torn ear
      if (v === 1) P(s * 2.4, hy + 3.6, hz + 2, M.box, .6, 3.6, .5, mark, -.4, 1, undefined, s * .9); // crescent mark on the brow
    }
    if (v === 2) for (const [x, y, z, r] of [[-11, 36, 8, .7], [-10.6, 34, 3, .6], [10.6, 33, -2, -.6]]) P(x, y + bob, z, M.box, .8, 9, .9, [.6, .16, .14], 0, 0, undefined, r); // scars
    const ta = 1 + mv * .6 + Math.sin(now / 320 + (e.id || 0)) * .12, tb = [0, 34 + bob, -19], tm = tip(tb, 11, ta);
    P(...tb, M.tlimb, 6.4, 11, 6.4, F, ta); P(...tm, M.tlimb, 6, 10, 6, v === 1 ? mark : F, ta + .3, v === 1 ? .5 : 0, v === 1 ? .7 : undefined);
  }

  // ======================= 2. The Devourer (Gloomwood, Wildwood) =======================
  // Ammit, the eater of hearts, as an apex predator of the forest: a crocodile head full of teeth, a lion's maned
  // forequarters, a hippopotamus's heavy hindquarters, and a gold-and-lapis collar.
  //   A ancient: olive scales, tawny mane, grey hide, gold collar.
  //   B overgrown: moss over everything, roots binding the legs, saplings and flowers on the back, a mane of vines.
  //   C corrupted: black scales, bone spikes down the spine, exposed ribs, sickly green glow in the eyes and maw.
  function devourer(e, o) {
    const now = performance.now(), P = part(e.rx, e.ry, e.yaw, o.sc), v = o.v, gl = flashOf(e, now), mv = e.mv, atk = attackOf(e, now, 360);
    const scale = pick(v, [[.36, .42, .24], [.28, .4, .2], [.1, .1, .1]]), mane = pick(v, [[.72, .52, .24], [.24, .42, .16], [.16, .12, .14]]), hide = pick(v, [[.46, .42, .44], [.36, .4, .3], [.2, .17, .2]]);
    const gold = [.9, .72, .26], lapis = [.16, .3, .8], glow = [.55, 1, .35], moss = [.3, .52, .2];
    const br = idleOf(e, now, 760) * .7, bob = Math.abs(Math.sin(e.ph)) * 1.4 * mv, l = atk * 6, jaw = .15 + atk * .8 + (1 - mv) * Math.max(0, Math.sin(now / 900)) * .2;
    for (let i = 0; i < 4; i++) {
      const s = i % 2 ? 1 : -1, front = i < 2, a = Math.sin(e.ph + (i % 3 ? 0 : PI)) * .55 * mv, hip = [s * 9, front ? 24 : 22, front ? 12 : -14];
      const kn = tip(hip, 11, a); P(...hip, M.tlimb, front ? 9 : 11, 11, front ? 9 : 11, front ? mane : hide, a, gl * .3);
      const ft = tip(kn, 11, a * .4); P(...kn, M.tlimb, front ? 7 : 9, 11, front ? 7 : 9, front ? mane : hide, a * .4); P(ft[0], ft[1] + 1.6, ft[2] + 2, M.ball, front ? 4.6 : 6, 2.4, front ? 6 : 6.6, front ? mane : hide);
      if (front) for (const c of [-1, 0, 1]) P(ft[0] + c * 2, ft[1] + 1, ft[2] + 7, M.cone, .8, 3.6, .8, TOOTH, HALF);
      if (v === 1) P(kn[0] + s * 1.2, kn[1] + 2, kn[2], M.ring, 6, 1, 6, [.32, .22, .12], .4, 0, undefined, HALF); // roots binding the legs
    }
    P(0, 30 + br + bob, -12, M.ball, 15, 13, 15, hide, 0, gl);                                                 // hippo hindquarters
    P(0, 33 + br + bob, 6, M.ball, 12, 12, 14, mane, -.08, gl);                                                // lion forequarters
    for (let k = 0; k < 9; k++) { const a = (k / 8 - .5) * 3; P(Math.sin(a) * 11, 42 + bob - Math.abs(a) * 1.6, 16 - Math.cos(a) * 2, M.cone, 3.6, 11, 3.2, k % 2 ? mane : mix(mane, [0, 0, 0], .25), -1.3, gl, undefined, -a * .5); } // mane
    // collar of gold and lapis
    for (let k = 0; k < 7; k++) { const a = (k / 6 - .5) * 2.8; P(Math.sin(a) * 9.6, 38 + bob - Math.abs(a), 21 - Math.cos(a) * 1.6, M.box, 3.6, 4, 1.2, k % 2 ? lapis : gold, .2, 0, undefined, -a * .6); }
    if (v === 2) { for (let i = 0; i < 6; i++) P(0, 45 + bob - i * 1.6, 8 - i * 5.6, M.cone, 1.8, 9 - i * .8, 1.8, TOOTH, -.4); for (let i = 0; i < 4; i++) for (const s of [-1, 1]) P(s * 12.4, 28 + bob, 8 - i * 4, M.box, 1, 8, 1.2, TOOTH, 0, 0, undefined, s * .3); }
    if (v === 1) { P(0, 42 + bob, -12, M.ball, 13, 4, 13, moss); for (const [x, z, h] of [[-5, -14, 16], [6, -8, 12], [1, -20, 10]]) { P(x, 43 + bob, z, M.cyl, 1, h, 1, [.38, .26, .16]); P(x, 43 + bob + h, z, M.ball, 4, 4.6, 4, moss); } for (const [x, z] of [[-9, -2], [8, -16], [3, 0]]) P(x, 44.6 + bob, z, M.ball, 1.6, 1.2, 1.6, [1, .6, .8], 0, .4); }
    // crocodile head
    const hz = 30 + l, hy = 36 + bob - atk * 2;
    P(0, hy, hz - 4, M.ball, 9.4, 8, 9.6, scale, 0, gl); P(0, hy + 1, hz + 7, M.box, 11.6, 4.8, 24, scale, -.05 - jaw * .2, gl); P(0, hy - 4, hz + 6, M.box, 10.4, 3, 23, scale, .06 + jaw * .45);
    for (let k = 0; k < 5; k++) P(0, hy + 3.8, hz + 1 + k * 4.6, M.box, 6.6 - k * .6, 1, 2.6, mix(scale, [0, 0, 0], .25), -.05 - jaw * .2); // scutes
    for (let k = 0; k < 7; k++) for (const s of [-1, 1]) { P(s * 4.8, hy - 1.6 - k * .5 * jaw, hz + 2 + k * 3.2, M.cone, .7, 3, .7, TOOTH, PI); P(s * 4.4, hy - 2.8 - k * .7 * jaw, hz + 3.4 + k * 3.2, M.cone, .6, 2.4, .6, TOOTH, .06 + jaw * .45); }
    for (const s of [-1, 1]) { P(s * 4.6, hy + 4.6, hz - 1, M.ball, 2.4, 2.2, 2.2, scale); P(s * 4.9, hy + 5.4, hz, M.ball, 1.4, 1, 1.1, v === 2 ? glow : [1, .8, .2], 0, 1); }
    P(0, hy + 3.6, hz + 18, M.ball, 2.6, 1.6, 2, mix(scale, [0, 0, 0], .3));
    if (v === 2) P(0, hy - 2, hz + 8, M.ball, 4.4, 1 + jaw * 2.4, 8, glow, 0, .9);
    if (v !== 2) P(0, hy + 5.6, hz - 5, M.box, 11, 1.4, 6, gold, -.2);                                         // gold brow band
    const ta = 1.1 + mv * .4, tb = [0, 30 + bob, -26]; P(...tb, M.tlimb, 5, 8, 5, hide, ta); P(...tip(tb, 8, ta), M.ball, 2.4, 2.4, 2.4, hide);
  }

  // ======================= 3. Oni Warlord (Ashen Barrens, Warfields) =======================
  // A towering horned demon warrior: muscular, fanged, wild-haired, in lacquered lamellar armour, with an iron kanabo.
  //   A traditional: red skin, black-and-crimson armour, white mane, two horns.
  //   B commander: blue skin, heavier armour with a crested kabuto, great curved horns, a war banner on the back.
  //   C feral: dark crimson skin bared to the waist, cracked plates, a broken horn and a third horn, burning scars.
  function oni(e, o) {
    const now = performance.now(), P = part(e.rx, e.ry, e.yaw, o.sc), v = o.v, gl = flashOf(e, now), mv = e.mv, atk = attackOf(e, now, 380);
    const skin = pick(v, [[.78, .2, .14], [.22, .36, .7], [.45, .08, .08]]), dskin = mix(skin, [0, 0, 0], .35), armour = pick(v, [[.1, .08, .09], [.14, .12, .16], [.12, .09, .08]]);
    const lacquer = pick(v, [[.68, .1, .1], [.85, .62, .2], [.38, .1, .08]]), hair = pick(v, [[.92, .9, .86], [.1, .1, .12], [.86, .84, .78]]), horn = [.92, .86, .7], iron = [.22, .22, .26], scar = [1, .5, .15];
    const sw = Math.sin(e.ph) * .55 * mv, bob = Math.abs(Math.sin(e.ph)) * 1.6 * mv + idleOf(e, now, 680) * .6;
    for (const s of [-1, 1]) {
      const a = s * sw, hip = [s * 7, 34 + bob, 0], kn = tip(hip, 15, a); P(...hip, M.tlimb, 10, 15, 10, dskin, a, gl * .3);
      const ft = tip(kn, 15, a * .4); P(...kn, M.tlimb, 8.4, 15, 8.4, armour, a * .4); P(ft[0], ft[1] + 2, ft[2] + 2.4, M.box, 7, 3.4, 11, dskin, a * .3);
      P(kn[0], kn[1] - 5, kn[2] + 1, M.box, 8.6, 9, 9, lacquer, a * .4);                                          // greaves
    }
    const ty = 32 + bob;
    for (let i = 0; i < 6; i++) { const a = (i / 5 - .5) * 2.6; P(Math.sin(a) * 10, ty, Math.cos(a) * 7, M.limb, 6, 13, 1.2, i % 2 ? lacquer : armour, Math.cos(a) * .22, 0, undefined, -Math.sin(a) * .22); } // kusazuri skirt
    P(0, ty + 2, 0, M.taper, 11, 22, 8.6, v === 2 ? skin : armour, .05, gl);                                    // torso
    if (v === 2) { P(0, ty + 16, 5, M.ball, 10, 7, 4.6, skin, .05, gl); for (const [x, y, r] of [[-4, 12, .6], [4, 16, -.5], [0, 8, .2]]) P(x, ty + y, 8.6, M.box, 7, .9, .6, scar, 0, .9, undefined, r); }
    else { for (let r = 0; r < 4; r++) P(0, ty + 8 + r * 3.6, 7, M.box, 19, 3, 2, r % 2 ? lacquer : armour, .05); P(0, ty + 1.6, 0, M.cyl, 11.4, 2.6, 9, lacquer); }
    const sy = ty + 24, ax = 17, ra = -.2 - 1.7 * atk + sw * .5, la = -.15 - sw * .5;
    for (const [s, a] of [[-1, la], [1, ra]]) {
      const sp = [s * ax, sy, 0]; P(...sp, M.ball, 7.6, 6.8, 7.4, skin, 0, gl);
      if (!(v === 2 && s < 0)) for (let r = 0; r < (v === 1 ? 4 : 3); r++) P(sp[0] + s * 2.6, sp[1] + 3 - r * 3.4, sp[2], M.box, 3, 3.4, 12, r % 2 ? lacquer : armour, 0, 0, undefined, s * -.35); // sode
      const el = tip(sp, 13, a * .85); P(...sp, M.tlimb, 8, 13, 8, skin, a * .85, gl * .3); const hd = tip(el, 13, a + .15);
      P(...el, M.tlimb, 7.4, 13, 7.4, skin, a + .15); P(...tip(el, 5, a + .15), M.cyl, 4.6, 6, 4.6, armour, a + .15 - PI); P(...hd, M.ball, 4.6, 4.4, 4.8, dskin);
      if (s > 0) { const k = a - 1.55 + atk * 2.1, top = tip(hd, 36, k); P(...hd, M.tlimb, 2.6, 10, 2.6, [.3, .18, .1], k); P(...tip(hd, 8, k), M.taper, v === 2 ? 4.6 : 5.6, v === 2 ? 22 : 30, v === 2 ? 4.6 : 5.6, iron, k - PI);
        for (let i = 0; i < 6; i++) { const q = tip(hd, 14 + i * 3.8, k); P(q[0] + (i % 2 ? 4 : -4), q[1], q[2], M.cone, .9, 3, .9, [.55, .55, .6], 0, 0, undefined, (i % 2 ? -1 : 1) * HALF); } void top; }
    }
    const hy = sy + 8, hz = 4 + atk * 2;
    P(0, sy + 2, 1, M.cyl, 5, 5, 5, skin); P(0, hy, hz, M.ball, 7.6, 8.4, 7.8, skin, 0, gl);
    P(0, hy - 4.4, hz + 5, M.box, 9.6, 3.6, 4, dskin, -.1); P(0, hy - 4, hz + 7.2, M.box, 7.6, 1 + atk * 1.4, .8, DARK);         // grinning jaw
    for (const s of [-1, 1]) { P(s * 2.6, hy - 5, hz + 7.4, M.cone, .9, 3.4, .8, TOOTH, .1); P(s * 2.6, hy + 1.4, hz + 6.6, M.ball, 1.6, 1.1, .8, [1, .85, .2], 0, 1); P(s * 2.8, hy + 3.4, hz + 6.4, M.box, 4, 1.4, 1.6, dskin, 0, 0, undefined, s * -.5); }
    P(0, hy + .4, hz + 7.6, M.ball, 1.8, 1.6, 1.4, dskin);
    for (let k = 0; k < 7; k++) { const a = (k / 6 - .5) * 2.4; P(Math.sin(a) * 6.6, hy + 5 - Math.abs(a), hz - 4 - Math.cos(a) * 2, M.cone, 2.6, v === 1 ? 8 : 12, 2.4, hair, -1.6 + (v === 2 ? .3 : 0), 0, undefined, -a * .7); } // wild mane
    const hornL = v === 1 ? 15 : 10;
    for (const s of [-1, 1]) {
      if (v === 2 && s > 0) P(s * 4, hy + 7, hz, M.cone, 2.2, 4, 2.2, horn, .1, 0, undefined, s * -.4);      // broken horn
      else { const hb = [s * 4.4, hy + 6.6, hz]; P(...hb, M.cone, v === 1 ? 2.8 : 2.2, hornL, v === 1 ? 2.8 : 2.2, horn, .15, 0, undefined, s * -(v === 1 ? .7 : .35)); if (v === 1) P(hb[0] + s * hornL * .62, hb[1] + hornL * .72, hb[2] + 2, M.cone, 1.2, 6, 1.2, horn, .9, 0, undefined, s * .3); }
    }
    if (v === 2) P(0, hy + 8.4, hz + 2, M.cone, 1.6, 7, 1.6, horn, .3);                                         // third horn
    if (v === 1) { P(0, hy + 4, hz - .6, M.ball, 8.4, 5.6, 8.6, armour); P(0, hy + 6.6, hz + 6, M.box, 14, 1.4, 1, [.9, .72, .26], 0, .3, undefined, 0); for (const s of [-1, 1]) P(s * 4.6, hy + 10, hz + 6, M.cone, 1, 9, .6, [.9, .72, .26], .25, .3, undefined, s * -.6); // kabuto + crescent crest
      P(0, sy + 4, -9, M.cyl, .7, 40, .7, [.3, .2, .12]); P(4.6, sy + 30, -9, M.box, 9, 16, .6, [.85, .12, .12], 0, 0, undefined, Math.sin(now / 400) * .08); } // sashimono banner
  }

  // ======================= 4. Feathered Sovereign (Ember Wastes, Volcanic) =======================
  // A colossal feathered serpent rising from the ground in an S: a plumed head with a feather fan, a feathered ruff,
  // small feathered wings, scales along its length, and fire in its jaws.
  //   A fiery: crimson scales, turquoise and gold plumes, burning feather tips.
  //   B ash: grey-black scales, charcoal plumes with faint embers, drifting smoke.
  //   C molten: obsidian scales split by glowing seams, molten orange plumes.
  function sovereign(e, o) {
    const now = performance.now(), P = part(e.rx, e.ry, e.yaw, o.sc), v = o.v, gl = flashOf(e, now), atk = attackOf(e, now, 360), t = now / 1000;
    const sc = pick(v, [[.72, .12, .08], [.24, .22, .22], [.08, .07, .08]]), belly = pick(v, [[.95, .72, .3], [.5, .46, .42], [.3, .14, .08]]);
    const plumeA = pick(v, [[.1, .75, .7], [.18, .16, .16], [1, .5, .1]]), plumeB = pick(v, [[.95, .78, .2], [.32, .28, .26], [1, .78, .25]]), ember = pick(v, [[1, .5, .1], [1, .4, .1], [1, .6, .15]]);
    const pe = v === 2 ? .8 : 0, mv = e.mv, wave = t * 2.4 + (e.id || 0);
    // coiled base on the ground, then the body rising in an S
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + t * .2; P(Math.cos(a) * 16, 6, Math.sin(a) * 13 - 6, M.ball, 7.2, 6, 7.2, i % 2 ? sc : mix(sc, [0, 0, 0], .2), 0, gl); }
    const N = 12, pts = [];
    for (let i = 0; i < N; i++) { const k = i / (N - 1); pts.push([Math.sin(wave + k * 4) * 7 * (1 - k * .4), 8 + k * 58 - atk * k * 6, -6 + k * 18 + Math.sin(k * PI) * 6 + atk * k * 10]); }
    pts.forEach((p, i) => { const k = i / (N - 1), r = 8.6 - k * 3.2; P(...p, M.ball, r, r * 1.05, r, sc, 0, gl);
      P(p[0], p[1] - r * .2, p[2] + r * .7, M.ball, r * .6, r * .7, r * .3, belly, 0, v === 2 ? .3 : 0);
      if (v === 2 && i % 2) P(p[0] + r * .9, p[1], p[2], M.box, .7, r * 1.2, .7, ember, 0, 1, undefined, .5);
      if (i % 2 === 0 && i > 1) P(p[0], p[1] + r * .8, p[2] - r * .5, M.cone, 1.6, 5, 1.2, plumeB, -1.2, pe); });
    const neck = pts[N - 1], hp = [neck[0], neck[1] + 4, neck[2] + 6];
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; P(hp[0] + Math.cos(a) * 8, hp[1] - 6, hp[2] - 4 + Math.sin(a) * 4, M.cone, 2.2, 11, 1.2, k % 2 ? plumeA : plumeB, -1.6, pe, undefined, -Math.cos(a) * 1.3); } // ruff
    for (const s of [-1, 1]) { const wa = s * (1.2 + Math.sin(t * 3 + s) * .25); for (let f = 0; f < 5; f++) P(pts[7][0] + s * 6, pts[7][1], pts[7][2], M.cone, 2.4, 20 - f * 2.4, 1, f % 2 ? plumeA : plumeB, -.4 - f * .25, pe, undefined, wa); } // feathered wings
    P(...hp, M.ball, 7, 6.4, 8.4, sc, 0, gl); P(hp[0], hp[1] - 1, hp[2] + 7, M.taper, 4.4, 8, 3, sc, HALF - .1); P(hp[0], hp[1] - 4, hp[2] + 6, M.taper, 3.4, 7.6, 1.8, belly, HALF + .25 + atk * .5);
    for (const s of [-1, 1]) { P(hp[0] + s * 3.6, hp[1] + 2, hp[2] + 5, M.ball, 1.3, 1, .9, ember, 0, 1); P(hp[0] + s * 1.8, hp[1] - 3.6, hp[2] + 12, M.cone, .6, 3, .6, TOOTH, PI); }
    for (let k = 0; k < 7; k++) { const a = (k / 6 - .5) * 2.2; P(hp[0] + Math.sin(a) * 4, hp[1] + 5, hp[2] - 2, M.cone, 1.8, 16 - Math.abs(a) * 3, .8, k % 2 ? plumeA : plumeB, -.5, pe, undefined, -a * .55); P(hp[0] + Math.sin(a) * (4 + 15 * Math.sin(Math.abs(a) * .4 + .3)), hp[1] + 5 + 14 * Math.cos(a * .55), hp[2] - 8, M.ball, 1.2, 1.2, 1.2, ember, 0, v === 1 ? .4 : 1); } // feather fan
    P(hp[0], hp[1] - 2, hp[2] + 16 + atk * 4, M.ball, 1.6 + atk * 3, 1.6 + atk * 3, 1.6 + atk * 3, ember, 0, 1);
    if (v === 1) for (let i = 0; i < 3; i++) { const k = ((t * .3 + i / 3) % 1); P(hp[0] + Math.sin(i * 2) * 4, hp[1] + 8 + k * 26, hp[2] - 6 - k * 6, M.ball, 3 + k * 5, 3 + k * 5, 3 + k * 5, [.3, .28, .28], 0, 0, .5 * (1 - k)); } // smoke
    void mv;
  }

  // ======================= 5. Frostbound Jarl (Frostfang Peaks, Glacier) =======================
  // A giant frozen warlord: horned helm, braided frost beard, mail under heavy plate, a fur mantle and a great axe of
  // frozen steel.
  //   A frozen warlord: steel-blue plate, grey fur, white beard, a horned helm, an ice-edged axe.
  //   B ancient: heavier layered plate, a closed helm with tall antler horns, glowing runes, a long rimed cloak.
  //   C battle-scarred: a broken horn, ice spikes growing from shoulders and back, a torn cloak, the axe locked in ice.
  function jarl(e, o) {
    const now = performance.now(), P = part(e.rx, e.ry, e.yaw, o.sc), v = o.v, gl = flashOf(e, now), mv = e.mv, atk = attackOf(e, now, 400);
    const plate = pick(v, [[.42, .5, .6], [.34, .4, .5], [.4, .46, .54]]), mail = [.32, .34, .38], fur = pick(v, [[.56, .54, .52], [.82, .84, .88], [.36, .34, .34]]);
    const skin = [.66, .72, .8], beard = [.9, .94, 1], ice = [.62, .88, 1], rune = [.45, .85, 1], horn = [.86, .84, .76], leather = [.3, .22, .18];
    const sw = Math.sin(e.ph) * .5 * mv, bob = Math.abs(Math.sin(e.ph)) * 1.6 * mv + idleOf(e, now, 720) * .6, heavy = v === 1 ? 1.12 : 1;
    for (const s of [-1, 1]) {
      const a = s * sw, hip = [s * 7.4, 36 + bob, 0], kn = tip(hip, 16, a); P(...hip, M.tlimb, 10 * heavy, 16, 10 * heavy, mail, a, gl * .3);
      const ft = tip(kn, 16, a * .4); P(...kn, M.tlimb, 9 * heavy, 16, 9 * heavy, plate, a * .4); P(ft[0], ft[1] + 2.4, ft[2] + 2.6, M.box, 8, 4.6, 13, leather, a * .3);
      P(kn[0], kn[1], kn[2] + 2, M.ball, 4.6, 4, 4.6, plate);
    }
    const ty = 34 + bob;
    P(0, ty - 2, 0, M.taper, 13, 14, 10, mail); P(0, ty + 6, 0, M.torso, 15 * heavy, 24, 11 * heavy, plate, 0, gl); P(0, ty + 2.4, 0, M.cyl, 13.4, 3.4, 10.4, leather);
    P(0, ty + 2.4, 10.6, M.ball, 3.4, 3, 1.6, [.82, .7, .3]);
    if (v === 1) for (let i = 0; i < 3; i++) P((i - 1) * 5, ty + 18, 11, M.box, 1, 6, .6, rune, 0, 1);
    const cl = v === 2 ? 30 : v === 1 ? 46 : 40, ca = .12 + mv * .3; P(0, ty + 28, -10, M.limb, 30, cl, 1.6, fur, ca);                   // cloak
    if (v === 1) P(0, ty + 28 - cl * Math.cos(ca), -10 - cl * Math.sin(ca), M.box, 30, 2, 2, ice, ca, .3);
    if (v === 2) for (let i = 0; i < 4; i++) P(-10 + i * 7, ty + 28 - cl, -10 - cl * Math.sin(ca), M.cone, 3, 6, 1, fur, PI + ca);
    for (let k = 0; k < 9; k++) { const a = (k / 8 - .5) * 3; P(Math.sin(a) * 14, ty + 30, Math.cos(a) * 6 - 2, M.cone, 4, 8, 4, fur, -1.5, 0, undefined, -a * .55); } // fur mantle
    const sy = ty + 27, ax = 18 * heavy, ra = -.3 - 1.6 * atk + sw * .5, la = -.2 - 1.2 * atk - sw * .5;
    for (const [s, a] of [[-1, la], [1, ra]]) {
      const sp = [s * ax, sy, 0]; P(...sp, M.ball, 8.6 * heavy, 7, 8.4 * heavy, plate, 0, gl); if (v === 1) P(sp[0], sp[1] + 4, sp[2], M.ball, 7.6, 4, 7.6, mix(plate, [0, 0, 0], .2));
      if (v === 2) for (let k = 0; k < 3; k++) P(sp[0] + s * 2, sp[1] + 5, sp[2] - 3 + k * 3, M.octa, 1.8, 7 + k * 2, 1.8, ice, (k - 1) * .3, .35, undefined, s * -.4);
      const el = tip(sp, 14, a * .85); P(...sp, M.tlimb, 8, 14, 8, mail, a * .85, gl * .3); const hd = tip(el, 13, a + .2);
      P(...el, M.tlimb, 7.6, 13, 7.6, plate, a + .2); P(...hd, M.ball, 4.6, 4.4, 4.8, leather);
      if (s > 0) { const k = a - 1.6 + atk * 2.1, head = tip(hd, 34, k); P(...hd, M.tlimb, 2.4, 40, 2.4, [.36, .26, .18], k);
        for (const side of [-1, 1]) P(head[0] + side * 5, head[1], head[2], M.box, 9, 14, 1.4, v === 2 ? ice : [.7, .76, .82], k, v === 2 ? .3 : 0, undefined, side * .2);
        P(head[0] + 9.6, head[1], head[2], M.box, 1.4, 16, 1.6, ice, k, .5); P(head[0] - 9.6, head[1], head[2], M.box, 1.4, 16, 1.6, ice, k, .5);
        if (v === 2) P(...head, M.octa, 9, 14, 9, ice, k, .25, .85); }
    }
    const hy = sy + 9, hz = 3 + atk * 2;
    P(0, sy + 2, 1, M.cyl, 5.4, 5, 5.4, skin); P(0, hy, hz, M.ball, 7.4, 8.4, 7.6, skin, 0, gl);
    for (let k = 0; k < 5; k++) P((k - 2) * 2.4, hy - 6 - Math.abs(k - 2) * 1.6, hz + 5.6, M.cone, 2, 11 - Math.abs(k - 2) * 2, 1.6, beard, PI + .15); // braided beard
    for (const s of [-1, 1]) { P(s * 2.6, hy + 1, hz + 6.4, M.ball, 1.2, .9, .7, rune, 0, 1); P(s * 2.8, hy + 2.6, hz + 6.2, M.box, 3.6, 1, 1.4, beard, 0, 0, undefined, s * .3); }
    P(0, hy + 3.4, hz, M.ball, 8.4, 6.4, 8.6, plate, 0, gl); P(0, hy + 1.4, hz + 7.4, M.box, 2, 7, 1.2, plate);                         // helm, nasal
    if (v === 1) P(0, hy - 1, hz + 6.4, M.box, 13, 6, 2.6, plate);                                                                         // closed face plate
    for (const s of [-1, 1]) {
      if (v === 2 && s < 0) { P(s * 7, hy + 6, hz, M.cone, 2.4, 5, 2.4, horn, 0, 0, undefined, s * -1.1); continue; }
      const hb = [s * 7, hy + 6, hz]; P(...hb, M.cone, 2.6, v === 1 ? 16 : 12, 2.6, horn, .2, 0, undefined, s * -(v === 1 ? .55 : .95));
      if (v === 1) { P(hb[0] + s * 6, hb[1] + 9, hb[2] + 1, M.cone, 1.2, 7, 1.2, horn, -.3, 0, undefined, s * -1.3); P(hb[0] + s * 3, hb[1] + 13, hb[2] + 2, M.cone, 1, 6, 1, horn, .2, 0, undefined, s * .2); }
    }
    if (v === 2) for (let i = 0; i < 5; i++) P((i - 2) * 6, sy + 2 - Math.abs(i - 2) * 3, -9, M.octa, 2.4, 11 - Math.abs(i - 2) * 2, 2.4, ice, -.7, .3, undefined, (i - 2) * -.3); // ice spikes on the back
    for (let k = 0; k < 4; k++) { const a = now / 900 + k * TAU / 4; P(Math.cos(a) * 20, 10 + Math.sin(now / 500 + k) * 3, Math.sin(a) * 20, M.octa, .9, 1.6, .9, beard, a, .5); } // drifting snow
  }

  // ======================= 6. Moon-Eater (Voidreach, Voidscar) =======================
  // The Bakunawa: a colossal sea-serpent whose coils break through the ground in arches, with a maned dragon head,
  // whiskers, finned frills, a row of dorsal fins, and the moon it is swallowing held in its jaws.
  //   A cosmic: deep indigo scales speckled with stars, violet fins, a pale moon.
  //   B corrupted: black scales split by void cracks, spiked fins, tendrils, an eclipsed moon with a violet corona.
  //   C star-marked: midnight blue with glowing constellations, golden fins, a bright full moon.
  function mooneater(e, o) {
    const now = performance.now(), P = part(e.rx, e.ry, e.yaw, o.sc), v = o.v, gl = flashOf(e, now), atk = attackOf(e, now, 380), t = now / 1000;
    const sc = pick(v, [[.16, .14, .34], [.06, .05, .08], [.1, .16, .36]]), fin = pick(v, [[.55, .3, .85], [.3, .1, .4], [.95, .75, .3]]), star = pick(v, [[.85, .85, 1], [.75, .3, 1], [1, .95, .6]]);
    const moon = pick(v, [[.92, .92, .86], [.08, .06, .1], [1, .98, .82]]), wob = Math.sin(t * 1.6 + (e.id || 0));
    // three coil arches rising out of the ground behind the head
    for (let c = 0; c < 3; c++) { const cz = -14 - c * 15, cx = (c % 2 ? 1 : -1) * 6, rr = 13 - c * 2;
      for (let i = 0; i <= 10; i++) { const a = i / 10 * PI; P(cx, Math.sin(a) * rr * 1.4 + 2, cz + Math.cos(a) * rr, M.ball, 6.6 - c, 6.6 - c, 6.6 - c, sc, 0, gl); if (i % 3 === 0) P(cx, Math.sin(a) * rr * 1.4 + 2 + 6 - c, cz + Math.cos(a) * rr, M.cone, 1.2, v === 1 ? 6 : 4.4, 1.2, fin, -.2, v === 2 ? .5 : 0); } }
    // neck rising in front, then the head
    const N = 8, pts = []; for (let i = 0; i < N; i++) { const k = i / (N - 1); pts.push([Math.sin(t * 1.4 + k * 3) * 4 * (1 - k), 6 + k * 46 + wob * k * 2, 4 + k * 10 + atk * k * 12]); }
    pts.forEach((p, i) => { const r = 9 - i * .5; P(...p, M.ball, r, r, r, sc, 0, gl); P(p[0], p[1] + r * .7, p[2] - r * .6, M.cone, 1.4, v === 1 ? 8 : 6, 1, fin, -1, v === 2 ? .5 : 0);
      if (v !== 1 && i % 2) P(p[0] + r * .8, p[1] + (i % 3), p[2] + r * .3, M.ball, .7, .7, .7, star, 0, 1); if (v === 1 && i % 2) P(p[0] + r * .85, p[1], p[2], M.box, .6, r * 1.2, .6, star, 0, 1, undefined, .6); });
    const hp = pts[N - 1].slice(); hp[1] += 4; hp[2] += 5;
    P(...hp, M.ball, 8, 7.4, 9, sc, 0, gl); P(hp[0], hp[1], hp[2] + 8, M.taper, 5, 10, 3.6, sc, HALF - .1);              // head, snout
    const jaw = .45 + atk * .4; P(hp[0], hp[1] - 4, hp[2] + 6, M.taper, 4.4, 10, 2.4, sc, HALF + jaw);
    const mp = [hp[0], hp[1] - 2.6, hp[2] + 13]; P(...mp, M.ball, 4.6, 4.6, 4.6, moon, 0, v === 1 ? 0 : .9);                         // the moon in its jaws
    if (v === 1) P(...mp, M.ring, 6, 1, 6, [.75, .3, 1], HALF, 1, undefined, 0);
    for (const s of [-1, 1]) {
      P(hp[0] + s * 4.4, hp[1] + 2.6, hp[2] + 4, M.ball, 1.4, 1.1, 1, star, 0, 1); P(hp[0] + s * 2, hp[1] - .6, hp[2] + 15, M.cone, .6, 2.6, .6, TOOTH, PI);
      P(hp[0] + s * 3, hp[1], hp[2] + 14, M.tlimb, .6, 14, .6, fin, .6 + Math.sin(t * 2 + s) * .2, .3, undefined, s * -.9);           // whiskers
      for (let f = 0; f < 3; f++) P(hp[0] + s * 7, hp[1] + 1 - f * 2, hp[2] - 2, M.cone, 2.4, 9 - f * 2, .8, fin, -1.3, v === 2 ? .5 : 0, undefined, s * -(1.2 + f * .3)); // finned frills
      P(hp[0] + s * 3.4, hp[1] + 6, hp[2] - 2, M.cone, 1.4, v === 1 ? 12 : 9, 1.4, mix(fin, [1, 1, 1], .3), -.7, 0, undefined, s * -.3); // horns
    }
    if (v === 1) for (let i = 0; i < 4; i++) { const a = t + i * TAU / 4; P(Math.cos(a) * 18, 4, Math.sin(a) * 18 - 14, M.tlimb, 1.4, 16, 1.4, [.2, .05, .3], -2.4 + Math.sin(t * 2 + i) * .3, .4, .8); } // void tendrils
    if (v === 2) for (let i = 0; i < 6; i++) { const a = t * .4 + i * TAU / 6; P(Math.cos(a) * 26, 30 + Math.sin(a * 2) * 8, Math.sin(a) * 26 - 10, M.octa, .8, 1.6, .8, star, a, 1); } // orbiting stars
  }

  // ======================= 7. Ossuary King (Necropolis) =======================
  // An armoured skeletal monarch, physical rather than spectral: royal plate over bone, a crown, a royal cape and a
  // two-handed greatsword. (The Region Boss "The Bone King" keeps its own look and name.)
  //   A ancient royal: dark steel plate with gold trim, a gold crown, a purple cape, blue soul-fire eyes.
  //   B heavy: full plate with a ribcage breastplate, bone spikes, skull trophies, a crown of bones, a bone-hilted sword.
  //   C decayed: plates missing to bare ribs and spine, a tattered cape, a broken tilted crown, rust and verdigris.
  function ossuary(e, o) {
    const now = performance.now(), P = part(e.rx, e.ry, e.yaw, o.sc), v = o.v, gl = flashOf(e, now), mv = e.mv, atk = attackOf(e, now, 380);
    const bone = pick(v, [[.88, .85, .74], [.9, .88, .8], [.74, .68, .54]]), steel = pick(v, [[.2, .2, .26], [.26, .24, .3], [.36, .3, .24]]), trim = pick(v, [[.9, .72, .26], [.86, .84, .78], [.42, .56, .42]]);
    const cape = pick(v, [[.34, .12, .42], [.14, .1, .14], [.22, .16, .2]]), fire = pick(v, [[.4, .75, 1], [.55, 1, .7], [.4, .9, .55]]);
    const sw = Math.sin(e.ph) * .55 * mv, bob = Math.abs(Math.sin(e.ph)) * 1.4 * mv + idleOf(e, now, 760) * .5;
    for (const s of [-1, 1]) {
      const a = s * sw, hip = [s * 6.6, 36 + bob, 0], kn = tip(hip, 16, a); P(...hip, M.tlimb, v === 2 ? 3 : 8.6, 16, v === 2 ? 3 : 8.6, v === 2 ? bone : steel, a, gl * .3);
      P(...kn, M.ball, 4, 3.6, 4, trim); const ft = tip(kn, 16, a * .4); P(...kn, M.tlimb, 7.6, 16, 7.6, steel, a * .4); P(ft[0], ft[1] + 2, ft[2] + 2.6, M.box, 7, 3.6, 12, steel, a * .3);
    }
    const ty = 34 + bob;
    P(0, ty + 2, 0, M.cyl, 10, 3, 8, trim); for (const s of [-1, 1]) P(s * 5, ty - 4, 4, M.box, 6, 10, 1.6, steel, -.1, 0, undefined, s * .15);
    if (v === 2) { P(0, ty + 4, -1, M.cyl, 1.6, 22, 1.6, bone); for (let r = 0; r < 5; r++) for (const s of [-1, 1]) P(s * 4.4, ty + 9 + r * 3.4, 2.6, M.box, 7, 1, 1, bone, 0, 0, undefined, s * -.25); P(-5, ty + 18, 4, M.box, 9, 10, 2, steel, .1, 0, undefined, .2); }
    else { P(0, ty + 4, 0, M.torso, 13, 23, 9, steel, 0, gl); P(0, ty + 16, 6.4, M.box, 14, 12, 2, steel, -.05); P(0, ty + 16, 7.6, M.box, 1.4, 12, .6, trim, -.05, .2);
      if (v === 1) for (let r = 0; r < 4; r++) for (const s of [-1, 1]) P(s * 4, ty + 11 + r * 3, 7.8, M.box, 6.4, 1, 1, bone, -.05, 0, undefined, s * -.3); }
    const cl = 42, ca = .12 + mv * .3; P(0, ty + 26, -8, M.limb, 26, cl, 1.4, cape, ca);
    if (v === 2) for (let i = 0; i < 5; i++) P(-10 + i * 5, ty + 26 - cl, -8 - cl * Math.sin(ca), M.cone, 2.6, 8, 1, cape, PI + ca); else P(0, ty + 26 - cl * Math.cos(ca), -8 - cl * Math.sin(ca), M.box, 26, 2, 2, trim, ca, .2);
    const sy = ty + 25, ax = 15, ra = -.3 - 1.5 * atk + sw * .4, la = -.35 - 1.3 * atk - sw * .4;
    for (const [s, a] of [[-1, la], [1, ra]]) {
      const sp = [s * ax, sy, 0]; P(...sp, M.ball, 7, 6, 7, steel, 0, gl); P(sp[0], sp[1] + 3, sp[2], M.box, 9, 2, 9, trim, 0, 0, undefined, s * -.25);
      if (v === 1) { P(sp[0] + s * 2, sp[1] + 6, sp[2], M.cone, 1.6, 8, 1.6, bone, 0, 0, undefined, s * -.5); P(sp[0] + s * 4, sp[1] - 3, sp[2] + 5, M.ball, 2.6, 2.8, 2.6, bone); }
      const el = tip(sp, 14, a * .9); P(...sp, M.tlimb, v === 2 ? 2.6 : 6.4, 14, v === 2 ? 2.6 : 6.4, v === 2 ? bone : steel, a * .9, gl * .3); const hd = tip(el, 13, a + .2);
      P(...el, M.tlimb, 2.4, 13, 2.4, bone, a + .2); P(...tip(el, 5, a + .2), M.cyl, 4.4, 6, 4.4, steel, a + .2 - PI); P(...hd, M.ball, 3.4, 3, 3.6, steel);
    }
    { const hd = tip(tip([ax, sy, 0], 14, ra * .9), 13, ra + .2), k = ra - 1.45 + atk * 2;                                                 // greatsword
      P(...hd, M.box, 12, 2, 2.4, trim, k); P(...hd, M.tlimb, 1.8, 8, 1.8, v === 1 ? bone : [.3, .2, .14], k - PI);
      P(...tip(hd, -2, k), M.limb, 4.6, 46, 1.2, v === 2 ? [.5, .42, .34] : [.8, .82, .88], k - PI, v === 0 ? .1 : 0); }
    const hy = sy + 9, hz = 3 + atk * 2;
    P(0, sy + 2, 0, M.cyl, 2.4, 5, 2.4, bone); P(0, hy, hz, M.ball, 6.4, 7.4, 6.8, bone, 0, gl); P(0, hy - 4.6, hz + 3, M.box, 7, 3.4, 5.6, bone);
    for (let k = 0; k < 4; k++) P(-2.4 + k * 1.6, hy - 3.2, hz + 5.8, M.box, .9, 1.6, .5, TOOTH);
    for (const s of [-1, 1]) { P(s * 2.4, hy + .6, hz + 5, M.ball, 1.8, 1.8, 1, DARK); P(s * 2.4, hy + .6, hz + 5.8, M.ball, .9, .9, .5, fire, 0, 1); }
    P(0, hy - 1.6, hz + 6, M.box, 1.2, 1.6, .5, DARK);
    const tilt = v === 2 ? .35 : 0, cy = hy + 6;
    P(0, cy, hz, M.cyl, 7, 3, 7, v === 1 ? bone : trim, 0, v === 0 ? .2 : 0, undefined, tilt);
    for (let k = 0; k < (v === 2 ? 4 : 7); k++) { const a = k / 7 * TAU; P(Math.cos(a) * 6.4, cy + 3 + (v === 2 ? Math.cos(a) * 2 : 0), hz + Math.sin(a) * 6.4, M.cone, 1.4, v === 1 ? 7 : 5, 1.4, v === 1 ? bone : trim, 0, v === 0 ? .2 : 0, undefined, tilt); }
    if (v === 0) P(0, cy + 4, hz + 6.4, M.octa, 1.2, 1.8, .8, [.85, .1, .2], 0, .6);
    if (v === 1) for (const s of [-1, 1]) P(s * 9.6, ty + 2, 6, M.ball, 2.6, 2.8, 2.6, bone);
  }

  // ======================= 8. The Reaper (Death Zone) =======================
  // Death itself, distinct from the Ossuary King: a tall hooded figure floating over the ground in tattered robes, long
  // bony hands, an oversized curved scythe, and lost souls drifting round it.
  //   A spectral: black robe, a dark hood with two green lights, green wisps.
  //   B skeletal: a skull in the hood, ribs showing through a torn robe, bony arms, a rusted scythe, few lights.
  //   C supernatural: pale-blue spectral glow, a robe dissolving into wisps, a halo of soul orbs with faces.
  function reaper(e, o) {
    const now = performance.now(), P = part(e.rx, e.ry, e.yaw, o.sc), v = o.v, gl = flashOf(e, now), atk = attackOf(e, now, 420), fl = Math.sin(now / 520 + (e.id || 0)) * 3;
    const robe = pick(v, [[.06, .06, .07], [.1, .08, .07], [.12, .16, .22]]), rag = mix(robe, [0, 0, 0], .4), spirit = pick(v, [[.4, 1, .55], [.6, .9, .6], [.6, .85, 1]]);
    const bone = [.86, .84, .76], ra = v === 2 ? .82 : undefined, lift = 10 + fl, drift = e.mv * .2;
    P(0, lift + 6, 0, M.cone, 15, 64, 12, robe, drift, gl + (v === 2 ? .25 : 0), ra);
    for (let i = 0; i < 11; i++) { const a = i / 11 * TAU, sway = Math.sin(now / 280 + i * 1.9) * .3; P(Math.cos(a) * 13, lift + 8, Math.sin(a) * 10.6, M.cone, 3, 14 + (i % 3) * 5, 2.6, i % 2 ? robe : rag, PI + sway, v === 2 ? .3 : 0, v === 2 ? .6 : undefined); }
    if (v === 1) { for (let r = 0; r < 4; r++) for (const s of [-1, 1]) P(s * 3.4, lift + 40 + r * 3.4, 7.4, M.box, 5.6, .9, .9, bone, 0, 0, undefined, s * -.3); P(0, lift + 44, 6.6, M.box, 5, 18, 1, DARK); }
    for (let k = 0; k < 7; k++) { const a = (k / 6 - .5) * 2.6; P(Math.sin(a) * 12, lift + 58, Math.cos(a) * 3, M.cone, 3.6, 9, 3, rag, PI - .25, 0, ra, -a * .9); } // tattered mantle
    const hy = lift + 70; P(0, hy, -1, M.ball, 9.4, 10.6, 9.6, robe, 0, gl); P(0, hy + 7, -6.4, M.cone, 5.6, 13, 5.6, robe, -1.1);  // hood
    P(0, hy - 1, 4.2, M.ball, 6.6, 7.6, 3.6, DARK);
    if (v === 1) { P(0, hy - .4, 4.6, M.ball, 4.6, 5.4, 3.4, bone); P(0, hy - 4.4, 6.2, M.box, 4, 2, 2, bone); for (const s of [-1, 1]) P(s * 1.8, hy + .4, 7.4, M.ball, 1.3, 1.4, .8, DARK); }
    for (const s of [-1, 1]) P(s * 2.4, hy + .6, 7.4 + (v === 1 ? .6 : 0), M.ball, v === 1 ? .6 : 1.3, v === 1 ? .6 : .8, .6, spirit, 0, 1);
    for (const s of [-1, 1]) {
      const a = -.9 - atk * (s > 0 ? 1.4 : .9) + Math.sin(now / 600 + s) * .1, sp = [s * 12, lift + 58, 1]; P(...sp, M.tlimb, 5.6, 16, 5.6, rag, a, gl, ra);
      const el = tip(sp, 16, a); P(...el, M.tlimb, 2, 14, 2, bone, a - .3); const hd = tip(el, 14, a - .3); P(...hd, M.ball, 2, 1.6, 2.4, bone);
      for (let j = -1; j <= 1; j++) P(hd[0] + j * 1.1, hd[1], hd[2], M.cone, .45, 5.6, .45, bone, a - .3 - PI + j * .15);
      if (s > 0) { const k = -2.85 + atk * 1.2 + Math.sin(now / 600) * .05, shaft = v === 1 ? [.34, .24, .16] : [.14, .1, .1], blade = v === 1 ? [.5, .36, .26] : v === 2 ? [.75, .9, 1] : [.8, .82, .86];
        const base = tip(hd, -18, k), top = tip(base, 64, k); P(...base, M.tlimb, 2, 64, 2, shaft, k); // the shaft rises from the hand; the blade at its upper end
        for (let b = 0; b < 7; b++) P(top[0], top[1] - 1 - b * b * .7, top[2] + 4 + b * 6.6, M.box, 1.4, 1.8 + (6 - b) * .7, 8, blade, .1 + b * .14, v === 2 ? .6 : 0); } // great curved blade
    }
    const souls = v === 2 ? 7 : v === 0 ? 4 : 2;
    for (let i = 0; i < souls; i++) { const a = now / (v === 2 ? 700 : 1100) + i * TAU / souls, rr = v === 2 ? 28 : 22, p = [Math.cos(a) * rr, lift + 40 + Math.sin(now / 400 + i) * 10, Math.sin(a) * rr];
      P(...p, M.ball, 2.6, 3, 2.6, spirit, 0, 1, v === 2 ? .8 : undefined); P(p[0], p[1] - 5, p[2], M.cone, 1.8, 7, 1.8, spirit, PI, .8, .55);
      if (v === 2) for (const s of [-1, 1]) P(p[0] + s * .8, p[1] + .6, p[2] + 2, M.ball, .45, .6, .3, DARK); }
    if (v === 2) P(0, hy + 13, -2, M.ring, 10, 1, 10, spirit, HALF - .3, 1, undefined, 0);
  }

  // ---------------- registry ----------------
  // id order matches the server (src/world/world-boss-looks.js IDENTITIES). top: height above the ground at sc = 1,
  // fit: the hitbox radius at which sc = 1 (each is sized to its World Boss hitbox, the rolled Region Boss's t.r,
  // capped so the tallest stays readable).
  const BOSSES = [
    { id: 'varcolac', fn: varcolac, top: 70, fit: 24, body: [.16, .13, .14] },
    { id: 'devourer', fn: devourer, top: 60, fit: 22, body: [.46, .42, .44] },
    { id: 'oni', fn: oni, top: 92, fit: 30, body: [.78, .2, .14] },
    { id: 'sovereign', fn: sovereign, top: 88, fit: 33, body: [.72, .12, .08] },
    { id: 'jarl', fn: jarl, top: 96, fit: 36, body: [.42, .5, .6] },
    { id: 'mooneater', fn: mooneater, top: 74, fit: 33, body: [.16, .14, .34] },
    { id: 'ossuary', fn: ossuary, top: 96, fit: 28, body: [.2, .2, .26] },
    { id: 'reaper', fn: reaper, top: 100, fit: 40, body: [.06, .06, .07] },
  ];
  const MAX_HEIGHT = 240;

  // ---------------- premium sculpted models ----------------
  // Bosses rebuilt with scripts/boss-forge: sculpted, skinned, animated glTF with per-vertex materials, drawn by the
  // engine's hero shader (GL.drawHero). Loaded on first sight, per variant; until a model has loaded (or on a renderer
  // without the hero shader) the primitive model above is drawn instead. Same size, position and facing as before:
  // the model's units are the primitive model's units, so o.sc scales both alike. Visual only.
  const PREMIUM = {
    varcolac: { def: { atk: 'Attack', skill: 'Attack2', idle: ['Idle'], run: ['Run'] },
      look: [{ rim: [.16, .12, .05], fx: [1, .72, .25] }, { rim: [.06, .12, .24], fx: [.62, .86, 1] }, { rim: [.2, .03, .01], fx: [1, .16, .05] }] },
  };
  const HERO = new Map(); // file -> { md, far } | 'loading' | 'failed'
  function heroModel(id, v) {
    const file = id + '-' + 'abc'[v], have = HERO.get(file);
    if (have !== undefined) return typeof have === 'object' ? have : null;
    if (typeof GL === 'undefined' || !GL.heroOK || !GL.heroOK()) { HERO.set(file, 'failed'); return null; }
    HERO.set(file, 'loading');
    Promise.all([GL.loadGLB('assets/bosses/' + file + '.glb'), GL.loadGLB('assets/bosses/' + file + '-far.glb').catch(() => null)]).then(([md, far]) => {
      md.def = PREMIUM[id].def; md.pick = l => l.find(a => md.anims[a]) || Object.keys(md.anims)[0]; HERO.set(file, { md, far });
    }).catch(err => { console.warn('World Boss model ' + file + ' not loaded', err); HERO.set(file, 'failed'); });
    return null;
  }
  // idle presence: a few small glowing motes above the ground, never over the telegraph area at the feet
  function heroFx(e, o, look, now) {
    if (typeof D !== 'function' || typeof M === 'undefined') return;
    const k = o.sc, c = Math.cos(e.yaw), s = Math.sin(e.yaw), at = (x, y, z) => [e.rx + (x * c + z * s) * k, y * k, e.ry + (-x * s + z * c) * k];
    for (let i = 0; i < 6; i++) {
      const t = ((now / 2600 + i / 6 + (e.id || 0) * .13) % 1), a = i * 2.4 + now / 1800, r = 8 + (i % 3) * 3;
      const p = o.v === 1 ? at(Math.cos(a) * r, 34 + Math.sin(a * 1.3) * 6 + t * 10, -4 + Math.sin(a) * r) : at(Math.cos(a) * 9 * (1 - t * .3), 56 + t * 26, -14 + Math.sin(a) * 4);
      D(M.ball, p[0], p[1], p[2], (1 - t) * .9 * k, (1 - t) * .9 * k, (1 - t) * .9 * k, 0, 0, look.fx, 1, .55 * (1 - t));
    }
  }
  function heroDraw(e, o) {
    const hm = heroModel(o.worldBoss, o.v); if (!hm || typeof animChar !== 'function') return o.base(e, o);
    const now = performance.now(), md = hm.md, look = PREMIUM[o.worldBoss].look[o.v];
    animChar(e, md, { dead: false }, now);
    const far = hm.far && typeof cam !== 'undefined' && Math.hypot(e.rx - cam.x, e.ry - cam.z) > 640;
    GL.drawHero(far ? hm.far : md, e.nodes, e.rx, 0, e.ry, e.yaw, o.sc, { rim: look.rim, emc: e.flash > now - 110 ? [.4, .4, .4] : null, shadow: hm.far || undefined });
    heroFx(e, o, look, now);
  }
  const cache = new Map();
  // The model object for a look code (identity * 3 + variant + 1), scaled to the boss's hitbox radius.
  function model(code, t) {
    const index = Math.floor((code - 1) / 3), v = (code - 1) % 3, def = BOSSES[index];
    if (!def || !(code > 0)) return null;
    const key = code + ':' + (t && t.r);
    if (!cache.has(key)) cache.set(key, Object.freeze({ fn: PREMIUM[def.id] ? heroDraw : def.fn, base: def.fn, premium: !!PREMIUM[def.id], v, sc: Math.min(MAX_HEIGHT / def.top, Math.max(.6, ((t && t.r) || def.fit) / def.fit)), top: def.top, body: def.body, worldBoss: def.id }));
    return cache.get(key);
  }
  window.WorldBossModels = { BOSSES, PREMIUM, model, varcolac, devourer, oni, sovereign, jarl, mooneater, ossuary, reaper };
})();
