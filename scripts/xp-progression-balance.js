'use strict';
// Offline report: execute the pinned pre-update production XP module, never approximate its curve.
const { execFileSync } = require('node:child_process');
const Module = require('node:module'), path = require('node:path');
const xp = require('../xp-economy');
const { generateSpawnPlan } = require('../world-generation');
const { createDangerSpec } = require('../danger-geography');
const { POLICY_VERSION, validateProgression } = require('../progression-generation');
const BASELINE = '25a1d0a2a39ad65d9571381d927d503a77ed88f2';
const SECONDS = Object.freeze({ normal: 5, alpha: 15, stone: 60, boss: 120, worldBoss: 300, summoned: 5, anomaly: 60 });
function historicalXp(reference) {
  const filename = path.resolve(__dirname, '..', 'xp-economy.js');
  const source = execFileSync('git', ['show', reference + ':xp-economy.js'], { cwd: path.dirname(filename), encoding: 'utf8' });
  const historical = new Module(filename); historical.filename = filename; historical.paths = Module._nodeModulePaths(path.dirname(filename)); historical._compile(source, filename);
  return historical.exports;
}
function metrics(api, options, seconds) {
  const award = api.calculateEncounterXp(options), requirement = xp.xpNeed(options.playerLevel);
  return { xp: award, percent: award / requirement * 100, xpPerMinute: award * 60 / seconds, xpPerHour: award * 3600 / seconds, killsPerLevel: award ? requirement / award : null, seconds };
}
function generated(seed, levels, progressionVersion) {
  return generateSpawnPlan({ seed, tier: 8, progressionVersion, area: { x0: 0, y0: 0, w: 5000, h: 5000, cx: 2500, cy: 2500 },
    zone: { generated: true, outer: true, min: 400, max: 99999, lv: levels, types: ['wolf', 'boar'], bosses: ['alphawolf'], worldBoss: 'alphawolf', count: 260, stones: 32, stone: 'stone', alphas: 8, portal: { id: 'portal', x: 2500, y: 2562 } },
    dangerSpec: createDangerSpec({ seed, tier: 8, biome: 'volcanic' }) });
}
function report(reference = BASELINE) {
  const old = historicalXp(reference), rows = [], parties = [], regions = [];
  for (const level of [1, 10, 100, 500, 1000, 5000, 9999, 10000]) for (const gap of [-60, -40, -25, -15, -10, -5, 0, 5, 6, 10, 13, 15, 20, 24, 25]) {
    const monsterLevel = level - gap; if (monsterLevel < 1 || monsterLevel > 10000) continue;
    for (const category of ['normal', 'stone']) {
      const options = { playerLevel: level, monsterLevel, category };
      rows.push({ level, monsterLevel, gap, category, beforeFactor: old.levelGapScale(level, monsterLevel), afterFactor: xp.levelGapScale(level, monsterLevel), before: metrics(old, options, SECONDS[category]), after: metrics(xp, options, SECONDS[category]) });
    }
  }
  for (const level of [10, 100, 5000]) for (const category of ['normal', 'stone']) for (const members of [1, 2, 5]) {
    // Equal-DPS contributors: real production HP scale / total DPS; participation is assumed satisfied.
    const healthScale = xp.partyHpScale(members), seconds = SECONDS[category] * healthScale / members;
    const options = { playerLevel: level, monsterLevel: level, category, members, healthScale };
    parties.push({ level, category, members, before: metrics(old, options, seconds), after: metrics(xp, options, seconds), pool: xp.calculateEncounterXp(options) * members });
  }
  for (const levels of [[60, 80], [100, 145], [5000, 5035], [9980, 10000]]) {
    const seed = 'progression-balance-' + levels[0], before = generated(seed, levels, 0), after = generated(seed, levels, POLICY_VERSION);
    const diagnostics = validateProgression(after), pathRows = [];
    for (let level = levels[0]; level <= levels[1]; level++) for (const [kind, category] of [['camp', 'normal'], ['stone', 'stone']]) {
      function population(api, plan) {
        const source = plan.spawns.filter(spawn => spawn.kind === kind);
        const awards = source.map(spawn => api.calculateEncounterXp({ playerLevel: level, monsterLevel: spawn.level, category }));
        const best = Math.max(0, ...awards), mean = awards.reduce((sum, award) => sum + award, 0) / Math.max(1, awards.length);
        return { best, mean, eligible: awards.filter(award => award > 0).length, bestKillsPerLevel: best ? xp.xpNeed(level) / best : null, bestXpPerMinute: best * 60 / SECONDS[category], bestXpPerHour: best * 3600 / SECONDS[category] };
      }
      pathRows.push({ level, category, before: population(old, before), after: population(xp, after), coverage: diagnostics.segments.find(segment => segment.level === level) });
    }
    regions.push({ seed, levels, diagnostics, rows: pathRows });
  }
  const f = value => value === null ? '—' : Number(value.toFixed(2)).toLocaleString('en-US');
  const text = ['# XP Penalty 2.0 — production before/after simulation', '', 'Baseline: `' + reference + '`. Before executes the historical production `xp-economy.js` from Git. After executes current production functions. Region plans use the production generator with the legacy policy disabled/enabled; geometry and encounter identities are identical. No saves are read or written.', '',
    'Reference assumptions (not measured kill times): normal 5 s, Alpha 15 s, Spirit Stone 60 s, boss 120 s, World Boss 300 s; no travel, deaths, contention, skills or AoE. The tables isolate reward policy. Fixed kill times deliberately do not predict underlevel combat survivability or high-level TTK. Rate 1, no Wisdom or other bonus. Party time uses production HP scaling / member count and assumes equal DPS plus valid participation from every member. Actual guardian waves may lengthen stone fights.', '',
    '## Penalties and XP efficiency', '', 'Signed gap = player minus monster. Category budgets and recipient reference cap remain unchanged. Equal-level mature normal: about 40 kills/level; stone: about 10. Rounding matters at early levels. At level 10000, no XP is awarded.', '',
    '| Player | Gap | Category | Old/new factor | Old/new XP | Old/new kills per level | Old/new XP/min | Old/new XP/hour |', '|---:|---:|---|---:|---:|---:|---:|---:|'];
  for (const row of rows) text.push('| ' + [row.level, row.gap, row.category, f(row.beforeFactor) + ' / ' + f(row.afterFactor), f(row.before.xp) + ' / ' + f(row.after.xp), f(row.before.killsPerLevel) + ' / ' + f(row.after.killsPerLevel), f(row.before.xpPerMinute) + ' / ' + f(row.after.xpPerMinute), f(row.before.xpPerHour) + ' / ' + f(row.after.xpPerHour)].join(' | ') + ' |');
  text.push('', '## Equal-DPS parties (XP is per member; pool is total paid once)', '', '| Level | Category | Members | Seconds | Old/new XP per kill | New pool | Old/new XP/hour per member |', '|---:|---|---:|---:|---:|---:|---:|');
  for (const row of parties) text.push('| ' + [row.level, row.category, row.members, f(row.after.seconds), f(row.before.xp) + ' / ' + f(row.after.xp), f(row.pool), f(row.before.xpPerHour) + ' / ' + f(row.after.xpPerHour)].join(' | ') + ' |');
  for (const region of regions) {
    text.push('', '## Entire progression path: ' + region.levels.join('–'), '', 'Seed `' + region.seed + '`, volcanic, 260 normal / 32 stone budget; safe entry normals ' + region.diagnostics.entry.normalCount + ', gaps ' + region.diagnostics.gapCount + '. Mean is over every generated spawn of that category, including zero-XP encounters; best is the highest production reward in that population. Availability is independently checked using reachable ordinary/stone encounters. These counts do not estimate travel or respawn throughput.', '', '| Player | Category | Old/new positive-XP sources | Old/new mean XP | Old/new best XP | Old/new best kills/level | New best XP/min | New best XP/hour | Reachable suitable normal/stone count |', '|---:|---|---:|---:|---:|---:|---:|---:|---:|');
    for (const row of region.rows) text.push('| ' + [row.level, row.category, row.before.eligible + ' / ' + row.after.eligible, f(row.before.mean) + ' / ' + f(row.after.mean), f(row.before.best) + ' / ' + f(row.after.best), f(row.before.bestKillsPerLevel) + ' / ' + f(row.after.bestKillsPerLevel), f(row.after.bestXpPerMinute), f(row.after.bestXpPerHour), row.coverage.normalCount + ' / ' + row.coverage.stoneCount].join(' | ') + ' |');
  }
  text.push('', '## Limits and unchanged balance', '', 'Low-level rounding and the existing early-game taper remain. Extreme underlevel kills are constrained by both the penalty and the recipient reference budget, independently for each eligible member. Summons pay no XP. Wisdom, server-rate and plugin caps are unchanged and covered by regression tests. Contract eligibility now uses the shared 25-level overlevel cutoff; the XP tables are unchanged. Boss/stone HP, DPS, respawn throughput, party mentoring speed and travel are not rebalanced here. Real XP/hour requires gameplay telemetry; no measured performance improvement is claimed. Existing saved-region levels/plans remain unchanged; their coverage is report-only in the Atlas.');
  return { baseline: reference, seconds: SECONDS, rows, parties, regions, markdown: text.join('\n') + '\n' };
}
module.exports = { BASELINE, SECONDS, historicalXp, report };
