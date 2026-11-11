'use strict';
// Draws the settlement at the centre of the map from the shared layout (settlement.js) into the baked world mesh.
// The layout decides architecture and placement; the style (timber, snow, sandstone, dark, ember, void) decides materials.
// Everything here is baked once per map into a few merged buffers, so a big village costs no extra draw calls.

const SETTLEMENT_STYLE = {
  timber: { wall: [.88, .8, .64], base: [.55, .55, .57], trim: [.38, .25, .14], roofs: [[.68, .22, .16], [.24, .38, .58], [.5, .36, .16]], fence: 'palisade', stone: [.62, .6, .58], pave: [.7, .64, .52], ground: '#648a44', leaf: [.22, .5, .2], tree: 'broad' },
  snow: { wall: [.84, .8, .74], base: [.5, .52, .56], trim: [.32, .22, .14], roofs: [[.46, .2, .16], [.22, .3, .45], [.36, .28, .2]], snow: [.95, .97, 1], fence: 'palisade', stone: [.66, .68, .72], pave: [.78, .8, .84], ground: '#d7dfe6', leaf: [.13, .3, .3], tree: 'pine', ice: [.62, .88, 1] },
  sandstone: { wall: [.95, .76, .48], base: [.82, .64, .4], trim: [.5, .34, .2], flat: true, roofs: [[.9, .72, .46], [.86, .66, .42], [.94, .78, .52]], fence: 'stone', stone: [.9, .72, .46], pave: [.92, .8, .6], ground: '#b89d72', leaf: [.35, .55, .2], tree: 'palm', awning: [[.85, .25, .2], [.2, .5, .7], [.9, .7, .2]] },
  dark: { wall: [.36, .34, .38], base: [.22, .21, .24], trim: [.18, .16, .18], roofs: [[.2, .22, .28], [.26, .2, .28], [.18, .21, .23]], fence: 'stone', stone: [.3, .29, .32], pave: [.34, .32, .35], ground: '#3a3438', leaf: [.15, .12, .14], tree: 'dead', glow: [.5, .9, .6] },
  ember: { wall: [.3, .24, .22], base: [.17, .13, .12], trim: [.24, .15, .1], roofs: [[.38, .12, .08], [.2, .14, .12], [.45, .2, .1]], fence: 'stone', stone: [.24, .2, .19], pave: [.28, .22, .2], ground: '#3b2a22', leaf: [.12, .08, .08], tree: 'charred', glow: [1, .45, .1], cloth: [[.55, .16, .1], [.45, .3, .2], [.6, .4, .18]] },
  void: { wall: [.26, .22, .34], base: [.14, .11, .2], trim: [.2, .15, .26], roofs: [[.32, .2, .48], [.18, .14, .3], [.42, .28, .58]], fence: 'stone', stone: [.21, .18, .3], pave: [.24, .2, .32], ground: '#2a2138', leaf: [.3, .2, .45], tree: 'crystal', glow: [.75, .45, 1], cloth: [[.3, .2, .45], [.22, .16, .3], [.42, .3, .58]] },
};
SETTLEMENT_STYLE.timber.cloth = [[.62, .3, .18], [.4, .45, .3], [.7, .55, .3]];
SETTLEMENT_STYLE.snow.cloth = [[.5, .3, .25], [.3, .35, .45], [.6, .55, .5]];
SETTLEMENT_STYLE.sandstone.cloth = [[.85, .6, .3], [.6, .35, .2], [.9, .8, .55]];
SETTLEMENT_STYLE.dark.cloth = [[.3, .25, .3], [.2, .2, .25], [.4, .3, .35]];
const VENDOR_COLOR = { merchant: [.85, .7, .2], smith: [.42, .42, .46], mystic: [.5, .3, .8] };

// The layout of this map, made on demand (the login screen bakes the world before setWorld runs).
function settlementLayout() {
  if (!WORLD.layout) { const s = WORLD.settlement || { kind: 'village', style: 'timber', built: {} }; WORLD.layout = Settlement.layout(s.kind, s.style, s.built, s.layout); }
  return WORLD.layout;
}
// Materials: the style's, darkened and made more solemn for the Ancient Citadel.
function settlementPalette(lay) {
  const st = { ...(SETTLEMENT_STYLE[lay.style] || SETTLEMENT_STYLE.timber) };
  const fence = lay.wall && lay.wall.fence;
  if (fence) st.fence = fence === 'stone' && st.fence === 'palisade' && st.stone ? 'stone' : fence;
  if (lay.layout === 'citadel') for (const k of ['wall', 'base', 'stone', 'pave']) st[k] = mix(st[k], [.12, .11, .14], .35);
  if (lay.layout === 'haven') { st.wall = mix(st.trim, st.wall, .45); st.fence = 'hedge'; }
  return st;
}
// Props the kit does not replace (flat ground work).
const KIT_LEAVES = new Set(['stairs', 'arch', 'pond']);
function useVillageKit(lay) {
  if (typeof VillageKit === 'undefined' || typeof GL === 'undefined' || !GL.meshFromArray) return false;
  let preview = false; try { preview = /[?&]villagekit=1/.test(location.search) || localStorage.getItem('sl_villagekit') === '1'; } catch (e) {}
  return Settlement.KIT_STYLES.includes(lay.style) || preview;
}
// A point on a cart in world coordinates (lx along its width, lz towards its front / the portal).
function cartPoint(key, lx, lz) {
  const lay = settlementLayout(), cart = lay.carts.find(c => c.key === key) || (lay.stalls || []).find(s => s.key === key);
  if (!cart) return null;
  const c = Math.cos(cart.yaw), s = Math.sin(cart.yaw), x = WORLD.CX + cart.x, z = WORLD.CY + cart.y;
  return { x: x + c * lx + s * lz, z: z - s * lx + c * lz };
}

function bakeSettlement(B, R) {
  const { CX, CY } = WORLD, lay = settlementLayout(), st = settlementPalette(lay), wood = st.trim || [.38, .25, .14];
  const P = (x, y) => [CX + x, CY + y], turn = (x, z, yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz]; };
  const dark = (c, k) => mix(c, [0, 0, 0], k), lift = (c, k) => mix(c, [1, 1, 1], k);
  const glow = st.glow;

  // ---------- pieces ----------
  function lamp(x, z) { lamps.push({ x, z }); B(M.trunk, x, 0, z, 2, 30, 2, 0, 0, [.2, .2, .22]); B(M.box, x, 32, z, 6, 1, 6, 0, 0, [.2, .2, .22]); B(M.cone6, x, 38, z, 5, 4, 5, 0, 0, [.2, .2, .22]); }
  function tree(x, z, s, kind) {
    kind = kind || st.tree; const r = (x * 7 + z * 13) % 6.28;
    if (kind === 'pine') { B(M.trunk, x, 0, z, 3 * s, 12 * s, 3 * s, r, 0, [.3, .24, .2]); for (let j = 0; j < 3; j++) { const rr = (15 - j * 4) * s, yy = (7 + j * 10) * s; B(M.cone6, x, yy, z, rr, 16 * s, rr, r + j, 0, st.leaf); if (st.snow) B(M.cone6, x, yy + 8 * s, z, rr * .55, 8 * s, rr * .55, r + j, 0, st.snow); } }
    else if (kind === 'palm') { B(M.trunk, x, 0, z, 2.6 * s, 34 * s, 2.6 * s, r, .12, [.5, .38, .24]); for (let j = 0; j < 6; j++) B(M.box, x + Math.cos(j) * 9 * s, 33 * s, z + Math.sin(j) * 9 * s, 20 * s, 1.2, 5 * s, -j, .35, st.leaf); }
    else if (kind === 'dead' || kind === 'charred') { const c = kind === 'dead' ? [.24, .2, .2] : [.12, .09, .08]; B(M.trunk, x, 0, z, 2.8 * s, 32 * s, 2.8 * s, r, .1, c); B(M.trunk, x, 16 * s, z, 1.5 * s, 16 * s, 1.5 * s, r, .95, c); B(M.trunk, x, 22 * s, z, 1.2 * s, 12 * s, 1.2 * s, r + 2.4, -.9, c); if (glow && kind === 'charred') B(M.octa, x, 4, z + 3, 2, 4, 2, r, 0, glow, 1); }
    else if (kind === 'crystal') { B(M.trunk, x, 0, z, 2.6 * s, 26 * s, 2.6 * s, r, 0, [.14, .1, .18]); B(M.octa, x, 30 * s, z, 7 * s, 12 * s, 7 * s, r, 0, glow || [.7, .45, 1], .6); B(M.octa, x + 6 * s, 22 * s, z, 4 * s, 7 * s, 4 * s, r + 1, .4, glow || [.7, .45, 1], .8); }
    else { B(M.trunk, x, 0, z, 3.4 * s, 24 * s, 3.4 * s, r, 0, [.38, .27, .15]); B(M.rock, x, 31 * s, z, 15 * s, 12 * s, 15 * s, r, 0, st.leaf); B(M.rock, x + 8 * s, 27 * s, z + 3 * s, 9 * s, 8 * s, 9 * s, r + 1, 0, lift(st.leaf, .08)); B(M.rock, x - 7 * s, 28 * s, z - 4 * s, 10 * s, 8 * s, 10 * s, r + 2, 0, dark(st.leaf, .1)); }
  }
  // Windows, door and corner posts of a rectangular building.
  function facade(at, yaw, hw, hd, y0, h, door = true) {
    for (const [lx, lz] of [[-hw / 2, hd / 2], [hw / 2, hd / 2], [-hw / 2, -hd / 2], [hw / 2, -hd / 2]]) { const q = at(lx, lz); B(M.box, q[0], y0 + h / 2, q[1], 2.6, h, 2.6, yaw, 0, wood); }
    if (door) { let q = at(0, hd / 2 + .6); B(M.box, q[0], y0 + 9, q[1], 10, 18, 1.4, yaw, 0, [.3, .19, .1]); q = at(3.4, hd / 2 + 1.4); B(M.octa, q[0], y0 + 9, q[1], .9, .9, .9, 0, 0, [.9, .75, .3]); }
    for (const lx of [-hw / 3.2, hw / 3.2]) { const q = at(lx, hd / 2 + .6); B(M.box, q[0], y0 + h * .62, q[1], 7, 7, 1.2, yaw, 0, [1, .85, .45], .8); }
  }
  function roofOn(x, z, at, yaw, hw, hd, y, roof, tall) {
    if (st.flat) {
      B(M.box, x, y + 1, z, hw + 2, 2.4, hd + 2, yaw, 0, roof);
      for (const [lx, lz, w2, d2] of [[0, hd / 2, hw + 2, 3], [0, -hd / 2, hw + 2, 3], [hw / 2, 0, 3, hd + 2], [-hw / 2, 0, 3, hd + 2]]) { const q = at(lx, lz); B(M.box, q[0], y + 4, q[1], w2, 4, d2, yaw, 0, st.base); }
      for (let k = -2; k <= 2; k++) { const q = at(k * hw / 5.5, hd / 2 + 2); B(M.cyl, q[0], y - 4, q[1], 1.3, 1.3, 4, yaw, 1.5708, wood); }
    } else {
      const rh = tall ? 34 : 22; B(M.box, x, y, z, hw + 2, 2.4, hd + 2, yaw, 0, wood); B(M.gable, x, y, z, hw + 8, rh, hd + 6, yaw, 0, roof);
      if (st.snow) { B(M.gable, x, y + rh * .3, z, hw + 9, rh * .7, hd + 7, yaw, 0, st.snow); for (let k = -2; k <= 2; k++) { const q = at(k * hw / 5, hd / 2 + 3.4); B(M.cone, q[0], y - 1.5, q[1], .9, 3.5, .9, 0, Math.PI, [.85, .93, 1], .4); } }
    }
  }
  // Buildings. h.type picks the architecture; the style picks the materials.
  function building(h, i) {
    const [x, z] = P(h.x, h.y), yaw = h.yaw, at = turn(x, z, yaw), hw = h.w, hd = h.d, roof = st.roofs[i % st.roofs.length];
    const stoneish = ['hall', 'palace', 'barracks', 'keep', 'gothic', 'cathedral', 'tower-house'].includes(h.type), wallC = stoneish ? mix(st.wall, st.stone, .55) : st.wall;
    if (h.type === 'hut') {
      const r = Math.min(hw, hd) / 2; B(M.cyl, x, 0, z, r, 20, r, i, 0, mix(st.wall, wood, .6)); B(M.cone6, x, 18, z, r + 6, 22, r + 6, i, 0, st.snow ? st.snow : mix(roof, [.55, .45, .25], .5));
      const q = at(0, r - .5); B(M.box, q[0], 8, q[1], 8, 16, 2, yaw, 0, [.3, .19, .1]); B(M.box, ...at(-r - 3, 0).slice(0, 1), 3, at(-r - 3, 0)[1], 6, 6, 10, yaw, 0, [.45, .32, .18]); return;
    }
    if (h.type === 'tower-house' || h.type === 'keep') {
      const tall = h.type === 'keep' ? 64 : 46;
      B(M.box, x, 3, z, hw + 4, 6, hd + 4, yaw, 0, st.base); B(M.box, x, tall / 2 + 4, z, hw, tall, hd, yaw, 0, wallC); facade(at, yaw, hw, hd, 4, tall * .45);
      if (h.type === 'keep') { for (let k = 0; k < 4; k++) for (let j = -2; j <= 2; j++) { const side = [[j * hw / 5, hd / 2], [j * hw / 5, -hd / 2], [hw / 2, j * hd / 5], [-hw / 2, j * hd / 5]][k], q = at(side[0], side[1]); B(M.box, q[0], tall + 7, q[1], 6, 6, 6, yaw, 0, st.stone); } B(M.trunk, x, tall + 4, z, 1.2, 26, 1.2, 0, 0, wood); B(M.box, x + 6, tall + 24, z, 12, 7, .6, yaw, 0, [.75, .15, .15]); }
      else { B(M.roof, x, tall + 4, z, hw * .78, 22, hd * .78, yaw + Math.PI / 4, 0, roof); if (st.snow) B(M.roof, x, tall + 10, z, hw * .55, 16, hd * .55, yaw + Math.PI / 4, 0, st.snow); }
      return;
    }
    const storeys = ['hall', 'palace', 'barracks', 'warehouse', 'gothic', 'cathedral'].includes(h.type) ? 36 : h.type === 'cottage' ? 18 : 24;
    B(M.box, x, 3, z, hw + 4, 6, hd + 4, yaw, 0, st.base); B(M.box, x, storeys / 2 + 5, z, hw, storeys, hd, yaw, 0, wallC);
    facade(at, yaw, hw, hd, 5, storeys);
    if (storeys >= 36) { for (const lx of [-hw / 3.2, 0, hw / 3.2]) { const q = at(lx, hd / 2 + .6); B(M.box, q[0], 5 + storeys * .82, q[1], 6, 6, 1.2, yaw, 0, [1, .85, .45], .8); } }
    if (h.type === 'gothic' || h.type === 'cathedral') {
      B(M.gable, x, storeys + 5, z, hw + 4, 40, hd + 4, yaw, 0, dark(roof, .2));
      for (const [lx, lz] of h.type === 'cathedral' ? [[-hw / 2 + 8, hd / 2 - 8], [hw / 2 - 8, hd / 2 - 8]] : [[0, -hd / 4]]) { const q = at(lx, lz); B(M.box, q[0], storeys + 20, q[1], 14, 40, 14, yaw, 0, wallC); B(M.roof, q[0], storeys + 40, q[1], 11, 46, 11, yaw + Math.PI / 4, 0, dark(roof, .3)); B(M.octa, q[0], storeys + 88, q[1], 1.6, 3, 1.6, 0, 0, glow || [.9, .8, .4], .8); }
      for (let k = -2; k <= 2; k++) for (const sd of [-1, 1]) { const q = at(sd * (hw / 2 + 3), k * hd / 5); B(M.box, q[0], storeys * .45, q[1], 4, storeys * .9, 6, yaw, sd * .15, st.base); }
      if (h.type === 'cathedral') { const q = at(0, hd / 2 + .8); B(M.disc, q[0], storeys * .78, q[1], 9, 1, 9, yaw, 1.5708, glow || [.95, .55, .3], .9); }
      return;
    }
    if (h.type === 'palace') {
      roofOn(x, z, at, yaw, hw, hd, storeys + 5, roof, true);
      for (const [lx, lz] of [[-hw / 2, -hd / 2], [hw / 2, -hd / 2], [-hw / 2, hd / 2], [hw / 2, hd / 2]]) { const q = at(lx, lz); B(M.cyl, q[0], 0, q[1], 9, storeys + 22, 9, 0, 0, wallC); B(M.cone, q[0], storeys + 22, q[1], 11, 22, 11, 0, 0, roof); B(M.trunk, q[0], storeys + 40, q[1], .8, 14, .8, 0, 0, wood); B(M.box, q[0] + 4, storeys + 50, q[1], 8, 5, .4, 0, 0, [.85, .68, .2]); }
      const q = at(0, hd / 2 + 6); B(M.box, q[0], 2, q[1], 30, 4, 12, yaw, 0, st.stone); return;
    }
    if (h.type === 'barracks') { B(M.box, x, storeys + 6, z, hw + 2, 3, hd + 2, yaw, 0, st.stone); for (let k = -3; k <= 3; k++) { const q = at(k * hw / 7, hd / 2); B(M.box, q[0], storeys + 10, q[1], 5, 5, 3, yaw, 0, st.stone); } const q = at(hw / 2 + 2, 0); B(M.box, q[0], storeys * .6, q[1], .6, 18, 9, yaw, 0, [.7, .15, .15]); return; }
    roofOn(x, z, at, yaw, hw, hd, storeys + 5, roof, h.type === 'hall' || h.type === 'warehouse');
    if (h.type === 'smithy') { const q = at(hw / 4, -hd / 6); B(M.box, q[0], storeys + 22, q[1], 8, 18, 8, yaw, 0, st.base); const g = at(-hw / 4, hd / 2 + 1); B(M.box, g[0], 9, g[1], 12, 8, 1, yaw, 0, [1, .45, .1], .9); lamps.push({ x: g[0], z: g[1] }); }
    else if (!st.flat && h.type !== 'warehouse') { const q = at(hw / 4, -hd / 6); B(M.box, q[0], storeys + 22, q[1], 7, 14, 7, yaw, 0, st.base); }
    if (h.type === 'shop' || h.type === 'market') { const q = at(0, hd / 2 + 6), c = (st.awning || [[.85, .2, .16], [.95, .92, .85]])[i % 2]; B(M.box, q[0], 16, q[1], hw - 4, 1.2, 12, yaw, -.35, c); }
    if (h.type === 'warehouse') { const q = at(0, hd / 2 + .7); B(M.box, q[0], 13, q[1], 22, 24, 1.4, yaw, 0, dark(wood, .2)); for (const lx of [-hw / 2 - 6, hw / 2 + 6]) { const c2 = at(lx, 4); B(M.box, c2[0], 5, c2[1], 10, 10, 10, yaw + .3, 0, [.56, .4, .22]); } }
    if (st.snow && i % 2) { const q = at(-hw / 2 - 6, hd / 3); B(M.ball, q[0], 2, q[1], 7, 3.5, 6, 0, 0, st.snow); }
  }
  // Decorations and smaller pieces.
  function prop(p, i) {
    const [x, z] = P(p.x, p.y), yaw = p.yaw || 0, at = turn(x, z, yaw);
    switch (p.type) {
      case 'lamp': lamp(x, z); break;
      case 'tree': tree(x, z, 1 + (i % 3) * .12); break;
      case 'bigtree': tree(x, z, 1.7, st.tree === 'palm' ? 'palm' : st.tree === 'pine' ? 'pine' : st.tree === 'broad' ? 'broad' : st.tree); break;
      case 'rock': B(M.rock, x, 2, z, 9, 6, 8, i, 0, st.stone); break;
      case 'well': { B(M.cyl, x, 0, z, 16, 12, 16, 0, 0, st.base); B(M.disc, x, 10.4, z, 13, 1, 13, 0, 0, [.2, .45, .8], .3); for (const sgn of [-1, 1]) B(M.box, x + sgn * 14, 20, z, 2.4, 40, 2.4, 0, 0, wood); B(M.gable, x, 38, z, 38, 10, 26, 0, 0, st.roofs[0]); if (st.snow) B(M.gable, x, 41, z, 39, 7, 27, 0, 0, st.snow); B(M.box, x, 34, z, 28, 1.6, 1.6, 0, 0, wood); break; }
      case 'garden': { const w = p.w || 30, d = p.d || 18; B(M.box, x, 1.5, z, w, 3, d, yaw, 0, dark(st.base, .2)); B(M.box, x, 3.2, z, w - 3, 1, d - 3, yaw, 0, [.3, .22, .14]);
        for (let k = 0; k < 6; k++) { const q = at((k % 3 - 1) * w / 3.4, (k < 3 ? -1 : 1) * d / 4.5); if (st.snow) B(M.ball, q[0], 4, q[1], 4, 2.5, 4, 0, 0, st.snow); else B(M.ball, q[0], 6, q[1], 4, 4, 4, k, 0, k % 2 ? st.leaf : [[1, .4, .5], [1, .9, .3], [.7, .5, 1]][k % 3], k % 2 ? 0 : .2); } break; }
      case 'flowers': for (let k = 0; k < 4; k++) { const a = k * 1.7 + i, qx = x + Math.cos(a) * 4, qz = z + Math.sin(a) * 4; B(M.trunk, qx, 0, qz, .5, 4, .5, 0, 0, [.2, .5, .2]); B(M.octa, qx, 5, qz, 1.8, 1.5, 1.8, a, 0, st.snow ? st.ice : glow && !st.leaf ? glow : [[1, .4, .5], [1, .9, .3], [.7, .5, 1], [1, 1, 1]][(i + k) % 4], .3); } break;
      case 'statue': { B(M.box, x, 5, z, 14, 10, 14, yaw, 0, st.base); B(M.box, x, 11, z, 11, 2, 11, yaw, 0, st.stone); B(M.torso, x, 12, z, 5, 16, 4, yaw, 0, lift(st.stone, .15)); B(M.ball, x, 31, z, 3.6, 3.6, 3.6, 0, 0, lift(st.stone, .15)); B(M.box, x + 4, 28, z, 1.4, 22, 1.4, yaw, .2, lift(st.stone, .1)); break; }
      case 'obelisk': B(M.box, x, 3, z, 14, 6, 14, 0, 0, st.base); B(M.box, x, 26, z, 8, 40, 8, 0, 0, st.stone); B(M.roof, x, 46, z, 6, 9, 6, Math.PI / 4, 0, st.stone); if (glow) B(M.octa, x, 30, z, 2, 3, 2, 0, 0, glow, 1); break;
      case 'pillar': B(M.cyl, x, 0, z, 5, 46, 5, 0, 0, lift(st.stone, .1)); B(M.box, x, 47, z, 13, 3, 13, 0, 0, st.stone); B(M.box, x, 1.5, z, 12, 3, 12, 0, 0, st.base); break;
      case 'brazier': { B(M.cyl, x, 0, z, 3, 16, 3, 0, 0, [.2, .2, .22]); B(M.cyl, x, 16, z, 7, 4, 7, 0, 0, [.25, .22, .2]); const c = glow || [1, .55, .15]; B(M.cone, x, 19, z, 5, 10, 5, 0, 0, c, 1); lamps.push({ x, z }); break; }
      case 'banner': B(M.trunk, x, 0, z, 1.4, 40, 1.4, 0, 0, wood); B(M.box, x, 31, z, 1, 16, 9, Math.atan2(p.x, p.y), 0, i % 2 ? [.75, .15, .15] : [.85, .68, .2]); break;
      case 'rampart': { B(M.box, x, 9, z, p.w, 18, p.d, yaw, 0, mix(st.stone, [0, 0, 0], (i % 3) * .05)); for (let k = -1; k <= 1; k++) { const q = at(k * p.w / 3, 0); B(M.box, q[0], 20, q[1], 6, 5, p.d + .5, yaw, 0, st.stone); } break; }
      case 'crates': for (const [dx, dz, q] of [[-5, -3, 9], [5, 2, 8], [0, 0, 7]]) B(M.box, x + dx, q / 2 + (q === 7 ? 8 : 0), z + dz, q, q, q, dx * .1, 0, [.56, .4, .22]); break;
      case 'barrels': for (const [dx, dz] of [[-5, -3], [5, 2], [-2, 5]]) B(M.cyl, x + dx, 0, z + dz, 4, 10, 4, 0, 0, [.45, .3, .17]); break;
      case 'stall': { const c = (st.awning || [[.86, .2, .16], [.3, .55, .8], [.9, .75, .25], [.45, .7, .35]])[(p.tint || 0) % 3];
        B(M.box, x, 6, z, p.w, 12, p.d * .7, yaw, 0, [.5, .33, .18]); for (const [lx, lz] of [[-p.w / 2 + 1, -p.d / 2 + 1], [p.w / 2 - 1, -p.d / 2 + 1], [-p.w / 2 + 1, p.d / 2 - 1], [p.w / 2 - 1, p.d / 2 - 1]]) { const q = at(lx, lz); B(M.box, q[0], 13, q[1], 1.6, 26, 1.6, 0, 0, wood); }
        B(M.box, x, 26.5, z, p.w + 4, 1.2, p.d + 4, yaw, .18, c); if (st.snow) B(M.box, x, 27.6, z, p.w + 3, .8, p.d + 3, yaw, .18, st.snow);
        for (let k = -1; k <= 1; k++) { const q = at(k * p.w / 3.4, 0); B(M.ball, q[0], 13.5, q[1], 2.4, 2, 2.4, 0, 0, [[.9, .3, .25], [.95, .8, .3], [.5, .85, .4]][(k + 1 + i) % 3]); } break; }
      case 'fountain': { B(M.cyl, x, 0, z, 22, 6, 22, 0, 0, st.base); B(M.disc, x, 5.5, z, 19, 1, 19, 0, 0, st.ice || [.25, .55, .9], .35); B(M.cyl, x, 0, z, 4, 18, 4, 0, 0, st.stone); B(M.cyl, x, 18, z, 9, 2, 9, 0, 0, st.stone); B(M.cone, x, 20, z, 3, 8, 3, 0, 0, [.6, .85, 1], .5); break; }
      case 'pond': B(M.disc, x, .9, z, p.r, 1, p.r * .85, 0, 0, st.snow ? st.ice : [.22, .45, .7], .3); for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283; B(M.rock, x + Math.cos(a) * p.r, 1.5, z + Math.sin(a) * p.r * .85, 6, 3, 5, a, 0, st.stone); } break;
      case 'planter': B(M.box, x, 3, z, 20, 6, 20, 0, 0, st.base); B(M.ball, x, 11, z, 9, 7, 9, 0, 0, st.snow || st.leaf); break;
      case 'stairs': { for (let k = 0; k < 3; k++) { const q = at(0, -6 + k * 6); B(M.box, q[0], (3 - k) * 1.4, q[1], p.w, (3 - k) * 2.8, 6, yaw, 0, mix(st.pave, st.stone, k / 3)); } break; }
      case 'arch': { for (const sd of [-1, 1]) { const q = at(sd * p.w / 2, 0); B(M.box, q[0], 30, q[1], 14, 60, 14, yaw, 0, st.stone); B(M.box, q[0], 62, q[1], 18, 4, 18, yaw, 0, st.base); } B(M.box, x, 66, z, p.w + 18, 12, 14, yaw, 0, st.stone); B(M.box, x, 74, z, p.w * .5, 6, 12, yaw, 0, st.base); B(M.box, x, 52, z, 2, 16, 12, yaw, 0, [.8, .2, .2]); break; }
    }
  }
  // Vendor carts: Portal -> NPC -> cart. Wheels on the long sides, a canopy in the vendor's colour, their goods on top.
  function cart(c) {
    const [x, z] = P(c.x, c.y), yaw = c.yaw, at = turn(x, z, yaw), w = c.w, d = c.d, col = VENDOR_COLOR[c.key] || [.6, .5, .3];
    B(M.box, x, 9, z, w, 4, d, yaw, 0, [.45, .3, .17]); B(M.box, x, 13, z, w, 4, 1.6, yaw, 0, [.38, .25, .14]);
    for (const sd of [-1, 1]) { let q = at(sd * (w / 2 - .8), 0); B(M.box, q[0], 13, q[1], 1.6, 4, d, yaw, 0, [.38, .25, .14]); q = at(0, sd * (d / 2 - .8)); B(M.box, q[0], 13, q[1], w, 4, 1.6, yaw, 0, [.38, .25, .14]); }
    for (const lx of [-w / 3.2, w / 3.2]) for (const sd of [-1, 1]) { const q = at(lx, sd * (d / 2 + 1.5)); B(M.cyl, q[0], 7, q[1], 7, 2.4, 7, yaw, 1.5708, [.3, .2, .12]); B(M.cyl, q[0], 7, q[1], 2, 3, 2, yaw, 1.5708, [.2, .2, .22]); }
    { const q = at(-w / 2 - 10, 0); B(M.box, q[0], 7, q[1], 18, 1.6, 1.6, yaw, .25, [.38, .25, .14]); const q2 = at(-w / 2 - 10, -5); B(M.box, q2[0], 7, q2[1], 18, 1.6, 1.6, yaw, .25, [.38, .25, .14]); }
    for (const [lx, lz] of [[-w / 2 + 2, -d / 2 + 2], [w / 2 - 2, -d / 2 + 2], [-w / 2 + 2, d / 2 - 2], [w / 2 - 2, d / 2 - 2]]) { const q = at(lx, lz); B(M.box, q[0], 22, q[1], 1.6, 22, 1.6, 0, 0, wood); }
    B(M.gable, x, 33, z, w + 6, 8, d + 4, yaw, 0, col); if (st.snow) B(M.gable, x, 35.5, z, w + 6.5, 5.5, d + 4.5, yaw, 0, st.snow);
    if (c.key === 'merchant') for (const [lx, lz, k] of [[-12, 0, 8], [0, 3, 6], [11, -2, 7], [4, -5, 5]]) { const q = at(lx, lz); B(M.box, q[0], 15 + k / 2, q[1], k, k, k, yaw + lx * .05, 0, [.56, .4, .22]); }
    if (c.key === 'smith') { let q = at(-10, 0); B(M.box, q[0], 18, q[1], 12, 6, 7, yaw, 0, [.28, .28, .3]); B(M.box, q[0], 21.5, q[1], 15, 1.5, 6, yaw, 0, [.35, .35, .38]); q = at(10, 0); B(M.cyl, q[0], 15, q[1], 6, 4, 6, 0, 0, [.25, .22, .2]); B(M.disc, q[0], 19.2, q[1], 5, 1, 5, 0, 0, [1, .5, .1], .9); lamps.push({ x: q[0], z: q[1] }); for (let k = 0; k < 3; k++) { const r2 = at(-2 + k * 3, -d / 2 + 2); B(M.box, r2[0], 22, r2[1], .8, 12, .8, yaw, .2 * (k - 1), [.7, .72, .78]); } }
    if (c.key === 'mystic') { const q = at(0, 0); B(M.ball, q[0], 19, q[1], 4.5, 4.5, 4.5, 0, 0, [.7, .55, 1], .8); for (const lx of [-13, 13]) { const c2 = at(lx, 2); B(M.cyl, c2[0], 15, c2[1], 1, 4, 1, 0, 0, [.95, .9, .8]); B(M.octa, c2[0], 20, c2[1], .8, 1.4, .8, 0, 0, [1, .8, .4], 1); } for (let k = 0; k < 4; k++) { const b2 = at(-8 + k * 5, -6); B(M.cyl, b2[0], 15, b2[1], 1.4, 4, 1.4, 0, 0, [[.4, .8, .5], [.8, .3, .4], [.4, .5, .9], [.9, .8, .3]][k], .4); } }
  }
  // The portal plaza: paving rings, a raised dais and a ring of rune stones. The portal itself is drawn live (drawWorld).
  function portalPlaza(r) {
    B(M.cyl, CX, -0.4, CY, r, 1, r, 0, 0, st.pave); B(M.ring, CX, .7, CY, r, 1, r, 0, 0, dark(st.pave, .18)); B(M.ring, CX, .75, CY, r * .62, 1, r * .62, 0, 0, dark(st.pave, .12));
    B(M.cyl, CX, 0, CY, 50, 2.4, 50, 0, 0, st.stone); B(M.cyl, CX, 0, CY, 42, 4, 42, 0, 0, lift(st.stone, .08)); B(M.ring, CX, 4.2, CY, 40, 1, 40, 0, 0, [.55, .4, .9], .7);
    for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4, x = CX + Math.cos(a) * 47, z = CY + Math.sin(a) * 47; B(M.box, x, 9, z, 6, 18, 6, Math.PI / 2 - a, 0, st.stone); B(M.octa, x, 22, z, 2.6, 4.4, 2.6, a, 0, glow || [.7, .5, 1], .9); }
  }

  if (typeof VillageKit !== 'undefined') VillageKit.clear();
  // Dark-fantasy kit styles (Settlement.KIT_STYLES, or ?villagekit=1 to preview any style): the kit draws the
  // buildings, portal, vendor stations, walls and decoration as instanced assets; this file keeps the ground work.
  const kit = lay.kind === 'village' && useVillageKit(lay) && VillageKit.place(lay, CX, CY, lay.style);
  if (lay.kind === 'village') {
    if (kit) { B(M.cyl, CX, -0.4, CY, lay.plazaR, 1, lay.plazaR, 0, 0, st.pave); B(M.ring, CX, .7, CY, lay.plazaR, 1, lay.plazaR, 0, 0, dark(st.pave, .2)); B(M.ring, CX, .75, CY, lay.plazaR * .78, 1, lay.plazaR * .78, 0, 0, dark(st.pave, .12)); }
    else portalPlaza(lay.plazaR);
    // paved streets from the plaza to the gates, with kerbs (stepping stones instead in the Wildwood Haven)
    if (!lay.steppingStones) for (const road of lay.roads) {
      const L = lay.wall.r + 14 - lay.plazaR, tiles = Math.ceil(L / 22), ca = Math.cos(road.angle), sa = Math.sin(road.angle);
      for (let k = 0; k < tiles; k++) { const d = lay.plazaR + (k + .5) * L / tiles; B(M.box, CX + ca * d, .15, CY + sa * d, road.half * 2, .5, L / tiles - .8, road.yaw, 0, k % 2 ? st.pave : dark(st.pave, .07)); }
      for (const sd of [-1, 1]) { const d = lay.plazaR + L / 2; B(M.box, CX + ca * d - sa * sd * road.half, .6, CY + sa * d + ca * sd * road.half, 2.2, 1.4, L, road.yaw, 0, dark(st.stone, .1)); }
    }
    // terraces and dais (High District): raised rings built from slabs, with retaining walls
    for (const t of lay.terraces || []) {
      if (t.kind === 'dais') { B(M.cyl, CX, 0, CY, t.r1, t.h, t.r1, 0, 0, mix(st.stone, st.pave, .5)); B(M.ring, CX, t.h + .2, CY, t.r1, 1, t.r1, 0, 0, dark(st.stone, .15)); continue; }
      const n = Math.max(24, Math.round(t.r1 / 9)), mid = (t.r0 + t.r1) / 2, width = t.r1 - t.r0;
      for (let k = 0; k < n; k++) { const a = (k + .5) / n * 6.2832, x = CX + Math.cos(a) * mid, z = CY + Math.sin(a) * mid, seg = 6.2832 * t.r1 / n + 2; if (lay.roads.some(r => Math.abs(((a - r.angle) % 6.2832 + 9.4248) % 6.2832 - 3.1416) * mid < r.half + 4)) continue; B(M.box, x, t.h / 2, z, seg, t.h, width, Math.PI / 2 - a, 0, mix(st.pave, st.base, .35)); const e = [CX + Math.cos(a) * t.r0, CY + Math.sin(a) * t.r0]; B(M.box, e[0], t.h / 2 + 1, e[1], seg * t.r0 / t.r1, t.h + 2, 3, Math.PI / 2 - a, 0, st.stone); }
    }
    if (!kit) { lay.houses.forEach(building); lay.carts.forEach(cart); }
    lay.props.forEach((p, i) => { if (!kit || KIT_LEAVES.has(p.type)) prop(p, i); });
    // curved paths (Crescent) and stepping stones (Wildwood Haven)
    for (const path of lay.paths || []) for (let a = path.from; a < path.to; a += 14 / path.r) B(M.cyl, CX + Math.cos(a) * path.r, -.2, CY + Math.sin(a) * path.r, 7, 1, 5, a, 0, st.pave);
    if (lay.steppingStones) for (const road of lay.roads) for (let d = lay.plazaR + 8; d < lay.wall.inner; d += 13) for (const sd of [-.45, .45]) { const x = CX + Math.cos(road.angle) * d - Math.sin(road.angle) * sd * road.half, z = CY + Math.sin(road.angle) * d + Math.cos(road.angle) * sd * road.half; B(M.cyl, x, -.1, z, 5 + (d % 3), 1, 4.5, d, 0, st.stone); }
    // the wall, built along its segments: palisade, stone wall with towers, or a living hedge of trees
    const W8 = lay.wall;
    if (!kit) {
    for (const s of W8.segments) {
      const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1), ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1), yaw = -ang;
      if (st.fence === 'palisade') { for (let t = 0; t < len; t += 7.6) { const x = CX + s.x1 + Math.cos(ang) * t, z = CY + s.y1 + Math.sin(ang) * t, h = 25 + R() * 6; B(M.trunk, x, 0, z, 3.6, h, 3.6, ang, 0, mix(wood, [.5, .4, .3], R() * .3)); B(M.cone, x, h, z, 3.6, 5, 3.6, 0, 0, wood); if (st.snow && R() < .7) B(M.ball, x, h + 1, z, 3, 1.6, 3, 0, 0, st.snow); }
        for (const ry of [9, 19]) B(M.box, CX + (s.x1 + s.x2) / 2, ry, CY + (s.y1 + s.y2) / 2, len, 2.2, 1.6, yaw, 0, wood); }
      else if (st.fence === 'hedge') { for (let t = 0; t < len; t += 11) { const x = CX + s.x1 + Math.cos(ang) * t, z = CY + s.y1 + Math.sin(ang) * t; B(M.ball, x, 10, z, 9, 12, 9, t, 0, mix(st.leaf, [.1, .25, .08], R() * .3)); if (R() < .3) tree(x, z, .9 + R() * .4); } }
      else { const parts = Math.max(1, Math.round(len / 15)); for (let k = 0; k < parts; k++) { const t = (k + .5) / parts, x = CX + s.x1 + (s.x2 - s.x1) * t, z = CY + s.y1 + (s.y2 - s.y1) * t; B(M.box, x, 12, z, len / parts + .4, 24, W8.thickness, yaw, 0, mix(st.stone, [0, 0, 0], R() * .1)); if (k % 2) B(M.box, x, 26.5, z, 7, 5, W8.thickness + 1, yaw, 0, st.stone); }
        if (st.snow) B(M.box, CX + (s.x1 + s.x2) / 2, 24.6, CY + (s.y1 + s.y2) / 2, len, 1.2, W8.thickness + 1, yaw, 0, st.snow); }
    }
    for (const t of W8.towers) { const x = CX + t.x, z = CY + t.y; B(M.cyl, x, 0, z, t.r, 44, t.r, 0, 0, st.stone); B(M.cyl, x, 44, z, t.r + 3, 4, t.r + 3, 0, 0, st.base); B(M.cone, x, 48, z, t.r + 2, 26, t.r + 2, 0, 0, st.roofs[0]); if (st.snow) B(M.cone, x, 58, z, t.r - 2, 16, t.r - 2, 0, 0, st.snow); }
    // gates: two posts with banners at each road, just outside the wall (stone walls get gate towers)
    for (let k = 0; k < 4; k++) { const a = k * 1.5708, px = Math.cos(a), pz = Math.sin(a), half = Math.max(W8.gateHalfWidth, lay.roads[k].half + 8);
      for (const sgn of [-1, 1]) { const x = CX + px * (W8.inner + 8) - pz * sgn * (half - 4), z = CY + pz * (W8.inner + 8) + px * sgn * (half - 4);
        if (st.fence === 'stone') { B(M.box, x, 22, z, 17, 44, 17, Math.PI / 2 - a, 0, st.stone); B(M.box, x, 45.5, z, 20, 3, 20, Math.PI / 2 - a, 0, st.base); }
        B(M.trunk, x, 0, z, 2.4, 62, 2.4, 0, 0, wood); B(M.box, x, 46, z, 1.2, 26, 13, -a, 0, k % 2 ? [.75, .15, .15] : [.85, .68, .2], .1); B(M.octa, x, 65, z, 2.2, 3, 2.2, 0, 0, [.95, .8, .3], .4); } }
    }
  } else if (lay.kind === 'camp') {
    portalPlaza(70);
    lay.tents.forEach((t, i) => { const [x, z] = P(t.x, t.y), c = st.cloth[i % st.cloth.length]; B(M.cone6, x, 0, z, 26 * t.s, 36 * t.s, 26 * t.s, i, 0, c); B(M.trunk, x, 0, z, 1.4, 44 * t.s, 1.4, 0, 0, [.25, .18, .12]); B(M.box, x, 46 * t.s, z, 6, 4, .4, i, 0, st.cloth[(i + 1) % 3]); });
    const [fx, fz] = P(lay.fire.x, lay.fire.y); B(M.ring, fx, .6, fz, 13, 1, 13, 0, 0, [.25, .23, .22]); for (let i = 0; i < 5; i++) B(M.box, fx, 2.5, fz, 18, 2.6, 2.6, i * .63, 0, [.3, .2, .12]); B(M.cone, fx, 2, fz, 6, 12, 6, 0, 0, [1, .55, .15], 1); B(M.cone, fx, 2, fz, 3.4, 17, 3.4, .5, 0, [1, .85, .35], 1); lamps.push({ x: fx, z: fz });
    for (let a = 0; a < 6.2832; a += .17) { if ([0, 1, 2, 3].some(k => Math.abs(((a - k * 1.5708) % 6.2832 + 9.4248) % 6.2832 - 3.1416) < .3)) continue; const x = CX + Math.cos(a) * 182, z = CY + Math.sin(a) * 182; B(M.trunk, x, 0, z, 2.6, 18, 2.6, 0, .5 * Math.cos(a * 3), [.3, .22, .14]); B(M.cone, x + Math.cos(a) * 6, 15, z + Math.sin(a) * 6, 2.4, 8, 2.4, a, 1.2, [.45, .35, .22]); }
    for (const s of lay.stalls) {
      const [x, z] = P(s.x, s.y), at = turn(x, z, s.yaw);
      if (s.site) { for (const [lx, lz] of [[-22, -11], [22, -11], [22, 11], [-22, 11]]) { const q = at(lx, lz); B(M.trunk, q[0], 0, q[1], 1.6, 14, 1.6, 0, 0, [.45, .35, .22]); } for (const [lx, lz, w2, d2] of [[0, -11, 44, .6], [0, 11, 44, .6], [-22, 0, .6, 22], [22, 0, .6, 22]]) { const q = at(lx, lz); B(M.box, q[0], 11, q[1], w2, .6, d2, s.yaw, 0, [.85, .75, .5]); } const q = at(0, 16); B(M.box, q[0], 8, q[1], 10, 7, 1, s.yaw, 0, [.9, .85, .6]); continue; }
      B(M.box, x, 7, z, 44, 3, 20, s.yaw, 0, [.45, .3, .18]); for (const [lx, lz] of [[-20, -9], [20, -9], [20, 9], [-20, 9]]) { const q = at(lx, lz); B(M.box, q[0], 15, q[1], 2.2, 30, 2.2, 0, 0, [.3, .22, .14]); }
      B(M.gable, x, 30, z, 50, 10, 26, s.yaw, 0, VENDOR_COLOR[s.key]);
      if (s.key === 'merchant') for (const [lx, lz, k] of [[-12, 0, 8], [0, 2, 6], [12, -2, 7]]) { const q = at(lx, lz); B(M.box, q[0], 8.5 + k / 2, q[1], k, k, k, s.yaw + lx, 0, [.56, .4, .22]); }
      if (s.key === 'smith') { let q = at(-8, 0); B(M.box, q[0], 13, q[1], 12, 8, 8, s.yaw, 0, [.28, .28, .3]); q = at(12, 0); B(M.box, q[0], 9, q[1], 10, 6, 10, s.yaw, 0, [.35, .3, .3]); B(M.box, q[0], 12.5, q[1], 6, 1, 6, 0, 0, [1, .5, .1], .9); }
      if (s.key === 'mystic') { const q = at(0, -2); B(M.ball, q[0], 13, q[1], 5, 5, 5, 0, 0, [.7, .55, 1], .8); for (const lx of [-14, 14]) { const c2 = at(lx, 0); B(M.cyl, c2[0], 8.5, c2[1], 1, 4, 1, 0, 0, [.95, .9, .8]); B(M.octa, c2[0], 13.5, c2[1], .8, 1.4, .8, 0, 0, [1, .8, .4], 1); } }
    }
    const [bx, bz] = P(lay.board.x, lay.board.y); B(M.trunk, bx - 10, 0, bz, 2, 34, 2, 0, 0, wood); B(M.trunk, bx + 10, 0, bz, 2, 34, 2, 0, 0, wood); B(M.box, bx, 24, bz, 26, 16, 1.6, 0, 0, [.5, .38, .22]); B(M.gable, bx, 33, bz, 30, 5, 6, 0, 0, st.cloth[0]); for (const [dx, dy] of [[-6, 3], [5, -2], [-2, -4]]) B(M.box, bx + dx, 24 + dy, bz + 1, 6, 4.5, .4, 0, 0, [.92, .88, .75]);
  } else {
    for (const s of lay.stones) { const [x, z] = P(s.x, s.y); B(M.box, x, s.h / 2, z, 9, s.h, 7, s.x * .03, 0, [.42, .42, .46]); B(M.box, x, s.h - 1, z, 10, 3, 8, s.x * .03, .1, [.35, .36, .4]); }
    B(M.ring, CX, .7, CY, 60, 1, 60, 0, 0, [.35, .33, .36], .1);
  }
}
// Ground texture under the settlement: its own ground colour, the plaza and the village streets.
function paintSettlementGround(g, t, sc) {
  const lay = settlementLayout(), st = settlementPalette(lay), cx = t(WORLD.CX), cy = t(WORLD.CY);
  g.fillStyle = lay.kind === 'none' ? '#5b554c' : st.ground; g.beginPath(); g.arc(cx, cy, (lay.safe + 30) * sc, 0, 7); g.fill();
  if (lay.kind !== 'village') return;
  g.fillStyle = '#9a8a66'; for (const r of lay.roads) { g.save(); g.translate(cx, cy); g.rotate(r.angle); g.fillRect(0, -r.half * sc, (lay.wall.r + 40) * sc, r.half * 2 * sc); g.restore(); }
  g.beginPath(); g.arc(cx, cy, (lay.plazaR + 6) * sc, 0, 7); g.fill();
}
