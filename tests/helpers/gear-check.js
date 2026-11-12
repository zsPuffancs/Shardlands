'use strict';
// Geometry checks for equipment on an animated model: penetration into the body, gaps (floating pieces), grip.
// Gear vertices are skinned exactly like the engine does (node_j * ibm_j * v); the body is skinned from the GLB.
const { pose, posedMeshes, mul, xf } = require('./glb-rig');

// closest point on triangle (Ericson); returns [x, y, z]
function closest(p, a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const d = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2], at = (s, t) => [a[0] + ab[0] * s + ac[0] * t, a[1] + ab[1] * s + ac[1] * t, a[2] + ab[2] * s + ac[2] * t];
  const d1 = d(ab, ap), d2 = d(ac, ap); if (d1 <= 0 && d2 <= 0) return a;
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]], d3 = d(ab, bp), d4 = d(ac, bp); if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(d1 / (d1 - d3), 0);
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], d5 = d(ab, cp), d6 = d(ac, cp); if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(0, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]; }
  const den = 1 / (va + vb + vc); return at(vb * den, vc * den);
}

// distance from p to the nearest triangle of the meshes (optionally skipping triangles of some bones)
let lastBone = -1;
function nearest(p, meshes, skipBones) {
  let best = 1e9;
  for (const m of meshes) {
    const T = m.tris;
    for (let t = 0; t < T.length / 9; t++) {
      if (skipBones && skipBones.has(m.bone[t])) continue;
      const o = t * 9;
      if (p[0] < Math.min(T[o], T[o + 3], T[o + 6]) - best || p[0] > Math.max(T[o], T[o + 3], T[o + 6]) + best) continue;
      if (p[1] < Math.min(T[o + 1], T[o + 4], T[o + 7]) - best || p[1] > Math.max(T[o + 1], T[o + 4], T[o + 7]) + best) continue;
      if (p[2] < Math.min(T[o + 2], T[o + 5], T[o + 8]) - best || p[2] > Math.max(T[o + 2], T[o + 5], T[o + 8]) + best) continue;
      const q = closest(p, [T[o], T[o + 1], T[o + 2]], [T[o + 3], T[o + 4], T[o + 5]], [T[o + 6], T[o + 7], T[o + 8]]);
      const dd = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (dd < best) { best = dd; lastBone = m.bone[t]; }
    }
  }
  return best;
}
// inside a closed triangle soup: ray parity, majority of three skewed directions (robust to grazing hits)
const DIRS = [[0.577, 0.611, 0.541], [-0.62, 0.31, 0.72], [0.12, -0.83, -0.545]];
function inside(p, m, skipBones) {
  let votes = 0; const T = m.tris;
  for (const d of DIRS) {
    let hits = 0;
    for (let t = 0; t < T.length / 9; t++) {
      if (skipBones && skipBones.has(m.bone[t])) continue;
      const o = t * 9, e1 = [T[o + 3] - T[o], T[o + 4] - T[o + 1], T[o + 5] - T[o + 2]], e2 = [T[o + 6] - T[o], T[o + 7] - T[o + 1], T[o + 8] - T[o + 2]];
      const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], a = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
      if (Math.abs(a) < 1e-12) continue; const f = 1 / a, s = [p[0] - T[o], p[1] - T[o + 1], p[2] - T[o + 2]], u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]); if (u < 0 || u > 1) continue;
      const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], v = f * (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]); if (v < 0 || u + v > 1) continue;
      if (f * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) > 0) hits++;
    }
    if (hits & 1) votes++;
  }
  return votes >= 2;
}
// signed distance to the skinned body (negative = inside); props only count for the gap
function signedDist(p, body, others, skipBones) {
  const d = nearest(p, [body], skipBones);
  if (d < 0.6 && inside(p, body, skipBones)) return -d;
  return Math.min(d, others.length ? nearest(p, others) : 1e9);
}

// gear vertices posed: verts (16 floats each, from EquipKit.bake) -> unique positions per attachment group
function poseGear(rig, nodes, verts, range) {
  const K = new Float32Array(16), out = [], seen = new Set();
  for (let i = range[0]; i < range[1]; i++) {
    const o = i * 16, key = verts[o].toFixed(4) + ',' + verts[o + 1].toFixed(4) + ',' + verts[o + 2].toFixed(4); if (seen.has(key)) continue; seen.add(key);
    const jn = verts[o + 8], j = rig.joints[jn]; mul(nodes, j * 16, rig.ibm, jn * 16, K, 0); out.push(xf(K, 0, verts[o], verts[o + 1], verts[o + 2]));
  }
  return out;
}

const HAND = /^(Fist|Thumb|Weapon)/;
// For one baked variant: per attachment, worst penetration depth and worst gap over the given animation frames.
// parts: [{ name, bone, range: [v0, v1), weapon }]; returns { [name]: { pen, penAt, gap, gapAt } }
function checkVariant(rig, baked, parts, frames) {
  const res = {};
  const handBones = new Set(rig.joints.map((j, jn) => HAND.test(rig.names[j]) ? jn : -1).filter(x => x >= 0));
  for (const [anim, t] of frames) {
    const nodes = pose(rig, anim, t), meshes = posedMeshes(rig, nodes, baked.hide), bi = rig.prims.findIndex(p => p.skinned);
    const body = meshes.find(m => m.name === rig.prims[bi].nodeName), others = meshes.filter(m => m !== body);
    for (const pt of parts) {
      const r = res[pt.name] || (res[pt.name] = { pen: 0, penAt: '', gap: 0, gapAt: '' });
      const pts = poseGear(rig, nodes, baked.verts, pt.range);
      let minD = 1e9;
      for (const p of pts) {
        const sd = signedDist(p, body, others, pt.weapon ? handBones : null);
        if (-sd > r.pen) { r.pen = -sd; r.penAt = anim + '@' + t.toFixed(2); r.penBone = rig.names[rig.joints[lastBone]]; r.penP = p.map(x => +x.toFixed(2)); }
        minD = Math.min(minD, Math.abs(sd));
      }
      if (!pt.weapon && minD > r.gap) { r.gap = minD; r.gapAt = anim + '@' + t.toFixed(2); }
    }
  }
  return res;
}

// sample times: every animation at n evenly spaced points (end inclusive)
function frames(rig, n, names) { const out = []; for (const a of names || Object.keys(rig.anims)) { const d = rig.anims[a].dur; for (let i = 0; i < n; i++) out.push([a, d * i / (n - 1)]); } return out; }

// a built-in prop of the model expressed as gear (bind-space vertices skinned to its parent joint), to measure the
// original art with the same yardstick. Returns { hide (the prop itself hidden), verts, part }.
function propAsGear(rig, rest, nodeName, inv) {
  const pi = rig.prims.findIndex(p => p.nodeName === nodeName), p = rig.prims[pi];
  let a = rig.parent[p.node]; while (a >= 0 && rig.joints.indexOf(a) < 0) a = rig.parent[a]; const jn = rig.joints.indexOf(a);
  const toBind = new Float32Array(16); mul(Float32Array.from(inv(Array.from(rig.ibm.subarray(jn * 16, jn * 16 + 16)))), 0, Float32Array.from(inv(Array.from(rest.subarray(a * 16, a * 16 + 16)))), 0, toBind, 0);
  const I = p.I || Array.from({ length: p.P.length / 3 }, (_, i) => i), out = [];
  for (const ix of I) { const q = xf(rest, p.node * 16, p.P[ix * 3], p.P[ix * 3 + 1], p.P[ix * 3 + 2]), v = xf(toBind, 0, q[0], q[1], q[2]); out.push(v[0], v[1], v[2], 0, 1, 0, 0, 0, jn, 0, 0, 0, 1, 0, 0, 0); }
  const hide = new Uint8Array(rig.prims.length); hide[pi] = 1;
  return { hide, verts: new Float32Array(out), part: { name: 'prop ' + nodeName, range: [0, out.length / 16] } };
}

module.exports = { checkVariant, frames, signedDist, poseGear, closest, propAsGear };
