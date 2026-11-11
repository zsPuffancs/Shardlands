'use strict';
// Shardlands village kit: dark-fantasy low-poly village assets, made in code with the engine's own mesh pipeline.
//
// Format: every asset is a set of parts, one triangle mesh per material (GL.meshFromArray: x,y,z,nx,ny,nz per vertex,
// flat-shaded facets). Colours and glow come from a palette per style (KIT_PALETTES), applied per instance, so the
// same geometry serves every biome. Assets are drawn with GPU instancing (GL.pushInst): one draw call per asset part,
// however many copies stand in the village. Nothing here is loaded from files; the kit is built once on first use.
//
// Local frame of every asset: +x along its width, +z its front (doors, the side that faces the portal), y up.
// Instances use the layout's yaw, so "front" always points where settlement.js says (faceCentre).

const VillageKit = (() => {
  // ---------- palettes (one per biome style; the same material names everywhere) ----------
  const DARK = {
    stone: [.30, .29, .32], stoneDark: [.18, .17, .20], stoneLight: [.40, .39, .42], moss: [.20, .24, .18],
    timber: [.19, .14, .11], timberLight: [.30, .23, .17], plaster: [.40, .37, .35], roof: [.15, .16, .20], roofAlt: [.22, .15, .16],
    iron: [.13, .13, .15], metal: [.26, .26, .29], bronze: [.42, .33, .2], cloth: [.32, .11, .13], clothAlt: [.20, .16, .27], clothPale: [.45, .42, .36],
    bone: [.60, .58, .51], foliage: [.14, .17, .13], deadwood: [.17, .14, .13], soil: [.17, .14, .12], gold: [.62, .5, .26], water: [.10, .13, .18],
    // biome materials (unused by the dark style; muted defaults so every palette has every key)
    snow: [.58, .6, .62], clay: [.36, .24, .18], straw: [.42, .36, .22], leaf: [.16, .2, .14],
    // glowing materials: [colour, emissive]
    window: [[.92, .6, .32], .5], rune: [[.6, .4, .95], .85], energy: [[.30, .16, .62], .8], energyMid: [[.46, .28, .86], .85], energyCore: [[.72, .62, .98], .8], spectral: [[.66, .6, .92], .75],
    coals: [[1, .42, .12], 1], candle: [[1, .82, .5], .9], ice: [[.6, .8, .95], .25], lava: [[1, .38, .08], 1],
  };
  const KIT_PALETTES = {
    dark: DARK,
    // Wildwood: warm timber frames, pale plaster, golden thatch, living green; amber lamps, a green-gold portal
    timber: { ...DARK, stone: [.44, .42, .38], stoneDark: [.30, .29, .27], stoneLight: [.55, .52, .47], moss: [.27, .40, .17], timber: [.30, .19, .11], timberLight: [.46, .33, .19],
      plaster: [.74, .66, .52], roof: [.58, .44, .22], roofAlt: [.44, .31, .15], iron: [.17, .16, .15], metal: [.36, .36, .38], cloth: [.56, .2, .13], clothAlt: [.24, .38, .2], clothPale: [.68, .62, .48],
      foliage: [.22, .42, .15], leaf: [.30, .52, .18], deadwood: [.34, .23, .14], soil: [.30, .21, .13], water: [.18, .34, .44], straw: [.74, .6, .3],
      window: [[1, .72, .38], .55], rune: [[.72, .95, .45], .8], energy: [[.16, .46, .22], .8], energyMid: [[.36, .74, .34], .85], energyCore: [[.82, 1, .66], .8], spectral: [[1, .78, .45], .8] },
    // Glacier: cold grey stone, dark timber, slate under heavy snow, frozen blue light
    snow: { ...DARK, stone: [.50, .52, .57], stoneDark: [.34, .36, .42], stoneLight: [.62, .64, .69], moss: [.84, .88, .94], timber: [.24, .17, .12], timberLight: [.37, .28, .2],
      plaster: [.64, .62, .60], roof: [.24, .27, .33], roofAlt: [.34, .25, .22], iron: [.16, .17, .2], metal: [.42, .44, .5], cloth: [.36, .18, .2], clothAlt: [.2, .3, .44], clothPale: [.7, .7, .72],
      foliage: [.12, .25, .24], leaf: [.14, .28, .26], deadwood: [.26, .2, .17], soil: [.6, .64, .7], water: [.4, .55, .66], snow: [.9, .93, .98],
      window: [[1, .78, .5], .55], rune: [[.5, .82, 1], .9], energy: [[.18, .42, .66], .8], energyMid: [[.4, .7, .95], .85], energyCore: [[.82, .95, 1], .85], spectral: [[.66, .88, 1], .85], ice: [[.7, .88, 1], .35] },
    // Warfields: warm sandstone, adobe plaster, flat roofs and domes, sun-bleached awnings, gold light
    sandstone: { ...DARK, stone: [.66, .53, .36], stoneDark: [.48, .37, .24], stoneLight: [.76, .64, .46], moss: [.56, .46, .3], timber: [.34, .23, .14], timberLight: [.5, .37, .22],
      plaster: [.78, .66, .48], roof: [.62, .49, .33], roofAlt: [.7, .4, .24], iron: [.26, .2, .14], metal: [.5, .4, .26], bronze: [.62, .46, .24], cloth: [.68, .3, .16], clothAlt: [.2, .38, .46], clothPale: [.86, .78, .6],
      foliage: [.34, .44, .16], leaf: [.42, .52, .2], deadwood: [.44, .32, .2], soil: [.5, .38, .24], water: [.2, .42, .5], clay: [.66, .36, .2], straw: [.78, .64, .36],
      window: [[1, .78, .42], .5], rune: [[1, .76, .32], .85], energy: [[.6, .38, .1], .8], energyMid: [[.9, .62, .2], .85], energyCore: [[1, .9, .6], .85], spectral: [[1, .82, .45], .85] },
    // Volcanic: basalt, scorched timber, black iron roofs, glowing cracks and fire
    ember: { ...DARK, stone: [.17, .15, .15], stoneDark: [.09, .08, .08], stoneLight: [.25, .22, .21], moss: [.30, .27, .25], timber: [.11, .08, .07], timberLight: [.2, .14, .11],
      plaster: [.26, .2, .18], roof: [.13, .11, .11], roofAlt: [.26, .11, .07], iron: [.1, .09, .09], metal: [.24, .21, .2], cloth: [.46, .12, .06], clothAlt: [.28, .1, .06], clothPale: [.36, .3, .26],
      bone: [.5, .46, .4], foliage: [.18, .09, .06], leaf: [.22, .1, .05], deadwood: [.1, .07, .06], soil: [.13, .09, .08], water: [.3, .1, .05],
      window: [[1, .5, .2], .6], rune: [[1, .38, .1], 1], energy: [[.55, .14, .04], .85], energyMid: [[1, .38, .1], .9], energyCore: [[1, .78, .4], .9], spectral: [[1, .55, .2], .9], lava: [[1, .36, .06], 1] },
    // Voidscar: corrupted violet stone, black timber, crystal growths and floating shards, magenta light
    void: { ...DARK, stone: [.22, .18, .29], stoneDark: [.12, .10, .18], stoneLight: [.32, .27, .40], moss: [.32, .18, .42], timber: [.13, .1, .16], timberLight: [.22, .17, .27],
      plaster: [.30, .26, .38], roof: [.16, .12, .25], roofAlt: [.28, .14, .32], iron: [.1, .08, .13], metal: [.3, .26, .38], cloth: [.36, .12, .4], clothAlt: [.16, .2, .38], clothPale: [.44, .4, .5],
      bone: [.56, .52, .6], foliage: [.24, .14, .32], leaf: [.3, .16, .4], deadwood: [.14, .1, .18], soil: [.14, .1, .18], water: [.2, .1, .3],
      window: [[.9, .5, 1], .55], rune: [[.86, .38, 1], 1], energy: [[.4, .08, .5], .85], energyMid: [[.72, .26, .9], .9], energyCore: [[1, .72, 1], .85], spectral: [[.82, .48, 1], .9], ice: [[.75, .5, 1], .5] },
  };

  // ---------- biome styles: what each style changes on the shared recipes and placement ----------
  // roof: slate | thatch | snow | flat | iron | void;  wall: stone | palisade;  cracks: glowing seams on stone (lava / rune)
  // trees, garden, bush: which assets stand in for the layout's trees, gardens and flower beds; details: the scatter.
  // energy: the live portal ring and sparks.
  const SHARED_DETAIL = [['barrels', 10], ['crates', 10], ['supplies', 9], ['fence', 12], ['sign', 6], ['rock', 9]];
  const KIT_STYLE = {
    dark: { roof: 'slate', wall: 'stone', trees: ['deadTree', 'deadTreeB'], garden: 'graves', bush: 'bush', energy: [.55, .38, 1], spark: [.62, .42, 1],
      details: [['barrels', 10], ['crates', 10], ['supplies', 9], ['fence', 12], ['bones', 7], ['wreck', 12], ['sign', 6], ['bush', 9], ['rock', 9], ['deadTreeB', 10]] },
    timber: { roof: 'thatch', wall: 'palisade', trees: ['treeOak', 'treeBirch'], garden: 'vegPlot', bush: 'flowerBed', energy: [.45, .85, .4], spark: [.7, 1, .5], chimney: true,
      details: [...SHARED_DETAIL, ['hay', 10], ['logPile', 11], ['flowerBed', 8], ['bush', 9], ['treeBirch', 10]] },
    snow: { roof: 'snow', wall: 'stone', snowCap: true, trees: ['pine', 'pineB'], garden: 'woodpile', bush: 'snowShrub', energy: [.45, .78, 1], spark: [.72, .9, 1], chimney: true,
      details: [...SHARED_DETAIL, ['logPile', 11], ['snowDrift', 10], ['iceSpire', 8], ['snowShrub', 8], ['pineB', 10]] },
    sandstone: { roof: 'flat', wall: 'stone', trees: ['palm', 'palmB'], garden: 'potGarden', bush: 'potPlant', energy: [1, .72, .3], spark: [1, .85, .5], awnings: true,
      details: [...SHARED_DETAIL, ['pots', 8], ['potPlant', 7], ['awningStall', 13], ['palmB', 10], ['wreck', 12]] },
    ember: { roof: 'iron', wall: 'stone', cracks: 'lava', trees: ['charred', 'charredB'], garden: 'lavaPool', bush: 'obsidian', energy: [1, .45, .12], spark: [1, .6, .2], chimney: true,
      details: [...SHARED_DETAIL, ['obsidian', 9], ['lavaVent', 9], ['bones', 7], ['charredB', 10], ['wreck', 12]] },
    void: { roof: 'void', wall: 'stone', cracks: 'rune', shards: true, trees: ['crystalTree', 'crystalTreeB'], garden: 'crystalBed', bush: 'shards', energy: [.85, .4, 1], spark: [.95, .6, 1],
      details: [...SHARED_DETAIL, ['shards', 9], ['voidStone', 9], ['bones', 7], ['crystalTreeB', 10], ['wreck', 12]] },
  };
  let ST = KIT_STYLE.dark, STKEY = 'dark';

  // ---------- geometry builder ----------
  // Small affine transforms: T = { p: [x,y,z], yaw, pitch, roll, s: [sx,sy,sz] }.
  function xform(t) {
    const cy = Math.cos(t.yaw || 0), sy = Math.sin(t.yaw || 0), cp = Math.cos(t.pitch || 0), sp = Math.sin(t.pitch || 0), cr = Math.cos(t.roll || 0), sr = Math.sin(t.roll || 0), p = t.p || [0, 0, 0];
    return v => {
      let x = v[0], y = v[1], z = v[2];
      let x1 = x * cr - y * sr, y1 = x * sr + y * cr; x = x1; y = y1;                    // roll (around z)
      let y2 = y * cp - z * sp, z2 = y * sp + z * cp; y = y2; z = z2;                    // pitch (around x)
      const x3 = x * cy + z * sy, z3 = -x * sy + z * cy;                                 // yaw (around y), like the engine
      return [x3 + p[0], y + p[1], z3 + p[2]];
    };
  }
  function seeded(s) { return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  function Asset(name) {
    const seedName = STKEY === 'dark' ? name : name + '@' + STKEY; // the dark style keeps its original seeds
    const parts = {}; let rnd = seeded(seedName.split('').reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7) & 0x7fffffff || 1);
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    // a convex piece: triangles get flat normals pointing away from the piece's centre
    function piece(mat, tris) {
      const out = parts[mat] || (parts[mat] = []); let cx = 0, cy = 0, cz = 0, n = 0;
      for (const t of tris) for (const v of t) { cx += v[0]; cy += v[1]; cz += v[2]; n++; }
      const c = [cx / n, cy / n, cz / n];
      for (const [a, b, d] of tris) {
        let nn = cross(sub(b, a), sub(d, a)); const l = Math.hypot(...nn); if (l < 1e-9) continue; nn = nn.map(v => v / l);
        const m = [(a[0] + b[0] + d[0]) / 3 - c[0], (a[1] + b[1] + d[1]) / 3 - c[1], (a[2] + b[2] + d[2]) / 3 - c[2]];
        if (nn[0] * m[0] + nn[1] * m[1] + nn[2] * m[2] < 0) nn = nn.map(v => -v);
        out.push(a[0], a[1], a[2], ...nn, b[0], b[1], b[2], ...nn, d[0], d[1], d[2], ...nn);
      }
    }
    // a flat, one-sided surface with a given normal hint (used for glowing panes inside frames)
    function panel(mat, pts, normal) {
      const out = parts[mat] || (parts[mat] = []);
      for (let i = 1; i + 1 < pts.length; i++) { const tri = [pts[0], pts[i], pts[i + 1]]; for (const v of tri) out.push(v[0], v[1], v[2], ...normal); }
    }
    const quad = (a, b, c, d) => [[a, b, c], [a, c, d]];
    const hexa = (mat, v) => piece(mat, [...quad(v[0], v[1], v[2], v[3]), ...quad(v[4], v[5], v[6], v[7]), ...quad(v[0], v[1], v[5], v[4]), ...quad(v[1], v[2], v[6], v[5]), ...quad(v[2], v[3], v[7], v[6]), ...quad(v[3], v[0], v[4], v[7])]);
    const J = (k) => (rnd() - .5) * 2 * k;
    const api = {
      rnd, J,
      // box from y to y+h; taper shrinks the top; jitter roughens the corners (weathered stone)
      box(mat, { x = 0, y = 0, z = 0, w, h, d, yaw = 0, pitch = 0, roll = 0, taper = 1, jitter = 0, tz }) {
        const T = xform({ p: [x, y, z], yaw, pitch, roll }), hw = w / 2, hd = d / 2, tw = hw * taper, td = hd * (tz === undefined ? taper : tz);
        const v = [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd], [-tw, h, -td], [tw, h, -td], [tw, h, td], [-tw, h, td]].map(p => T([p[0] + J(jitter), p[1] + (p[1] ? J(jitter) : 0), p[2] + J(jitter)]));
        hexa(mat, v);
      },
      // gable roof: ridge along x
      gable(mat, { x = 0, y = 0, z = 0, w, h, d, yaw = 0, ridge = 1 }) {
        const T = xform({ p: [x, y, z], yaw }), hw = w / 2, hd = d / 2, rw = hw * ridge;
        const a = T([-hw, 0, -hd]), b = T([hw, 0, -hd]), c = T([hw, 0, hd]), e = T([-hw, 0, hd]), f = T([-rw, h, 0]), g = T([rw, h, 0]);
        piece(mat, [...quad(a, b, g, f), ...quad(e, c, g, f), [a, e, f], [b, c, g], ...quad(a, b, c, e)]);
      },
      // hip roof: four slopes up to a short ridge
      hip(mat, { x = 0, y = 0, z = 0, w, h, d, yaw = 0 }) {
        const T = xform({ p: [x, y, z], yaw }), hw = w / 2, hd = d / 2, r = Math.max(0, hw - hd);
        const a = T([-hw, 0, -hd]), b = T([hw, 0, -hd]), c = T([hw, 0, hd]), e = T([-hw, 0, hd]), f = T([-r, h, 0]), g = T([r, h, 0]);
        piece(mat, [...quad(a, b, g, f), ...quad(e, c, g, f), [a, e, f], [b, c, g], ...quad(a, b, c, e)]);
      },
      // n-sided frustum (r1 = 0: cone); axis up, or turned with pitch/roll
      cyl(mat, { x = 0, y = 0, z = 0, r0, r1 = r0, h, n = 8, yaw = 0, pitch = 0, roll = 0, jitter = 0, a0 = 0 }) {
        const T = xform({ p: [x, y, z], yaw, pitch, roll }), tris = [], bot = [], top = [];
        for (let i = 0; i < n; i++) { const a = a0 + i / n * Math.PI * 2, k = 1 + J(jitter); bot.push(T([Math.cos(a) * r0 * k, J(jitter * 3), Math.sin(a) * r0 * k])); top.push(T([Math.cos(a) * r1 * k, h + J(jitter * 3), Math.sin(a) * r1 * k])); }
        const cb = T([0, 0, 0]), ct = T([0, h, 0]);
        for (let i = 0; i < n; i++) { const j = (i + 1) % n; if (r1 > 0) tris.push(...quad(bot[i], bot[j], top[j], top[i]), [ct, top[i], top[j]]); else tris.push([bot[i], bot[j], ct]); tris.push([cb, bot[j], bot[i]]); }
        piece(mat, tris);
      },
      // lumpy low-poly blob (rocks, bushes, sacks): a jittered octahedron, subdivided once
      blob(mat, { x = 0, y = 0, z = 0, rx, ry, rz, jitter = .25, yaw = 0 }) {
        const T = xform({ p: [x, y, z], yaw }), base = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        const faces = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]], cache = new Map();
        const pts = base.map(p => p.slice()), mid = (i, j) => { const k = i < j ? i + ',' + j : j + ',' + i; if (!cache.has(k)) { const m = [(pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2, (pts[i][2] + pts[j][2]) / 2], l = Math.hypot(...m); pts.push(m.map(v => v / l)); cache.set(k, pts.length - 1); } return cache.get(k); };
        const fine = []; for (const [a, b, c] of faces) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); fine.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); }
        const P = pts.map(p => { const k = 1 + J(jitter); return T([p[0] * rx * k, Math.max(-.2, p[1]) * ry * k + ry * .2, p[2] * rz * k]); });
        piece(mat, fine.map(f => f.map(i => P[i])));
      },
      // elongated n-sided bipyramid
      crystal(mat, { x = 0, y = 0, z = 0, r, h, n = 5, yaw = 0, roll = 0 }) {
        const T = xform({ p: [x, y, z], yaw, roll }), ring = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; ring.push(T([Math.cos(a) * r, h * .38, Math.sin(a) * r])); }
        const top = T([0, h, 0]), bot = T([0, 0, 0]), tris = []; for (let i = 0; i < n; i++) { const j = (i + 1) % n; tris.push([ring[i], ring[j], top], [ring[j], ring[i], bot]); } piece(mat, tris);
      },
      // a stone arc in the x-y plane (portal and gate arches): centre (cx, cy), from angle a0 to a1, thickness t (radial), depth d (z)
      arc(mat, { cx = 0, cy = 0, z = 0, r, t, d, a0, a1, n = 8, jitter = 0, pointed = 0, yaw = 0 }) {
        const Y = xform({ yaw });
        for (let i = 0; i < n; i++) {
          const ang = k => a0 + (a1 - a0) * k / n, pt = (a, rr, zz) => { const pk = pointed * Math.sin(a) ** 6; return [cx + Math.cos(a) * rr * (1 - pk * .25), cy + Math.sin(a) * rr * (1 + pk), zz]; };
          const A0 = ang(i), A1 = ang(i + 1), jj = () => J(jitter);
          hexa(mat, [pt(A0, r - t / 2, -d / 2), pt(A1, r - t / 2, -d / 2), pt(A1, r + t / 2 + jj(), -d / 2), pt(A0, r + t / 2, -d / 2), pt(A0, r - t / 2, d / 2), pt(A1, r - t / 2, d / 2), pt(A1, r + t / 2 + jj(), d / 2), pt(A0, r + t / 2, d / 2)].map(p => Y([p[0], p[1], p[2] + z])));
        }
      },
      panel, piece, hexa, quad,
      done() { return { name, parts }; },
    };
    return api;
  }

  // ---------- asset recipes ----------
  // Shared details, so every building speaks the same language.
  function windowAt(A, { x, y, z, w = 7, h = 9, yaw = 0, shutters = true }) {
    const T = xform({ p: [x, y, z], yaw });
    A.box('timber', { x, y: y - 1.2, z, w: w + 3, h: 1.4, d: 2.2, yaw });                  // sill
    A.box('timber', { x, y: y + h, z, w: w + 3, h: 1.6, d: 2.2, yaw });                     // lintel
    A.panel('window', [T([-w / 2, 0, 1.15]), T([w / 2, 0, 1.15]), T([w / 2, h, 1.15]), T([-w / 2, h, 1.15])].map(p => [p[0], p[1] - y + y, p[2]]), [Math.sin(yaw), 0, Math.cos(yaw)]);
    A.box('iron', { x, y, z: z, w: .8, h, d: 2.4, yaw });                                    // mullion
    if (shutters) for (const s of [-1, 1]) { const q = xform({ p: [x, y, z], yaw })([s * (w / 2 + 2.4), 0, .6]); A.box('timberLight', { x: q[0], y, z: q[2], w: 3.6, h: h + .5, d: 1, yaw: yaw + s * .25 }); }
  }
  function doorAt(A, { x, y = 0, z, w = 12, h = 22, yaw = 0, arch = false }) {
    const T = xform({ p: [x, y, z], yaw });
    const c = T([0, 0, .4]); A.box('timber', { x: c[0], y, z: c[2], w, h, d: 2, yaw });
    for (const s of [-1, 1]) { const q = T([s * (w / 2 + 1.4), 0, .8]); A.box('stoneDark', { x: q[0], y, z: q[2], w: 2.6, h: h + 2, d: 3, yaw, jitter: .3 }); }
    const l = T([0, h, .8]); A.box(arch ? 'stoneDark' : 'timberLight', { x: l[0], y: y + h, z: l[2], w: w + 6, h: arch ? 4 : 2.4, d: 3, yaw, taper: arch ? .7 : 1 });
    for (const k of [-1, 1]) { const b = T([0, h * (.5 + k * .28), 1.6]); A.box('iron', { x: b[0], y: y + h * (.5 + k * .28), z: b[2], w: w * .9, h: 1, d: .6, yaw }); }
    const r = T([w * .3, h * .45, 1.8]); A.box('bronze', { x: r[0], y: y + h * .45, z: r[2], w: 1.6, h: 1.6, d: .8, yaw });
  }
  function chimney(A, { x, z, y0, h, yaw = 0 }) { A.box('stone', { x, y: y0, z, w: 7, h, d: 7, yaw, jitter: .35, taper: .9 }); A.box('stoneDark', { x, y: y0 + h, z, w: 8.5, h: 2, d: 8.5, yaw }); return [x, y0 + h + 2, z]; }
  function lanternAt(A, { x, y, z }) { A.box('iron', { x, y: y + 6.5, z, w: 4.6, h: 1, d: 4.6 }); A.cyl('spectral', { x, y, z, r0: 1.6, r1: 1.6, h: 5.5, n: 4 }); A.cyl('iron', { x, y: y + 7.4, z, r0: 2.6, r1: 0, h: 3, n: 4 }); return [x, y + 3, z]; }

  // ---------- style treatments (the dark style draws exactly the plain call; the others add their own look) ----------
  // Gable roof, ridge along local x. Returns the height of its top.
  function roofGable(A, o, mat = 'roof') {
    const { x = 0, y = 0, z = 0, w, h, d, yaw = 0 } = o, T = xform({ p: [x, y, z], yaw });
    if (ST.roof === 'flat') return flatRoof(A, o);
    if (ST.roof === 'thatch') { // thick golden thatch: deep overhang, a darker eave band and a ridge roll
      A.gable(mat, { ...o, y: y - 1.5, w: w + 4, h: h + 2, d: d + 5 });
      for (const sd of [-1, 1]) { const q = T([0, 0, sd * (d / 2 + 1.2)]); A.box('roofAlt', { x: q[0], y: y - 2.4, z: q[2], w: w + 4.6, h: 2.6, d: 3.4, yaw, pitch: sd * .5 }); }
      const r = T([(w + 3) / 2, h + .3, 0]); A.cyl('roofAlt', { x: r[0], y: r[1] - .8, z: r[2], r0: 2.4, r1: 2.4, h: w + 3, n: 6, roll: Math.PI / 2, yaw }); // ridge roll along the ridge
      return y + h + 2;
    }
    A.gable(mat, o);
    if (ST.roof === 'snow') { // snow on the upper slopes, with a soft ridge and icicles on the eaves
      const f = .4; A.gable('snow', { ...o, y: y + h * f - .4, w: w + 1.4, h: h * (1 - f) + 1.4, d: d * (1 - f) + 2.2 });
      for (const sd of [-1, 1]) for (let k = 0; k < 5; k++) { const q = T([-w * .4 + k * w * .2 + A.J(2), 0, sd * (d / 2 + .2)]); A.cyl('ice', { x: q[0], y: y - 4 - A.rnd() * 2, z: q[2], r0: .2, r1: .9, h: 4 + A.rnd() * 2, n: 4 }); }
    } else if (ST.roof === 'iron') { // black iron sheets with glowing seams and a scorched ridge
      for (let k = -2; k <= 2; k++) for (const sd of [-1, 1]) { const q = T([k * w / 5, h * .45, sd * d * .26]); A.box('lava', { x: q[0], y: q[1], z: q[2], w: .7, h: .4, d: d * .5, yaw, pitch: sd * Math.atan2(h, d / 2) }); }
      const r = T([0, h - .6, 0]); A.box('roofAlt', { x: r[0], y: r[1], z: r[2], w: w + 1, h: 1.8, d: 3, yaw });
    } else if (ST.roof === 'void') { // crystal growths breaking through the roof
      for (let k = 0; k < 3; k++) { const q = T([(A.rnd() - .5) * w * .7, h * (.35 + A.rnd() * .3), (A.rnd() - .5) * d * .3]); A.crystal('rune', { x: q[0], y: q[1], z: q[2], r: 1.6 + A.rnd() * 1.6, h: 10 + A.rnd() * 10, n: 4, roll: A.J(.5), yaw: A.rnd() * 6 }); }
    }
    return y + h;
  }
  function roofHip(A, o, mat = 'roof') {
    const { x = 0, y = 0, z = 0, w, h, d, yaw = 0 } = o;
    if (ST.roof === 'flat') return flatRoof(A, o);
    if (ST.roof === 'thatch') { A.hip(mat, { ...o, y: y - 1.5, w: w + 4, h: h + 2, d: d + 4 }); A.box('roofAlt', { x, y: y - 2.2, z, w: w + 4.4, h: 2.4, d: d + 4.4, yaw }); return y + h; }
    A.hip(mat, o);
    if (ST.roof === 'snow') A.hip('snow', { ...o, y: y + h * .42 - .4, w: w * .62 + 1.2, h: h * .58 + 1.2, d: d * .58 + 1.2 });
    else if (ST.roof === 'iron') { A.box('lava', { x, y: y + .2, z, w: w + .4, h: .5, d: d + .4, yaw }); A.box('roofAlt', { x, y: y + h - 1, z, w: Math.max(4, w - d) + 2, h: 1.6, d: 2.6, yaw }); }
    else if (ST.roof === 'void') A.crystal('rune', { x, y: y + h * .7, z, r: 2.6, h: 16, n: 4, roll: .2 });
    return y + h;
  }
  // Cone roof (towers, spires). Sandstone gets a dome instead.
  function roofCone(A, o, mat = 'roof') {
    const { x = 0, y = 0, z = 0, r0, h, n = 8, a0 = 0 } = o;
    if (ST.roof === 'flat') return dome(A, mat, { x, y, z, r: r0 * .92, h: Math.min(h * .55, r0 * 1.05), n: Math.max(8, n) });
    if (ST.roof === 'thatch') { A.cyl(mat, { ...o, r0: r0 + 2, y: y - 1 }); A.cyl('roofAlt', { x, y: y - 2, z, r0: r0 + 2.4, r1: r0 + 1.8, h: 2.4, n, a0 }); return y + h; }
    A.cyl(mat, o);
    if (ST.roof === 'snow') A.cyl('snow', { x, y: y + h * .42, z, r0: r0 * .6 + .8, r1: 0, h: h * .58 + .8, n, a0 });
    else if (ST.roof === 'iron') { A.cyl('lava', { x, y: y + .1, z, r0: r0 + .3, r1: r0 + .1, h: .6, n, a0 }); A.cyl('roofAlt', { x, y: y + h * .8, z, r0: r0 * .2 + .4, r1: 0, h: h * .3, n, a0 }); }
    else if (ST.roof === 'void') { A.cyl(mat, { x, y: y + h * .82, z, r0: r0 * .16, r1: 0, h: h * .45, n: 4, roll: .25, a0 }); A.crystal('rune', { x: x + r0 * .3, y: y + h * .3, z, r: 1.8, h: 12, n: 4, roll: -.6 }); }
    return y + h;
  }
  // Sandstone: a flat roof with a parapet, protruding beam ends and a few roof-top pots.
  function flatRoof(A, { x = 0, y = 0, z = 0, w, d, yaw = 0 }) {
    const T = xform({ p: [x, y, z], yaw }), W = w * .88, D = d * .86;
    A.box('roof', { x, y: y - 1, z, w: W, h: 3, d: D, yaw });
    for (const [lx, lz, ww, dd] of [[0, D / 2, W + 1, 2.4], [0, -D / 2, W + 1, 2.4], [W / 2, 0, 2.4, D], [-W / 2, 0, 2.4, D]]) { const q = T([lx, 0, lz]); A.box('stoneLight', { x: q[0], y: y + 2, z: q[2], w: ww, h: 3.6, d: dd, yaw }); }
    for (let k = -2; k <= 2; k++) { const q = T([k * W / 5.5, 0, D / 2 + 1.5]); A.box('timber', { x: q[0], y: y - 3.4, z: q[2], w: 1.8, h: 1.8, d: 4, yaw }); }
    const q = T([W * .28, 0, -D * .2]); A.cyl('clay', { x: q[0], y: y + 2, z: q[2], r0: 2, r1: 2.6, h: 4, n: 7 });
    return y + 6;
  }
  function dome(A, mat, { x = 0, y = 0, z = 0, r, h, n = 10 }) {
    const rings = [[1, 0], [.94, .34], [.78, .62], [.52, .86], [0, 1]];
    for (let k = 0; k < rings.length - 1; k++) A.cyl(mat, { x, y: y + rings[k][1] * h, z, r0: r * rings[k][0], r1: r * rings[k + 1][0], h: (rings[k + 1][1] - rings[k][1]) * h, n });
    A.cyl('gold', { x, y: y + h, z, r0: .6, r1: .2, h: 6, n: 4 });
    return y + h;
  }
  // Facade treatment of a w x d building standing at y0 with walls h high (front = +z).
  function decorHouse(A, { w, d, h, y0 = 4, door = 0 }) {
    if (ST.cracks) { // glowing seams climbing the walls (lava in Ember, rune veins in Void)
      for (const [sx, sz, yaw] of [[1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2], [0, -1, Math.PI]]) {
        let yy = y0 + 1, off = A.J(w * .2); const n = 3 + Math.floor(A.rnd() * 2);
        for (let k = 0; k < n; k++) { const len = 4 + A.rnd() * 5, roll = A.J(.7), px = sx ? sx * (w / 2 + .35) : off, pz = sz ? sz * (d / 2 + .35) : off; A.box(ST.cracks, { x: px, y: yy, z: pz, w: .7, h: len, d: .5, yaw, roll }); yy += len * .9; off += Math.sin(roll) * len * -1; }
      }
    }
    if (ST.shards) for (let k = 0; k < 2; k++) { const a = A.rnd() * 6.28; A.crystal('rune', { x: Math.cos(a) * (w / 2 + 6), y: y0 + h * (.5 + A.rnd() * .4), z: Math.sin(a) * (d / 2 + 6), r: 1.4, h: 5, n: 4, roll: A.J(.6) }); }
    if (ST.snowCap) { for (const [x, z] of [[-w / 2 - 2, d / 2 + 1], [w / 2 + 2, d / 2 - 4], [-w / 2, -d / 2 - 1]]) A.blob('snow', { x, y: -1, z, rx: 6 + A.rnd() * 3, ry: 2.6, rz: 4.5, jitter: .2 }); }
    if (ST.awnings) { A.box('cloth', { x: door, y: y0 + 21, z: d / 2 + 5, w: 18, h: .8, d: 10, pitch: .32 }); for (const s of [-1, 1]) A.box('timber', { x: door + s * 8.6, y: 0, z: d / 2 + 9.4, w: 1.2, h: y0 + 18, d: 1.2 }); A.cyl('clay', { x: -w / 2 + 3, y: 0, z: d / 2 + 4, r0: 2.4, r1: 3.4, h: 6, n: 7 }); }
    if (ST.roof === 'thatch') { A.box('timber', { x: w * .3, y: y0 + 10, z: d / 2 + 2, w: 12, h: 2, d: 3 }); for (let k = 0; k < 4; k++) A.blob(k % 2 ? 'cloth' : 'leaf', { x: w * .3 - 4.5 + k * 3, y: y0 + 12, z: d / 2 + 2.4, rx: 1.8, ry: 1.6, rz: 1.4 }); }
  }

  const gabled = () => ST.roof !== 'flat' && ST.roof !== 'thatch';
  const R = {};
  // --- the World Portal: a pointed gothic arch between two rune monoliths on a stepped dais, energy held inside ---
  R.portal = () => {
    const A = Asset('portal'), anchors = { lights: [], energy: [] };
    A.cyl('stoneDark', { r0: 62, r1: 60, h: 3, n: 8, a0: Math.PI / 8 }); A.cyl('stone', { y: 3, r0: 54, r1: 52, h: 3.5, n: 8, a0: Math.PI / 8 }); A.cyl('stoneLight', { y: 6.5, r0: 45, r1: 44, h: 2.5, n: 8, a0: Math.PI / 8 });
    for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4, x = Math.cos(a) * 49, z = Math.sin(a) * 49; A.box('rune', { x, y: 6.4, z, w: 9, h: .4, d: 2, yaw: Math.PI / 2 - a }); }
    // Two crossed gates (east-west, and a smaller north-south one): rune monoliths, a pointed arch and the held energy.
    const gate = (yaw, k, half) => {
      const T = xform({ yaw }), at = (x, y, z) => T([x, y, z]);
      for (const s of [-1, 1]) {
        let q = at(s * half, 0, 0); A.box('stoneDark', { x: q[0], y: 9, z: q[2], w: 24 * k, h: 10, d: 24 * k, yaw, jitter: .6 });
        A.box('stone', { x: q[0], y: 19, z: q[2], w: 17 * k, h: 104 * k, d: 18 * k, taper: .78, jitter: 1, roll: -s * .02, yaw });
        q = at(s * (half - 1), 0, 0); A.box('stoneLight', { x: q[0], y: 19 + 104 * k, z: q[2], w: 20 * k, h: 6, d: 21 * k, jitter: .5, yaw });
        for (let n = 0; n < 5; n++) { q = at(s * (half - 7.4 * k), 0, n % 2 ? 2 : -2); A.box('rune', { x: q[0], y: 32 + n * 17 * k, z: q[2], w: .8, h: 9 * k, d: 2.4, yaw }); }
        q = at(s * half, 0, 0); A.crystal('rune', { x: q[0], y: 25 + 104 * k, z: q[2], r: 3.4, h: 16, n: 4 });
        for (const t of [-1, 1]) { q = at(s * (half + 6), 0, t * 9 * k); A.box('stoneDark', { x: q[0], y: 9, z: q[2], w: 6, h: 30 * k, d: 6, taper: .6, jitter: .4, roll: s * .12, yaw }); }
      }
      const top = 19 + 104 * k + 3, r = half, inner = half - 12;
      A.arc('stone', { cx: 0, cy: top, r, t: 13 * k, d: 16 * k, a0: 0, a1: Math.PI, n: 10, jitter: .8, pointed: .55, yaw });
      A.arc('stoneDark', { cx: 0, cy: top, r: half - 9, t: 3, d: 18 * k, a0: .08, a1: Math.PI - .08, n: 10, pointed: .55, yaw });
      const shape = []; for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI, pk = .55 * Math.sin(a) ** 6; shape.push([Math.cos(a) * inner * (1 - pk * .25), top + Math.sin(a) * inner * (1 + pk), 0]); }
      shape.push([-inner, 14, 0], [inner, 14, 0]);
      const n = T([0, 0, 1]), pane = (mat, s2, z) => { const pts = shape.map(p => T([p[0] * s2, 14 + (p[1] - 14) * s2, z])); A.panel(mat, pts, n); A.panel(mat, pts.slice().reverse(), n.map(v => -v)); };
      pane('energy', 1, 0); pane('energyMid', .7, .5); pane('energyMid', .7, -.5); pane('energyCore', .34, 1); pane('energyCore', .34, -1);
      for (let g = 0; g < 7; g++) { const a = g / 7 * Math.PI * 2, q = at(Math.cos(a) * inner * .5, 0, g % 2 ? 1.6 : -1.6); A.box('energyCore', { x: q[0], y: 70 * k + Math.sin(a) * 36 * k, z: q[2], w: 2.6, h: 8, d: .3, roll: a, yaw }); }
      return top + half * 1.55;
    };
    const peak = gate(0, 1, 46); gate(Math.PI / 2, .86, 40);
    A.crystal('energyCore', { y: peak + 2, r: 4.5, h: 18, n: 5 });
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + .5; A.crystal('rune', { x: Math.cos(a) * 60, y: 40 + (k % 3) * 22, z: Math.sin(a) * 60, r: 2.2, h: 8, n: 4, roll: .4 }); }
    // small rune stones around the dais
    for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2, x = Math.cos(a) * 56, z = Math.sin(a) * 56; A.box('stone', { x, y: 0, z, w: 6, h: 16, d: 5, yaw: Math.PI / 2 - a, taper: .7, jitter: .5 }); A.box('rune', { x: x * 1.01, y: 9, z: z * 1.01, w: 2, h: 3, d: 5.4, yaw: Math.PI / 2 - a }); }
    anchors.lights.push([-46, 136, 0, 'rune'], [46, 136, 0, 'rune'], [0, 120, 40, 'rune'], [0, 120, -40, 'rune'], [0, 70, 0, 'energy']);
    return { ...A.done(), anchors, footprint: 62 };
  };

  // --- vendor carts: wagon bed, spoked wheels, canopy or load, facing +z (towards the portal) ---
  function wagon(A, { w = 40, d = 22, canopy = 'cloth', high = false }) {
    A.box('timber', { y: 11, w, h: 3, d });
    for (const s of [-1, 1]) { A.box('timberLight', { y: 14, z: s * (d / 2 - .8), w, h: 5, d: 1.6 }); A.box('timberLight', { x: s * (w / 2 - .8), y: 14, w: 1.6, h: 5, d }); }
    for (const x of [-w / 3.2, w / 3.2]) for (const s of [-1, 1]) { A.cyl('timber', { x, y: 9, z: s * (d / 2 + 1.6), r0: 8.5, r1: 8.5, h: 2.2, n: 8, pitch: Math.PI / 2, a0: .2 }); A.cyl('iron', { x, y: 9, z: s * (d / 2 + 2.2), r0: 2.4, r1: 2.4, h: 2.4, n: 6, pitch: Math.PI / 2 }); }
    A.box('iron', { x: 0, y: 8.5, z: 0, w: w * .8, h: 1.6, d: d + 3 });                                // axle
    for (const s of [-1, 1]) A.box('timber', { x: -w / 2 - 11, y: 9, z: s * 4, w: 22, h: 1.8, d: 1.8, roll: .18 });   // shafts
    if (canopy) { for (const x of [-w / 2 + 2, 0, w / 2 - 2]) A.arc('timberLight', { cx: x, cy: 18, z: 0, r: d / 2, t: 1.4, d: 1.4, a0: 0, a1: Math.PI, n: 5 }); }
  }
  function canopyCloth(A, mat, { w = 40, d = 22, y = 18, tatter = true }) {
    // cloth over the hoops: a half-octagon tunnel, with ragged flaps at the ends
    const n = 5, pts = k => { const a = k / n * Math.PI; return [Math.cos(a) * (d / 2 + .6), y + Math.sin(a) * (d / 2 + .6)]; };
    for (let k = 0; k < n; k++) { const [z0, y0] = pts(k), [z1, y1] = pts(k + 1); A.piece(mat, A.quad([-w / 2, y0, z0], [w / 2, y0, z0], [w / 2, y1, z1], [-w / 2, y1, z1]).concat(A.quad([-w / 2, y0 - .5, z0 * .97], [w / 2, y0 - .5, z0 * .97], [w / 2, y1 - .5, z1 * .97], [-w / 2, y1 - .5, z1 * .97]))); }
    if (tatter) for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { const z = -d / 2 + 2 + k * (d - 4) / 3; A.piece(mat, [[[s * w / 2, y + 1, z - 2.4], [s * w / 2, y + 1, z + 2.4], [s * (w / 2 + .3), y - 4 - (k % 2) * 3, z]]]); }
  }
  R.cartMerchant = () => {
    const A = Asset('cart-merchant'); wagon(A, {}); canopyCloth(A, 'cloth', {});
    for (const [x, z, s] of [[-12, -3, 7], [-3, 3, 6], [8, -4, 7], [14, 3, 5]]) { A.box('timberLight', { x, y: 15, z, w: s, h: s, d: s, yaw: x * .05, jitter: .2 }); A.box('iron', { x, y: 15 + s * .5, z, w: s + .3, h: .6, d: s + .3, yaw: x * .05 }); }
    for (const [x, z] of [[0, -5], [6, 4]]) A.blob('clothPale', { x, y: 15, z, rx: 4, ry: 4.5, rz: 3.5 });
    const l = lanternAt(A, { x: 21, y: 20, z: 10 });
    return { ...A.done(), anchors: { lights: [[...l, 'spectral']] } };
  };
  R.cartSmith = () => {
    const A = Asset('cart-smith'); wagon(A, { canopy: false });
    A.box('timber', { x: -10, y: 15, z: 0, w: 16, h: 9, d: 11 }); for (const k of [-1, 1]) A.box('iron', { x: -10 + k * 5, y: 15, z: 0, w: 1.2, h: 9.4, d: 11.4 }); A.box('bronze', { x: -10, y: 19, z: 5.8, w: 2.4, h: 2.4, d: .6 });
    // weapon rack: posts, a bar, and blades leaning on it
    for (const x of [4, 18]) A.box('timberLight', { x, y: 15, z: -6, w: 1.8, h: 22, d: 1.8 }); A.box('timberLight', { x: 11, y: 34, z: -6, w: 16, h: 1.8, d: 1.8 });
    for (let k = 0; k < 4; k++) { A.box('metal', { x: 6 + k * 3.8, y: 16, z: -4.6, w: 1.4, h: 20, d: .5, roll: (k - 1.5) * .06 }); A.box('iron', { x: 6 + k * 3.8, y: 33, z: -4.6, w: 4, h: 1, d: 1 }); }
    A.box('iron', { x: 12, y: 15, z: 4, w: 10, h: 3, d: 6 }); A.cyl('metal', { x: 12, y: 18, z: 4, r0: 3.5, r1: 3, h: 1.4, n: 8 }); // ingots, helm
    return A.done();
  };
  R.cartMystic = () => {
    const A = Asset('cart-mystic'); wagon(A, {}); canopyCloth(A, 'clothAlt', {});
    A.crystal('spectral', { x: 0, y: 30, z: 0, r: 2, h: 7, n: 4 });
    for (let k = 0; k < 5; k++) { const x = -16 + k * 8; A.box('iron', { x, y: 18, z: 11.8, w: .4, h: 6 + (k % 2) * 3, d: .4 }); A.box(k % 2 ? 'bone' : 'rune', { x, y: 17 - (k % 2) * 3, z: 11.8, w: 2, h: 2, d: 2 }); }
    A.blob('bone', { x: 15, y: 15, z: 6, rx: 3, ry: 3, rz: 3.4, jitter: .1 }); A.box('candle', { x: 15, y: 21, z: 6, w: 1, h: 2, d: 1 });
    for (let k = 0; k < 3; k++) A.cyl('candle', { x: -14 + k * 3, y: 15, z: 7, r0: .8, r1: .8, h: 3 + k, n: 5 });
    const l = lanternAt(A, { x: -21, y: 20, z: 10 });
    return { ...A.done(), anchors: { lights: [[...l, 'spectral']] } };
  };
  // --- vendor stations: the workstation beside and behind the NPC; the cart sits in the middle (x = 0) ---
  R.stationMerchant = () => {
    const A = Asset('station-merchant');
    for (const [x, z, s] of [[-30, -4, 9], [-30, 6, 8], [-33, 1, 7.5]]) A.box('timberLight', { x, y: z > 0 && s < 8 ? 9 : 0, z, w: s, h: s, d: s, yaw: z * .1, jitter: .25 });
    for (const [x, z] of [[-24, -9], [-37, -10]]) { A.cyl('timber', { x, z, r0: 4.2, r1: 4.6, h: 11, n: 8 }); A.cyl('iron', { x, y: 2.5, z, r0: 4.7, r1: 4.7, h: 1, n: 8 }); A.cyl('iron', { x, y: 8, z, r0: 4.7, r1: 4.7, h: 1, n: 8 }); }
    // sign post with a hanging board and a coin mark
    A.box('timber', { x: 31, y: 0, z: 6, w: 2.6, h: 38, d: 2.6 }); A.box('timber', { x: 36, y: 36, z: 6, w: 11, h: 2, d: 2 });
    A.box('timberLight', { x: 37, y: 24, z: 6, w: 12, h: 9, d: 1.4, jitter: .3 }); A.cyl('gold', { x: 37, y: 27, z: 7, r0: 2.4, r1: 2.4, h: .8, n: 8, pitch: Math.PI / 2 });
    A.box('timber', { x: 28, y: 0, z: -6, w: 12, h: 9, d: 8 }); A.box('clothPale', { x: 28, y: 9, z: -6, w: 13, h: .8, d: 9 });
    return A.done();
  };
  R.stationSmith = () => {
    const A = Asset('station-smith');
    // anvil on a stump
    A.cyl('timber', { x: -30, z: 4, r0: 5, r1: 4.4, h: 9, n: 7 }); A.box('iron', { x: -30, y: 9, z: 4, w: 12, h: 3, d: 6, taper: .8 }); A.box('iron', { x: -30, y: 12, z: 4, w: 15, h: 3, d: 6.5 }); A.cyl('iron', { x: -38.5, y: 13.2, z: 4, r0: 1.6, r1: 0, h: 5, n: 4, roll: Math.PI / 2 });
    A.box('metal', { x: -28, y: 15.2, z: 3, w: 6, h: 1, d: 1.2, yaw: .4 });
    A.cyl('timber', { x: -38, z: -8, r0: 4.6, r1: 5, h: 11, n: 8 }); A.cyl('water', { x: -38, y: 10.2, z: -8, r0: 4.2, r1: 4.2, h: .6, n: 8 });
    // forge brazier with a hood
    A.cyl('stoneDark', { x: 31, z: -2, r0: 9, r1: 8, h: 11, n: 8, jitter: .05 }); A.cyl('coals', { x: 31, y: 11, z: -2, r0: 6.5, r1: 5, h: 1.4, n: 7 });
    for (const s of [-1, 1]) A.box('iron', { x: 31 + s * 7, y: 11, z: -8, w: 1.4, h: 22, d: 1.4 }); A.cyl('iron', { x: 31, y: 30, z: -4, r0: 10, r1: 3, h: 9, n: 4, a0: Math.PI / 4 }); A.box('iron', { x: 31, y: 39, z: -4, w: 4, h: 16, d: 4 });
    for (let k = 0; k < 3; k++) A.box('metal', { x: 24 + k * 2.2, y: 11, z: 6, w: .8, h: 12, d: .8, roll: -.35 });
    return { ...A.done(), anchors: { lights: [[31, 13, -2, 'coals']], smoke: [[31, 56, -4]] } };
  };
  R.stationMystic = () => {
    const A = Asset('station-mystic');
    // altar with candles and a rune circle
    A.box('stoneDark', { x: -30, y: 0, z: 2, w: 16, h: 9, d: 10, taper: .92, jitter: .4 }); A.box('stone', { x: -30, y: 9, z: 2, w: 18, h: 2, d: 12 });
    for (const [x, z, h] of [[-36, 5, 4], [-33, -1, 6], [-25, 5, 3], [-27, -2, 5]]) { A.cyl('clothPale', { x, y: 11, z, r0: .9, r1: .9, h, n: 5 }); A.box('candle', { x, y: 11 + h, z, w: .8, h: 1.4, d: .8 }); }
    A.blob('bone', { x: -30, y: 11, z: 2, rx: 2.4, ry: 2.4, rz: 2.8, jitter: .1 });
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; A.box('rune', { x: -30 + Math.cos(a) * 13, y: .1, z: 2 + Math.sin(a) * 13, w: 4, h: .3, d: 1, yaw: Math.PI / 2 - a }); }
    // crystal pylon
    A.box('stoneDark', { x: 31, y: 0, z: -3, w: 9, h: 4, d: 9, jitter: .3 }); A.box('stone', { x: 31, y: 4, z: -3, w: 6, h: 18, d: 6, taper: .6, jitter: .3 });
    A.crystal('rune', { x: 31, y: 22, z: -3, r: 3.6, h: 15, n: 5 }); for (let k = 0; k < 3; k++) A.crystal('rune', { x: 31 + Math.cos(k * 2.1) * 8, y: 26 + k * 4, z: -3 + Math.sin(k * 2.1) * 8, r: 1.2, h: 4, n: 4, roll: .5 });
    return { ...A.done(), anchors: { lights: [[31, 28, -3, 'rune'], [-30, 14, 2, 'candle']] } };
  };

  // --- four (plus one) house variations, built at 50 x 40 footprint and scaled by the layout ---
  R.houseCottage = () => { // dark-timber cottage: stone plinth, framed plaster walls, steep slate gable, chimney
    const A = Asset('house-cottage'), H = 30, anchors = { smoke: [], lights: [] };
    A.box('stoneDark', { y: 0, w: 50, h: 5, d: 40, jitter: .5 }); A.box('plaster', { y: 5, w: 46, h: H, d: 36 });
    for (const [x, z] of [[-23, -18], [23, -18], [23, 18], [-23, 18]]) A.box('timber', { x, y: 5, z, w: 3.4, h: H, d: 3.4 });
    for (const y of [5.5, 5 + H * .52, 5 + H - 1.5]) for (const [z, w, d] of [[18.3, 47, 1.6], [-18.3, 47, 1.6]]) A.box('timber', { y, z, w, h: 1.8, d });
    for (const [x, r] of [[-16, .62], [16, -.62]]) A.box('timber', { x, y: 6, z: 18.4, w: 1.6, h: 15.5, d: 1.2, roll: r });
    doorAt(A, { x: 0, z: 18, w: 11, h: 20 }); windowAt(A, { x: -14, y: 23, z: 18 }); windowAt(A, { x: 14, y: 23, z: 18 }); windowAt(A, { x: 25, y: 18, z: 0, yaw: Math.PI / 2 });
    A.box('timber', { y: 5 + H, w: 49, h: 2, d: 39 }); roofGable(A, { y: 5 + H + 1, w: 56, h: 30, d: 48 }); if (gabled()) A.box('timber', { y: 5 + H + 30, w: 57, h: 1.8, d: 2.2 });
    if (gabled()) for (let k = -2; k <= 2; k++) A.box('roofAlt', { x: k * 10, y: 5 + H + 1, z: 22, w: 6, h: 2, d: 6, pitch: .55 });
    if (ST.roof !== 'flat') anchors.smoke.push(chimney(A, { x: 14, z: -10, y0: 26, h: 44 }));
    anchors.lights.push(lanternAt(A, { x: -7.5, y: 25, z: 20.5 }).concat('window'));
    A.box('timber', { x: -7.5, y: 31, z: 19.5, w: 1, h: 1, d: 3 });
    decorHouse(A, { w: 46, d: 36, h: H, y0: 5, door: 0 });
    return { ...A.done(), anchors };
  };
  R.houseStone = () => { // squat stone house: rough walls, hip roof, side chimney, arched door, mossy corners
    const A = Asset('house-stone'), H = 30, anchors = { smoke: [], lights: [] };
    A.box('stoneDark', { y: 0, w: 51, h: 4, d: 41, jitter: .6 }); A.box('stone', { y: 4, w: 47, h: H, d: 37, jitter: .7 });
    for (let k = 0; k < 10; k++) { const s = k % 2 ? 1 : -1, x = s * 23.5, z = -15 + (k >> 1) * 7.5; A.box('stoneLight', { x, y: 4 + (k * 5.3) % 24, z, w: 2, h: 4.5, d: 6, jitter: .4 }); }
    for (const [x, z] of [[-24, -19], [24, -19], [24, 19], [-24, 19]]) A.box('stoneDark', { x, y: 4, z, w: 5, h: H, d: 5, jitter: .5 });
    doorAt(A, { x: -6, z: 18.6, w: 12, h: 21, arch: true }); windowAt(A, { x: 12, y: 20, z: 18.6, w: 8, h: 8 }); windowAt(A, { x: -24, y: 20, z: 2, w: 7, h: 8, yaw: -Math.PI / 2 });
    roofHip(A, { y: 4 + H, w: 55, h: 24, d: 45 }); A.box('stoneDark', { y: 4 + H - .5, w: 50, h: 1.8, d: 40 });
    for (const [x, z] of [[-26, 21], [26, -21], [20, 21]]) A.blob('moss', { x, y: 4 + H - 2, z, rx: 5, ry: 2, rz: 4 });
    if (ST.roof !== 'flat') anchors.smoke.push(chimney(A, { x: 26.5, z: -6, y0: 0, h: 66 }));
    decorHouse(A, { w: 47, d: 37, h: H, y0: 4, door: -6 });
    return { ...A.done(), anchors };
  };
  R.houseTown = () => { // two storeys: stone ground floor, jettied timber upper floor, steep gable with a dormer
    const A = Asset('house-town'), anchors = { smoke: [], lights: [] };
    A.box('stoneDark', { y: 0, w: 48, h: 4, d: 38, jitter: .5 }); A.box('stone', { y: 4, w: 44, h: 22, d: 34, jitter: .5 });
    for (let k = -2; k <= 2; k++) A.box('timber', { x: k * 11, y: 25, z: 18.5, w: 2, h: 2, d: 6 });
    A.box('plaster', { y: 26, w: 48, h: 22, d: 40 });
    for (const [x, z] of [[-24, -20], [24, -20], [24, 20], [-24, 20]]) A.box('timber', { x, y: 26, z, w: 3, h: 22, d: 3 });
    for (const y of [26, 47]) A.box('timber', { y, z: 20.2, w: 49, h: 1.8, d: 1.4 }); for (let k = -1; k <= 1; k++) A.box('timber', { x: k * 12, y: 26, z: 20.3, w: 1.6, h: 22, d: 1.2 });
    doorAt(A, { x: 9, z: 17, w: 11, h: 19 }); windowAt(A, { x: -10, y: 11, z: 17, w: 7, h: 8 }); windowAt(A, { x: -15, y: 33, z: 20.2 }); windowAt(A, { x: 5, y: 33, z: 20.2 }); windowAt(A, { x: 18, y: 33, z: 20.2, w: 5 });
    roofGable(A, { y: 48, w: 54, h: 34, d: 47 }); if (gabled()) A.box('timber', { y: 81.5, w: 55, h: 1.8, d: 2 });
    if (ST.roof !== 'flat') { A.box('plaster', { x: -6, y: 56, z: 14, w: 12, h: 9, d: 14 }); A.gable(ST.roof === 'thatch' ? 'roof' : 'roofAlt', { x: -6, y: 65, z: 14, w: 15, h: 8, d: 17, yaw: Math.PI / 2 }); windowAt(A, { x: -6, y: 57, z: 21.2, w: 5, h: 6, shutters: false }); }
    else { A.box('stoneLight', { x: -10, y: 50, z: 4, w: 22, h: 5, d: 22 }); dome(A, 'roofAlt', { x: -10, y: 55, z: 4, r: 10, h: 11 }); }
    if (ST.roof !== 'flat') anchors.smoke.push(chimney(A, { x: -16, z: -8, y0: 40, h: 50 }));
    decorHouse(A, { w: 44, d: 34, h: 44, y0: 4, door: 9 });
    return { ...A.done(), anchors };
  };
  R.houseTower = () => { // watch-house: square stone base, octagonal timber upper floor, tall spire
    const A = Asset('house-tower'), anchors = { lights: [] };
    A.box('stoneDark', { y: 0, w: 40, h: 4, d: 40, jitter: .5 }); A.box('stone', { y: 4, w: 34, h: 42, d: 34, taper: .94, jitter: .6 });
    for (const y of [14, 30]) for (const s of [-1, 1]) A.box('window', { x: s * 8, y, z: 16.4, w: 1.8, h: 7, d: .6 });
    doorAt(A, { x: 0, z: 16.6, w: 10, h: 18, arch: true });
    A.cyl('timber', { y: 45, r0: 21, r1: 23, h: 3, n: 8, a0: Math.PI / 8 }); A.cyl('plaster', { y: 48, r0: 20, r1: 20, h: 20, n: 8, a0: Math.PI / 8 });
    for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; A.box('timber', { x: Math.cos(a) * 19.4, y: 48, z: Math.sin(a) * 19.4, w: 2.4, h: 20, d: 2.4 }); if (k % 2) windowAt(A, { x: Math.cos(a + Math.PI / 8) * 18.8, y: 54, z: Math.sin(a + Math.PI / 8) * 18.8, yaw: Math.PI / 2 - a - Math.PI / 8, w: 5, h: 7, shutters: false }); }
    const top = roofCone(A, { y: 68, r0: 26, r1: 0, h: 46, n: 8, a0: Math.PI / 8 });
    if (ST.roof !== 'flat') { A.cyl('iron', { y: 113, r0: .8, r1: .3, h: 12, n: 4 }); A.crystal('spectral', { y: 120, r: 1.4, h: 4, n: 4 }); }
    anchors.lights.push([0, ST.roof === 'flat' ? top + 4 : 122, 0, 'spectral']);
    decorHouse(A, { w: 34, d: 34, h: 42, y0: 4, door: 0 });
    return { ...A.done(), anchors };
  };
  R.houseChapel = () => { // gothic hall: buttressed stone nave, steep roof, bell tower with a spire, pointed glowing windows
    const A = Asset('house-chapel'), anchors = { lights: [] };
    A.box('stoneDark', { y: 0, w: 52, h: 4, d: 42, jitter: .5 }); A.box('stone', { y: 4, w: 46, h: 40, d: 36, jitter: .6 });
    for (const s of [-1, 1]) for (let k = -1; k <= 1; k++) { A.box('stoneDark', { x: s * 25.5, y: 4, z: k * 12, w: 5, h: 30, d: 5, taper: .5, jitter: .4 }); A.cyl('spectral', { x: s * 23.3, y: 16, z: k * 12 + 6, r0: 2.2, r1: 0, h: 14, n: 3, roll: s * Math.PI / 2, a0: Math.PI / 2 }); }
    if (ST.roof === 'flat') { flatRoof(A, { y: 44, w: 46, d: 36 }); dome(A, 'roofAlt', { x: 0, y: 47, z: 4, r: 15, h: 17 }); } else roofGable(A, { y: 44, w: 50, h: 34, d: 42, yaw: Math.PI / 2 });
    doorAt(A, { x: 0, z: 18.6, w: 12, h: 24, arch: true }); A.cyl('spectral', { x: 0, y: 36, z: 18.4, r0: 5, r1: 5, h: .6, n: 8, pitch: Math.PI / 2 });
    A.box('stone', { x: 0, y: 4, z: -12, w: 16, h: 62, d: 14, jitter: .4 }); A.box('stoneDark', { x: 0, y: 66, z: -12, w: 18, h: 3, d: 16 });
    for (const s of [-1, 1]) A.box('window', { x: s * 8.1, y: 52, z: -12, w: .6, h: 8, d: 4 });
    roofCone(A, { x: 0, y: 69, z: -12, r0: 11, r1: 0, h: 44, n: 4, a0: Math.PI / 4 }); if (ST.roof !== 'flat') { A.box('iron', { x: 0, y: 112, z: -12, w: 1, h: 10, d: 1 }); A.box('iron', { x: 0, y: 118, z: -12, w: 6, h: 1, d: 1 }); }
    anchors.lights.push([0, 36, 19, 'spectral']);
    decorHouse(A, { w: 46, d: 36, h: 40, y0: 4, door: 0 });
    return { ...A.done(), anchors };
  };
  R.forge = () => { // open smithy shed: stone hearth with coals, tall chimney, slanted roof on timber posts
    const A = Asset('forge'), anchors = { smoke: [], lights: [] };
    A.box('stoneDark', { y: 0, w: 52, h: 2, d: 40 });
    A.box('stone', { x: -10, y: 2, z: -6, w: 26, h: 14, d: 20, jitter: .5 }); A.cyl('coals', { x: -10, y: 16, z: -6, r0: 8, r1: 6.5, h: 1.2, n: 7 }); A.box('stoneDark', { x: -10, y: 2, z: 4.2, w: 12, h: 8, d: 1, jitter: .2 }); A.box('coals', { x: -10, y: 3, z: 4.4, w: 8, h: 4.5, d: .6 });
    A.box('stone', { x: -10, y: 16, z: -12, w: 12, h: 62, d: 10, taper: .8, jitter: .5 }); anchors.smoke.push([-10, 80, -12]);
    for (const [x, z] of [[-24, 18], [24, 18], [-24, -18], [24, -18]]) A.box('timber', { x, y: 2, z, w: 3.4, h: z > 0 ? 40 : 46, d: 3.4 });
    A.box('roof', { y: 44, w: 56, h: 2.6, d: 46, pitch: -.13 }); if (ST.snowCap) A.box('snow', { y: 46.4, w: 54, h: 1.6, d: 43, pitch: -.13 });
    A.cyl('timber', { x: 12, y: 2, z: 4, r0: 5, r1: 4.4, h: 9, n: 7 }); A.box('iron', { x: 12, y: 11, z: 4, w: 13, h: 4, d: 6, taper: .85 });
    for (let k = 0; k < 4; k++) A.box('metal', { x: 18 + k * 1.8, y: 2, z: -14, w: .8, h: 14, d: .8, roll: -.3 });
    anchors.lights.push([-10, 18, -6, 'coals']);
    return { ...A.done(), anchors };
  };

  // --- village structures ---
  // stone treatment per style: snow on the tops, glowing seams (Ember lava, Void veins), floating shards
  function decorStone(A, { w, h, d, round = 0, merlons = [] }) {
    if (ST.snowCap) { if (round) A.cyl('snow', { y: h + 4, r0: round + 1.5, r1: round - 1, h: 2.2, n: 9 }); else { A.box('snow', { y: h + 2.3, w: w + .6, h: 1.6, d: d * .9 }); for (const [x, z, y] of merlons) A.box('snow', { x, y, z, w: 6, h: 1.4, d: 5.4 }); } }
    if (ST.cracks) for (let k = 0; k < (round ? 3 : 2); k++) { const a = round ? k * 2.1 + .4 : 0, x = round ? Math.cos(a) * (round + .3) : -6 + k * 11 + A.J(2), z = round ? Math.sin(a) * (round + .3) : d / 2 + .3; let yy = 4; for (let j = 0; j < 3; j++) { const len = 5 + A.rnd() * 6, roll = A.J(.6); A.box(ST.cracks, { x: x + A.J(1), y: yy, z, w: .8, h: len, d: .6, roll, yaw: round ? Math.PI / 2 - a : 0 }); yy += len * .85; } }
    if (ST.shards) A.crystal('rune', { x: A.J(4), y: h + 16 + A.rnd() * 8, z: A.J(3), r: 1.8, h: 7, n: 4, roll: A.J(.5) });
  }
  // timber palisade pieces (style wall: 'palisade')
  function logs(A, { x0, x1, z = 0, y0 = 0, h = 32, r = 2.1, jit = 3 }) { const n = Math.max(2, Math.round((x1 - x0) / (r * 1.95))); for (let k = 0; k < n; k++) { const x = x0 + (k + .5) * (x1 - x0) / n, hh = h + A.J(jit); A.cyl('timber', { x, y: y0, z, r0: r, r1: r * .95, h: hh, n: 6, jitter: .04 }); A.cyl('timberLight', { x, y: y0 + hh, z, r0: r * .95, r1: 0, h: 4.5, n: 6 }); } }
  function watchTower(A, { s = 28, h = 46, roof = 22 }) {
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) A.cyl('timber', { x: x * s / 2, z: z * s / 2, r0: 2.6, r1: 2.3, h: h + roof * .3, n: 6 });
    for (const side of [0, 1, 2, 3]) { const yaw = side * Math.PI / 2, T = xform({ yaw }); const n = Math.round(s / 4); for (let k = 0; k < n; k++) { const q = T([-s / 2 + (k + .5) * s / n, 0, s / 2]); A.cyl('timber', { x: q[0], z: q[2], r0: 2, r1: 1.9, h: h * .55 + A.J(2), n: 5 }); } }
    A.box('timberLight', { y: h, w: s + 6, h: 3, d: s + 6 });
    for (const side of [0, 1, 2, 3]) { const T = xform({ yaw: side * Math.PI / 2 }), q = T([0, 0, s / 2 + 2.6]); A.box('timber', { x: q[0], y: h + 3, z: q[2], w: side % 2 ? 1.4 : s + 6, h: 7, d: side % 2 ? s + 6 : 1.4 }); }
    roofCone(A, { y: h + roof * .3, r0: s * .78, r1: 0, h: roof, n: 4, a0: Math.PI / 4 });
  }
  R.wall = () => { // one 24-unit wall module: plinth, rough blocks, walkway lip, three merlons (or a log palisade)
    const A = Asset('wall');
    if (ST.wall === 'palisade') { logs(A, { x0: -12.2, x1: 12.2, z: 2, h: 32 }); for (const y of [9, 22]) A.box('timberLight', { y, z: -1, w: 24.4, h: 2, d: 1.8 }); A.box('timberLight', { y: 20, z: -5, w: 24.4, h: 1.6, d: 6 }); for (const x of [-9, 9]) A.box('timber', { x, z: -6.5, w: 1.8, h: 20, d: 1.8 }); return A.done(); }
    A.box('stoneDark', { y: 0, w: 24.4, h: 6, d: 14, jitter: .4 }); A.box('stone', { y: 6, w: 24.2, h: 28, d: 11, jitter: .5 });
    for (let k = 0; k < 4; k++) A.box(k % 2 ? 'stoneLight' : 'stoneDark', { x: -9 + k * 6, y: 10 + (k * 7) % 14, z: 5.6, w: 5, h: 3.6, d: 1, jitter: .3 });
    A.box('stoneDark', { y: 34, w: 24.4, h: 2.4, d: 13 });
    for (const x of [-8, 0, 8]) A.box('stone', { x, y: 36.4, z: -3.5, w: 5.6, h: 6, d: 4.5, jitter: .3 });
    decorStone(A, { w: 24.2, h: 34, d: 11, merlons: [[-8, -3.5, 42.3], [0, -3.5, 42.3], [8, -3.5, 42.3]] });
    return A.done();
  };
  R.tower = () => { // round defensive tower with a slate cone and a lit arrow slit (timber: a log watchtower)
    const A = Asset('tower');
    if (ST.wall === 'palisade') { watchTower(A, { s: 26, h: 44, roof: 24 }); A.box('window', { x: 0, y: 47, z: 0, w: 4, h: 4, d: 4 }); return { ...A.done(), anchors: { lights: [[0, 52, 0, 'spectral']] } }; }
    A.cyl('stoneDark', { r0: 19, r1: 18, h: 8, n: 9, jitter: .02 }); A.cyl('stone', { y: 8, r0: 16.5, r1: 15, h: 52, n: 9, jitter: .015 });
    A.cyl('stoneDark', { y: 60, r0: 19, r1: 19, h: 4, n: 9 }); for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; A.box('stone', { x: Math.cos(a) * 17, y: 64, z: Math.sin(a) * 17, w: 4.5, h: 5, d: 4, yaw: Math.PI / 2 - a }); }
    roofCone(A, { y: 66, r0: 17, r1: 0, h: 34, n: 9 }); if (ST.roof !== 'flat') A.cyl('iron', { y: 100, r0: .6, r1: .2, h: 9, n: 4 }); decorStone(A, { w: 30, h: 60, d: 30, round: 16 });
    for (const a of [0, 2.1, 4.2]) A.box('window', { x: Math.cos(a) * 15.6, y: 36, z: Math.sin(a) * 15.6, w: 1.4, h: 7, d: .6, yaw: Math.PI / 2 - a });
    return { ...A.done(), anchors: { lights: [[15.6, 39, 0, 'window']] } };
  };
  R.gateTower = () => { // square gate tower, flanking each road
    const A = Asset('gate-tower');
    if (ST.wall === 'palisade') { watchTower(A, { s: 22, h: 52, roof: 22 }); for (const s2 of [-1, 1]) { A.box('iron', { x: s2 * 9, y: 46, z: 12.6, w: 1, h: 5, d: 2 }); A.cyl('coals', { x: s2 * 9, y: 51, z: 13.4, r0: 1.4, r1: 0, h: 4, n: 4 }); } return { ...A.done(), anchors: { lights: [[9, 53, 13.4, 'coals'], [-9, 53, 13.4, 'coals']] } }; }
    A.box('stoneDark', { y: 0, w: 26, h: 8, d: 26, jitter: .5 }); A.box('stone', { y: 8, w: 22, h: 62, d: 22, taper: .93, jitter: .6 });
    A.box('stoneDark', { y: 70, w: 27, h: 3, d: 27 }); for (const [x, z] of [[-10, -10], [10, -10], [10, 10], [-10, 10], [0, -10], [0, 10], [-10, 0], [10, 0]]) A.box('stone', { x, y: 73, z, w: 5, h: 6, d: 5, jitter: .3 });
    decorStone(A, { w: 26, h: 70, d: 26, merlons: [[-10, -10], [10, -10], [10, 10], [-10, 10], [0, -10], [0, 10], [-10, 0], [10, 0]].map(([x, z]) => [x, z, 79]) });
    A.box('window', { x: 0, y: 44, z: 11.2, w: 1.6, h: 8, d: .6 });
    for (const s of [-1, 1]) { A.box('iron', { x: s * 9, y: 46, z: 11.6, w: 1, h: 5, d: 2 }); A.cyl('coals', { x: s * 9, y: 51, z: 12.4, r0: 1.4, r1: 0, h: 4, n: 4 }); }
    return { ...A.done(), anchors: { lights: [[9, 53, 12.4, 'coals'], [-9, 53, 12.4, 'coals']] } };
  };
  R.gateArch = () => { // the arch over the road, 100 wide (scaled to the gate), with a raised portcullis and a banner
    const A = Asset('gate-arch');
    if (ST.wall === 'palisade') { // timber gate frame: two beams with sharpened logs, braces and a hanging banner
      for (const y of [48, 56]) A.box('timber', { y, w: 104, h: 4, d: 5 }); logs(A, { x0: -52, x1: 52, y0: 58, h: 6, r: 2, jit: 1.5 });
      for (const s2 of [-1, 1]) A.box('timberLight', { x: s2 * 44, y: 34, w: 2, h: 22, d: 2, roll: s2 * .7 });
      A.box('cloth', { x: 0, y: 30, z: 3, w: 14, h: 18, d: .6 }); A.piece('cloth', [[[-7, 30, 3], [7, 30, 3], [0, 24, 3]], [[-7, 30, 3.3], [0, 24, 3.3], [7, 30, 3.3]]]); A.box('rune', { x: 0, y: 40, z: 3.4, w: 4, h: 4, d: .4 });
      return A.done(); }
    A.box('stone', { y: 50, w: 102, h: 14, d: 16, jitter: .5 }); A.arc('stone', { cx: 0, cy: 34, z: 0, r: 40, t: 9, d: 15, a0: .25, a1: Math.PI - .25, n: 8, jitter: .4 });
    A.box('stoneDark', { y: 64, w: 104, h: 3, d: 18 }); for (let k = -4; k <= 4; k++) A.box('stone', { x: k * 11, y: 67, z: -4, w: 5, h: 6, d: 5, jitter: .3 });
    for (let k = -5; k <= 5; k++) A.box('iron', { x: k * 7, y: 40, z: 0, w: 1.4, h: 12, d: 1.4, taper: k % 2 ? 1 : .4 }); A.box('iron', { y: 46, w: 80, h: 1.2, d: 1.6 });
    A.box('cloth', { x: 0, y: 30, z: 8.6, w: 14, h: 22, d: .6 }); A.piece('cloth', [[[-7, 30, 8.6], [7, 30, 8.6], [0, 24, 8.6]], [[-7, 30, 8.9], [0, 24, 8.9], [7, 30, 8.9]]]); A.box('rune', { x: 0, y: 42, z: 9, w: 4, h: 4, d: .4 });
    return A.done();
  };
  R.marketStall = () => { // tattered market stall, 34 x 18
    const A = Asset('market-stall');
    A.box('timber', { y: 0, w: 32, h: 10, d: 12, jitter: .2 }); A.box('timberLight', { y: 10, w: 34, h: 1.4, d: 14 });
    for (const [x, z] of [[-16, -8], [16, -8], [-16, 8], [16, 8]]) A.box('timber', { x, y: 0, z, w: 1.8, h: z < 0 ? 28 : 24, d: 1.8 });
    A.box('cloth', { y: 25, w: 37, h: 1, d: 21, pitch: .19 });
    for (let k = 0; k < 6; k++) A.piece('cloth', [[[-17 + k * 6.6, 23.2, 10.4], [-11.5 + k * 6.6, 23.2, 10.4], [-14 + k * 6.6, 19 - (k % 2) * 2, 10.6]]]);
    for (const [x, z, m] of [[-9, 0, 'bronze'], [0, 1, 'clothPale'], [9, -1, 'foliage']]) A.blob(m, { x, y: 11.4, z, rx: 3, ry: 2.4, rz: 3 });
    A.cyl('timber', { x: 12, y: 0, z: -9, r0: 3.6, r1: 4, h: 9, n: 8 });
    return A.done();
  };
  R.well = () => { // octagonal stone well with a timber roof and a winch
    const A = Asset('well');
    A.cyl('stone', { r0: 15, r1: 14.4, h: 11, n: 8, jitter: .04 }); A.cyl('stoneDark', { y: 11, r0: 15.6, r1: 15.6, h: 2, n: 8 }); A.cyl('water', { y: 9, r0: 12, r1: 12, h: 1, n: 8 });
    for (const s of [-1, 1]) A.box('timber', { x: s * 13, y: 13, w: 2.6, h: 26, d: 2.6 }); A.box('timber', { y: 32, w: 28, h: 2, d: 2 }); A.cyl('timberLight', { y: 26, r0: 2.4, r1: 2.4, h: 20, n: 6, roll: Math.PI / 2, x: 10 });
    roofGable(A, { y: 37, w: 36, h: 12, d: 24 }); A.box('iron', { x: 3, y: 18, w: 4, h: 4, d: 4, taper: 1.2 }); A.box('iron', { x: 3, y: 22, w: .4, h: 9, d: .4 });
    return A.done();
  };
  R.lantern = () => { // iron street lantern on a post with an arm
    const A = Asset('lantern');
    A.cyl('stoneDark', { r0: 3.8, r1: 3, h: 4, n: 6 }); A.cyl('iron', { y: 4, r0: 1.2, r1: .9, h: 42, n: 6 }); A.box('iron', { x: 4, y: 44, w: 9, h: 1.2, d: 1.2 }); A.box('iron', { x: 8, y: 39, w: .5, h: 5, d: .5 });
    A.box('iron', { x: 8, y: 37.5, w: 5, h: 1, d: 5 }); A.cyl('spectral', { x: 8, y: 31.5, r0: 1.9, r1: 1.9, h: 6, n: 4, a0: Math.PI / 4 }); A.cyl('iron', { x: 8, y: 37.6, r0: 3.3, r1: 0, h: 3.4, n: 4, a0: Math.PI / 4 }); A.box('iron', { x: 8, y: 30.5, w: 4.6, h: 1, d: 4.6 });
    return { ...A.done(), anchors: { lights: [[8, 34, 0, 'spectral']] } };
  };
  R.brazier = () => { const A = Asset('brazier'); A.cyl('iron', { r0: 2.6, r1: 1.4, h: 16, n: 5 }); for (let k = 0; k < 3; k++) A.box('iron', { x: Math.cos(k * 2.1) * 3, y: 0, z: Math.sin(k * 2.1) * 3, w: 1, h: 6, d: 1, roll: .4 }); A.cyl('iron', { y: 16, r0: 5, r1: 7.5, h: 5, n: 7 }); A.cyl('spectral', { y: 20, r0: 4.6, r1: 0, h: 9, n: 5 }); return { ...A.done(), anchors: { lights: [[0, 24, 0, 'spectral']] } }; };

  // --- environment ---
  R.deadTree = () => { const A = Asset('dead-tree'); let x = 0, y = 0, z = 0, r = 4.2;
    for (let k = 0; k < 5; k++) { const h = 13 - k, roll = A.J(.22), pitch = A.J(.22); A.cyl('deadwood', { x, y, z, r0: r, r1: r * .78, h, n: 6, roll, pitch, jitter: .06 }); x += -Math.sin(roll) * h; z += Math.sin(pitch) * h; y += h * .96; r *= .78; }
    for (const [a, l, yy] of [[.6, 20, 30], [2.5, 16, 38], [4.3, 18, 24], [5.4, 11, 45]]) A.cyl('deadwood', { x: x * .6, y: yy, z: z * .6, r0: 1.8, r1: .3, h: l, n: 4, yaw: a, pitch: 1.05 });
    A.blob('soil', { y: -1.5, rx: 8, ry: 2.5, rz: 7 }); return A.done(); };
  R.deadTreeB = () => { const A = Asset('dead-tree-b'); A.cyl('deadwood', { r0: 5, r1: 3, h: 24, n: 6, roll: .1, jitter: .08 }); A.cyl('deadwood', { x: 2.4, y: 23, r0: 3, r1: 1.2, h: 20, n: 5, roll: -.45 }); A.cyl('deadwood', { x: 1, y: 22, r0: 2.6, r1: .8, h: 18, n: 5, roll: .7, pitch: .3 });
    for (const [a, yy] of [[1, 12], [3.4, 17], [5, 30]]) A.cyl('deadwood', { y: yy, r0: 1.4, r1: .2, h: 12, n: 4, yaw: a, pitch: 1.2 }); A.blob('soil', { y: -1.5, rx: 8, ry: 2.5, rz: 8 }); return A.done(); };
  R.bush = () => { const A = Asset('bush'); A.blob('foliage', { rx: 8, ry: 6, rz: 7, jitter: .3 }); A.blob('foliage', { x: 6, z: 3, rx: 5, ry: 4.5, rz: 5, jitter: .3 }); A.blob('moss', { x: -5, z: -2, rx: 4.5, ry: 3.5, rz: 4, jitter: .3 }); return A.done(); };
  R.rock = () => { const A = Asset('rock'); A.blob('stone', { rx: 10, ry: 7, rz: 8, jitter: .3 }); A.blob('stoneDark', { x: 8, z: 4, rx: 5, ry: 3.6, rz: 4.5, jitter: .3 }); A.blob('moss', { x: -2, y: 5.5, rx: 6, ry: 1.6, rz: 5, jitter: .2 }); return A.done(); };
  R.boulder = () => { const A = Asset('boulder'); A.blob('stoneDark', { rx: 15, ry: 12, rz: 13, jitter: .28, yaw: .7 }); A.blob('moss', { y: 9, rx: 9, ry: 2, rz: 8, jitter: .2 }); return A.done(); };
  R.barrels = () => { const A = Asset('barrels'); for (const [x, z, y] of [[-4.5, -2, 0], [4.5, -1, 0], [0, 4.5, 0], [0, 0.5, 11.5]]) { A.cyl('timber', { x, y, z, r0: 4.2, r1: 4.6, h: 5.5, n: 8 }); A.cyl('timber', { x, y: y + 5.5, z, r0: 4.6, r1: 4.2, h: 5.5, n: 8 }); for (const yy of [1.5, 9.5]) A.cyl('iron', { x, y: y + yy, z, r0: 4.6, r1: 4.6, h: .9, n: 8 }); } return A.done(); };
  R.crates = () => { const A = Asset('crates'); for (const [x, z, s, y] of [[-5, -2, 9, 0], [5, 1, 8, 0], [-1, 0, 7, 9]]) { A.box('timberLight', { x, y, z, w: s, h: s, d: s, yaw: x * .08, jitter: .15 }); for (const k of [-1, 1]) A.box('timber', { x: x + k * (s / 2 - .6), y, z: z + s / 2 - .2, w: 1.2, h: s, d: .6, yaw: x * .08 }); A.box('timber', { x, y: y + s / 2 - .6, z: z + s / 2, w: s * 1.3, h: 1.1, d: .5, yaw: x * .08, roll: .78 }); } return A.done(); };
  R.fence = () => { const A = Asset('fence'); for (const x of [-11, 0, 11]) A.box('timber', { x, y: 0, w: 2.2, h: 14 - (x === 0 ? 2 : 0), d: 2.2, taper: .8, roll: A.J(.06) }); A.box('timberLight', { y: 9, w: 24, h: 1.6, d: 1.4, roll: .03 }); A.box('timberLight', { x: -5.5, y: 4.5, w: 12, h: 1.6, d: 1.4, roll: -.08 }); A.box('timberLight', { x: 7, y: 2, w: 10, h: 1.4, d: 1.2, roll: .5 }); return A.done(); };
  R.sign = () => { const A = Asset('sign'); A.box('timber', { w: 2.4, h: 26, d: 2.4 }); A.box('timberLight', { x: 5, y: 18, w: 14, h: 4, d: 1.2, yaw: .1, roll: -.04 }); A.piece('timberLight', [[[12, 16, -.6], [12, 22, -.6], [15, 19, -.6]], [[12, 16, .6], [15, 19, .6], [12, 22, .6]]]); A.box('timberLight', { x: -4, y: 11, w: 11, h: 3.6, d: 1.2, yaw: -.3, roll: .05 }); return A.done(); };
  R.supplies = () => { const A = Asset('supplies'); for (const [x, z, y] of [[-4, 0, 0], [3, -2, 0], [1, 3, 0], [-1, 0, 5]]) A.blob('clothPale', { x, y, z, rx: 4.6, ry: 3.4, rz: 3.8, jitter: .15 }); A.box('timberLight', { x: 8, z: 4, w: 7, h: 7, d: 7, yaw: .4 }); A.cyl('timber', { x: -9, z: 5, r0: 3, r1: 3, h: 12, n: 6, roll: 1.5 }); return A.done(); };
  R.bones = () => { const A = Asset('bones'); A.blob('bone', { x: 0, y: 0, z: 0, rx: 3, ry: 2.8, rz: 3.6, jitter: .08 }); A.box('stoneDark', { x: -1.1, y: 2.4, z: 2.6, w: 1.2, h: 1.2, d: .6 }); A.box('stoneDark', { x: 1.1, y: 2.4, z: 2.6, w: 1.2, h: 1.2, d: .6 });
    for (let k = 0; k < 4; k++) A.arc('bone', { cx: 9, cy: 0, z: -4 + k * 2.6, r: 4.5, t: .9, d: .9, a0: 0, a1: Math.PI, n: 4 }); A.box('bone', { x: 9, y: 4.6, z: 0, w: 1.2, h: 1.2, d: 10 }); for (const [x, z, y] of [[-6, 6, .5], [-8, -3, .5]]) A.box('bone', { x, y, z, w: 10, h: 1.2, d: 1.2, yaw: z * .2 }); return A.done(); };
  R.wreck = () => { const A = Asset('wreck'); // abandoned equipment: a broken wheel, a shield and a spear stuck in the ground
    A.cyl('timber', { x: -6, y: 1, z: 0, r0: 8, r1: 8, h: 1.8, n: 8, pitch: Math.PI / 2 - .12, a0: .3 }); A.cyl('iron', { x: -6, y: 1.4, z: .2, r0: 2.2, r1: 2.2, h: 2.4, n: 6, pitch: Math.PI / 2 - .12 });
    A.cyl('metal', { x: 6, y: 4, z: 3, r0: 6, r1: 6, h: 1, n: 7, pitch: 1.2, yaw: .4 }); A.cyl('bronze', { x: 6, y: 4.3, z: 3.6, r0: 1.6, r1: 0, h: 1.6, n: 5, pitch: 1.2, yaw: .4 });
    A.box('timber', { x: 2, y: 0, z: -6, w: 1.2, h: 28, d: 1.2, roll: .32, pitch: -.1 }); A.cyl('metal', { x: -6.5, y: 26, z: -8.6, r0: 1.6, r1: 0, h: 5, n: 4, roll: .32 }); A.box('cloth', { x: -3.4, y: 21, z: -7.6, w: 5, h: 4, d: .3, roll: .32 }); return A.done(); };
  R.graves = () => { const A = Asset('graves'); // a small burial plot (replaces gardens in the dark style)
    A.box('soil', { y: 0, w: 32, h: 1.6, d: 20, jitter: .3 });
    for (const [x, h, r] of [[-10, 11, .06], [0, 13, -.08], [10, 10, .14]]) { A.box('stone', { x, y: 1, z: -4, w: 6, h, d: 2.2, roll: r, taper: .85, jitter: .3 }); A.box('soil', { x, y: 1.2, z: 3, w: 5, h: 2, d: 9, jitter: .4 }); }
    for (const [x, z] of [[-16, -10], [16, -10], [-16, 10], [16, 10]]) A.box('iron', { x, y: 0, z, w: 1, h: 11, d: 1 }); for (const z of [-10, 10]) A.box('iron', { y: 8, z, w: 32, h: .8, d: .8 }); for (const x of [-16, 16]) A.box('iron', { x, y: 8, w: .8, h: .8, d: 20 });
    return A.done(); };
  R.statue = () => { const A = Asset('statue'); A.box('stoneDark', { w: 16, h: 9, d: 16, jitter: .4 }); A.box('stone', { y: 9, w: 12, h: 3, d: 12 });
    A.cyl('stoneLight', { y: 12, r0: 6, r1: 3.6, h: 22, n: 6 }); A.cyl('stoneLight', { y: 33, r0: 3.4, r1: 1.4, h: 7, n: 5 }); A.box('stoneLight', { x: 4.6, y: 14, z: 2, w: 1.6, h: 30, d: 1.6, roll: -.06 }); A.box('stoneLight', { x: 4.6, y: 43, z: 2, w: 6, h: 2, d: 1.6 });
    A.box('rune', { y: 35, z: 2.8, w: 1.4, h: .6, d: .4 }); return A.done(); };
  R.obelisk = () => { const A = Asset('obelisk'); A.box('stoneDark', { w: 16, h: 6, d: 16, jitter: .4 }); A.box('stone', { y: 6, w: 9, h: 44, d: 9, taper: .6, jitter: .5 }); A.cyl('stone', { y: 50, r0: 3.2, r1: 0, h: 8, n: 4, a0: Math.PI / 4 });
    for (let k = 0; k < 4; k++) A.box('rune', { y: 14 + k * 8, z: 4.4 - k * .5, w: 3 - k * .4, h: 4, d: .5 }); return { ...A.done(), anchors: { lights: [[0, 26, 5, 'rune']] } }; };
  R.pillar = () => { const A = Asset('pillar'); A.box('stoneDark', { w: 13, h: 4, d: 13, jitter: .3 }); A.cyl('stone', { y: 4, r0: 5.2, r1: 4.8, h: 34, n: 8, jitter: .02 }); A.box('stoneDark', { y: 38, w: 12, h: 3, d: 12, jitter: .3, roll: .05 }); A.blob('stone', { x: 9, y: 0, z: 4, rx: 4, ry: 3, rz: 3 }); return A.done(); };
  R.banner = () => { const A = Asset('banner'); A.box('iron', { w: 1.6, h: 44, d: 1.6 }); A.box('iron', { x: 4.5, y: 42, w: 10, h: 1.2, d: 1.2 }); A.box('cloth', { x: 5, y: 22, z: 0, w: 9, h: 20, d: .5 }); A.piece('cloth', [[[.5, 22, 0], [9.5, 22, 0], [5, 16, 0]]]); A.box('rune', { x: 5, y: 33, z: .4, w: 2.6, h: 2.6, d: .3 }); return A.done(); };

  // --- biome environment (each style uses its own trees, gardens, beds and scatter; see KIT_STYLE) ---
  // Wildwood
  R.treeOak = () => { const A = Asset('tree-oak'); A.cyl('deadwood', { r0: 4.6, r1: 3.2, h: 26, n: 7, jitter: .05 }); for (const [a, l] of [[.5, 12], [2.6, 10], [4.4, 11]]) A.cyl('deadwood', { y: 20, r0: 2, r1: .8, h: l, n: 5, yaw: a, pitch: .9 });
    for (const [x, y, z, r] of [[0, 34, 0, 15], [9, 29, -3, 10], [-8, 30, 4, 11], [3, 41, 5, 9], [-4, 27, -8, 9]]) A.blob(r > 10 ? 'foliage' : 'leaf', { x, y, z, rx: r, ry: r * .78, rz: r, jitter: .22 });
    A.blob('soil', { y: -1.5, rx: 8, ry: 2.5, rz: 7 }); return A.done(); };
  R.treeBirch = () => { const A = Asset('tree-birch'); A.cyl('clothPale', { r0: 2.6, r1: 1.8, h: 34, n: 6, roll: .05 }); for (let k = 0; k < 4; k++) A.box('iron', { y: 6 + k * 7, z: 2.3, w: 1.6, h: .8, d: .6, yaw: k });
    for (const [x, y, z, r] of [[1, 36, 0, 9], [-4, 30, 3, 7], [4, 28, -3, 7], [0, 44, 1, 6]]) A.blob('leaf', { x, y, z, rx: r, ry: r * 1.15, rz: r, jitter: .2 }); return A.done(); };
  R.vegPlot = () => { const A = Asset('veg-plot'); A.box('soil', { w: 32, h: 1.6, d: 20, jitter: .3 }); for (let r = -1; r <= 1; r++) { A.box('soil', { z: r * 6, y: 1, w: 28, h: 1.6, d: 3.6 }); for (let k = 0; k < 5; k++) A.blob(r ? 'leaf' : 'foliage', { x: -11 + k * 5.5, y: 2.4, z: r * 6, rx: 2.2, ry: 2, rz: 2.2, jitter: .2 }); }
    for (const [x, z] of [[-16, -10], [16, -10], [-16, 10], [16, 10]]) A.box('timber', { x, z, w: 1.4, h: 8, d: 1.4 }); for (const z of [-10, 10]) A.box('timberLight', { y: 5.5, z, w: 32, h: 1, d: 1 }); for (const x of [-16, 16]) A.box('timberLight', { x, y: 5.5, w: 1, h: 1, d: 20 }); return A.done(); };
  R.flowerBed = () => { const A = Asset('flower-bed'); A.blob('foliage', { rx: 6, ry: 3.6, rz: 5, jitter: .25 }); for (let k = 0; k < 7; k++) { const a = k * .9; A.blob(['cloth', 'straw', 'clothPale'][k % 3], { x: Math.cos(a) * 4, y: 3.4, z: Math.sin(a) * 3.4, rx: 1.3, ry: 1.1, rz: 1.3, jitter: .1 }); } return A.done(); };
  R.hay = () => { const A = Asset('hay'); for (const [x, z, y] of [[-4, 0, 0], [5, 2, 0], [0, 1, 6.6]]) A.cyl('straw', { x, y: y + 3.4, z, r0: 3.6, r1: 3.6, h: 9, n: 8, roll: Math.PI / 2, yaw: x * .1 }); A.box('timber', { x: 9, w: 1.2, h: 12, d: 1.2, roll: .3 }); return A.done(); };
  R.logPile = () => { const A = Asset('log-pile'); for (let r = 0; r < 3; r++) for (let k = 0; k < 4 - r; k++) A.cyl('deadwood', { x: -6 + r * 2 + k * 4, y: 2 + r * 3.4, z: 0, r0: 1.8, r1: 1.8, h: 14, n: 6, pitch: Math.PI / 2, yaw: Math.PI / 2 }); A.cyl('timber', { x: 9, y: 0, z: 3, r0: 3, r1: 3, h: 4, n: 7 }); if (ST.snowCap) A.box('snow', { x: -2, y: 10, w: 9, h: 1.2, d: 13 }); return A.done(); };
  // Glacier
  const pineTree = (A, s) => { A.cyl('deadwood', { r0: 2.6 * s, r1: 1.4 * s, h: 14 * s, n: 6 }); for (let k = 0; k < 4; k++) { const y = (9 + k * 9) * s, r = (15 - k * 3.2) * s; A.cyl('foliage', { y, r0: r, r1: 0, h: 15 * s, n: 7, jitter: .03 }); A.cyl('snow', { y: y + 6 * s, r0: r * .6, r1: 0, h: 9 * s, n: 7 }); } };
  R.pine = () => { const A = Asset('pine'); pineTree(A, 1.15); A.blob('snow', { y: -1, rx: 10, ry: 2, rz: 9 }); return A.done(); };
  R.pineB = () => { const A = Asset('pine-b'); pineTree(A, .85); A.blob('snow', { y: -1, rx: 8, ry: 2, rz: 7 }); return A.done(); };
  R.woodpile = () => { const A = Asset('woodpile'); A.box('timber', { w: 32, h: 2, d: 14 }); for (let r = 0; r < 3; r++) for (let k = 0; k < 7 - r; k++) A.cyl('deadwood', { x: -12 + r * 2 + k * 4, y: 4 + r * 3.4, z: 0, r0: 1.8, r1: 1.8, h: 12, n: 6, pitch: Math.PI / 2, yaw: Math.PI / 2 });
    for (const x of [-15, 15]) A.box('timber', { x, w: 1.6, h: 20, d: 1.6 }); A.box('roofAlt', { y: 20, w: 36, h: 1.4, d: 18, pitch: .15 }); A.box('snow', { y: 21.6, w: 35, h: 1.6, d: 16, pitch: .15 }); A.blob('snow', { x: 12, z: 9, rx: 7, ry: 2.4, rz: 4 }); return A.done(); };
  R.snowShrub = () => { const A = Asset('snow-shrub'); A.blob('foliage', { rx: 6, ry: 5, rz: 5.5, jitter: .3 }); A.blob('snow', { y: 3.4, rx: 5, ry: 2.2, rz: 4.5, jitter: .2 }); return A.done(); };
  R.snowDrift = () => { const A = Asset('snow-drift'); A.blob('snow', { rx: 12, ry: 3.2, rz: 7, jitter: .25 }); A.blob('snow', { x: 7, z: 3, rx: 6, ry: 2.6, rz: 4, jitter: .25 }); return A.done(); };
  R.iceSpire = () => { const A = Asset('ice-spire'); A.blob('stoneDark', { rx: 6, ry: 3, rz: 5 }); A.crystal('ice', { r: 3.2, h: 18, n: 5 }); A.crystal('ice', { x: 4, z: 2, r: 2, h: 10, n: 4, roll: -.4 }); A.crystal('ice', { x: -3, z: -2, r: 1.8, h: 8, n: 4, roll: .5 }); return A.done(); };
  // Warfields
  const palmTree = (A, s, lean) => { let x = 0, y = 0; for (let k = 0; k < 5; k++) { const h = 8 * s; A.cyl('deadwood', { x, y, r0: (2.6 - k * .25) * s, r1: (2.4 - k * .25) * s, h, n: 6, roll: -lean }); x += Math.sin(lean) * h; y += Math.cos(lean) * h; }
    for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28; A.box('leaf', { x: x + Math.cos(a) * 8 * s, y: y - 1.5 * s, z: Math.sin(a) * 8 * s, w: 17 * s, h: .8, d: 4.6 * s, yaw: -a, roll: 0, pitch: 0, taper: .4, tz: .3 }); }
    A.blob('timber', { x, y: y - 2 * s, rx: 2.4 * s, ry: 2.4 * s, rz: 2.4 * s, jitter: .2 }); };
  R.palm = () => { const A = Asset('palm'); palmTree(A, 1.15, .14); A.blob('soil', { y: -1.5, rx: 7, ry: 2, rz: 6 }); return A.done(); };
  R.palmB = () => { const A = Asset('palm-b'); palmTree(A, .85, -.2); A.blob('foliage', { x: 4, rx: 5, ry: 3.6, rz: 4.5, jitter: .3 }); return A.done(); };
  const pot = (A, x, z, s, mat = 'clay') => { A.cyl(mat, { x, z, r0: 2.2 * s, r1: 3.6 * s, h: 4 * s, n: 7 }); A.cyl(mat, { x, y: 4 * s, z, r0: 3.6 * s, r1: 1.8 * s, h: 4 * s, n: 7 }); A.cyl(mat, { x, y: 8 * s, z, r0: 2 * s, r1: 2.2 * s, h: 1.4 * s, n: 7 }); };
  R.pots = () => { const A = Asset('pots'); pot(A, -4, 0, 1); pot(A, 3, 2, .8); pot(A, 1, -4, .65, 'stoneLight'); A.box('clothPale', { x: 6, z: -3, w: 6, h: 2, d: 4, yaw: .4 }); return A.done(); };
  R.potPlant = () => { const A = Asset('pot-plant'); pot(A, 0, 0, 1.1); for (let k = 0; k < 5; k++) A.box('leaf', { y: 9, w: 9, h: .6, d: 2, yaw: k * 1.25, pitch: 0, roll: .5, taper: .3, tz: .3 }); return A.done(); };
  R.potGarden = () => { const A = Asset('pot-garden'); A.box('stoneLight', { w: 32, h: 3, d: 20, jitter: .2 }); A.box('soil', { y: 3, w: 29, h: .6, d: 17 }); for (const [x, z, s] of [[-10, -4, 1], [0, 3, .8], [10, -3, 1.1]]) { pot(A, x, z, s); A.blob('leaf', { x, y: 9 * s, z, rx: 3.6 * s, ry: 2.4, rz: 3.6 * s }); } palmTree(A, .5, .1); return A.done(); };
  R.awningStall = () => { const A = Asset('awning-stall'); for (const [x, z] of [[-7, -5], [7, -5], [-7, 5], [7, 5]]) A.box('timber', { x, z, w: 1.2, h: 16, d: 1.2 }); A.box('cloth', { y: 16, w: 17, h: .8, d: 13, pitch: .12 }); A.box('timberLight', { y: 6, w: 14, h: 1.4, d: 8 }); pot(A, -3, 0, .6); A.box('clothPale', { x: 4, y: 7.4, w: 4, h: 3, d: 4 }); return A.done(); };
  // Volcanic
  R.charred = () => { const A = Asset('charred'); A.cyl('deadwood', { r0: 4.4, r1: 2.6, h: 24, n: 6, roll: .08, jitter: .08 }); for (const [a, yy, l] of [[.7, 16, 14], [2.9, 20, 12], [4.6, 13, 10]]) { A.cyl('deadwood', { y: yy, r0: 1.8, r1: .4, h: l, n: 4, yaw: a, pitch: 1.05 }); }
    for (let k = 0; k < 3; k++) A.box('lava', { x: A.J(2), y: 3 + k * 6, z: 3.8 - k * .4, w: .7, h: 4, d: .5, roll: A.J(.5) }); A.blob('soil', { y: -1.5, rx: 8, ry: 2.5, rz: 7 }); return A.done(); };
  R.charredB = () => { const A = Asset('charred-b'); A.cyl('deadwood', { r0: 3.6, r1: 2.8, h: 12, n: 6, jitter: .1 }); A.cyl('deadwood', { y: 12, r0: 2.8, r1: 1, h: 8, n: 5, roll: .5 }); A.cyl('coals', { y: 11.6, r0: 2.6, r1: 2.4, h: .6, n: 6 }); A.blob('soil', { y: -1.5, rx: 7, ry: 2.2, rz: 6 }); return A.done(); };
  R.lavaPool = () => { const A = Asset('lava-pool'); A.box('stoneDark', { w: 32, h: 1.4, d: 20, jitter: .4 }); A.box('lava', { y: 1.1, w: 24, h: .5, d: 13 }); for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28; A.blob('stone', { x: Math.cos(a) * 14, z: Math.sin(a) * 8.6, rx: 3.6, ry: 2.6, rz: 3, jitter: .3 }); } A.crystal('stoneDark', { x: 10, z: -6, r: 2.4, h: 12, n: 4, roll: .3 }); return A.done(); };
  R.obsidian = () => { const A = Asset('obsidian'); A.blob('stoneDark', { rx: 6, ry: 3, rz: 5 }); A.crystal('stoneDark', { r: 3, h: 15, n: 4, roll: .15 }); A.crystal('stoneLight', { x: 4, z: 2, r: 1.8, h: 9, n: 4, roll: -.5 }); A.box('lava', { y: .6, w: 9, h: .4, d: .8, yaw: .6 }); return A.done(); };
  R.lavaVent = () => { const A = Asset('lava-vent'); A.cyl('stoneDark', { r0: 7, r1: 3.4, h: 6, n: 7, jitter: .08 }); A.cyl('lava', { y: 5.8, r0: 2.8, r1: 2.4, h: .5, n: 6 }); A.blob('stone', { x: 7, z: 3, rx: 3, ry: 2, rz: 2.6 }); return { ...A.done(), anchors: { lights: [[0, 7, 0, 'lava']], smoke: [[0, 9, 0]] } }; };
  // Voidscar
  R.crystalTree = () => { const A = Asset('crystal-tree'); A.cyl('deadwood', { r0: 3.4, r1: 1.6, h: 22, n: 5, roll: .12, jitter: .1 }); A.cyl('deadwood', { x: -2, y: 20, r0: 1.6, r1: .5, h: 12, n: 4, roll: -.6 });
    A.crystal('rune', { x: 2.8, y: 20, r: 4, h: 18, n: 5, roll: .15 }); A.crystal('rune', { x: -7, y: 28, r: 2.4, h: 10, n: 4, roll: .7 }); A.crystal('energyMid', { x: 6, y: 14, r: 1.6, h: 7, n: 4, roll: -.8 }); A.blob('soil', { y: -1.5, rx: 7, ry: 2.2, rz: 6 }); return { ...A.done(), anchors: { lights: [[3, 28, 0, 'rune']] } }; };
  R.crystalTreeB = () => { const A = Asset('crystal-tree-b'); A.cyl('deadwood', { r0: 2.6, r1: 1, h: 16, n: 5, roll: -.2 }); A.crystal('rune', { x: -3, y: 14, r: 2.8, h: 12, n: 4, roll: -.2 }); A.crystal('rune', { x: 2, y: 6, r: 1.6, h: 7, n: 4, roll: .8 }); return A.done(); };
  R.crystalBed = () => { const A = Asset('crystal-bed'); A.box('stoneDark', { w: 32, h: 1.6, d: 20, jitter: .4 }); for (let k = 0; k < 7; k++) { const x = -12 + k * 4, z = A.J(5); A.crystal(k % 3 ? 'rune' : 'energyMid', { x, y: 1, z, r: 1.4 + A.rnd() * 1.6, h: 6 + A.rnd() * 10, n: 4, roll: A.J(.4) }); }
    for (const [x, z] of [[-16, -10], [16, -10], [-16, 10], [16, 10]]) A.box('stone', { x, z, w: 3, h: 6, d: 3, taper: .6 }); return { ...A.done(), anchors: { lights: [[0, 8, 0, 'rune']] } }; };
  R.shards = () => { const A = Asset('shards'); A.blob('stoneDark', { rx: 5, ry: 2.4, rz: 4 }); A.crystal('rune', { r: 2.4, h: 11, n: 4, roll: .2 }); A.crystal('rune', { x: 3, z: 2, r: 1.4, h: 6, n: 4, roll: -.6 }); A.crystal('energyMid', { x: -2, y: 14, r: 1.2, h: 4, n: 4, roll: .4 }); return A.done(); };
  R.voidStone = () => { const A = Asset('void-stone'); A.box('stoneDark', { w: 9, h: 3, d: 8, jitter: .4 }); A.box('stone', { y: 10, w: 7, h: 7, d: 6, jitter: .8, roll: .3, yaw: .5 }); A.box('stone', { y: 21, w: 5, h: 5, d: 4, jitter: .6, roll: -.4 }); A.box('rune', { y: 13, z: 3.3, w: 2, h: 2, d: .4, roll: .3, yaw: .5 }); return A.done(); };

  // ---------- build & placement ----------
  // Assets are built per style (the recipes read the style's treatment) and only when first used.
  const BIOME_ONLY = new Set(['treeOak', 'treeBirch', 'vegPlot', 'flowerBed', 'hay', 'logPile', 'pine', 'pineB', 'woodpile', 'snowShrub', 'snowDrift', 'iceSpire', 'palm', 'palmB', 'pots', 'potPlant', 'potGarden', 'awningStall',
    'charred', 'charredB', 'lavaPool', 'obsidian', 'lavaVent', 'crystalTree', 'crystalTreeB', 'crystalBed', 'shards', 'voidStone']);
  const styleOf = style => KIT_STYLE[style] ? style : 'dark';
  const BUILT = {};
  function assetFor(style, key) {
    style = styleOf(style); const lib = BUILT[style] || (BUILT[style] = {});
    if (lib[key] || !R[key]) return lib[key];
    const keepS = ST, keepK = STKEY; ST = KIT_STYLE[style]; STKEY = style;
    try {
      const asset = R[key](), meshes = [];
      for (const mat in asset.parts) { const arr = new Float32Array(asset.parts[mat]); if (arr.length) meshes.push({ mat, mesh: GL.meshFromArray(arr), tris: arr.length / 18 }); }
      lib[key] = { meshes, anchors: asset.anchors || {}, footprint: asset.footprint };
    } finally { ST = keepS; STKEY = keepK; }
    return lib[key];
  }
  // the keys a style can place: the shared pieces plus its own trees, garden, beds and scatter
  function styleKeys(style) { const S = KIT_STYLE[styleOf(style)]; return Object.keys(R).filter(k => !BIOME_ONLY.has(k) || S.trees.includes(k) || S.garden === k || S.bush === k || S.details.some(d => d[0] === k)); }
  function build(style = 'dark') { for (const k of styleKeys(style)) assetFor(style, k); return BUILT[styleOf(style)]; }
  // instance groups for the current village: mesh -> { arr, n, shadow }
  let groups = new Map(), lights = [], smoke = [], active = false, centre = null, energy = null, log = [], cur = 'dark';
  function colourOf(pal, mat) { const v = pal[mat] || DARK[mat] || [1, 0, 1]; return Array.isArray(v[0]) ? { col: v[0], emis: v[1] } : { col: v, emis: 0 }; }
  function put(pal, key, x, y, z, yaw, sx = 1, sy = 1, sz = 1, tint) {
    const a = assetFor(cur, key); if (!a) return; log.push({ key, x, y, z, yaw, sx, sy, sz });
    for (const m of a.meshes) {
      let g = groups.get(m.mesh); if (!g) { g = { mesh: m.mesh, arr: new Float32Array(GL.STRIDE * 32), n: 0, shadow: m.mat !== 'window' && m.mat !== 'rune' }; groups.set(m.mesh, g); }
      if ((g.n + 1) * GL.STRIDE > g.arr.length) { const na = new Float32Array(g.arr.length * 2); na.set(g.arr); g.arr = na; }
      const { col, emis } = colourOf(pal, m.mat), c = tint && !emis ? [col[0] * tint[0], col[1] * tint[1], col[2] * tint[2]] : col;
      GL.instWrite(g.arr, g.n * GL.STRIDE, x, y, z, sx, sy, sz, yaw, c, emis); g.n++;
    }
    const cs = Math.cos(yaw), sn = Math.sin(yaw), at = p => [x + cs * p[0] * sx + sn * p[2] * sz, y + p[1] * sy, z - sn * p[0] * sx + cs * p[2] * sz];
    for (const l of a.anchors.lights || []) { const p = at(l); lights.push({ x: p[0], y: p[1], z: p[2], c: colourOf(pal, l[3] || 'spectral').col }); }
    for (const s of a.anchors.smoke || []) { const p = at(s); smoke.push({ x: p[0], y: p[1], z: p[2] }); }
  }
  const hash = (x, y) => { const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return h - Math.floor(h); };
  const HOUSE_FOR = { house: ['houseCottage', 'houseStone', 'houseTown'], cottage: ['houseCottage', 'houseStone'], hut: ['houseCottage'], shop: ['houseTown'], market: ['houseTown'], warehouse: ['houseStone'], hall: ['houseTown', 'houseStone'], barracks: ['houseStone'],
    'tower-house': ['houseTower'], keep: ['houseTower'], gothic: ['houseChapel'], cathedral: ['houseChapel'], palace: ['houseChapel'], smithy: ['forge'] };
  const NOMINAL = { houseCottage: [50, 40], houseStone: [50, 40], houseTown: [48, 40], houseTower: [36, 36], houseChapel: [50, 40], forge: [52, 40] };

  // Place the whole village from the shared layout. Returns false when the layout is not a village.
  function place(lay, CX, CY, style, rand) {
    clear(); if (!lay || lay.kind !== 'village') return false;
    cur = styleOf(style); const S = KIT_STYLE[cur], pal = KIT_PALETTES[cur]; active = true; centre = { x: CX, z: CY }; const P = (x, y) => [CX + x, CY + y];
    put(pal, 'portal', CX, 0, CY, 0); energy = { x: CX, z: CY };
    // vendors: cart in the middle of the station, station props beside it
    for (const c of lay.carts) { const [x, z] = P(c.x, c.y); put(pal, { merchant: 'cartMerchant', smith: 'cartSmith', mystic: 'cartMystic' }[c.key], x, 0, z, c.yaw); put(pal, { merchant: 'stationMerchant', smith: 'stationSmith', mystic: 'stationMystic' }[c.key], x, 0, z, c.yaw); }
    // buildings
    for (const h of lay.houses) {
      const list = HOUSE_FOR[h.type] || HOUSE_FOR.house, key = list[Math.floor(hash(h.x, h.y) * list.length) % list.length], [nw, nd] = NOMINAL[key], [x, z] = P(h.x, h.y);
      const sx = h.w / nw, sz = h.d / nd, sy = Math.max(.85, Math.min(1.35, (sx + sz) / 2)) * (h.type === 'cathedral' || h.type === 'palace' ? 1.25 : 1);
      put(pal, key, x, 0, z, h.yaw, sx, sy, sz);
    }
    // props from the layout
    for (const p of lay.props) {
      const [x, z] = P(p.x, p.y), yaw = p.yaw || 0, r = hash(p.x, p.y);
      switch (p.type) {
        case 'lamp': put(pal, 'lantern', x, 0, z, Math.atan2(-p.x, -p.y) - Math.PI / 2); break;
        case 'tree': case 'bigtree': put(pal, S.trees[r < .5 ? 0 : 1], x, 0, z, r * 6.28, p.type === 'bigtree' ? 1.5 : 1, p.type === 'bigtree' ? 1.5 : 1.05, p.type === 'bigtree' ? 1.5 : 1); break;
        case 'rock': put(pal, r < .5 ? 'rock' : 'boulder', x, 0, z, r * 6.28, .7, .7, .7); break;
        case 'well': put(pal, 'well', x, 0, z, 0); break;
        case 'garden': put(pal, S.garden, x, 0, z, yaw, (p.w || 32) / 32, 1, (p.d || 20) / 20); break;
        case 'flowers': case 'planter': put(pal, S.bush, x, 0, z, r * 6.28, .8, .8, .8); break;
        case 'statue': put(pal, 'statue', x, 0, z, Math.atan2(-p.x, -p.y)); break;
        case 'obelisk': put(pal, 'obelisk', x, 0, z, Math.atan2(-p.x, -p.y)); break;
        case 'pillar': put(pal, 'pillar', x, 0, z, r * 6.28); break;
        case 'brazier': put(pal, 'brazier', x, 0, z, 0); break;
        case 'banner': put(pal, 'banner', x, 0, z, Math.atan2(p.x, p.y)); break;
        case 'crates': put(pal, 'crates', x, 0, z, r * 6.28); break;
        case 'barrels': put(pal, 'barrels', x, 0, z, r * 6.28); break;
        case 'stall': put(pal, 'marketStall', x, 0, z, yaw, (p.w || 34) / 34, 1, (p.d || 18) / 18); break;
        case 'rampart': for (let k = 0; k < Math.max(1, Math.round(p.w / 24)); k++) put(pal, 'wall', x, 0, z, yaw, p.w / 24 / Math.max(1, Math.round(p.w / 24)), .55, .7); break;
        case 'fountain': put(pal, 'well', x, 0, z, 0, 1.3, 1, 1.3); break;
        default: break; // stairs, arch and pond stay with the base renderer
      }
    }
    // the wall: 24-unit modules along each segment, round towers on polygon corners, gate towers and arches on the roads
    const W = lay.wall;
    for (const s of W.segments) {
      const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1), n = Math.max(1, Math.round(len / 24)), ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1), yaw = -ang;
      // outward side of the segment: merlons stand on the outer edge
      const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2, out = Math.sin(yaw) * mx + Math.cos(yaw) * my > 0 ? 0 : Math.PI;
      for (let k = 0; k < n; k++) { const t = (k + .5) / n, [x, z] = P(s.x1 + (s.x2 - s.x1) * t, s.y1 + (s.y2 - s.y1) * t); put(pal, 'wall', x, 0, z, yaw + out, len / n / 24, 1, W.thickness / 11); }
    }
    for (const t of W.towers) { const [x, z] = P(t.x, t.y); put(pal, 'tower', x, 0, z, Math.atan2(t.x, t.y)); }
    if (W.shape !== 'polygon') for (let k = 0; k < 8; k++) { const a = Math.PI / 4 * k + Math.PI / 8, [x, z] = P(Math.cos(a) * W.r, Math.sin(a) * W.r); put(pal, 'tower', x, 0, z, a); }
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2, half = Math.max(W.gateHalfWidth, lay.roads[k].half + 8), d = W.inner, yaw = Math.PI / 2 - a, px = Math.cos(a), pz = Math.sin(a);
      put(pal, 'gateArch', CX + px * d, 0, CZ(CY, pz, d), yaw, (half * 2 + 4) / 100, 1, 1);
      for (const sgn of [-1, 1]) put(pal, 'gateTower', CX + px * d - pz * sgn * (half + 13), 0, CY + pz * d + px * sgn * (half + 13), yaw);
    }
    // scatter: subtle dark-fantasy details in free corners (visual only, no collision), never on roads, doors, plaza or NPC areas
    const doorsteps = lay.houses.map(h => ({ type: 'circle', x: h.x + Math.sin(h.yaw) * (h.d / 2 + 17), y: h.y + Math.cos(h.yaw) * (h.d / 2 + 17), r: 15 }));
    const clearOf = (x, y, r) => { const c = { type: 'circle', x, y, r }; return Math.hypot(x, y) > lay.plazaR + 30 && Math.hypot(x, y) + r < W.inner - 14 && !lay.roads.some(o => Settlement.overlaps(c, o, 4)) && !lay.obstacles.some(o => Settlement.overlaps(c, o, 4)) && !doorsteps.some(o => Settlement.overlaps(c, o, 0)) && !lay.props.some(o => o.solid && Settlement.overlaps(c, o.shape, 3)) && !Object.values(lay.npcSpots).some(n => Math.hypot(n.x - x, n.y - y) < 40); };
    const DETAIL = S.details, used = [];
    let seed = (lay.layout || 'v').length * 977 + 13; const R2 = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0, placed = 0; i < 400 && placed < 46; i++) {
      const a = R2() * Math.PI * 2, r = lay.plazaR + 40 + R2() * (W.inner - lay.plazaR - 60), x = Math.cos(a) * r, y = Math.sin(a) * r, [key, rad] = DETAIL[Math.floor(R2() * DETAIL.length)];
      if (!clearOf(x, y, rad) || used.some(u => Math.hypot(u.x - x, u.y - y) < u.r + rad + 10)) continue;
      used.push({ x, y, r: rad }); const [wx, wz] = P(x, y); put(pal, key, wx, 0, wz, key === 'fence' ? Math.atan2(-x, -y) + Math.PI / 2 : R2() * 6.28); placed++;
    }
    return true;
  }
  const CZ = (CY, pz, d) => CY + pz * d;
  function clear() { groups = new Map(); lights = []; smoke = []; active = false; centre = null; energy = null; log = []; }
  const ringCol = () => KIT_STYLE[cur].energy, sparkCol = () => KIT_STYLE[cur].spark;
  // Per frame: queue every group (one instanced draw per asset part), plus lights, smoke and the live portal energy.
  function draw(now, cam, portalOpen) {
    if (!active || !centre || Math.abs(centre.x - cam.x) > 1900 || Math.abs(centre.z - cam.z) > 1900) return;
    for (const g of groups.values()) GL.pushInst(g.mesh, g.arr, g.n, !g.shadow);
    const nt = 1 - GL.sky().d;
    for (const l of lights) { const f = Math.sin(now / 130 + l.x) * .5; D(M.ball, l.x, l.y + f * .2, l.z, 1.6 + f * .15, 1.9, 1.6 + f * .15, 0, 0, l.c, 1); if (nt > .3) D(M.disc, l.x, 1.3, l.z, 46, 1, 46, 0, 0, l.c, 1, .06 * nt); }
    for (const s of smoke) if (Math.random() < .05) burst(s.x, s.y, s.z, 1, [.24, .23, .26], 14, 2.6, 3.2, 0, -26);
    if (energy && portalOpen !== false) { const pu = .5 + Math.sin(now / 420) * .5; if (Math.random() < .5) burst(energy.x + (Math.random() - .5) * 50, 20 + Math.random() * 130, energy.z + (Math.random() - .5) * 6, 1, sparkCol(), 18, 1.2, 1.6, 1, -20 - pu * 30);
      D(M.ring, energy.x, 7.2, energy.z, 47 + pu * 3, 1, 47 + pu * 3, -now / 900, 0, ringCol(), 1, .8); }
  }
  function stats() { let tris = 0, meshes = 0, inst = 0; for (const a of Object.values(BUILT[cur] || {})) for (const m of a.meshes) { tris += m.tris; meshes++; } for (const g of groups.values()) inst += g.n; return { assets: Object.keys(BUILT[cur] || {}).length, meshes, tris, groups: groups.size, instances: inst, lights: lights.length }; }
  // Lay out assets in a row for review (asset sheet / debugging): keys, spacing, around (x, z).
  function gallery(keys, x0, z0, style, spacing = 110) {
    clear(); cur = styleOf(style); active = true; centre = { x: x0, z: z0 }; const pal = KIT_PALETTES[cur];
    keys.forEach((k, i) => { for (const part of k.split('+')) put(pal, part, x0 + (i - (keys.length - 1) / 2) * spacing, 0, z0, 0); });
    return keys.length;
  }
  return { KIT_PALETTES, KIT_STYLE, RECIPES: R, place, draw, clear, stats, gallery, placements: () => log.slice(), isActive: () => active, build, styleKeys, style: () => cur };
})();
