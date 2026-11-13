'use strict';
// Synthetic production-path benchmark. All entities are disposable; no saves or sockets are opened.
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process'), Module = require('node:module');
const { Session } = require('node:inspector');
const { performance, monitorEventLoopDelay, PerformanceObserver } = require('node:perf_hooks');
const args = process.argv.slice(2), option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const root = path.resolve(option('--root', path.join(__dirname, '..')));
const baseline = option('--baseline-ref', null), loaded = new Map();
function production(relative) {
  const filename = path.join(root, relative);
  if (!baseline) return require(filename);
  const historical = new Module(filename, module); historical.filename = filename; historical.paths = Module._nodeModulePaths(path.dirname(filename));
  historical.require = request => {
    const resolved = request.startsWith('.') ? path.resolve(path.dirname(filename), request) + '.js' : request;
    return loaded.has(resolved) ? loaded.get(resolved) : Module.prototype.require.call(historical, request);
  };
  historical._compile(cp.execFileSync('git', ['show', baseline + ':' + relative.replaceAll('\\', '/')], { cwd: root, encoding: 'utf8' }), filename);
  loaded.set(filename, historical.exports); return historical.exports;
}
const { IndexedEntities, nearby } = production('src/shared/spatial-index.js');
const { createSnapshotPublisher } = production('src/multiplayer/snapshots.js');
const { createSimulation } = production('src/combat/simulation.js');
const { newSk, stats } = require(path.join(root, 'src/player/characters'));
const noop = () => {};
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * fraction))];
function summary(values) { return { p50: percentile(values, .5), p95: percentile(values, .95), p99: percentile(values, .99) }; }
async function allocationSampler() {
  if (!args.includes('--sample-allocations')) return async () => null;
  const session = new Session(); session.connect();
  const post = (method, parameters = {}) => new Promise((resolve, reject) => session.post(method, parameters, (error, result) => error ? reject(error) : resolve(result)));
  await post('HeapProfiler.startSampling', { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  return async () => {
    try {
      const { profile } = await post('HeapProfiler.stopSampling');
      const size = node => node.selfSize + node.children.reduce((total, child) => total + size(child), 0);
      return size(profile.head);
    } finally { session.disconnect(); }
  };
}
function fixture(count, crowded) {
  const players = new IndexedEntities(), mobs = new IndexedEntities(), loot = new IndexedEntities();
  for (let id = 1; id <= count; id++) {
    const p = { id, name: 'Bot' + id, x: crowded ? 6000 + id % 20 : 500 + id * 797 % 11000, y: crowded ? 6000 + id % 17 : 500 + id * 337 % 11000,
      c: { mobDeltas: true, mobFieldDeltas: true, stateDeltas: true, listDeltas: true }, cls: 'archer', lvl: 10, eq: {}, bag: [], inv: { hp: 3 }, sk: newSk(), buf: {}, sp: 1, xp: 0, gold: 100, cd: Infinity, cd1: 0, cd2: 0, cd3: 0, dir: { x: 0, y: 0 }, target: 0 };
    stats(p); p.hp = p.maxhp; p.mp = p.maxmp; players.set(id, p);
  }
  for (let id = 1; id <= 3400; id++) {
    const x = crowded ? 5500 + id * 17 % 1000 : 100 + id * 797 % 11800, y = crowded ? 5500 + id * 31 % 1000 : 100 + id * 337 % 11800;
    mobs.set(id, { id, x, y, sx: x, sy: y, hx: x, hy: y, hp: 40, mh: 40, lvl: 1, ty: 'wolf', r: 14, dmg: 1, dead: 0, wake: Infinity, awake: false, target: 0 });
  }
  for (let id = 1; id <= 1000; id++) loot.set(id, { id, x: crowded ? 5600 + id % 800 : id * 311 % 12000, y: crowded ? 5600 + id % 700 : id * 719 % 12000, exp: Infinity, kind: 'gold', name: 'gold', owner: 0 });
  const events = Array.from({ length: 200 }, (_, id) => ({ k: 'hit', x: crowded ? 6000 + id : id * 59, y: crowded ? 6000 : id * 57, v: id }));
  let bytes = 0;
  const publish = createSnapshotPublisher({ players, mobs, loot, drainEvents: () => events, refreshMobTypes: () => ({ indices: { wolf: 0 } }), canSend: () => true, send: (c, message) => { bytes += Buffer.byteLength(JSON.stringify(message)); return true; } });
  const simulation = createSimulation({ players, mobs, loot, rates: { monsterDamage: 1 }, respawnMonster: noop, hitMob: noop, hurtPlayer: noop, startCast: noop, resolveCast: noop, pickupTick: noop, ev: noop, fire: noop, publishSnapshots: publish, getTransportStats: () => ({}) });
  return { players, mobs, publish, simulation, bytes: () => bytes };
}
async function main() {
  const samples = Number(option('--samples', 40)), output = { baseline, environment: { node: process.version, platform: process.platform, cpu: os.cpus()[0].model, logicalCpus: os.cpus().length }, samples, scenarios: [] };
  for (const crowded of [true, false]) for (const count of option('--players', '50,100,200,300').split(',').map(Number)) {
    global.gc?.(); const f = fixture(count, crowded), active = [...f.players.values()], query = [], snapshots = [], ticks = [];
    let gcMs = 0, gcCount = 0; const observer = new PerformanceObserver(list => { for (const e of list.getEntries()) { gcMs += e.duration; gcCount++; } }); observer.observe({ entryTypes: ['gc'] });
    const stopAllocations = await allocationSampler();
    const delay = monitorEventLoopDelay({ resolution: 1 }); delay.enable(); const cpu = process.cpuUsage(), start = performance.now(), memory = process.memoryUsage();
    for (let i = 0; i < samples + 10; i++) {
      let t = performance.now(); for (let j = 0; j < 100; j++) nearby(f.mobs, active[j % count], 1700); const q = performance.now() - t;
      t = performance.now(); f.publish(active, 1000 + i * 50); const s = performance.now() - t;
      t = performance.now(); f.simulation.tick(); const tick = performance.now() - t;
      if (i >= 10) { query.push(q); snapshots.push(s); ticks.push(tick); }
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    const elapsed = performance.now() - start, usage = process.cpuUsage(cpu), after = process.memoryUsage(); delay.disable(); observer.disconnect();
    output.scenarios.push({ players: count, layout: crowded ? 'crowded' : 'distributed', query100Ms: summary(query), snapshotMs: summary(snapshots), tickMs: summary(ticks), cpuPercentOfOneCore: (usage.user + usage.system) / elapsed / 10, eventLoopDelayMs: { p95: delay.percentile(95) / 1e6, p99: delay.percentile(99) / 1e6 }, heapDeltaBytes: after.heapUsed - memory.heapUsed, rssBytes: after.rss, gcMs, gcCount, bytesSerialized: f.bytes(), sampledAllocationEstimateBytes: await stopAllocations() });
  }
  console.log(JSON.stringify(output, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
