'use strict';
// Synthetic isolated stores only. --baseline-ref loads the historical production coordinator.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process'), Module = require('node:module');
const { performance, monitorEventLoopDelay, PerformanceObserver } = require('node:perf_hooks');
const args = process.argv.slice(2), option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const root = path.resolve(__dirname, '..'), ref = option('--baseline-ref', null);
let api = require('../src/server/persistence');
if (ref) {
  const filename = path.join(root, 'src/server/persistence.js'), historical = new Module(filename, module);
  historical.filename = filename; historical.paths = Module._nodeModulePaths(path.dirname(filename));
  historical._compile(cp.execFileSync('git', ['show', ref + ':src/server/persistence.js'], { encoding: 'utf8', cwd: root }), filename); api = historical.exports;
}
function character(id) {
  return { name: 'Synthetic' + id, lvl: 100, gold: 10000, souls: 5, xp: 100, data: {}, inv: { hp: 30, mp: 20 }, sk: { s1: 5 }, eq: {},
    bag: Array.from({ length: 90 }, (_, i) => ({ uid: id + ':' + i, name: 'Synthetic Equipment', slot: 'weapon', ilvl: 100, plus: 5, rar: 2, fam: 'sword', stats: { atk: 150, str: 10, vit: 5 }, afx: { k: 'crit', v: 3 } })) };
}
async function main() {
  const output = { node: process.version, cpu: os.cpus()[0].model, baseline: ref, activeCharacters: 10, inventorySize: 90, scenarios: [] };
  for (const count of [100, 1000, 10000]) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shardlands-persistence-bench-'));
    let save;
    try {
      const file = path.join(directory, 'saves.json'); let seed = {};
      for (let id = 0; id < count; id++) seed['hero' + id] = character(id);
      fs.writeFileSync(file, JSON.stringify(seed)); const baseBytes = fs.statSync(file).size;
      seed = null;
      const players = api.openJsonStore(file, { tracked: true }), plugin = api.openJsonStore(path.join(directory, 'plugin-data.json')), universe = api.openJsonStore(path.join(directory, 'universe.json'));
      universe.data.progress = { tier: 8, donations: 0 };
      save = api.coordinateSaves({ directory, background: !ref, stores: { 'saves.json': players, 'plugin-data.json': plugin, 'universe.json': universe }, beforeSave: () => { for (let id = 0; id < 10; id++) players.data['hero' + id] = { ...players.data['hero' + id] }; } });
      global.gc?.();
      const memory = process.memoryUsage(), cpu = process.cpuUsage(), delay = monitorEventLoopDelay({ resolution: 1 }); delay.enable();
      let maxBlock = 0, last = performance.now(), gcMs = 0, gcCount = 0;
      const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) { gcMs += entry.duration; gcCount++; } }); observer.observe({ entryTypes: ['gc'] });
      const timer = setInterval(() => { const now = performance.now(); maxBlock = Math.max(maxBlock, now - last - 1); last = now; }, 1);
      const latencies = [], start = performance.now();
      for (let round = 0; round < 4; round++) {
        for (let id = 0; id < 10; id++) players.data['hero' + id] = { ...players.data['hero' + id], gold: players.data['hero' + id].gold + 1 };
        universe.data.progress.donations++;
        const t = performance.now();
        if (round === 1) await Promise.all(Array.from({ length: 25 }, () => save()));
        else if (round === 2) { const first = save(); await new Promise(resolve => setTimeout(resolve, 1)); players.data.hero0 = { ...players.data.hero0, gold: 222 }; await Promise.all([first, save()]); }
        else await save();
        latencies.push(performance.now() - t); await new Promise(resolve => setTimeout(resolve, 5));
      }
      const elapsed = performance.now() - start, usage = process.cpuUsage(cpu), after = process.memoryUsage();
      clearInterval(timer); delay.disable(); observer.disconnect();
      const incrementalBytes = fs.existsSync(path.join(directory, 'save-log.jsonl')) ? fs.statSync(path.join(directory, 'save-log.jsonl')).size : 0;
      let checkpointMs = null; if (save.checkpoint) { const t = performance.now(); await save.checkpoint(); checkpointMs = performance.now() - t; }
      output.scenarios.push({ characters: count, baseBytes, latenciesMs: latencies, maxMainThreadBlockMs: maxBlock, eventLoopP99Ms: delay.percentile(99) / 1e6, cpuMs: (usage.user + usage.system) / 1000, heapDeltaBytes: after.heapUsed - memory.heapUsed, rssBytes: after.rss, gcMs, gcCount, incrementalBytes, checkpointMs,
        // Baseline writes the full player data both to the redo journal and JSON files.
        approximateWriteBytes: ref ? baseBytes * 2 * 5 : incrementalBytes });
    } finally { await save?.close?.(); fs.rmSync(directory, { recursive: true, force: true }); }
    global.gc?.();
  }
  console.log(JSON.stringify(output, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
