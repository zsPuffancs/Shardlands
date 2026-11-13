// Shardlands 3D client core: world, models, camera, input, effects, networking.
const $ = id => document.getElementById(id), D = GL.draw, M = GL.M;
const esc = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const RC_CSS = ['#d8d8d8', '#4ee26a', '#4da3ff', '#b25cff', '#ff9d2e', '#ff4560'], RCV = RC_CSS.map(hex);
let WORLD = null, ZT = [], I = null, me = null, pl = [], mo = [], lo = [], ws, sel = 'blade', keys = {}, held = false, lastHold = null, serverTm = 0, dt = 0.016, intent = null;
const ents = new Map(), floaters = [], fxs = [], parts = [], labels = new Map();
let serverReceivedAt = 0;
const cam = { yaw: 0, pitch: 0.82, dist: 440, x: 3600, z: 3600, shake: 0 };
const S = { rx: 0, ry: 0, x: 0, y: 0, yaw: 0, ph: 0, mv: 0, atkT: -9999, flash: 0, id: 0 };
const send = o => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));

// ---------- static world (baked once into GPU chunks) ----------
let seed = 1337; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let lamps = [], lava = [];
function zoneOf(x, z) { const d = Math.hypot(x - WORLD.CX, z - WORLD.CY); if (d < WORLD.V) return -1; for (let i = 0; i < ZT.length; i++) if (d < ZT[i].max) return i; return ZT.length - 1; }
const ZCOL = ['#4f7a38', '#2f4f2d', '#6b5f52', '#4d2620', '#c3d0db', '#2b1f3c', '#1c0f10'];
// Generated regions borrow the scenery of a founding zone: a zone's "look" is that zone's index.
const lookIndex = i => i < 0 ? i : (ZT[i].look === undefined ? i : ZT[i].look);
const lookZoneOf = (x, z) => lookIndex(zoneOf(x, z));
let snapNext = false;
// Switch to (or refresh) the map this client is on. Positions are always local to the current map.
function setWorld(world, arrived) {
  const changed = !WORLD || world.map !== WORLD.map, shape = s => s && JSON.stringify([s.kind, s.style, s.layout, s.stalls, s.built]), rebuilt = !changed && shape(world.settlement) !== shape(WORLD.settlement);
  const fundsChanged = !changed && !rebuilt && JSON.stringify(world.settlement && world.settlement.funds) !== JSON.stringify(WORLD.settlement && WORLD.settlement.funds);
  const st = world.settlement || { kind: 'village', style: 'timber', built: {} };
  world.layout = Settlement.layout(st.kind, st.style, st.built, st.layout, st.stalls);
  WORLD = world; ZT = world.tiers;
  window.PortalUI?.worldChanged(world);
  // A stall was built on this map: redraw the settlement, keep everything else.
  if (rebuilt) { bakeWorld(); buildGround(); if (isOpen('campw')) buildCamp(); }
  // Only the donations changed: refresh the board, the 3D settlement stays as it is.
  if (fundsChanged && isOpen('campw')) buildCamp();
  if (!changed) return;
  intent = null; pendingNpc = null; nearNpcK = null; held = false; lastHold = null;
  keys = {}; lastDir = [0, 0]; rotating = false;
  for (const label of labels.values()) label.el.remove(); labels.clear();
  for (const key of Object.keys(MODEL)) if (/^wb\d+$/.test(key)) delete MODEL[key];
  S.an = null; S.nodes = null; S.nodesMd = null; S.moveSpeed = 0; S.mv = 0; S.atkT = -9999; S.attackFacingUntil = 0;
  for (const npc of Object.values(NPCE)) { npc.an = null; npc.nodes = null; npc.nodesMd = null; }
  bakeWorld(); buildGround(); ents.clear(); fxs.length = 0; parts.length = 0; mobRows.clear(); mobIds = []; playerRows.clear(); lootRows.clear(); mo = []; lo = []; pl = [];
  for (const f of floaters) f.el.remove(); floaters.length = 0; snapNext = true; lastZone = -9;
  if (arrived) { banner(world.map ? zoneName(ZT[0].name) : text('portal.founding', 'The Founding Lands'), world.map ? text('portal.arrivedTier', 'World Tier {tier}', { tier: world.map + 7 }) : text('zone.safe', 'Safe zone')); sfx('lvl'); }
}
// The anvil on the Blacksmith's cart (village) or forge stall (encampment), behind the smith.
function smithAnvilPosition() {
  const anvil = typeof cartPoint === 'function' && cartPoint('smith', typeof VillageKit !== 'undefined' && VillageKit.isActive() ? -30 : -10, typeof VillageKit !== 'undefined' && VillageKit.isActive() ? 4 : 0);
  if (anvil) return anvil;
  const smith = WORLD.npcs.smith || { x: WORLD.CX, y: WORLD.CY };
  return { x: smith.x, z: smith.y };
}

// ---- settlement: drawn by village.js (bakeSettlement, settlementLayout, paintSettlementGround) ----
function bakeWorld() {
  seed = ((WORLD.universe && WORLD.universe.seedNumber) || 1337) + (WORLD.map || 0) * 7919; const zoneOf = lookZoneOf; const { W, H, CX, CY, V } = WORLD, B = GL.bakeAdd; lamps = []; lava = []; GL.bakeBegin();
  const NZ = ZT.length, roadEnd = ZT[Math.max(0, NZ - 2)].max, area = W * H / 25e6;
  const onRoad = (x, z, w) => [0, 1, 2, 3].some(k => { const a = k * 1.5708, px = Math.cos(a), pz = Math.sin(a), t = (x - CX) * px + (z - CY) * pz, dd = Math.abs((x - CX) * -pz + (z - CY) * px); return t > 0 && t < roadEnd && dd < (w || 46); });
  const G = (b, v) => { const k = (R() - .5) * v; return [b[0] + k, b[1] + k * 1.3, b[2] + k * .7]; }, up = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const RK = [[.52, .54, .52], [.4, .42, .45], [.4, .37, .35], [.24, .18, .17], [.8, .84, .88], [.2, .16, .28], [.15, .11, .11]];
  const natOK = bakeDecor(onRoad, zoneOf, R);
  if (natOK) { // nature pack supplies trees, rocks and plants - keep the zone specials (spikes, crystals, skulls, bones)
    for (let i = 0, N = Math.round(1700 * area); i < N; i++) {
      const x = R() * W, z = R() * H, d = Math.hypot(x - CX, z - CY), r = R() * 6.28, s = .8 + R() * .9, k2 = R(); if (d < V + 90 || onRoad(x, z)) continue; const zn = zoneOf(x, z);
      if (zn === 3) { B(M.cone6, x, 0, z, 5.5 * s, 36 * s, 5.5 * s, r, (R() - .5) * .5, [.11, .08, .08]); if (k2 > .7) B(M.octa, x + 7, 6, z + 3, 3.5, 8, 3.5, r, 0, [1, .4, .1], 1); }
      else if (zn === 4 && k2 < .35) { for (let j = 0; j < 3; j++) B(M.octa, x + (j - 1) * 7 * s, 12 * s, z + (j % 2) * 6, 5 * s, (16 + j * 6) * s, 5 * s, r + j, (j - 1) * .25, [.62, .88, 1], .35); }
      else if (zn === 5 && k2 < .6) { const h = 30 + R() * 50, tilt = (R() - .5) * .3; if (k2 < .36) { B(M.octa, x, h * .5, z, 7 * s, h * .55, 7 * s, r, tilt, [.6, .25, .95], .55); B(M.octa, x + 10, h * .25, z - 4, 4 * s, h * .3, 4 * s, r + 1, .3, [.85, .5, 1], .7); } } // fewer tall void crystals; same random draws
      else if (zn === 6) { if (k2 < .6) { const h = 30 + R() * 55; B(M.cone6, x, 0, z, 6 * s, h, 6 * s, r, (R() - .5) * .6, [.09, .05, .05], 0, (R() - .5) * .5); if (R() < .3) B(M.octa, x, h * .45, z, 3, 7, 3, r, 0, [1, .12, .08], 1); } else { for (let j = 0; j < 4; j++) B(M.ball, x + (j % 2) * 7, 4 + (j > 2 ? 6 : 0), z + (j > 1 ? 6 : 0), 4.5, 4.2, 4.6, r + j, 0, [.82, .78, .68]); for (const sx of [-1.6, 1.6]) B(M.ball, x + sx, 6, z + 4.4, 1.2, 1.2, .8, 0, 0, [.1, .02, .02]); } }
      else if (zn === 2 && k2 < .3) { B(M.box, x, 1.6, z, 14, 2.6, 2.6, r, 0, [.86, .84, .76]); B(M.rock, x + Math.cos(r) * 8, 3.2, z - Math.sin(r) * 8, 3.6, 3.4, 3.6, r, 0, [.88, .86, .78]); }
      else if (zn === 4 && k2 < .7) B(M.rock, x, 0, z, 12 + k2 * 20, 3 + k2 * 4, 10 + k2 * 16, r, 0, [.93, .95, .98]);
    }
  } else {
  for (let i = 0, N = Math.round(4700 * area); i < N; i++) {
    const x = R() * W, z = R() * H, d = Math.hypot(x - CX, z - CY), r = R() * 6.28, s = .8 + R() * .9, k = R(), k2 = R(); if (d < V + 90 || onRoad(x, z)) continue; const zn = Math.max(0, zoneOf(x, z));
    if (zn === 3 && k2 < .55) continue; if (zn === 6 && k2 < .3) continue;
    if (k < .24) { const q = 7 + R() * 15; B(M.rock, x, q * .28, z, q, q * .7, q * .85, r, 0, G(RK[zn], .06)); if (k2 < .5) B(M.rock, x + q * .9, q * .15, z + q * .4, q * .45, q * .35, q * .4, r + 1, 0, G(RK[zn], .06));
      const gc = [null, null, null, [1, .42, .1], [.55, .9, 1], [.75, .35, 1], [1, .15, .1]][zn]; if (gc && q > 13) B(M.octa, x - q * .5, q * .7, z, q * .28, q * .55, q * .28, r, .3, gc, zn === 4 ? .35 : 1); continue; }
    if (zn === 0) {
      if (k2 < .68) { const c = G([.19, .5, .22], .1); B(M.trunk, x, 0, z, 3.2 * s, 16 * s, 3.2 * s, r, 0, [.36, .25, .13]); B(M.cone6, x, 9 * s, z, 17 * s, 22 * s, 17 * s, r, 0, c); B(M.cone6, x, 21 * s, z, 13 * s, 19 * s, 13 * s, r + .5, 0, up(c, 1.12)); B(M.cone6, x, 32 * s, z, 8.5 * s, 16 * s, 8.5 * s, r + 1, 0, up(c, 1.25)); }
      else { const c = G([.3, .58, .2], .12); B(M.trunk, x, 0, z, 3.6 * s, 28 * s, 3.6 * s, r, 0, [.4, .28, .15]); B(M.rock, x, 36 * s, z, 17 * s, 13 * s, 17 * s, r, 0, c); B(M.rock, x + 9 * s, 31 * s, z + 4 * s, 10 * s, 8 * s, 10 * s, r + 1, 0, up(c, .9)); B(M.rock, x - 8 * s, 32 * s, z - 5 * s, 11 * s, 9 * s, 11 * s, r + 2, 0, up(c, 1.1)); }
    } else if (zn === 1) {
      if (k2 < .1) { const c = [[.3, .9, .85], [.75, .4, 1], [.4, 1, .5]][Math.floor(R() * 3)]; B(M.trunk, x, 0, z, 3 * s, 13 * s, 3 * s, r, 0, [.86, .83, .72]); B(M.rock, x, 13 * s, z, 11 * s, 5 * s, 11 * s, r, 0, c, .55); B(M.trunk, x + 9, 0, z + 5, 1.6, 6, 1.6, r, 0, [.86, .83, .72]); B(M.rock, x + 9, 6, z + 5, 5, 2.4, 5, r, 0, c, .55); }
      else { const c = G([.1, .3, .22], .07), t = s * 1.25; B(M.trunk, x, 0, z, 3 * t, 18 * t, 3 * t, r, 0, [.26, .19, .12]); for (let j = 0; j < 4; j++) B(M.cone6, x, (9 + j * 10) * t, z, (15 - j * 3.2) * t, 17 * t, (15 - j * 3.2) * t, r + j, 0, up(c, 1 + j * .1)); }
    } else if (zn === 2) {
      const c = G([.26, .22, .2], .05); B(M.trunk, x, 0, z, 3.2 * s, 40 * s, 3.2 * s, r, (R() - .5) * .2, c); B(M.trunk, x, 20 * s, z, 1.7 * s, 19 * s, 1.7 * s, r, .95, c); B(M.trunk, x, 14 * s, z, 1.5 * s, 16 * s, 1.5 * s, r + 2.3, -1.0, c); B(M.trunk, x, 27 * s, z, 1.2 * s, 12 * s, 1.2 * s, r + 4, .8, c);
    } else if (zn === 3) { B(M.cone6, x, 0, z, 5.5 * s, 36 * s, 5.5 * s, r, (R() - .5) * .5, [.11, .08, .08]); if (k2 > .8) B(M.octa, x + 7, 6, z + 3, 3.5, 8, 3.5, r, 0, [1, .4, .1], 1); }
    else if (zn === 4) {
      if (k2 < .16) { for (let j = 0; j < 3; j++) B(M.octa, x + (j - 1) * 7 * s, 12 * s, z + (j % 2) * 6, 5 * s, (16 + j * 6) * s, 5 * s, r + j, (j - 1) * .25, [.62, .88, 1], .35); }
      else { const c = G([.13, .3, .3], .06), t = s * 1.2; B(M.trunk, x, 0, z, 3 * t, 14 * t, 3 * t, r, 0, [.3, .24, .2]); for (let j = 0; j < 3; j++) { const rr = (16 - j * 4) * t, yy = (8 + j * 11) * t; B(M.cone6, x, yy, z, rr, 17 * t, rr, r + j, 0, c); B(M.cone6, x, yy + 9 * t, z, rr * .55, 8.5 * t, rr * .55, r + j, 0, [.93, .96, 1]); } }
    } else if (zn === 5) {
      if (k2 < .4) { const h = 30 + R() * 50; B(M.octa, x, h * .5, z, 7 * s, h * .55, 7 * s, r, (R() - .5) * .3, [.6, .25, .95], .55); B(M.octa, x + 10, h * .25, z - 4, 4 * s, h * .3, 4 * s, r + 1, .3, [.85, .5, 1], .7); B(M.rock, x, 2, z, 12 * s, 5, 12 * s, r, 0, [.15, .1, .2]); }
      else { const c = [.12, .08, .16]; B(M.trunk, x, 0, z, 2.8 * s, 34 * s, 2.8 * s, r, (R() - .5) * .3, c); B(M.trunk, x, 18 * s, z, 1.4 * s, 18 * s, 1.4 * s, r, 1.05, c); B(M.trunk, x, 24 * s, z, 1.2 * s, 14 * s, 1.2 * s, r + 2.5, -.9, c); B(M.ball, x, 34 * s, z, 3 * s, 3 * s, 3 * s, 0, 0, [.8, .35, 1], 1); }
    } else {
      if (k2 < .7) { const h = 30 + R() * 55; B(M.cone6, x, 0, z, 6 * s, h, 6 * s, r, (R() - .5) * .6, [.09, .05, .05], 0, (R() - .5) * .5); if (R() < .3) B(M.octa, x, h * .45, z, 3, 7, 3, r, 0, [1, .12, .08], 1); }
      else { for (let j = 0; j < 4; j++) B(M.ball, x + (j % 2) * 7, 4 + (j > 2 ? 6 : 0), z + (j > 1 ? 6 : 0), 4.5, 4.2, 4.6, r + j, 0, [.82, .78, .68]); for (const sx of [-1.6, 1.6]) B(M.ball, x + sx, 6, z + 4.4, 1.2, 1.2, .8, 0, 0, [.1, .02, .02]); }
    }
  }
  for (let i = 0, N = Math.round(7600 * area); i < N; i++) { // ground cover
    const x = R() * W, z = R() * H, zn = zoneOf(x, z), r = R() * 6.28, k = R(); if (zn < 0 || zn === 3 || onRoad(x, z, 30)) continue;
    if (zn === 2) { if (k < .14) { B(M.box, x, 1.6, z, 14, 2.6, 2.6, r, 0, [.86, .84, .76]); B(M.rock, x + Math.cos(r) * 8, 3.2, z - Math.sin(r) * 8, 3.6, 3.4, 3.6, r, 0, [.88, .86, .78]); } else if (k < .4) B(M.tuft, x, 0, z, 7, 6, 7, r, 0, G([.5, .44, .3], .08)); continue; }
    if (zn === 4) { if (k < .5) B(M.rock, x, 0, z, 12 + k * 20, 3 + k * 4, 10 + k * 16, r, 0, [.93, .95, .98]); else if (k < .7) B(M.tuft, x, 0, z, 6, 5, 6, r, 0, [.75, .8, .7]); continue; }
    if (zn === 5) { if (k < .45) B(M.tuft, x, 0, z, 8, 7, 8, r, 0, G([.3, .15, .4], .08), .15); else if (k < .5) B(M.octa, x, 3, z, 2, 4, 2, r, 0, [.8, .4, 1], 1); continue; }
    if (zn === 6) { if (k < .12) { B(M.box, x, 1.6, z, 14, 2.6, 2.6, r, 0, [.7, .66, .58]); B(M.ball, x + 7, 3.4, z, 3.6, 3.4, 3.6, r, 0, [.75, .7, .62]); } else if (k < .2) B(M.cone6, x, 0, z, 3, 12, 3, r, 0, [.12, .05, .05]); continue; }
    if (zn === 0 && k < .11) { B(M.trunk, x, 0, z, .6, 5, .6, r, 0, [.2, .5, .2]); B(M.octa, x, 6, z, 2.4, 2, 2.4, r, 0, [[1, .4, .5], [1, .9, .3], [.7, .5, 1], [1, 1, 1]][Math.floor(R() * 4)], .3); continue; }
    B(M.tuft, x, 0, z, 7 + R() * 4, 6 + R() * 6, 7 + R() * 4, r, 0, zn === 0 ? G([.3, .62, .24], .14) : G([.16, .38, .24], .08));
  }
  }
  if (NZ > 3) for (let i = 0; i < 110; i++) { const a = R() * 6.283, d = ZT[3].min + 50 + R() * (ZT[3].max - ZT[3].min - 100), x = CX + Math.cos(a) * d, z = CY + Math.sin(a) * d, r = 25 + R() * 55; if (onRoad(x, z, 80)) continue; lava.push({ x, z, r }); B(M.disc, x, .9, z, r, 1, r, 0, 0, [1, .36, .05], .95); B(M.ring, x, 1.1, z, r * 1.14, 1, r * 1.14, 0, 0, [.13, .09, .08]); }
  if (NZ > 6) for (let i = 0; i < 160; i++) { const x = R() * W, z = R() * H; if (zoneOf(x, z) !== 6) continue; const r = 25 + R() * 60; lava.push({ x, z, r }); B(M.disc, x, .9, z, r, 1, r, 0, 0, [.55, .04, .04], .9); B(M.ring, x, 1.1, z, r * 1.12, 1, r * 1.12, 0, 0, [.06, .03, .03]); }
  if (NZ > 4) for (let i = 0; i < 70; i++) { const a = R() * 6.283, d = ZT[4].min + 60 + R() * (ZT[4].max - ZT[4].min - 120), x = CX + Math.cos(a) * d, z = CY + Math.sin(a) * d, r = 30 + R() * 60; if (onRoad(x, z, 80)) continue; B(M.disc, x, .8, z, r, 1, r * .8, a, 0, [.7, .88, 1], .25); }
  const per = (W + H) * 2, step = 62; for (let t = 0; t < per; t += step) { const e = t % W, q = Math.floor(t / W), p = q === 0 ? [e, 0] : q === 1 ? [W, e] : q === 2 ? [W - e, H] : [0, H - e]; B(M.trunk, p[0], 0, p[1], 8, 100, 8, 0, 0, [.17, .14, .15]); B(M.octa, p[0], 112, p[1], 5.5, 11, 5.5, 0, 0, [1, .22, .12], 1); }
  bakeSettlement(B, R);
  GL.bakeEnd();
}
function buildGround() {
  const SZ = WORLD.W + 400, X0 = -200, N = 2048, cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d'), t = v => (v - X0) / SZ * N, sc = N / SZ;
  g.fillStyle = '#08090a'; g.fillRect(0, 0, N, N); g.fillStyle = ZCOL[Math.min(6, lookIndex(ZT.length - 1))]; g.fillRect(t(0), t(0), WORLD.W * sc, WORLD.H * sc);
  try { g.filter = 'blur(6px)'; } catch (e) {}
  const disc = (r, c) => { g.fillStyle = c; g.beginPath(); g.arc(t(WORLD.CX), t(WORLD.CY), r * sc, 0, 7); g.fill(); };
  const last = ZT[ZT.length - 1].outer ? ZT.length - 2 : ZT.length - 1;
  for (let i = last; i >= 0; i--) disc(ZT[i].max, ZCOL[lookIndex(i)] || '#444');
  if (!WORLD.map) disc(ZT[0].min, settlementPalette(settlementLayout()).ground);
  paintSettlementGround(g, t, sc);
  g.strokeStyle = 'rgba(150,128,88,.6)'; g.lineWidth = 38 * sc; g.lineCap = 'round'; const re = ZT[last].max;
  for (let k = 0; k < 4; k++) { const a = k * 1.5708; g.beginPath(); g.moveTo(t(WORLD.CX), t(WORLD.CY)); g.lineTo(t(WORLD.CX + Math.cos(a) * re), t(WORLD.CY + Math.sin(a) * re)); g.stroke(); }
  try { g.filter = 'blur(2px)'; } catch (e) {} paintSettlementGround(g, t, sc);
  try { g.filter = 'none'; } catch (e) {} g.strokeStyle = 'rgba(200,40,40,.8)'; g.lineWidth = 6; g.strokeRect(t(0), t(0), WORLD.W * sc, WORLD.H * sc);
  GL.setGround(cv, X0, X0, SZ);
}

// ---------- models ----------
const WCOL = [[.72, .74, .78], [.56, .7, 1], [.56, .7, 1], [.42, .9, .63], [.42, .9, .63], [1, .82, .3], [1, .82, .3], [1, .54, .24], [1, .54, .24], [1, .31, .85]];
const SKIN = hex('#e8b98f'), FAM = { sword: 'blade', bow: 'archer', staff: 'mage' }, PI = Math.PI, GOLD = [.88, .72, .28], BONE = [.95, .93, .82];
const ccol = cls => hex((I && I.classes[cls] && I.classes[cls].color) || '#cccccc');
function part(x, z, yaw, sc) { const c = Math.cos(yaw), s = Math.sin(yaw); return (lx, ly, lz, mesh, sx, sy, sz, col, pitch, emis, alpha, roll) => D(mesh, x + (c * lx + s * lz) * sc, ly * sc, z + (-s * lx + c * lz) * sc, sx * sc, sy * sc, sz * sc, yaw, pitch || 0, col, emis || 0, alpha, roll); }
function sword(P, h, dir, len, col, em, wd) { P(h[0], h[1], h[2], M.limb, 1.9, 5, 1.9, [.3, .2, .1], dir); const g = [h[0], h[1] - 5 * Math.cos(dir), h[2] - 5 * Math.sin(dir)]; P(g[0], g[1], g[2], M.box, 9, 1.8, 2.6, GOLD, dir); P(g[0], g[1], g[2], M.limb, wd || 3.2, len, 1.2, col, dir, em); P(g[0], g[1] - len * Math.cos(dir), g[2] - len * Math.sin(dir), M.cone, (wd || 3.2) / 2, 5, .6, col, dir + PI, em); }
function club(P, h, dir, len, r, spikes) { P(h[0], h[1], h[2], M.limb, r * .5, len, r * .5, [.4, .27, .12], dir); const c = [h[0], h[1] - len * Math.cos(dir), h[2] - len * Math.sin(dir)]; P(c[0], c[1], c[2], M.rock, r, r * 1.2, r, [.33, .23, .13], dir); if (spikes) for (const a of [1.57, -1.57, 0]) P(c[0], c[1], c[2], M.cone, r * .3, r * 1.7, r * .3, [.82, .82, .78], dir + a + (a ? 0 : PI)); }
function human(e, o) {
  const sc = o.sc || 1, P = part(e.rx, e.ry, e.yaw, sc), now = performance.now(), k = o.kind;
  const sw = Math.sin(e.ph) * .75 * e.mv, idle = (1 - e.mv) * Math.sin(now / 520 + (e.id || 0)) * .5;
  const ap = (now - e.atkT) / 340, atk = ap < 1 && ap >= 0 ? Math.sin(ap * PI) : 0;
  const bob = Math.abs(Math.sin(e.ph)) * 1.6 * e.mv + idle, gl = (e.flash > now - 120 ? .7 : 0) + (o.rage ? .35 : 0);
  const W = o.wide || 9.5, th = o.thin ? .55 : 1, skin = o.skin, body = o.body, leg = o.leg, dark = mix(body, [0, 0, 0], .45), bow = k === 'archer';
  const ra = bow ? -.25 - .9 * atk + sw * .4 : -.12 - 1.55 * atk + sw * .6, la = bow ? -1.25 * atk - sw * .3 * (1 - atk) - .1 : -sw * .6;
  if (o.robe) { P(0, 1, 0, M.taper, 11, 27, 9.5, o.robe, 0, gl * .3); P(0, 1, 0, M.cyl, 11.4, 1.8, 9.9, mix(o.robe, [1, 1, 1], .3)); }
  else for (const s of [-1, 1]) { const a = s * sw; P(s * 4.6, 27, 0, M.tlimb, 8.4 * th, 24, 8.4 * th, leg, a, gl * .3); P(s * 4.6, 28.8 - 24 * Math.cos(a), 2.4 - 24 * Math.sin(a), M.box, 6 * th + 1.2, 3.6, 11, o.boot || mix(leg, [0, 0, 0], .45), a * .4); }
  const ty = 25 + bob;
  if (o.bones) { P(0, ty, 0, M.cyl, 1.6, 22, 1.6, body); for (let i = 0; i < 3; i++) P(0, ty + 9 + i * 4.2, 0, M.cyl, 7.6 - i * .5, 1.5, 4.8, body, 0, gl); P(0, ty + 1, 0, M.box, 11, 4, 6, body); }
  else { P(0, ty, 0, M.torso, W, 22, 6.4, body, 0, gl); P(0, ty + .5, 0, M.cyl, W * .82, 3.2, 5.6, o.belt || dark); P(0, ty + 2, 5.4, M.box, 3.4, 3, 1, GOLD, 0, .15); }
  const ax = W + 1.8, sy = ty + 20, pr = (o.pad ? 6.4 : 4.5) * th, hr = 3 * th + .3;
  for (const s of [-1, 1]) P(s * ax, sy, 0, M.ball, pr, pr * .9, pr, o.padc || body, 0, gl);
  P(-ax, sy, 0, M.tlimb, 5.8 * th, 18, 5.8 * th, o.arm || body, la, gl); P(ax, sy, 0, M.tlimb, 5.8 * th, 18, 5.8 * th, o.arm || body, ra, gl);
  const lh = [-ax, sy - 18 * Math.cos(la), -18 * Math.sin(la)], rh = [ax, sy - 18 * Math.cos(ra), -18 * Math.sin(ra)];
  P(lh[0], lh[1], lh[2], M.ball, hr, hr, hr, skin); P(rh[0], rh[1], rh[2], M.ball, hr, hr, hr, skin);
  const hy = ty + 31; P(0, ty + 21.5, 0, M.cyl, 2.8 * th + .4, 3.6, 2.8 * th + .4, skin); P(0, hy, 0, M.ball, 7, 7.5, 7, skin, 0, gl);
  if (o.hair) P(0, hy + 1.8, -1.4, M.ball, 7.4, 6.6, 7.4, o.hair);
  for (const s of [-1, 1]) P(s * 2.7, hy + .8, 6.2, M.ball, 1.2, 1.6, .9, o.eye || [.07, .07, .1], 0, o.eye ? 1 : 0);
  const wc = WCOL[o.w || 0], we = .12 + (o.w || 0) * .09, cape = (c, w, l) => P(0, sy + 1, -6.4, M.limb, w, l, 1.4, c, .2 + e.mv * .35 + Math.sin(now / 300 + (e.id || 0)) * .04);
  switch (k) {
    case 'blade': { const st = mix(body, [1, 1, 1], .3); P(0, hy + 2.2, -1, M.ball, 7.9, 7, 7.9, st); P(0, hy + 1, 7, M.box, 1.6, 7, 1.2, st); P(0, hy + 9, -1, M.box, 1.8, 5, 11, [.8, .14, .14]); P(0, ty + 13, 4.6, M.box, 13, 12, 4, st, -.05); cape([.7, .12, .12], 17, 31); sword(P, rh, ra - 1.75 + atk * 2.2, 30, wc, we); P(lh[0] - 2.5, lh[1] + 5, lh[2] + 1, M.cyl, 9.5, 2, 9.5, mix(body, [.2, .25, .5], .5), 0, 0, undefined, 1.5708); P(lh[0] - 5, lh[1] + 5, lh[2] + 1, M.ball, 2.6, 2.6, 2.6, GOLD); break; }
    case 'archer': { const hc = mix(body, [0, 0, 0], .3), bc = mix([.45, .3, .15], wc, o.w ? .5 : 0), Rr = 19; P(0, hy + 1.6, -1.6, M.ball, 7.8, 7.4, 7.8, hc); P(0, hy + 5, -5, M.cone, 5, 9, 5, hc, -1.1); cape(hc, 16, 28); P(5, sy - 12, -7.5, M.cyl, 2.8, 17, 2.8, [.42, .27, .13], 0, 0, undefined, -.3); for (let i = 0; i < 3; i++) P(9 + i * 1.3, sy + 6, -7.5, M.box, .7, 5, .7, [.9, .9, .85]);
      for (let i = 0; i < 6; i++) { const t = -1.1 + (i + .5) * (2.2 / 6); P(lh[0] - 1, lh[1] + Rr * Math.sin(t), lh[2] + 8 + Rr * Math.cos(t) - Rr, M.box, 1.8, 2 * Rr * Math.sin(1.1 / 6) + 1, 1.8, bc, -t, o.w ? we : 0); } P(lh[0] - 1, lh[1], lh[2] + 8 + Rr * Math.cos(1.1) - Rr - atk * 5, M.box, .5, 2 * Rr * Math.sin(1.1), .5, [.92, .92, .88]); break; }
    case 'mage': { const hc = mix(body, [0, 0, 0], .25); P(0, hy + 4.6, 0, M.cyl, 12.5, 1.2, 12.5, hc); P(0, hy + 5.4, 0, M.cone, 7.6, 13, 7.6, hc); P(0, hy + 16.5, -1.2, M.cone, 3.6, 9, 3.6, hc, -.7); P(0, hy + 5.6, 0, M.cyl, 7.8, 2, 7.8, GOLD); P(rh[0], 1, rh[2] + 2, M.cyl, 1.3, 66, 1.3, [.42, .28, .14]); const cc = mix([.6, .4, 1], wc, o.w ? .7 : 0), cy = 74 + Math.sin(now / 400) * 1.5; P(rh[0], cy, rh[2] + 2, M.octa, 4 + atk * 2.5, 7 + atk * 3, 4 + atk * 2.5, cc, 0, .8 + we + atk); for (let i = 0; i < 3; i++) { const a = now / 500 + i * 2.09; P(rh[0] + Math.cos(a) * 7, cy + Math.sin(a * 1.3) * 3, rh[2] + 2 + Math.sin(a) * 7, M.ball, 1.1, 1.1, 1.1, [.9, .8, 1], 0, 1); } break; }
    case 'orc': case 'warlord': case 'ogre': {
      P(0, hy - 3.5, 2.5, M.box, 9, 4.4, 8, skin); for (const s of [-1, 1]) P(s * 3.2, hy - 2.5, 6.4, M.cone, 1.2, 5, 1.2, BONE); P(0, ty + 1, 5.9, M.limb, 9, 12, 1.2, [.45, .3, .16]); P(0, ty + 1, -5.9, M.limb, 9, 10, 1.2, [.45, .3, .16]);
      if (k === 'orc') { P(0, hy + 7, -1, M.ball, 3, 4, 3, [.1, .1, .1]); P(0, ty + 13, 0, M.cyl, W * .96, 2, 6.6, [.3, .2, .12], 0, 0, undefined, .5); club(P, rh, ra - 1.6 + atk * 2, 22, 6.5, true); }
      else if (k === 'ogre') { P(0, ty + 8, 3.5, M.ball, W * 1.05, 11, 10, skin, 0, gl); P(0, hy + 6.5, -1, M.ball, 4, 3, 4, [.2, .15, .1]); club(P, rh, ra - 1.6 + atk * 2, 30, 9, true); }
      else { const ir = [.32, .32, .36]; P(0, hy + 2.4, -1, M.ball, 7.9, 6.8, 7.9, ir); for (const s of [-1, 1]) P(s * 7, hy + 5, 0, M.cone, 2.4, 12, 2.4, BONE, 0, 0, undefined, s * -.6); P(0, ty + 12, 4.6, M.box, 16, 14, 4, ir); cape([.6, .08, .08], 22, 34); const dir = ra - 1.6 + atk * 2; P(rh[0], rh[1], rh[2], M.limb, 2.6, 32, 2.6, [.35, .25, .12], dir); P(rh[0], rh[1] - 27 * Math.cos(dir), rh[2] - 27 * Math.sin(dir) + 5, M.box, 1.6, 14, 15, [.7, .72, .78], dir, .12); }
      break; }
    case 'bandit': { const hc = [.32, .1, .1], st = [.78, .78, .84]; P(0, hy + 1.6, -1.6, M.ball, 7.8, 7.4, 7.8, hc); P(0, hy + 5, -5, M.cone, 5, 8, 5, hc, -1.1); P(0, hy - 2.6, 4.4, M.box, 9.5, 4.4, 5.4, [.15, .12, .12]); cape(hc, 16, 26); for (const [h, a] of [[rh, ra], [lh, la]]) { const d = a - 1.7 + atk * 1.6; P(h[0], h[1], h[2], M.limb, 1.8, 13, .8, st, d, .1); P(h[0], h[1], h[2], M.box, 5, 1.4, 2, [.3, .2, .1], d); } break; }
    case 'skeleton': P(0, hy - 5, 2, M.box, 7.5, 3, 6.5, skin); sword(P, rh, ra - 1.75 + atk * 2.2, 26, [.55, .42, .3], 0); P(lh[0] - 2.5, lh[1] + 5, lh[2] + 1, M.cyl, 8.5, 1.8, 8.5, [.4, .27, .14], 0, 0, undefined, 1.5708); break;
    case 'boneking': { P(0, hy - 5, 2, M.box, 7.5, 3, 6.5, skin); P(0, hy + 5.2, 0, M.cyl, 6.6, 2.4, 6.6, GOLD, 0, .4); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; P(Math.cos(a) * 5.8, hy + 7.4, Math.sin(a) * 5.8, M.cone, 1.4, 5, 1.4, GOLD, 0, .4); } cape([.22, .07, .32], 22, 38); P(rh[0], 1, rh[2] + 2, M.cyl, 1.6, 70, 1.6, [.3, .26, .2]); P(rh[0], 77 + Math.sin(now / 350) * 1.5, rh[2] + 2, M.ball, 5.5 + atk * 3, 5.5 + atk * 3, 5.5 + atk * 3, [.4, 1, .5], 0, 1); break; }
    case 'goblin': for (const s of [-1, 1]) P(s * 7.5, hy + 2, -1, M.cone, 2.2, 9, 1.2, skin, 0, 0, undefined, s * -1.35); P(0, hy - 1, 7, M.cone, 1.6, 5, 1.6, skin, 1.5708); { const d = ra - 1.7 + atk * 1.6; P(rh[0], rh[1], rh[2], M.limb, 1.6, 12, .8, [.75, .75, .8], d, .1); } P(0, ty + 12, -6.5, M.box, 10, 12, 5, [.4, .3, .15]); break;
    case 'yeti': P(0, hy - 1, 5.4, M.ball, 5, 5, 3, [.55, .72, .88]); for (const s of [-1, 1]) { P(s * 6, hy + 5, 0, M.cone, 2.2, 11, 2.2, [.85, .85, .8], 0, 0, undefined, s * -.7); for (const h of [s < 0 ? lh : rh]) for (let j = -1; j <= 1; j++) P(h[0] + j * 1.6, h[1] - 2, h[2] + 2, M.cone, .9, 4.5, .9, [.92, .92, .86], PI * .85); } for (let j = 0; j < 4; j++) P((j - 1.5) * 4, ty + 18 - j % 2 * 3, -7, M.cone, 2, 9, 2, [.6, .85, 1], -.6, .3); break;
    case 'voidknight': { const st = [.18, .14, .26]; P(0, hy + 2.2, -1, M.ball, 8.2, 7.4, 8.2, st); for (const s of [-1, 1]) P(s * 6, hy + 6, 0, M.cone, 2, 10, 2, [.6, .3, .9], 0, .6, undefined, s * -.5); P(0, hy + 1, 7, M.box, 6, 1.4, 1.2, [.8, .3, 1], 0, 1); P(0, ty + 13, 4.6, M.box, 14, 12, 4, st); cape([.3, .1, .45], 18, 34); sword(P, rh, ra - 1.75 + atk * 2.2, 34, [.75, .4, 1], .9, 3.6); break; }
    case 'deathlord': { const dk = [.07, .06, .08], d = ra - 1.2 + atk * 1.8; P(0, hy + 1.6, -1.6, M.ball, 8.6, 8.2, 8.6, dk); P(0, hy + 6, -6, M.cone, 5.5, 11, 5.5, dk, -1.1); P(0, hy, 5, M.ball, 5.4, 6, 3, [0, 0, 0]); for (const s of [-1, 1]) P(s * 2.4, hy + 1, 7.6, M.ball, 1.4, 1.4, .8, [1, .15, .1], 0, 1); cape(dk, 24, 40);
      const top = [rh[0], rh[1] + 30 * Math.cos(d), rh[2] + 30 * Math.sin(d)]; P(top[0], top[1], top[2], M.limb, 1.8, 66, 1.8, [.22, .18, .18], d); P(top[0], top[1], top[2] + 2, M.box, 1.4, 4.5, 34, [.78, .8, .88], d - 1.2, .4); P(top[0], top[1] - 2, top[2] + 30, M.cone, 1, 6, 2, [.78, .8, .88], d + 1.6, .4); break; }
    case 'smith': P(0, hy - 3.4, 5, M.box, 7.6, 6.5, 3, [.55, .3, .14]); P(0, ty + 9, 6.3, M.box, 13, 18, 1, [.35, .22, .12]); { const d = ra - 1.6 + atk * 2.1; P(rh[0], rh[1], rh[2], M.limb, 1.6, 16, 1.6, [.4, .27, .12], d); P(rh[0], rh[1] - 16 * Math.cos(d), rh[2] - 16 * Math.sin(d), M.box, 7, 5, 5, [.42, .42, .46], d); } break;
    case 'npc': P(0, hy + 5, 0, M.cyl, 13, 1, 13, [.85, .7, .3]); P(0, hy + 5.5, 0, M.cone, 7, 6, 7, [.8, .62, .25]); P(0, ty + 9, 6.3, M.box, 13, 18, 1, [.92, .88, .78]); P(0, hy - 2.2, 6.6, M.box, 6, 1.6, 1.4, [.35, .2, .1]); P(0, ty + 13, -8.4, M.box, 13, 15, 7, [.5, .33, .18]); break;
  }
  if (o.crown) { P(0, hy + 5.6, 0, M.cyl, 6.8, 2.4, 6.8, GOLD, 0, .4); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; P(Math.cos(a) * 6, hy + 7.8, Math.sin(a) * 6, M.cone, 1.4, 5, 1.4, GOLD, 0, .4); } }
}
function golem(e, o) {
  const P = part(e.rx, e.ry, e.yaw, o.sc), now = performance.now(), sw = Math.sin(e.ph) * .5 * e.mv, gl = e.flash > now - 120 ? .7 : 0, rk = o.body, dk = mix(rk, [0, 0, 0], .32), lv = o.lava || [1, .5, .1], pu = .75 + Math.sin(now / 300 + (e.id || 0)) * .25;
  const ap = (now - e.atkT) / 380, atk = ap < 1 && ap >= 0 ? Math.sin(ap * PI) : 0;
  for (const s of [-1, 1]) { P(s * 8, 13, s * sw * 7, M.rock, 7, 13, 8, dk); P(s * 8, 4, s * sw * 9 + 2, M.rock, 8.5, 5, 10.5, rk); }
  P(0, 34, 0, M.rock, 17, 15, 13, rk, 0, gl); P(0, 35, 9.5, M.ball, 5, 6, 3, lv, 0, pu); P(-7, 29, 10.6, M.box, 8, 1.6, 1, lv, 0, pu, undefined, .5); P(7, 41, 10, M.box, 7, 1.6, 1, lv, 0, pu, undefined, -.6); P(0, 24, 9.8, M.box, 1.6, 7, 1, lv, 0, pu);
  for (const s of [-1, 1]) { const a = s > 0 ? -.2 - 1.5 * atk + sw : -.2 - sw, d = [0, -Math.cos(a), -Math.sin(a)]; P(s * 19, 44, 0, M.rock, 9.5, 8, 9.5, dk, 0, gl); P(s * 21, 44 + d[1] * 11, d[2] * 11, M.rock, 6.5, 9, 6.5, rk); P(s * 22, 44 + d[1] * 25, d[2] * 25, M.rock, 9, 9, 9, dk); P(s * 22, 44 + d[1] * 18, d[2] * 18 + 4, M.box, 1.4, 6, 1, lv, 0, pu); }
  P(0, 50, 3, M.rock, 7, 6.5, 7, rk, 0, gl); for (const s of [-1, 1]) P(s * 3, 51, 9.2, M.ball, 1.5, 1.5, .8, lv, 0, 1);
  P(0, 47, -7, M.cone6, 6, 15, 6, dk, -.5); P(-10, 44, -6, M.cone6, 4, 11, 4, dk, -.5, 0, undefined, .4); P(10, 44, -6, M.cone6, 4, 11, 4, dk, -.5, 0, undefined, -.4);
}
function beast(e, o) {
  const P = part(e.rx, e.ry, e.yaw, o.sc), now = performance.now(), sw = Math.sin(e.ph) * .8 * e.mv, gl = e.flash > now - 120 ? .7 : 0, ap = (now - e.atkT) / 300, lg = ap < 1 && ap >= 0 ? Math.sin(ap * PI) * 5 : 0, Bc = o.body, L = o.leg, br = Math.sin(now / 600 + (e.id || 0)) * .4 * (1 - e.mv);
  if (o.kind === 'wolf') {
    for (let i = 0; i < 4; i++) { const fx = i % 2 ? 4.6 : -4.6, fz = i < 2 ? 9 : -9.5, a = (i % 3 ? sw : -sw); P(fx, 15, fz, M.tlimb, 4.6, 15, 4.6, L, a, gl * .3); P(fx, 16.2 - 15 * Math.cos(a), fz - 15 * Math.sin(a) + 1.2, M.ball, 2.6, 1.8, 3.2, L); }
    P(0, 20 + br, -2, M.ball, 6.6, 6.6, 14, Bc, 0, gl); P(0, 21 + br, 7, M.ball, 7.6, 7.6, 8.5, Bc, 0, gl); P(0, 26.3 + br, 0, M.box, 2.6, 2.4, 20, L);
    if (o.spikes) for (let i = 0; i < 4; i++) P(0, 27, 8 - i * 6, M.cone, 1.8, 6, 1.8, o.spikes, -.4);
    const hz = 20 + lg; P(0, 25, 15 + lg, M.ball, 4.6, 4.6, 5, Bc, 0, gl); P(0, 26.5, hz, M.ball, 5.6, 5.4, 6, Bc, 0, gl); P(0, 25, hz + 4.5, M.cone, 3.4, 8.5, 3, L, 1.5708, gl); P(0, 25.4, hz + 12.6, M.ball, 1.3, 1.1, 1.1, [.05, .05, .05]); P(0, 22.6, hz + 3, M.box, 4.4, 1.4, 7, mix(L, [0, 0, 0], .3), lg * .05);
    for (const s of [-1, 1]) { P(s * 3.4, 30.5, hz - 1.5, M.cone, 2.1, 6, 2.1, Bc, -.25, 0, undefined, s * -.3); P(s * 2.6, 27.8, hz + 4.6, M.ball, 1.2, 1.2, .9, o.eye || [1, .25, .1], 0, 1); }
    const tw = 2.2 + Math.sin(now / 260 + (e.id || 0)) * .25 * (1 - e.mv) + sw * .2; P(0, 23, -15, M.tlimb, 4.6, 12, 4.6, Bc, tw); P(0, 23 - 12 * Math.cos(tw), -15 - 12 * Math.sin(tw), M.ball, 2.4, 2.4, 2.4, mix(Bc, [1, 1, 1], .35));
  } else {
    for (let i = 0; i < 4; i++) { const fx = i % 2 ? 5.4 : -5.4, fz = i < 2 ? 8.5 : -9, a = (i % 3 ? sw : -sw); P(fx, 12, fz, M.tlimb, 5.2, 12, 5.2, L, a, gl * .3); P(fx, 13 - 12 * Math.cos(a), fz - 12 * Math.sin(a) + .8, M.ball, 2.8, 1.7, 3, [.12, .1, .1]); }
    P(0, 19 + br, 0, M.ball, 9.6, 8.8, 15, Bc, 0, gl); for (let i = 0; i < 5; i++) P(0, 26.2, 8 - i * 4.5, M.cone, 2, 5.5, 2, L, -.5);
    P(0, 17.5, 14 + lg, M.ball, 7.2, 6.8, 7.6, Bc, 0, gl); P(0, 15.5, 19.5 + lg, M.cyl, 3.4, 5.5, 3, [.86, .58, .56], 1.5708); P(0, 15.5, 25.2 + lg, M.ball, 2.6, 2.2, .8, [.6, .35, .35]);
    for (const s of [-1, 1]) { P(s * 4, 13.5, 19 + lg, M.cone, 1.3, 7, 1.3, BONE, .9, 0, undefined, s * -.5); P(s * 5, 23.5, 12 + lg, M.cone, 2.2, 4.5, 2.2, L, -.3, 0, undefined, s * -.7); P(s * 3.6, 20, 20 + lg, M.ball, 1.1, 1.1, .8, [1, .8, .2], 0, .7); }
    P(0, 22, -14.5, M.tlimb, 1.6, 7, 1.6, L, 2.6);
  }
}
function drake(e, o) {
  const P = part(e.rx, e.ry, e.yaw, o.sc), now = performance.now(), t = now / 1000, sw = Math.sin(e.ph) * .7 * e.mv, gl = e.flash > now - 120 ? .7 : 0, Bc = o.body, L = o.leg, bel = o.belly || [1, .8, .4], wg = o.wing || mix(Bc, [1, .4, .1], .4), fr = o.fire || [1, .6, .1], fl = Math.sin(t * 5 + (e.id || 0)) * .4;
  const ap = (now - e.atkT) / 340, atk = ap < 1 && ap >= 0 ? Math.sin(ap * PI) : 0, lg = atk * 6;
  for (let i = 0; i < 4; i++) { const fx = i % 2 ? 8 : -8, fz = i < 2 ? 12 : -12, a = (i % 3 ? sw : -sw); P(fx, 17, fz, M.tlimb, 8, 17, 8, L, a); P(fx, 18.6 - 17 * Math.cos(a), fz - 17 * Math.sin(a) + 2, M.ball, 4.4, 2.6, 5.6, L); }
  P(0, 30, 0, M.ball, 11.5, 10, 23, Bc, 0, gl); P(0, 26.5, 1, M.ball, 9.5, 7.5, 20, bel, 0, .25); for (let i = 0; i < 6; i++) P(0, 39 - i * .5, 14 - i * 6.5, M.cone, 2, 7 - i * .5, 2, L, -.5);
  P(0, 37, 20, M.ball, 6, 6.5, 8, Bc, 0, gl); P(0, 43, 27 + lg * .5, M.ball, 5, 5.5, 6.5, Bc, 0, gl);
  const hz = 34 + lg; P(0, 47, hz, M.ball, 5.6, 5, 8, Bc, 0, gl); P(0, 45.8, hz + 6.5, M.ball, 4, 3.2, 5.5, Bc); P(0, 43.4, hz + 4, M.box, 6, 1.8, 11, L, .1 + atk * .35);
  for (const s of [-1, 1]) { P(s * 3.4, 50, hz - 3, M.cone, 1.8, 10, 1.8, BONE, -1, 0, undefined, s * -.35); P(s * 3.8, 49, hz + 3, M.ball, 1.3, 1.3, 1, [1, .9, .2], 0, 1); P(s * 9, 40, 2, M.tlimb, 3.2, 44, 3.2, L, 0, 0, undefined, s * (1.9 + fl)); P(s * 9, 40, 2, M.wing, s * 46, 1, 36, wg, 0, .22, undefined, s * (.33 + fl)); }
  P(0, 46, hz + 12.5 + Math.sin(t * 9), M.ball, 2 + atk * 3, 2 + atk * 3, 2 + atk * 3, fr, 0, 1);
  const sx = Math.sin(t * 2 + (e.id || 0)) * 3; P(0, 29, -24, M.ball, 6, 5.5, 10, Bc); P(sx * .5, 27, -38, M.ball, 4, 3.8, 9, Bc); P(sx, 25, -50, M.ball, 2.6, 2.4, 8, Bc); P(sx * 1.4, 25, -56, M.cone, 3, 9, 3, fr, -1.5708, .6);
}
function slime(e, o) {
  const now = performance.now(), b = Math.abs(Math.sin(now / 260 + e.ph)), r = (o.rad || 15) * (o.sc || 1), x = e.rx, z = e.ry, c = e.flash > now - 120 ? [1, 1, 1] : o.body, cy = Math.cos(e.yaw), sy = Math.sin(e.yaw), y = r * .55 + b * 10;
  D(M.disc, x, .7, z, r * (1.25 - b * .25), 1, r * (1.25 - b * .25), 0, 0, mix(c, [0, 0, 0], .4), 0, .35);
  D(M.ball, x, y, z, r * (1 + (1 - b) * .18), r * (.72 + b * .3), r * (1 + (1 - b) * .18), e.yaw, 0, c, .22, .8); D(M.ball, x, y - 1, z, r * .5, r * .42, r * .5, e.yaw, 0, mix(c, [1, 1, 1], .55), .5);
  D(M.ball, x - cy * r * .35 + sy * r * .3, y + r * .42, z + sy * r * .35 + cy * r * .3, r * .15, r * .11, r * .15, 0, 0, [1, 1, 1], 1);
  for (const s of [-1, 1]) D(M.ball, x + cy * s * r * .3 + sy * r * .86, y + r * .12, z - sy * s * r * .3 + cy * r * .86, 2 * (o.sc || 1), 2.8 * (o.sc || 1), 1.6 * (o.sc || 1), e.yaw, 0, [.05, .05, .08]);
  if (o.crown) { const ty = y + r * (.72 + b * .3) - 2; D(M.cyl, x, ty, z, r * .32, 3, r * .32, 0, 0, GOLD, .4); for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; D(M.cone, x + Math.cos(a) * r * .3, ty + 3, z + Math.sin(a) * r * .3, 1.6, 6, 1.6, 0, 0, GOLD, .4); } }
}
function spider(e, o) {
  const x = e.rx, z = e.ry, sc = o.sc || 1, now = performance.now(), gl = e.flash > now - 120 ? .7 : 0, P = part(x, z, e.yaw, sc), Bc = o.body, dk = mix(Bc, [0, 0, 0], .35), ap = (now - e.atkT) / 300, lg = ap < 1 && ap >= 0 ? Math.sin(ap * PI) * 4 : 0, y0 = 13;
  P(0, y0 + 3, -11, M.ball, 9.5, 8.5, 12, mix(Bc, [.5, .1, .5], .3), 0, gl); P(0, y0 + 8, -13, M.ball, 3, 1.6, 4.5, o.glow || [.9, .15, .15], 0, o.glow ? 1 : .4); P(0, y0, 2, M.ball, 6.5, 5.5, 7.5, Bc, 0, gl); P(0, y0, 9 + lg, M.ball, 4.6, 4.2, 4.6, dk, 0, gl);
  for (const s of [-1, 1]) { P(s * 2, y0 - 2.5, 12.5 + lg, M.cone, 1, 5, 1, BONE, PI * .9); for (let i = 0; i < 3; i++) P(s * (1.4 + i * 1.3), y0 + 1.5 + (i === 1 ? 1 : 0), 13 + lg - i * .6, M.ball, .9, .9, .7, [1, .12, .1], 0, 1); }
  for (let i = 0; i < 8; i++) {
    const s = i % 2 ? 1 : -1, k = i >> 1, ang = e.yaw + s * (.5 + k * .52), hx = Math.sin(ang), hz = Math.cos(ang), g = Math.sin(e.ph * 1.6 + i * 1.57) * .28 * e.mv;
    D(M.tlimb, x, y0 * sc, z, 2.4 * sc, 13 * sc, 2.4 * sc, ang, -2.2 + g * .5, dk); const kx = x + hx * 13 * .81 * sc, ky = (y0 + 13 * .59) * sc, kz = z + hz * 13 * .81 * sc; D(M.tlimb, kx, ky, kz, 1.9 * sc, 23 * sc, 1.9 * sc, ang, -.42 + g, dk); D(M.ball, kx, ky, kz, 1.6 * sc, 1.6 * sc, 1.6 * sc, 0, 0, Bc);
  }
}
function stoneModel(e, t) {
  const tm = performance.now() / 1000, x = e.rx, z = e.ry, hit = e.flash > performance.now() - 120, base = hex(t.c || '#5cc8ff'), c = hit ? [1, 1, 1] : base, c2 = mix(base, [1, 1, 1], .4);
  D(M.ring, x, 1.2, z, 44, 1, 44, tm * .4, 0, base, 1, .5); D(M.ring, x, 1.4, z, 30, 1, 30, -tm * .6, 0, c2, 1, .35);
  for (let i = 0; i < 5; i++) { const a = i * 1.257 + .4; D(M.rock, x + Math.cos(a) * 25, 4, z + Math.sin(a) * 25, 8, 6, 7, a, 0, [.3, .3, .34]); D(M.octa, x + Math.cos(a) * 17, 13, z + Math.sin(a) * 17, 4.5, 15, 4.5, -a + 1.57, .45, c2, .7); }
  if (t.shape === 'obelisk') {
    const dk = mix(base, [.08, .07, .08], .82); D(M.box, x, 3, z, 30, 6, 30, .3, 0, [.2, .19, .2]); D(M.box, x, 36, z, 18, 64, 18, .3, 0, dk); D(M.roof, x, 68, z, 13.5, 16, 13.5, 1.085, 0, dk);
    for (const y of [22, 40, 56]) D(M.box, x, y, z, 18.6, 2.4, 18.6, .3, 0, c, .95); D(M.ball, x, 96 + Math.sin(tm * 2) * 4, z, 7, 7, 7, 0, 0, c, 1);
    for (let i = 0; i < 4; i++) { const a = tm * 1.5 + i * 1.571; D(M.octa, x + Math.cos(a) * 26, 70 + Math.sin(tm * 2 + i) * 6, z + Math.sin(a) * 26, 3, 6, 3, a, 0, c2, .9); }
  } else {
    D(M.octa, x, 52 + Math.sin(tm * 1.5) * 5, z, 20, 38, 20, tm * .8, 0, c, .95);
    for (let i = 0; i < 3; i++) { const a = tm * 1.2 + i * 2.094; D(M.octa, x + Math.cos(a) * 36, 56 + Math.sin(tm * 2 + i) * 8, z + Math.sin(a) * 36, 5, 9, 5, a, 0, c2, .9); }
  }
}
function shroom(e, o) {
  const P = part(e.rx, e.ry, e.yaw, o.sc), now = performance.now(), gl = e.flash > now - 120 ? .7 : 0, b = Math.abs(Math.sin(e.ph)) * 3 * e.mv, sq = 1 + Math.sin(now / 300 + (e.id || 0)) * .05, ap = (now - e.atkT) / 300, at = ap < 1 && ap >= 0 ? Math.sin(ap * PI) : 0;
  for (const s of [-1, 1]) P(s * 4.5, 2.5, Math.sin(e.ph) * s * 3 * e.mv, M.ball, 3.2, 2.6, 4, [.85, .8, .7]);
  P(0, 3 + b, 0, M.taper, 7, 15, 7, [.93, .88, .78], -at * .3, gl);
  P(0, 21 + b, at * 4, M.ball, 15 * sq, 9, 15 * sq, o.body, -at * .3, gl);
  for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + .3, rr = i % 2 ? 9 : 5; P(Math.cos(a) * rr, 28.5 + b - (rr > 6 ? 2 : 0), Math.sin(a) * rr + at * 4, M.ball, 2.4, 1.2, 2.4, [1, .98, .92]); }
  for (const s of [-1, 1]) P(s * 2.6, 12 + b, 6.6, M.ball, 1.2, 1.8, .8, [.05, .05, .05]);
}
function wraith(e, o) {
  const now = performance.now(), fl = Math.sin(now / 400 + (e.id || 0)) * 3, P = part(e.rx, e.ry, e.yaw, o.sc), gl = e.flash > now - 120 ? .7 : 0, ap = (now - e.atkT) / 340, atk = ap < 1 && ap >= 0 ? Math.sin(ap * PI) : 0, c = o.body, dk = mix(c, [0, 0, 0], .55), ey = o.eye || [.5, .9, 1];
  P(0, 8 + fl, 0, M.taper, 11, 36, 9, c, .15 * e.mv, gl + .12, .82);
  for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283 + now / 900; P(Math.cos(a) * 9, 11 + fl, Math.sin(a) * 8, M.cone, 2.6, 12, 2.6, c, PI, .1, .75); }
  P(0, 47 + fl, -1, M.ball, 8.6, 9.2, 8.6, dk, 0, gl); P(0, 52 + fl, -5, M.cone, 5, 9, 5, dk, -1);
  P(0, 46 + fl, 4.4, M.ball, 5.6, 6.6, 3, [0, 0, 0]); for (const s of [-1, 1]) P(s * 2.2, 47 + fl, 7.4, M.ball, 1.3, 1.3, .8, ey, 0, 1);
  for (const s of [-1, 1]) { const a = -1.1 - atk * .9 + Math.sin(now / 500 + s) * .15; P(s * 10, 40 + fl, 0, M.tlimb, 4.4, 20, 4.4, c, a, gl, .82); for (let j = -1; j <= 1; j++) P(s * 10 + j * 1.4, 40 + fl - 20 * Math.cos(a), -20 * Math.sin(a), M.cone, .7, 6, .7, ey, a - PI, .8); }
  if (Math.random() < .05) burst(e.rx, 20 + fl, e.ry, 1, ey, 20, 1.2, 1.4, 1, -40);
}
function lod(e, t, o, al) { // cheap stand-in for far-away monsters
  const s = (o.sc || 1) * (al ? 1.3 : 1), c = o.body || hex(t.c || '#cccccc'), h = Math.min(130, (o.top || 50) * s), w = Math.max(8, t.r * .8 * (al ? 1.3 : 1));
  D(M.ball, e.rx, h * .4, e.ry, w, h * .4, w, e.yaw, 0, c, e.flash > performance.now() - 120 ? .6 : 0); D(M.ball, e.rx + Math.sin(e.yaw) * w * .6, h * .78, e.ry + Math.cos(e.yaw) * w * .6, h * .15, h * .15, h * .15, 0, 0, mix(c, [0, 0, 0], .2));
}
const MODEL = {
  wolf: { fn: beast, kind: 'wolf', sc: 1, body: hex('#8d939a'), leg: hex('#5d6268'), top: 40 }, boar: { fn: beast, kind: 'boar', sc: 1.05, body: hex('#8a5a30'), leg: hex('#4a3018'), top: 38 },
  slime: { fn: slime, sc: 1, body: hex('#59d26a'), rad: 15, top: 38 }, shroom: { fn: shroom, sc: 1, body: hex('#c94a3a'), top: 34 },
  alphawolf: { fn: beast, kind: 'wolf', sc: 1.9, body: hex('#363c48'), leg: hex('#1c2028'), eye: [1, .8, .1], spikes: [.75, .78, .85], top: 44 },
  kingslime: { fn: slime, sc: 2.4, body: hex('#2fb54e'), rad: 15, crown: 1, top: 34 },
  goblin: { fn: human, kind: 'goblin', sc: .82, body: hex('#5a4a2a'), leg: hex('#3a3020'), skin: hex('#7fae3a'), arm: hex('#7fae3a'), top: 66 },
  orc: { fn: human, kind: 'orc', sc: 1.12, body: hex('#6b4a2a'), leg: hex('#4a3320'), skin: hex('#5a9e4b'), arm: hex('#5a9e4b'), wide: 11.5, pad: 1, top: 70 },
  bandit: { fn: human, kind: 'bandit', sc: 1, body: hex('#8a3330'), leg: hex('#2b2b30'), skin: hex('#d2a07a'), top: 70 },
  spider: { fn: spider, sc: 1.1, body: hex('#3a2a4a'), top: 34 }, broodmother: { fn: spider, sc: 2.7, body: hex('#4a1f5a'), glow: [1, .3, .3], top: 30 },
  warlord: { fn: human, kind: 'warlord', sc: 1.6, body: hex('#4a4a52'), leg: hex('#2a2a2e'), skin: hex('#3f8a35'), arm: hex('#3f8a35'), wide: 12.5, pad: 1, padc: [.32, .32, .36], top: 74 },
  skeleton: { fn: human, kind: 'skeleton', sc: 1.05, bones: 1, thin: 1, body: hex('#d9d6c4'), leg: hex('#c9c6b2'), skin: hex('#e6e3d2'), eye: [.3, 1, 1], top: 70 },
  ogre: { fn: human, kind: 'ogre', sc: 1.85, body: hex('#5a4630'), leg: hex('#7b5ea7'), skin: hex('#7b5ea7'), arm: hex('#7b5ea7'), wide: 13, pad: 1, padc: hex('#7b5ea7'), boot: hex('#4a3a5e'), top: 68 },
  wraith: { fn: wraith, sc: 1.1, body: hex('#9fb0d0'), eye: [.5, .9, 1], top: 62 },
  boneking: { fn: human, kind: 'boneking', sc: 1.8, bones: 1, thin: 1, pad: 1, padc: [.25, .2, .3], body: hex('#cfc9b0'), leg: hex('#b9b39c'), skin: hex('#ded8c0'), eye: [.4, 1, .5], top: 72 },
  ogrechief: { fn: human, kind: 'ogre', sc: 2.4, body: hex('#3e2a5e'), leg: hex('#5e3f8a'), skin: hex('#5e3f8a'), arm: hex('#5e3f8a'), wide: 13, pad: 1, padc: [.3, .3, .34], boot: hex('#2a1e3e'), crown: 1, top: 70 },
  hellhound: { fn: beast, kind: 'wolf', sc: 1.25, body: hex('#4a1810'), leg: hex('#220806'), eye: [1, .7, .1], spikes: [1, .45, .1], top: 42 },
  drake: { fn: drake, sc: 1.4, body: hex('#c04a22'), leg: hex('#7a2a12'), top: 62 },
  golem: { fn: golem, sc: 2.1, body: hex('#6a5c54'), top: 62 }, infernal: { fn: golem, sc: 3.1, body: hex('#4a2018'), lava: [1, .3, .05], top: 62 },
  elderdrake: { fn: drake, sc: 2.4, body: hex('#3a1550'), leg: hex('#220a30'), belly: [.7, .3, 1], fire: [.8, .3, 1], wing: [.3, .1, .45], top: 62 },
  frostfang: { fn: beast, kind: 'wolf', sc: 1.25, body: hex('#d8ecff'), leg: hex('#7fa8c8'), eye: [.3, .8, 1], spikes: [.6, .85, 1], top: 42 },
  yeti: { fn: human, kind: 'yeti', sc: 1.7, body: hex('#e8eef5'), leg: hex('#d0d8e0'), skin: hex('#e8eef5'), arm: hex('#e8eef5'), wide: 13, pad: 1, padc: hex('#eef2f8'), boot: hex('#bcc6d0'), top: 66 },
  icegolem: { fn: golem, sc: 2.3, body: hex('#7fb0d8'), lava: [.6, .92, 1], top: 62 },
  yetiking: { fn: human, kind: 'yeti', sc: 2.7, body: hex('#f4f7fb'), leg: hex('#dfe6ee'), skin: hex('#f4f7fb'), arm: hex('#f4f7fb'), wide: 13, pad: 1, padc: hex('#ffffff'), boot: hex('#bcc6d0'), crown: 1, top: 66 },
  frostwyrm: { fn: drake, sc: 2.6, body: hex('#9fd8ff'), leg: hex('#5a8ab0'), belly: [.88, .96, 1], fire: [.6, .92, 1], wing: [.75, .9, 1], top: 62 },
  shade: { fn: wraith, sc: 1.15, body: hex('#2a1e40'), eye: [.85, .3, 1], top: 62 }, voidweaver: { fn: spider, sc: 1.3, body: hex('#2a1440'), glow: [.85, .35, 1], top: 34 },
  voidknight: { fn: human, kind: 'voidknight', sc: 1.2, body: hex('#2a1e3a'), leg: hex('#1a1226'), skin: hex('#8a7a9a'), pad: 1, padc: [.22, .16, .32], top: 72 },
  voidlord: { fn: human, kind: 'boneking', sc: 2.3, bones: 1, thin: 1, pad: 1, padc: [.15, .1, .25], body: hex('#3a2a50'), leg: hex('#2a1e3a'), skin: hex('#4a3a60'), eye: [.8, .3, 1], top: 72 },
  abyssalwyrm: { fn: drake, sc: 2.7, body: hex('#2a0a3a'), leg: hex('#14051e'), belly: [.5, .2, .8], fire: [.7, .2, 1], wing: [.2, .05, .3], top: 62 },
  deathlord: { fn: human, kind: 'deathlord', sc: 2.4, robe: hex('#121014'), body: hex('#1a1a1e'), leg: hex('#101012'), skin: hex('#d8d0c0'), top: 72 },
  stone: { top: 92 },
};
function modelFor(ty, t) { let o = MODEL[ty] || (t.as && MODEL[t.as] && (MODEL[ty] = MODEL[t.as])); if (o && t.wb && !o.wbScaled) o = MODEL[ty] = { ...o, sc: (o.sc || 1) * 1.5, wbScaled: 1 }; if (t.st) return o || (MODEL[ty] = { top: t.shape === 'obelisk' ? 104 : 92 }); if (!o) { const c = hex(t.c || '#cccccc'), k = Math.max(.6, t.r / 15); o = MODEL[ty] = { fn: beast, kind: 'wolf', sc: k, body: c, leg: mix(c, [0, 0, 0], .4), top: 40 }; } return o; }
function drawPlayer(e, cls, w, dead, rg) {
  const cm = classModel(cls); if (cm && drawChar(e, cm, { dead, rage: rg, wemc: w ? WCOL[w].map(v => v * Math.min(.6, .06 * w)) : null, tint: I.classes[cls] && I.classes[cls].tint }, performance.now())) return;
  if (dead) { D(M.box, e.rx, 3, e.ry, 22, 6, 12, 0, 0, [.45, .45, .5]); D(M.box, e.rx, 20, e.ry, 14, 30, 5, 0, 0, [.55, .55, .6]); D(M.cyl, e.rx, 35, e.ry - 2.5, 7, 5, 7, 0, 1.5708, [.55, .55, .6]); return; }
  if (!GL.shadowsOn()) D(M.disc, e.rx, 1, e.ry, 17, 1, 17, 0, 0, [0, 0, 0], 0, .3);
  const c = ccol(cls), C = I.classes[cls] || {}, k = FAM[C.fam] || 'blade', o = { sc: 1, kind: k, body: c, leg: mix(c, [0, 0, 0], .5), skin: SKIN, w, rage: rg };
  if (k === 'blade') { o.pad = 1; o.padc = mix(c, [1, 1, 1], .3); o.leg = mix(c, [.2, .2, .25], .6); } else if (k === 'mage') { o.robe = mix(c, [0, 0, 0], .2); o.hair = [.85, .85, .9]; } else o.hair = [.35, .22, .1];
  human(e, o);
}
window.Shardlands = { MODEL, addModel: (id, def) => { MODEL[id] = def; }, human, beast, drake, slime, spider, golem, shroom, wraith, part, hex, mix, D, M, FXC: null, burst: (...a) => burst(...a) };

// ---------- dynamic world bits + loot ----------
const ICOL = {}; const itemCol = k => ICOL[k] || (ICOL[k] = hex((I && I.items[k] && I.items[k].color) || '#cccccc'));
const itemColCss = k => (I && I.items[k] && I.items[k].color) || '#cccccc';
const NPCE = { merchant: { rx: 0, ry: 0, yaw: 0, x: 0, y: 0, ph: 0, mv: 0, atkT: -9999, flash: 0, id: 3 }, smith: { rx: 0, ry: 0, yaw: -2.2, x: 0, y: 0, ph: 0, mv: 0, atkT: -9999, flash: 0, id: 4 }, mystic: { rx: 0, ry: 0, yaw: -.6, x: 0, y: 0, ph: 0, mv: 0, atkT: -9999, flash: 0, id: 5 } };
const NPCNAME = { merchant: '🏪 Merchant', smith: '⚒ Blacksmith', mystic: '🔮 Soul Mystic', portal: '🌀 World Portal', camp: '🏕 Encampment board' };
let pendingNpc = null, nearNpcK = null;
const npcDist = k => { const n = WORLD.npcs[k]; return Math.hypot(S.rx - n.x, S.ry - n.y); };
function drawWorld(now) {
  drawDecor(); const { CX, CY } = WORLD, nt = 1 - GL.sky().d;
  for (const l of lamps) { if (Math.abs(l.x - cam.x) > 1500 || Math.abs(l.z - cam.z) > 1500) continue; const f = Math.sin(now / 90 + l.x) * .6; D(M.ball, l.x, 35 + f * .4, l.z, 3 + f * .3, 3.6 + f * .4, 3 + f * .3, 0, 0, [1, .68, .22], 1); if (nt > .3) D(M.disc, l.x, 1.5, l.z, 70, 1, 70, 0, 0, [1, .6, .2], 1, .07 * nt); }
  if (Math.random() < .3) for (const l of lava) if (Math.abs(l.x - cam.x) < 700 && Math.abs(l.z - cam.z) < 700 && Math.random() < .12) { const a = Math.random() * 6.28, d = Math.random() * l.r * .8; burst(l.x + Math.cos(a) * d, 2, l.z + Math.sin(a) * d, 1, [1, .5, .1], 30, 1.6, 2, 1, -40); }
  if (Math.abs(CX - cam.x) > 1800 || Math.abs(CY - cam.z) > 1800) return;
  // the coals on the Blacksmith's cart glow and smoke (only where the smith is)
  const kitOn = typeof VillageKit !== 'undefined' && VillageKit.isActive(); if (kitOn) VillageKit.draw(now, cam, !!WORLD.npcs.portal);
  const coals = !kitOn && WORLD.npcs.smith && cartPoint('smith', 10, 0); if (coals) { const f = Math.sin(now / 70); D(M.ball, coals.x, 21 + f * .5, coals.z, 4 + f * .3, 4 + f * .5, 4 + f * .3, 0, 0, [1, .5, .1], 1); if (Math.random() < .25) burst(coals.x, 24, coals.z, 1, [1, .6, .15], 26, 1.3, 1.3, 1, -70); if (Math.random() < .15) burst(coals.x, 30, coals.z, 1, [.35, .33, .33], 18, 2.4, 3, 0, -50); }
  // every NPC faces the portal (the yaw comes from the shared layout via the server)
  for (const key of ['merchant', 'smith', 'mystic']) if (WORLD.npcs[key] && Number.isFinite(WORLD.npcs[key].yaw)) NPCE[key].yaw = WORLD.npcs[key].yaw;
  const mN = WORLD.npcs.merchant, sN = WORLD.npcs.smith, me_ = NPCE.merchant, sm = NPCE.smith;
  if (mN) { me_.rx = mN.x; me_.ry = mN.y; me_.mv = 0; } if (mN && !drawChar(me_, 'Cleric', { h: 66 }, now)) human(me_, { sc: 1, kind: 'npc', body: hex('#6a4a8a'), leg: hex('#3a2a4a'), skin: SKIN, hair: [.35, .2, .1] });
  if (sN) { sm.rx = sN.x; sm.ry = sN.y; sm.mv = 0; } if (sN && now - sm.atkT > 1700) { sm.atkT = now; sm.skill = false; setTimeout(() => {
    const anvil = smithAnvilPosition();
    if (Math.hypot(cam.x - sN.x, cam.z - sN.y) < 700) burst(anvil.x, 14, anvil.z, 7, [1, .75, .3], 120, .5, 1.2, 1);
  }, 260); }
  if (sN && !drawChar(sm, 'Monk', { h: 68, tint: [1, .92, .85] }, now)) human(sm, { sc: 1.08, kind: 'smith', body: hex('#7a5a3a'), leg: hex('#3a2e24'), skin: hex('#d9a27a'), arm: hex('#d9a27a'), wide: 11, pad: 0 });
  { const cN = WORLD.npcs.camp; if (cN && Math.hypot(cam.x - cN.x, cam.z - cN.y) < 650) label('npc5', esc(WORLD.settlement && WORLD.settlement.kind === 'village' ? text('npc.villageBoard', '📜 Village board') : text('npc.camp', NPCNAME.camp)) + (nearNpcK === 'camp' ? ' <span style="color:#fff">[F]</span>' : ''), 'npc', cN.x, 50, cN.y, 0, 150); }
  { const pN = WORLD.npcs.portal; if (pN && kitOn) { if (Math.hypot(cam.x - CX, cam.z - CY) < 650) label('npc4', esc(text('npc.portal', NPCNAME.portal)) + (nearNpcK === 'portal' ? ' <span style="color:#fff">[F]</span>' : ''), 'npc', pN.x, 215, pN.y, 0, 150); }
    else if (pN) { const pu = .9 + Math.sin(now / 260) * .1; D(M.disc, pN.x, 1.2, pN.y, 34, 1, 34, 0, 0, [.12, .05, .25], .6); D(M.ring, pN.x, 2, pN.y, 37 * pu, 1, 37 * pu, -now / 500, 0, [.75, .6, 1], 1);
    for (let i = 0; i < 4; i++) { const k = (now / 1100 + i / 4) % 1, r = 31 * (1 - k * .6); D(M.ring, pN.x, 5 + k * 78, pN.y, r, 1, r, now / 300 + i, 0, [.55, .4, 1], 1, (1 - k) * .9); }
    if (Math.random() < .4) burst(pN.x + (Math.random() - .5) * 44, 6, pN.y + (Math.random() - .5) * 44, 1, [.6, .45, 1], 30, 1.4, 1.5, 1, -70);
    if (Math.hypot(cam.x - CX, cam.z - CY) < 650) label('npc4', esc(text('npc.portal', NPCNAME.portal)) + (nearNpcK === 'portal' ? ' <span style="color:#fff">[F]</span>' : ''), 'npc', pN.x, 104, pN.y, 0, 150); } }
  { const yN = WORLD.npcs.mystic, my = NPCE.mystic; if (yN) { my.rx = yN.x; my.ry = yN.y; my.x = yN.x; my.y = yN.y; my.ph = now / 400; if (!drawChar(my, 'Wizard', { h: 66, tint: [.62, .45, .95], emc: [.06, .02, .12] }, now)) human(my, { sc: 1.05, kind: 'merchant', body: hex('#5a3a8a'), leg: hex('#2a1e3a'), skin: hex('#d9b08a'), arm: hex('#5a3a8a'), wide: 10, pad: 0 }); if (Math.random() < .25) burst(yN.x + Math.sin(now / 300) * 14, 40 + Math.cos(now / 200) * 8, yN.y + Math.cos(now / 300) * 14, 1, [.6, .35, 1], 30, 1, 1.2, .8, -40);
    if (Math.hypot(cam.x - CX, cam.z - CY) < 650) label('npc3', esc(text('npc.mystic', NPCNAME.mystic)) + (nearNpcK === 'mystic' ? ' <span style="color:#fff">[F]</span>' : ''), 'npc', yN.x, 98, yN.y, 0, 150); } }
  if (mN && Math.hypot(cam.x - CX, cam.z - CY) < 650) label('npc', esc(text('npc.merchant', NPCNAME.merchant)) + (nearNpcK === 'merchant' ? ' <span style="color:#fff">[F]</span>' : ''), 'npc', mN.x, 98, mN.y + 11, 0, 150);
  if (sN && Math.hypot(cam.x - CX, cam.z - CY) < 650) label('npc2', esc(text('npc.smith', NPCNAME.smith)) + (nearNpcK === 'smith' ? ' <span style="color:#fff">[F]</span>' : ''), 'npc', sN.x, 98, sN.y, 0, 150);
}
function drawLoot(L, now) {
  const b = Math.sin(now / 260 + L.id) * 2.5, rot = now / 700 + L.id, x = L.x, z = L.y;
  if (L.k === 'souls') { const fl = Math.sin(now / 160 + L.id) * 1.5; D(M.ball, x, 12 + b + fl, z, 7, 9, 7, rot, 0, [.55, .25, 1], 1, .85); D(M.ball, x, 13 + b + fl, z, 4, 5.5, 4, 0, 0, [.85, .7, 1], 1); if (Math.random() < .2) burst(x, 14 + b, z, 1, [.6, .35, 1], 40, .9, 1.4, 1, -60); }
  else if (L.k === 'gold') { D(M.cyl, x, 1, z, 7, 2.2, 7, 0, 0, [1, .82, .2], .5); D(M.cyl, x + 5, 3.4, z + 3, 6, 2.2, 6, rot, 0, [1, .85, .25], .5); D(M.cyl, x - 4, 1, z + 5, 6, 2.2, 6, 0, 0, [.95, .75, .15], .5); }
  else if (L.k === 'item') { const c = itemCol(L.i); D(M.ball, x, b * .4 + 8, z, 5.4, 6.4, 5.4, rot, 0, c, .5); D(M.cyl, x, b * .4 + 13, z, 2.2, 4, 2.2, 0, 0, [.9, .9, .92]); D(M.cyl, x, b * .4 + 17, z, 2.6, 2, 2.6, 0, 0, [.55, .38, .2]); }
  else {
    const c = RCV[L.r], e = .35 + L.r * .13, y = 12 + b;
    switch (L.s) {
      case 'sword': D(M.box, x, y, z, 3, 1.2, 28, rot, 0, c, e); D(M.box, x, y, z, 12, 2, 3, rot, 0, GOLD, .2); break;
      case 'bow': D(M.box, x, y, z, 2.5, 26, 2.5, rot, 0, c, e); D(M.box, x, y, z, .8, 24, .8, rot + .2, 0, [.9, .9, .9]); break;
      case 'staff': D(M.cyl, x, y - 14, z, 1.4, 28, 1.4, rot, 0, [.5, .35, .2]); D(M.octa, x, y + 18, z, 4, 6.5, 4, rot, 0, c, e + .4); break;
      case 'helm': D(M.ball, x, y, z, 9, 8, 9, rot, 0, c, e); D(M.cyl, x, y - 5, z, 10, 2.4, 10, rot, 0, mix(c, [0, 0, 0], .3), e); break;
      case 'armor': D(M.torso, x, y - 8, z, 10, 17, 6, rot, 0, c, e); D(M.ball, x + Math.cos(rot) * 10, y + 8, z - Math.sin(rot) * 10, 4, 4, 4, 0, 0, c, e); D(M.ball, x - Math.cos(rot) * 10, y + 8, z + Math.sin(rot) * 10, 4, 4, 4, 0, 0, c, e); break;
      case 'boots': D(M.box, x - 4, y - 4, z, 6, 10, 12, rot, 0, c, e); D(M.box, x + 5, y - 4, z, 6, 10, 12, rot, 0, c, e); break;
      case 'ring': D(M.ring, x, y, z, 7, 1, 7, rot, 1.4, c, e + .3); D(M.octa, x, y + 7, z, 2.4, 2.8, 2.4, rot, 0, [1, 1, 1], .8); break;
      default: D(M.octa, x, y, z, 6, 9, 6, rot, 0, c, e + .3);
    }
    if (L.r >= 2) { const h = 90 + L.r * 35, w = 2.5 + L.r; D(M.cyl, x, 0, z, w, h, w, 0, 0, c, 1, .2 + .08 * Math.sin(now / 300 + L.id)); D(M.ring, x, 1.3, z, 16 + L.r * 2, 1, 16 + L.r * 2, rot, 0, c, 1, .5); if (Math.random() < .08) burst(x, 6, z, 1, c, 40, 1.4, 1.2, 1, -60); }
  }
  const dd = Math.hypot(L.x - cam.x, L.y - cam.z);
  if (L.k === 'gear' && dd < 520) label('l' + L.id, esc(L.n), 'loot', x, 36 + b, z, 0, 150, RC_CSS[L.r]); else if (L.k !== 'gear' && dd < 260) label('l' + L.id, esc(L.n), 'loot', x, 30, z, 0, 130, L.k === 'gold' ? '#ffd24a' : itemColCss(L.i));
}

// ---------- effects ----------
const MAX_PARTICLES = 700, MAX_EFFECTS = 256, WARNING_RESERVE = 64;
const isWarningEffect = effect => ['tele', 'tcone', 'tline', 'portal'].includes(effect.k);
function addParticle(particle) { if (parts.length >= MAX_PARTICLES) return false; parts.push(particle); return true; }
function addEffect(effect) {
  const warning = isWarningEffect(effect);
  if (!warning && fxs.length >= MAX_EFFECTS - WARNING_RESERVE) return false;
  if (fxs.length < MAX_EFFECTS) { fxs.push(effect); return true; }
  if (!warning) return false;
  let replace = fxs.findIndex(current => !isWarningEffect(current));
  if (replace < 0) {
    const distance = value => Math.max(0, Math.hypot(value.x - S.rx, value.z - S.ry) - (value.r || 0));
    let farthest = distance(effect);
    for (let i = 0; i < fxs.length; i++) if (distance(fxs[i]) > farthest) { farthest = distance(fxs[i]); replace = i; }
  }
  if (replace < 0) return false;
  fxs[replace] = effect; return true;
}
function addRing(x, z, r0, r1, col, dur, y, emis) { addEffect({ k: 'ring', x, z, r0, r1, col, t0: performance.now(), dur, y: y || 2, emis: emis === undefined ? 1 : emis }); }
function addProj(x0, z0, x1, z1, col, dur, h) { addEffect({ k: 'proj', x: x0, z: z0, x1, z1, col, t0: performance.now(), dur, h: h || 40 }); }
function burst(x, y, z, n, col, spd, life, size, emis, grav) {
  for (let i = 0; i < n && parts.length < MAX_PARTICLES; i++) { const a = Math.random() * 6.283, u = Math.sqrt(Math.random()), s = spd * (.4 + Math.random() * .6); addParticle({ x, y, z, vx: Math.cos(a) * s * u, vy: (Math.random() * .9 + .25) * spd, vz: Math.sin(a) * s * u, t0: performance.now(), life: life * (.6 + Math.random() * .6), col, size, emis: emis === undefined ? .8 : emis, g: grav === undefined ? 520 : grav }); }
}
const FXC = { blade: [1, 1, 1], archer: [.5, 1, .5], mage: [.7, .5, 1], heal: [.4, 1, .6], lvl: [1, .9, .3], rage: [1, .3, .2], buff: [.5, .8, 1] };
window.Shardlands.FXC = FXC;
const FLOATER_STYLE = { dmg: 'damage', hurt: 'hurt', gold: 'gold', xp: 'xp', heal: 'heal', mana: 'mana', lvl: 'level', loot: 'loot', souls: 'loot' };
function faceAttackTarget(entity, event, now) {
  if (!Number.isFinite(event.tx) || !Number.isFinite(event.ty)) return;
  entity.yaw = Math.atan2(event.tx - event.x, event.ty - event.y);
  if (!isMelee(event.s)) entity.attackFacingUntil = now + 650;
}
function onEvent(f) {
  const now = performance.now(), E = f.a && (I && f.a === I.id ? S : ents.get(f.a));
  if (f.k === 'warn') { fxWarn(f); if (E) { E.atkT = now + 500; E.skill = true; } castWarning(f); return; }
  if (f.k === 'slam') { fxSlam(f); return; }
  if (f.k === 'phase') { if (typeof bossPhaseNotice === 'function') bossPhaseNotice(f); return; }
  if (f.k === 'fx') { if (E && I.classes[f.s]) { E.atkT = now; E.skill = true; faceAttackTarget(E, f, now); } fxSkill(f, E); return; }
  if (f.k === 'atk') { if (E) { E.atkT = now; E.skill = false; faceAttackTarget(E, f, now); } fxAttack(f, E); return; }
  if (f.k === 'die') { const t = I.types[f.v], c = hex(t ? t.c : '#cccccc'), big = t && (t.boss || f.b); burst(f.x, 18, f.y, big ? 70 : 22, c, 200, 1.1, 2.2, .25, 560); addRing(f.x, f.y, 4, big ? 80 : 40, big ? [1, .7, .3] : [.85, .85, .85], 500, 14, .2); sfx(big ? 'boss' : 'die', f.x, f.y); return; }
  if (f.k === 'hurt') {
    const A = f.a && ents.get(f.a); if (A) { A.atkT = now; A.skill = false; A.yaw = Math.atan2(f.x - A.rx, f.y - A.ry); fxClaw(f.x, f.y, A.yaw); }
    if (me && f.combatPlayerId === I.id) { S.flash = now; hurtFlash(f.v > me.mh * .15); cam.shake = document.body.classList.contains('reduce-motion') ? 0 : Math.min(7, 2 + f.v / Math.max(1, me.mh) * 40); sfx('hurt'); } else sfx('hurt', f.x, f.y);
    burst(f.x, 30, f.y, 6, [.9, .15, .1], 120, .5, 1.8, .3);
  }
  if (f.k === 'dmg') { burst(f.x, 24, f.y, f.c ? 12 : 5, f.c ? [1, .8, .2] : [1, 1, .9], f.c ? 190 : 110, .45, 1.7, .9); sfx(f.c ? 'crit' : 'hit', f.x, f.y); }
  if (f.k === 'gold') { burst(f.x, 20, f.y, 8, [1, .85, .2], 150, .7, 1.8, .9); sfx('coin', f.x, f.y); }
  if (f.k === 'loot') { burst(f.x, 20, f.y, 10 + (f.r || 0) * 5, RCV[f.r || 0], 160, .8, 1.7, .9); sfx('loot', f.x, f.y, f.r || 0); }
  if (f.k === 'souls') { burst(f.x, 20, f.y, 14, [.6, .35, 1], 140, .9, 1.8, 1, -80); sfx('heal', f.x, f.y); }
  if (f.k === 'heal' || f.k === 'mana') sfx('heal', f.x, f.y);
  if (I && f.pickupBy === I.id) log('*', f.text || f.v, 'loot');
  if (I && f.combatPlayerId === I.id) logCombatEvent(f);
  const style = f.k === 'dmg' && f.c ? 'critical' : FLOATER_STYLE[f.k];
  if (!style || floaters.length > 60) return;
  const isDamage = f.k === 'dmg' || f.k === 'hurt';
  // Shapes as well as colours: ✦ crit, − damage taken, + healing and mana. Other heroes' hits are smaller.
  let message = f.text || f.v;
  if (typeof f.v === 'number' && !f.text) {
    const n = GameText.number(Math.round(f.v));
    message = f.k === 'dmg' ? (f.c ? '✦ ' + n + '!' : n) : f.k === 'hurt' ? '−' + n : f.k === 'heal' || f.k === 'mana' ? '+' + n : message;
  } else if (f.k === 'heal' && typeof f.v === 'string') message = f.v + ' ♥';
  const mine = !I || !f.combatPlayerId || f.combatPlayerId === I.id;
  // Numbers that appear at the same spot at the same moment stack upwards instead of covering each other.
  let lift = 0;
  if (isDamage) for (const other of floaters) if (other.isDamage && now - other.t0 < 450 && Math.abs(other.x - f.x) < 50 && Math.abs(other.z - f.y) < 50) lift++;
  const el = document.createElement('div');
  el.className = 'ft' + (f.k === 'hurt' ? ' ft--hurt' : '') + (f.k === 'heal' || f.k === 'mana' ? ' ft--restore' : '') + (!mine && f.k === 'dmg' ? ' ft--other' : '');
  GameText.present(el, { message, style, color: f.k === 'loot' ? RC_CSS[f.r || 0] : f.k === 'souls' ? '#c9a0ff' : undefined });
  $('floaters').appendChild(el);
  floaters.push({
    el, isDamage, lift: Math.min(5, lift) * 18, x: f.x + (isDamage ? (Math.random() - .5) * 24 : 0), z: f.y,
    h: isDamage ? 38 : 56, t0: now, life: f.k === 'loot' || f.k === 'lvl' || f.k === 'souls' ? 1600 : 950,
  });
}

// ---------- networking ----------
const uiReceiver = StateDelta.createReceiver(channel => send({ t: 'uiSync', channel }));
function join() {
  if (ws && ws.readyState !== WebSocket.CLOSED) return;
  uiReceiver.reset();
  audio(); sfx('click'); GameText.present($('err'), { message: '' });
  const socket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws = socket;
  const request = { t: 'join', name: $('name').value, cls: sel, pw: $('pw').value, mobDeltas: true, meDeltas: true, stateDeltas: true, listDeltas: true, mobFieldDeltas: true, uiDeltas: true };
  socket.onopen = () => socket.send(JSON.stringify(request));
  socket.onmessage = e => {
    if (ws !== socket) return;
    const message = JSON.parse(e.data);
    onMsg(message);
    if (message.t === 'err' && !I) socket.close();
  };
  socket.onclose = () => {
    if (ws !== socket) return;
    ws = null;
    if (I) log('*', text("login.disconnected", "Disconnected from server. Refresh to reconnect."));
    else if (!$('err').textContent) $('err').textContent = text("login.failed", "Could not connect.");
  };
}
const mobRows = new Map();
let mobIds = [];
function updateMobSnapshot(message) {
  if (!message.mo && !message.md && !message.mi && !message.mf) return;
  const decode = a => ({ id: a[0], ty: I.tl[a[1]], x: a[2], y: a[3], hp: a[4], mh: a[5], l: a[6], al: a[7], phase: a[8] || 0, castType: a[9] || '', castStart: a[10] || 0, castEnd: a[11] || 0, recoverEnd: a[12] || 0, enrageAt: a[13] || 0 });
  if (message.mo) {
    mobRows.clear();
    mobIds = message.mo.map(row => row[0]);
  }
  for (const row of message.mo || message.md || []) mobRows.set(row[0], decode(row));
  for (const patch of message.mf || []) {
    const monster = mobRows.get(patch[0]); if (!monster) continue;
    const fields = ['ty', 'x', 'y', 'hp', 'mh', 'l', 'al', 'phase', 'castType', 'castStart', 'castEnd', 'recoverEnd', 'enrageAt']; let offset = 2;
    for (let bit = 0; bit < fields.length; bit++) if (patch[1] & (1 << bit)) {
      const value = patch[offset++]; monster[fields[bit]] = bit === 0 ? I.tl[value] : value;
    }
  }
  if (message.mi) {
    mobIds = message.mi;
    const visible = new Set(mobIds);
    for (const id of mobRows.keys()) if (!visible.has(id)) mobRows.delete(id);
  }
  mo = mobIds.map(id => mobRows.get(id));
}
const playerRows = new Map(), lootRows = new Map();
function applyEntityList(cache, message, fullKey, changedKey, removedKey) {
  if (Object.hasOwn(message, fullKey)) {
    cache.clear(); for (const row of message[fullKey]) cache.set(row.id, row);
  } else {
    for (const id of message[removedKey] || []) cache.delete(id);
    for (const row of message[changedKey] || []) cache.set(row.id, row);
  }
  return [...cache.values()];
}
function applyOwnSnapshot(current, message) {
  return { ...(message.sf ? {} : current), ...message.me };
}
function onMsg(m) {
  m = uiReceiver.receive(m); if (!m) return;
  if (m.t === 'err') GameText.present($('err'), { message: m.text || m.m });
  else if (m.t === 'init') {
    clearTimeout(onlineCountTimer);
    I = m; setWorld(m.world); S.id = m.id; cam.dist = 440; cam.pitch = 0.82; cam.yaw = 0; $('login').style.display = 'none'; if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); $('hud').style.display = 'block';
    hudInit(); log('*', m.resumed ? text("login.welcomeBack", "Welcome back, ") + m.name + '!' : text("login.welcome", "Welcome, ") + m.name + text("login.welcomeHint", "! Loot drops on the ground - walk over it. Talk to the Merchant and the Blacksmith in the village (click them or press F)."));
  } else if (m.t === 'inv') onInv(m);
  else if (m.t === 'destroyPreview' || m.t === 'destroyResult') onDestroyMessage(m);
  else if (m.t === 'autoAffixPreview' || m.t === 'autoAffixStatus') onAutoAffixMessage(m);
  else if (m.t === 'toast') toast(m.text || m.m, m.c); else if (m.t === 'forge') onForge(m); else if (m.t === 'reroll') onReroll(m); else if (m.t === 'universe') onUniverse(m.u); else if (m.t === 'portal') window.PortalUI?.receive(m);
  else if (m.t === 'team') onTeam(m); else if (m.t === 'trade') onTrade(m); else if (m.t === 'mythicMerge') onMythicMerge(m); else if (m.t === 'affix') onAffix(m);
  else if (m.t === 'teamInvite') showAsk('team', text('team.invitedYou', '{name} invites you to a team.', { name: m.from })); else if (m.t === 'tradeRequest') showAsk('trade', text('trade.requestedYou', '{name} wants to trade with you.', { name: m.from }));
  else if (m.t === 'affixCaps') { if (I) I.affixCaps = m.caps; }
  else if (m.t === 'adventure' || m.t === 'adventureUpdate') onAdventureMessage(m);
  else if (m.t === 'types') { if (I) { I.types = m.types; I.tl = m.tl; } } else if (m.t === 'map') { setWorld(m.world, m.arrived); if (isOpen('journalw')) send({ t: 'adventure', op: 'inspect' }); }
  else if (m.t === 'chat') log(m.n, m.text || m.m, m.channel); else if (m.t === 'msg') log('*', m.text || m.m);
  else if (m.t === 's') {
    const nextMe = applyOwnSnapshot(me, m);
    if (!me || snapNext) { snapNext = false; S.rx = nextMe.x; S.ry = nextMe.y; cam.x = nextMe.x; cam.z = nextMe.y; }
    if (nextMe.dead && !me?.dead) {
      intent = null;
      pendingNpc = null;
      held = false;
      lastDir = [0, 0];
    }
    serverTm = m.tm; serverReceivedAt = performance.now(); me = nextMe;
    if (m.sf) { playerRows.clear(); lootRows.clear(); }
    if (m.pl || m.pd || m.pr) pl = applyEntityList(playerRows, m, 'pl', 'pd', 'pr');
    if (m.lo || m.ld || m.lr) lo = applyEntityList(lootRows, m, 'lo', 'ld', 'lr');
    updateMobSnapshot(m);
    const seen = new Set();
    for (const o of mo.concat(pl)) {
      seen.add(o.id); let e = ents.get(o.id);
      if (!e) { e = { id: o.id, rx: o.x, ry: o.y, yaw: Math.random() * 6, ph: Math.random() * 6, mv: 0, atkT: -9999, flash: 0, hp: o.hp }; ents.set(o.id, e); }
      if (o.hp < e.hp) e.flash = performance.now(); e.hp = o.hp; e.x = o.x; e.y = o.y;
    }
    for (const k of ents.keys()) if (!seen.has(k)) ents.delete(k);
    for (const f of m.ev) onEvent(f);
    hud();
  }
}

// ---------- input ----------
const GFX = ['auto', 'low', 'medium', 'high'];
addEventListener('keydown', e => {
  if (!I || $('smith-auto-dialog').open) return; const ci = $('chatin');
  if (e.key === 'Enter' && e.target?.closest('#chat-tabs')) return;
  if (document.activeElement === ci) { if (e.key === 'Enter') { if (ci.value.trim()) send({ t: 'chat', m: ci.value }); ci.value = ''; ci.style.display = 'none'; ci.blur(); } else if (e.key === 'Escape') { ci.style.display = 'none'; ci.blur(); } return; }
  if (e.key === 'Escape') {
    e.preventDefault();
    if (e.repeat) return;
    // Close the topmost window, prompt or tooltip. Settings open with O or the gear button.
    uxEscape();
    return;
  }
  if (e.target && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
  const k = e.key.toLowerCase();
  if (k === 'enter') { ci.style.display = 'block'; ci.focus(); keys = {}; e.preventDefault(); return; }
  const act = actionOf(k);
  if (e.repeat && ['skills', 'inv', 'team', 'history', 'settings', 'mute', 'talk', 'gfx', 'fps'].includes(act)) return;
  if (act === 'attack') {
    if (e.target?.closest('button, select, input, textarea, [contenteditable]')) return;
    e.preventDefault();
    if (!e.repeat) attackNearby();
    return;
  }
  if (act === 'skill1' || act === 'skill2' || act === 'skill3') send({ t: 'skill', n: +act.slice(5) });
  if (act === 'hp' || act === 'mp' || act === 'hp2' || act === 'ret') send({ t: 'use', i: act });
  if (act === 'skills') togglePanel('skillp'); if (act === 'inv') togglePanel('invp'); if (act === 'history') togglePanel('chronw'); if (act === 'team') togglePanel('teamw'); if (act === 'settings') togglePanel('setw'); if (act === 'mute') toggleMute();
  if (act === 'talk' && nearNpcK) openNpc(nearNpcK);
  if (act === 'gfx') { const n = GFX[(GFX.indexOf(GL.Q.mode) + 1) % GFX.length]; GL.setQuality(n); toast(text('settings.qualityChanged', 'Graphics: {quality}', { quality: qualityName(n) })); }
  if (act === 'fps') { const p = $('perf'); p.style.display = p.style.display === 'block' ? 'none' : 'block'; }
  if ('wasd'.includes(k) && k.length === 1 || k.startsWith('arrow')) { keys[k] = 1; e.preventDefault(); }
});
addEventListener('keyup', e => { delete keys[e.key.toLowerCase()]; });
addEventListener('blur', () => { keys = {}; held = false; rotating = false; });
const cv = $('c'); let rotating = false, lx = 0, ly = 0, lastDir = [0, 0], lastSend = 0;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => { cam.dist = Math.max(160, Math.min(950, cam.dist * (e.deltaY > 0 ? 1.08 : 0.92))); e.preventDefault(); }, { passive: false });
cv.addEventListener('mousedown', e => { if (e.button === 2 || e.button === 1) { rotating = true; lx = e.clientX; ly = e.clientY; } else if (me && !me.dead) { held = true; lastHold = e; click(e); } });
addEventListener('mouseup', () => { rotating = false; held = false; });
addEventListener('mousemove', e => { if (rotating) { cam.yaw -= (e.clientX - lx) * 0.006; cam.pitch = Math.max(0.28, Math.min(1.38, cam.pitch + (e.clientY - ly) * 0.005)); lx = e.clientX; ly = e.clientY; } if (held) lastHold = e; });
function groundHit(e) { const r = GL.ray(e.clientX, e.clientY); if (r.d[1] >= -0.001) return null; const t = -r.o[1] / r.d[1]; return { x: r.o[0] + r.d[0] * t, z: r.o[2] + r.d[2] * t }; }
function raySphere(r, cx, cy, cz, rad) { const c = [cx - r.o[0], cy - r.o[1], cz - r.o[2]], tc = c[0] * r.d[0] + c[1] * r.d[1] + c[2] * r.d[2]; if (tc < 0) return -1; const d2 = c[0] * c[0] + c[1] * c[1] + c[2] * c[2] - tc * tc; return d2 < rad * rad ? tc : -1; }
function moveTo(x, y) { x = Math.max(20, Math.min(WORLD.W - 20, x)); y = Math.max(20, Math.min(WORLD.H - 20, y)); send({ t: 'move', x, y }); intent = { x, y }; }
function attackTarget(targetId, chase = true) {
  send({ t: 'target', id: targetId, chase });
  if (chase) {
    intent = null;
    pendingNpc = null;
    held = false;
  }
  sfx('click');
}

function attackNearby() {
  if (!me || me.dead) return;
  let nearest = null, nearestDistance = Infinity;
  for (const monster of mo) {
    if (monster.hp <= 0) continue;
    const radius = Math.round(I.types[monster.ty].r * (monster.al ? 1.3 : 1));
    const distance = Math.hypot(monster.x - me.x, monster.y - me.y);
    if (distance > me.rng + radius) continue;
    if (monster.id === me.tg) {
      attackTarget(monster.id, false);
      return;
    }
    if (distance < nearestDistance) {
      nearest = monster;
      nearestDistance = distance;
    }
  }
  if (nearest) attackTarget(nearest.id, false);
}

function click(e) {
  if (!I || !me || me.dead) return; const r = GL.ray(e.clientX, e.clientY); let best = null, bt = 1e9;
  for (const k in WORLD.npcs) { const n = WORLD.npcs[k], tc = raySphere(r, n.x, 32, n.y, 30); if (tc > 0 && tc < bt) { bt = tc; best = k; } }
  if (best) { held = false; if (npcDist(best) < WORLD.npcRange - 40) openNpc(best); else { const n = WORLD.npcs[best]; moveTo(n.x, n.y + 36); pendingNpc = best; } return; }
  for (const m of mo) { const E = ents.get(m.id); if (!E) continue; const t = I.types[m.ty], pr = t.r * (m.al ? 1.3 : 1) * 1.4 + 12, tc = raySphere(r, E.rx, pr * .9, E.ry, pr * 1.22); if (tc > 0 && tc < bt) { bt = tc; best = m; } }
  if (best) { attackTarget(best.id); return; }
  for (const L of lo) { const tc = raySphere(r, L.x, 10, L.y, 26); if (tc > 0 && tc < bt) { bt = tc; best = L; } }
  if (best) { moveTo(best.x, best.y); pendingNpc = null; held = false; addRing(best.x, best.y, 4, 22, [1, .9, .4], 500, 2); return; }
  const g = groundHit(e); if (g) { moveTo(g.x, g.z); pendingNpc = null; addRing(g.x, g.z, 4, 16, [1, .85, .3], 600, 2); }
}
setInterval(() => { if (held && lastHold && me && !me.dead) { const g = groundHit(lastHold); if (g) moveTo(g.x, g.z); } }, 130);
function wantDir() {
  const forward = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0);
  const sideways = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  if (!forward && !sideways) return [0, 0];
  const x = -Math.sin(cam.yaw) * forward + Math.cos(cam.yaw) * sideways;
  const z = -Math.cos(cam.yaw) * forward - Math.sin(cam.yaw) * sideways;
  const length = Math.hypot(x, z);
  return [x / length, z / length];
}

// is a world point (roughly) on screen? used to skip drawing monsters the camera cannot see
function onScreen(x, z, m) { const p = GL.project(x, 30, z); return p && p.x > -m && p.x < innerWidth + m && p.y > -m && p.y < innerHeight + m; }

// ---------- labels ----------
function monsterLevelLabel(level, playerLevel) {
  const difference = level - playerLevel;
  let threat = 'even';
  if (difference <= -5) threat = 'trivial';
  else if (difference <= 0) threat = 'easy';
  else if (difference >= 4) threat = 'dangerous';

  const threatNames = { trivial: 'Much lower level', easy: 'Same or lower level', even: 'Slightly higher level', dangerous: 'Higher level' };
  const title = text('mob.threat.' + threat, threatNames[threat]);
  return '<span class="mob-level mob-level--' + threat + '" title="' + esc(title) + '">' +
    esc(text('zone.levelShort', 'Lv ') + level) + '</span>';
}

function label(id, html, cls, x, y, z, hpv, wd, color) {
  let L = labels.get(id); if (!L) { const el = document.createElement('div'); el.className = 'lb ' + cls; el.innerHTML = '<div class="n"></div><div class="hb"><i></i></div>'; $('labels').appendChild(el); L = { el, n: el.firstChild, i: el.querySelector('i'), h: '', w: -1, wd: 0, vis: true }; labels.set(id, L); }
  L.used = true; const p = GL.project(x, y, z); if (!p || p.x < -100 || p.x > innerWidth + 100 || p.y < -40 || p.y > innerHeight + 40) { if (L.vis) { L.vis = false; L.el.style.display = 'none'; } return; }
  const w = wd || 90;
  if (!L.vis) { L.vis = true; L.el.style.display = 'block'; }
  const horizontalOffset = id === 'me' ? '-50%' : ((p.x - w / 2) | 0) + 'px';
  const transform = 'translate(' + horizontalOffset + ',' + ((p.y - 14) | 0) + 'px)';
  if (L.transform !== transform) { L.transform = transform; L.el.style.transform = transform; }
  if (L.wd !== w) { L.wd = w; L.el.style.width = w + 'px'; }
  const hh = html + '|' + (color || ''); if (L.h !== hh) { L.h = hh; L.n.innerHTML = html; if (color) L.el.style.color = color; }
  SharedResources.updateResourceBar(L.i.parentElement, hpv, 1, undefined, { step: 1, label: L.n.textContent });
}

// ---------- main loop ----------
let last = performance.now(), lastZone = -9, zoneCheck = 0, miniT = 0, perfT = 0;
const mini = $('mini').getContext('2d');
function animate(e, mx, my, d) { const sp = Math.hypot(mx, my) / Math.max(.001, d); e.moveSpeed = (e.moveSpeed || 0) + (sp - (e.moveSpeed || 0)) * Math.min(1, d * 14); e.mv += (Math.min(1, sp / 120) - e.mv) * Math.min(1, d * 14); if (Math.hypot(mx, my) > .12 && performance.now() >= (e.attackFacingUntil || 0)) { const ty = Math.atan2(mx, my); let a = ty - e.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); e.yaw += a * Math.min(1, d * 12); } e.ph += sp * d * 0.1; }
function smoothEnt(e, d) { const dx = e.x - e.rx, dy = e.y - e.ry; if (Math.hypot(dx, dy) > 400) { e.rx = e.x; e.ry = e.y; return; } const k = 1 - Math.pow(0.0005, d), mx = dx * k, my = dy * k; e.rx += mx; e.ry += my; animate(e, mx, my, d); }
function updateSelf(d) { // client-side prediction: our own hero reacts instantly, then eases toward the server position
  const ox = S.rx, oy = S.ry; let vx = 0, vz = 0;
  if (me.dead) intent = null;
  if (!me.dead) { const w = wantDir(); if (w[0] || w[1]) { vx = w[0] * me.spd; vz = w[1] * me.spd; intent = null; } else if (intent) { const dx = intent.x - S.rx, dz = intent.y - S.ry, l = Math.hypot(dx, dz); if (l > 8) { vx = dx / l * me.spd; vz = dz / l * me.spd; } else intent = null; } }
  const ex = me.x - S.rx, ez = me.y - S.ry;
  let authoritativeReset = Math.hypot(ex, ez) > 230;
  if (!authoritativeReset && WORLD.layout && Math.hypot(ex, ez) > 22 &&
      Settlement.isPositionValid(me, WORLD.layout, WORLD.CX, WORLD.CY, 11)) {
    const correction = { x: me.x, y: me.y };
    Settlement.moveWithCollision(correction, WORLD.layout, WORLD.CX, WORLD.CY, 11, { x: ox, y: oy });
    // A valid server baseline separated by solid geometry cannot be reached by
    // interpolating into that solid forever. This is reconciliation, not walking.
    if (Math.hypot(correction.x - me.x, correction.y - me.y) > 1e-5) {
      // Ordinary prediction around a corner may have a blocked straight chord
      // while a short, clear corner path exists. Keep smoothing in that case.
      const viaCorner = (x, y) => {
        const corner = { x, y };
        Settlement.moveWithCollision(corner, WORLD.layout, WORLD.CX, WORLD.CY, 11, { x: ox, y: oy });
        if (Math.hypot(corner.x - x, corner.y - y) > 1e-5) return false;
        const end = { x: me.x, y: me.y };
        Settlement.moveWithCollision(end, WORLD.layout, WORLD.CX, WORLD.CY, 11, corner);
        return Math.hypot(end.x - me.x, end.y - me.y) <= 1e-5;
      };
      authoritativeReset = !viaCorner(me.x, oy) && !viaCorner(ox, me.y);
    }
  }
  if (authoritativeReset) { S.rx = me.x; S.ry = me.y; }
  else if (vx || vz) { S.rx += vx * d; S.ry += vz * d; const k = Math.min(1, d * 2.2); S.rx += (me.x - S.rx) * k; S.ry += (me.y - S.ry) * k; }
  else { const k = 1 - Math.pow(0.00003, d); S.rx += ex * k; S.ry += ez * k; }
  S.rx = Math.max(20, Math.min(WORLD.W - 20, S.rx)); S.ry = Math.max(20, Math.min(WORLD.H - 20, S.ry));
  // Same collision as the server, so walking into a house or the wall does not rubber-band.
  if (WORLD.layout) {
    const e = { x: S.rx, y: S.ry };
    // An explicit server correction is a new baseline, not a predicted walk through scenery.
    const blocked = authoritativeReset
      ? Settlement.moveWithCollision(e, WORLD.layout, WORLD.CX, WORLD.CY, 11, { x: me.x, y: me.y })
      : Settlement.moveWithCollision(e, WORLD.layout, WORLD.CX, WORLD.CY, 11, { x: ox, y: oy });
    if (blocked) { S.rx = e.x; S.ry = e.y; }
  }
  animate(S, S.rx - ox, S.ry - oy, d);
}
let nextFrameAt = 0, wasHidden = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { keys = {}; held = false; rotating = false; lastDir = [0, 0]; send({ t: 'dir', x: 0, y: 0 }); }
  wasHidden = true;
});
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { wasHidden = true; return; }
  if (wasHidden) { last = now - 1000 / (GL.Q.fpsLimit || 60); nextFrameAt = now; wasHidden = false; }
  const interval = GL.Q.fpsLimit ? 1000 / GL.Q.fpsLimit : 0;
  if (interval && now + .5 < nextFrameAt) return;
  if (interval) nextFrameAt = Math.max(nextFrameAt + interval, now);
  else nextFrameAt = now;
  const raw = now - last; dt = Math.min(0.05, raw / 1000); last = now; GL.perf(raw);
  if (me && !me.dead) {
    if (keys.arrowleft) cam.yaw += dt * 1.8; if (keys.arrowright) cam.yaw -= dt * 1.8;
    const d = wantDir(), ch = Math.abs(d[0] - lastDir[0]) + Math.abs(d[1] - lastDir[1]) > 0.06, zero = !d[0] && !d[1];
    if (ch && (now - lastSend > 55 || zero)) { send({ t: 'dir', x: d[0], y: d[1] }); lastDir = d; lastSend = now; }
  }
  if (me) { const mdt = Math.min(0.25, raw / 1000); updateSelf(mdt); for (const e of ents.values()) smoothEnt(e, mdt); cam.x += (S.rx - cam.x) * Math.min(1, dt * 12); cam.z += (S.ry - cam.z) * Math.min(1, dt * 12); }
  else { cam.yaw = now / 16000; cam.x = WORLD.CX; cam.z = WORLD.CY; cam.dist = 560; cam.pitch = 0.42; }
  cam.shake *= Math.pow(0.002, dt); const sk = cam.shake * (Math.random() - .5);
  const cp = Math.cos(cam.pitch), eye = [cam.x + Math.sin(cam.yaw) * cp * cam.dist + sk, Math.sin(cam.pitch) * cam.dist + 20 + sk, cam.z + Math.cos(cam.yaw) * cp * cam.dist];
  GL.begin(); GL.setSky((((serverTm || Date.now()) / 1000) % 720) / 720 + 0.08); GL.setCamera(eye, [cam.x, 30, cam.z]);
  for (const L of labels.values()) L.used = false;
  drawWorld(now);
  if (me) {
    const blob = !GL.shadowsOn();
    for (const L of lo) if (onScreen(L.x, L.y, 120)) drawLoot(L, now);
    const vis = [];
    for (const m of mo) { const e = ents.get(m.id); if (!e) continue; const t = I.types[m.ty], hd = Math.hypot(e.rx - cam.x, e.ry - cam.z); if (hd > 1250 || !onScreen(e.rx, e.ry, 160 + t.r * 5)) continue; vis.push([hd, m, e, t]); }
    vis.sort((a, b) => a[0] - b[0]); let nl = 0, nChar = 0; const full = GL.Q.mode === 'low' ? 60 : GL.Q.scale < .8 ? 85 : 130;
    for (let i = 0; i < vis.length; i++) {
      const [hd, m, e, t] = vis[i]; let o = modelFor(m.ty, t); if (m.al && !t.st) o = o._a || (o._a = Object.assign({}, o, { sc: (o.sc || 1) * 1.3 }));
      if (m.id === me.tg) { const pu = 1 + Math.sin(now / 150) * .1, rr = (t.r * (m.al ? 1.3 : 1) + 12) * pu; D(M.ring, e.rx, 2.5, e.ry, rr, 1, rr, now / 600, 0, [1, .2, .2], 1, .95); }
      if (m.al) { const rr = t.r * 1.3 + 14 + Math.sin(now / 200 + m.id) * 3; D(M.ring, e.rx, 2, e.ry, rr, 1, rr, -now / 700, 0, [1, .55, .1], 1, .7); }
      const mc = MOBCHAR[m.ty] || (t.as && MOBCHAR[t.as]); if (t.st) stoneModel(e, t); else if (mc && CHARS[mc.m] && nChar < 26 && hd < 750) { nChar++; const gr = mc.gear && !t.wb && !t.boss ? gearFor(CHARS[mc.m], mc.gear, m.id, m.al) : null; drawChar(e, mc.m, { h: 64 * mc.sc * (m.al ? 1.3 : 1) * (t.wb ? 1.5 : 1), tint: gr ? gr.body : mc.tint, emc: mc.emc, gear: gr }, now); } else if (i < full || hd < 420) { if (blob) D(M.disc, e.rx, 1, e.ry, t.r * 1.1, 1, t.r * 1.1, 0, 0, [0, 0, 0], 0, .3); o.fn(e, o); } else lod(e, t, o, m.al);
      if ((hd < 620 && nl < 45) || m.id === me.tg || ((t.boss || m.al || t.st) && hd < 1100)) {
        nl++;
        const nameColor = t.st ? t.c : t.boss ? '#ffd24a' : m.al ? '#ffb04a' : '#fff';
        label('m' + m.id, '<span style="color:' + nameColor + '">' + (t.wb ? '👑 ' : t.boss ? '★ ' : m.al ? esc(text("mob.alpha", "Alpha ")) : '') + esc(mobName(m.ty, t.n)) + '</span> ' + monsterLevelLabel(m.l, me.l), t.boss ? 'mob boss' : m.al ? 'mob alpha' : 'mob', e.rx, Math.min(260, (o.top || 56) * (o.sc || 1)) + 16, e.ry, m.hp / m.mh, t.boss ? 150 : m.al ? 130 : 110);
      }
    }
    for (const o of pl) { const e = ents.get(o.id); if (!onScreen(e.rx, e.ry, 160)) continue; drawPlayer(e, o.c, o.w, o.d, o.rg); label('p' + o.id, esc(o.n) + ' <span style="color:#aaa">' + esc(text("zone.levelShort", "Lv ")) + o.l + '</span>', 'pl', e.rx, 92, e.ry, o.hp / o.mh, 120); }
    drawPlayer(S, I.cls, me.w, me.dead, me.buf.rage);
    const heroNameplate = '<span class="hero-name">' + esc(I.name) + '</span><span class="hero-level">' +
      esc(text('zone.levelShort', 'Lv ') + me.l) + '</span>';
    label('me', heroNameplate, 'pl me', S.rx, 92, S.ry, me.hp / me.mh, 120);
    if (intent) D(M.ring, intent.x, 1.6, intent.y, 9, 1, 9, now / 300, 0, [1, .85, .3], 1, .5);
    if (now - zoneCheck > 400) { zoneCheck = now; const z = zoneOf(S.rx, S.ry); if (z !== lastZone) { if (lastZone !== -9) banner(zoneName(z < 0 ? 'Dawnhearth' : ZT[z].name), z < 0 ? text("zone.safe", "Safe zone") : text("zone.levels", "Levels ") + ZT[z].lv[0] + ' - ' + ZT[z].lv[1] + (ZT[z].outer ? text("zone.danger", " · enter at your own risk") : ''), z >= 0 && ZT[z].outer); lastZone = z; } }
    nearNpcK = null; let nd = WORLD.npcRange - 30; for (const k in WORLD.npcs) { const d = npcDist(k); if (d < nd) { nd = d; nearNpcK = k; } }
    if (pendingNpc && npcDist(pendingNpc) < WORLD.npcRange - 40) { openNpc(pendingNpc); pendingNpc = null; }
    for (const k in NPCWIN) if (WORLD.npcs[k] && isOpen(NPCWIN[k]) && npcDist(k) > WORLD.npcRange + 60) closeWin(NPCWIN[k]);
    const pr = nearNpcK && !isOpen(NPCWIN[nearNpcK]) ? '<b>' + esc(keyName(BINDS.talk)) + '</b>' + esc(text('prompt.' + nearNpcK, { merchant: 'Talk to the Merchant', smith: 'Talk to the Blacksmith', mystic: 'Talk to the Soul Mystic', portal: 'Use the World Portal', camp: 'Build the encampment' }[nearNpcK])) : '';
    if (pr !== _hc.prompt) { _hc.prompt = pr; $('prompt').innerHTML = pr; $('prompt').style.display = pr ? 'block' : 'none'; }
  }
  for (const [k, L] of labels) if (!L.used) { L.el.remove(); labels.delete(k); }
  drawFx(now); updateFloaters(now); GL.render();
  if (now - miniT > 180) { miniT = now; drawMini(); }
  if (now - perfT > 500) { perfT = now; const p = $('perf'); if (p.style.display === 'block') p.textContent = text('performance.summary', '{fps} FPS · {quality} · res {resolution}% · shadows {shadows} · {draws} draws / {parts} parts · {plants} plants', {
    fps: GL.Q.fps, quality: qualityName(GL.Q.mode), resolution: Math.round(GL.Q.scale * GL.Q.resolution * 100),
    shadows: GL.shadowsOn() ? text('common.on', 'on') : text('common.off', 'off'),
    draws: GL.Q.draws, parts: GL.Q.inst, plants: decorStats,
  }); }
}
function drawFx(now) {
  for (let i = fxs.length - 1; i >= 0; i--) {
    const f = fxs[i], a = (now - f.t0) / f.dur; if (a >= 1) { fxs.splice(i, 1); continue; }
    if (drawFx2(f, a, now)) continue;
    if (f.k === 'ring') { const r = f.r0 + (f.r1 - f.r0) * Math.min(1, a * 1.4); D(M.ring, f.x, f.y, f.z, r, 1, r, 0, 0, f.col, f.emis, (1 - a) * .9); }
    else if (f.k === 'tele') { D(M.disc, f.x, 1.6, f.z, f.r * a, 1, f.r * a, 0, 0, [1, .12, .08], .8, .22 + .25 * a); D(M.ring, f.x, 1.9, f.z, f.r, 1, f.r, now / 300, 0, [1, .2, .1], 1, .5 + .4 * Math.sin(now / 60)); }
    else { const x = f.x + (f.x1 - f.x) * a, z = f.z + (f.z1 - f.z) * a, y = f.h + Math.sin(a * 3.14) * 12; D(M.ball, x, y, z, 3.6, 3.6, 3.6, 0, 0, f.col, 1); D(M.ball, x - (f.x1 - f.x) * .04, y, z - (f.z1 - f.z) * .04, 2.6, 2.6, 2.6, 0, 0, f.col, 1, .5); }
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i], a = (now - p.t0) / 1000 / p.life; if (a >= 1) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
    p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < 1) { p.y = 1; p.vy *= -.3; p.vx *= .7; p.vz *= .7; }
    const s = p.size * (1 - a * .5); D(M.octa, p.x, p.y, p.z, s, s, s, a * 6, a * 4, p.col, p.emis, 1 - a * a);
  }
}
function updateFloaters(now) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i], a = (now - f.t0) / f.life; if (a >= 1) { f.el.remove(); floaters.splice(i, 1); continue; }
    const p = GL.project(f.x, f.h + a * (document.body.classList.contains('reduce-motion') ? 10 : 40), f.z); if (!p) { f.el.style.display = 'none'; continue; }
    f.el.style.display = 'block';
    f.el.style.opacity = a < .7 ? 1 : 1 - (a - .7) / .3;
    const x = (p.x - (f.isDamage ? 0 : 20)) | 0;
    f.el.style.transform = 'translate(' + x + 'px,' + ((p.y - 10 - (f.lift || 0)) | 0) + 'px)' + (f.isDamage ? ' translateX(-50%)' : '');
  }
}
function drawMini() {
  if (!me) return;
  const g = mini, N = g.canvas.width, c = N / 2, scale = N / 2400;
  const px = x => c + (x - S.rx) * scale, py = y => c + (y - S.ry) * scale;
  g.clearRect(0, 0, N, N); g.save();
  g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.clip();
  g.fillStyle = ZCOL[Math.min(6, lookIndex(ZT.length - 1))] || '#444'; g.fillRect(0, 0, N, N);
  for (let i = ZT.length - 1; i >= 0; i--) {
    if (ZT[i].outer || ZT[i].generated) continue;
    g.fillStyle = ZCOL[lookIndex(i)] || '#444'; g.beginPath(); g.arc(px(WORLD.CX), py(WORLD.CY), ZT[i].max * scale, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#9a8a66'; g.beginPath(); g.arc(px(WORLD.CX), py(WORLD.CY), WORLD.V * scale, 0, Math.PI * 2); g.fill();
  function dot(x, y, color, radius) { g.fillStyle = color; g.beginPath(); g.arc(px(x), py(y), radius, 0, Math.PI * 2); g.fill(); }
  // Important markers get their own shape and a dark outline, so they read without relying on colour (see the map legend).
  function mark(x, y, shape, color, r) {
    const X = px(x), Y = py(y); g.fillStyle = color; g.strokeStyle = '#120d08'; g.lineWidth = 1.5; g.beginPath();
    if (shape === 'diamond') { g.moveTo(X, Y - r); g.lineTo(X + r, Y); g.lineTo(X, Y + r); g.lineTo(X - r, Y); g.closePath(); }
    else if (shape === 'square') g.rect(X - r * .8, Y - r * .8, r * 1.6, r * 1.6);
    else if (shape === 'triangle') { g.moveTo(X, Y - r); g.lineTo(X + r, Y + r * .8); g.lineTo(X - r, Y + r * .8); g.closePath(); }
    else g.arc(X, Y, r, 0, Math.PI * 2);
    if (shape === 'ring') { g.lineWidth = 3; g.strokeStyle = color; g.stroke(); g.lineWidth = 1; g.strokeStyle = '#120d08'; g.stroke(); return; }
    g.fill(); g.stroke();
  }
  for (const monster of mo) {
    const type = I.types[monster.ty]; if (!type) continue;
    if (type.boss) mark(monster.x, monster.y, 'diamond', type.wb ? '#ffd24a' : '#ff4949', type.wb ? 7 : 5.5); else if (type.st) mark(monster.x, monster.y, 'square', '#cf9aff', 4); else if (monster.al) mark(monster.x, monster.y, 'triangle', '#ffac42', 3.5); else dot(monster.x, monster.y, '#d6c69c', 2);
  }
  for (const drop of lo) if (drop.k === 'gear' && drop.r >= 2) dot(drop.x, drop.y, '#ffd24a', 2);
  for (const other of pl) mark(other.x, other.y, 'circle', '#55cfff', 3.5);
  for (const [key, npc] of Object.entries(WORLD.npcs)) mark(npc.x, npc.y, key === 'portal' ? 'ring' : 'circle', key === 'portal' ? '#ba85ff' : '#ffe292', key === 'portal' ? 5 : 3);
  g.save(); g.translate(c, c); g.rotate(-S.yaw + Math.PI); g.fillStyle = '#fff'; g.strokeStyle = '#211a12'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 4); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke(); g.restore();
  g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff0bd'; g.fillText('N', c, 20);
  g.restore();
  const z = zoneOf(S.rx, S.ry); setT('zname', zoneName(z < 0 ? 'Dawnhearth' : ZT[z].name)); setT('zinfo', (z < 0 ? text("zone.safe", "Safe zone") : text("zone.levelShort", "Lv ") + ZT[z].lv[0] + '-' + ZT[z].lv[1]) + ' · ' + Math.round(S.rx) + ', ' + Math.round(S.ry)); $('zname').style.color = z >= 0 && ZT[z].outer ? '#ff5a4a' : '';
}

// ---------- boot ----------
function loadScript(src) { return new Promise(r => { const s = document.createElement('script'); s.src = src; s.onload = s.onerror = () => r(); document.body.appendChild(s); }); }
function renderLoginClasses(classes) {
  $('cls').innerHTML = Object.keys(classes).map(id => {
    const characterClass = classes[id];
    return '<button data-c="' + esc(id) + '" class="' + (id === sel ? 'on' : '') + '"><i style="background:' +
      (characterClass.color || '#ccc') + '"></i>' + esc(className(id, characterClass.name)) +
      '<small>' + esc(text('class.' + id + '.description', characterClass.desc || '')) + '</small></button>';
  }).join('');
  document.querySelectorAll('#cls button').forEach(button => button.onclick = () => {
    sel = button.dataset.c;
    document.querySelectorAll('#cls button').forEach(option => option.classList.toggle('on', option === button));
  });
}

const ONLINE_COUNT_REFRESH_MS = 10000;
let onlineCountTimer, displayedOnlineCount;

function showOnlineCount(count) {
  const counter = $('online-count');
  counter.hidden = !Number.isInteger(count) || count < 0;
  if (counter.hidden || displayedOnlineCount === count) return;
  displayedOnlineCount = count;
  GameText.present(counter, { message: { key: 'login.onlineCount', fallback: 'Online players: {count}', values: { count } } });
}

// Public link from the host's Cloudflare tunnel, with one-click copy.
let inviteLink = '';
function showInvite(link) {
  inviteLink = typeof link === 'string' ? link : '';
  $('invite').hidden = !inviteLink; $('invite-link').textContent = inviteLink;
}
async function copyInvite() {
  if (!inviteLink) return;
  let copied = false;
  try { await navigator.clipboard.writeText(inviteLink); copied = true; } catch {
    const field = document.createElement('textarea'); field.value = inviteLink; field.style.position = 'fixed'; field.style.opacity = '0'; document.body.appendChild(field); field.select();
    try { copied = document.execCommand('copy'); } catch {} field.remove();
  }
  const status = $('invite-status');
  status.textContent = copied ? text('login.copied', 'Copied!') : text('login.copyFailed', 'Select the link and copy it');
  clearTimeout(copyInvite.timer); copyInvite.timer = setTimeout(() => { status.textContent = ''; }, 2500);
}
$('invite-copy').addEventListener('click', copyInvite);
async function refreshOnlineCount() {
  if (I) return;
  try {
    const response = await fetch('/api/info', { cache: 'no-store' });
    const info = response.ok ? await response.json() : {};
    if (!I) { showOnlineCount(info.online); showInvite(info.invite); }
  } catch {
    if (!I) showOnlineCount();
  }
  if (!I) onlineCountTimer = setTimeout(refreshOnlineCount, ONLINE_COUNT_REFRESH_MS);
}

async function boot() {
  GameText.init();
  let info; try { info = await (await fetch('/api/info')).json(); } catch (e) { $('srv').textContent = text("login.unreachable", "Server not reachable."); return; }
  WORLD = info.world; ZT = WORLD.tiers; showUniverseLine(); $('srv').textContent = text('login.server', '{server} · private server', { server: info.serverName });
  showOnlineCount(info.online); showInvite(info.invite);
  onlineCountTimer = setTimeout(refreshOnlineCount, ONLINE_COUNT_REFRESH_MS);
  sel = Object.keys(info.classes)[0];
  renderLoginClasses(info.classes);
  document.addEventListener('game-language-change', () => {
    renderLoginClasses(info.classes);
    $('srv').textContent = text('login.server', '{server} · private server', { server: info.serverName });
  });
  $('go').onclick = join; $('name').onkeydown = $('pw').onkeydown = e => { if (e.key === 'Enter') join(); };
  $('srv').textContent = text('login.loadingWorld', '{server} · loading world…', { server: info.serverName }); await loadNature(); bakeWorld(); buildGround(); $('srv').textContent = text('login.server', '{server} · private server', { server: info.serverName }); loadChars();
  for (const s of info.scripts) await loadScript('plugins/' + s);
  requestAnimationFrame(frame);
}
boot();
