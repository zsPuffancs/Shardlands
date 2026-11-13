'use strict';
// Boss forge: a small procedural sculpting pipeline for Shardlands World Bosses.
// Signed-distance sculpt (smooth-blended anatomical shapes + thousands of detail shapes) -> surface-nets mesh with
// SDF normals -> per-vertex albedo, material and emissive -> skin weights from the shapes' bones -> glTF/GLB with
// skeleton and animation clips. Deterministic (seeded), no external dependencies.

// ---------------- math / noise ----------------
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const v3 = (x, y, z) => [x, y, z];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function hash3(x, y, z, s) { let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function noise3(x, y, z, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const c = (a, b, d) => hash3(xi + a, yi + b, zi + d, s);
  return lerp(lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v), lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
const fbm = (p, f, o = 3, s = 0) => { let a = 0, amp = 1, t = 0; for (let i = 0; i < o; i++) { a += noise3(p[0] * f, p[1] * f, p[2] * f, s + i) * amp; t += amp; amp *= .5; f *= 2.03; } return a / t; };

// ---------------- shapes ----------------
// Every shape: { kind, ..., bone, tag, k (blend radius), op: 'add' | 'sub' | 'inter' }. dist(p) returns signed distance.
function roundCone(a, b, r1, r2) { // capsule with linearly varying radius; also returns the parameter t along a->b
  const ba = sub(b, a), l2 = dot(ba, ba), rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  return { kind: 'rcone', a, b, r1, r2, ba, l2, rr, a2, il2, bb: bbox([a, b], Math.max(r1, r2)) };
}
function distRoundCone(s, p) { // Inigo Quilez, exact round cone
  const pa = sub(p, s.a), y = dot(pa, s.ba), z = y - s.l2, x2v = sub(mul(pa, s.l2), mul(s.ba, y)), x2 = dot(x2v, x2v), y2 = y * y * s.l2, z2 = z * z * s.l2;
  const k = Math.sign(s.rr) * s.rr * s.rr * x2;
  if (Math.sign(z) * s.a2 * z2 > k) return Math.sqrt(x2 + z2) * s.il2 - s.r2;
  if (Math.sign(y) * s.a2 * y2 < k) return Math.sqrt(x2 + y2) * s.il2 - s.r1;
  return (Math.sqrt(x2 * s.a2 * s.il2) + y * s.rr) * s.il2 - s.r1;
}
function ellipsoid(c, r, rot) { // rot: optional 3x3 (rows) world->local
  return { kind: 'ell', c, r, rot, bb: bbox([c], Math.max(r[0], r[1], r[2])) };
}
function distEllipsoid(s, p) {
  let q = sub(p, s.c); if (s.rot) q = [dot(s.rot[0], q), dot(s.rot[1], q), dot(s.rot[2], q)];
  const k0 = len([q[0] / s.r[0], q[1] / s.r[1], q[2] / s.r[2]]), k1 = len([q[0] / (s.r[0] * s.r[0]), q[1] / (s.r[1] * s.r[1]), q[2] / (s.r[2] * s.r[2])]);
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(s.r[0], s.r[1], s.r[2]);
}
function box(c, h, rot, round = 0) { return { kind: 'box', c, h, rot, round, bb: bbox([c], Math.hypot(h[0], h[1], h[2]) + round) }; }
function distBox(s, p) {
  let q = sub(p, s.c); if (s.rot) q = [dot(s.rot[0], q), dot(s.rot[1], q), dot(s.rot[2], q)];
  const d = [Math.abs(q[0]) - s.h[0], Math.abs(q[1]) - s.h[1], Math.abs(q[2]) - s.h[2]];
  return len([Math.max(d[0], 0), Math.max(d[1], 0), Math.max(d[2], 0)]) + Math.min(Math.max(d[0], d[1], d[2]), 0) - s.round;
}
function torus(c, R, r, rot) { return { kind: 'torus', c, R, r, rot, bb: bbox([c], R + r) }; }
function distTorus(s, p) { let q = sub(p, s.c); if (s.rot) q = [dot(s.rot[0], q), dot(s.rot[1], q), dot(s.rot[2], q)]; const x = Math.hypot(q[0], q[2]) - s.R; return Math.hypot(x, q[1]) - s.r; }
function bbox(pts, r) { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const p of pts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i] - r); hi[i] = Math.max(hi[i], p[i] + r); } return [lo, hi]; }
// a shape scaled by k about a pivot (exact: distances scale with it)
function scaled(inner, pivot, k) { const lo = inner.bb[0].map((v, i) => pivot[i] + (v - pivot[i]) * k), hi = inner.bb[1].map((v, i) => pivot[i] + (v - pivot[i]) * k); return { kind: 'scaled', inner, pivot, sk: k, bb: [lo, hi] }; }
function dist(s, p) { switch (s.kind) { case 'scaled': return s.sk * dist(s.inner, [s.pivot[0] + (p[0] - s.pivot[0]) / s.sk, s.pivot[1] + (p[1] - s.pivot[1]) / s.sk, s.pivot[2] + (p[2] - s.pivot[2]) / s.sk]); case 'rcone': return distRoundCone(s, p); case 'ell': return distEllipsoid(s, p); case 'box': return distBox(s, p); case 'torus': return distTorus(s, p); } return 1e9; }
// rotation that maps world direction 'fwd' to local +z and 'up' to local +y (rows = local axes in world)
function frame(fwd, up = [0, 1, 0]) { const z = norm(fwd), x = norm(cross(up, z)), y = cross(z, x); return [x, y, z]; }
const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = clamp(.5 + .5 * (b - a) / k, 0, 1); return lerp(b, a, h) - k * h * (1 - h); };
const smax = (a, b, k) => -smin(-a, -b, k);

// ---------------- sculpt ----------------
class Sculpt {
  constructor() { this.shapes = []; }
  add(shape, o) { this.shapes.push(Object.assign(shape, { op: 'add', k: 1.5, tag: 'body', bone: 0 }, o)); return shape; }
  sub(shape, o) { this.shapes.push(Object.assign(shape, { op: 'sub', k: .6, tag: 'cut', bone: 0 }, o)); return shape; }
  // acceleration grid: shapes bucketed by expanded bbox
  build(cell = 6) {
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const s of this.shapes) { s.ex = s.k * 2 + .5; for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], s.bb[0][i] - s.ex); hi[i] = Math.max(hi[i], s.bb[1][i] + s.ex); } }
    this.lo = lo; this.hi = hi; this.cell = cell; this.n = [0, 1, 2].map(i => Math.max(1, Math.ceil((hi[i] - lo[i]) / cell)));
    this.grid = new Array(this.n[0] * this.n[1] * this.n[2]); for (let i = 0; i < this.grid.length; i++) this.grid[i] = [];
    this.shapes.forEach((s, si) => { const a = [0, 1, 2].map(i => clamp(Math.floor((s.bb[0][i] - s.ex - lo[i]) / cell), 0, this.n[i] - 1)), b = [0, 1, 2].map(i => clamp(Math.floor((s.bb[1][i] + s.ex - lo[i]) / cell), 0, this.n[i] - 1));
      for (let x = a[0]; x <= b[0]; x++) for (let y = a[1]; y <= b[1]; y++) for (let z = a[2]; z <= b[2]; z++) this.grid[(x * this.n[1] + y) * this.n[2] + z].push(si); });
    return this;
  }
  cellOf(p) { const i = [0, 1, 2].map(k => Math.floor((p[k] - this.lo[k]) / this.cell)); if (i[0] < 0 || i[1] < 0 || i[2] < 0 || i[0] >= this.n[0] || i[1] >= this.n[1] || i[2] >= this.n[2]) return null; return this.grid[(i[0] * this.n[1] + i[1]) * this.n[2] + i[2]]; }
  eval(p) {
    const list = this.cellOf(p); if (!list || !list.length) return this.cell;
    let d = 1e9;
    for (const si of list) { const s = this.shapes[si]; if (s.op === 'add') d = smin(d, dist(s, p), s.k); }
    for (const si of list) { const s = this.shapes[si]; if (s.op === 'sub') d = smax(d, -dist(s, p), s.k); }
    return d > 1e8 ? this.cell : d;
  }
  // which shapes are at the surface near p (for tags, colours and weights): [{ s, d }] sorted
  near(p, band = 4) {
    const list = this.cellOf(p) || [], out = [];
    for (const si of list) { const s = this.shapes[si]; if (s.op !== 'add') continue; const d = dist(s, p); if (d < band) out.push({ s, d }); }
    out.sort((a, b) => a.d - b.d); return out;
  }
  grad(p, e = .25) { return norm([this.eval([p[0] + e, p[1], p[2]]) - this.eval([p[0] - e, p[1], p[2]]), this.eval([p[0], p[1] + e, p[2]]) - this.eval([p[0], p[1] - e, p[2]]), this.eval([p[0], p[1], p[2] + e]) - this.eval([p[0], p[1], p[2] - e])]); }
}

// ---------------- surface nets ----------------
// Narrow-band dual contouring-lite: a coarse pass finds cells near the surface, a fine pass meshes them.
function mesh(sculpt, h, { clipY = -Infinity } = {}) {
  const lo = sculpt.lo.map(v => v - h * 2), hi = sculpt.hi.map(v => v + h * 2), n = [0, 1, 2].map(i => Math.ceil((hi[i] - lo[i]) / h) + 1);
  const idx = (x, y, z) => (x * n[1] + y) * n[2] + z, N = n[0] * n[1] * n[2];
  const field = new Float32Array(N).fill(NaN);
  // coarse band test: evaluate every 4th point; points whose coarse value is far from 0 are skipped
  const C = 4, cf = new Map();
  const coarse = (x, y, z) => { const k = idx(x, y, z); let v = cf.get(k); if (v === undefined) { v = sculpt.eval([lo[0] + x * h, lo[1] + y * h, lo[2] + z * h]); cf.set(k, v); } return v; };
  const band = h * C * 1.9;
  const get = (x, y, z) => { const k = idx(x, y, z); let v = field[k]; if (v !== v) { const p = [lo[0] + x * h, lo[1] + y * h, lo[2] + z * h]; v = p[1] < clipY ? Math.max(sculpt.eval(p), clipY - p[1]) : sculpt.eval(p); field[k] = v; } return v; };
  const active = new Uint8Array(Math.ceil(n[0] / C) * Math.ceil(n[1] / C) * Math.ceil(n[2] / C)), cn = [0, 1, 2].map(i => Math.ceil(n[i] / C));
  for (let X = 0; X < cn[0]; X++) for (let Y = 0; Y < cn[1]; Y++) for (let Z = 0; Z < cn[2]; Z++) {
    const x = Math.min(n[0] - 1, X * C + C / 2), y = Math.min(n[1] - 1, Y * C + C / 2), z = Math.min(n[2] - 1, Z * C + C / 2);
    if (Math.abs(coarse(x, y, z)) < band) active[(X * cn[1] + Y) * cn[2] + Z] = 1;
  }
  const isActive = (x, y, z) => active[(Math.floor(x / C) * cn[1] + Math.floor(y / C)) * cn[2] + Math.floor(z / C)];
  const vid = new Int32Array(N).fill(-1), pos = [];
  const E = [[0, 0, 0, 1, 0, 0], [0, 0, 0, 0, 1, 0], [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 1, 0], [1, 0, 0, 1, 0, 1], [0, 1, 0, 1, 1, 0], [0, 1, 0, 0, 1, 1], [0, 0, 1, 1, 0, 1], [0, 0, 1, 0, 1, 1], [1, 1, 0, 1, 1, 1], [1, 0, 1, 1, 1, 1], [0, 1, 1, 1, 1, 1]];
  for (let x = 0; x < n[0] - 1; x++) for (let y = 0; y < n[1] - 1; y++) for (let z = 0; z < n[2] - 1; z++) {
    if (!isActive(x, y, z)) continue;
    let sx = 0, sy = 0, sz = 0, c = 0;
    for (const e of E) { const a = get(x + e[0], y + e[1], z + e[2]), b = get(x + e[3], y + e[4], z + e[5]); if ((a < 0) !== (b < 0)) { const t = a / (a - b); sx += e[0] + (e[3] - e[0]) * t; sy += e[1] + (e[4] - e[1]) * t; sz += e[2] + (e[5] - e[2]) * t; c++; } }
    if (!c) continue;
    vid[idx(x, y, z)] = pos.length; pos.push([lo[0] + (x + sx / c) * h, lo[1] + (y + sy / c) * h, lo[2] + (z + sz / c) * h]);
  }
  const tris = [];
  for (let x = 1; x < n[0] - 1; x++) for (let y = 1; y < n[1] - 1; y++) for (let z = 1; z < n[2] - 1; z++) {
    if (vid[idx(x, y, z)] < 0) continue; const a = get(x, y, z);
    for (const [dx, dy, dz, c1, c2] of [[1, 0, 0, [0, -1, 0], [0, 0, -1]], [0, 1, 0, [0, 0, -1], [-1, 0, 0]], [0, 0, 1, [-1, 0, 0], [0, -1, 0]]]) {
      const b = get(x + dx, y + dy, z + dz); if ((a < 0) === (b < 0)) continue;
      const q = [[x, y, z], [x + c1[0], y + c1[1], z + c1[2]], [x + c1[0] + c2[0], y + c1[1] + c2[1], z + c1[2] + c2[2]], [x + c2[0], y + c2[1], z + c2[2]]].map(([i, j, k]) => vid[idx(i, j, k)]);
      if (q.some(v => v < 0)) continue;
      if (a < 0) { tris.push(q[0], q[1], q[2], q[0], q[2], q[3]); } else { tris.push(q[0], q[2], q[1], q[0], q[3], q[2]); }
    }
  }
  const normals = pos.map(p => sculpt.grad(p, h * .5));
  return { pos, normals, tris };
}

// ---------------- skinning ----------------
// weights: shapes near the vertex vote for their bones, closer shapes more; top 4 bones kept.
function skinWeights(sculpt, pos, falloff = 2.5) {
  const J = new Uint8Array(pos.length * 4), W = new Float32Array(pos.length * 4);
  pos.forEach((p, i) => {
    const near = sculpt.near(p, 12); const acc = new Map();
    if (!near.length) { J[i * 4] = 0; W[i * 4] = 1; return; }
    const d0 = near[0].d; for (const { s, d } of near) { if (s.noSkin) continue; const w = Math.exp(-(d - d0) / falloff) * (s.weight || 1); acc.set(s.bone, (acc.get(s.bone) || 0) + w); }
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), t = top.reduce((a, b) => a + b[1], 0) || 1;
    top.forEach(([b, w], k) => { J[i * 4 + k] = b; W[i * 4 + k] = w / t; });
    if (!top.length) W[i * 4] = 1;
  });
  return { J, W };
}

// ---------------- quaternions / animation ----------------
const qAxis = (ax, ang) => { const a = norm(ax), s = Math.sin(ang / 2); return [a[0] * s, a[1] * s, a[2] * s, Math.cos(ang / 2)]; };
const qMul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qEuler = (x, y, z) => qMul(qMul(qAxis([0, 1, 0], y), qAxis([1, 0, 0], x)), qAxis([0, 0, 1], z));

// ---------------- GLB writer ----------------
// mesh: { pos, normals, tris, colors (RGBA 0..1, a = 1 - emissive), mat (spec, gloss), detail (type, strength), J, W }
// bones: [{ name, parent, pos (bind, world) }]; clips: { name: { dur, fps, track(t) -> { rot: {boneIndex: quat}, root: [dx, dy, dz] } } }
function writeGLB(meshes, bones, clips, { fps = 24 } = {}) {
  const chunks = [], bufferViews = [], accessors = [];
  let offset = 0;
  const push = (typed, target) => { const b = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength), pad = (4 - (b.length % 4)) % 4; bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: b.length, ...(target ? { target } : {}) }); chunks.push(b, Buffer.alloc(pad)); offset += b.length + pad; return bufferViews.length - 1; };
  const acc = (typed, type, componentType, count, extra = {}) => { accessors.push({ bufferView: push(typed, extra.target), componentType, count, type, ...extra.acc }); return accessors.length - 1; };
  const nodes = [], gMeshes = [];
  bones.forEach(b => { const pp = b.parent >= 0 ? bones[b.parent].pos : [0, 0, 0]; nodes.push({ name: b.name, translation: sub(b.pos, pp), children: [] }); });
  bones.forEach((b, i) => { if (b.parent >= 0) nodes[b.parent].children.push(i); });
  nodes.forEach(n => { if (!n.children.length) delete n.children; });
  const ibm = new Float32Array(bones.length * 16); bones.forEach((b, i) => { ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b.pos[0], -b.pos[1], -b.pos[2], 1], i * 16); });
  const ibmAcc = acc(ibm, 'MAT4', 5126, bones.length);
  const meshNodes = [], prims = [];
  const q8 = x => Math.round(clamp(x, 0, 1) * 255), s8 = x => Math.round(clamp(x, -1, 1) * 127);
  for (const m of meshes) {
    // split into primitives of at most 65535 vertices (the engine draws 16-bit indices)
    const remap = new Int32Array(m.pos.length).fill(-1); let cur = null; const parts = [];
    const flush = () => { if (cur && cur.tris.length) parts.push(cur); cur = { verts: [], tris: [] }; remap.fill(-1); };
    flush();
    for (let t = 0; t < m.tris.length; t += 3) {
      const tri = [m.tris[t], m.tris[t + 1], m.tris[t + 2]]; if (cur.verts.length + 3 > 65535) flush();
      for (const v of tri) { if (remap[v] < 0) { remap[v] = cur.verts.length; cur.verts.push(v); } cur.tris.push(remap[v]); }
    }
    flush();
    const primitives = [];
    for (const part of parts) {
      const V = part.verts.length, P = new Float32Array(V * 3), Nn = new Int8Array(V * 4), C = new Uint8Array(V * 4), T0 = new Uint8Array(V * 4), T1 = new Uint8Array(V * 4), J = new Uint8Array(V * 4), W = new Uint8Array(V * 4);
      const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      part.verts.forEach((src, i) => {
        for (let k = 0; k < 3; k++) { P[i * 3 + k] = m.pos[src][k]; Nn[i * 4 + k] = s8(m.normals[src][k]); lo[k] = Math.min(lo[k], m.pos[src][k]); hi[k] = Math.max(hi[k], m.pos[src][k]); }
        for (let k = 0; k < 4; k++) { C[i * 4 + k] = q8(m.colors[src][k]); J[i * 4 + k] = m.J[src * 4 + k]; }
        T0[i * 4] = q8(m.mat[src][0]); T0[i * 4 + 1] = q8(m.mat[src][1]); T1[i * 4] = q8(m.detail[src][0]); T1[i * 4 + 1] = q8(m.detail[src][1]);
        const w = [0, 1, 2, 3].map(k => q8(m.W[src * 4 + k])), d = 255 - w.reduce((a, b) => a + b, 0); w[0] += d; for (let k = 0; k < 4; k++) W[i * 4 + k] = w[k];
      });
      const I = new Uint16Array(part.tris);
      // byteStride 4 for the padded small attributes
      const accS = (typed, type, ct, extra) => { const id = acc(typed, type, ct, V, { target: 34962, acc: extra }); bufferViews[accessors[id].bufferView].byteStride = 4; return id; };
      primitives.push({ attributes: { POSITION: acc(P, 'VEC3', 5126, V, { target: 34962, acc: { min: lo, max: hi } }), NORMAL: accS(Nn, 'VEC3', 5120, { normalized: true }), COLOR_0: accS(C, 'VEC4', 5121, { normalized: true }), TEXCOORD_0: accS(T0, 'VEC2', 5121, { normalized: true }), TEXCOORD_1: accS(T1, 'VEC2', 5121, { normalized: true }), JOINTS_0: accS(J, 'VEC4', 5121), WEIGHTS_0: accS(W, 'VEC4', 5121, { normalized: true }) }, indices: acc(I, 'SCALAR', 5123, I.length, { target: 34963 }), material: 0 });
      prims.push({ verts: V, tris: I.length / 3 });
    }
    gMeshes.push({ name: m.name, primitives });
    nodes.push({ name: m.name, mesh: gMeshes.length - 1, skin: 0 }); meshNodes.push(nodes.length - 1);
  }
  const animations = [];
  for (const [name, clip] of Object.entries(clips || {})) {
    const frames = Math.max(2, Math.round(clip.dur * fps) + 1), times = new Float32Array(frames); for (let f = 0; f < frames; f++) times[f] = f / (frames - 1) * clip.dur;
    const tAcc = acc(times, 'SCALAR', 5126, frames, { acc: { min: [0], max: [clip.dur] } });
    const samples = []; for (let f = 0; f < frames; f++) samples.push(clip.track(times[f]));
    const samplers = [], channels = [];
    const rotBones = new Set(); samples.forEach(s => Object.keys(s.rot || {}).forEach(b => rotBones.add(+b)));
    for (const b of [...rotBones].sort((a, c) => a - c)) { const out = new Float32Array(frames * 4); samples.forEach((s, f) => out.set((s.rot && s.rot[b]) || [0, 0, 0, 1], f * 4)); samplers.push({ input: tAcc, output: acc(out, 'VEC4', 5126, frames), interpolation: 'LINEAR' }); channels.push({ sampler: samplers.length - 1, target: { node: b, path: 'rotation' } }); }
    if (samples.some(s => s.root)) { const out = new Float32Array(frames * 3), base = nodes[0].translation; samples.forEach((s, f) => out.set(add(base, s.root || [0, 0, 0]), f * 3)); samplers.push({ input: tAcc, output: acc(out, 'VEC3', 5126, frames), interpolation: 'LINEAR' }); channels.push({ sampler: samplers.length - 1, target: { node: 0, path: 'translation' } }); }
    animations.push({ name, samplers, channels });
  }
  const gltf = { asset: { version: '2.0', generator: 'Shardlands boss forge' }, extensionsUsed: ['KHR_mesh_quantization'], extensionsRequired: ['KHR_mesh_quantization'], scene: 0, scenes: [{ nodes: [0, ...meshNodes] }], nodes, meshes: gMeshes, skins: [{ joints: bones.map((_, i) => i), inverseBindMatrices: ibmAcc, skeleton: 0 }],
    materials: [{ name: 'boss', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } }], ...(animations.length ? { animations } : {}), accessors, bufferViews, buffers: [{ byteLength: offset }] };
  const json = Buffer.from(JSON.stringify(gltf)), jpad = Buffer.alloc((4 - (json.length % 4)) % 4, 0x20), bin = Buffer.concat(chunks);
  const total = 12 + 8 + json.length + jpad.length + 8 + bin.length, out = Buffer.alloc(total); let o = 0;
  out.writeUInt32LE(0x46546c67, o); out.writeUInt32LE(2, o + 4); out.writeUInt32LE(total, o + 8); o = 12;
  out.writeUInt32LE(json.length + jpad.length, o); out.writeUInt32LE(0x4e4f534a, o + 4); o += 8; json.copy(out, o); o += json.length; jpad.copy(out, o); o += jpad.length;
  out.writeUInt32LE(bin.length, o); out.writeUInt32LE(0x004e4942, o + 4); o += 8; bin.copy(out, o);
  out.stats = prims; return out;
}

module.exports = { scaled, clamp, lerp, v3, sub, add, mul, dot, len, norm, cross, rng, noise3, fbm, roundCone, ellipsoid, box, torus, frame, dist, smin, smax, Sculpt, mesh, skinWeights, qAxis, qMul, qEuler, writeGLB };
