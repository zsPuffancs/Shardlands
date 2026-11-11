'use strict';
// Minimal glTF (.glb) reader and pose evaluator for tests. It mirrors the math in public/engine.js
// (loadGLB / sampleAnim / pose) without WebGL, so equipment can be checked headlessly.
const fs = require('fs');
const CT = { 5126: Float32Array, 5123: Uint16Array, 5121: Uint8Array, 5125: Uint32Array, 5122: Int16Array, 5120: Int8Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAcc(g, bin, i) {
  const a = g.accessors[i], bv = g.bufferViews[a.bufferView], T = CT[a.componentType], nc = NC[a.type];
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || nc * T.BYTES_PER_ELEMENT, out = new Float32Array(a.count * nc);
  const dv = new DataView(bin.buffer, bin.byteOffset + off);
  const get = { 5126: o => dv.getFloat32(o, true), 5123: o => dv.getUint16(o, true), 5121: o => dv.getUint8(o), 5125: o => dv.getUint32(o, true), 5122: o => dv.getInt16(o, true), 5120: o => dv.getInt8(o) }[a.componentType];
  for (let k = 0; k < a.count; k++) for (let c = 0; c < nc; c++) out[k * nc + c] = get(k * stride + c * T.BYTES_PER_ELEMENT);
  if (a.normalized) { const d = T === Uint8Array ? 255 : T === Uint16Array ? 65535 : 1; for (let k = 0; k < out.length; k++) out[k] /= d; }
  return out;
}

function loadRig(file) {
  const b = fs.readFileSync(file), jl = b.readUInt32LE(12), g = JSON.parse(b.slice(20, 20 + jl).toString());
  const bl = b.readUInt32LE(20 + jl), bin = new Uint8Array(b.buffer, b.byteOffset + 20 + jl + 8, bl);
  const N = g.nodes.length, parent = new Int16Array(N).fill(-1);
  g.nodes.forEach((n, i) => (n.children || []).forEach(c => { parent[c] = i; }));
  const order = []; const visit = i => { order.push(i); (g.nodes[i].children || []).forEach(visit); };
  g.scenes[g.scene || 0].nodes.forEach(visit);
  const dT = new Float32Array(N * 3), dR = new Float32Array(N * 4), dS = new Float32Array(N * 3);
  g.nodes.forEach((n, i) => { dT.set(n.translation || [0, 0, 0], i * 3); dR.set(n.rotation || [0, 0, 0, 1], i * 4); dS.set(n.scale || [1, 1, 1], i * 3); });
  const skin = g.skins[0], joints = skin.joints, ibm = readAcc(g, bin, skin.inverseBindMatrices);
  const prims = [];
  g.nodes.forEach((n, ni) => {
    if (n.mesh === undefined) return;
    for (const pr of g.meshes[n.mesh].primitives) {
      const A = pr.attributes, skinned = n.skin !== undefined && A.JOINTS_0 !== undefined;
      prims.push({ name: g.meshes[n.mesh].name, nodeName: n.name, node: ni, mat: pr.material || 0, skinned,
        P: readAcc(g, bin, A.POSITION), N: A.NORMAL !== undefined ? readAcc(g, bin, A.NORMAL) : null, I: pr.indices !== undefined ? readAcc(g, bin, pr.indices) : null,
        J: skinned ? readAcc(g, bin, A.JOINTS_0) : null, W: skinned ? readAcc(g, bin, A.WEIGHTS_0) : null });
    }
  });
  const anims = {};
  for (const an of g.animations || []) {
    let dur = 0;
    const ch = an.channels.map(c => { const sm = an.samplers[c.sampler], t = readAcc(g, bin, sm.input), v = readAcc(g, bin, sm.output); dur = Math.max(dur, t[t.length - 1]); return { node: c.target.node, path: c.target.path, t, v }; });
    anims[an.name] = { ch, dur };
  }
  const names = g.nodes.map(n => n.name);
  return { g, N, parent, order, dT, dR, dS, joints, ibm, prims, anims, names, boneNames: joints.map(j => names[j]) };
}

function sample(an, time, T, R, S) {
  for (const c of an.ch) {
    const t = c.t, n = t.length; let i = 0;
    if (time >= t[n - 1]) i = n - 1; else { let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= time) lo = m; else hi = m; } i = lo; }
    const j = Math.min(n - 1, i + 1), k = j > i ? Math.max(0, Math.min(1, (time - t[i]) / (t[j] - t[i]))) : 0, v = c.v, o = c.node;
    if (c.path === 'rotation') {
      let bx = v[j * 4], by = v[j * 4 + 1], bz = v[j * 4 + 2], bw = v[j * 4 + 3]; const ax = v[i * 4], ay = v[i * 4 + 1], az = v[i * 4 + 2], aw = v[i * 4 + 3];
      if (ax * bx + ay * by + az * bz + aw * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; }
      const x = ax + (bx - ax) * k, y = ay + (by - ay) * k, z = az + (bz - az) * k, w = aw + (bw - aw) * k, l = Math.hypot(x, y, z, w) || 1;
      R[o * 4] = x / l; R[o * 4 + 1] = y / l; R[o * 4 + 2] = z / l; R[o * 4 + 3] = w / l;
    } else { const D = c.path === 'translation' ? T : c.path === 'scale' ? S : null; if (D) for (let q = 0; q < 3; q++) D[o * 3 + q] = v[i * 3 + q] + (v[j * 3 + q] - v[i * 3 + q]) * k; }
  }
}

function mul(a, ao, b, bo, o, oo) { const r = new Float64Array(16); for (let c = 0; c < 4; c++) for (let w = 0; w < 4; w++) { let s = 0; for (let k = 0; k < 4; k++) s += a[ao + k * 4 + w] * b[bo + c * 4 + k]; r[c * 4 + w] = s; } for (let i = 0; i < 16; i++) o[oo + i] = r[i]; return o; }

// model-space matrix per node (column-major, 16 floats each); anim null = bind pose
function pose(rig, animName, time) {
  const { N, order, parent } = rig, T = rig.dT.slice(), R = rig.dR.slice(), S = rig.dS.slice(), out = new Float32Array(N * 16), L = new Float32Array(16);
  if (animName) sample(rig.anims[animName], time, T, R, S);
  for (const i of order) {
    const x = R[i * 4], y = R[i * 4 + 1], z = R[i * 4 + 2], w = R[i * 4 + 3], sx = S[i * 3], sy = S[i * 3 + 1], sz = S[i * 3 + 2];
    L[0] = (1 - 2 * (y * y + z * z)) * sx; L[1] = 2 * (x * y + z * w) * sx; L[2] = 2 * (x * z - y * w) * sx; L[3] = 0;
    L[4] = 2 * (x * y - z * w) * sy; L[5] = (1 - 2 * (x * x + z * z)) * sy; L[6] = 2 * (y * z + x * w) * sy; L[7] = 0;
    L[8] = 2 * (x * z + y * w) * sz; L[9] = 2 * (y * z - x * w) * sz; L[10] = (1 - 2 * (x * x + y * y)) * sz; L[11] = 0;
    L[12] = T[i * 3]; L[13] = T[i * 3 + 1]; L[14] = T[i * 3 + 2]; L[15] = 1;
    if (parent[i] < 0) out.set(L, i * 16); else mul(out, parent[i] * 16, L, 0, out, i * 16);
  }
  return out;
}

const xf = (m, o, x, y, z) => [m[o] * x + m[o + 4] * y + m[o + 8] * z + m[o + 12], m[o + 1] * x + m[o + 5] * y + m[o + 9] * z + m[o + 13], m[o + 2] * x + m[o + 6] * y + m[o + 10] * z + m[o + 14]];

// skinned body vertices in model space for a pose
function skinBody(rig, nodes) {
  const body = rig.prims.find(p => p.skinned), K = new Float32Array(rig.joints.length * 16);
  rig.joints.forEach((j, jn) => mul(nodes, j * 16, rig.ibm, jn * 16, K, jn * 16));
  const n = body.P.length / 3, out = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) for (let c = 0; c < 4; c++) { const w = body.W[v * 4 + c]; if (!w) continue; const p = xf(K, body.J[v * 4 + c] * 16, body.P[v * 3], body.P[v * 3 + 1], body.P[v * 3 + 2]); out[v * 3] += p[0] * w; out[v * 3 + 1] += p[1] * w; out[v * 3 + 2] += p[2] * w; }
  return { out, J: body.J, W: body.W };
}

// every visible mesh of the model posed in model space: [{ name, tris: Float32Array (9 per triangle), bone: dominant joint per triangle }]
function posedMeshes(rig, nodes, hide) {
  const K = new Float32Array(rig.joints.length * 16); rig.joints.forEach((j, jn) => mul(nodes, j * 16, rig.ibm, jn * 16, K, jn * 16));
  const out = [];
  rig.prims.forEach((p, pi) => {
    if (hide && hide[pi]) return;
    const n = p.P.length / 3, V = new Float32Array(n * 3), dom = new Int16Array(n);
    for (let v = 0; v < n; v++) {
      if (p.skinned) { let bw = 0; for (let c = 0; c < 4; c++) { const w = p.W[v * 4 + c]; if (!w) continue; if (w > bw) { bw = w; dom[v] = p.J[v * 4 + c]; } const q = xf(K, p.J[v * 4 + c] * 16, p.P[v * 3], p.P[v * 3 + 1], p.P[v * 3 + 2]); V[v * 3] += q[0] * w; V[v * 3 + 1] += q[1] * w; V[v * 3 + 2] += q[2] * w; } }
      else { const q = xf(nodes, p.node * 16, p.P[v * 3], p.P[v * 3 + 1], p.P[v * 3 + 2]); V.set(q, v * 3); let a = rig.parent[p.node]; while (a >= 0 && rig.joints.indexOf(a) < 0) a = rig.parent[a]; dom[v] = rig.joints.indexOf(a); }
    }
    const I = p.I || Array.from({ length: n }, (_, i) => i), tris = new Float32Array(I.length * 3), bone = new Int16Array(I.length / 3);
    for (let t = 0; t < I.length; t++) tris.set(V.subarray(I[t] * 3, I[t] * 3 + 3), t * 3);
    for (let t = 0; t < I.length / 3; t++) bone[t] = dom[I[t * 3]];
    out.push({ name: p.nodeName, tris, bone });
  });
  return out;
}

module.exports = { loadRig, pose, skinBody, posedMeshes, xf, mul };
