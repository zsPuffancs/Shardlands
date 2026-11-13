'use strict';
// Synthetic, read-only production-generation stress test. No real stores or maps are opened.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process'), Module = require('node:module');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { createUniverse, createRegionDescriptor, generationSnapshot } = require('../src/world/universe');
const { regionPlanInputs } = require('../src/world/region-blueprint');
const { generateSpawnPlan } = require('../src/world/world-generation');
const { generateValidRegionPlan, generateRegionAttempt, validatePreparedPlan } = require('../src/world/region-plan-retries');
const count = Number(process.argv[2] || 12), output = process.argv[3];
if (!Number.isSafeInteger(count) || count < 1 || count > 100) throw Error('Seed count must be 1..100');
const root = path.resolve(__dirname, '..'), filename = path.join(root, 'src/world/world-generation.js');
const historical = new Module(filename, module); historical.filename = filename; historical.paths = Module._nodeModulePaths(path.dirname(filename));
historical._compile(cp.execFileSync('git', ['show', 'b460c8072464aa5f26e5302660448b0ea039d0fa:src/world/world-generation.js'], { cwd: root, encoding: 'utf8' }), filename);
const profiles = { default: {}, spacing500: { spacing: { camp: 500, stone: 500, alpha: 500, boss: 500 } }, spacing700: { spacing: { camp: 700, stone: 700, alpha: 700, boss: 700 } },
  spacing1000: { spacing: { camp: 1000, stone: 1000, alpha: 1000, boss: 1000 } }, extremeDanger: { danger: { baseline: .65, noise: .25 } }, noNormals: { budgets: { monsters: 0 } } };
const report = { node: process.version, cpu: os.cpus()[0].model, seeds: count, tiers: [8, 40, 400], cases: 0, accepted: 0, exhausted: 0, recoveredByRetry: 0, attemptZeroBaselineMatches: 0, profiles: {}, examples: [] };
const times = [];
for (const [name, settings] of Object.entries(profiles)) for (let index = 0; index < count; index++) {
  const u = createUniverse({ store: { data: {}, save: async () => {} }, config: { worldSeed: 'tier-stress-' + index, worldGeneration: settings }, broadcast() {}, messageText: () => '', isAdmin: () => false });
  for (const tier of report.tiers) {
    const descriptor = createRegionDescriptor(u.state, tier, generationSnapshot(u.state)), inputs = regionPlanInputs(u.state, descriptor), frozen = JSON.stringify(inputs);
    let old, now;
    try { old = { plan: historical.exports.generateSpawnPlan(inputs) }; } catch (e) { old = { error: e.message, code: e.code }; }
    try { now = { plan: generateSpawnPlan(inputs) }; } catch (e) { now = { error: e.message, code: e.code }; }
    assert.deepEqual(now, old, 'attempt-zero baseline: ' + name + '/' + index + '/' + tier); report.attemptZeroBaselineMatches++;
    const started = performance.now(), result = generateValidRegionPlan(inputs); times.push(performance.now() - started);
    assert.equal(JSON.stringify(inputs), frozen, 'generation mutated frozen inputs');
    const summary = report.profiles[name] ||= { accepted: 0, exhausted: 0, recoveredByRetry: 0, maxAttempt: 0 };
    if (result.ok) {
      assert.equal(validatePreparedPlan(result.plan, inputs).valid, true);
      assert.deepEqual(result.plan, generateRegionAttempt(inputs, result.generationAttempt).plan, 'selected attempt must reproduce');
      assert.equal(result.plan.encounters[0].kind, 'boss');
      report.accepted++; summary.accepted++; summary.maxAttempt = Math.max(summary.maxAttempt, result.generationAttempt);
      if (result.generationAttempt) { report.recoveredByRetry++; summary.recoveredByRetry++; }
    } else {
      assert.equal(result.code, 'GENERATION_EXHAUSTED'); assert.equal(result.diagnostics.length, 20); assert.equal(result.nextAttempt, 20);
      report.exhausted++; summary.exhausted++;
      if (!report.examples.some(e => e.profile === name)) report.examples.push({ profile: name, seed: inputs.seed, tier, errors: result.diagnostics[0].errors });
    }
    report.cases++;
  }
}
times.sort((a, b) => a - b);
report.synchronousToolingMs = { p50: times[Math.floor(times.length * .5)], p95: times[Math.floor(times.length * .95)], max: times.at(-1), note: 'Pure batch-tool cost, not combat-tick time. Live generation runs in the bounded worker.' };
report.notes = ['Safe exhaustion is an expected outcome; valid plans are never guaranteed for arbitrary settings.', 'Every accepted plan was fully validated and reproduced; every attempt-zero plan or error matched the verified baseline.', 'Only synthetic seed labels appear here.'];
if (output) { fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify(report, null, 2));
