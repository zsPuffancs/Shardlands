'use strict';
// Runs the client's vegetation bake (public/world.js bakeDecor, and public/vegetation.js when present) headlessly,
// for the founding map or a generated region, and measures what it places.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '../..');
const { TIERS } = require(path.join(ROOT, 'monsters'));
const Settlement = require(path.join(ROOT, 'public/settlement'));

let NAT = null;
function natDims() {
  if (NAT) return NAT;
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/nature.json'), 'utf8')); NAT = {};
  for (const [n, m] of Object.entries(j.models)) NAT[n] = { parts: m.parts.map(() => ({ mesh: { id: n }, col: [1, 1, 1] })), h: m.max[1] - m.min[1], w: Math.max(m.max[0] - m.min[0], m.max[2] - m.min[2]), minY: m.min[1],
    radius: Math.hypot(Math.max(Math.abs(m.min[0]), Math.abs(m.max[0])), Math.max(Math.abs(m.min[2]), Math.abs(m.max[2]))) };
  return NAT;
}
// the shared part of world.js (nature pack and decor), with world.js's own code
function loadWorld(files) {
  const placed = [], far = [];
  const ctx = { console, Math, Map, Set, Array, Float32Array, Uint32Array, Object, JSON, Number, performance: { now: () => Number(process.hrtime.bigint()) / 1e6 }, window: {}, fetch: null,
    GL: { CH: 625, STRIDE: 17, instWrite() {}, bakeAdd: (...a) => far.push(a) }, M: { trunk: 'trunk', cone6: 'cone6' } };
  ctx.self = ctx;
  vm.createContext(ctx);
  const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (files.vegetation !== false && fs.existsSync(path.join(ROOT, 'public/vegetation.js'))) vm.runInContext(src('public/vegetation.js'), ctx);
  vm.runInContext(src('public/world.js').split('\n// ---------------- characters')[0] + '\nthis.__bake = bakeDecor; this.__setNat = v => { NAT = v; };', ctx);
  vm.runInContext('const __np = natPlace; natPlace = function (n, x, z, s, y, t, c, b) { __hook(n, x, z, s, y, t, c, b); return __np(n, x, z, s, y, t, c, b); }', Object.assign(ctx, { __hook: (name, x, z, size, yaw, tint, cat) => placed.push({ name, x, z, size, yaw, cat }) }));
  ctx.__setNat(natDims());
  return { ctx, placed, far };
}

// map: { kind: 'founding' } or { kind: 'region', look, size }
function bake(map = { kind: 'founding' }, seedNumber = 1337, mapIndex = 0, files = {}) {
  const { ctx, placed, far } = loadWorld(files);
  const founding = map.kind === 'founding', W = founding ? 10600 : (map.size || 5000), H = W, CX = W / 2, CY = H / 2;
  const V = Settlement.layout('village', 'timber', {}, 'grand').safe;
  const tiers = founding ? TIERS : [{ name: 'Region', min: 400, max: 99999, look: map.look }];
  const look = i => i < 0 ? i : (tiers[i].look === undefined ? i : tiers[i].look);
  const zoneOf = (x, z) => { const d = Math.hypot(x - CX, z - CY); if (d < V) return -1; for (let i = 0; i < tiers.length; i++) if (d < tiers[i].max) return look(i); return look(tiers.length - 1); };
  const roadEnd = tiers[Math.max(0, tiers.length - 2)].max;
  const onRoad = (x, z, w) => [0, 1, 2, 3].some(k => { const a = k * 1.5708, px = Math.cos(a), pz = Math.sin(a), t = (x - CX) * px + (z - CY) * pz, dd = Math.abs((x - CX) * -pz + (z - CY) * px); return t > 0 && t < roadEnd && dd < (w || 46); });
  ctx.WORLD = { W, H, CX, CY, V, map: mapIndex, settlement: { kind: 'village' }, universe: { seedNumber } };
  let seed = seedNumber + mapIndex * 7919; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const t0 = process.hrtime.bigint(); ctx.__bake(onRoad, zoneOf, R); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { placed, far, ms, W, H, CX, CY, V, zoneOf, onRoad, seedAfter: seed };
}

// statistics of big trees, mid pieces and ground cover per look
function stats(run, look) {
  const { placed, W, H, zoneOf, onRoad } = run, inZone = p => zoneOf(p.x, p.z) === look;
  let cells = 0, tot = 0; for (let x = 25; x < W; x += 50) for (let y = 25; y < H; y += 50) { tot++; if (zoneOf(x, y) === look) cells++; }
  const km2 = cells / tot * W * H / 1e6; if (!cells) return null;
  const T = placed.filter(p => p.cat === 0 && inZone(p)), mid = placed.filter(p => p.cat === 1 && inZone(p)).length, small = placed.filter(p => p.cat === 2 && inZone(p)).length;
  const g = new Map(), key = (x, y) => Math.floor(x / 200) + ',' + Math.floor(y / 200); for (const p of T) { const k = key(p.x, p.z); (g.get(k) || g.set(k, []).get(k)).push(p); }
  const near = (x, y, r, skip) => { let best = 1e9; const kx = Math.floor(x / 200), ky = Math.floor(y / 200); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of g.get((kx + a) + ',' + (ky + b)) || []) if (q !== skip) best = Math.min(best, Math.hypot(x - q.x, y - q.z)); return best; };
  let nn = 0, close = 0, minNN = 1e9; for (const p of T) { const d = near(p.x, p.z, 200, p); nn += Math.min(d, 400); minNN = Math.min(minNN, d); if (d < 60) close++; }
  let open = 0, openN = 0, big = 0; for (let x = 25; x < W; x += 50) for (let y = 25; y < H; y += 50) { if (zoneOf(x, y) !== look || onRoad(x, y, 46)) continue; openN++; const d = near(x, y); if (d >= 150) open++; if (d >= 250) big++; }
  return { km2: +km2.toFixed(2), trees: T.length, perKm2: +(T.length / km2).toFixed(1), mid, small, nnMean: Math.round(nn / Math.max(1, T.length)), nnMin: Math.round(minNN), closeShare: +(close / Math.max(1, T.length)).toFixed(2),
    open150: +(open / openN).toFixed(2), open250: +(big / openN).toFixed(2), models: new Set(T.map(p => p.name.replace(/_\d+$/, ''))).size };
}

module.exports = { bake, stats, natDims, TIERS };
