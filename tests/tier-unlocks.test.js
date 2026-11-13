'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createUniverse, createRegionDescriptor, generationSnapshot } = require('../src/world/universe');
const { regionPlanInputs, buildRegionPlan } = require('../src/world/region-blueprint');
const { generateSpawnPlan, validateSpawnPlan } = require('../src/world/world-generation');
const { generateRegionAttempt, generateValidRegionPlan, validatePreparedPlan } = require('../src/world/region-plan-retries');
const { createRegions } = require('../src/world/regions');
const { maps } = require('../src/world/game-world');
const { MOBTYPES, TIERS } = require('../src/combat/monsters');
const { openJsonStore, coordinateSaves, recoverSaveGroup } = require('../src/server/persistence');
const noop = () => {};
function world(options = {}) {
  const snapshots = [], packets = [], store = options.store || { data: {}, save: async () => { snapshots.push(structuredClone(store.data)); } };
  const u = createUniverse({ store, config: { worldSeed: 'tier-retry-0', ...options.config }, broadcast: m => packets.push(m), messageText: key => key, isAdmin: () => false, ...options.extra });
  return { u, store, snapshots, packets };
}
function inputs(seed = 'tier-retry-0', settings = {}) {
  const f = world({ config: { worldSeed: seed, worldGeneration: settings } });
  const record = createRegionDescriptor(f.u.state, 8, generationSnapshot(f.u.state));
  return regionPlanInputs(f.u.state, record);
}
function killCurrent(u) {
  u.state.worldTier = 7;
  u.hooks.kill({ name: 'Hero' }, { id: 77, ty: u.regionFor(7).worldBoss.type, tier: 6, lvl: 60, dead: 90000 });
}
function watch(t, f) { t.after(() => f.u.suspendUnlocks()); return f; }

test('attempt zero preserves the original plan and boss-first reservation; explicit alternatives reproduce', t => {
  const originalRandom = Math.random; Math.random = () => { throw Error('unseeded generation'); }; t.after(() => { Math.random = originalRandom; });
  const source = inputs(); const original = generateSpawnPlan(source);
  assert.deepEqual(generateSpawnPlan({ ...source, generationAttempt: 0 }), original);
  assert.equal(original.encounters[0].kind, 'boss');
  const alternate = generateSpawnPlan({ ...source, generationAttempt: 1 });
  assert.deepEqual(alternate, generateSpawnPlan({ ...source, generationAttempt: 1 })); assert.notDeepEqual(alternate.spawns, original.spawns);
  assert.equal(alternate.encounters[0].kind, 'boss'); assert.equal(validateSpawnPlan(alternate).valid, true);
});
test('real spacing regression: first candidate has XP gaps, second validates and regenerates exactly', () => {
  const source = inputs('tier-retry-5', { spacing: { camp: 700, stone: 700, alpha: 700, boss: 700 } });
  const result = generateValidRegionPlan(source, { maxAttempts: 2 });
  assert.equal(result.ok, true); assert.equal(result.generationAttempt, 1); assert.ok(result.diagnostics[0].errors.includes('xp-coverage-gaps'));
  assert.deepEqual(result.plan, generateRegionAttempt(source, result.generationAttempt).plan);
});
test('exhausted and impossible populations return bounded structured failures without changing inputs', () => {
  const source = inputs('impossible', { budgets: { monsters: 0, stones: 0 } }), before = JSON.stringify(source);
  const result = generateValidRegionPlan(source, { maxAttempts: 3 });
  assert.equal(result.ok, false); assert.equal(result.diagnostics.length, 3); assert.equal(result.nextAttempt, 3); assert.equal(JSON.stringify(source), before);
  assert.ok(result.diagnostics.every(d => d.errors.includes('missing-normal-population')));
  assert.equal(generateValidRegionPlan(source, { maxAttempts: 100000 }).diagnostics.length, 20);
});
test('missing/unreachable required World Boss and missing progression policies are rejected', () => {
  const source = inputs(), valid = generateSpawnPlan(source);
  const missing = structuredClone(valid); missing.requiredLocations = []; missing.spawns = missing.spawns.filter(s => s.kind !== 'boss');
  assert.ok(validatePreparedPlan(missing, source).errors.includes('missing-required-world-boss'));
  const unreachable = structuredClone(valid); unreachable.paths = [];
  assert.equal(validatePreparedPlan(unreachable, source).valid, false);
  const noPolicy = structuredClone(valid); delete noPolicy.progression;
  assert.ok(validatePreparedPlan(noPolicy, source).errors.includes('missing-progression-policy'));
});
test('a valid first attempt is persisted before tier/map/notifications, with no eager live monsters', async t => {
  const f = watch(t, world()); let activations = 0;
  f.u.onTierUnlocked = tier => {
    activations++; assert.equal(tier, 8);
    assert.ok(f.snapshots.some(s => s.worldTier === 7 && s.pendingUnlock?.status === 'ready' && s.pendingUnlock.region.spawnPlan));
    assert.ok(f.snapshots.some(s => s.worldTier === 8 && s.regions[8].spawnPlan && s.pendingUnlock?.status === 'committing'));
    assert.equal(f.u.identity().tier, 7);
  };
  killCurrent(f.u); assert.equal(f.u.state.worldTier, 7); assert.equal(f.u.state.regions[8], undefined);
  const result = await f.u.resumePendingUnlock(); assert.equal(result.ok, true);
  assert.equal(f.u.state.worldTier, 8); assert.equal(f.u.identity().tier, 8); assert.equal(f.u.state.regions[8].generationAttempt, 0); assert.equal(activations, 1);
  assert.equal(f.u.state.pendingUnlock, undefined); assert.equal(f.u.state.history.filter(e => e.type === 'worldBoss').length, 1);
  assert.ok(f.packets.some(m => m.t === 'chat' && m.m === 'history.worldBoss'));
  const mobs = new Map(), regions = createRegions({ universe: f.u, players: new Map(), mobs, spawnMob: () => { throw Error('eager spawn'); }, config: {}, refreshMobTypes: () => ({ types: [] }), send: noop, say: noop, ev: noop });
  regions.openUnlockedRegions(); assert.equal(mobs.size, 0); assert.ok(maps[1]); maps.splice(1); TIERS.splice(7);
});
test('failed preparation retains the defeated boss entitlement, snapshots and history across explicit retries', async t => {
  let allow = false, visits = [];
  const f = watch(t, world({ config: { worldGeneration: { unlockAttempts: 2 } }, extra: { createPlanPreparer: () => ({
    attempt: async (source, attempt) => { visits.push(attempt); return allow ? generateRegionAttempt(source, attempt) : { ok: false, diagnostic: { generationAttempt: attempt, code: 'INVALID_PLAN', errors: ['injected'] } }; }, close: async () => {},
  }) } }));
  killCurrent(f.u); const failed = await f.u.resumePendingUnlock();
  assert.equal(failed.ok, false); assert.equal(f.u.state.worldTier, 7); assert.equal(f.u.state.regions[8], undefined); assert.equal(f.u.state.stats.bossKills.deathlord, 1);
  assert.deepEqual(visits, [0, 1]); const frozen = JSON.stringify(f.u.state.pendingUnlock.region), snapshot = structuredClone(f.u.state.pendingUnlock.snapshot);
  assert.equal(f.u.state.history.filter(e => e.type === 'worldBoss').length, 0);
  await f.u.resumePendingUnlock(); assert.deepEqual(visits, [0, 1]);
  f.u.state.stats.elements.fire = 100; f.u.record('levelMilestone', ['Other'], { level: 10 });
  allow = true; const retried = await f.u.retryPendingUnlock(); assert.equal(retried.ok, true); assert.equal(visits[2], 2);
  assert.deepEqual(f.u.state.regions[8].snapshot, snapshot);
  const { spawnPlan, generationAttempt, generationValidation, ...descriptor } = f.u.state.regions[8]; assert.equal(JSON.stringify(descriptor), frozen);
  assert.equal(f.u.state.history.filter(e => e.type === 'worldBoss').length, 1); assert.equal(f.u.state.stats.bossKills.deathlord, 1);
  assert.equal((await f.u.retryPendingUnlock()).status, 'idle');
});
test('real impossible configuration never creates a partial map or destination', async t => {
  maps.splice(1); TIERS.splice(7);
  const f = watch(t, world({ config: { worldGeneration: { unlockAttempts: 2, budgets: { monsters: 0 } } } }));
  let opened = 0; f.u.onTierUnlocked = () => { opened++; }; killCurrent(f.u);
  const result = await f.u.resumePendingUnlock(); assert.equal(result.status, 'generation-failed'); assert.equal(opened, 0); assert.equal(f.u.state.worldTier, 7);
  assert.ok(f.u.state.pendingUnlock); assert.equal(maps[1], undefined); assert.equal(f.u.state.regions[8], undefined);
  const regions = createRegions({ universe: f.u, players: new Map(), mobs: new Map(), spawnMob: noop, refreshMobTypes: () => ({ types: [] }), send: noop, say: noop, ev: noop });
  assert.throws(() => regions.openRegion(8), /not been committed/); assert.equal(maps[1], undefined); assert.equal(TIERS[7], undefined);
});
test('ready and committing restart checkpoints resume without regenerating plans or duplicate history', async t => {
  const first = watch(t, world()); killCurrent(first.u); await first.u.resumePendingUnlock();
  for (const phase of ['preparing', 'ready', 'committing']) {
    const checkpoint = structuredClone(first.snapshots.find(s => s.pendingUnlock?.status === phase)); assert.ok(checkpoint);
    const savedPlan = checkpoint.pendingUnlock.region?.spawnPlan;
    const resumed = watch(t, world({ store: { data: checkpoint, save: async () => {} } }));
    let activated = 0; resumed.u.onTierUnlocked = () => { activated++; };
    assert.equal((await resumed.u.resumePendingUnlock()).ok, true, phase); assert.equal(checkpoint.worldTier, 8); assert.equal(activated, 1);
    assert.equal(checkpoint.history.filter(e => e.type === 'worldBoss').length, 1); assert.equal(checkpoint.stats.bossKills.deathlord, 1);
    if (savedPlan) assert.deepEqual(checkpoint.regions[8].spawnPlan, savedPlan);
  }
});
test('crash after the last failed attempt cannot replenish the automatic retry budget', async t => {
  const f = watch(t, world({ config: { worldGeneration: { unlockAttempts: 1, budgets: { monsters: 0 } } } })); killCurrent(f.u); await f.u.resumePendingUnlock();
  const checkpoint = structuredClone(f.snapshots.find(s => s.pendingUnlock?.status === 'preparing' && s.pendingUnlock.nextAttempt === 1));
  assert.ok(checkpoint); let attempts = 0;
  const resumed = watch(t, world({ store: { data: checkpoint, save: async () => {} }, extra: { createPlanPreparer: () => ({ attempt: async () => { attempts++; throw Error('must not regenerate'); }, close: async () => {} }) } }));
  assert.equal((await resumed.u.resumePendingUnlock()).status, 'generation-failed'); assert.equal(attempts, 0); assert.equal(checkpoint.worldTier, 7);
});
test('persistence and activation failures keep a retryable entitlement and never announce an unacknowledged tier', async t => {
  const f = watch(t, world()); killCurrent(f.u);
  const originalSave = f.store.save; let fail = true;
  f.store.save = async () => { if (fail && f.u.state.pendingUnlock?.status === 'committing') throw Error('injected durable failure'); await originalSave(); };
  let activations = 0; f.u.onTierUnlocked = () => { activations++; };
  assert.equal((await f.u.resumePendingUnlock()).ok, false); assert.equal(activations, 0); assert.equal(f.u.identity().tier, 7);
  assert.ok(!f.packets.some(m => m.m === 'history.worldBoss')); fail = false;
  f.u.onTierUnlocked = () => { throw Error('injected activation failure'); };
  assert.equal((await f.u.retryPendingUnlock()).ok, false); assert.equal(f.u.identity().tier, 7);
  f.u.onTierUnlocked = () => { activations++; };
  assert.equal((await f.u.retryPendingUnlock()).ok, true); assert.equal(activations, 1); assert.equal(f.u.state.history.filter(e => e.type === 'worldBoss').length, 1);
});
test('already-generated plans/descriptors and V1 behavior remain authoritative', async t => {
  const f = watch(t, world()); f.u.state.worldTier = 7;
  const record = f.u.regionFor(8); record.spawnPlan = buildRegionPlan(f.u.state, record); record.spawnState = { survivor: { health: .5 } };
  const before = JSON.stringify(record); killCurrent(f.u); assert.equal((await f.u.resumePendingUnlock()).ok, true); assert.equal(JSON.stringify(record), before); assert.equal(f.u.state.regions[8], record);
  const legacy = watch(t, world({ config: { generatorVersion: 1 } })); killCurrent(legacy.u); assert.equal(legacy.u.state.worldTier, 8); assert.equal(legacy.u.state.pendingUnlock, undefined);
});
test('WAL recovery during pending transitions restores paid player and universe state together', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shardlands-tier-wal-'));
  const names = ['saves.json', 'plugin-data.json', 'universe.json'];
  const stores = Object.fromEntries(names.map(name => [name, openJsonStore(path.join(directory, name), { tracked: name === 'saves.json' })]));
  const f = watch(t, world({ store: stores['universe.json'], config: { worldGeneration: { unlockAttempts: 1, budgets: { monsters: 0 } } } }));
  const save = coordinateSaves({ directory, stores, background: true, debounceMs: 0 });
  t.after(async () => { await save.close(); assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); fs.rmSync(directory, { recursive: true, force: true }); });
  stores['saves.json'].data.hero = { gold: 123, xp: 456, bag: [{ uid: 'reward-once' }] };
  killCurrent(f.u); await f.u.resumePendingUnlock(); await save.close(); recoverSaveGroup(directory, names);
  const restored = openJsonStore(path.join(directory, 'universe.json'));
  assert.equal(restored.data.worldTier, 7); assert.equal(restored.data.pendingUnlock.status, 'generation-failed'); assert.equal(restored.data.stats.bossKills.deathlord, 1);
  assert.deepEqual(openJsonStore(path.join(directory, 'saves.json')).data.hero, { gold: 123, xp: 456, bag: [{ uid: 'reward-once' }] });
});
test('overlapping resume/retry requests share one job and shutdown preserves an interrupted attempt', async t => {
  let release, calls = 0;
  const f = watch(t, world({ extra: { createPlanPreparer: () => ({ attempt: () => { calls++; return new Promise(resolve => { release = resolve; }); }, close: async () => release?.({ ok: false }) }) } }));
  killCurrent(f.u); assert.equal(calls, 0);
  const first = f.u.resumePendingUnlock(); assert.equal(f.u.resumePendingUnlock(), first); assert.equal(f.u.retryPendingUnlock(), first);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  f.u.suspendUnlocks(); assert.equal((await first).status, 'paused'); assert.equal(calls, 1); assert.equal(f.u.state.pendingUnlock.nextAttempt, 0); assert.equal(f.u.state.worldTier, 7);
  const restored = watch(t, world({ store: { data: structuredClone(f.u.state), save: async () => {} } })); assert.equal((await restored.u.resumePendingUnlock()).ok, true);
});
test('failed entitlement persistence cannot start generation or consume the progression opportunity', async t => {
  let attempts = 0;
  const f = watch(t, world({ extra: { createPlanPreparer: () => ({ attempt: async () => { attempts++; }, close: async () => {} }) } })); killCurrent(f.u);
  f.store.save = async () => { throw Error('unavailable storage'); };
  assert.equal((await f.u.resumePendingUnlock()).ok, false); assert.equal(attempts, 0); assert.equal(f.u.state.worldTier, 7); assert.equal(f.u.state.pendingUnlock.nextAttempt, 0);
});
test('cleanup IO cannot expose a premature destination or accept an overlapping next-tier kill', async t => {
  maps.splice(1); TIERS.splice(7); t.after(() => { maps.splice(1); TIERS.splice(7); });
  const f = watch(t, world()); let cleanupStarted = false, release;
  const gate = new Promise(resolve => { release = resolve; }), originalSave = f.store.save;
  f.store.save = async () => { await originalSave(); if (f.u.state.worldTier === 8 && !f.u.state.pendingUnlock) { cleanupStarted = true; await gate; } };
  const regions = createRegions({ universe: f.u, players: new Map(), mobs: new Map(), spawnMob: noop, refreshMobTypes: () => ({ types: [] }), send: noop, say: noop, ev: noop });
  f.u.onTierUnlocked = regions.unlock; killCurrent(f.u); const job = f.u.resumePendingUnlock();
  while (!cleanupStarted) await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.u.identity().tier, 7); assert.equal(f.u.summary().history.some(e => e.type === 'worldBoss'), false);
  assert.equal(regions.portalList({ x: 5300, y: 5300 }).maps.some(m => m.tier === 8), false);
  const next = f.u.state.regions[8]; f.u.hooks.kill({ name: 'Other' }, { ty: next.worldBoss.type, tier: 7, lvl: next.levels[1], dead: 90000 });
  assert.equal(f.u.state.pendingUnlock, undefined); assert.equal(f.u.state.worldTier, 8);
  release(); assert.equal((await job).ok, true); assert.equal(f.u.identity().tier, 8);
});
test('founding V2 transitions also prepare their plan while legacy V1 transitions stay synchronous', async t => {
  const f = watch(t, world()), current = f.u.regionFor(1);
  f.u.hooks.kill({ name: 'Hero' }, { ty: current.worldBoss.type, tier: 0, lvl: 6 });
  assert.equal(f.u.state.worldTier, 1); assert.equal((await f.u.resumePendingUnlock()).ok, true); assert.equal(f.u.state.worldTier, 2); assert.ok(f.u.state.regions[2].spawnPlan);
});
test('coordinated transition persistence waits for pre-coordinator startup writes before worker ownership', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shardlands-tier-drain-'));
  const file = path.join(directory, 'universe.json'), store = openJsonStore(file);
  let enterDrain, release; const entered = new Promise(resolve => { enterDrain = resolve; }), gate = new Promise(resolve => { release = resolve; });
  store.drain = async () => { enterDrain(); await gate; };
  const save = coordinateSaves({ directory, stores: { 'universe.json': store }, background: true, debounceMs: 0 });
  t.after(async () => { release(); await save.close(); assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); fs.rmSync(directory, { recursive: true, force: true }); });
  store.data.worldTier = 8; const pending = save(); await entered;
  assert.equal(fs.existsSync(path.join(directory, 'save-log.jsonl')), false);
  release(); await pending; await save.checkpoint(); assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).worldTier, 8);
});
