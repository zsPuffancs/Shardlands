'use strict';
// Vegetation distribution (public/vegetation.js) as baked by the client (public/world.js bakeDecor), headless.
// Meadows (look 0), Gloomwood (look 1), Ashen Barrens (look 2), Frostfang (look 4) and Deadlands (look 6) use the new distribution;
// every other look must be untouched.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const Vegetation = require('../public/vegetation');
const { bake, stats } = require('./helpers/vegetation-sim');
const { fingerprint } = require('../scripts/vegetation-fingerprint');

const MEADOWS = 0, GLOOM = 1, ASHEN = 2, SNOW = 4, DEAD = 6;
// measured with the uniform scatter (commit a57e0bc) by scripts/vegetation-report.js
const BEFORE = { founding: { perKm2: 118.2, nnMean: 46, open150: 0 }, region: { perKm2: 113.5, nnMean: 47, open150: 0 } };
const founding = bake({ kind: 'founding' }), region = bake({ kind: 'region', look: GLOOM }, 1337, 3);

test('only the planned biomes change: approved ones are frozen, every other biome, the farmland and the random stream are identical', () => {
  const now = fingerprint(), base = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/vegetation-baseline.json'), 'utf8'));
  const approved = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/vegetation-approved.json'), 'utf8')); // playtested looks (Meadows, Gloomwood, Ashen Barrens, Frostfang, Deadlands)
  const planned = new Set(Vegetation.LOOKS.map(String));
  for (const [k, v] of Object.entries(base)) {
    const look = k.split(':')[1];
    if (approved[k]) assert.equal(now[k], approved[k], k + ' is approved and must not change');
    else if (planned.has(look) && !k.endsWith('streamAfter')) assert.notEqual(now[k], v, k + ' uses the new distribution');
    else assert.equal(now[k], v, k + ' unchanged');
  }
  assert.deepEqual(Vegetation.LOOKS, [MEADOWS, GLOOM, ASHEN, SNOW, DEAD]);
  // the farmland outside the village is placed exactly as before
  const farm = r => JSON.stringify(r.placed.filter(p => /^(Wheat|Corn)/.test(p.name)).map(p => [p.name, +p.x.toFixed(2), +p.z.toFixed(2)]));
  assert.equal(farm(founding), farm(bake({ kind: 'founding' }, 1337, 0, { vegetation: false })));
});

test('Gloomwood has far fewer big trees than before, never more than its budget', () => {
  for (const [label, run, before] of [['founding', founding, BEFORE.founding], ['wildwood region', region, BEFORE.region]]) {
    const s = stats(run, GLOOM);
    assert.ok(s.perKm2 <= before.perKm2 * 0.5, label + ': ' + s.perKm2 + ' trees/km2 (before ' + before.perKm2 + ')');
    assert.ok(s.perKm2 <= Vegetation.RECIPES[GLOOM].budget + 1, label + ' within the budget');
    assert.ok(s.perKm2 >= 20, label + ' is still a forest: ' + s.perKm2);
    assert.ok(s.trees > 300, label + ' ' + s.trees + ' trees');
  }
});

test('no local wall of trees: even the densest grove is no denser than the old average', () => {
  for (const run of [founding, region]) {
    const T = run.placed.filter(p => p.cat === 0 && run.zoneOf(p.x, p.z) === GLOOM), cells = new Map(), S = 400;
    for (const p of T) { const k = Math.floor(p.x / S) + ',' + Math.floor(p.z / S); cells.set(k, (cells.get(k) || 0) + 1); }
    const worst = Math.max(...cells.values()) / (S * S / 1e6);
    assert.ok(worst <= BEFORE.founding.perKm2 * 1.15, 'densest 400 x 400 window ' + worst.toFixed(0) + ' trees/km2');
  }
});

test('canopy-aware spacing: trunks never closer than their crowns allow; saplings may stand closer than old pines', () => {
  const NAT = require('./helpers/vegetation-sim').natDims(), R = Vegetation.RECIPES[GLOOM];
  for (const run of [founding, region]) {
    const T = run.placed.filter(p => p.cat === 0 && run.zoneOf(p.x, p.z) === GLOOM).map(p => ({ ...p, r: p.size * NAT[p.name].w / NAT[p.name].h / 2 }));
    let closestSmall = 1e9, closestBig = 1e9;
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
      const a = T[i], b = T[j], d = Math.hypot(a.x - b.x, a.z - b.z); if (d > 400) continue;
      assert.ok(d >= Math.max(R.spacing.trunk, R.spacing.canopy * (a.r + b.r)) - 1e-6, 'spacing ' + d.toFixed(1));
      if (a.r < 40 && b.r < 40) closestSmall = Math.min(closestSmall, d); if (a.r > 62 && b.r > 62) closestBig = Math.min(closestBig, d); // by crown, not height
    }
    assert.ok(closestBig > 90, 'wide crowns keep their distance: ' + closestBig.toFixed(0));
    assert.ok(closestSmall < closestBig, 'saplings stand closer (' + closestSmall.toFixed(0) + ') than big trees (' + closestBig.toFixed(0) + ')');
  }
});

test('clearings and sightlines: open ground is spread through the forest, roads and the village approach stay clear', () => {
  for (const [label, run] of [['founding', founding], ['region', region]]) {
    const s = stats(run, GLOOM);
    assert.ok(s.open150 >= 0.08, label + ': ' + Math.round(s.open150 * 100) + '% of the ground has no tree within 150 (before 0%)');
    assert.ok(s.nnMean >= 80, label + ' mean distance to the next tree ' + s.nnMean + ' (before ' + BEFORE.founding.nnMean + ')');
    // spread: room to fight (no trunk within 120, a 240-wide opening) in most 1000 x 1000 blocks of the forest, not in one corner
    const T = run.placed.filter(p => p.cat === 0 && run.zoneOf(p.x, p.z) === GLOOM), blocks = new Map();
    for (let x = 25; x < run.W; x += 50) for (let z = 25; z < run.H; z += 50) {
      if (run.zoneOf(x, z) !== GLOOM || run.onRoad(x, z, 120)) continue;
      const k = Math.floor(x / 1000) + ',' + Math.floor(z / 1000), b = blocks.get(k) || blocks.set(k, { n: 0, open: 0 }).get(k); b.n++;
      if (!T.some(t => Math.abs(t.x - x) < 120 && Math.abs(t.z - z) < 120 && Math.hypot(t.x - x, t.z - z) < 120)) b.open++;
    }
    const full = [...blocks.values()].filter(b => b.n > 200), withOpen = full.filter(b => b.open / b.n > 0.04);
    assert.ok(withOpen.length >= full.length * 0.8, label + ': open ground in ' + withOpen.length + ' of ' + full.length + ' forest blocks');
    // no trunk and no canopy over a road, and a tree-free ring round the village
    for (const t of T) {
      assert.ok(!run.onRoad(t.x, t.z, 54), label + ' trunk on a road');
      assert.ok(Math.hypot(t.x - run.CX, t.z - run.CY) >= run.V + 240, label + ' tree at the village');
    }
  }
});

test('the forest floor: understory near trees, grass in patches, a mix of models, all on free ground', () => {
  for (const run of [founding, region]) {
    const inG = p => run.zoneOf(p.x, p.z) === GLOOM, T = run.placed.filter(p => p.cat === 0 && inG(p)), mid = run.placed.filter(p => p.cat === 1 && inG(p)), ground = run.placed.filter(p => p.cat === 2 && inG(p));
    assert.ok(mid.length > T.length * 0.8 && ground.length > T.length * 2, mid.length + ' mid, ' + ground.length + ' ground');
    assert.ok(new Set(T.map(p => p.name.replace(/_\d+$/, ''))).size >= 4, 'several tree kinds');
    for (const p of [...mid, ...ground]) assert.ok(!run.onRoad(p.x, p.z, 25), 'nothing on the road');
    // patches: grass tufts have close neighbours (clumped), unlike a uniform scatter of the same count
    let clumped = 0; const g = new Map(), K = 60; for (const p of ground) { const k = Math.floor(p.x / K) + ',' + Math.floor(p.z / K); g.set(k, (g.get(k) || 0) + 1); }
    for (const n of g.values()) if (n >= 4) clumped += n; assert.ok(clumped / ground.length > 0.5, 'grass grows in patches: ' + (clumped / ground.length).toFixed(2));
  }
});

test('deterministic and order-free: same seed, same forest; another seed, another forest', () => {
  const again = bake({ kind: 'region', look: GLOOM }, 1337, 3), other = bake({ kind: 'region', look: GLOOM }, 4242, 3);
  const sig = r => JSON.stringify(r.placed.map(p => [p.name, +p.x.toFixed(2), +p.z.toFixed(2), +p.size.toFixed(2)]));
  assert.equal(sig(again), sig(region)); assert.notEqual(sig(other), sig(region));
  // the plan does not depend on the shared random stream or call order
  const NAT = require('./helpers/vegetation-sim').natDims(), opts = { look: GLOOM, seed: 99, W: 3000, H: 3000, CX: 1500, CY: 1500, V: 350, zoneOf: () => GLOOM, onRoad: () => false, dims: n => NAT[n] };
  const a = Vegetation.plan(opts); Math.random(); const b = Vegetation.plan(opts);
  assert.equal(JSON.stringify(a.items), JSON.stringify(b.items));
});

test('bake cost stays small', () => {
  let best = 1e9; for (let i = 0; i < 3; i++) best = Math.min(best, bake({ kind: 'region', look: GLOOM }, 1337, 3).ms);
  assert.ok(best < 400, 'whole-region vegetation bake ' + best.toFixed(0) + ' ms in Node');
});

// ---------- Meadows (look 0, the founding ring round the village) ----------
const SEEDS = [1337, 7, 99, 2024, 31337, 555, 8080, 123456];
const meadowRuns = SEEDS.map(seed => [seed, seed === 1337 ? founding : bake({ kind: 'founding' }, seed)]);
const MEADOWS_BEFORE = { perKm2: 96.9, open150: 0.02 }; // uniform scatter, seed 1337 (102.6 trees/km2 on average over these seeds)

test('Meadows: few large trees, far fewer than before, on every seed', () => {
  const all = meadowRuns.map(([seed, run]) => ({ seed, ...stats(run, MEADOWS) }));
  for (const s of all) {
    assert.ok(s.perKm2 >= 5 && s.perKm2 <= 20, 'seed ' + s.seed + ': ' + s.perKm2 + ' trees/km2');
    assert.ok(s.perKm2 <= MEADOWS_BEFORE.perKm2 * 0.25, 'seed ' + s.seed + ' at most a quarter of before');
    assert.ok(s.perKm2 <= Vegetation.RECIPES[MEADOWS].budget + 1, 'within the budget');
  }
  const avg = all.reduce((a, s) => a + s.perKm2, 0) / all.length; assert.ok(avg >= 9 && avg <= 18, 'average ' + avg.toFixed(1) + ' trees/km2');
});

test('Meadows: large open areas dominate, trees stand alone or in groups of two or three', () => {
  const NAT = require('./helpers/vegetation-sim').natDims();
  for (const [seed, run] of meadowRuns) {
    const s = stats(run, MEADOWS); assert.ok(s.open150 >= 0.35, seed + ': ' + Math.round(s.open150 * 100) + '% of the ground has no tree within 150 (before 1-2%)');
    assert.ok(s.open250 >= 0.12, seed + ': ' + Math.round(s.open250 * 100) + '% has none within 250');
    assert.ok(s.nnMean >= 130, seed + ': mean distance to the next tree ' + s.nnMean);
    const T = run.placed.filter(p => p.cat === 0 && run.zoneOf(p.x, p.z) === MEADOWS);
    for (const t of T) { // no grove: at most 3 trees within 160 of any tree (itself included)
      const near = T.filter(o => Math.hypot(o.x - t.x, o.z - t.z) < 160).length; assert.ok(near <= 3, seed + ': ' + near + ' trees together at ' + t.x.toFixed(0) + ',' + t.z.toFixed(0));
      assert.ok(!run.onRoad(t.x, t.z, 60), seed + ' trunk near a road');
      assert.ok(Math.hypot(t.x - run.CX, t.z - run.CY) >= run.V + 240, seed + ' tree in the village approach');
      assert.ok(!run.onRoad(t.x, t.z, 60 + 0.8 * t.size * NAT[t.name].w / NAT[t.name].h / 2), seed + ' canopy over a road');
    }
  }
});

test('Meadows: grass, flower meadows and bare ground in patches; bushes, rocks and logs here and there, never on roads', () => {
  for (const [seed, run] of meadowRuns) {
    const inM = p => run.zoneOf(p.x, p.z) === MEADOWS && Math.hypot(p.x - run.CX, p.z - run.CY) > run.V + 200;
    const ground = run.placed.filter(p => p.cat === 2 && inM(p) && !/^(Wheat|Corn)/.test(p.name)), mid = run.placed.filter(p => p.cat === 1 && inM(p) && !/^(Wheat|Corn)/.test(p.name));
    for (const p of [...ground, ...mid]) assert.ok(!run.onRoad(p.x, p.z, 25), 'nothing on a road');
    assert.ok(ground.some(p => p.name === 'Flowers') && mid.some(p => /^Bush/.test(p.name)) && mid.some(p => /^Rock_Moss/.test(p.name)) && mid.some(p => /^(WoodLog|TreeStump)/.test(p.name)), seed + ' variety');
    // patchy cover: on a 100-unit grid some cells are bare, some lush
    const cells = new Map(); for (const p of ground) { const k = Math.floor(p.x / 100) + ',' + Math.floor(p.z / 100); cells.set(k, (cells.get(k) || 0) + 1); }
    let n = 0, bare = 0, lush = 0; for (let x = 50; x < run.W; x += 100) for (let z = 50; z < run.H; z += 100) { if (!inM({ x, z }) || run.onRoad(x, z, 60)) continue; n++; const c = cells.get(Math.floor(x / 100) + ',' + Math.floor(z / 100)) || 0; if (!c) bare++; if (c >= 8) lush++; }
    assert.ok(bare / n > 0.2 && lush / n > 0.08, seed + ': ' + Math.round(bare / n * 100) + '% bare, ' + Math.round(lush / n * 100) + '% lush cells');
    // flower meadows: flowers gather (most flowers have another flower within 40)
    const F = ground.filter(p => p.name === 'Flowers'); const grouped = F.filter(f => F.some(o => o !== f && Math.hypot(o.x - f.x, o.z - f.z) < 40)).length;
    assert.ok(grouped / F.length > 0.6, seed + ' flowers grow in patches ' + (grouped / F.length).toFixed(2));
  }
});

test('Meadows: deterministic per seed, different between seeds', () => {
  const sig = r => JSON.stringify(r.placed.filter(p => r.zoneOf(p.x, p.z) === MEADOWS).map(p => [p.name, +p.x.toFixed(2), +p.z.toFixed(2), +p.size.toFixed(2)]));
  assert.equal(sig(bake({ kind: 'founding' }, 7)), sig(meadowRuns[1][1]));
  assert.notEqual(sig(meadowRuns[1][1]), sig(founding));
});

// ---------- Frostfang Peaks / glacier (look 4: the founding ring and the glacier regions) ----------
const SNOW_BEFORE = { perKm2: 117.3, region: 113.5 }; // uniform scatter, seed 1337 (113-123 over these seeds)
const snowRuns = SEEDS.flatMap(seed => [[seed + ' ring', seed === 1337 ? founding : meadowRuns.find(r => r[0] === seed)[1]], [seed + ' region', bake({ kind: 'region', look: SNOW }, seed, 3)]]);
function groups(run, look, link) { // trees joined when closer than link: sizes of the stands
  const T = run.placed.filter(p => p.cat === 0 && run.zoneOf(p.x, p.z) === look), par = T.map((_, i) => i), f = i => par[i] === i ? i : (par[i] = f(par[i])), g = new Map(), K = 200;
  T.forEach((t, i) => { const k = Math.floor(t.x / K) + ',' + Math.floor(t.z / K); (g.get(k) || g.set(k, []).get(k)).push(i); });
  T.forEach((t, i) => { const kx = Math.floor(t.x / K), kz = Math.floor(t.z / K); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of g.get((kx + a) + ',' + (kz + b)) || []) if (j > i && Math.hypot(t.x - T[j].x, t.z - T[j].z) < link) par[f(i)] = f(j); });
  const sz = new Map(); T.forEach((_, i) => sz.set(f(i), (sz.get(f(i)) || 0) + 1)); return { trees: T.length, sizes: [...sz.values()].sort((a, b) => b - a) };
}

test('Frostfang: 30-50 large trees per km2, well under half of before, within the budget, on every seed', () => {
  for (const [label, run] of snowRuns) {
    const s = stats(run, SNOW);
    assert.ok(s.perKm2 >= 30 && s.perKm2 <= Vegetation.RECIPES[SNOW].budget + 1, label + ': ' + s.perKm2 + ' trees/km2');
    assert.ok(s.perKm2 <= SNOW_BEFORE.region * 0.45, label + ' well under half of before');
    assert.ok(s.nnMin >= 24 && s.closeShare <= 0.25, label + ': nearest ' + s.nnMin + ', ' + Math.round(s.closeShare * 100) + '% within 60 (before 73%)');
  }
});

test('Frostfang: stands of every size with snowy openings between them, never one wall of trees', () => {
  for (const [label, run] of snowRuns) {
    const s = stats(run, SNOW), g = groups(run, SNOW, 130);
    assert.ok(s.open150 >= 0.15 && s.open250 >= 0.04, label + ': open ' + Math.round(s.open150 * 100) + '% / ' + Math.round(s.open250 * 100) + '%');
    const single = g.sizes.filter(n => n === 1).length, small = g.sizes.filter(n => n >= 2 && n <= 5).length, pockets = g.sizes.filter(n => n >= 15).length;
    assert.ok(single >= 10 && small >= 8 && pockets >= 4, label + ': ' + single + ' lone trees, ' + small + ' small stands, ' + pockets + ' woodland pockets');
    assert.ok(g.sizes[0] / g.trees <= 0.4, label + ': the biggest stand holds ' + Math.round(g.sizes[0] / g.trees * 100) + '% of the trees');
  }
});

test('Frostfang: snowy bushes, rocks, logs and stumps; snow assets only; roads and the village stay clear', () => {
  for (const [label, run] of snowRuns) {
    const inS = p => run.zoneOf(p.x, p.z) === SNOW && !/^(Wheat|Corn)/.test(p.name) /* farmland: unchanged */, all = run.placed.filter(inS), T = all.filter(p => p.cat === 0), other = all.filter(p => p.cat > 0);
    for (const p of all) assert.ok(/Snow|^Grass_Short$/.test(p.name), label + ' snowy asset: ' + p.name);
    assert.ok(other.some(p => /^Bush_Snow/.test(p.name)) && other.some(p => /^Rock_Snow/.test(p.name)) && other.some(p => /^WoodLog_Snow/.test(p.name)) && other.some(p => /^TreeStump_Snow/.test(p.name)), label + ' variety');
    assert.ok(other.length > T.length && other.length < T.length * 4.5, label + ': ' + other.length + ' smaller pieces for ' + T.length + ' trees');
    for (const t of T) { assert.ok(!run.onRoad(t.x, t.z, 56), label + ' trunk near a road'); assert.ok(Math.hypot(t.x - run.CX, t.z - run.CY) >= run.V + 240, label + ' tree at the village'); }
    for (const p of other) assert.ok(!run.onRoad(p.x, p.z, 25), label + ' on a road');
  }
});

test('Frostfang: deterministic per seed', () => {
  const sig = r => JSON.stringify(r.placed.filter(p => r.zoneOf(p.x, p.z) === SNOW).map(p => [p.name, +p.x.toFixed(2), +p.z.toFixed(2), +p.size.toFixed(2)]));
  assert.equal(sig(bake({ kind: 'region', look: SNOW }, 7, 3)), sig(snowRuns.find(r => r[0] === '7 region')[1]));
  assert.notEqual(sig(snowRuns.find(r => r[0] === '7 region')[1]), sig(snowRuns.find(r => r[0] === '99 region')[1]));
});

// ---------- Ashen Barrens / warfields (look 2: the founding ring and the warfields regions) ----------
const ASHEN_BEFORE = { perKm2: 115.5 }; // uniform scatter, seed 1337 (113-118 over these seeds)
const ashenRuns = SEEDS.flatMap(seed => [[seed + ' ring', seed === 1337 ? founding : meadowRuns.find(r => r[0] === seed)[1]], [seed + ' region', bake({ kind: 'region', look: ASHEN }, seed, 3)]]);
const isFarm = p => /^(Wheat|Corn)/.test(p.name);

test('Ashen Barrens: few, isolated trees (at most three together), a small fraction of before', () => {
  for (const [label, run] of ashenRuns) {
    const s = stats(run, ASHEN);
    assert.ok(s.perKm2 >= 5 && s.perKm2 <= 15, label + ': ' + s.perKm2 + ' trees/km2');
    assert.ok(s.perKm2 <= ASHEN_BEFORE.perKm2 * 0.15, label + ' under 15% of before');
    const T = run.placed.filter(p => p.cat === 0 && run.zoneOf(p.x, p.z) === ASHEN);
    for (const t of T) {
      assert.ok(T.filter(o => Math.hypot(o.x - t.x, o.z - t.z) < 160).length <= 3, label + ': a group of more than three trees');
      assert.ok(!run.onRoad(t.x, t.z, 58), label + ' trunk near a road'); assert.ok(Math.hypot(t.x - run.CX, t.z - run.CY) >= run.V + 240, label + ' tree at the village');
    }
    assert.ok(new Set(T.map(p => p.name.replace(/_\d+$/, ''))).size >= 4, label + ' twisted, dead and hardy kinds');
  }
});

test('Ashen Barrens: exposed ground dominates; rocks are most of the detail, gathered in formations of every size', () => {
  for (const [label, run] of ashenRuns) {
    const s = stats(run, ASHEN); assert.ok(s.open150 >= 0.3 && s.open250 >= 0.15, label + ': open ' + Math.round(s.open150 * 100) + '% / ' + Math.round(s.open250 * 100) + '%');
    const inA = p => run.zoneOf(p.x, p.z) === ASHEN && !isFarm(p), mid = run.placed.filter(p => p.cat === 1 && inA(p)), rocks = mid.filter(p => /^Rock_/.test(p.name));
    assert.ok(rocks.length > (mid.length - rocks.length) * 1.5, label + ': ' + rocks.length + ' rocks among ' + mid.length + ' mid pieces');
    assert.ok(rocks.filter(p => p.size >= 60).length >= 15 && rocks.filter(p => p.size < 25).length > rocks.length * 0.4, label + ': large cores and small stones');
    const clustered = rocks.filter(r => rocks.some(o => o !== r && Math.abs(o.x - r.x) < 70 && Math.hypot(o.x - r.x, o.z - r.z) < 70)).length;
    assert.ok(clustered / rocks.length >= 0.75, label + ': ' + Math.round(clustered / rocks.length * 100) + '% of the rocks stand in a formation');
    // not a field of rocks: on a 100-unit grid most cells hold no rock at all
    const cells = new Set(rocks.map(r => Math.floor(r.x / 100) + ',' + Math.floor(r.z / 100))); let n = 0, w = 0;
    for (let x = 50; x < run.W; x += 100) for (let z = 50; z < run.H; z += 100) { if (run.zoneOf(x, z) !== ASHEN) continue; n++; if (cells.has(Math.floor(x / 100) + ',' + Math.floor(z / 100))) w++; }
    assert.ok(w / n >= 0.08 && w / n <= 0.4, label + ': rocks in ' + Math.round(w / n * 100) + '% of the ground cells');
  }
});

test('Ashen Barrens: dry scrub, logs and stumps in sparse pockets; nothing on roads; deterministic', () => {
  for (const [label, run] of ashenRuns) {
    const inA = p => run.zoneOf(p.x, p.z) === ASHEN && !isFarm(p), other = run.placed.filter(p => p.cat > 0 && inA(p)), ground = other.filter(p => p.cat === 2);
    assert.ok(other.some(p => /^Bush/.test(p.name)) && other.some(p => /^WoodLog/.test(p.name)) && other.some(p => /^TreeStump/.test(p.name)) && ground.some(p => p.name === 'Grass_Short'), label + ' variety');
    assert.ok(ground.length < 2600, label + ': ' + ground.length + ' ground pieces (before: 4400-8700)');
    for (const p of other) assert.ok(!run.onRoad(p.x, p.z, 25), label + ' on a road');
  }
  const sig = r => JSON.stringify(r.placed.filter(p => r.zoneOf(p.x, p.z) === ASHEN).map(p => [p.name, +p.x.toFixed(2), +p.z.toFixed(2), +p.size.toFixed(2)]));
  assert.equal(sig(bake({ kind: 'region', look: ASHEN }, 7, 3)), sig(ashenRuns.find(r => r[0] === '7 region')[1]));
  assert.notEqual(sig(ashenRuns.find(r => r[0] === '7 region')[1]), sig(ashenRuns.find(r => r[0] === '99 region')[1]));
});

// ---------- Deadlands / Death Zone (look 6) ----------
const DEAD_BEFORE = { perKm2: 77, mid: 2400 }; // uniform scatter: 74-80 trees/km2, ~2100-2450 dark rocks, no ground cover
const NAT = require('./helpers/vegetation-sim').natDims();
// the plan itself (with the primitive remains: bones and roots, which world.js bakes from engine primitives)
const deadPlan = run => Vegetation.plan({ look: DEAD, seed: run.planSeed, W: run.W, H: run.H, CX: run.CX, CY: run.CY, V: run.V, zoneOf: run.zoneOf, onRoad: run.onRoad, dims: n => NAT[n] && { h: NAT[n].h, w: NAT[n].w } });
const deadRuns = SEEDS.flatMap(seed => [[seed + ' ring', Object.assign(ashenRuns.find(r => r[0] === seed + ' ring')[1], { planSeed: seed })],
  [seed + ' region', Object.assign(bake({ kind: 'region', look: DEAD }, seed, 3), { planSeed: seed + 3 * 7919 })]]);
const inDead = run => p => run.zoneOf(p.x, p.z) === DEAD && !isFarm(p);

test('Deadlands: 18-36 dead trees per km2 (well under half of before), dead and twisted kinds only, roads and village clear', () => {
  for (const [label, run] of deadRuns) {
    const s = stats(run, DEAD);
    assert.ok(s.perKm2 >= 18 && s.perKm2 <= 36, label + ': ' + s.perKm2 + ' trees/km2');
    assert.ok(s.perKm2 <= DEAD_BEFORE.perKm2 * 0.5, label + ' under half of before');
    const T = run.placed.filter(p => p.cat === 0 && inDead(run)(p));
    for (const t of T) {
      assert.match(t.name, /Dead/, label + ': living tree ' + t.name);
      assert.ok(!run.onRoad(t.x, t.z, 56), label + ' trunk near a road'); assert.ok(Math.hypot(t.x - run.CX, t.z - run.CY) >= run.V + 240, label + ' tree at the village');
    }
    assert.ok(new Set(T.map(p => p.name.replace(/_\d+$/, ''))).size >= 4, label + ' a mix of dead kinds');
  }
});

test('Deadlands: lifeless barrens and open ground; lone trees and knots of trees side by side; not one composition', () => {
  for (const [label, run] of deadRuns) {
    const s = stats(run, DEAD); assert.ok(s.open150 >= 0.35 && s.open250 >= 0.2, label + ': open ' + Math.round(s.open150 * 100) + '% / ' + Math.round(s.open250 * 100) + '%');
    // barren: ground points with nothing at all (tree, log, bush, grass, bones) within 90 units
    const items = deadPlan(run).items, g = new Map(), K = 100; for (const i of items) { const k = Math.floor(i.x / K) + ',' + Math.floor(i.z / K); (g.get(k) || g.set(k, []).get(k)).push(i); }
    const near = (x, z) => { const kx = Math.floor(x / K), kz = Math.floor(z / K); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of g.get((kx + a) + ',' + (kz + b)) || []) if (Math.hypot(q.x - x, q.z - z) < 90) return true; return false; };
    let n = 0, barren = 0; for (let x = 25; x < run.W; x += 50) for (let z = 25; z < run.H; z += 50) { if (run.zoneOf(x, z) !== DEAD || run.onRoad(x, z, 46)) continue; n++; if (!near(x, z)) barren++; }
    assert.ok(barren / n >= 0.25 && barren / n <= 0.7, label + ': ' + Math.round(barren / n * 100) + '% lifeless ground');
    // trees: some stand alone, some in knots and stands (linked within 130 units)
    const T = run.placed.filter(p => p.cat === 0 && inDead(run)(p)), par = T.map((_, i) => i), f = i => par[i] === i ? i : (par[i] = f(par[i]));
    T.forEach((t, i) => T.forEach((o, j) => { if (j > i && Math.abs(o.x - t.x) < 130 && Math.hypot(o.x - t.x, o.z - t.z) < 130) par[f(i)] = f(j); }));
    const size = new Map(); T.forEach((_, i) => size.set(f(i), (size.get(f(i)) || 0) + 1)); const groups = [...size.values()];
    assert.ok(groups.filter(x => x === 1).length >= 20 && groups.filter(x => x >= 3 && x <= 8).length >= 5 && groups.some(x => x >= 15), label + ': lone trees, knots and stands');
    // 600-unit cells: dead woodland in some, nothing at all in others
    const per = new Map(); for (const t of T) { const k = Math.floor(t.x / 600) + ',' + Math.floor(t.z / 600); per.set(k, (per.get(k) || 0) + 1); }
    let empty = 0, dense = 0, cells = 0; for (let x = 300; x < run.W; x += 600) for (let z = 300; z < run.H; z += 600) { if (run.zoneOf(x, z) !== DEAD) continue; cells++; const c = per.get(Math.floor(x / 600) + ',' + Math.floor(z / 600)) || 0; if (c === 0) empty++; if (c >= 20) dense++; }
    assert.ok(empty >= 1 && dense >= 1, label + ': ' + empty + ' empty and ' + dense + ' wooded cells of ' + cells);
  }
});

test('Deadlands: fallen trunks, broken branches, stumps, dead scrub and dead grass; bones and dead roots; fewer pieces than before', () => {
  for (const [label, run] of deadRuns) {
    const other = run.placed.filter(p => p.cat > 0 && inDead(run)(p)), mid = other.filter(p => p.cat === 1), logs = other.filter(p => p.name === 'WoodLog');
    assert.ok(logs.some(p => p.size >= 40) && logs.some(p => p.size < 25) && other.some(p => p.name === 'TreeStump') && other.some(p => /^Bush/.test(p.name)) && other.some(p => p.name === 'Grass_Short'), label + ' variety');
    assert.ok(mid.length < DEAD_BEFORE.mid * 0.8, label + ': ' + mid.length + ' mid pieces');
    // fallen timber lies in heaps: a good share of the trunks has another trunk or branch close by
    const heaped = logs.filter(l => logs.some(o => o !== l && Math.hypot(o.x - l.x, o.z - l.z) < 80)).length;
    assert.ok(heaped / logs.length >= 0.5, label + ': ' + Math.round(heaped / logs.length * 100) + '% of the timber in heaps');
    for (const p of other) assert.ok(!run.onRoad(p.x, p.z, 25), label + ' on a road');
    const rem = deadPlan(run).items.filter(i => i.prim), bones = rem.filter(i => i.prim === 'bones'), roots = rem.filter(i => i.prim === 'roots');
    assert.ok(bones.length >= 30 && roots.length >= 8, label + ': ' + bones.length + ' bone piles, ' + roots.length + ' roots');
    // bones gather: most piles have another within 120 units
    assert.ok(bones.filter(b => bones.some(o => o !== b && Math.hypot(o.x - b.x, o.z - b.z) < 120)).length >= bones.length * 0.5, label + ' bones in concentrations');
    for (const r of rem) { assert.ok(run.zoneOf(r.x, r.z) === DEAD && !run.onRoad(r.x, r.z, 44) && Math.hypot(r.x - run.CX, r.z - run.CY) >= run.V + 60, label + ' remains on free ground'); assert.ok(r.v >= 0 && r.v < 1 && r.size > 0); }
    for (const p of other) assert.ok(NAT[p.name], label + ' unknown asset ' + p.name);
  }
});

test('Deadlands: deterministic per seed (trees, pieces and remains), different between seeds', () => {
  const sig = r => JSON.stringify(r.placed.filter(p => r.zoneOf(p.x, p.z) === DEAD).map(p => [p.name, +p.x.toFixed(2), +p.z.toFixed(2), +p.size.toFixed(2)]));
  const a = deadRuns.find(r => r[0] === '7 region')[1], b = Object.assign(bake({ kind: 'region', look: DEAD }, 7, 3), { planSeed: 7 + 3 * 7919 });
  assert.equal(sig(b), sig(a)); assert.equal(JSON.stringify(deadPlan(b)), JSON.stringify(deadPlan(a)));
  assert.notEqual(sig(a), sig(deadRuns.find(r => r[0] === '99 region')[1]));
  // Deadlands is playtested and approved: its bones and roots are frozen too (the trees and pieces by the fingerprints)
  const approved = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/vegetation-approved.json'), 'utf8'));
  const rh = run => require('node:crypto').createHash('md5').update(JSON.stringify(deadPlan(run).items.filter(i => i.prim).map(i => [i.prim, +i.x.toFixed(2), +i.z.toFixed(2), +i.size.toFixed(2), +i.yaw.toFixed(3), +i.v.toFixed(4)]))).digest('hex');
  assert.equal(rh(deadRuns.find(r => r[0] === '1337 ring')[1]), approved['remains:founding:6'], 'Deadlands remains are approved and must not change');
  assert.equal(rh(deadRuns.find(r => r[0] === '1337 region')[1]), approved['remains:region:6'], 'Deadlands remains are approved and must not change');
});
