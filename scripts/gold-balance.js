'use strict';
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const { execFileSync } = require('node:child_process');
const monsters = require('../monsters'), gold = require('../gold-rewards');
const { upCostFor } = require('../equipment');
const { goldFind } = require('../characters');
const { resolveRegionLevels } = require('../region-levels');
const { referenceHero, referenceDps } = require('./xp-balance');
const { partyHpScale } = require('../xp-economy');
const BASELINE = '9d3866c7f7405c0ef07657997913266becf16617';
const LEVELS = [1, 10, 50, 100, 500, 1000, 5000, 10000], CATEGORIES = ['normal', 'alpha', 'stone', 'boss', 'worldBoss'];
function legacyMonsters(reference = BASELINE) {
  const filename = path.join(__dirname, '..', 'monsters.js');
  const module = new Module(filename); module.filename = filename; module.paths = Module._nodeModulePaths(path.dirname(filename));
  try { module._compile(execFileSync('git', ['show', reference + ':monsters.js'], { cwd: path.dirname(filename), encoding: 'utf8' }), filename); }
  catch (error) { throw new Error('Historical gold baseline unavailable: ' + reference + '. Fetch the commit or pass --baseline; no estimated baseline is substituted.', { cause: error }); }
  return module.exports;
}
function source(api, level, category, generated) {
  const tier = generated ? 7 : Math.max(0, api.TIERS.slice(0, 7).findIndex(zone => level >= zone.lv[0] && level <= zone.lv[1]));
  const oldZone = api.TIERS[7], oldBoss = api.MOBTYPES.goldbalanceboss;
  const nearest = types => [...new Set(types)].sort((a, b) => Math.abs(api.MOBTYPES[a].lvl - level) - Math.abs(api.MOBTYPES[b].lvl - level) || a.localeCompare(b))[0];
  const normalType = generated ? 'wolf' : nearest(api.TIERS[tier].types), bossType = generated ? 'deathlord' : nearest(api.TIERS[tier].bosses);
  const type = category === 'stone' ? generated ? 'doomstone' : api.TIERS[tier].stone : category === 'boss' ? bossType : category === 'worldBoss' ? 'goldbalanceboss' : normalType;
  api.MOBTYPES.goldbalanceboss = { ...api.MOBTYPES[bossType], archetype: bossType, worldBoss: true };
  if (generated) api.TIERS[7] = { ...api.TIERS[0], generated: true, scale: true, lv: [level, level] };
  try {
    const mobs = new Map(); let id = 0;
    const service = api.createMonsterSpawner({ mobs, rates: { monsterHp: 1.6 }, world: { width: 10600, height: 10600, centerX: 5300, centerY: 5300 }, allocateId: () => ++id, rnd: (a, b) => (a + b) / 2, rint: a => a, pick: values => values[0] });
    return { monster: service.spawnMob(type, 6020, 6000, tier, { level, alpha: category === 'alpha' }), template: api.MOBTYPES[type] };
  } finally { if (oldZone) api.TIERS[7] = oldZone; else api.TIERS.splice(7); if (oldBoss) api.MOBTYPES.goldbalanceboss = oldBoss; else delete api.MOBTYPES.goldbalanceboss; }
}
function averagePayout(source, { rate = 1, bonus = 0, generated = false, legacy = false } = {}) {
  const model = legacy ? gold.FOUNDING_MODEL : source.monster.goldModel;
  const monster = { ...source.monster, ...(legacy ? { goldModel: model } : {}) };
  // The historical model is the unchanged founding path, applied to real historical frontier gm/gb.
  const range = monster.gb || source.template.gold;
  const count = model === gold.FRONTIER_MODEL ? 8192 : range[1] - range[0] + 1;
  let total = 0;
  for (let i = 0; i < count; i++) total += gold.monsterGoldRewards({ monster, template: source.template, generated, rate, bonuses: [bonus], roll: (i + .5) / count })[0];
  return total / count;
}
function row(legacy, level, category, generated = true) {
  const before = source(legacy, level, category, generated), after = source(monsters, level, category, generated);
  const beforeAverage = averagePayout(before, { legacy: true }), afterAverage = averagePayout(after, { generated });
  const hero = referenceHero(level), uptime = { normal: .85, alpha: .8, stone: .65, boss: .6, worldBoss: .55 }[category];
  const seconds = after.monster.mh / (referenceDps(hero) * uptime), cost = upCostFor({ slot: 'weapon', ilvl: level, plus: 0 });
  if (before.monster.mh !== after.monster.mh || before.monster.dmg !== after.monster.dmg || before.monster.xp !== after.monster.xp) throw new Error('Gold rebalance changed combat/XP reference data');
  return { level, category, generated, type: after.monster.ty, before: beforeAverage, after: afterAverage, secondsPerKill: seconds, beforePerHour: beforeAverage / seconds * 3600, afterPerHour: afterAverage / seconds * 3600, upgradeCost: cost, beforeKillsPerAttempt: cost / beforeAverage, afterKillsPerAttempt: cost / afterAverage };
}
const f = value => Number.isFinite(value) ? Number(value.toFixed(3)).toLocaleString('en-US') : '—';
function report(reference = BASELINE) {
  const legacy = legacyMonsters(reference), rows = LEVELS.flatMap(level => CATEGORIES.map(category => row(legacy, level, category)));
  const founding = [1, 10, 50, 60].flatMap(level => CATEGORIES.map(category => row(legacy, level, category, false)));
  const regions = [1, 3, 7, 8, 20, 100, 500, 1000, 10000].map(tier => { const levels = tier <= 7 ? monsters.TIERS[tier - 1].lv : resolveRegionLevels('gold-balance-reference', tier); const result = row(legacy, Math.floor((levels[0] + levels[1]) / 2), 'normal', tier >= 8); return { tier, levels, ...result }; });
  const modifiers = [];
  for (const level of [100, 10000]) for (const category of ['normal', 'worldBoss']) for (const bonus of [0, 100, 300, 1000]) for (const rate of [0, .5, 1, 2, 1000000]) {
    const before = source(legacy, level, category, true), after = source(monsters, level, category, true);
    modifiers.push({ level, category, bonus, rate, before: averagePayout(before, { bonus, rate, legacy: true }), after: averagePayout(after, { bonus, rate, generated: true }) });
  }
  const parties = [];
  for (const category of CATEGORIES) for (let size = 1; size <= 5; size++) {
    const before = source(legacy, 100, category, true), after = source(monsters, 100, category, true), bonuses = Array(size).fill(0); if (size > 1) bonuses[1] = 100;
    const oldBudget = gold.monsterGoldBudget({ ...before, monster: { ...before.monster, goldModel: gold.FOUNDING_MODEL }, roll: .5 });
    const oldShares = bonuses.map(bonus => Math.round(oldBudget / size * (1 + bonus / 100)));
    const newShares = gold.monsterGoldRewards({ ...after, bonuses, roll: .5 });
    const base = rows.find(row => row.level === 100 && row.category === category), seconds = base.secondsPerKill * partyHpScale(size) / size;
    parties.push({ category, size, bonuses, before: oldShares, after: newShares, afterPerMemberPerHour: newShares.map(value => value / seconds * 3600) });
  }
  const text = ['# Monster gold rebalance — production formula report', '', 'Historical monster baseline: `' + reference + '`. All OLD gold ranges/multipliers come from the actual historical monster spawner. The unchanged legacy/founding calculation in `gold-rewards.js` evaluates those values; regression cases lock it against the original formula. NEW uses the same production module as loot payouts. No character balances, prices, world saves or region descriptors are modified.', '', 'Assumptions: equal-level reference archer with a rare +0 weapon at the midpoint of real damage stat ranges and level-budgeted Might/Haste/Precision/Brutality passives. Actual player damage, crit and auto-attack timing formulas are reused from the XP simulator. Solo monster HP uses the actual spawner with monsterHp=1.6. Active uptime is normal 85%, Alpha 80%, stone 65%, boss 60%, World Boss 55%. No skill burst, AoE, travel, deaths, competition, gear selling or guardian-gold income is modeled. These are explicit reference assumptions, not observed kill times. OLD and NEW use identical kill times and combat/XP data.', '', 'NEW averages use 8192 deterministic stratified samples of the real ±20% continuous roll after integer rounding. OLD founding-model averages enumerate every integer value of the real inclusive gold range. Displayed values are gold-rate 1 with zero Gold Find unless stated otherwise. Low-level frontier rows are mathematical scaling probes; natural frontier generation begins after the founding regions.', '', '## Generated frontier rewards', '', '| Level | Category | OLD average | NEW average | OLD gold/hour | NEW gold/hour | Seconds/kill |', '|---:|---|---:|---:|---:|---:|---:|'];
  for (const result of rows) text.push('| ' + [result.level, result.category, f(result.before), f(result.after), f(result.beforePerHour), f(result.afterPerHour), f(result.secondsPerKill)].join(' | ') + ' |');
  text.push('', '## Normal kills for a +0 weapon upgrade attempt', '', '| Level | Unchanged forge cost | OLD kills | NEW kills |', '|---:|---:|---:|---:|');
  for (const result of rows.filter(row => row.category === 'normal')) text.push('| ' + [result.level, result.upgradeCost, f(result.beforeKillsPerAttempt), f(result.afterKillsPerAttempt)].join(' | ') + ' |');
  text.push('', '## Boss/Alpha reward efficiency relative to normal gold/hour', '', '| Level | Category | NEW category multiplier | NEW gold/hour divided by normal |', '|---:|---|---:|---:|');
  for (const result of rows.filter(row => row.level >= 100 && row.category !== 'normal')) { const normal = rows.find(row => row.level === result.level && row.category === 'normal'); text.push('| ' + [result.level, result.category, gold.GOLD_BALANCE.multipliers[result.category], f(result.afterPerHour / normal.afterPerHour)].join(' | ') + ' |'); }
  text.push('', '## Founding regions remain legacy', '', '| Level | Category | OLD average | NEW average |', '|---:|---|---:|---:|');
  for (const result of founding) text.push('| ' + [result.level, result.category, f(result.before), f(result.after)].join(' | ') + ' |');
  text.push('', '## Authoritative seeded region levels', '', '| World Tier | Range | Normal level | OLD average | NEW average | Model |', '|---:|---|---:|---:|---:|---|');
  for (const result of regions) text.push('| ' + [result.tier, result.levels.join('–'), result.level, f(result.before), f(result.after), result.generated ? 'frontier-linear-v1' : 'founding-legacy-v1'].join(' | ') + ' |');
  text.push('', '## Gold Find and server gold rates', '', '| Level | Category | Gold Find % | Rate | OLD average | NEW average |', '|---:|---|---:|---:|---:|---:|');
  for (const result of modifiers) text.push('| ' + [result.level, result.category, result.bonus, result.rate, f(result.before), f(result.after)].join(' | ') + ' |');
  text.push('', '## Party distribution (midpoint roll, level 100)', '', 'Recipient 1 is the killer (owned ground drop); others are credited directly with owned overflow drops. Recipient 2 has +100% Gold Find when present. Other recipients have zero bonus. Existing current-team range/death/sharing selection is unchanged.', '', '| Category | Members | Gold Find % | OLD member amounts | NEW member amounts | NEW member gold/hour, equal DPS |', '|---|---:|---|---|---|---|');
  for (const result of parties) text.push('| ' + [result.category, result.size, result.bonuses.join('/'), result.before.join('/'), result.after.join('/'), result.afterPerMemberPerHour.map(f).join('/')].join(' | ') + ' |');
  text.push('', '## Interpretation and deliberate scope limits', '', '- Linear frontier gold keeps the normal kills/forge-attempt ratio close to 1/.065 = 15.385 at every supported level, before Gold Find/server modifiers. Integer rounding affects low values slightly.', '- Founding rewards are preserved, so late founding zones can remain more profitable than early frontier regions. There is intentionally no newly introduced gold level-gap penalty. Resolving this legacy-farming opportunity requires a separate economy decision.', '- Gold Find stays multiplicative and its gear stat still grows with item level. Very high bonuses can therefore dominate base-drop balancing; this task does not add a new equipment cap.', '- Non-party HP/damage, forge costs, shop prices, item selling, rarity inflation, Souls and summoned-monster loot are unchanged. Gear liquidation and guardian gold can remain major income sources and are excluded from the gold/hour model.', '- Boss kill times are inherited from the existing combat curves. The efficiency table makes any remaining low boss gold/hour explicit; drops and world progression also have value not priced into this report.', '- Party division uses one rounded integer pool and assigns remainder units in killer-first order. Personal Gold Find is applied afterwards. This fixes small rounding inflation and repeated-recipient payments without introducing a party gold bonus.', '- Each reward and wallet credit is a finite safe integer. Administrative gold rates retain their existing 1000000 cap; extreme legitimate finite Gold Find saturates individual rewards at the existing currency cap. No balances are migrated.');
  return { baseline: reference, rows, founding, regions, modifiers, parties, markdown: text.join('\n') + '\n' };
}
if (require.main === module) {
  const args = process.argv.slice(2), option = name => { const index = args.indexOf(name); return index < 0 ? null : args[index + 1]; };
  const result = report(option('--baseline') || BASELINE);
  if (option('--out')) fs.writeFileSync(path.resolve(option('--out')), result.markdown);
  if (option('--json')) fs.writeFileSync(path.resolve(option('--json')), JSON.stringify({ ...result, markdown: undefined }, null, 2));
  process.stdout.write(result.markdown);
}
module.exports = { report, legacyMonsters, source, averagePayout };
