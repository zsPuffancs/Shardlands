'use strict';
const fs = require('node:fs'), os = require('node:os');
const { performance } = require('node:perf_hooks');
const { createUniverse } = require('../src/world/universe');
const { generateValidRegionPlan } = require('../src/world/region-plan-retries');
const delay = () => new Promise(resolve => setTimeout(resolve, 2));
async function timed(action) {
  let previous = performance.now(), maxDelay = 0, heartbeats = 0;
  const timer = setInterval(() => { const now = performance.now(); maxDelay = Math.max(maxDelay, now - previous - 2); previous = now; heartbeats++; }, 2);
  await delay(); const start = performance.now(); const result = await action(); await delay(); clearInterval(timer);
  return { elapsedMs: performance.now() - start, largestTimerStallMs: maxDelay, heartbeats, result: result.status || (result.ok ? 'accepted' : 'exhausted') };
}
async function main() {
  const report = { node: process.version, cpu: os.cpus()[0].model, scenarios: [], notes: ['Synthetic characters/stores only; JSON capture cost included, physical disk IO excluded.', '2 ms timer stalls are observations, not hard bounds or actual combat load telemetry.'] };
  for (const [name, settings] of Object.entries({ normal: {}, spacing700: { spacing: { camp: 700, stone: 700, alpha: 700, boss: 700 } }, impossible: { budgets: { monsters: 0 } } })) {
    let writes = 0;
    const store = { data: {}, save: async () => { JSON.stringify(store.data); writes++; await new Promise(resolve => setImmediate(resolve)); } };
    const u = createUniverse({ store, config: { worldSeed: 'tier-timing', worldGeneration: settings }, broadcast() {}, messageText: () => '', isAdmin: () => false }); u.state.worldTier = 7;
    const start = performance.now(); u.hooks.kill({ name: 'Synthetic Hero' }, { ty: u.regionFor(7).worldBoss.type, tier: 6, lvl: 60 }); const hookMs = performance.now() - start;
    const asyncPreparation = await timed(() => u.resumePendingUnlock());
    const inputs = u.state.pendingUnlock?.inputs || require('../src/world/region-blueprint').regionPlanInputs(u.state, u.state.regions[8]);
    const synchronousEquivalent = await timed(() => generateValidRegionPlan(inputs));
    report.scenarios.push({ name, synchronousKillHookMs: hookMs, asyncPreparation, synchronousEquivalent, writes }); u.suspendUnlocks();
  }
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
