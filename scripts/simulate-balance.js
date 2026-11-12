'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { simulate } = require('../src/balance/simulation');
function selection(text) {
  if (!text.includes(':')) return text.split(',').map(Number);
  const parts = text.split(':');
  if (parts.length < 2 || parts.length > 3) throw new RangeError('Range syntax: start:end[:step]');
  const [start, end, step = 1] = parts.map(Number);
  if (![start, end, step].every(Number.isSafeInteger) || start < 1 || end < start || step < 1 || Math.floor((end - start) / step) + 1 > 100) throw new RangeError('Range must contain 1..100 points with positive step');
  return Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, index) => start + index * step);
}
const cell = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
function csv(report) {
  const fields = ['level', 'category', 'scenarioWorldTier', 'monsterHp', 'monsterDamage', 'xp', 'killsPerLevel', 'meanGold', 'goldWith100PercentFind', 'modeledKillSeconds', 'modeledGoldPerHour', 'modeledXpPerHour', 'normalUpgradePrice', 'killsForUpgrade', 'expectedGearDrops', 'expectedConsumables', 'partyXpPerMember'];
  return '\uFEFF' + [fields.map(cell).join(','), ...report.encounters.map(row => fields.map(key => cell(row[key])).join(','))].join('\r\n') + '\r\n';
}
function markdown(report) {
  return ['# Shardlands Balance Simulation', '', 'Ruleset: ' + report.ruleset + '. Status: ' + report.status + '.', '',
    '## Assumptions', '', ...report.assumptions.map(text => '- ' + text), '',
    '## Checks', '', '| Check | Status | Reason |', '|---|---|---|', ...report.checks.map(row => '| ' + [row.id, row.status, row.detail.replaceAll('|', '/')].join(' | ') + ' |'), '',
    '## Reference encounters', '', '| Level | Enemy | HP | XP | Mean gold | Gold/hour (modeled) | Kills/+0 attempt |', '|---:|---|---:|---:|---:|---:|---:|',
    ...report.encounters.map(row => '| ' + [row.level, row.category, row.monsterHp, row.xp, row.meanGold.toFixed(2), row.modeledGoldPerHour.toFixed(2), row.killsForUpgrade?.toFixed(2) ?? 'disabled'].join(' | ') + ' |'), '',
    '## Actual World Tier descriptors', '', '| Tier | Levels | Validation |', '|---:|---|---|', ...report.worlds.map(row => '| ' + [row.tier, row.levels.join('–'), row.valid ? 'valid' : row.errors.join('; ')].join(' | ') + ' |'), '',
    '## Forge Markov expectations (+0 to +9 weapon)', '', '| Item level | Attempts | Gold |', '|---:|---:|---:|', ...report.progression.map(row => '| ' + [row.level, row.forgeAttemptsTo9.toFixed(6), row.forgeGoldTo9.toFixed(2)].join(' | ') + ' |'), '',
    'JSON includes full distributions, party splits, reference sale values, Stone lifecycle ceilings and effective configuration. CSV contains encounter rows. Null values mean unavailable or disabled, not zero.', ''].join('\n');
}
function main(args) {
  const options = {}, outputs = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index], value = args[++index];
    if (!value || !['--ruleset', '--levels', '--tiers', '--seed', '--overrides', '--json', '--csv', '--markdown'].includes(flag)) throw new Error('Usage: --ruleset Normal|Hardcore|Accelerated|Custom --levels 1,100,... --tiers start:end:step --overrides file.json --json file --csv file --markdown file');
    if (flag === '--ruleset') options.ruleset = value;
    else if (flag === '--levels') options.levels = selection(value);
    else if (flag === '--tiers') options.tiers = selection(value);
    else if (flag === '--seed') options.seed = value;
    else if (flag === '--overrides') options.overrides = JSON.parse(fs.readFileSync(path.resolve(value), 'utf8'));
    else outputs[flag.slice(2)] = value;
  }
  const report = simulate(options);
  for (const [format, file] of Object.entries(outputs)) {
    const output = format === 'json' ? JSON.stringify(report, null, 2) + '\n' : format === 'csv' ? csv(report) : markdown(report);
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(path.resolve(file), output);
  }
  process.stdout.write('Shardlands Balance Simulation\nRuleset: ' + report.ruleset + '\nStatus: ' + report.status + '\n');
  for (const status of ['PASS', 'WARN', 'FAIL']) process.stdout.write(status + ': ' + report.checks.filter(row => row.status === status).length + '\n');
  for (const check of report.checks.filter(row => row.status !== 'PASS')) process.stdout.write(check.status + ' ' + check.id + ': ' + check.detail + '\n');
  if (report.status === 'FAIL') process.exitCode = 1;
  return report;
}
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { main, selection, csv, markdown };
