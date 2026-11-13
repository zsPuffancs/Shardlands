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
//  7. Optional per recipe: rock formations, barren (lifeless) patches, fallen-timber heaps, bones and dead roots.
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
    0: { // Whispering Meadows: wide open grassland, lone trees and the odd copse, flower meadows, patches of bare ground
      name: 'Meadows',
      budget: 17,
      trees: [
        { models: seq('CommonTree', 5), w: 5, size: [115, 170] },
        { models: seq('BirchTree', 5), w: 2.5, size: [120, 165] },
        { models: seq('q1_Tree', 10), w: 2, size: [100, 145] },
      ],
      spacing: { trunk: 40, canopy: 1.25, group: .8, apart: 170 }, // lone trees and copses keep well apart; copse trees may touch
      field: { scale: 760, fine: 300, grove: .58, open: .4 },
      chance: { grove: .6, open: .24, thin: 0 },            // below 'open' the land is tree-free
      cell: 80,
      clearings: null,
      copses: { cell: 520, chance: .6, count: [2, 3], r: [55, 95] },
      roads: { clearance: 60, edge: 220, edgeChance: .2 },
      village: 240,
      understory: { chance: { grove: .55, open: .45, thin: .4 }, count: [1, 2], ring: [.55, 1.2], items: [
        { models: ['Bush_1', 'Bush_2'], w: 3, size: [24, 36] },
        { models: ['BushBerries_1', 'BushBerries_2'], w: 1.6, size: [24, 34] },
        { models: seq('Plant', 5), w: 2, size: [14, 22] },
      ] },
      groundProps: { cell: 175, chance: .3, groveSkip: 0, items: [
        { models: ['Bush_1', 'Bush_2'], w: 3, size: [22, 34] },
        { models: ['BushBerries_1', 'BushBerries_2'], w: 1.8, size: [22, 32] },
        { models: seq('Rock_Moss', 7), w: 1.6, size: [10, 24], bySize: true },
        { models: ['WoodLog'], w: .7, size: [38, 54], bySize: true },
        { models: ['TreeStump'], w: .7, size: [13, 17] },
      ] },
      outcrops: { cell: 560, chance: .3, count: [2, 4], r: [12, 30], models: seq('Rock_Moss', 7), size: [12, 30] },
      grass: { cell: 105, chance: { clearing: .7, thin: .66, open: .6, grove: .42 }, count: [8, 22], r: [26, 72], items: [
        { models: ['Grass_Short'], w: 6, size: [9, 14] },
        { models: ['Grass', 'Grass_2'], w: 4, size: [10, 15] },
        { models: seq('Plant', 5), w: .5, size: [12, 18] },
        { models: ['Flowers'], w: .45, size: [10, 14] },
      ],
      flowers: { scale: 520, above: .63, items: [{ models: ['Flowers'], w: 5, size: [10, 14] }, { models: ['Grass_Short'], w: 3, size: [9, 13] }, { models: ['Grass'], w: 1, size: [10, 14] }] },
      bare: { scale: 760, below: .34, factor: .12 } },
    },
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
    4: { // Frostfang Peaks / glacier: snow-laden pine pockets and small stands, snowy openings, exposed rock, fallen trees
      name: 'Frostfang',
      budget: 46,
      trees: [
        { models: seq('PineTree_Snow', 5), w: 6, size: [150, 215] },
        { models: seq('PineTree_Snow', 5), w: 1.6, size: [70, 105], young: true },
        { models: seq('CommonTree_Snow', 5), w: 1, size: [115, 160] },
        { models: seq('BirchTree_Snow', 5), w: .55, size: [120, 160] },
        { models: seq('CommonTree_Dead_Snow', 5), w: .45, size: [105, 145] },
        { models: seq('BirchTree_Dead_Snow', 5), w: .3, size: [100, 140] },
      ],
      spacing: { trunk: 26, canopy: .8, group: .72 },  // a little roomier than Gloomwood; stand trees may touch
      field: { scale: 820, fine: 260, grove: .56, open: .44 },
      chance: { grove: 1, open: .45, thin: .04 },      // pockets of woodland, sparse in between, nearly bare below
      cell: 58,
      clearings: { cell: 600, chance: .85, r: [140, 235] }, // open snowfields spread through the woods
      copses: { cell: 400, chance: .55, count: [2, 5], r: [50, 115] }, // small stands out in the open
      roads: { clearance: 56, edge: 200, edgeChance: .3 },
      village: 240,
      understory: { chance: { grove: .5, open: .45, thin: .35 }, count: [1, 2], ring: [.5, 1.15], items: [
        { models: ['Bush_Snow_1', 'Bush_Snow_2'], w: 3, size: [22, 34] },
        { models: seq('Rock_Snow', 7), w: 2, size: [14, 30], bySize: true },
        { models: ['TreeStump_Snow'], w: 1, size: [13, 18] },
      ] },
      groundProps: { cell: 210, chance: .34, groveSkip: .5, items: [
        { models: ['WoodLog_Snow'], w: 2.4, size: [42, 58], bySize: true },
        { models: ['TreeStump_Snow'], w: 1.4, size: [13, 18] },
        { models: ['Bush_Snow_1', 'Bush_Snow_2'], w: 1.6, size: [20, 32] },
        { models: seq('Rock_Snow', 7), w: 1.6, size: [16, 36], bySize: true },
      ] },
      outcrops: { cell: 380, chance: .55, count: [3, 7], r: [18, 58], models: seq('Rock_Snow', 7), size: [20, 56] }, // exposed rock
      grass: { cell: 150, chance: { clearing: .3, thin: .32, open: .26, grove: .08 }, count: [3, 9], r: [20, 50], items: [
        { models: ['Bush_Snow_1', 'Bush_Snow_2'], w: 2, size: [10, 16] },
        { models: seq('Rock_Snow', 7), w: 1.6, size: [6, 12], bySize: true },
        { models: ['Grass_Short'], w: 1.4, size: [7, 11], tint: [.82, .9, .94] },
      ],
      bare: { scale: 700, below: .4, factor: .2 } },
    },
    2: { // Ashen Barrens / warfields: harsh stony ground, rock formations, a few twisted or hardy trees, dry scrub in pockets
      name: 'Ashen Barrens',
      budget: 13,
      trees: [
        { models: seq('q1_DeadTree', 10), w: 3, size: [95, 140], tint: [.85, .8, .78] },
        { models: seq('CommonTree_Dead', 5), w: 1.8, size: [105, 150] },
        { models: seq('BirchTree_Dead', 5), w: .9, size: [105, 145] },
        { models: seq('Willow_Dead', 5), w: .8, size: [100, 140] },
        { models: seq('CommonTree_Autumn', 5), w: .7, size: [95, 130] },   // hardy, dry-leaved survivors
      ],
      spacing: { trunk: 36, canopy: 1.2, group: .8, apart: 170 },        // isolated trees; pairs and threes may touch
      field: { scale: 900, fine: 300, grove: .58, open: .46 },            // trees only in the scrubby pockets
      chance: { grove: .6, open: .2, thin: 0 },
      cell: 80,
      clearings: null,
      copses: { cell: 700, chance: .3, count: [2, 3], r: [45, 85] },
      roads: { clearance: 58, edge: 220, edgeChance: .3 },
      village: 240,
      understory: { chance: { grove: .6, open: .5, thin: .4 }, count: [1, 2], ring: [.5, 1.2], items: [
        { models: ['Bush_1', 'Bush_2'], w: 2, size: [18, 30], tint: [.88, .74, .5] },
        { models: seq('Rock', 7), w: 2, size: [12, 26], bySize: true, tint: [.88, .83, .78] },
        { models: ['TreeStump'], w: 1, size: [13, 17], tint: [.8, .75, .7] },
      ] },
      groundProps: { cell: 240, chance: .3, groveSkip: 0, items: [
        { models: ['WoodLog'], w: 1.6, size: [36, 54], bySize: true, tint: [.75, .7, .65] },  // fallen trunks and dead branches
        { models: ['TreeStump'], w: 1.4, size: [12, 17], tint: [.8, .75, .7] },
        { models: ['Bush_1', 'Bush_2'], w: 1.6, size: [16, 28], tint: [.88, .74, .5] },
        { models: seq('Plant', 5), w: .8, size: [12, 18], tint: [.9, .8, .55] },
      ] },
      outcrops: { cell: 9999, chance: 0, count: [0, 0], r: [0, 0], models: seq('Rock', 7), size: [0, 0] },   // replaced by the formations
      formations: { cell: 300, scale: 650, above: .5, chance: .72, elsewhere: .3, largeShare: .4, models: seq('Rock', 7),
        tints: [[.9, .85, .8], [.78, .74, .7], [.95, .88, .78], [.7, .66, .64]],
        large: { core: [2, 4], size: [62, 112], coreR: 42, spread: 95, stones: [6, 12] },
        small: { core: [1, 2], size: [30, 56], coreR: 22, spread: 55, stones: [2, 6] },
        stone: [9, 24] },
      grass: { cell: 140, chance: { clearing: .3, thin: .2, open: .32, grove: .5 }, count: [4, 12], r: [22, 56], items: [
        { models: ['Grass_Short'], w: 5, size: [8, 12], tint: [1.25, 1.05, .6] },
        { models: seq('Rock', 7), w: 2.4, size: [5, 11], bySize: true, tint: [.86, .8, .74] },  // pebbles
        { models: seq('Plant', 5), w: .8, size: [10, 15], tint: [.95, .82, .55] },
      ],
      bare: { scale: 820, below: .5, factor: .15 } },
    },
    6: { // Deadlands / Death Zone / necropolis: corrupted land where almost everything has died. Lifeless barrens, sparse
         // dead woodland and knots of twisted trees, fallen trunks and broken branches, bones and exposed dead roots
      name: 'Deadlands',
      budget: 33,
      trees: [
        { models: seq('q1_DeadTree', 10), w: 4, size: [95, 145], tint: [.3, .17, .16] },     // twisted, leafless
        { models: seq('Willow_Dead', 5), w: 1.5, size: [105, 150], tint: [.27, .15, .15] },
        { models: seq('CommonTree_Dead', 5), w: 1.2, size: [100, 150], tint: [.3, .2, .18] },
        { models: seq('q1_DeadBirch', 10), w: 1.1, size: [90, 135], tint: [.36, .24, .22] },
        { models: seq('BirchTree_Dead', 5), w: .5, size: [100, 140], tint: [.33, .22, .2] },
        { models: seq('q1_DeadTree', 10), w: .9, size: [60, 85], tint: [.26, .15, .14], young: true }, // stunted, at the edges
      ],
      spacing: { trunk: 30, canopy: .9, group: .55 },  // bare crowns: knots of trees may stand close together
      field: { scale: 800, fine: 260, grove: .6, open: .45 }, // dead woodland, sparse lone trees, and nothing below 'open'
      chance: { grove: 1, open: .4, thin: 0 },
      cell: 64,
      clearings: null,
      copses: { cell: 460, chance: .5, count: [3, 6], r: [32, 85] },   // small knots of twisted trees
      roads: { clearance: 56, edge: 200, edgeChance: .3 },
      village: 240,
      lifeless: { scale: 620, below: .34, fade: .14 },                 // barren patches; life fades in at their edges
      understory: { chance: { grove: .45, open: .45, thin: .3 }, count: [1, 2], ring: [.5, 1.3], items: [
        { models: ['Bush_1', 'Bush_2'], w: 2.4, size: [16, 28], tint: [.3, .2, .16] },          // dead, thorny scrub
        { models: ['TreeStump'], w: 1.2, size: [12, 17], tint: [.36, .25, .22] },
        { models: seq('Plant', 5), w: 1, size: [10, 16], tint: [.42, .3, .24] },               // dried plants
        { models: seq('Rock', 7), w: 1, size: [10, 22], bySize: true, tint: [.34, .22, .21] },
      ] },
      groundProps: { cell: 240, chance: .28, groveSkip: .4, items: [
        { models: ['WoodLog'], w: 1.6, size: [40, 60], bySize: true, tint: [.4, .28, .24] },   // fallen trunks
        { models: ['WoodLog'], w: 1.4, size: [14, 24], bySize: true, tint: [.36, .25, .22] },  // broken branches
        { models: ['TreeStump'], w: 1.2, size: [12, 18], tint: [.36, .25, .22] },
        { models: ['Bush_1', 'Bush_2'], w: 1, size: [14, 24], tint: [.3, .2, .16] },
      ] },
      outcrops: { cell: 520, chance: .35, count: [2, 5], r: [14, 40], models: seq('Rock', 7), size: [16, 46], tint: [.35, .22, .22] },
      debris: { cell: 340, scale: 700, above: .56, chance: .62, elsewhere: .14, r: 75,  // fallen trunks and broken branches
        logs: [2, 4], branches: [3, 7], stumps: [0, 2], log: [40, 64], branch: [13, 24], tint: [.4, .28, .24] },
      remains: { cell: 400, scale: 900, above: .58, chance: .55, elsewhere: .12, r: 60,  // bones and dead roots
        bones: [1, 3], roots: [0, 2], boneSize: [24, 36], rootSize: [24, 36] },
      grass: { cell: 150, chance: { clearing: .2, thin: .16, open: .24, grove: .3 }, count: [3, 8], r: [18, 46], items: [
        { models: ['Grass_Short'], w: 3, size: [8, 12], tint: [.55, .42, .3] },                // dead grass
        { models: seq('Rock', 7), w: 2.4, size: [5, 10], bySize: true, tint: [.3, .22, .2] },  // grit
        { models: seq('Plant', 5), w: .8, size: [9, 14], tint: [.42, .3, .24] },
      ],
      bare: { scale: 700, below: .5, factor: .2 } },
    },
  };
  const LOOKS = Object.keys(RECIPES).map(Number);

  const pick = (list, r) => { let t = 0; for (const e of list) t += e.w; let k = r * t; for (const e of list) { k -= e.w; if (k <= 0) return e; } return list[list.length - 1]; };

  // opts: { look, seed, W, H, CX, CY, V, zoneOf(x, z) -> look, onRoad(x, z, halfWidth) -> bool, dims(name) -> { h, w } }
  // Returns { items: [{ name, x, z, size, yaw, tint, cat, bySize } or { prim, x, z, size, yaw, v, cat }], stats }; prim items
  // (bones, roots) are drawn by world.js from engine primitives.
  function plan(opts) {
    const R = RECIPES[opts.look]; if (!R) return { items: [], stats: null };
    const { W, H, CX, CY, V, zoneOf, onRoad, dims } = opts, seed = (opts.seed >>> 0) ^ (opts.look * 0x2545F491);
    const inLook = (x, z) => x > 0 && z > 0 && x < W && z < H && zoneOf(x, z) === opts.look;
    const items = [], F = R.field, nearVillage = (x, z, r) => Math.hypot(x - CX, z - CY) < V + r;
    const field = (x, z) => .72 * noise(seed, x, z, F.scale, 1) + .28 * noise(seed, x, z, F.fine, 2);
    // lifeless ground (optional): 0 in barren patches, rising to 1 across their edges, so life fades in gradually
    const LF = R.lifeless, life = (x, z) => { const n = noise(seed, x, z, LF.scale, 8); return n <= LF.below ? 0 : n >= LF.below + LF.fade ? 1 : (n - LF.below) / LF.fade; };

    // deliberate clearings, one candidate per large cell
    const clearings = [], C = R.clearings || { cell: 1000, chance: 0, r: [0, 0] }; // a recipe without clearings (open meadows)
    if (R.clearings) for (let gx = 0; gx * C.cell < W; gx++) for (let gz = 0; gz * C.cell < H; gz++) {
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
      let p = R.chance[b]; if (onRoad(x, z, R.roads.edge)) p *= R.roads.edgeChance; if (LF) p *= life(x, z);
      if (hash(seed, gx, gz, 23) > p || nearVillage(x, z, R.village)) continue;
      const kind = pick(R.trees.filter(t => !t.young || b !== 'thin'), hash(seed, gx, gz, 24)), name = kind.models[Math.floor(hash(seed, gx, gz, 25) * kind.models.length)];
      const d = dims(name); if (!d) continue;
      const size = kind.size[0] + hash(seed, gx, gz, 26) * (kind.size[1] - kind.size[0]), r = size * d.w / d.h / 2;
      if (onRoad(x, z, R.roads.clearance + r * .8) || inClearing(x, z, r * .5)) continue; // canopy off the road and out of clearings
      cand.push({ name, x, z, size, r, tint: kind.tint || null, yaw: hash(seed, gx, gz, 27) * 6.2832, band: b, young: !!kind.young, pr: hash(seed, gx, gz, 28) + (b === 'grove' ? .45 : b === 'open' ? .2 : 0) }); // groves fill first, thin woodland last
    }
    // copses (optional): small groups of 2-3 trees round a point; they go first, and stand a little closer to each other
    const K = R.copses;
    if (K) for (let gx = 0; gx * K.cell < W; gx++) for (let gz = 0; gz * K.cell < H; gz++) {
      const h = s => hash(seed, gx, gz, 140 + s), cx = (gx + .1 + .8 * h(1)) * K.cell, cz = (gz + .1 + .8 * h(2)) * K.cell;
      if (h(0) > K.chance || !inLook(cx, cz) || nearVillage(cx, cz, R.village) || field(cx, cz) < F.open || (LF && life(cx, cz) < .5)) continue;
      const n = K.count[0] + Math.floor(h(3) * (K.count[1] - K.count[0] + 1)), kind = pick(R.trees.filter(t => !t.young), h(4)), group = gx * 4096 + gz + 1;
      for (let k = 0; k < n; k++) {
        const hk = s => hash(seed, gx * 16 + k, gz, 160 + s), a = hk(1) * 6.2832, d = k ? K.r[0] + hk(2) * (K.r[1] - K.r[0]) : 0, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        const name = kind.models[Math.floor(hk(3) * kind.models.length)], dm = dims(name); if (!dm || !inLook(x, z) || nearVillage(x, z, R.village)) continue;
        const size = (kind.size[0] + hk(4) * (kind.size[1] - kind.size[0])) * (k ? .82 : 1), r = size * dm.w / dm.h / 2;
        if (onRoad(x, z, R.roads.clearance + r * .8)) continue;
        cand.push({ name, x, z, size, r, tint: kind.tint || null, yaw: hk(5) * 6.2832, band: 'grove', young: false, group, pr: 2 + h(6) });
      }
    }
    const area = cells * R.cell * R.cell / 1e6, budget = Math.round(R.budget * area);
    cand.sort((a, b) => b.pr - a.pr || a.x - b.x || a.z - b.z);
    const SG = 120, grid = new Map(), gKey = (x, z) => Math.floor(x / SG) + ',' + Math.floor(z / SG), trees = [];
    const fits = c => { const kx = Math.floor(c.x / SG), kz = Math.floor(c.z / SG); for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (const o of grid.get((kx + a) + ',' + (kz + b)) || []) { const same = c.group && c.group === o.group, need = same ? Math.max(R.spacing.trunk, R.spacing.group * (c.r + o.r)) : Math.max(R.spacing.trunk, R.spacing.apart || 0, R.spacing.canopy * (c.r + o.r)); if (Math.hypot(c.x - o.x, c.z - o.z) < need) return false; } return true; };
    for (const c of cand) { if (trees.length >= budget) break; if (!fits(c)) continue; trees.push(c); const k = gKey(c.x, c.z); (grid.get(k) || grid.set(k, []).get(k)).push(c); }
    for (const t of trees) items.push({ name: t.name, x: t.x, z: t.z, size: t.size, yaw: t.yaw, tint: t.tint || null, cat: 0, bySize: false, r: t.r });

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
      if (h(0) > GP.chance || !freeGround(x, z, 44)) continue; const b = band(x, z); if (b === 'grove' && h(7) < (GP.groveSkip === undefined ? .6 : GP.groveSkip)) continue;
      if (LF && h(8) > life(x, z)) continue;
      piece(GP.items, x, z, h, 1);
    }
    // rock outcrops at the edges of clearings and in thin woodland
    const O = R.outcrops;
    for (let gx = 0; gx * O.cell < W; gx++) for (let gz = 0; gz * O.cell < H; gz++) {
      const h = s => hash(seed, gx, gz, 80 + s), x = (gx + h(1)) * O.cell, z = (gz + h(2)) * O.cell;
      if (h(0) > O.chance || !freeGround(x, z, 60) || band(x, z) === 'grove') continue;
      const n = O.count[0] + Math.floor(h(3) * (O.count[1] - O.count[0] + 1));
      for (let k = 0; k < n; k++) { const hk = s => hash(seed, gx * 64 + k, gz, 90 + s), a = hk(1) * 6.2832, d = O.r[0] + hk(2) * (O.r[1] - O.r[0]) * (k ? 1 : 0), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        if (freeGround(px, pz, 44)) items.push({ name: O.models[Math.floor(hk(3) * O.models.length)], x: px, z: pz, size: (O.size[0] + hk(4) * (O.size[1] - O.size[0])) * (k ? .7 : 1.15), yaw: hk(5) * 6.2832, tint: O.tint || null, cat: 1, bySize: true }); }
    }
    // fallen trunks and broken branches (optional): windthrown heaps, the trunks lying roughly one way, where a 'debris'
    // noise field is high; none in the barren patches
    const DB = R.debris;
    if (DB) for (let gx = 0; gx * DB.cell < W; gx++) for (let gz = 0; gz * DB.cell < H; gz++) {
      const h = s => hash(seed, gx, gz, 220 + s), x = (gx + .1 + .8 * h(1)) * DB.cell, z = (gz + .1 + .8 * h(2)) * DB.cell;
      const strong = noise(seed, x, z, DB.scale, 9) > DB.above;
      if (h(0) > DB.chance * (strong ? 1 : DB.elsewhere) || !freeGround(x, z, 60) || (LF && life(x, z) < .3)) continue;
      const span = (r, s) => r[0] + Math.floor(h(s) * (r[1] - r[0] + 1)), nLog = span(DB.logs, 3), nBranch = span(DB.branches, 4), nStump = span(DB.stumps, 5), fall = h(6) * 6.2832;
      for (let k = 0; k < nLog + nBranch + nStump; k++) {
        const hk = s => hash(seed, gx * 64 + k, gz, 240 + s), log = k < nLog, stump = k >= nLog + nBranch;
        const a = hk(1) * 6.2832, d = Math.sqrt(hk(2)) * DB.r * (log ? .7 : 1), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        if (!freeGround(px, pz, 44)) continue;
        const sz = log ? DB.log : stump ? [12, 18] : DB.branch, size = sz[0] + hk(3) * (sz[1] - sz[0]);
        items.push({ name: stump ? 'TreeStump' : 'WoodLog', x: px, z: pz, size, yaw: log ? fall + (hk(4) - .5) * .9 : hk(4) * 6.2832, tint: DB.tint, cat: 1, bySize: !stump });
      }
    }
    // remains (optional): bone piles and exposed dead roots (a dead stump with roots sprawling round it), gathered where a
    // 'remains' noise field is high, a few elsewhere; bones also lie in the barren patches. Drawn by world.js from
    // primitives (items with 'prim'), like the zone specials.
    const RM = R.remains;
    if (RM) for (let gx = 0; gx * RM.cell < W; gx++) for (let gz = 0; gz * RM.cell < H; gz++) {
      const h = s => hash(seed, gx, gz, 260 + s), x = (gx + .1 + .8 * h(1)) * RM.cell, z = (gz + .1 + .8 * h(2)) * RM.cell;
      const strong = noise(seed, x, z, RM.scale, 10) > RM.above;
      if (h(0) > RM.chance * (strong ? 1 : RM.elsewhere) || !freeGround(x, z, 60)) continue;
      const nBones = RM.bones[0] + Math.floor(h(3) * (RM.bones[1] - RM.bones[0] + 1)), nRoots = LF && life(x, z) < .3 ? 0 : RM.roots[0] + Math.floor(h(4) * (RM.roots[1] - RM.roots[0] + 1));
      for (let k = 0; k < nBones + nRoots; k++) {
        const hk = s => hash(seed, gx * 64 + k, gz, 280 + s), bone = k < nBones, a = hk(1) * 6.2832, d = k ? RM.r * (.35 + .65 * hk(2)) : 0, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        if (!freeGround(px, pz, 44)) continue;
        const sz = bone ? RM.boneSize : RM.rootSize, size = sz[0] + hk(3) * (sz[1] - sz[0]), yaw = hk(4) * 6.2832;
        items.push({ prim: bone ? 'bones' : 'roots', x: px, z: pz, size, yaw, v: hk(5), cat: 1 });
        if (!bone) items.push({ name: 'TreeStump', x: px, z: pz, size: 12 + hk(6) * 6, yaw, tint: [.3, .2, .18], cat: 1, bySize: false });
      }
    }
    // rock formations (optional): a core of large rocks with smaller stones scattered round it; they gather where a
    // 'rocky' noise field is high, so the land alternates between stony ground and quieter stretches
    const FM = R.formations;
    if (FM) for (let gx = 0; gx * FM.cell < W; gx++) for (let gz = 0; gz * FM.cell < H; gz++) {
      const h = s => hash(seed, gx, gz, 180 + s), x = (gx + .1 + .8 * h(1)) * FM.cell, z = (gz + .1 + .8 * h(2)) * FM.cell;
      const rocky = noise(seed, x, z, FM.scale, 7) > FM.above;
      if (h(0) > FM.chance * (rocky ? 1 : FM.elsewhere) || !freeGround(x, z, 70)) continue;
      const big = h(3) < (rocky ? FM.largeShare : FM.largeShare * .4), C2 = big ? FM.large : FM.small, tint = FM.tints[Math.floor(h(4) * FM.tints.length)];
      const nCore = C2.core[0] + Math.floor(h(5) * (C2.core[1] - C2.core[0] + 1)), nStones = C2.stones[0] + Math.floor(h(6) * (C2.stones[1] - C2.stones[0] + 1)), lean = h(7) * 6.2832;
      for (let k = 0; k < nCore + nStones; k++) {
        const hk = s => hash(seed, gx * 64 + k, gz, 200 + s), core = k < nCore;
        const a = core ? lean + hk(1) * 2.4 : hk(1) * 6.2832, d = core ? (k ? C2.coreR * (.4 + .6 * hk(2)) : 0) : C2.coreR * .8 + Math.pow(hk(2), .7) * C2.spread;
        const px = x + Math.cos(a) * d * (core ? 1 : 1 + .35 * Math.cos(a - lean)), pz = z + Math.sin(a) * d;
        if (!freeGround(px, pz, 44)) continue;
        const sz = core ? C2.size : FM.stone, size = (sz[0] + hk(3) * (sz[1] - sz[0])) * (core && k ? .72 : 1);
        items.push({ name: FM.models[Math.floor(hk(4) * FM.models.length)], x: px, z: pz, size, yaw: hk(5) * 6.2832, tint, cat: 1, bySize: true });
      }
    }
    // grass and flowers in irregular patches: plenty in clearings and thin woodland, little under the groves
    const G = R.grass;
    for (let gx = 0; gx * G.cell < W; gx++) for (let gz = 0; gz * G.cell < H; gz++) {
      const h = s => hash(seed, gx, gz, 100 + s), x = (gx + h(1)) * G.cell, z = (gz + h(2)) * G.cell;
      if (!inLook(x, z) || nearVillage(x, z, 30)) continue; const b = band(x, z);
      let chance = G.chance[b]; if (G.bare && noise(seed, x, z, G.bare.scale, 5) < G.bare.below) chance *= G.bare.factor; // bare ground
      if (LF) chance *= life(x, z);
      if (h(0) > chance) continue;
      const flowery = G.flowers && noise(seed, x, z, G.flowers.scale, 6) > G.flowers.above; // flower meadows
      const n = G.count[0] + Math.floor(h(3) * (G.count[1] - G.count[0] + 1)), rad = G.r[0] + h(4) * (G.r[1] - G.r[0]), stretch = .55 + h(5) * .9, rot = h(6) * 6.2832;
      for (let k = 0; k < n; k++) {
        const hk = s => hash(seed, gx * 64 + k, gz, 120 + s), a = hk(1) * 6.2832, d = Math.sqrt(hk(2)) * rad, lx = Math.cos(a) * d * stretch, lz = Math.sin(a) * d;
        const px = x + lx * Math.cos(rot) - lz * Math.sin(rot), pz = z + lx * Math.sin(rot) + lz * Math.cos(rot);
        if (!freeGround(px, pz, 26)) continue;
        const list = flowery ? G.flowers.items : b === 'clearing' ? G.items : G.items.filter(e => !e.clearingOnly);
        piece(list, px, pz, hk, 2);
      }
    }
    const stats = { look: opts.look, areaKm2: +area.toFixed(2), budget, candidates: cand.length, trees: trees.length, clearings: clearings.length, mid: items.filter(i => i.cat === 1).length, ground: items.filter(i => i.cat === 2).length };
    if (RM) { stats.bones = items.filter(i => i.prim === 'bones').length; stats.roots = items.filter(i => i.prim === 'roots').length; }
    return { items, stats };
  }

  return { RECIPES, LOOKS, plan, hash, noise };
});
