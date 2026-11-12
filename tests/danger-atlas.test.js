'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { createUniverse, createRegionDescriptor, generationSnapshot, generateRegion } = require('../universe');
const { buildRegionPlan, regionGeometry } = require('../region-blueprint');
const { createDangerSpec, materializeDanger, dangerAt, PROFILES, placementAllowed, validateRoutes, buildRoutes, sampleHeatmap } = require('../danger-geography');
const { validateSpawnPlan, generateSpawnPlan, stream } = require('../world-generation');
const { createAtlas, localRequest } = require('../world-atlas');
const { createWebServer } = require('../web-server');
const { attachUniverse } = require('../game-world');
const noop = () => {};
function world(seed = 'danger-test', version = 2) { return createUniverse({ store: { data: {}, save: async () => {} }, config: { worldSeed: seed, generatorVersion: version }, broadcast: noop, messageText: () => '', isAdmin: () => false }); }
function region(seed, tier = 8, biome) {
  const universe = world(seed), record = universe.regionFor(tier);
  if (biome) { record.biome = biome; record.dangerSpec = createDangerSpec({ seed, tier, biome }); }
  return { universe, record, plan: buildRegionPlan(universe.state, record) };
}

test('danger descriptors and authoritative plans reproduce exactly without unseeded randomness', () => {
  const original = Math.random; Math.random = () => { throw new Error('Unseeded generation'); };
  try {
    const a = region('deterministic-danger'), b = region('deterministic-danger');
    assert.deepEqual(a.plan, b.plan); assert.deepEqual(a.plan, JSON.parse(JSON.stringify(a.plan)));
    assert.notDeepEqual(a.record.dangerSpec, region('another-seed').record.dangerSpec);
  } finally { Math.random = original; }
});

test('v1 and existing v2 descriptors/plans remain unchanged across restart and mutable history', () => {
  for (const version of [1, 2]) {
    const original = world('compatibility-' + version, version), state = original.state;
    state.worldTier = 8; state.regions[8] = generateRegion(state.seed, 8, {}, version);
    if (version === 2) state.regions[8].spawnPlan = buildRegionPlan(state, state.regions[8]);
    const before = JSON.stringify(state.regions[8]);
    const reloaded = createUniverse({ store: { data: state, save: async () => {} }, config: {}, broadcast: noop, messageText: noop, isAdmin: () => false });
    assert.equal(JSON.stringify(reloaded.regionFor(8)), before); assert.equal(reloaded.regionFor(8).dangerSpec, undefined);
    assert.equal(Boolean(reloaded.regionFor(9).dangerSpec), version === 2);
  }
  const current = region('immutable-danger'); const before = JSON.stringify(current.record);
  current.universe.state.stats.elements.fire = 1000; current.universe.state.history.push({});
  assert.equal(JSON.stringify(current.universe.regionFor(8)), before);
});

test('v2 history snapshots have constant size and do not enumerate the growing boss ledger', () => {
  const universe = world('bounded-snapshot');
  universe.state.stats.bossKills = new Proxy({}, { ownKeys() { throw new Error('Unbounded ledger copy'); } });
  const snapshot = generationSnapshot(universe.state);
  assert.equal(Object.keys(snapshot.elements).length, 6); assert.equal(snapshot.bossKills, undefined);
  assert.ok(createRegionDescriptor(universe.state, Number.MAX_SAFE_INTEGER, snapshot).dangerSpec);
});

test('all biome fields have coherent, bounded and nonuniform danger with protected safe entry', () => {
  for (const biome of Object.keys(PROFILES)) {
    const { plan } = region('profile-' + biome, 8, biome), field = plan.danger;
    const random = stream(biome, 8, 1, 'continuity-test'), values = [];
    for (let i = 0; i < 1000; i++) {
      const x = random.float(0, 5000), y = random.float(0, 5000), score = dangerAt(field, x, y); values.push(score);
      assert.ok(score >= 0 && score <= 1, biome); assert.ok(Math.abs(score - dangerAt(field, x + .1, y + .1)) < .01, biome + ' continuity');
    }
    assert.ok(Math.max(...values) - Math.min(...values) > .45, biome + ' variation');
    assert.equal(field.profile, biome); assert.equal(field.parameters.baseline, PROFILES[biome].baseline);
    for (let angle = 0; angle < Math.PI * 2; angle += .1) assert.ok(dangerAt(field, 2500 + Math.cos(angle) * 399, 2500 + Math.sin(angle) * 399) <= .100001, biome + ' safe entry');
    assert.deepEqual(validateSpawnPlan(plan).errors, [], biome);
    assert.equal(sampleHeatmap(field, 1000000).values.length, 128 * 128);
  }
  assert.notDeepEqual(PROFILES.volcanic, PROFILES.wildwood);
});

test('encounters respect danger roles, protected locations and safe corridor footprints', () => {
  const { plan } = region('encounter-danger');
  for (const encounter of plan.encounters) {
    if (encounter.kind !== 'boss') assert.ok(placementAllowed(plan.danger, encounter.kind, encounter), encounter.id);
    for (const area of plan.protectedAreas) assert.ok(Math.hypot(encounter.x - area.x, encounter.y - area.y) >= area.radius + encounter.radius);
  }
  assert.ok(plan.encounters.some(e => e.kind === 'alpha'));
  assert.ok(plan.spawns.length <= 260 + 32 + 8 + 1);
  assert.ok(plan.paths.some(path => path.kind === 'safe' && path.points.length > 3));
  assert.ok(plan.paths.some(path => path.kind === 'risky'));
  const safe = plan.paths.find(path => path.to === 'boss:0' && path.kind === 'safe'), risky = plan.paths.find(path => path.to === 'boss:0' && path.kind === 'risky');
  assert.ok(safe.maxDanger < .85); assert.ok(risky.length <= safe.length);
  assert.deepEqual(validateRoutes(plan).errors, []);
});

test('mandatory routes repair deterministic extreme barriers and reject physically impossible objectives', () => {
  const spec = createDangerSpec({ seed: 'barrier', tier: 8, biome: 'volcanic' });
  spec.parameters.baseline = 1; spec.parameters.noise = 0; spec.threats = []; spec.respites = [];
  const boundary = { width: 5000, height: 5000, cx: 2500, cy: 2500, margin: 30, min: 400, shape: 'square' };
  const template = { boundary, settlement: { id: 'settlement', x: 2500, y: 2500 }, encounters: [{ id: 'boss:0', kind: 'boss', x: 4400, y: 800, radius: 180 }], paths: [], danger: materializeDanger(spec, boundary, [{ x: 2500, y: 2500, radius: 400 }]) };
  assert.equal(validateRoutes(template).valid, false);
  const a = structuredClone(template), b = structuredClone(template); buildRoutes(a); buildRoutes(b); assert.deepEqual(a, b);
  assert.ok(a.routeRepairs.length); assert.deepEqual(validateRoutes(a).errors, []);
  const broken = structuredClone(a); broken.paths.find(path => path.to === 'boss:0' && path.kind === 'safe').points[1] = { x: -100, y: 2500 }; assert.equal(validateRoutes(broken).valid, false);
  const impossible = structuredClone(template); impossible.encounters[0].x = -200; assert.throws(() => buildRoutes(impossible), /cannot be repaired/);
});

test('stress: many seeds, all biomes, bounded budgets and high tiers retain reachable mandatory objectives', t => {
  const times = [], biomes = Object.keys(PROFILES);
  for (let i = 0; i < 120; i++) {
    const seed = 'danger-stress-' + i, tier = [8, 80, 65542, 1000000, Number.MAX_SAFE_INTEGER][i % 5];
    const universe = world(seed), record = createRegionDescriptor(universe.state, tier, generationSnapshot(universe.state));
    record.biome = biomes[i % biomes.length]; record.dangerSpec = createDangerSpec({ seed, tier, biome: record.biome });
    universe.state.generationSettings.budgets = i % 10 === 0 ? { monsters: 800, stones: 40, alphas: 16 } : i % 10 === 1 ? { monsters: 0, stones: 0, alphas: 0 } : {};
    const start = performance.now(); let plan;
    try {
      if (i % 10 === 1) {
        assert.throws(() => buildRegionPlan(universe.state, record), error => error.code === 'INVALID_PROGRESSION' && error.diagnostics.errors.includes('missing-normal-population'));
        continue;
      }
      plan = buildRegionPlan(universe.state, record); assert.equal(validateSpawnPlan(plan).valid, true); assert.equal(validateRoutes(plan).valid, true);
    }
    catch (error) { throw new Error('Reproducible failure seed=' + seed + ' tier=' + tier + ' biome=' + record.biome, { cause: error }); }
    times.push(performance.now() - start);
    const counts = validateSpawnPlan(plan).counts; for (const key of Object.keys(counts)) assert.ok(counts[key] <= plan.budgets[key], seed + ' ' + key);
  }
  times.sort((a, b) => a - b); t.diagnostic(JSON.stringify({ seeds: times.length, meanMs: times.reduce((sum, value) => sum + value, 0) / times.length, p95Ms: times[Math.floor(times.length * .95)], maxMs: times.at(-1) }));
});

test('Atlas previews freeze history/config and never mutate universe data or materialize saved plans', () => {
  const universe = world('atlas-dry-run'); universe.state.worldTier = 8; universe.regionFor(8);
  universe.regionFor = () => { throw Error('Atlas must not call mutating regionFor'); };
  const atlas = createAtlas({ universe }), before = JSON.stringify(universe.state);
  const saved = atlas.inspect({ tier: 8 }); assert.equal(saved.status, 'persisted-region-unmaterialized-plan'); assert.ok(saved.plan.danger);
  const preview = atlas.inspect({ tier: 10, preview: true }); assert.equal(preview.status, 'hypothetical-preview');
  assert.equal(JSON.stringify(universe.state), before); assert.equal(universe.state.regions[10], undefined);
  const expected = structuredClone(preview); universe.state.stats.elements.fire = 999; universe.state.history.push({});
  for (let tier = 11; tier < 22; tier++) atlas.inspect({ tier, preview: true });
  assert.equal(atlas.cacheSize(), 8); assert.deepEqual(atlas.inspect({ tier: 10, preview: true }), expected);
  assert.throws(() => atlas.inspect({ tier: 0, preview: true }), RangeError); assert.throws(() => atlas.inspect({ tier: 65543, preview: true }), RangeError); assert.throws(() => atlas.inspect({ tier: 20 }), /not persisted/);
});

test('Atlas reads saved encounter positions and reports corrupted spacing without rewriting data', () => {
  const { universe, record, plan } = region('saved-plan'); universe.state.worldTier = 8; record.spawnPlan = plan;
  plan.encounters[1].x = plan.encounters[0].x; plan.encounters[1].y = plan.encounters[0].y;
  const before = JSON.stringify(universe.state), result = createAtlas({ universe }).inspect({ tier: 8 });
  assert.equal(result.status, 'persisted-plan'); assert.equal(result.validation.valid, false); assert.ok(result.validation.errors.some(error => error.startsWith('spacing:'))); assert.equal(JSON.stringify(universe.state), before);
});

test('consecutive Atlas dry-run tiers continue the previous preview maximum without persistence', () => {
  const universe = world('atlas-level-chain');
  const atlas = createAtlas({ universe }), before = JSON.stringify(universe.state);
  for (const seed of [universe.state.seed, 'alternative-level-chain']) {
    const current = atlas.inspect({ tier: 100, preview: true, seed });
    const next = atlas.inspect({ tier: 101, preview: true, seed });
    assert.equal(next.descriptor.levels[0], current.descriptor.levels[1]);
  }
  assert.equal(JSON.stringify(universe.state), before);
});

test('Atlas access policy rejects remote, proxy, hostile Host and cross-origin requests', () => {
  const request = (remoteAddress, headers = {}) => ({ socket: { remoteAddress }, headers: { host: 'localhost:3000', ...headers } });
  assert.equal(localRequest(request('127.0.0.1')), true); assert.equal(localRequest(request('::1', { host: '[::1]:3000' })), true);
  for (const candidate of [request('192.168.1.2'), request('127.0.0.1', { 'x-forwarded-for': '1.2.3.4' }), request('127.0.0.1', { host: 'evil.example' }), request('127.0.0.1', { origin: 'http://evil.example' }), request('127.0.0.1', { 'sec-fetch-site': 'cross-site' })]) assert.equal(localRequest(candidate), false);
});

test('real HTTP Atlas endpoints serve local UI, exact probes and reports; public API hides seed and diagnostics', async t => {
  const universe = world('private-raw-seed'); universe.state.worldTier = 8; const record = universe.regionFor(8); record.spawnPlan = buildRegionPlan(universe.state, record);
  attachUniverse(universe.identity);
  const atlas = createAtlas({ universe });
  const { server, transport } = createWebServer({ publicDirectory: require('node:path').join(__dirname, '..', 'public'), config: { serverName: 'Atlas test' }, players: new Map(), clientScripts: () => [], handleMessage: noop, onLeave: noop, atlas });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { transport.close(); await new Promise(resolve => server.close(resolve)); attachUniverse(() => null); });
  const base = 'http://127.0.0.1:' + server.address().port, before = JSON.stringify(universe.state);
  const get = (url, options) => fetch(base + url, options);
  const html = await get('/dev/atlas'); assert.equal(html.status, 200); assert.ok((await html.text()).includes('World Atlas')); assert.ok(html.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  for (const asset of ['atlas.js', 'atlas.css']) assert.equal((await get('/dev/atlas/' + asset)).status, 200);
  const list = await (await get('/dev/atlas/api/regions')).json(); assert.equal(list.regions.length, 8); assert.equal(list.seed, universe.state.seed);
  const preview = await (await get('/dev/atlas/api/region?tier=50000&mode=preview&seed=chosen-atlas-seed')).json(); assert.equal(preview.status, 'hypothetical-preview'); assert.equal(preview.seed, 'chosen-atlas-seed'); assert.equal(preview.validation.valid, true);
  const probe = await (await get('/dev/atlas/api/probe?tier=8&x=2500&y=2500')).json(); assert.ok(probe.score <= .1); assert.equal(probe.score, dangerAt(record.spawnPlan.danger, 2500, 2500)); assert.equal(probe.category, 'SAFE');
  const report = await get('/dev/atlas/api/report?tier=8'); assert.ok(report.headers.get('content-disposition').includes('attachment'));
  const exported = await report.json(); assert.equal(exported.validation.valid, true); assert.equal(exported.progression.valid, true); assert.equal(exported.progression.version, 1); assert.equal(exported.progression.gapCount, 0);
  assert.equal(preview.progression.version, 1); assert.equal(preview.progression.entry.accessible, true);
  for (const url of ['/dev/atlas/api/region?tier=NaN', '/dev/atlas/api/region?tier=9', '/dev/atlas/api/probe?tier=8&x=-1&y=1', '/dev/atlas/api/probe?tier=8']) assert.equal((await get(url)).status, 400, url);
  for (const headers of [{ 'X-Forwarded-For': '8.8.8.8' }, { Host: 'evil.example' }, { Origin: 'https://evil.example' }]) {
    // Node fetch normalizes Host; use an actual HTTP request to test rebinding protection.
    const response = await new Promise((resolve, reject) => { require('node:http').get(base + '/dev/atlas/api/region?tier=8', { headers }, incoming => { let body = ''; incoming.on('data', chunk => { body += chunk; }); incoming.on('end', () => resolve({ status: incoming.statusCode, body })); }).on('error', reject); });
    assert.equal(response.status, 403, JSON.stringify(headers)); assert.ok(!response.body.includes(universe.state.seed));
  }
  assert.equal((await get('/dev/atlas/api/region?tier=8', { method: 'POST' })).status, 405);
  const publicInfo = JSON.stringify(await (await get('/api/info')).json()), summary = JSON.stringify(universe.summary());
  for (const output of [publicInfo, summary]) for (const secret of [universe.state.seed, 'dangerSpec', 'noiseSize', 'protectedAreas', 'spawnPlan', 'routeRepairs', 'normalBands', 'entryEligible']) assert.ok(!output.includes(secret), secret);
  assert.equal(JSON.stringify(universe.state), before);
});
