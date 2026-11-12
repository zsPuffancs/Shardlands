// Shardlands vegetation distribution: groves, open woodland and clearings instead of uniform scatter.
//
// plan() decides where every tree, understory piece and grass tuft of a biome look goes. world.js (bakeDecor) then
// places them with the existing nature pack, GPU instancing, chunk culling and far stand-ins, exactly like before.
// Only the looks listed in RECIPES use this; the others keep the original scatter.
//
// Deterministic and order-free: every decision is a hash of (seed, cell, salt), so all clients build the same forest
// and nothing here touches the shared random stream that the rest of the world bake uses.
//
// How a forest is made:
//  1. A density field (two octaves of value noise) splits the biome into groves, open woodland and clearings.
//  2. Deliberate clearings: one candidate per large cell, so open ground for moving and fighting is spread evenly.
//  3. Readable approaches: no canopy over roads, thinned edges along them, a wide ring free of trees round the village.
//  4. Tree candidates on a jittered grid get a probability from the field, a model, a size and a priority.
//  5. Candidates are accepted by priority with canopy-aware spacing (a sapling may stand closer than two old pines)
//     until the biome's tree budget per km2 is reached: the budget, not the clustering, sets the total.
//  6. Understory round the trees, logs and stumps in open woodland, rock outcrops at clearings, grass in patches.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Vegetation = api;
})(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  // ---------- deterministic hashing and noise ----------
  function hash(seed, a, b, c) {
    let h = (seed ^ 0x9e3779b9) >>> 0;
    for (const v of [a | 0, b | 0, c | 0]) { h = Math.imul(h ^ v, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; }
    return (h >>> 0) / 4294967296;
  }
  const smooth = t => t * t * (3 - 2 * t);
  function noise(seed, x, y, scale, salt) {
    const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy), tx = smooth(fx - ix), ty = smooth(fy - iy);
    const a = hash(seed, ix, iy, salt), b = hash(seed, ix + 1, iy, salt), c = hash(seed, ix, iy + 1, salt), d = hash(seed, ix + 1, iy + 1, salt);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
  const seq = (base, n) => Array.from({ length: n }, (_, i) => base + '_' + (i + 1));

  // ---------- recipes (per biome look; index = the zone look used by world.js) ----------
  const GLOOM_TINT = [.75, .85, .8], GLOOM_GRASS = [.72, .82, .78];
  const RECIPES = {
    1: { // Gloomwood / wildwood: dark mixed forest of pines and willows, autumn accents
      name: 'Gloomwood',
      budget: 52,                      // big trees per km2 (the uniform scatter had ~118)
      trees: [                         // models, weight, height range, kind ('young' = saplings at grove edges)
        { models: seq('PineTree', 5), w: 4, size: [150, 215] },
        { models: seq('q1_Pine', 5), w: 2.2, size: [130, 180] },
        { models: seq('Willow', 5), w: 1.6, size: [120, 155] },
        { models: seq('CommonTree_Autumn', 5), w: .9, size: [115, 150] },
        { models: seq('PineTree_Autumn', 5), w: .5, size: [140, 190] },
        { models: seq('PineTree', 5), w: 1.4, size: [72, 105], young: true },
      ],
      spacing: { trunk: 24, canopy: .74 }, // two trees need max(trunk, canopy * (rA + rB)) between trunks
      field: { scale: 900, fine: 280, grove: .57, open: .42 },       // noise bands: >= grove, >= open, else thin
      chance: { grove: 1, open: .62, thin: .16 },                    // candidate chance per cell (the budget trims)
      cell: 56,                                                        // candidate grid
      clearings: { cell: 520, chance: .96, r: [130, 220] },            // deliberate open ground, spread evenly
      roads: { clearance: 54, edge: 200, edgeChance: .3 },             // canopy stays off the road; thinned along it
      village: 240,                                                    // tree-free ring beyond the safe zone
      understory: { chance: { grove: .6, open: .45, thin: .3 }, count: [1, 3], ring: [.45, 1.1], items: [
        { models: ['Bush_1', 'Bush_2'], w: 3, size: [24, 38], tint: GLOOM_TINT },
        { models: seq('Plant', 5), w: 3, size: [14, 22], tint: [.8, .9, .85] },
        { models: seq('Rock_Moss', 7), w: 1.6, size: [16, 36], bySize: true },
        { models: ['TreeStump_Moss'], w: .8, size: [14, 19] },
      ] },
      groundProps: { cell: 230, chance: .32, items: [
        { models: ['WoodLog_Moss'], w: 2, size: [44, 60], bySize: true },
        { models: ['TreeStump_Moss'], w: 1.4, size: [14, 19] },
        { models: ['BushBerries_1', 'BushBerries_2'], w: .8, size: [24, 34], tint: GLOOM_TINT },
      ] },
      outcrops: { cell: 460, chance: .4, count: [3, 6], r: [16, 46], models: seq('Rock_Moss', 7), size: [16, 48] },
      grass: { cell: 135, chance: { clearing: .62, thin: .5, open: .42, grove: .14 }, count: [6, 17], r: [24, 62], items: [
        { models: ['Grass_Short', 'Grass'], w: 8, size: [9, 15], tint: GLOOM_GRASS },
        { models: seq('Plant', 5), w: 1.1, size: [12, 18], tint: [.8, .9, .85] },
        { models: ['Flowers'], w: .5, size: [9, 13], tint: [.8, .85, .9], clearingOnly: true },
      ] },
    },
  };
  const LOOKS = Object.keys(RECIPES).map(Number);

  const pick = (list, r) => { let t = 0; for (const e of list) t += e.w; let k = r * t; for (const e of list) { k -= e.w; if (k <= 0) return e; } return list[list.length - 1]; };

  // opts: { look, seed, W, H, CX, CY, V, zoneOf(x, z) -> look, onRoad(x, z, halfWidth) -> bool, dims(name) -> { h, w } }
  // Returns { items: [{ name, x, z, size, yaw, tint, cat, bySize }], stats }.
  function plan(opts) {
    const R = RECIPES[opts.look]; if (!R) return { items: [], stats: null };
    const { W, H, CX, CY, V, zoneOf, onRoad, dims } = opts, seed = (opts.seed >>> 0) ^ (opts.look * 0x2545F491);
    const inLook = (x, z) => x > 0 && z > 0 && x < W && z < H && zoneOf(x, z) === opts.look;
    const items = [], F = R.field, nearVillage = (x, z, r) => Math.hypot(x - CX, z - CY) < V + r;
    const field = (x, z) => .72 * noise(seed, x, z, F.scale, 1) + .28 * noise(seed, x, z, F.fine, 2);

    // deliberate clearings, one candidate per large cell
    const clearings = [], C = R.clearings;
    for (let gx = 0; gx * C.cell < W; gx++) for (let gz = 0; gz * C.cell < H; gz++) {
      if (hash(seed, gx, gz, 11) > C.chance) continue;
      const x = (gx + .15 + .7 * hash(seed, gx, gz, 12)) * C.cell, z = (gz + .15 + .7 * hash(seed, gx, gz, 13)) * C.cell;
      if (inLook(x, z)) clearings.push({ x, z, r: C.r[0] + hash(seed, gx, gz, 14) * (C.r[1] - C.r[0]) });
    }
    const cg = new Map(), cKey = (x, z) => Math.floor(x / C.cell) + ',' + Math.floor(z / C.cell);
    for (const c of clearings) { const k = cKey(c.x, c.z); (cg.get(k) || cg.set(k, []).get(k)).push(c); }
    const inClearing = (x, z, pad = 0) => { const kx = Math.floor(x / C.cell), kz = Math.floor(z / C.cell); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const c of cg.get((kx + a) + ',' + (kz + b)) || []) if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true; return false; };
    const band = (x, z) => { if (inClearing(x, z)) return 'clearing'; const f = field(x, z); return f >= F.grove ? 'grove' : f >= F.open ? 'open' : 'thin'; };

    // tree candidates: jittered grid, chance from the band, then canopy-aware spacing by priority up to the budget
    const cand = []; let cells = 0;
    for (let gx = 0; gx * R.cell < W; gx++) for (let gz = 0; gz * R.cell < H; gz++) {
      const x = (gx + hash(seed, gx, gz, 21)) * R.cell, z = (gz + hash(seed, gx, gz, 22)) * R.cell;
      if (!inLook(x, z)) continue; cells++;
      const b = band(x, z); if (b === 'clearing') continue;
      let p = R.chance[b]; if (onRoad(x, z, R.roads.edge)) p *= R.roads.edgeChance;
      if (hash(seed, gx, gz, 23) > p || nearVillage(x, z, R.village)) continue;
      const kind = pick(R.trees.filter(t => !t.young || b !== 'thin'), hash(seed, gx, gz, 24)), name = kind.models[Math.floor(hash(seed, gx, gz, 25) * kind.models.length)];
      const d = dims(name); if (!d) continue;
      const size = kind.size[0] + hash(seed, gx, gz, 26) * (kind.size[1] - kind.size[0]), r = size * d.w / d.h / 2;
      if (onRoad(x, z, R.roads.clearance + r * .8) || inClearing(x, z, r * .5)) continue; // canopy off the road and out of clearings
      cand.push({ name, x, z, size, r, yaw: hash(seed, gx, gz, 27) * 6.2832, band: b, young: !!kind.young, pr: hash(seed, gx, gz, 28) + (b === 'grove' ? .45 : b === 'open' ? .2 : 0) }); // groves fill first, thin woodland last
    }
    const area = cells * R.cell * R.cell / 1e6, budget = Math.round(R.budget * area);
    cand.sort((a, b) => b.pr - a.pr || a.x - b.x || a.z - b.z);
    const SG = 120, grid = new Map(), gKey = (x, z) => Math.floor(x / SG) + ',' + Math.floor(z / SG), trees = [];
    const fits = c => { const kx = Math.floor(c.x / SG), kz = Math.floor(c.z / SG); for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (const o of grid.get((kx + a) + ',' + (kz + b)) || []) { const need = Math.max(R.spacing.trunk, R.spacing.canopy * (c.r + o.r)); if (Math.hypot(c.x - o.x, c.z - o.z) < need) return false; } return true; };
    for (const c of cand) { if (trees.length >= budget) break; if (!fits(c)) continue; trees.push(c); const k = gKey(c.x, c.z); (grid.get(k) || grid.set(k, []).get(k)).push(c); }
    for (const t of trees) items.push({ name: t.name, x: t.x, z: t.z, size: t.size, yaw: t.yaw, tint: null, cat: 0, bySize: false, r: t.r });

    const piece = (list, x, z, h, cat, extra) => { const e = pick(list, h(1)), name = e.models[Math.floor(h(2) * e.models.length)], size = e.size[0] + h(3) * (e.size[1] - e.size[0]); items.push({ name, x, z, size, yaw: h(4) * 6.2832, tint: e.tint || null, cat, bySize: !!e.bySize, ...extra }); };
    const freeGround = (x, z, w) => inLook(x, z) && !onRoad(x, z, w) && !nearVillage(x, z, 60);

    // understory round the trees (bushes, plants, mossy rocks, stumps)
    const U = R.understory;
    trees.forEach((t, i) => {
      if (hash(seed, i, 7, 31) > U.chance[t.band]) return;
      const n = U.count[0] + Math.floor(hash(seed, i, 7, 32) * (U.count[1] - U.count[0] + 1));
      for (let k = 0; k < n; k++) { const h = s => hash(seed, i, k, 40 + s), a = h(5) * 6.2832, d = t.r * (U.ring[0] + h(6) * (U.ring[1] - U.ring[0])), x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d; if (freeGround(x, z, 40)) piece(U.items, x, z, h, 1); }
    });
    // logs, stumps and berry bushes in open woodland and at clearing edges
    const GP = R.groundProps;
    for (let gx = 0; gx * GP.cell < W; gx++) for (let gz = 0; gz * GP.cell < H; gz++) {
      const h = s => hash(seed, gx, gz, 60 + s), x = (gx + h(5)) * GP.cell, z = (gz + h(6)) * GP.cell;
      if (h(0) > GP.chance || !freeGround(x, z, 44)) continue; const b = band(x, z); if (b === 'grove' && h(7) < .6) continue;
      piece(GP.items, x, z, h, 1);
    }
    // rock outcrops at the edges of clearings and in thin woodland
    const O = R.outcrops;
    for (let gx = 0; gx * O.cell < W; gx++) for (let gz = 0; gz * O.cell < H; gz++) {
      const h = s => hash(seed, gx, gz, 80 + s), x = (gx + h(1)) * O.cell, z = (gz + h(2)) * O.cell;
      if (h(0) > O.chance || !freeGround(x, z, 60) || band(x, z) === 'grove') continue;
      const n = O.count[0] + Math.floor(h(3) * (O.count[1] - O.count[0] + 1));
      for (let k = 0; k < n; k++) { const hk = s => hash(seed, gx * 64 + k, gz, 90 + s), a = hk(1) * 6.2832, d = O.r[0] + hk(2) * (O.r[1] - O.r[0]) * (k ? 1 : 0), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        if (freeGround(px, pz, 44)) items.push({ name: O.models[Math.floor(hk(3) * O.models.length)], x: px, z: pz, size: (O.size[0] + hk(4) * (O.size[1] - O.size[0])) * (k ? .7 : 1.15), yaw: hk(5) * 6.2832, tint: null, cat: 1, bySize: true }); }
    }
    // grass and flowers in irregular patches: plenty in clearings and thin woodland, little under the groves
    const G = R.grass;
    for (let gx = 0; gx * G.cell < W; gx++) for (let gz = 0; gz * G.cell < H; gz++) {
      const h = s => hash(seed, gx, gz, 100 + s), x = (gx + h(1)) * G.cell, z = (gz + h(2)) * G.cell;
      if (!inLook(x, z) || nearVillage(x, z, 30)) continue; const b = band(x, z);
      if (h(0) > G.chance[b]) continue;
      const n = G.count[0] + Math.floor(h(3) * (G.count[1] - G.count[0] + 1)), rad = G.r[0] + h(4) * (G.r[1] - G.r[0]), stretch = .55 + h(5) * .9, rot = h(6) * 6.2832;
      for (let k = 0; k < n; k++) {
        const hk = s => hash(seed, gx * 64 + k, gz, 120 + s), a = hk(1) * 6.2832, d = Math.sqrt(hk(2)) * rad, lx = Math.cos(a) * d * stretch, lz = Math.sin(a) * d;
        const px = x + lx * Math.cos(rot) - lz * Math.sin(rot), pz = z + lx * Math.sin(rot) + lz * Math.cos(rot);
        if (!freeGround(px, pz, 26)) continue;
        const list = b === 'clearing' ? G.items : G.items.filter(e => !e.clearingOnly);
        piece(list, px, pz, hk, 2);
      }
    }
    return { items, stats: { look: opts.look, areaKm2: +area.toFixed(2), budget, candidates: cand.length, trees: trees.length, clearings: clearings.length, mid: items.filter(i => i.cat === 1).length, ground: items.filter(i => i.cat === 2).length } };
  }

  return { RECIPES, LOOKS, plan, hash, noise };
});
