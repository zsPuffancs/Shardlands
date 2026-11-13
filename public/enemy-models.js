// Shardlands: enemy models for every normal monster and its Alpha variant (not the Skeleton, the Bandit or the bosses).
//
// Low-poly creatures and characters built from the engine's primitive meshes, like every procedural model in game.js,
// and animated the same way (walk phase e.ph, movement e.mv, attack time e.atkT, hit flash e.flash). Each enemy has its
// own builder here, so the shared builders in game.js (human, beast, slime, spider, shroom, wraith, golem, drake) and
// every enemy that still uses them (Skeleton, Bandit, the bosses) draw exactly as before.
// Loaded after game.js (index.html); assigns the builders to the normal monsters' entries of MODEL.
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
    if (o.alpha) { // Alpha: a heavy pale mane, a hackle ridge down the back, scars on the flank, burning eyes
      const mane = mix(pale, [1, 1, 1], .3), scar = mix(F, [.7, .25, .2], .6);
      for (let k = -3; k <= 3; k++) P(k * 1.6, 29.6 + br + bob - Math.abs(k) * .7, 8.6 + l * .6, M.cone, 2.6, 7.6, 2.2, mane, -1.3, gl, undefined, -k * .32);
      for (let i = 0; i < 5; i++) P(0, 27.6 + br + bob - i * .25, 4 - i * 3.4, M.cone, 1.3, 4.4 - i * .4, 1.1, dk, -.45);
      for (const s of [-1, 1]) P(s * 2.4, hy + 1.1, hz + 3.4, M.ball, 1.3, 1, .8, [1, .8, .3], 0, 1);
      for (const k of [0, 1]) P(-6.5, 22.6 + br + bob - k, 3 + k * 4, M.box, .5, 5, .5, scar, 0, 0, undefined, .7);
    }
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
    if (o.alpha) { // Alpha: thick hide plates over the back, a second, larger pair of tusks, a taller mane, red eyes
      const plate = mix(dk, [.32, .28, .24], .4);
      for (let i = 0; i < 4; i++) P(0, 25.8 + br + bob - i * 1.2, 6.5 - i * 4.4, M.box, 10 - i, 2, 4.2, plate, -.12, 0, undefined, i % 2 ? .08 : -.08);
      for (let i = 0; i < 6; i++) P(0, 31 + br + bob - i * .9, 9.5 - i * 3, M.cone, 1.1, 5.4, 1, mane, -.35);
      for (const s of [-1, 1]) { P(s * 4, hy - 3.4 - dip * 2, hz + 5.6, M.cone, 1.3, 6.6, 1.3, TOOTH, .1 + dip + atk * .3, 0, undefined, s * -.95); P(s * 3.6, hy + 2, hz + 3.7, M.ball, 1, .95, .65, [1, .22, .1], 0, .9); }
    }
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
    if (o.alpha) { // Alpha: a toxic glowing core, a ring of soft spines, angry brows
      D(M.ball, x, y - r * .25, z, r * .2, r * .18, r * .2, e.yaw, 0, mix(o.body, [1, 1, .4], .55), 1);
      for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; D(M.cone, x + Math.sin(a) * sx * .7, y + syy * .45, z + Math.cos(a) * sx * .7, r * .1, r * .34, r * .1, a, .55, mix(c, [0, 0, 0], .3), .2); }
      for (const s of [-1, 1]) { const p = at(sx * .86, s * r * .3, y + r * .42); D(M.box, p[0], p[1], p[2], r * .3, r * .06, r * .06, e.yaw, 0, [.05, .1, .04], 0, undefined, s * .45); }
    }
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
    if (o.alpha) { // Alpha: spots glowing with spores, a ragged veil hanging under the cap, a ring of warts on the stem
      for (const [a, rr, sz] of SPOTS) { const dx = Math.cos(a) * rr * 13, dz = Math.sin(a) * rr * 13, h = Math.sqrt(Math.max(0, 1 - rr * rr * .75)) * 9.3; P(dx, cy + 1.2 + h, dz + cz, M.ball, sz * .85, .9, sz * .85, [.72, 1, .45], lean, 1); }
      P(0, cy - 2.3, cz, M.cyl, 12.6, .6, 12.6, [.55, .95, .4], lean, .8);                                  // glowing gills
      for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; P(Math.cos(a) * 6.4, cy - 2.6, Math.sin(a) * 6.4 + cz, M.cone, 1.8, 4 + (i % 3), 1, gill, Math.PI, 0); }
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + .4; P(Math.cos(a) * 6.6, 6 + b, Math.sin(a) * 6.6 + .6, M.ball, 1.1, 1.1, 1.1, shade); }
    }
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
    if (o.alpha) { // Alpha: a crest of black hair, red war paint across the eyes and chest, bone rings in the ears, a scar
      const paint = [.72, .1, .08], bone = [.9, .86, .74];
      for (let i = 0; i < 5; i++) P(0, hy + 6.6 - Math.abs(i - 2) * .6, hz - 5 + i * 2.2, M.cone, 1.2, 4.6 - Math.abs(i - 2) * .7, .8, [.1, .08, .07], -.25 + (i - 2) * .12);
      P(0, hy + 1.6, hz + 6.6, M.box, 8, .8, .5, paint); for (const s of [-1, 1]) P(s * 2.4, ty + 9, 5.2, M.box, .8, 7, .5, paint, -lean, 0, undefined, s * .3);
      for (const s of [-1, 1]) P(s * 10.6, hy + .6, hz - 1.2, M.ball, .9, 1.6, .9, bone);
      P(-1.2, hy + .4, hz + 6.4, M.box, .4, 4, .4, [.55, .3, .25], 0, 0, undefined, .6);
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
    if (o.alpha) { // Alpha: bone spikes on the shoulders, longer tusks, white war paint on the face and chest, a scarred eye
      const bone = [.9, .87, .78], paint = [.92, .9, .84];
      for (const s of [-1, 1]) { for (let k = 0; k < 3; k++) P(s * (ax + 1.6), sy + 4.6, -3 + k * 3, M.cone, 1.3, 6 - Math.abs(k - 1) * 1.6, 1.3, bone, (k - 1) * .3, 0, undefined, s * -.55); P(s * 3.3, hy - 2.6, hz + 6.8, M.cone, 1.3, 7.6, 1.3, TOOTH, .2, 0, undefined, s * -.25); }
      P(0, hy + .8, hz + 6.8, M.box, 9, .8, .4, paint); for (const s of [-1, 1]) P(s * 3.6, ty + 14, 9.2, M.box, 1, 8, .5, paint, lean, 0, undefined, s * -.35);
      P(2.6, hy + 1.4, hz + 6.6, M.box, .5, 4.4, .4, [.4, .2, .16], 0, 0, undefined, -.3);
    }
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
    if (o.alpha) { // Alpha: a glowing hourglass on the abdomen, a ridge of bristling spikes, longer fangs
      P(0, y0 + 11.6 + ab, -13, M.octa, 2.4, 3.6, .8, [1, .2, .12], -.25, 1); P(0, y0 + 10.4 + ab, -16, M.octa, 2, 3, .8, [1, .2, .12], -.6, 1);
      for (let i = 0; i < 6; i++) P((i % 2 ? 1 : -1) * 3.6, y0 + 10.6 + ab - Math.floor(i / 2) * 2.4, -6 - Math.floor(i / 2) * 5, M.cone, .9, 4, .9, joint, -.4, 0, undefined, (i % 2 ? -1 : 1) * .5);
      for (const s of [-1, 1]) P(s * 1.6, y0 - 4.4, 12.6 + l, M.cone, .8, 4.6, .8, TOOTH, Math.PI + .25 - atk * .9, 0, undefined, s * .25);
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
    if (o.alpha) { // Alpha: great curved horns, a nose ring, tribal stripes on the gut and arms, a second snaggle tooth
      const horn = [.82, .76, .62], paint = mix(skin, [.95, .9, .8], .6);
      for (const s of [-1, 1]) { P(s * 5, hy + 4, hz - 1.6, M.cone, 2.2, 8.5, 2.2, horn, -.2, 0, undefined, s * -1.15); P(s * 12.4, hy + 7, hz - 2.2, M.cone, 1.3, 5.5, 1.3, horn, .7, 0, undefined, s * -.15); }
      P(0, hy - 1.6, hz + 8, M.ring, 1.6, 1, 1.6, [.8, .7, .4], HALF, .2);
      for (let i = 0; i < 3; i++) P(0, ty + 15 - i * 3.6, 13.3 - Math.abs(i - 1) * .8, M.box, 10 - Math.abs(i - 1) * 3, .9, .6, paint, -.15 + i * .15);
      P(-1.8, hy - 2.4, hz + 6.2, M.cone, 1.1, 3.8, 1.1, TOOTH, .2, 0, undefined, .25);
    }
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
    if (o.alpha) { // Alpha: a spectral crown above the hood, glowing runes down the cloak, orbiting soul lights, longer claws
      for (let i = 0; i < 5; i++) { const a = (i - 2) * .42; P(Math.sin(a) * 6, 56 + fl - Math.abs(i - 2), Math.cos(a) * 2 - 2, M.cone, .9, 5 + (i === 2 ? 3 : 0), .9, ey, -.25, .9, undefined, -a); }
      for (let i = 0; i < 4; i++) P(0, 34 + fl - i * 6.6, 7.6 + i * 1.6, M.octa, .9, 1.6, .5, ey, .2, 1);
      for (let i = 0; i < 3; i++) { const a = now / 600 + i * TAU / 3 + (e.id || 0); P(Math.cos(a) * 14, 40 + fl + Math.sin(a * 2) * 4, Math.sin(a) * 14, M.ball, 1.2, 1.2, 1.2, ey, 0, 1); }
    }
  }

  // ======================= later stages =======================
  // Volcanic / Ember Wastes, glacier / Frostfang Peaks, voidscar / Voidreach (also the Death Zone and generated regions).

  // ---------------- Hellhound ----------------
  // A heavy, scorched hound: charcoal hide split by glowing magma seams, a burning mane, swept-back horns, a broad head
  // with a glowing maw, clawed paws and an ember-tipped tail. Alpha: twin horn pairs, a molten collar, more seams,
  // a taller mane and a flame plume on the tail.
  function hellhoundModel(e, o) {
    const now = performance.now(), P = part(e.rx, e.ry, e.yaw, o.sc), gl = flashOf(e, now), mv = e.mv, atk = attackOf(e, now, 300), A = !!o.alpha;
    const F = o.body, L = o.leg, dk = mix(F, [0, 0, 0], .45), fire = o.spikes || [1, .45, .1], hot = mix(fire, [1, .9, .4], .35), eye = o.eye || [1, .7, .1], horn = [.34, .27, .22];
    const fl = Math.sin(now / 90 + (e.id || 0)), br = idleOf(e, now, 520) * .5, bob = Math.abs(Math.sin(e.ph)) * 1.3 * mv, l = atk * 5.5;
    for (const side of [-1, 1]) for (const front of [true, false]) {
      const a = Math.sin(e.ph + (front ? 0 : Math.PI) + (side > 0 ? Math.PI : 0)) * .65 * mv, x = side * 5;
      const hip = [x, 18.5 + bob, front ? 9 + l * .4 : -9], k1 = tip(hip, 9, front ? a * .9 : a - .4);
      P(...hip, M.tlimb, front ? 6 : 6.6, 9, front ? 6 : 6.6, F, front ? a * .9 : a - .4, gl * .3);
      const ft = tip(k1, 9.5, front ? a * .4 : a * .5 + .45); P(...k1, M.tlimb, 4.2, 9.5, 4.2, L, front ? a * .4 : a * .5 + .45);
      P(ft[0], ft[1] + 1, ft[2] + 1.2, M.ball, 2.8, 1.6, 3.4, L); for (const c of [-1, 0, 1]) P(ft[0] + c * 1.3, ft[1] + .6, ft[2] + 4, M.cone, .5, 2.2, .5, TOOTH, HALF);
    }
    P(0, 22.5 + br + bob, 5, M.ball, 8.2, 8.4, 9.4, F, 0, gl); P(0, 22 + br + bob, -4, M.ball, 6.4, 6.6, 8, F, 0, gl); P(0, 22.4 + br + bob, -10, M.ball, 6.4, 6.4, 5.6, F, 0, gl);
    P(0, 19 + bob, 4, M.ball, 6, 4.4, 7.4, dk);
    const seams = A ? 6 : 3; for (let i = 0; i < seams; i++) for (const s of [-1, 1]) P(s * (7.4 - (i % 3) * .6), 23 + bob - (i % 3) * 2, 6 - Math.floor(i / 3) * 9 - (i % 3) * 2.6, M.box, .5, 5.5, .6, hot, 0, .9, undefined, s * (.5 + (i % 2) * .4));
    const mn = A ? 7 : 5; for (let k = 0; k < mn; k++) { const t = k / (mn - 1); P((k % 2 ? 1 : -1) * .9, 30 + br + bob - t * 3 + fl * .4, 11 - t * 18, M.cone, 2.7, (A ? 12.5 : 10) - t * 4 + fl * 1.4, 2.4, k % 2 ? fire : hot, -.55 - t * .3, 1); }
    const hz = 18.5 + l, hy = 29.5 + bob - atk * 1.5;
    P(0, hy - 3, hz - 5, M.ball, 5.8, 6, 6, F, 0, gl); P(0, hy, hz, M.ball, 6.4, 5.6, 6.6, F, 0, gl);
    P(0, hy - 1.6, hz + 4.6, M.taper, 3.4, 6.6, 3, F, HALF - .08); P(0, hy - 3.8, hz + 4.2, M.taper, 2.6, 6, 1.8, dk, HALF + .2 + atk * .55);
    P(0, hy - 2.6, hz + 6.6, M.ball, 2.2, 1 + atk * 1.4, 3, hot, 0, 1);                                   // glowing maw
    P(0, hy - .8, hz + 11, M.ball, 1.5, 1.2, 1.2, EYE_DARK);
    for (const s of [-1, 1]) {
      P(s * 1.5, hy - 2.8, hz + 9.6, M.cone, .55, 2.2, .55, TOOTH, Math.PI);
      P(s * 2.8, hy + 1.4, hz + 3.6, M.ball, 1.2, .8, .7, eye, 0, 1); P(s * 2.9, hy + 2.5, hz + 3.4, M.box, 3, .8, 1.4, horn, 0, 0, undefined, s * .45);
      const hb = [s * 3.2, hy + 3.6, hz - 1]; P(...hb, M.cone, 1.6, 9, 1.6, horn, -1.15, 0, undefined, s * -.35); P(hb[0] + s * 1.6, hb[1] + 3, hb[2] - 6.6, M.cone, .8, 4, .8, horn, -2, 0, undefined, s * -.3); // swept-back horns
      if (A) P(s * 4.6, hy + 1.4, hz - 2.6, M.cone, 1.2, 7, 1.2, horn, -1.45, 0, undefined, s * -.9);
    }
    const ta = 1.05 + mv * .55 + Math.sin(now / 240 + (e.id || 0)) * .15, tb = [0, 24 + bob, -15], tm = tip(tb, 9, ta);
    P(...tb, M.tlimb, 3.4, 9, 3.4, F, ta); P(...tm, M.tlimb, 2.4, 7, 2.4, dk, ta + .3); const tt = tip(tm, 7, ta + .3);
    P(...tt, M.cone, A ? 2.6 : 1.8, (A ? 8 : 5) + fl, A ? 2.6 : 1.8, fire, ta + .3 - Math.PI, 1);
    if (A) { for (let i = 0; i < 6; i++) { const ang = i / 6 * TAU; P(Math.sin(ang) * 6, hy - 6.5 + Math.cos(ang) * 4, hz - 6, M.cone, 1, 3.4, 1, hot, -HALF, .9, undefined, -ang); } } // molten collar
  }

  // ---------------- Ember Drake ----------------
  // A winged fire drake on four clawed legs: a scaled body with pale belly plates and a row of dorsal plates, a long
  // neck, a horned head with brow frills and a jaw that opens on the fire, ribbed wings and a tail ending in a blade.
  // Alpha: a crown of horns, a glowing furnace in the chest, wing-claw spikes and gold-tipped plates.
  function drakeModel(e, o) {
    const now = performance.now(), P = part(e.rx, e.ry, e.yaw, o.sc), t = now / 1000, sw = Math.sin(e.ph) * .7 * e.mv, gl = flashOf(e, now), A = !!o.alpha;
    const Bc = o.body, L = o.leg, bel = o.belly || [1, .8, .4], wg = o.wing || mix(Bc, [1, .4, .1], .4), fr = o.fire || [1, .6, .1], horn = [.5, .4, .32], tipc = A ? [.95, .78, .3] : L;
    const atk = attackOf(e, now, 340), lg = atk * 6, fl = Math.sin(t * 4 + (e.id || 0)) * .45;
    for (let i = 0; i < 4; i++) {
      const fx = i % 2 ? 8 : -8, fz = i < 2 ? 12 : -12, a = (i % 3 ? sw : -sw), hip = [fx, 20, fz], kn = tip(hip, 9, a - (i < 2 ? 0 : .35));
      P(...hip, M.tlimb, 8, 9, 8, Bc, a - (i < 2 ? 0 : .35)); const ft = tip(kn, 10, a * .5 + (i < 2 ? .1 : .45)); P(...kn, M.tlimb, 5.6, 10, 5.6, L, a * .5 + (i < 2 ? .1 : .45));
      P(ft[0], ft[1] + 1.4, ft[2] + 1.6, M.ball, 4, 2.2, 5, L); for (const c of [-1, 0, 1]) P(ft[0] + c * 1.8, ft[1] + 1, ft[2] + 5.6, M.cone, .7, 3, .7, TOOTH, HALF);
    }
    P(0, 31, 0, M.ball, 11.5, 10, 23, Bc, 0, gl);
    for (let i = 0; i < 6; i++) P(0, 22.6 + Math.abs(i - 2.5) * .5, 13 - i * 5, M.box, 13 - Math.abs(i - 2.5) * 1.6, 2, 4.4, bel, 0, .2);   // belly plates
    for (let i = 0; i < 7; i++) P(0, 40.5 - i * .6, 16 - i * 6, M.cone, 2.6, 8 - i * .6, 1.2, i % 2 ? tipc : L, -.45);                   // dorsal plates
    if (A) P(0, 30, 17, M.ball, 4.6, 5, 3.6, fr, 0, .9 + Math.sin(t * 6) * .1);                                                          // chest furnace
    P(0, 38, 21, M.ball, 6.4, 6.8, 8, Bc, 0, gl); P(0, 44, 27 + lg * .5, M.ball, 5.2, 5.8, 6.4, Bc, 0, gl); P(0, 34, 22, M.ball, 3, 3.4, 5, bel, 0, .2);
    const hz = 34 + lg, hy = 48;
    P(0, hy, hz, M.ball, 5.4, 5, 7, Bc, 0, gl); P(0, hy - .8, hz + 5, M.taper, 3.8, 10.5, 2.8, Bc, HALF - .05); P(0, hy - 3, hz + 4.4, M.taper, 2.8, 9.6, 1.6, L, HALF + .15 + atk * .5);
    for (const s of [-1, 1]) {
      P(s * 1.5, hy - 2.2, hz + 14, M.cone, .5, 2, .5, TOOTH, Math.PI); P(s * 1.4, hy + .6, hz + 14.4, M.ball, .6, .5, .5, EYE_DARK); P(s * 3.6, hy + 1.6, hz + 4, M.ball, 1.3, 1, .9, [1, .9, .2], 0, 1); P(s * 3.6, hy + 2.6, hz + 3.6, M.box, 3.4, .9, 2.4, L, 0, 0, undefined, s * .4);
      P(s * 3.2, hy + 3, hz - 2.6, M.cone, 1.8, 11, 1.8, horn, -1.05, 0, undefined, s * -.3); P(s * 5.2, hy + .2, hz - 1, M.cone, 1, 6, .6, L, -1.3, 0, undefined, s * -1.1);   // horns, brow frills
      if (A) { P(s * 1.6, hy + 4.6, hz - .4, M.cone, 1.1, 7, 1.1, [.95, .78, .3], -.7, .2, undefined, s * -.15); P(s * 5, hy + 3, hz - 4.6, M.cone, 1.2, 8, 1.2, horn, -1.4, 0, undefined, s * -.8); }
      const wa = s * (1.9 + fl); P(s * 9, 41, 3, M.tlimb, 3.2, 44, 3.2, L, 0, 0, undefined, wa);                                              // wing arm
      P(s * 9, 41, 3, M.wing, s * 46, 1, 36, wg, 0, .22, undefined, s * (.33 + fl));
      for (let r = 0; r < 3; r++) P(s * 9, 41, 3, M.box, 1, 1, 30 - r * 6, L, 0, 0, undefined, s * (.33 + fl));                               // wing ribs
      if (A) { const wt = [s * (9 + Math.cos(.33 + fl) * 44), 41 + Math.sin(.33 + fl) * 44, 3]; P(...wt, M.cone, 1.2, 7, 1.2, TOOTH, .2, 0, undefined, s * -(.33 + fl) - s * HALF); }
    }
    P(0, 46.6, hz + 16.5 + Math.sin(t * 9), M.ball, 2 + atk * 3, 2 + atk * 3, 2 + atk * 3, fr, 0, 1);
    const sx = Math.sin(t * 2 + (e.id || 0)) * 3; P(0, 30, -24, M.ball, 6.4, 5.6, 10, Bc); P(sx * .5, 28, -37, M.ball, 4.4, 4, 9, Bc); P(sx, 26, -48, M.ball, 3, 2.8, 8, Bc);
    for (let i = 0; i < 3; i++) P(sx * i * .5, 34 - i * 2, -24 - i * 12, M.cone, 1.6, 5 - i, 1, tipc, -.6);
    P(sx * 1.4, 26, -55, M.box, 7, 1.2, 6, L, 0, 0, undefined, 0); P(sx * 1.5, 26, -59, M.cone, 3, 6, 1, A ? [.95, .78, .3] : L, -HALF);   // tail blade
  }

  // ---------------- Magma Golem ----------------
  // A hunched giant of fused boulders: a cracked chest with a molten core showing through, a small head sunk in the
  // shoulders with burning eyes, boulder shoulders with obsidian spires, huge fists dripping lava, stumpy legs.
  // Alpha: obsidian armour plates, a crown of black spires, a brighter, larger core and glowing knuckles.
  function magmaGolemModel(e, o) {
    const now = performance.now(), P = part(e.rx, e.ry, e.yaw, o.sc), sw = Math.sin(e.ph) * .5 * e.mv, gl = flashOf(e, now), A = !!o.alpha;
    const rk = o.body, dk = mix(rk, [0, 0, 0], .35), obs = [.1, .08, .09], lv = o.lava || [1, .5, .1], pu = .75 + Math.sin(now / 300 + (e.id || 0)) * .25, atk = attackOf(e, now, 380);
    for (const s of [-1, 1]) { P(s * 8, 14, s * sw * 7, M.rock, 7.6, 13, 8.6, dk); P(s * 8.4, 4.4, s * sw * 9 + 2, M.rock, 9, 5, 11, rk); }
    P(0, 26, 0, M.rock, 13, 9, 11, dk, 0, gl); P(0, 37, 2, M.rock, 18, 14, 13.5, rk, .12, gl);               // pelvis, chest leaning forward
    P(0, 36, 10.6, M.ball, A ? 8.6 : 7.2, A ? 8.6 : 7.4, 3.8, lv, 0, pu); P(0, 36, 13.6, M.ball, 3.4, 3.6, 1.2, mix(lv, [1, 1, .7], .5), 0, 1);                                           // molten core
    for (const [x, y, r] of [[-9, 31, .5], [8, 43, -.6], [0, 24, 0], [-12, 41, 1.1], [11, 30, -1], [-5, 46, .2], [5, 28, .9]]) P(x, y, 11.4, M.box, 8, 1.6, 1, lv, 0, pu, undefined, r);
    for (const s of [-1, 1]) {
      const a = s > 0 ? -.25 - 1.5 * atk + sw : -.25 - sw, sp = [s * 19.5, 45, 1];
      P(...sp, M.rock, 10.5, 9, 10, dk, 0, gl); P(sp[0] + s * 2, sp[1] + 8, sp[2] - 2, M.cone6, 3.6, 13, 3.6, obs, -.3, 0, undefined, s * -.4);
      const el = tip(sp, 12, a); P(...el, M.rock, 7, 9, 7, rk); P(el[0] + s * 6.6, el[1], el[2], M.box, 1.2, 8, 1, lv, a, pu); const fist = tip(el, 14, a * .8);
      P(...fist, M.rock, 10, 10, 10, dk, 0, gl); for (const c of [-1, 1]) P(fist[0] + c * 3, fist[1] - 3, fist[2] + 4, M.box, 1.4, 4, 1, lv, 0, A ? 1 : pu);
      P(fist[0], fist[1] - 9, fist[2], M.cone, 1.6, 5 + Math.sin(now / 200 + s) * 1.5, 1.6, lv, Math.PI, 1);                         // lava drip
    }
    P(0, 51, 7, M.rock, 7.4, 6.4, 7.4, rk, 0, gl); for (const s of [-1, 1]) P(s * 3, 52, 13.6, M.ball, 1.6, 1.2, .8, lv, 0, 1); P(0, 54.6, 12.4, M.box, 9, 2, 3, dk, -.2); P(0, 48.4, 13.4, M.box, 4.6, 1.2, 1, lv, 0, pu); // brow, burning mouth
    P(0, 47, -8, M.cone6, 6, 15, 6, obs, -.5); P(-9, 44, -7, M.cone6, 4, 11, 4, obs, -.5, 0, undefined, .4); P(9, 44, -7, M.cone6, 4, 11, 4, obs, -.5, 0, undefined, -.4);
    for (const [x, y, z] of [[0, 58, -15.6], [-13, 52, -11.6], [13, 52, -11.6]]) P(x, y, z, M.octa, 1.2, 2.6, 1.2, lv, 0, 1);          // glowing spire tips
    if (A) {
      for (const s of [-1, 1]) P(s * 9, 38, 9, M.box, 9, 12, 2.4, obs, .1, 0, undefined, s * .25);
      for (let i = 0; i < 5; i++) { const a = (i - 2) * .45; P(Math.sin(a) * 5, 56, 6 - Math.cos(a) * 2, M.cone6, 1.6, 7 + (i === 2 ? 4 : 0), 1.6, obs, -.2, 0, undefined, -a * .8); }
    }
  }

  // ---------------- Frost Fang ----------------
  // A glacier wolf built for the cold: a bulky, shaggy coat that hangs in layers, a thick neck mane, broad paws, long
  // sabre fangs and ice shards growing along the spine. Alpha: antler-like ice crowns, glowing rime cracks and a
  // heavier mane.
  function frostfangModel(e, o) {
    const now = performance.now(), P = part(e.rx, e.ry, e.yaw, o.sc), gl = flashOf(e, now), mv = e.mv, atk = attackOf(e, now, 300), A = !!o.alpha;
    const F = o.body, L = o.leg, shag = mix(F, L, .25), ice = o.spikes || [.6, .85, 1], eye = o.eye || [.3, .8, 1];
    const br = idleOf(e, now, 640) * .5, bob = Math.abs(Math.sin(e.ph)) * 1.2 * mv, l = atk * 5;
    for (const side of [-1, 1]) for (const front of [true, false]) {
      const a = Math.sin(e.ph + (front ? 0 : Math.PI) + (side > 0 ? Math.PI : 0)) * .6 * mv, x = side * 5;
      const hip = [x, 18 + bob, front ? 9 + l * .4 : -9.5], kn = tip(hip, 8.5, front ? a * .9 : a - .4);
      P(...hip, M.tlimb, 6.4, 8.5, 6.4, shag, front ? a * .9 : a - .4, gl * .3);
      const ft = tip(kn, 9, front ? a * .4 : a * .5 + .45); P(...kn, M.tlimb, 4.4, 9, 4.4, L, front ? a * .4 : a * .5 + .45); P(ft[0], ft[1] + 1.1, ft[2] + 1.4, M.ball, 3.2, 1.6, 3.8, L);
    }
    P(0, 22 + br + bob, 4, M.ball, 8.6, 8.6, 10, F, 0, gl); P(0, 22 + br + bob, -6, M.ball, 7.2, 7.4, 9, F, 0, gl);
    for (let i = 0; i < 10; i++) { const s = i % 2 ? 1 : -1, z = 8 - (i >> 1) * 4.4; P(s * 7.6, 17.6 + bob, z, M.cone, 2.6, 7, 2.2, i % 4 < 2 ? shag : F, Math.PI, 0, undefined, s * .25); }   // shaggy coat
    for (let i = 0; i < 5; i++) P(0, 30.6 + br + bob - i * .4, 6 - i * 4.2, M.octa, 1.4, 3.4 - i * .3, 1.4, ice, -.3, .35);                                // ice shards
    for (let k = -3; k <= 3; k++) P(k * 1.9, 28.4 + br + bob - Math.abs(k) * .9, 11 + l * .6, M.cone, 2.8, A ? 8 : 6, 2.4, F, -1.2, gl, undefined, -k * .36);
    const hz = 18 + l, hy = 29 + bob - atk * 1.2;
    P(0, hy - 2.5, hz - 4.5, M.ball, 5.4, 5.6, 6, F, 0, gl); P(0, hy, hz, M.ball, 5.8, 5.2, 6, F, 0, gl);
    P(0, hy - 1.6, hz + 4.4, M.taper, 3, 7, 2.6, F, HALF - .06); P(0, hy - 3.4, hz + 4, M.taper, 2.2, 6.2, 1.4, mix(F, [1, 1, 1], .3), HALF + .18 + atk * .5);
    P(0, hy - 1, hz + 11, M.ball, 1.4, 1.1, 1.2, [.12, .16, .22]);
    for (const s of [-1, 1]) {
      P(s * 1.7, hy - 3.6, hz + 9, M.cone, .7, 4.6, .6, TOOTH, Math.PI + .15);                                          // sabre fangs
      P(s * 2.6, hy + 1.2, hz + 3.6, M.ball, 1.1, .8, .7, eye, 0, 1); P(s * 2.7, hy + 2.2, hz + 3.4, M.box, 2.8, .7, 1.3, L, 0, 0, undefined, s * .3);
      P(s * 3.1, hy + 3.4, hz - 1.4, M.cone, 1.9, 5.6, 1.3, F, -.3, gl, undefined, s * -.3);
      P(s * 4.8, hy - 1.4, hz - 1, M.cone, 2, 5.6, 1.6, F, -1.4, 0, undefined, s * -1);
      if (A) { const cb = [s * 2.6, hy + 4.6, hz - 2]; P(...cb, M.octa, 1.2, 6, 1.2, ice, -.5, .6, undefined, s * -.4); P(cb[0] + s * 2, cb[1] + 4, cb[2] - 2, M.octa, .8, 3.6, .8, ice, -.9, .6, undefined, s * -1); P(s * 7.9, 22 + bob, 2, M.box, .5, 7, .6, ice, 0, .8, undefined, s * .5); }
    }
    const ta = 1 + mv * .6 + Math.sin(now / 300 + (e.id || 0)) * .1, tb = [0, 23 + bob, -15], tm = tip(tb, 7, ta);
    P(...tb, M.tlimb, 5.4, 7, 5.4, F, ta); P(...tm, M.tlimb, 5, 7, 5, shag, ta + .25); P(...tip(tm, 7, ta + .25), M.ball, 2.6, 2.6, 3, mix(F, [1, 1, 1], .4));
  }

  // ---------------- Yeti ----------------
  // A hulking, hunched snow ape: massive shoulders, long arms that nearly reach the ground, short legs, shaggy white fur
  // in tufts, a blue-grey face with a heavy brow, a flat nose and a fanged mouth, horns curling forward, huge hands and
  // feet with dark claws. Alpha: great curled horns, ice crusts on the shoulders, glowing eyes and a grey ruff.
  function yetiModel(e, o) {
    const now = performance.now(), P = part(e.rx, e.ry, e.yaw, o.sc), gl = flashOf(e, now), atk = attackOf(e, now, 380), mv = e.mv, A = !!o.alpha;
    const fur = o.body, shade = mix(fur, [.5, .58, .7], .3), face = [.5, .62, .76], claw = [.2, .22, .28], horn = [.86, .86, .8], ice = [.6, .85, 1];
    const sw = Math.sin(e.ph) * .55 * mv, bob = Math.abs(Math.sin(e.ph)) * 1.6 * mv + idleOf(e, now, 620) * .6, lean = .3 + atk * .12;
    for (const s of [-1, 1]) {
      const a = s * sw, hip = [s * 6.4, 19 + bob, -1], kn = tip(hip, 9, a - .2); P(...hip, M.tlimb, 9, 9, 9, fur, a - .2, gl * .3);
      const ft = tip(kn, 9, a * .4 + .2); P(...kn, M.tlimb, 7, 9, 7, shade, a * .4 + .2); P(ft[0], ft[1] + 1.8, ft[2] + 3, M.ball, 5, 2.4, 7.6, face);
      for (const c of [-1, 0, 1]) P(ft[0] + c * 2.2, ft[1] + 1.2, ft[2] + 9.6, M.cone, .7, 2.2, .7, claw, HALF);
    }
    const ty = 18 + bob; P(0, ty, 0, M.torso, 11, 20, 9, fur, lean, gl); P(0, ty + 16, 4, M.ball, 15, 11, 11, fur, lean, gl);   // hunched torso, shoulder hump
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, rr = 12.5; P(Math.cos(a) * rr, ty + 16 + Math.sin(a * 2) * 2, 4 + Math.sin(a) * 9, M.cone, 3, 7, 3, i % 3 ? fur : shade, Math.PI - .3, 0, undefined, Math.cos(a) * .6); }  // fur tufts
    if (A) { for (const s of [-1, 1]) { P(s * 11, ty + 25, 3, M.octa, 2.4, 6, 2.4, ice, 0, .35, undefined, s * -.5); P(s * 8, ty + 27, -1, M.octa, 1.8, 5, 1.8, ice, -.3, .35, undefined, s * -.2); } for (let i = 0; i < 6; i++) P((i - 2.5) * 3.6, ty + 27 - Math.abs(i - 2.5) * .6, -4, M.cone, 2.4, 6, 2.4, [.55, .6, .68], -.9, 0, undefined, (i - 2.5) * -.25); }
    const sy = ty + 21, ax = 16, ra = -.15 - 1.6 * atk + sw * .5, la = -.1 - sw * .5;
    for (const [s, a] of [[-1, la], [1, ra]]) {
      const sp = [s * ax, sy, 3]; P(...sp, M.ball, 7, 6.6, 7, fur, 0, gl);
      const el = tip(sp, 14, a * .9); P(...sp, M.tlimb, 8.4, 14, 8.4, fur, a * .9, gl * .3); const hd = tip(el, 14, a + .1);
      P(...el, M.tlimb, 7, 14, 7, shade, a + .1); P(...hd, M.ball, 5, 4.6, 5.6, face);
      for (const c of [-1, 0, 1]) P(hd[0] + c * 2, hd[1] - 4, hd[2] + 2, M.cone, .8, 4.4, .8, claw, Math.PI * .88);
    }
    const hy = sy + 3, hz = 13 + atk * 2;
    P(0, hy, hz - 3, M.ball, 8, 8, 8, fur, 0, gl); P(0, hy - 1, hz + 3.4, M.ball, 5.6, 5.8, 3.4, face);            // head, face
    P(0, hy + 2.8, hz + 5.6, M.box, 9.6, 2.2, 2.6, shade, -.1); P(0, hy - .2, hz + 6.4, M.ball, 1.8, 1.4, 1.4, [.3, .36, .46]);
    P(0, hy - 3.4, hz + 6.2, M.box, 5, 1 + atk * 1.4, 1, [.12, .1, .14]); for (const s of [-1, 1]) P(s * 1.6, hy - 2.8, hz + 6.6, M.cone, .6, 2, .5, TOOTH, Math.PI);
    for (const s of [-1, 1]) {
      P(s * 2.4, hy + 1.2, hz + 6.2, M.ball, .9, .8, .6, A ? [.5, .9, 1] : EYE_DARK, 0, A ? 1 : 0);
      const hb = [s * 6, hy + 4, hz - 3];
      if (A) { P(...hb, M.tlimb, 2.6, 7, 2.6, horn, -2.4, 0, undefined, s * -.5); const h2 = tip(hb, 7, -2.4); P(h2[0] + s * 2, h2[1], h2[2], M.tlimb, 2, 6, 2, horn, -1.3, 0, undefined, s * -.9); P(h2[0] + s * 4, h2[1] - 4, h2[2] + 3, M.cone, 1, 4, 1, horn, .6, 0, undefined, s * -.3); }
      else P(...hb, M.cone, 2.2, 9, 2.2, horn, .5, 0, undefined, s * -.75);                                       // horns curling forward
    }
  }

  // ---------------- Ice Golem ----------------
  // A construct of glacier ice, angular where the magma golem is round: a faceted crystal chest around a glowing blue
  // core, a block head with a glowing visor slit, arms of stacked ice blocks ending in crystal fists, pillar legs and
  // icicles on the back and shoulders. Alpha: a crown of tall crystals, rime plates and a deep blue core.
  function iceGolemModel(e, o) {
    const now = performance.now(), P = part(e.rx, e.ry, e.yaw, o.sc), sw = Math.sin(e.ph) * .45 * e.mv, gl = flashOf(e, now), A = !!o.alpha, atk = attackOf(e, now, 380);
    const ice = o.body, pale = mix(ice, [1, 1, 1], .45), deep = mix(ice, [.1, .2, .45], .45), glow = o.lava || [.6, .92, 1], pu = .7 + Math.sin(now / 420 + (e.id || 0)) * .2;
    for (const s of [-1, 1]) { P(s * 8, 15, s * sw * 7, M.box, 8.6, 15, 9, deep, s * sw * .3, 0, undefined, s * .06); P(s * 8.4, 3.6, s * sw * 9 + 2, M.box, 10, 6, 12, ice); }
    P(0, 26, 0, M.box, 15, 8, 11, deep, 0, gl); P(0, 38, 1, M.octa, 15, 13, 11, ice, .08, gl); P(0, 37, 1, M.box, 20, 12, 12, pale, .08, gl, undefined, .78);
    P(0, 37, 9, M.octa, A ? 5.4 : 4.2, A ? 6.4 : 5.2, 3.2, A ? [.25, .55, 1] : glow, 0, pu + .2);                                          // core
    for (const s of [-1, 1]) {
      const a = s > 0 ? -.25 - 1.5 * atk + sw : -.25 - sw, sp = [s * 18.5, 45, 1];
      P(...sp, M.box, 11, 9, 11, deep, 0, gl, undefined, s * .3); P(sp[0] + s * 3, sp[1] + 7, sp[2], M.octa, 2.4, 9, 2.4, pale, -.2, .3, undefined, s * -.4);
      const el = tip(sp, 12, a); P(...tip(sp, 6, a), M.box, 7, 11, 7, ice, a); const fist = tip(el, 13, a * .8); P(...tip(el, 6.5, a * .8), M.box, 7.6, 12, 7.6, pale, a * .8);
      for (let c = 0; c < 3; c++) P(fist[0] + (c - 1) * 3.4, fist[1] - 2, fist[2] + (c === 1 ? 3 : 0), M.octa, 3.4, 6, 3.4, c === 1 ? glow : ice, Math.PI + (c - 1) * .3, c === 1 ? .5 : .15);
    }
    P(0, 51, 6, M.box, 9, 8, 8, ice, -.1, gl, undefined, .2); P(0, 51.6, 10.2, M.box, 7, 1.2, 1, glow, -.1, 1);                             // head, visor
    for (let i = 0; i < 5; i++) P((i - 2) * 4.4, 50 - Math.abs(i - 2) * 3, -8, M.octa, 2.2, 8 - Math.abs(i - 2), 2.2, pale, -.6, .25, undefined, (i - 2) * -.3); // back icicles
    if (A) {
      for (let i = 0; i < 5; i++) { const a = (i - 2) * .5; P(Math.sin(a) * 4.6, 58 + (i === 2 ? 3 : 0), 6 - Math.abs(i - 2) * 1.6, M.octa, 1.6, 7 + (i === 2 ? 4 : 0), 1.6, glow, -.15, .6, undefined, -a * .6); }
      for (const s of [-1, 1]) P(s * 9, 40, 8.6, M.box, 8, 10, 2, [.86, .94, 1], .1, .1, undefined, s * .3);
    }
  }

  // ---------------- Shade ----------------
  // A shadow given shape rather than a robed ghost: a hunched spine of dark smoke, a long head with crescent eyes and a
  // glowing slit of a mouth, long thin arms with scythe fingers, no legs: the body thins into a curling wisp; void motes
  // orbit it. Alpha: a curved horn crown, a second pair of arms and a burning heart.
  function shadeModel(e, o) {
    const now = performance.now(), fl = Math.sin(now / 380 + (e.id || 0)) * 3, P = part(e.rx, e.ry, e.yaw, o.sc), gl = flashOf(e, now), atk = attackOf(e, now, 340), A = !!o.alpha;
    const c = o.body, dk = mix(c, [0, 0, 0], .5), ey = o.eye || [.85, .3, 1], mote = mix(ey, [1, 1, 1], .3), lean = .3 + atk * .25 + e.mv * .2;
    for (let i = 0; i < 6; i++) { const t = i / 5, sway = Math.sin(now / 300 + i) * 2.6 * t; P(sway, 27 - i * 4.4 + fl, -3 - i * 3.2, M.cone, 7.4 - i * 1.15, 10, 6.2 - i * 1, i % 2 ? c : dk, Math.PI + .45 + t * .4 + e.mv * .35, .15, .8); } // trailing wisp
    P(0, 31 + fl, 0, M.ball, 8.6, 11, 7.2, c, lean, gl + .1, .85); P(0, 43 + fl, 3.4, M.ball, 10.4, 9, 8.4, dk, lean, gl + .1, .88);       // hunched body of smoke
    for (let i = 0; i < 4; i++) P(0, 49 + fl - i * 3.6, -3.6 - i * .6, M.cone, 1.4, 4.4, 1.4, dk, -.8, .2);                                 // spine ridges
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) P(s * (8 + k * 1.6), 48 + fl - k * 1.4, 2 - k * 2.6, M.cone, 1.8, 7 - k, 1.6, k % 2 ? c : dk, -.5, .15, .85, s * -(.7 + k * .2)); // jagged shoulders
    const hy = 55 + fl, hz = 10 + atk * 3; P(0, hy, hz, M.ball, 5.6, 7.8, 7, dk, .35, gl); P(0, hy + 5.6, hz - 4.4, M.cone, 4, 9, 4, dk, -1.25);   // long head
    for (const s of [-1, 1]) P(s * 2.4, hy + 1.2, hz + 6, M.box, 3, .8, .5, ey, 0, 1, undefined, s * -.38);                                    // crescent eyes
    P(0, hy - 3.2, hz + 5.8, M.box, 4, .6 + atk * 1.4, .5, ey, 0, .9);                                                                         // mouth slit
    const arms = A ? [[1, 0], [-1, 0], [1, 1], [-1, 1]] : [[1, 0], [-1, 0]];
    for (const [s, lower] of arms) {
      const a = -1.2 - atk * (lower ? .6 : 1.2) + Math.sin(now / 460 + s + lower) * .2, sp = [s * 10.6, 46 + fl - lower * 7, 4 - lower * 2];
      P(...sp, M.tlimb, 2.8, 15, 2.8, dk, a, gl, .88); const el = tip(sp, 15, a); P(...el, M.tlimb, 1.8, 14, 1.8, c, a - .4, gl, .9); const hd = tip(el, 14, a - .4);
      for (let j = -1; j <= 1; j++) P(hd[0] + j * 1.2, hd[1], hd[2], M.cone, .5, 10 + atk * 2, .5, ey, a - .4 - Math.PI + j * .18, .7);        // scythe fingers
    }
    for (let i = 0; i < (A ? 5 : 3); i++) { const a = now / 700 + i * TAU / (A ? 5 : 3) + (e.id || 0); P(Math.cos(a) * 17, 40 + fl + Math.sin(a * 1.7) * 6, Math.sin(a) * 17, M.octa, 1.1, 1.8, 1.1, mote, a, 1); }
    if (A) { P(0, 43 + fl, 11, M.ball, 2.8, 2.8, 1.6, ey, 0, 1); for (const s of [-1, 1]) { P(s * 3.2, hy + 6, hz - 1, M.cone, 1.3, 9, 1.3, dk, -.6, .2, undefined, s * -.8); P(s * 7.2, hy + 11.4, hz - 3, M.cone, .8, 4.4, .8, ey, .4, .8, undefined, s * .4); } }
  }

  // ---------------- Void Weaver ----------------
  // An alien weaver, not a cave spider: a tall, raised abdomen lit by glowing void runes and spined with crystals, a
  // narrow body on long two-segment legs with needle tips, rows of glowing eyes, long mandibles, and a void orb it
  // weaves between its front legs. Alpha: a crystal crown on the abdomen, a larger orb with a rune ring, spiked legs.
  function voidWeaverModel(e, o) {
    const now = performance.now(), x = e.rx, z = e.ry, sc = o.sc || 1, P = part(x, z, e.yaw, sc), gl = flashOf(e, now), atk = attackOf(e, now, 300), A = !!o.alpha;
    const Bc = o.body, dk = mix(Bc, [0, 0, 0], .45), rune = o.glow || [.85, .35, 1], cry = mix(rune, [1, 1, 1], .35), y0 = 17 + Math.abs(Math.sin(e.ph * 1.6)) * .8 * e.mv, pulse = .7 + Math.sin(now / 260 + (e.id || 0)) * .3;
    P(0, y0 + 10, -9, M.ball, 8, 12, 9, dk, -.65, gl);                                                                         // raised abdomen
    for (let i = 0; i < 4; i++) P(0, y0 + 6 + i * 4.2, -15 + i * 2.6, M.box, 7 - Math.abs(i - 1.5) * 1.4, .7, 1.2, rune, -.65, pulse);   // runes
    for (let i = 0; i < 4; i++) P((i % 2 ? 1 : -1) * 4, y0 + 15 + i * 2, -12 + i * 2.4, M.octa, 1.2, 4, 1.2, cry, -.9, .5, undefined, (i % 2 ? -1 : 1) * .5);
    P(0, y0, 3, M.ball, 4.6, 4, 9, Bc, 0, gl); P(0, y0 + 1, 11 + atk * 3, M.ball, 3.8, 3.6, 4.4, dk, 0, gl);
    for (let r = 0; r < 2; r++) for (let k = -1; k <= 1; k++) P(k * 1.6, y0 + 2.6 + r * 1.4, 14.6 + atk * 3 - r * .6, M.ball, .6, .6, .5, rune, 0, 1);
    for (const s of [-1, 1]) { const mb = [s * 1.6, y0 - .6, 14 + atk * 3]; P(...mb, M.tlimb, 1.2, 6, 1.2, dk, -1.2 - atk * .5, 0, undefined, s * .3); P(...tip(mb, 6, -1.2 - atk * .5), M.cone, .5, 3, .5, cry, .3 + atk, .4); }
    const orbY = y0 + 2 + Math.sin(now / 300) * 1.4, orbR = (A ? 3.4 : 2.4) + atk * 1.5; P(0, orbY, 22, M.ball, orbR, orbR, orbR, rune, 0, 1);
    if (A) P(0, orbY, 22, M.ring, 6, 1, 6, cry, now / 400, 1, undefined, HALF);
    for (let i = 0; i < 8; i++) {
      const s = i % 2 ? 1 : -1, k = i >> 1, ang = e.yaw + s * (.5 + k * .58), g = Math.sin(e.ph * 1.6 + i * 1.57 + (k % 2) * Math.PI) * .3 * e.mv, hx = Math.sin(ang), hz = Math.cos(ang);
      const hip = [x + hx * 3 * sc, y0 * sc, z + hz * 3 * sc], seg = (p, len, pitch) => [p[0] + hx * -len * Math.sin(pitch) * sc, p[1] - len * Math.cos(pitch) * sc, p[2] + hz * -len * Math.sin(pitch) * sc];
      const a1 = -2.5 + g * .6, a2 = -.32 + g; D(M.tlimb, ...hip, 1.8 * sc, 16 * sc, 1.8 * sc, ang, a1, dk); const kn = seg(hip, 16, a1);
      D(M.ball, ...kn, 1.3 * sc, 1.3 * sc, 1.3 * sc, 0, 0, rune, .8); D(M.tlimb, ...kn, 1.3 * sc, 22 * sc, 1.3 * sc, ang, a2, Bc);
      if (A) D(M.cone, ...kn, .7 * sc, 4 * sc, .7 * sc, ang, -.5, cry, .5);
    }
    if (A) for (let i = 0; i < 5; i++) { const a = (i - 2) * .5; P(Math.sin(a) * 4, y0 + 22, -8 + Math.cos(a) * 1.4, M.octa, 1.4, 6 + (i === 2 ? 3 : 0), 1.4, rune, -.4, .7, undefined, -a); }
  }

  // ---------------- Void Knight ----------------
  // Corrupted plate armour on a tall frame: greaves and sabatons, a ridged breastplate with glowing seams, layered spiked
  // pauldrons, gauntlets, a horned great-helm with a glowing T-visor and a tattered cape; its existing void blade.
  // Alpha: a crown of horns, burning runes on the breastplate, void flames on the pauldrons, a glowing cape hem.
  function voidKnightModel(e, o) {
    const now = performance.now(), P = part(e.rx, e.ry, e.yaw, o.sc), gl = flashOf(e, now), atk = attackOf(e, now, 340), mv = e.mv, A = !!o.alpha;
    const plate = [.2, .16, .28], edge = [.36, .3, .46], dark = [.1, .08, .14], glow = [.8, .3, 1], cloth = [.26, .1, .38];
    const sw = Math.sin(e.ph) * .7 * mv, bob = Math.abs(Math.sin(e.ph)) * 1.6 * mv + idleOf(e, now, 520) * .5;
    for (const s of [-1, 1]) {
      const a = s * sw, hip = [s * 4.8, 28 + bob, 0], kn = tip(hip, 12, a); P(...hip, M.tlimb, 7.4, 12, 7.4, dark, a, gl * .3);
      P(...kn, M.ball, 3.4, 3, 3.6, edge); const ft = tip(kn, 12, a * .5); P(...kn, M.tlimb, 6.8, 12, 6.8, plate, a * .5);
      P(ft[0], ft[1] + 1.6, ft[2] + 2.4, M.box, 6.4, 3.2, 11, plate, a * .3); P(ft[0], ft[1] + 2.2, ft[2] + 7.6, M.cone, 2.2, 3, 1.2, edge, HALF);
    }
    const ty = 26 + bob;
    P(0, ty, 0, M.torso, 10, 23, 7, plate, 0, gl); P(0, ty + 13, 5, M.box, 13, 13, 3, edge, -.06);                         // breastplate
    P(0, ty + 13, 6.6, M.box, 1.2, 12, 1, glow, -.06, .9); for (const s of [-1, 1]) P(s * 4.4, ty + 9, 6.4, M.box, .8, 7, .8, glow, -.06, .8, undefined, s * .4);
    P(0, ty + 1, 0, M.cyl, 9.6, 3, 7, dark); for (const s of [-1, 1]) P(s * 4.6, ty - 3, 3, M.box, 4.6, 8, 1.4, plate, -.1, 0, undefined, s * .12); // tassets
    if (A) for (let i = 0; i < 3; i++) P((i - 1) * 3.6, ty + 18, 6.6, M.octa, .9, 1.6, .5, glow, 0, 1);
    const cape = .25 + mv * .35 + Math.sin(now / 300 + (e.id || 0)) * .05; P(0, ty + 21, -6, M.limb, 17, 32, 1.4, cloth, cape);
    for (let i = 0; i < 4; i++) P((i - 1.5) * 4, ty + 21 - 32 * Math.cos(cape), -6 - 32 * Math.sin(cape), M.cone, 2, 4, .6, A ? glow : cloth, cape + Math.PI, A ? .7 : 0);
    const sy = ty + 21, ax = 12.6, ra = -.12 - 1.55 * atk + sw * .6, la = -sw * .6;
    for (const [s, a] of [[-1, la], [1, ra]]) {
      const sp = [s * ax, sy, 0]; P(...sp, M.ball, 6.6, 5.4, 6.4, plate, 0, gl); P(sp[0] + s * .6, sp[1] + 2.4, sp[2], M.ball, 5.4, 3.4, 5.6, edge);
      for (const k of [-1, 1]) P(sp[0] + s * 2, sp[1] + 5, sp[2] + k * 2.6, M.cone, 1.1, 6, 1.1, edge, k * .3, 0, undefined, s * -.4);   // pauldron spikes
      if (A) P(sp[0], sp[1] + 6, sp[2], M.cone, 2.4, 7 + Math.sin(now / 90 + s) * 1.6, 2.4, glow, 0, 1);
      const el = tip(sp, 11, a); P(...sp, M.tlimb, 5.6, 11, 5.6, dark, a, gl * .3); const hd = tip(el, 10, a + .1); P(...el, M.tlimb, 5.2, 10, 5.2, plate, a + .1);
      P(...hd, M.ball, 3.4, 3.2, 3.6, edge);
      if (s > 0) sword(P, hd, a - 1.75 + atk * 2.2, 34, [.75, .4, 1], .9, 3.6);
    }
    const hy = ty + 30;
    P(0, ty + 23, 0, M.cyl, 4, 3.4, 4, dark); P(0, hy, 0, M.ball, 7.4, 8.4, 7.6, plate, 0, gl); P(0, hy - 3, 2, M.box, 11, 6, 10, plate);   // great-helm
    P(0, hy + .6, 7.4, M.box, 7, 1.2, 1, glow, 0, 1); P(0, hy - 2.4, 7.4, M.box, 1.4, 5, 1, glow, 0, 1);                                   // T-visor
    P(0, hy + 8, -1, M.box, 1.4, 5, 10, edge);                                                                                             // crest
    for (const s of [-1, 1]) {
      const hb = [s * 6.6, hy + 3, -1]; P(...hb, M.cone, 1.6, 10, 1.6, dark, -.7, 0, undefined, s * -.9); P(hb[0] + s * 7, hb[1] + 4.4, hb[2] - 5, M.cone, .9, 5, .9, dark, -1.4, 0, undefined, s * -.4);
      if (A) P(s * 3, hy + 7, 2, M.cone, 1.1, 8, 1.1, edge, -.2, .2, undefined, s * -.35);
    }
  }

  // ---------------- registration: only the Day 1 enemies ----------------
  const DAY1 = { wolf: wolfModel, boar: boarModel, slime: slimeModel, shroom: shroomModel, goblin: goblinModel, orc: orcModel, spider: spiderModel, ogre: ogreModel, wraith: wraithModel };
  const LATER = { hellhound: hellhoundModel, drake: drakeModel, golem: magmaGolemModel, frostfang: frostfangModel, yeti: yetiModel, icegolem: iceGolemModel, shade: shadeModel, voidweaver: voidWeaverModel, voidknight: voidKnightModel };
  // Alpha variants: the draw loop in game.js uses MODEL[type]._a when a monster is an Alpha (1.3x size); giving each
  // model its own _a with alpha: true lets every builder add its own Alpha features on top of the base design.
  const withAlpha = def => Object.assign(def, { _a: { ...def, sc: (def.sc || 1) * 1.3, alpha: true } });
  for (const [type, fn] of Object.entries({ ...DAY1, ...LATER })) if (MODEL[type]) MODEL[type] = withAlpha({ ...MODEL[type], fn, ...(type === 'wolf' ? { belly: [.8, .8, .78] } : {}) });
  window.EnemyModels = { DAY1, LATER, withAlpha, wolfModel, boarModel, slimeModel, shroomModel, goblinModel, orcModel, spiderModel, ogreModel, wraithModel, ...LATER };
  if (window.Shardlands) Shardlands.EnemyModels = window.EnemyModels;
})();
