// Equipment kit: low-poly armour, helmets and weapons attached to animated (skinned) characters.
//
// Every piece is built in code (flat-shaded facets, like the village kit) and baked into the character's bind pose,
// each vertex rigidly skinned to one bone. All the gear of one character is a single mesh, so it costs one draw call
// (plus one in the shadow pass), whatever the number of pieces. Colours come from a small shared palette texture;
// swatches with alpha below 255 glow. Built-in props of the model (its dagger, pouch, bracer...) can be hidden.
//
// Variants are picked from the monster id with a hash, so every client shows the same look with no network data.
// The module is pure (no WebGL): public/engine.js turns the baked arrays into buffers; tests bake it in Node.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.EquipKit = api;
})(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  // ---------- palette (one texel per swatch; alpha < 255 = emissive strength) ----------
  const SWATCHES = [
    ['leatherDark', [70, 48, 36]], ['leather', [112, 76, 50]], ['leatherLight', [150, 110, 74]], ['strap', [54, 38, 30]],
    ['clothBlack', [42, 40, 46]], ['clothGrey', [86, 84, 88]], ['clothRed', [122, 34, 32]], ['clothRust', [140, 72, 40]],
    ['fur', [96, 78, 60]], ['furLight', [150, 132, 110]], ['iron', [118, 120, 124]], ['ironDark', [72, 74, 80]],
    ['steel', [176, 180, 186]], ['edge', [222, 226, 230]], ['bronze', [150, 112, 60]], ['brass', [184, 150, 82]],
    ['wood', [116, 80, 50]], ['woodDark', [76, 52, 34]], ['rope', [160, 136, 96]], ['bone', [214, 204, 180]],
    ['blackSteel', [52, 50, 56]], ['bloodRed', [96, 20, 22]], ['ember', [255, 120, 40], 90], ['emberEdge', [255, 160, 90], 150],
    ['rivet', [196, 182, 150]], ['skinShade', [60, 40, 36]],
  ];
  const PAL_W = 32, SW = {};
  const PALETTE = new Uint8Array(PAL_W * 4);
  SWATCHES.forEach(([name, rgb, a], i) => { SW[name] = i; PALETTE.set([rgb[0], rgb[1], rgb[2], a === undefined ? 255 : a], i * 4); });
  const swU = i => (i + 0.5) / PAL_W;

  // ---------- tiny geometry builder (triangles with a swatch and the centre of their convex part) ----------
  // A part is a convex shape made in its own frame; tris are [a, b, c, swatch, centre]. Normals are made at bake time
  // from the final positions, flipped to point away from the part's centre (so mirrored parts stay correct).
  const rad = d => d * Math.PI / 180;
  function mat(at, rot, s) { // column-major 4x4 from translation, XYZ euler degrees, scale (number or [x,y,z])
    const [rx, ry, rz] = (rot || [0, 0, 0]).map(rad), sc = Array.isArray(s) ? s : [s || 1, s || 1, s || 1];
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
    // R = Rz * Ry * Rx
    const r = [cz * cy, sz * cy, -sy, cz * sy * sx - sz * cx, sz * sy * sx + cz * cx, cy * sx, cz * sy * cx + sz * sx, sz * sy * cx - cz * sx, cy * cx];
    const p = at || [0, 0, 0];
    return [r[0] * sc[0], r[1] * sc[0], r[2] * sc[0], 0, r[3] * sc[1], r[4] * sc[1], r[5] * sc[1], 0, r[6] * sc[2], r[7] * sc[2], r[8] * sc[2], 0, p[0], p[1], p[2], 1];
  }
  const mm = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
  const ap = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  function xform(tris, m) { return tris.map(t => [ap(m, t[0]), ap(m, t[1]), ap(m, t[2]), t[3], ap(m, t[4])]); }
  function part(tris, o) { return o ? xform(tris, mat(o.at, o.rot, o.s)) : tris; }
  const quad = (out, a, b, c, d, sw, ctr) => { out.push([a, b, c, sw, ctr], [a, c, d, sw, ctr]); };

  // rings: list of { y, rx, rz, ox?, oz? } stacked along y; seg sides; capped ends. The basis of most shapes.
  function loft(rings, seg, sw, o = {}) {
    const out = [], P = rings.map(r => { const pts = []; for (let i = 0; i < seg; i++) { const a = (i / seg) * 6.2832 + (o.phase || 0); pts.push([(r.ox || 0) + Math.cos(a) * r.rx, r.y, (r.oz || 0) + Math.sin(a) * r.rz]); } return pts; });
    let cy = 0; rings.forEach(r => { cy += r.y; }); const ctr = [0, cy / rings.length, 0];
    for (let k = 0; k + 1 < P.length; k++) for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; quad(out, P[k][i], P[k][j], P[k + 1][j], P[k + 1][i], sw, ctr); }
    if (!o.openBottom) { const r = rings[0], c = [r.ox || 0, r.y, r.oz || 0]; for (let i = 0; i < seg; i++) out.push([c, P[0][(i + 1) % seg], P[0][i], sw, ctr]); }
    if (!o.openTop) { const L = P.length - 1, r = rings[L], c = [r.ox || 0, r.y, r.oz || 0]; for (let i = 0; i < seg; i++) out.push([c, P[L][i], P[L][(i + 1) % seg], sw, ctr]); }
    return out;
  }
  // box with optional top taper: w x h x d centred on x/z, from y = 0 up
  function box(w, h, d, sw, o = {}) {
    const tx = o.tx === undefined ? 1 : o.tx, tz = o.tz === undefined ? 1 : o.tz, x0 = w / 2, z0 = d / 2, x1 = x0 * tx, z1 = z0 * tz, out = [], ctr = [0, h / 2, 0];
    const b = [[-x0, 0, -z0], [x0, 0, -z0], [x0, 0, z0], [-x0, 0, z0]], t = [[-x1, h, -z1], [x1, h, -z1], [x1, h, z1], [-x1, h, z1]];
    quad(out, b[0], b[1], b[2], b[3], sw, ctr); quad(out, t[0], t[3], t[2], t[1], sw, ctr);
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(out, b[i], b[j], t[j], t[i], sw, ctr); }
    return out;
  }
  // flat outline (convex or star-shaped around its centroid) in the x/y plane, extruded along z by thick
  function slab(pts, thick, sw, o = {}) {
    const out = [], h = thick / 2, n = pts.length; let cx = 0, cy = 0; pts.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= n; cy /= n;
    const bev = o.bevel || 0, F = pts.map(p => [cx + (p[0] - cx) * (1 - bev), cy + (p[1] - cy) * (1 - bev)]);
    const ctr = [cx, cy, 0], cf = [cx, cy, h], cb = [cx, cy, -h];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = pts[i], b = pts[j], fa = F[i], fb = F[j];
      out.push([cf, [fa[0], fa[1], h], [fb[0], fb[1], h], sw, [cx, cy, 0]], [cb, [fb[0], fb[1], -h], [fa[0], fa[1], -h], sw, [cx, cy, 0]]);
      const ez = bev ? h * 0.35 : h; // bevelled edge = thinner rim (sharp blade edges)
      quad(out, [a[0], a[1], -ez], [b[0], b[1], -ez], [b[0], b[1], ez], [a[0], a[1], ez], o.edge === undefined ? sw : o.edge, ctr);
      if (bev) { quad(out, [fa[0], fa[1], h], [a[0], a[1], ez], [b[0], b[1], ez], [fb[0], fb[1], h], o.edge === undefined ? sw : o.edge, ctr); quad(out, [fb[0], fb[1], -h], [b[0], b[1], -ez], [a[0], a[1], -ez], [fa[0], fa[1], -h], o.edge === undefined ? sw : o.edge, ctr); }
    }
    return out;
  }
  // open band: part of a loft between angles a0..a1 (degrees; 90 = +z, the front) with a thickness, closed at its edges
  function band(rings, seg, sw, a0, a1, thick) {
    const out = [], ring = (r, k) => { const pts = []; for (let i = 0; i <= seg; i++) { const a = rad(a0 + (a1 - a0) * i / seg); pts.push([(r.ox || 0) + Math.cos(a) * (r.rx - k), r.y, (r.oz || 0) + Math.sin(a) * (r.rz - k)]); } return pts; };
    const O = rings.map(r => ring(r, 0)), I = rings.map(r => ring(r, thick)), L = rings.length - 1;
    for (let k = 0; k < L; k++) for (let i = 0; i < seg; i++) {
      const c = [(rings[k].ox || 0), (rings[k].y + rings[k + 1].y) / 2, (rings[k].oz || 0)];
      quad(out, O[k][i], O[k][i + 1], O[k + 1][i + 1], O[k + 1][i], sw, c);
      quad(out, I[k][i], I[k][i + 1], I[k + 1][i + 1], I[k + 1][i], sw, [c[0] + (I[k][i][0] - c[0]) * 2, c[1], c[2] + (I[k][i][2] - c[2]) * 2]); // inner faces point inwards
    }
    for (const k of [0, L]) for (let i = 0; i < seg; i++) { const m = [(O[k][i][0] + I[k][i][0]) / 2, rings[k].y + (k ? -1 : 1), (O[k][i][2] + I[k][i][2]) / 2]; quad(out, O[k][i], O[k][i + 1], I[k][i + 1], I[k][i], sw, m); }
    for (const i of [0, seg]) for (let k = 0; k < L; k++) { const j = i ? seg - 1 : 1, m = [O[k][j][0], (rings[k].y + rings[k + 1].y) / 2, O[k][j][2]]; quad(out, O[k][i], O[k + 1][i], I[k + 1][i], I[k][i], sw, m); }
    return out;
  }
  const cyl = (r0, r1, h, seg, sw, o) => loft([{ y: 0, rx: r0, rz: r0 }, { y: h, rx: r1, rz: r1 }], seg, sw, o);
  // ellipsoid cap: from latitude lat0 (degrees, -90 bottom .. 90 top) up to the pole
  function dome(rx, ry, rz, seg, rings, sw, lat0 = 0, o = {}) {
    const R = []; for (let k = 0; k <= rings; k++) { const la = rad(lat0 + (90 - lat0) * k / rings), c = Math.max(Math.cos(la), k === rings ? 0.0001 : 0); R.push({ y: Math.sin(la) * ry, rx: rx * c, rz: rz * c, oz: (o.lean || 0) * Math.sin(la) * ry }); }
    return loft(R, seg, sw, { openBottom: o.openBottom, phase: o.phase });
  }
  const join = (...l) => [].concat(...l);

  // ---------- pieces (each in its own frame; sizes in the model's units, the Rogue is ~2.95 tall) ----------
  // Head pieces are made around the head centre and sit over the model's own hood (its 'Face' mesh), which reads as a
  // coif under a helmet; torso pieces around the chest; weapons in the frame of the model's dagger socket.
  const grow = (rings, k) => rings.map(r => ({ y: r.y, rx: r.rx * k, rz: r.rz * k, oz: r.oz }));
  const HELM = [ // spangenhelm profile over the hood (centre ~ (0, 2.42, 0.08) in the bind pose)
    { y: -0.02, rx: 0.47, rz: 0.56, oz: 0.02 }, { y: 0.16, rx: 0.48, rz: 0.57, oz: 0.01 }, { y: 0.34, rx: 0.42, rz: 0.50, oz: 0 },
    { y: 0.48, rx: 0.30, rz: 0.36, oz: -0.01 }, { y: 0.58, rx: 0.15, rz: 0.18, oz: -0.02 }, { y: 0.64, rx: 0.03, rz: 0.035, oz: -0.02 }];
  const PIECES = {
    // ---- heads ----
    faceScarf: () => join( // a cloth mask over the lower half of the hood's face opening, tied at the sides
      band([{ y: 0, rx: 0.40, rz: 0.50 }, { y: 0.13, rx: 0.42, rz: 0.55 }, { y: 0.24, rx: 0.40, rz: 0.55 }], 9, SW.clothGrey, 22, 158, 0.04),
      band([{ y: 0.13, rx: 0.425, rz: 0.56 }, { y: 0.16, rx: 0.425, rz: 0.56 }], 9, SW.strap, 22, 158, 0.03), // stitched fold
      ...[-1, 1].map(sd => part(slab([[0, 0], [0.04, -0.03], [0.05, -0.15], [0.0, -0.12], [-0.04, -0.16], [-0.03, -0.02]], 0.03, SW.strap), { at: [0.41 * sd, 0.12, 0.16], rot: [0, 90 * sd, 10 * sd] })), // knot tails
    ),
    kettleHat: () => join( // brigand: round leather-and-iron kettle hat with a broad brim
      part(dome(0.47, 0.50, 0.53, 14, 4, SW.iron, 0, { openBottom: true }), { at: [0, 0.08, 0.03] }),
      part(cyl(0.50, 0.49, 0.12, 14, SW.leatherDark, { openTop: true, openBottom: true }), { at: [0, 0.02, 0.03] }),
      part(band([{ y: 0, rx: 0.78, rz: 0.84 }, { y: 0.05, rx: 0.77, rz: 0.83 }], 28, SW.ironDark, 0, 360, 0.31), { at: [0, -0.01, 0.03] }), // brim (a flat ring)
      ...[[84, 96], [264, 276]].map(([a0, a1]) => part(band(Array.from({ length: 6 }, (_, k) => { const la = rad(k * 17); return { y: Math.sin(la) * 0.515, rx: Math.cos(la) * 0.485 + 0.001, rz: Math.cos(la) * 0.545 + 0.001 }; }), 1, SW.leatherDark, a0, a1, 0.025), { at: [0, 0.08, 0.03] })), // crest band
      part(slab([[0, 0], [0.05, 0.10], [0.06, 0.40], [0.02, 0.62], [-0.02, 0.38]], 0.025, SW.clothRed), { at: [0.40, 0.22, -0.18], rot: [-28, 40, -20] }), // feather
    ),
    nasalHelm: () => join( // marauder: pointed iron helm with a nasal and a horsehair plume ridge
      loft(HELM, 14, SW.iron, { openBottom: true }),
      part(loft([{ y: 0, rx: 0.50, rz: 0.59 }, { y: 0.12, rx: 0.505, rz: 0.595 }], 14, SW.ironDark, { openTop: true, openBottom: true }), { at: [0, -0.04, 0.02] }), // brow band
      part(slab([[-0.06, 0.06], [0.06, 0.06], [0.04, -0.30], [0.0, -0.34], [-0.04, -0.30]], 0.06, SW.ironDark, { bevel: 0.15 }), { at: [0, 0, 0.62], rot: [-6, 0, 0] }), // nasal
      ...[[85, 95], [265, 275]].map(([a0, a1]) => band(grow(HELM.slice(0, 5), 1.03), 1, SW.ironDark, a0, a1, 0.03)), // crest rib
      part(dome(0.035, 0.035, 0.035, 5, 1, SW.steel, -60), { at: [0, 0.67, -0.02] }),
      ...[-1, 1].map(sd => part(slab([[0, 0.1], [0.34, 0.08], [0.30, -0.16], [0.04, -0.20]], 0.07, SW.ironDark, { bevel: 0.12 }), { at: [0.46 * sd, -0.12, 0.10], rot: [0, -90 * sd + 10 * sd, 0] })), // cheek plates
    ),
    // ---- torso ----
    jerkin: () => join( // brigand: studded leather jerkin over the tunic (chest only, the arms stay free)
      loft([{ y: -0.10, rx: 0.355, rz: 0.29, oz: 0.0 }, { y: 0.10, rx: 0.35, rz: 0.29, oz: 0.0 }, { y: 0.30, rx: 0.30, rz: 0.27, oz: 0.0 }, { y: 0.40, rx: 0.21, rz: 0.21, oz: 0.0 }], 12, SW.leather, { openBottom: true, openTop: true }),
      ...[0.02, 0.18].map(y => part(loft([{ y: 0, rx: 0.375, rz: 0.305 }, { y: 0.04, rx: 0.37, rz: 0.30 }], 12, SW.strap, { openTop: true, openBottom: true }), { at: [0, y, 0] })),
      ...[[-0.17, 0.09], [0.17, 0.09], [-0.17, 0.25], [0.17, 0.25], [0, 0.10]].map(([x, y]) => part(dome(0.04, 0.035, 0.04, 6, 1, SW.rivet, -40), { at: [x, y, 0.28], rot: [80, 0, 0] })),
      part(box(0.11, 0.86, 0.05, SW.strap), { at: [-0.04, -0.12, 0.29], rot: [0, 0, -36] }), // baldric (front)
      part(box(0.11, 0.86, 0.05, SW.strap), { at: [-0.04, -0.12, -0.29], rot: [0, 0, -36] }), // baldric (back)
    ),
    tassets: () => join( // brigand: broad leather belt with a buckle (the hanging flaps ride on the thighs: thighFlap)
      loft([{ y: 0, rx: 0.37, rz: 0.30 }, { y: 0.10, rx: 0.37, rz: 0.30 }], 12, SW.leatherDark, { openBottom: true, openTop: true }),
      part(box(0.12, 0.09, 0.04, SW.brass), { at: [0, 0.005, 0.30] }),
    ),
    thighFlap: () => join( // left thigh; mirrored for the right
      band([{ y: -0.30, rx: 0.21, rz: 0.23, oz: 0.03 }, { y: 0.0, rx: 0.205, rz: 0.235, oz: 0.03 }], 5, SW.leather, 40, 150, 0.035),
      band([{ y: -0.31, rx: 0.215, rz: 0.235, oz: 0.03 }, { y: -0.27, rx: 0.215, rz: 0.235, oz: 0.03 }], 5, SW.strap, 40, 150, 0.03),
      part(dome(0.03, 0.025, 0.03, 5, 1, SW.rivet, -40), { at: [0.11, -0.05, 0.22], rot: [80, 0, 0] }),
    ),
    cowl: () => join( // cutthroat: short layered shoulder cape over the hood's drape, with a ragged hem
      loft([{ y: -0.24, rx: 0.53, rz: 0.47, oz: -0.05 }, { y: -0.06, rx: 0.50, rz: 0.44, oz: -0.04 }, { y: 0.08, rx: 0.44, rz: 0.39, oz: -0.02 }, { y: 0.16, rx: 0.37, rz: 0.33, oz: 0 }], 12, SW.clothBlack, { openBottom: true, openTop: true }),
      ...Array.from({ length: 12 }, (_, i) => { const a = rad(i * 30 + 15); if (Math.cos(a) > 0.8) return []; return part(slab([[-0.09, 0], [0.09, 0], [0.05, -0.13], [0.0, -0.20], [-0.05, -0.12]], 0.03, SW.clothBlack), { at: [Math.sin(a) * 0.525, -0.235, Math.cos(a) * 0.465 - 0.05], rot: [0, i * 30 + 15, 0] }); }), // hem tatters
      part(box(0.12, 0.10, 0.06, SW.iron), { at: [0, -0.02, 0.37] }), // clasp
    ),
    knifeBelt: () => join( // cutthroat: cross-belt with sheathed spare knives (worn, not thrown)
      part(box(0.10, 0.74, 0.05, SW.strap), { at: [0.03, -0.28, 0.30], rot: [0, 0, 34] }),
      part(box(0.10, 0.74, 0.05, SW.strap), { at: [0.03, -0.28, -0.30], rot: [0, 0, 34] }),
      ...[0, 1, 2].map(i => part(box(0.06, 0.20, 0.05, SW.leatherDark, { tx: 0.6 }), { at: [-0.06 + i * 0.13, -0.10 - i * 0.09, 0.32], rot: [0, 0, 34] })),
      ...[0, 1, 2].map(i => part(box(0.05, 0.07, 0.04, SW.steel), { at: [-0.12 + i * 0.13, 0.0 - i * 0.09, 0.32], rot: [0, 0, 34] })),
    ),
    furMantle: () => join( // marauder: heavy fur over the shoulders and the hood's drape
      part(loft([{ y: -0.22, rx: 0.60, rz: 0.52, oz: -0.05 }, { y: -0.06, rx: 0.60, rz: 0.52, oz: -0.04 }, { y: 0.08, rx: 0.50, rz: 0.45, oz: -0.03 }, { y: 0.15, rx: 0.40, rz: 0.37, oz: -0.02 }], 14, SW.fur, { openBottom: true, openTop: true }), {}),
      ...Array.from({ length: 14 }, (_, i) => { const a = rad(i * (360 / 14) + 6); return part(cyl(0.09, 0.0, 0.22, 4, i % 3 ? SW.fur : SW.furLight), { at: [Math.sin(a) * 0.57, -0.14, Math.cos(a) * 0.49 - 0.05], rot: [180 + Math.cos(a) * 18, 0, -Math.sin(a) * 18] }); }), // ragged fringe
      part(box(0.16, 0.12, 0.06, SW.brass), { at: [0, -0.06, 0.48] }), // clasp
    ),
    chestStrap: () => join( // marauder: iron-studded strap across the chest and a broad belt plate
      part(box(0.12, 0.90, 0.05, SW.leatherDark), { at: [0.0, -0.36, 0.30], rot: [0, 0, 30] }),
      ...[0, 1, 2].map(i => part(box(0.07, 0.07, 0.04, SW.iron), { at: [-0.10 + i * 0.12, -0.04 - i * 0.2, 0.33], rot: [0, 0, 30] })),
    ),
    // ---- shoulders (left side; the right one is the mirror) ----
    leatherPad: () => join(
      dome(0.22, 0.15, 0.23, 10, 3, SW.leather, -10, { openBottom: true }),
      part(dome(0.20, 0.11, 0.21, 10, 2, SW.leatherDark, -10, { openBottom: true }), { at: [0.05, -0.09, 0], rot: [0, 0, -22] }),
      part(dome(0.035, 0.03, 0.035, 5, 1, SW.rivet, -40), { at: [0.0, 0.15, 0.0] }),
    ),
    ironPauldron: () => join(
      dome(0.25, 0.17, 0.27, 12, 3, SW.iron, -10, { openBottom: true }),
      part(dome(0.23, 0.12, 0.25, 12, 2, SW.ironDark, -10, { openBottom: true }), { at: [0.06, -0.10, 0], rot: [0, 0, -24] }),
      part(dome(0.20, 0.09, 0.22, 12, 2, SW.iron, -10, { openBottom: true }), { at: [0.11, -0.18, 0], rot: [0, 0, -38] }),
      part(cyl(0.035, 0.0, 0.16, 6, SW.steel), { at: [0.02, 0.14, 0], rot: [0, 0, -24] }), // spike
    ),
    // ---- left forearm ----
    buckler: () => join( // round wooden buckler with an iron rim and boss (disc faces +z in its frame)
      part(cyl(0.29, 0.27, 0.05, 14, SW.wood), { rot: [90, 0, 0] }),
      part(loft([{ y: 0, rx: 0.30, rz: 0.30 }, { y: 0.07, rx: 0.30, rz: 0.30 }], 14, SW.ironDark, { openTop: true, openBottom: true }), { at: [0, 0, 0.02], rot: [-90, 0, 0] }),
      part(dome(0.11, 0.08, 0.11, 10, 2, SW.iron, 0), { at: [0, 0, 0.0], rot: [-90, 0, 0] }),
      part(box(0.50, 0.05, 0.03, SW.ironDark), { at: [0, -0.025, -0.012] }),
    ),
    // ---- weapons (dagger socket frame: blade along -z, grip from z +0.13 to -0.17, guard at about -0.2) ----
    knife: () => join(
      part(cyl(0.035, 0.032, 0.30, 6, SW.strap), { at: [0, 0, 0.13], rot: [-90, 0, 0] }), // grip
      part(dome(0.045, 0.045, 0.045, 6, 1, SW.iron, -90), { at: [0, 0, 0.14], rot: [-90, 0, 0] }), // pommel
      part(box(0.20, 0.05, 0.06, SW.ironDark, { tx: 0.8 }), { at: [0, -0.025, -0.19] }), // guard
      part(slab([[-0.05, 0], [0.06, 0], [0.065, 0.36], [0.03, 0.58], [-0.035, 0.66], [-0.045, 0.36]], 0.035, SW.steel, { bevel: 0.3, edge: SW.edge }), { at: [0, 0, -0.21], rot: [-90, 0, 0] }),
    ),
    handAxe: () => join(
      part(cyl(0.04, 0.035, 0.94, 7, SW.wood), { at: [0, 0, 0.12], rot: [-90, 0, 0] }), // haft
      part(cyl(0.048, 0.048, 0.18, 7, SW.strap), { at: [0, 0, 0.08], rot: [-90, 0, 0] }), // grip wrap
      part(box(0.10, 0.20, 0.10, SW.ironDark), { at: [0, 0, -0.62], rot: [-90, 0, 0] }), // eye
      part(slab([[0.04, -0.02], [0.18, -0.09], [0.33, -0.17], [0.36, 0.06], [0.33, 0.20], [0.18, 0.15], [0.04, 0.10]], 0.06, SW.iron, { bevel: 0.25, edge: SW.edge }), { at: [0, 0, -0.66], rot: [-90, 0, 0] }), // bearded blade
      part(slab([[-0.04, 0.0], [-0.15, 0.03], [-0.04, 0.08]], 0.05, SW.ironDark), { at: [0, 0, -0.66], rot: [-90, 0, 0] }), // back spike
    ),
    falchion: () => join(
      part(cyl(0.038, 0.038, 0.28, 7, SW.leatherDark), { at: [0, 0, 0.12], rot: [-90, 0, 0] }), // grip
      part(dome(0.06, 0.06, 0.06, 7, 2, SW.brass, -90), { at: [0, 0, 0.13], rot: [-90, 0, 0] }), // pommel
      part(box(0.36, 0.06, 0.07, SW.brass, { tx: 0.75 }), { at: [0, -0.03, -0.18] }), // cross guard
      part(slab([[-0.055, 0], [0.065, 0], [0.08, 0.40], [0.14, 0.80], [0.13, 0.96], [0.02, 1.08], [-0.045, 0.92], [-0.06, 0.44]], 0.045, SW.steel, { bevel: 0.25, edge: SW.edge }), { at: [0, 0, -0.21], rot: [-90, 0, 0] }),
    ),
  };

  const PIECE_KIND = { weapon: ['knife', 'handAxe', 'falchion'] };

  // ---------- sets ----------
  // Each variant: hide (model prop meshes to skip), body tint, attach list. An attachment is a piece placed in the
  // bind pose and skinned rigidly to one bone (bone: a skin joint name). Placement (at / rot in degrees / s) is in
  // bind-pose model space (the character standing, facing +z), or in the frame of a model node (frame: 'Rogue_Dagger'
  // = the dagger's own grip frame; mirrorFrame: the same frame mirrored to the left side).
  // mirror: true repeats the attachment mirrored in x on the other side's bone ('.L' <-> '.R').
  const HEAD = [0, 2.42, 0.06], CHEST = [0, 1.62, 0.0], NECK = [0, 2.0, 0.02];
  const SETS = {
    bandit: {
      model: 'Rogue',
      variants: {
        cutthroat: { // hood, face scarf, short cape, twin knives
          hide: ['Rogue_Dagger'], tint: [0.70, 0.62, 0.64],
          attach: [
            { piece: 'faceScarf', bone: 'Head', at: [0, 2.15, 0.06] },
            { piece: 'cowl', bone: 'Torso', at: NECK },
            { piece: 'knifeBelt', bone: 'Torso', at: CHEST },
            { piece: 'knife', bone: 'Weapon.R', frame: 'Rogue_Dagger' },
            { piece: 'knife', bone: 'Fist.L', frame: 'Rogue_Dagger', mirrorFrame: true, at: [-0.05, 0, 0] },
          ],
        },
        brigand: { // kettle hat, studded jerkin, one shoulder pad, hand axe and buckler
          hide: ['Rogue_Dagger', 'Pouch', 'Guard'], tint: [0.95, 0.80, 0.66],
          attach: [
            { piece: 'kettleHat', bone: 'Head', at: HEAD },
            { piece: 'jerkin', bone: 'Torso', at: CHEST },
            { piece: 'tassets', bone: 'Hips', at: [0, 1.18, -0.03] },
            { piece: 'thighFlap', bone: 'UpperLeg.L', at: [0.20, 1.12, 0.01], mirror: true },
            { piece: 'leatherPad', bone: 'UpperArm.L', at: [0.43, 1.89, 0.0], rot: [0, 0, -30] },
            { piece: 'handAxe', bone: 'Weapon.R', frame: 'Rogue_Dagger' },
            { piece: 'buckler', bone: 'LowerArm.L', at: [0.56, 1.30, 0.05], rot: [0, 90, 0] },
          ],
        },
        marauder: { // pointed nasal helm, fur mantle, iron pauldrons, broad falchion
          hide: ['Rogue_Dagger', 'Guard'], tint: [0.90, 0.68, 0.60],
          attach: [
            { piece: 'nasalHelm', bone: 'Head', at: HEAD },
            { piece: 'furMantle', bone: 'Torso', at: NECK },
            { piece: 'chestStrap', bone: 'Torso', at: CHEST },
            { piece: 'ironPauldron', bone: 'UpperArm.L', at: [0.46, 1.88, 0.0], rot: [0, 0, -30], mirror: true },
            { piece: 'falchion', bone: 'Weapon.R', frame: 'Rogue_Dagger' },
          ],
        },
      },
      // elites keep their variant and get blackened metal, red cloth and an ember edge on the weapon
      elite: { remap: { iron: 'blackSteel', ironDark: 'blackSteel', steel: 'ironDark', edge: 'emberEdge', clothBlack: 'bloodRed', leather: 'leatherDark', furLight: 'fur', brass: 'bronze' } },
    },
  };

  // ---------- deterministic variant choice ----------
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return h >>> 0; }
  function pick(setKey, id) { const set = SETS[setKey]; if (!set) return null; const names = Object.keys(set.variants); return names[hash(setKey + ':' + id) % names.length]; }

  // ---------- baking ----------
  function inv(m) { // affine 4x4 inverse
    const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C, k = 1 / det;
    const r = [A * k, -(b * i - c * h) * k, (b * f - c * e) * k, 0, B * k, (a * i - c * g) * k, -(a * f - c * d) * k, 0, C * k, -(a * h - b * g) * k, (a * e - b * d) * k, 0, 0, 0, 0, 1];
    const t = [m[12], m[13], m[14]]; r[12] = -(r[0] * t[0] + r[4] * t[1] + r[8] * t[2]); r[13] = -(r[1] * t[0] + r[5] * t[1] + r[9] * t[2]); r[14] = -(r[2] * t[0] + r[6] * t[1] + r[10] * t[2]); return r;
  }
  const mirrorBone = n => n.replace(/\.L$/, '.#').replace(/\.R$/, '.L').replace(/\.#$/, '.R');
  const cache = {};
  function pieceTris(name) { if (!PIECES[name]) throw new Error('equipment: unknown piece ' + name); return cache[name] || (cache[name] = PIECES[name]()); }

  // rig: { names[], parent[], joints[], ibm (Float32Array joints*16), prims: [{ nodeName }], rest (Float32Array nodes*16) }
  // rest = model-space node matrices of the model's default pose (arms down). Gear is authored in that pose; the skin's
  // bind pose (a T-pose here) differs, so each vertex is moved into bind space:
  // v_bind = inverse(ibm_j) * inverse(rest_j) * v_rest. Skinning (node_j * ibm_j) then
  // puts it back on the bone in every animation.
  // Returns { hide: Uint8Array per prim, verts: Float32Array (16 floats per vertex), tris, pieces }.
  // Throws if a bone, frame node, hidden prop or piece is missing: gear is never placed on a guessed bone.
  function bake(rig, setKey, variant, elite) {
    const set = SETS[setKey]; if (!set) throw new Error('equipment: unknown set ' + setKey);
    const v = set.variants[variant]; if (!v) throw new Error('equipment: unknown variant ' + setKey + '/' + variant);
    const missing = [], node = n => { const i = rig.names.indexOf(n); if (i < 0) missing.push(n); return i; };
    const joint = n => { const i = node(n); const jn = i < 0 ? -1 : rig.joints.indexOf(i); if (i >= 0 && jn < 0) missing.push(n + ' (not a skin joint)'); if (jn >= 32) missing.push(n + ' (joint index over 32)'); return jn; };
    const hide = new Uint8Array(rig.prims.length);
    for (const h of v.hide || []) { const k = rig.prims.findIndex(p => p.nodeName === h || p.name === h); if (k < 0) missing.push('prop ' + h); else hide[k] = 1; }
    const remap = elite && set.elite && set.elite.remap ? Object.fromEntries(Object.entries(set.elite.remap).map(([a, b]) => [SW[a], SW[b]])) : null;
    const list = [];
    for (const a of v.attach) {
      list.push(a);
      if (a.mirror) list.push(Object.assign({}, a, { bone: mirrorBone(a.bone), at: [-a.at[0], a.at[1], a.at[2]], rot: a.rot && [a.rot[0], -a.rot[1], -a.rot[2]], mirrored: true }));
    }
    const out = [], parts = []; let tris = 0;
    for (const a of list) {
      const start = out.length / 16;
      const jn = joint(a.bone); let base = null;
      if (a.frame) { // a model node's frame; mirrorFrame: that frame mirrored to the other side (left hand from the right-hand socket)
        const fi = node(a.frame);
        if (fi >= 0) {
          base = Array.from(rig.rest.subarray(fi * 16, fi * 16 + 16)); if (a.mirrorFrame) { const S = mat(null, null, [-1, 1, 1]); base = mm(mm(S, base), S); }
          let p = fi; while (p >= 0 && rig.joints.indexOf(p) < 0) p = rig.parent[p];
          if (!a.mirrorFrame && p >= 0 && rig.names[p] !== a.bone) missing.push(a.frame + ' is not under ' + a.bone);
        }
      }
      if (jn < 0 || (a.frame && !base)) continue;
      let M = mat(a.at, a.rot, a.s); if (a.mirrored) M = mm(M, mat(null, null, [-1, 1, 1])); if (base) M = mm(base, M);
      const j = rig.joints[jn], toBind = mm(inv(Array.from(rig.ibm.subarray(jn * 16, jn * 16 + 16))), inv(Array.from(rig.rest.subarray(j * 16, j * 16 + 16))));
      M = mm(toBind, M);
      for (const t of xform(pieceTris(a.piece), M)) {
        const [p0, p1, p2, sw0, c] = t, sw = remap && remap[sw0] !== undefined ? remap[sw0] : sw0;
        const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz); if (l < 1e-12) continue;
        nx /= l; ny /= l; nz /= l; let A = p0, B = p1, C = p2;
        const mx = (p0[0] + p1[0] + p2[0]) / 3 - c[0], my = (p0[1] + p1[1] + p2[1]) / 3 - c[1], mz = (p0[2] + p1[2] + p2[2]) / 3 - c[2];
        if (nx * mx + ny * my + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; B = p2; C = p1; }
        for (const p of [A, B, C]) out.push(p[0], p[1], p[2], nx, ny, nz, swU(sw), 0.5, jn, 0, 0, 0, 1, 0, 0, 0);
        tris++;
      }
      parts.push({ piece: a.piece, bone: a.bone, mirrored: !!a.mirrored, weapon: !!PIECE_KIND.weapon.includes(a.piece), range: [start, out.length / 16] });
    }
    if (missing.length) throw new Error('equipment ' + setKey + '/' + variant + ': missing ' + [...new Set(missing)].join(', '));
    return { hide, verts: new Float32Array(out), tris, pieces: list.length, parts };
  }

  // the attachments of a variant, with mirrored ones expanded (for tests and tools)
  function attachments(setKey, variant) { const v = SETS[setKey].variants[variant], l = []; for (const a of v.attach) { l.push(a); if (a.mirror) l.push(Object.assign({}, a, { bone: mirrorBone(a.bone), mirrored: true })); } return l; }

  return { SETS, PIECES, SW, PALETTE, PAL_W, pick, hash, bake, attachments, inv };
});
