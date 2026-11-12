'use strict';
// Vegetation distribution (public/vegetation.js) as baked by the client (public/world.js bakeDecor), headless.
// Meadows (look 0) and Gloomwood (look 1) use the new distribution; every other look must be untouched.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const Vegetation = require('../public/vegetation');
const { bake, stats } = require('./helpers/vegetation-sim');
const { fingerprint } = require('../scripts/vegetation-fingerprint');

const MEADOWS = 0, GLOOM = 1;
// measured with the uniform scatter (commit a57e0bc) by scripts/vegetation-report.js
const BEFORE = { founding: { perKm2: 118.2, nnMean: 46, open150: 0 }, region: { perKm2: 113.5, nnMean: 47, open150: 0 } };
const founding = bake({ kind: 'founding' }), region = bake({ kind: 'region', look: GLOOM }, 1337, 3);

test('only the planned biomes change: approved ones are frozen, every other biome, the farmland and the random stream are identical', () => {
  const now = fingerprint(), base = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/vegetation-baseline.json'), 'utf8'));
  const approved = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/vegetation-approved.json'), 'utf8')); // playtested looks (Gloomwood)
  const planned = new Set(Vegetation.LOOKS.map(String));
  for (const [k, v] of Object.entries(base)) {
    const look = k.split(':')[1];
    if (approved[k]) assert.equal(now[k], approved[k], k + ' is approved and must not change');
    else if (planned.has(look) && !k.endsWith('streamAfter')) assert.notEqual(now[k], v, k + ' uses the new distribution');
    else assert.equal(now[k], v, k + ' unchanged');
  }
  assert.deepEqual(Vegetation.LOOKS, [MEADOWS, GLOOM]);
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
