// Shardlands: Day 1 enemy models (Whispering Meadows, Gloomwood, Ashen Barrens), redesigned.
//
// Low-poly creatures and characters built from the engine's primitive meshes, like every procedural model in game.js,
// and animated the same way (walk phase e.ph, movement e.mv, attack time e.atkT, hit flash e.flash). Each enemy has its
// own builder here, so the shared builders in game.js (human, beast, slime, spider, shroom, wraith) and every enemy that
// still uses them (Skeleton, Bandit, the bosses and the later zones) draw exactly as before.
// Loaded after game.js (index.html); assigns the builders to the Day 1 entries of MODEL.
(function () {
  'use strict';
  const TAU = Math.PI * 2, HALF = Math.PI / 2, EYE_DARK = [.05, .04, .05], TOOTH = [.95, .93, .84];
  const attackOf = (e, now, ms) => { const ap = (now - e.atkT) / ms; return ap < 1 && ap >= 0 ? Math.sin(ap * Math.PI) : 0; };
  const flashOf = (e, now) => (e.flash > now - 120 ? .7 : 0);
  const idleOf = (e, now, period) => Math.sin(now / period + (e.id || 0)) * (1 - e.mv);
  // a hanging limb (tlimb / limb) of length len pitched by a ends at this offset from its pivot
  const tip = (p, len, a) => [p[0], p[1] - len * Math.cos(a), p[2] - len * Math.sin(a)];

  // ---------------- Wild Wolf (and the Frost Wolf plugin) ----------------
  // Lean canine: deep chest, tucked waist, jointed legs (hocks on the hind legs), long muzzle with a jaw that snaps open,
  // tall ears, neck ruff, cheek fluff, a bushy tail; two-tone fur with a lighter muzzle, chest and belly.
  function wolfModel(e, o) {
    const now = performance.now(), P = part(e.rx, e.ry, e.yaw, o.sc), gl = flashOf(e, now), mv = e.mv, atk = attackOf(e, now, 300);
    const F = o.body, L = o.leg, pale = o.belly || mix(F, [1, 1, 1], .42), dk = mix(L, [0, 0, 0], .35), eye = o.eye || [1, .62, .12];
    const br = idleOf(e, now, 600) * .5, l = atk * 5, bob = Math.abs(Math.sin(e.ph)) * 1.2 * mv;
    for (const side of [-1, 1]) for (const front of [true, false]) {
      const a = Math.sin(e.ph + (front ? 0 : Math.PI) + (side > 0 ? Math.PI : 0)) * .65 * mv, x = side * 4;
      if (front) {
        const hip = [x, 18 + bob, 9 + l * .4], knee = tip(hip, 8.5, a * .9); P(...hip, M.tlimb, 4.4, 8.5, 4.4, F, a * .9, gl * .3);
        const paw = tip(knee, 9, a * .4 - .05); P(...knee, M.tlimb, 3.2, 9, 3.2, L, a * .4 - .05); P(paw[0], paw[1] + .9, paw[2] + 1, M.ball, 2.1, 1.3, 2.8, dk);
      } else {
        const hip = [x, 19 + bob, -9.5], knee = tip(hip, 8, a - .45); P(...hip, M.tlimb, 5.4, 8, 5.4, F, a - .45, gl * .3);
        const hock = tip(knee, 7, a * .5 + .65); P(...knee, M.tlimb, 3.4, 7, 3.4, L, a * .5 + .65);
        const paw = tip(hock, 5.6, a * .3 - .1); P(...hock, M.tlimb, 2.6, 5.6, 2.6, L, a * .3 - .1); P(paw[0], paw[1] + .9, paw[2] + 1, M.ball, 2.1, 1.3, 2.8, dk);
      }
    }
    // body: deep chest, lighter underside, tucked waist, hips, darker saddle along the back
    P(0, 21.5 + br + bob, 5, M.ball, 6.6, 7.4, 8.4, F, 0, gl); P(0, 18.6 + br + bob, 5.5, M.ball, 5, 4.6, 6.8, pale);
    P(0, 21.4 + br + bob, -2.5, M.ball, 5, 5.4, 7, F, 0, gl); P(0, 21.6 + br + bob, -8.5, M.ball, 5.4, 5.8, 6, F, 0, gl);
    P(0, 26.4 + br + bob, -1, M.box, 4.4, 1.4, 17, dk, -.04);
    // neck ruff, chest fluff
    for (let k = -2; k <= 2; k++) P(k * 1.8, 27.6 + br + bob - Math.abs(k) * .9, 10 + l * .6, M.cone, 2.4, 5, 2, F, -1.2, gl, undefined, -k * .38);
    P(0, 19.6 + bob, 11.5 + l * .5, M.ball, 3.6, 4.4, 3, pale);                                     // pale throat and chest
    // head
    const hz = 17.5 + l, hy = 28.5 + bob - atk * 1.2;
    P(0, hy - 2.5, hz - 4.5, M.ball, 4.6, 5.2, 5.6, F, 0, gl); P(0, hy, hz, M.ball, 5.2, 4.8, 5.6, F, 0, gl);
    P(0, hy - 1.6, hz + 4, M.taper, 2.7, 7.5, 2.3, F, HALF - .06); P(0, hy - 2.2, hz + 4.6, M.taper, 2.2, 6.8, 1.6, pale, HALF - .02);
    P(0, hy - 1.15, hz + 11.6, M.ball, 1.35, 1.1, 1.2, EYE_DARK);
    P(0, hy - 3.1, hz + 3.8, M.taper, 1.8, 6.4, 1.2, pale, HALF + .18 + atk * .5);           // lower jaw
    for (const s of [-1, 1]) {
      P(s * 1.25, hy - 2.6, hz + 9.8, M.cone, .45, 1.6, .45, TOOTH, Math.PI);                // fangs
      P(s * 2.4, hy + 1.1, hz + 3.3, M.ball, 1.05, .8, .7, eye, 0, .65);                     // eyes, brow above
      P(s * 2.5, hy + 2.1, hz + 3.2, M.box, 2.6, .7, 1.3, dk, 0, 0, undefined, s * .35);
      P(s * 2.9, hy + 3.4, hz - 1.2, M.cone, 1.8, 6.6, 1.2, F, -.18, gl, undefined, s * -.22);  // ears, inner ear
      P(s * 2.85, hy + 3.7, hz - .7, M.cone, 1, 4.6, .5, mix(dk, [.6, .3, .3], .35), -.18, 0, undefined, s * -.22);
      P(s * 4.1, hy - 1.6, hz - .5, M.cone, 1.6, 4.6, 1.4, pale, -1.45, 0, undefined, s * -.95); // cheek fluff
    }
    // bushy tail: hangs down and back, lifts when moving
    const ta = .95 + mv * .7 + Math.sin(now / 280 + (e.id || 0)) * .12, tb = [0, 23 + bob, -14], tm = tip(tb, 7, ta);
    P(...tb, M.tlimb, 4.4, 7, 4.4, F, ta); P(...tm, M.tlimb, 4.6, 7.5, 4.6, F, ta + .25); const tt = tip(tm, 7.5, ta + .25);
    P(...tt, M.ball, 2.2, 2.2, 2.6, pale);
  }

  // ---------------- Tusk Boar ----------------
  // Heavy front and shoulder hump, short legs with cloven hooves, bristly mane ridge, low wedge head, flat snout,
  // upturned tusks, small angry eyes, tufted ears, a curly tail. Charges head-down and gores upward.
  function boarModel(e, o) {
    const now = performance.now(), P = part(e.rx, e.ry, e.yaw, o.sc), gl = flashOf(e, now), mv = e.mv, atk = attackOf(e, now, 320);
    const F = o.body, L = o.leg, dk = mix(F, [0, 0, 0], .45), mane = mix(L, [0, 0, 0], .25), snout = [.78, .52, .48], hoof = [.12, .09, .08];
    const br = idleOf(e, now, 520) * .45, bob = Math.abs(Math.sin(e.ph * 1.2)) * 1.4 * mv, l = atk * 4.5, dip = atk * .35;
    for (let i = 0; i < 4; i++) {
      const s = i % 2 ? 1 : -1, front = i < 2, a = Math.sin(e.ph * 1.2 + (i % 3 ? 0 : Math.PI)) * .7 * mv, hip = [s * 5.2, 12 + bob, front ? 8 : -8.5];
      const ft = tip(hip, 10.5, a); P(...hip, M.tlimb, front ? 5.2 : 5.6, 10.5, front ? 5.2 : 5.6, L, a, gl * .3);
      for (const h of [-1, 1]) P(ft[0] + h * .9, ft[1] + 1, ft[2] + 1, M.box, 1.6, 2.2, 3, hoof);   // cloven hooves
    }
    P(0, 18 + br + bob, 5, M.ball, 9.6, 9.6, 10.5, F, 0, gl); P(0, 22.5 + br + bob, 6, M.ball, 7.4, 6.4, 8, F, 0, gl); // front, hump
    P(0, 16.8 + br + bob, -6.5, M.ball, 7.8, 8, 9, F, 0, gl); P(0, 13.5 + bob, 1, M.ball, 7, 4.6, 11, mix(F, [1, .9, .8], .2));
    for (let i = 0; i < 8; i++) P(0, 28.4 + br + bob - i * .75 - (i > 4 ? (i - 4) * .6 : 0), 11 - i * 2.9, M.cone, 1.5, 6.2 - i * .45, 1.3, i % 2 ? mane : dk, -.55);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) P(s * (3.6 + i * .3), 25.5 + bob - i * .8, 9 - i * 3.4, M.cone, 1, 3.6, 1, mane, -.7, 0, undefined, s * -.5);
    // head
    const hy = 16.5 + bob - atk * 2, hz = 15 + l;
    P(0, hy, hz, M.ball, 6.4, 6.8, 7.6, F, -dip, gl); P(0, hy - 1.5, hz + 5, M.taper, 3.8, 6.4, 3.3, F, HALF + dip - .1);
    P(0, hy - 1.2 - dip * 3, hz + 11.2, M.cyl, 3.1, .9, 2.7, snout, HALF + dip); for (const s of [-1, 1]) P(s * 1.2, hy - 1.2 - dip * 3, hz + 12.2, M.ball, .7, .9, .4, [.25, .12, .12]);
    for (const s of [-1, 1]) {
      const tb = [s * 2.9, hy - 3.6 - dip * 2, hz + 8.6];
      P(...tb, M.cone, .95, 4.4, .95, TOOTH, .55 + dip + atk * .3, 0, undefined, s * -.45);   // tusks curve up and out
      P(tb[0] + s * 1.2, tb[1] + 3.6, tb[2] + 2.2, M.cone, .55, 2.6, .55, TOOTH, -.4, 0, undefined, s * -.7);
      P(s * 3.6, hy + 2, hz + 3.6, M.ball, .9, .85, .6, [.16, .05, .03], 0, .25);           // small eyes, angry brows
      P(s * 3.3, hy + 3.1, hz + 3.8, M.box, 3, .9, 1.4, dk, 0, 0, undefined, s * .45);
      P(s * 4.5, hy + 5, hz - 1.4, M.cone, 2, 4.6, 1.1, F, -.75, 0, undefined, s * -.95);      // tufted ears
      P(s * 5.6, hy + 7.4, hz - 2.6, M.cone, .7, 2.2, .7, mane, -.9, 0, undefined, s * -1.1);
    }
    const tw = Math.sin(now / 160 + (e.id || 0)) * .5; P(0, 20 + bob, -15, M.tlimb, 1.6, 4.5, 1.6, L, 2.3 + tw * .3); P(tw * 1.5, 23.5 + bob, -17.6, M.ball, 1.4, 1.4, 1.4, mane);
  }

  // ---------------- Green Slime ----------------
  // A wobbling droplet with a peak, a darker core and rising bubbles inside, a glossy highlight, big eyes with pupils
  // and a mouth that gapes when it lunges.
  function slimeModel(e, o) {
    const now = performance.now(), b = Math.abs(Math.sin(now / 260 + e.ph)), sc = o.sc || 1, r = (o.rad || 15) * sc, x = e.rx, z = e.ry, atk = attackOf(e, now, 300);
    const hit = e.flash > now - 120, c = hit ? [1, 1, 1] : o.body, core = mix(o.body, [0, .15, 0], .45), cy = Math.cos(e.yaw), sy = Math.sin(e.yaw);
    const y = r * .55 + b * 9, sx = r * (1.02 + (1 - b) * .16), syy = r * (.74 + b * .26), at = (fw, side, up) => [x + sy * fw + cy * side, up, z + cy * fw - sy * side];
    D(M.disc, x, .7, z, r * (1.3 - b * .25), 1, r * (1.3 - b * .25), 0, 0, mix(c, [0, 0, 0], .45), 0, .4);
    D(M.ball, x, y - r * .25, z, r * .3, r * .26, r * .3, e.yaw, 0, core, .15);                                  // core
    for (let i = 0; i < 3; i++) { const t = ((now / 1600 + i / 3 + (e.id || 0) * .13) % 1), p = at(Math.sin(i * 2.1) * r * .3, Math.cos(i * 2.1) * r * .3, y - r * .5 + t * r * .9); D(M.ball, p[0], p[1], p[2], r * .07, r * .07, r * .07, 0, 0, mix(c, [1, 1, 1], .6), .4); }
    D(M.ball, x, y, z, sx, syy, sx, e.yaw, 0, c, .2, .78);                                                         // body
    D(M.cone, x, y + syy * .78, z, r * .34, r * .55 * (1 - b * .4), r * .34, e.yaw, Math.sin(now / 300 + (e.id || 0)) * .2, c, .2, .78); // droplet peak
    { const p = at(r * .3, -r * .38, y + syy * .55); D(M.ball, p[0], p[1], p[2], r * .2, r * .12, r * .14, e.yaw, 0, [1, 1, 1], 1); }       // highlight
    for (const s of [-1, 1]) {                                                                                     // eyes
      const p = at(sx * .8, s * r * .3, y + r * .18); D(M.ball, p[0], p[1], p[2], r * .17, r * .21, r * .1, e.yaw, 0, [.97, .98, .95]);
      const q = at(sx * .87, s * r * .27, y + r * .15); D(M.ball, q[0], q[1], q[2], r * .09, r * .12, r * .06, e.yaw, 0, EYE_DARK);
    }
    { const p = at(sx * .84, 0, y - r * .2); D(M.ball, p[0], p[1], p[2], r * (.16 + atk * .08), r * (.05 + atk * .2), r * .07, e.yaw, 0, [.12, .2, .1]); } // mouth
  }

  // ---------------- Shroomling ----------------
  // A walking mushroom: a broad spotted cap with gills underneath, a stout stem with a face (white eyes, scowling brows,
  // a small mouth), stubby arms and feet. Headbutts with its cap.
  const SPOTS = [[0, .05, 3.6], [.4, .78, 3.2], [1.5, .62, 3.6], [2.6, .8, 2.8], [3.6, .58, 3.8], [4.7, .78, 3], [5.7, .6, 3.4], [2.1, .32, 2.4], [5.1, .3, 2.6]];
  function shroomModel(e, o) {
    const now = performance.now(), P = part(e.rx, e.ry, e.yaw, o.sc), gl = flashOf(e, now), at = attackOf(e, now, 300), mv = e.mv;
    const stem = [.93, .88, .78], shade = [.8, .74, .64], gill = [.86, .74, .62], cap = o.body, spot = [1, .97, .9];
    const b = Math.abs(Math.sin(e.ph)) * 2.6 * mv, sq = 1 + idleOf(e, now, 300) * .05, lean = -at * .35;
    for (const s of [-1, 1]) { const w = Math.sin(e.ph) * s * 3 * mv; P(s * 4.4, 2.2, w, M.ball, 3.2, 2.4, 4.2, shade); }
    P(0, 3 + b, 0, M.taper, 7.2, 14, 7, stem, lean * .5, gl); P(0, 8.5 + b, .6, M.ball, 7, 6.6, 6.6, stem, 0, gl); // stem with a belly
    for (const s of [-1, 1]) { const a = (s > 0 ? -1.6 * at : 0) + Math.sin(e.ph) * s * .5 * mv + .35; P(s * 6.6, 12.5 + b, 0, M.tlimb, 2.8, 6.5, 2.8, stem, -a * .6, gl, undefined, s * -.5); }
    // face
    for (const s of [-1, 1]) {
      P(s * 2.5, 12.6 + b, 6.2, M.ball, 1.7, 2.1, .9, [.98, .98, .96]); P(s * 2.4, 12.4 + b, 6.9, M.ball, .8, 1.1, .5, EYE_DARK);
      P(s * 2.6, 14.9 + b, 6.4, M.box, 2.8, .7, .8, [.45, .32, .26], 0, 0, undefined, s * .4);
    }
    P(0, 9.6 + b, 6.6, M.ball, 1.5, .55 + at * .5, .5, [.35, .15, .12]);
    // cap: dome, rim, gills underneath, spots
    const cy = 21 + b, cz = at * 4.5;
    P(0, cy - 1.6, cz, M.cyl, 13.6 * sq, 1.4, 13.6 * sq, gill, lean); P(0, cy - .4, cz, M.cyl, 15.2 * sq, 1.4, 15.2 * sq, mix(cap, [0, 0, 0], .2), lean);
    P(0, cy + .6, cz, M.ball, 15 * sq, 9.5, 15 * sq, cap, lean, gl);
    for (const [a, rr, sz] of SPOTS) { const dx = Math.cos(a) * rr * 13, dz = Math.sin(a) * rr * 13, h = Math.sqrt(Math.max(0, 1 - rr * rr * .75)) * 9.3; P(dx, cy + .6 + h, dz + cz, M.ball, sz, .8, sz, spot, lean); }
  }

  // ---------------- Goblin Cutthroat ----------------
  // Small, hunched and wiry: big head with long drooping ears, a hooked nose, a toothy grin and yellow eyes; thin arms with
  // big hands, bandy legs with wrapped feet; a ragged tunic, rope belt, loincloth and satchel. Its old dagger stays.
  function goblinModel(e, o) {
    const now = performance.now(), P = part(e.rx, e.ry, e.yaw, o.sc), gl = flashOf(e, now), atk = attackOf(e, now, 300), mv = e.mv;
    const skin = o.skin, dskin = mix(skin, [0, 0, 0], .3), cloth = o.body, rag = mix(cloth, [0, 0, 0], .3), wrap = [.5, .42, .3];
    const sw = Math.sin(e.ph) * .8 * mv, bob = Math.abs(Math.sin(e.ph)) * 1.6 * mv + idleOf(e, now, 480) * .5, lean = .32 + atk * .2;
    for (const s of [-1, 1]) {                                                                          // bandy legs
      const a = s * sw, hip = [s * 4, 22 + bob, -1], knee = tip(hip, 10, a - .25); P(...hip, M.tlimb, 4.6, 10, 4.6, skin, a - .25, gl * .3);
      const ft = tip(knee, 10, a * .6 + .3); P(...knee, M.tlimb, 3.8, 10, 3.8, dskin, a * .6 + .3);
      P(ft[0], ft[1] + 1.2, ft[2] + 2.4, M.ball, 3, 2, 5.4, wrap);                                      // wrapped, long feet
    }
    const ty = 21 + bob; P(0, ty, -1, M.torso, 7.6, 15, 6, cloth, lean, gl);                           // hunched torso
    P(0, ty + .6, -1, M.cyl, 7.4, 2, 6.2, [.42, .34, .22]); P(0, ty - 2, 3.6, M.limb, 6, 8, 1, rag, -.1); P(0, ty - 2, -5.6, M.limb, 6.4, 9, 1, rag, .12);
    for (let i = 0; i < 3; i++) P(-4 + i * 4, ty - 9.4, 3.8 - i * .2, M.cone, 1.4, 3, .5, rag, Math.PI);            // ragged hem
    P(4.8, ty + 2, -7, M.ball, 3.6, 4.2, 2.6, [.4, .3, .17]);                                          // satchel
    const sh = [0, ty + 13.5, 3.8], ax = 7.6;
    const ra = -.35 - 1.7 * atk + sw * .5, la = -.25 - sw * .5;
    for (const [s, a] of [[-1, la], [1, ra]]) {
      const sp = [s * ax, sh[1], sh[2] - 1]; P(...sp, M.ball, 3, 2.8, 3, cloth, 0, gl);
      const el = tip(sp, 9, a * .8); P(...sp, M.tlimb, 3, 9, 3, skin, a * .8, gl * .3); const hd = tip(el, 9, a + .25); P(...el, M.tlimb, 2.6, 9, 2.6, skin, a + .25);
      P(...hd, M.ball, 2.6, 2.4, 2.8, dskin);
      if (s > 0) { const d = a - 1.5 + atk * 1.4; P(...hd, M.limb, 1.6, 12, .8, [.75, .75, .8], d, .1); P(...hd, M.box, 4, 1.2, 1.8, [.3, .2, .1], d); }
    }
    // head: big, forward, low
    const hy = ty + 19, hz = 7 + atk * 2;
    P(0, hy - 4.6, hz - 3, M.cyl, 2.4, 4, 2.4, skin, .5); P(0, hy, hz, M.ball, 7.6, 7, 7.4, skin, 0, gl);
    P(0, hy - 3.8, hz + 3.6, M.ball, 5.6, 2.8, 4.4, skin);                                            // jaw
    P(0, hy - 3.4, hz + 7.4, M.box, 5.4, 1.2 + atk * .8, 1, [.18, .06, .05]);                          // grin, teeth
    for (const t of [-1.8, -.6, .6, 1.8]) P(t, hy - 2.9, hz + 7.9, M.cone, .45, 1.3, .3, TOOTH, Math.PI);
    P(0, hy - .2, hz + 7, M.cone, 1.5, 6, 1.5, dskin, HALF + .55);                                     // hooked nose
    for (const s of [-1, 1]) {
      P(s * 2.7, hy + 1.6, hz + 6.1, M.ball, 1.6, 1.3, .9, [1, .85, .2], 0, .55); P(s * 2.7, hy + 1.5, hz + 6.8, M.ball, .6, .9, .4, EYE_DARK);
      P(s * 2.8, hy + 3.1, hz + 6, M.box, 3.6, 1, 1.4, dskin, 0, 0, undefined, s * -.35);              // heavy brows
      P(s * 6.5, hy + 1.4, hz - 1, M.cone, 2.6, 12, 1.2, skin, -.25, gl, undefined, s * -1.5);         // long ears, droop a little
      P(s * 6.6, hy + 1.6, hz - .4, M.cone, 1.3, 9, .5, mix(skin, [.7, .3, .3], .35), -.25, 0, undefined, s * -1.5);
    }
  }

  // ---------------- Orc Raider ----------------
  // Massive shoulders over a narrow waist, hunched; a small head carried forward with a heavy brow, an underbite with
  // tusks, a flat nose and a topknot; thick arms with big fists and leather bracers; a crossed leather harness,
  // loincloth and fur mantle. Its spiked club stays.
  function orcModel(e, o) {
    const now = performance.now(), P = part(e.rx, e.ry, e.yaw, o.sc), gl = flashOf(e, now), atk = attackOf(e, now, 340), mv = e.mv;
    const skin = o.skin, dskin = mix(skin, [0, 0, 0], .3), leather = o.body, dl = mix(leather, [0, 0, 0], .35), fur = [.38, .3, .22], hair = [.08, .07, .06];
    const sw = Math.sin(e.ph) * .7 * mv, bob = Math.abs(Math.sin(e.ph)) * 1.8 * mv + idleOf(e, now, 560) * .5, lean = .16 + atk * .12;
    for (const s of [-1, 1]) {
      const a = s * sw, hip = [s * 5.6, 26 + bob, 0], knee = tip(hip, 12, a - .1); P(...hip, M.tlimb, 7.6, 12, 7.6, o.leg, a - .1, gl * .3);
      const ft = tip(knee, 12, a * .5 + .1); P(...knee, M.tlimb, 6.4, 12, 6.4, dskin, a * .5 + .1);
      P(ft[0], ft[1] + 1.6, ft[2] + 2, M.box, 6.4, 3.4, 10, dl, a * .3);
    }
    const ty = 24 + bob;
    P(0, ty, 0, M.taper, 8.2, 6, 6.6, leather); P(0, ty + 1.4, 4.2, M.limb, 8, 10, 1.2, dl, -.08); P(0, ty + 1.4, -4.6, M.limb, 8, 9, 1.2, dl, .08); // belt, loincloth
    P(0, ty + 4, 0, M.torso, 12.5, 19, 8.6, skin, lean, gl);                                           // torso, flaring to the shoulders
    P(0, ty + 15, 4.6, M.ball, 8.4, 6, 4, dskin, lean);                                                // chest
    for (const s of [-1, 1]) P(0, ty + 12, 7.6, M.box, 2, 25, 1.2, dl, lean, 0, undefined, s * .62);   // crossed harness
    P(0, ty + 12, 8.5, M.ball, 1.8, 1.8, 1, [.6, .55, .5]);
    const sy = ty + 21, ax = 14.5;
    for (let i = 0; i < 7; i++) { const a = (i - 3) * .45; P(Math.sin(a) * 9, sy + 2, Math.cos(a) * 3 - 3, M.cone, 3.2, 6, 3.2, fur, -1.4, 0, undefined, -a * 1.2); } // fur mantle
    const ra = -.25 - 1.6 * atk + sw * .5, la = -.2 - sw * .5;
    for (const [s, a] of [[-1, la], [1, ra]]) {
      const sp = [s * ax, sy, 0]; P(...sp, M.ball, 6.6, 6, 6.6, skin, 0, gl);
      const el = tip(sp, 12, a * .85); P(...sp, M.tlimb, 7, 12, 7, skin, a * .85, gl * .3); const hd = tip(el, 11, a + .2);
      P(...el, M.tlimb, 6.2, 11, 6.2, skin, a + .2); P(...tip(el, 5, a + .2), M.cyl, 3.6, 5, 3.6, dl, a + .2 - Math.PI);   // bracer
      P(...hd, M.ball, 3.8, 3.8, 4, dskin);
      if (s > 0) club(P, hd, a - 1.6 + atk * 2, 22, 6.5, true);
    }
    // head: forward and low between the shoulders
    const hy = sy + 6, hz = 7 + atk * 2;
    P(0, hy, hz, M.ball, 6.6, 7, 6.8, skin, 0, gl);
    P(0, hy - 4.2, hz + 2.6, M.box, 9.4, 4.4, 8.4, skin);                                              // underbite jaw
    for (const s of [-1, 1]) P(s * 3.3, hy - 3.2, hz + 6.6, M.cone, 1.1, 5.2, 1.1, TOOTH, .2, 0, undefined, s * -.2); // tusks
    P(0, hy + 2.2, hz + 5.2, M.box, 10, 2.4, 3.4, dskin, -.12);                                        // heavy brow
    P(0, hy - .4, hz + 6.4, M.ball, 2.2, 1.8, 1.6, dskin);                                             // flat nose
    for (const s of [-1, 1]) {
      P(s * 2.6, hy + .7, hz + 5.8, M.ball, 1.2, .9, .7, [1, .45, .12], 0, .7);
      P(s * 6.6, hy + 1.6, hz - 1.6, M.cone, 1.6, 5, 1, skin, -.9, 0, undefined, s * -1.2);           // swept-back ears
    }
    P(0, hy + 6.8, hz - 2.4, M.ball, 2.4, 2.6, 2.4, hair); P(0, hy + 9.6, hz - 4.4, M.cone, 1.8, 7, 1.8, hair, -1.1); // topknot
  }

  // ---------------- Cave Spider ----------------
  // Cephalothorax and a big patterned abdomen with a spinneret, a cluster of red eyes (two large, four small),
  // pedipalps and fangs that strike; eight three-segment legs with pale joints and pointed feet.
  function spiderModel(e, o) {
    const now = performance.now(), x = e.rx, z = e.ry, sc = o.sc || 1, P = part(x, z, e.yaw, sc), gl = flashOf(e, now), atk = attackOf(e, now, 300);
    const Bc = o.body, dk = mix(Bc, [0, 0, 0], .4), band = mix(Bc, [.95, .8, .55], .45), joint = mix(Bc, [1, 1, 1], .3), eye = o.glow || [1, .15, .12];
    const y0 = 14 + Math.abs(Math.sin(e.ph * 1.6)) * .8 * e.mv, ab = idleOf(e, now, 400) * .6, l = atk * 4;
    P(0, y0 + 4 + ab, -11, M.ball, 9.6, 8.4, 12, dk, -.15, gl);                                         // abdomen
    for (let i = 0; i < 3; i++) P(0, y0 + 11.6 + ab - i * 1.6, -6.5 - i * 4.4, M.box, 6.4 - i * 1.4, .8, 1.6, band, -.25 - i * .25); // chevrons
    P(0, y0 + 12.2 + ab, -12, M.ball, 1.6, .7, 3.2, eye, -.3, .5);
    P(0, y0 + 2 + ab, -22.5, M.cone, 2.2, 3.6, 2.2, dk, -HALF - .3);                                    // spinneret
    P(0, y0, 2, M.ball, 6.6, 5, 7.6, Bc, 0, gl); P(0, y0 + 3.6, 3.6, M.ball, 4.6, 2.2, 5, dk);          // cephalothorax
    P(0, y0 + .4, 8.8 + l, M.ball, 4.4, 4, 4.2, Bc, 0, gl);
    for (const s of [-1, 1]) {
      P(s * 1.6, y0 + 2.6, 12.2 + l, M.ball, 1.2, 1.2, .9, eye, 0, 1); P(s * 3.2, y0 + 2.2, 11 + l, M.ball, .7, .7, .6, eye, 0, 1); P(s * 2.4, y0 + 3.7, 10.8 + l, M.ball, .6, .6, .5, eye, 0, 1);
      const fb = [s * 1.6, y0 - 1.2, 12 + l]; P(...fb, M.tlimb, 1.8, 3.4, 1.8, dk, .25 - atk * .8); P(...tip(fb, 3.4, .25 - atk * .8), M.cone, .7, 3, .7, TOOTH, Math.PI + .3 - atk * .9, 0, undefined, s * .25); // fangs
      const pb = [s * 3.4, y0 - .4, 11 + l], pa = -1.9 + Math.sin(now / 240 + s) * .15 - atk * .5; P(...pb, M.tlimb, 1.6, 5, 1.6, Bc, pa); P(...tip(pb, 5, pa), M.ball, 1.1, 1.1, 1.1, joint); // pedipalps
    }
    for (let i = 0; i < 8; i++) {
      const s = i % 2 ? 1 : -1, k = i >> 1, ang = e.yaw + s * (.55 + k * .55), g = Math.sin(e.ph * 1.6 + i * 1.57 + (k % 2) * Math.PI) * .3 * e.mv;
      const hip = [x + Math.sin(ang) * 3.6 * sc, y0 * sc, z + Math.cos(ang) * 3.6 * sc], hx = Math.sin(ang), hz = Math.cos(ang);
      const seg = (p, len, pitch) => { const c = Math.cos(pitch), sn = Math.sin(pitch); return [p[0] + hx * -len * sn * sc, p[1] - len * c * sc, p[2] + hz * -len * sn * sc]; };
      const a1 = -2.25 + g * .6, a2 = -.62 + g, a3 = -.12 + g * .4;
      D(M.tlimb, ...hip, 2.6 * sc, 11 * sc, 2.6 * sc, ang, a1, dk); const kn = seg(hip, 11, a1); D(M.ball, ...kn, 1.6 * sc, 1.6 * sc, 1.6 * sc, 0, 0, joint);
      D(M.tlimb, ...kn, 2.1 * sc, 12 * sc, 2.1 * sc, ang, a2, Bc); const an = seg(kn, 12, a2); D(M.ball, ...an, 1.2 * sc, 1.2 * sc, 1.2 * sc, 0, 0, joint);
      D(M.tlimb, ...an, 1.5 * sc, 8 * sc, 1.5 * sc, ang, a3, dk);
    }
  }

  // ---------------- Ogre Brute ----------------
  // A huge, heavy brute: a round gut, short thick legs, long arms that reach the knees, a small head sunk between the
  // shoulders with one heavy brow, tiny eyes, a bulbous nose, an underbite with a snaggle tooth and jug ears; a hide
  // loincloth on a rope belt and a shoulder strap. Its spiked club stays.
  function ogreModel(e, o) {
    const now = performance.now(), P = part(e.rx, e.ry, e.yaw, o.sc), gl = flashOf(e, now), atk = attackOf(e, now, 380), mv = e.mv;
    const skin = o.skin, dskin = mix(skin, [0, 0, 0], .3), hide = o.body, dh = mix(hide, [0, 0, 0], .35), rope = [.62, .52, .32];
    const sw = Math.sin(e.ph) * .55 * mv, bob = Math.abs(Math.sin(e.ph)) * 1.4 * mv + idleOf(e, now, 700) * .6;
    for (const s of [-1, 1]) {
      const a = s * sw, hip = [s * 6.2, 22 + bob, 0], knee = tip(hip, 10, a); P(...hip, M.tlimb, 9, 10, 9, skin, a, gl * .3);
      const ft = tip(knee, 10, a * .4); P(...knee, M.tlimb, 7.6, 10, 7.6, dskin, a * .4);
      P(ft[0], ft[1] + 1.8, ft[2] + 2.4, M.ball, 5, 2.6, 7, o.boot || dskin);
    }
    const ty = 20 + bob;
    P(0, ty + 2, 0, M.cyl, 11.6, 3, 9.6, rope); P(0, ty + 2, 6.4, M.limb, 11, 11, 1.4, hide, -.05); P(0, ty + 2, -6.8, M.limb, 11, 10, 1.4, dh, .05);
    P(0, ty + 12, 2, M.ball, 12.6, 12, 11.6, skin, 0, gl);                                              // gut
    P(0, ty + 9, 9.6, M.ball, 1.3, 1.6, .8, dskin);                                                    // navel
    P(0, ty + 22, -1, M.ball, 13.4, 8.4, 10, skin, 0, gl);                                             // chest and shoulders
    P(0, ty + 19, 6, M.box, 3, 26, 1.4, dh, .1, 0, undefined, .7);                                     // shoulder strap
    const sy = ty + 25, ax = 15.6, ra = -.15 - 1.5 * atk + sw * .45, la = -.1 - sw * .45;
    for (const [s, a] of [[-1, la], [1, ra]]) {
      const sp = [s * ax, sy, -1]; P(...sp, M.ball, 7, 6.4, 7, skin, 0, gl);
      const el = tip(sp, 14, a * .85); P(...sp, M.tlimb, 8, 14, 8, skin, a * .85, gl * .3); const hd = tip(el, 14, a + .15);
      P(...el, M.tlimb, 7.4, 14, 7.4, skin, a + .15); P(...hd, M.ball, 4.8, 4.4, 5, dskin);
      if (s > 0) club(P, hd, a - 1.6 + atk * 2, 30, 9, true);
    }
    const hy = sy + 5, hz = 6 + atk * 1.5;                                                              // small head, sunk forward
    P(0, hy, hz, M.ball, 6.2, 6.6, 6.4, skin, 0, gl);
    P(0, hy - 3.8, hz + 2.4, M.box, 9.6, 4.2, 7.6, skin);                                               // underbite
    P(1.8, hy - 2.4, hz + 6.2, M.cone, 1.2, 4.2, 1.2, TOOTH, .2, 0, undefined, -.25);                   // snaggle tooth
    P(-2, hy - 1.9, hz + 6.2, M.cone, .7, 2, .7, TOOTH, .2);
    P(0, hy + 2.4, hz + 4.8, M.box, 10.4, 2.4, 3.2, dskin, -.1);                                         // one heavy brow
    P(0, hy - .2, hz + 6.2, M.ball, 2.6, 2.4, 2.2, mix(skin, [.75, .35, .35], .3));                     // bulbous nose
    for (const s of [-1, 1]) {
      P(s * 2.5, hy + .9, hz + 5.2, M.ball, .9, .8, .6, EYE_DARK);
      P(s * 6.6, hy + .6, hz - .5, M.ball, 1.8, 3.2, 3.2, skin, 0, 0, undefined, s * .4);               // jug ears
    }
    for (let i = 0; i < 3; i++) P(-1.5 + i * 1.5, hy + 6, hz - 1, M.cone, .35, 3.6, .35, [.12, .1, .08], -.4 + i * .15);
  }

  // ---------------- Wraith ----------------
  // A hooded spectre: a tattered robe that trails into wisps, a deep hood with a void for a face and two burning eyes,
  // a ragged mantle, long bony arms with claw fingers reaching out when it strikes.
  function wraithModel(e, o) {
    const now = performance.now(), fl = Math.sin(now / 400 + (e.id || 0)) * 3, P = part(e.rx, e.ry, e.yaw, o.sc), gl = flashOf(e, now), atk = attackOf(e, now, 340);
    const c = o.body, dk = mix(c, [0, 0, 0], .55), rag = mix(c, [0, 0, 0], .3), bone = [.82, .82, .78], ey = o.eye || [.5, .9, 1], drift = .15 * e.mv;
    P(0, 8 + fl, 0, M.cone, 13, 46, 11, c, drift, gl + .12, .82); P(0, 36 + fl, 0, M.ball, 7.4, 8, 6.4, c, drift, gl + .12, .82); // flared cloak, shoulders
    P(0, 9 + fl, 4.6, M.cone, 3.4, 30, 2.4, dk, drift + .12, 0, .8);                                  // dark fold down the front
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + now / 1100, sway = Math.sin(now / 260 + i * 1.7) * .25; P(Math.cos(a) * 11.4, 10 + fl, Math.sin(a) * 9.6, M.cone, 2.8, 12 + (i % 3) * 4, 2.4, i % 2 ? c : rag, Math.PI + sway, .1, .75); } // tatters
    P(0, 4 + fl, -2, M.cone, 6, 16, 5, rag, Math.PI + .4 + drift, .15, .45);                             // wisp trailing behind
    for (let i = 0; i < 6; i++) { const a = (i - 2.5) * .5; P(Math.sin(a) * 8.8, 40 + fl, Math.cos(a) * 3, M.cone, 3, 7, 2.4, rag, Math.PI - .2, .1, .8, -a * .9); } // ragged mantle
    P(0, 47 + fl, -1, M.ball, 8.4, 9.2, 8.6, dk, 0, gl); P(0, 53 + fl, -5.6, M.cone, 5, 10, 5, dk, -1.05); // hood
    P(0, 46.4 + fl, 3.6, M.ball, 6, 7, 3.4, [0, 0, 0]);                                                  // void face
    for (const s of [-1, 1]) { P(s * 2.2, 47.4 + fl, 6.6, M.ball, 1.3, .8, .7, ey, 0, 1); P(s * 2.1, 47.4 + fl, 7.4, M.ball, .5, .4, .3, [1, 1, 1], 0, 1); }
    for (const s of [-1, 1]) {
      const a = -1 - atk * 1.1 + Math.sin(now / 500 + s) * .15, sp = [s * 9.4, 40 + fl, 0]; P(...sp, M.tlimb, 3.6, 10, 3.6, rag, a, gl, .82);   // sleeve
      const el = tip(sp, 10, a); P(...el, M.tlimb, 1.6, 9, 1.6, bone, a - .25); const hd = tip(el, 9, a - .25);       // bony forearm
      P(...hd, M.ball, 1.4, 1.2, 1.6, bone);
      for (let j = -1; j <= 1; j++) P(hd[0] + j * 1.2, hd[1], hd[2], M.cone, .5, 6 + atk * 2, .5, bone, a - .25 - Math.PI + j * .12, .1); // claws
    }
    if (Math.random() < .05) burst(e.rx, 20 + fl, e.ry, 1, ey, 20, 1.2, 1.4, 1, -40);
  }

  // ---------------- registration: only the Day 1 enemies ----------------
  const DAY1 = { wolf: wolfModel, boar: boarModel, slime: slimeModel, shroom: shroomModel, goblin: goblinModel, orc: orcModel, spider: spiderModel, ogre: ogreModel, wraith: wraithModel };
  for (const [type, fn] of Object.entries(DAY1)) if (MODEL[type]) MODEL[type] = { ...MODEL[type], fn };
  MODEL.wolf.belly = [.8, .8, .78];
  window.EnemyModels = { DAY1, wolfModel, boarModel, slimeModel, shroomModel, goblinModel, orcModel, spiderModel, ogreModel, wraithModel };
  if (window.Shardlands) Shardlands.EnemyModels = window.EnemyModels;
})();
