'use strict';
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const { generateRegion } = require('../src/world/universe');
const { TIERS } = require('../src/combat/monsters');
const { stream, generateSpawnPlan, validateSpawnPlan } = require('../src/world/world-generation');
const count = Number(process.argv[2] || 10000);
if (!Number.isInteger(count) || count < 1 || count > 1000000) throw Error('Count must be 1..1000000');
const output = process.argv[3];
if (global.gc) global.gc();
const before = process.memoryUsage(), times = [], invalid = [], byTier = {}, start = performance.now();
let attempts = 0, placementFailures = 0, memberFailures = 0, spacingViolations = 0, boundaryViolations = 0, invalidCount = 0, maxSpawns = 0, peakHeap = before.heapUsed, peakRss = before.rss;
for (let i = 0; i < count; i++) {
  const seed = 'mathematical-audit-' + i;
  const tier = i % 10 < 7 ? i % 10 + 1 : i % 10 === 7 ? 8 + i % 97 : i % 10 === 8 ? 1000000 + i : Number.MAX_SAFE_INTEGER - i;
  const startedAt = performance.now();
  try {
    const descriptor = generateRegion(seed, tier, { elements: { void: i % 12, fire: i % 5 } }, 2);
    const zone = tier <= 7 ? { ...TIERS[tier - 1], worldBoss: descriptor.worldBoss.type } : { outer: true, generated: true, min: 400, max: 99999, types: descriptor.families, bosses: [descriptor.worldBoss.type], worldBoss: descriptor.worldBoss.type, count: 260, stones: descriptor.stones, stone: 'stone', alphas: 8, lv: descriptor.levels };
    const area = tier <= 7 ? { w: 10600, h: 10600, cx: 5300, cy: 5300 } : { w: 5000, h: 5000, cx: 2500, cy: 2500 };
    const plan = generateSpawnPlan({ seed, tier, zone, area });
    times.push(performance.now() - startedAt);
    const validation = validateSpawnPlan(plan);
    if (!validation.valid) { invalidCount++; if (invalid.length < 10) invalid.push({ seed, tier, errors: validation.errors }); }
    attempts += plan.metrics.attempts; placementFailures += plan.failures.length; memberFailures += plan.metrics.memberFailures;
    spacingViolations += validation.errors.filter(error => error.startsWith('spacing:')).length;
    boundaryViolations += validation.errors.filter(error => error.includes('boundary:') || error.includes('protected:')).length;
    maxSpawns = Math.max(maxSpawns, plan.spawns.length);
    const label = tier <= 7 ? String(tier) : 'frontier';
    const stats = byTier[label] || (byTier[label] = { cases: 0, optionalPlacementFailures: 0, requestedEncounters: 0 }); stats.cases++; stats.optionalPlacementFailures += plan.failures.length; stats.requestedEncounters += plan.encounters.length + plan.failures.length;
  } catch (error) { times.push(performance.now() - startedAt); invalidCount++; if (invalid.length < 10) invalid.push({ seed, tier, error: error.message }); }
  if (i % 500 === 499) {
    const memory = process.memoryUsage(); peakHeap = Math.max(peakHeap, memory.heapUsed); peakRss = Math.max(peakRss, memory.rss);
    if (global.gc) global.gc();
    if (i % 1000 === 999) process.stderr.write('Validated ' + (i + 1) + '/' + count + '\n');
  }
}
const end = performance.now(); if (global.gc) global.gc(); const after = process.memoryUsage(); times.sort((a, b) => a - b);
// Independent iid annulus samples: KS statistic for normalized r^2 and angular chi-square.
const n = 100000, random = stream('audit-statistics', 1, 2, 'annulus'), values = [], angular = Array(12).fill(0), { sampleAnnulus } = require('../src/world/world-generation');
for (let i = 0; i < n; i++) { const p = sampleAnnulus(random, 0, 0, 400, 1250); values.push((p.x * p.x + p.y * p.y - 400 ** 2) / (1250 ** 2 - 400 ** 2)); angular[Math.min(11, Math.floor((Math.atan2(p.y, p.x) + Math.PI) / (2 * Math.PI) * 12))]++; }
values.sort((a, b) => a - b); let ks = 0; values.forEach((value, i) => { ks = Math.max(ks, (i + 1) / n - value, value - i / n); });
const chi2 = angular.reduce((sum, value) => sum + (value - n / 12) ** 2 / (n / 12), 0);
const report = { combinations: count, generatorVersion: 2, invalidRegionCount: invalidCount, invalidExamples: invalid, placementAttempts: attempts, optionalPlacementFailures: placementFailures, memberFailures, minimumDistanceViolations: spacingViolations, boundaryOrProtectedViolations: boundaryViolations, maxSpawnsPerRegion: maxSpawns, byTier, generationMilliseconds: { mean: times.reduce((a, b) => a + b, 0) / count, p95: times[Math.ceil(count * .95) - 1], max: times.at(-1), totalWallIncludingValidation: end - start }, memoryBytes: { heapBefore: before.heapUsed, heapAfterGc: after.heapUsed, sampledPeakHeap: peakHeap, rssBefore: before.rss, rssAfter: after.rss, sampledPeakRss: peakRss, note: 'Includes Node allocator/JIT and statistics; sampled peaks, not exact allocation accounting.' }, distribution: { iidSamples: n, radialSquaredKs: ks, ksThresholdAtAlpha001: 1.628 / Math.sqrt(n), angularChiSquared: chi2, angularDegreesOfFreedom: 11, chiSquaredThresholdAtAlpha001: 24.725, passed: ks < 1.628 / Math.sqrt(n) && chi2 < 24.725 } };
if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (invalidCount || spacingViolations || boundaryViolations || !report.distribution.passed) process.exitCode = 1;
