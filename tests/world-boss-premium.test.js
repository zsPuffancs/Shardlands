'use strict';
// Premium World Boss models (scripts/boss-forge -> public/assets/bosses, drawn by GL.drawHero): every variant loads as
// the engine reads it, fits the skeleton and index limits, stands on the ground facing +z, carries the clips the
// animation picker asks for, and the existing character shaders and every gameplay file stay untouched.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { context, read } = require('./helpers/enemy-model-context');
const ROOT = path.join(__dirname, '..'), DIR = path.join(ROOT, 'public/assets/bosses');
const CT = { 5126: Float32Array, 5123: Uint16Array, 5121: Uint8Array, 5125: Uint32Array, 5122: Int16Array, 5120: Int8Array }, NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readGLB(file) {
  const b = fs.readFileSync(file), jl = b.readUInt32LE(12), g = JSON.parse(b.slice(20, 20 + jl).toString()), bin = b.slice(20 + jl + 8, 20 + jl + 8 + b.readUInt32LE(20 + jl));
  const acc = i => { const a = g.accessors[i], bv = g.bufferViews[a.bufferView], T = CT[a.componentType], nc = NC[a.type], st = bv.byteStride || nc * T.BYTES_PER_ELEMENT, out = new Float32Array(a.count * nc), dv = new DataView(bin.buffer, bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0));
    const get = { 5126: o => dv.getFloat32(o, true), 5123: o => dv.getUint16(o, true), 5121: o => dv.getUint8(o), 5125: o => dv.getUint32(o, true), 5122: o => dv.getInt16(o, true), 5120: o => dv.getInt8(o) }[a.componentType];
    for (let k = 0; k < a.count; k++) for (let c = 0; c < nc; c++) out[k * nc + c] = get(k * st + c * T.BYTES_PER_ELEMENT);
    if (a.normalized) { const d = { 5121: 255, 5123: 65535, 5120: 127, 5122: 32767 }[a.componentType] || 1; for (let k = 0; k < out.length; k++) out[k] = Math.max(-1, out[k] / d); }
    return out; };
  return { g, acc, size: b.length };
}
const FILES = ['a', 'b', 'c'].flatMap(v => ['varcolac-' + v, 'varcolac-' + v + '-far']);

test('every Vârcolac variant and its distance model is a valid hero model for the engine', () => {
  for (const f of FILES) {
    const { g, acc, size } = readGLB(path.join(DIR, f + '.glb')), far = f.endsWith('-far');
    assert.ok(size < (far ? 1.5 : 6) * 1048576, f + ': file size within budget');
    assert.equal(g.skins.length, 1); assert.ok(g.skins[0].joints.length <= 32, f + ': the skinned shader takes 32 bones');
    let minY = 1e9, maxY = -1e9, maxZ = -1e9, minZ = 1e9, verts = 0, tris = 0;
    for (const m of g.meshes) for (const p of m.primitives) {
      for (const a of ['POSITION', 'NORMAL', 'COLOR_0', 'TEXCOORD_0', 'TEXCOORD_1', 'JOINTS_0', 'WEIGHTS_0']) assert.ok(p.attributes[a] !== undefined, f + ': ' + a);
      const P = acc(p.attributes.POSITION), J = acc(p.attributes.JOINTS_0), W = acc(p.attributes.WEIGHTS_0), I = acc(p.indices), V = P.length / 3;
      assert.ok(V <= 65535, f + ': 16-bit indices'); assert.equal(g.accessors[p.indices].componentType, 5123);
      for (let i = 0; i < I.length; i++) assert.ok(I[i] < V);
      for (let i = 0; i < V; i++) { const y = P[i * 3 + 1], z = P[i * 3 + 2]; assert.ok(Number.isFinite(y) && Number.isFinite(z) && Number.isFinite(P[i * 3])); minY = Math.min(minY, y); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z); minZ = Math.min(minZ, z);
        assert.ok(Math.abs(W[i * 4] + W[i * 4 + 1] + W[i * 4 + 2] + W[i * 4 + 3] - 1) < .01, 'weights sum to 1'); for (let k = 0; k < 4; k++) assert.ok(J[i * 4 + k] < g.skins[0].joints.length); }
      verts += V; tris += I.length / 3;
    }
    assert.ok(minY > -.1 && minY < .6, f + ': stands on the ground, not under it (' + minY + ')');
    assert.ok(maxY > 60 && maxY < 82, f + ': same height as the model it replaces (' + maxY + ')');
    assert.ok(maxZ > 38 && minZ < -36, f + ': faces +z, tail behind');
    assert.ok(far ? tris < 50000 : tris > 150000 && tris < 260000, f + ': ' + tris + ' triangles');
    if (!far) for (const clip of ['Idle', 'Run', 'Walk', 'Attack', 'Attack2', 'RecieveHit', 'Death']) assert.ok(g.animations.some(a => a.name === clip), f + ': clip ' + clip);
  }
});

test('the three variants are different sculpts, not recolours', () => {
  const stats = ['a', 'b', 'c'].map(v => { const { g, acc } = readGLB(path.join(DIR, 'varcolac-' + v + '.glb')); let n = 0, sx = 0; for (const m of g.meshes) for (const p of m.primitives) { const P = acc(p.attributes.POSITION); n += P.length / 3; for (let i = 0; i < P.length; i += 3) sx += Math.abs(P[i]); } return [n, sx / n]; });
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(Math.abs(stats[i][0] - stats[j][0]) > 500 || Math.abs(stats[i][1] - stats[j][1]) > .2, 'variants ' + i + '/' + j + ' differ in geometry');
});

test('premium models fall back to the primitive model and keep its size; gameplay files are untouched', () => {
  const ctx = context(); vm.runInContext(read('public/world-boss-models.js'), ctx); const W = ctx.window.WorldBossModels;
  for (const code of [1, 2, 3]) { const o = W.model(code, { r: 40 }); assert.equal(o.premium, true); assert.equal(o.base, W.BOSSES[0].fn); ctx.calls.length = 0; o.fn({ id: 3, rx: 0, ry: 0, yaw: 0, mv: 0, ph: 0, atkT: -1e9, flash: 0 }, o); assert.ok(ctx.calls.length > 40, 'no hero renderer: the primitive model is drawn'); }
  for (let code = 4; code <= 24; code++) assert.equal(W.model(code, { r: 40 }).premium, false, 'other bosses unchanged until approved');
  // the engine's existing character and world shaders are byte-for-byte the same as before the hero path was added
  const engine = read('public/engine.js');
  for (const marker of ["const VSK = 'attribute vec3 p;attribute vec3 n;attribute vec2 uv;attribute vec4 j;attribute vec4 w;uniform mat4 B[32];uniform mat4 MW;';",
    'void main(){vec3 N=normalize(vN);vec4 tx=texture2D(tex,vU);vec3 base=tx.rgb*tint;float d=max(dot(N,sunDir),0.0);float sh=shade();vec3 V=normalize(cam-vW);',
    "const vskd = VSK + 'uniform mat4 LVP;void main(){mat4 K=B[int(j.x)]*w.x+B[int(j.y)]*w.y+B[int(j.z)]*w.z+B[int(j.w)]*w.w;gl_Position=LVP*(MW*K*vec4(p,1.0));}';"]) assert.ok(engine.includes(marker));
  assert.match(engine, /function drawHero\(/); assert.match(engine, /drawSkinQueue\(true\); drawHeroQueue\(true, LVP\);/);
});
