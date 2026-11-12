'use strict';
// Offline balance runner: production math after, actual historical production modules before.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const { execFileSync } = require('node:child_process');
const { createHistoricalRequire } = require('./historical-imports');
const root = path.resolve(__dirname, '..');
const xp = require('../src/progression/xp-economy'), characters = require('../src/player/characters'), monsters = require('../src/combat/monsters');
const { statRanges } = require('../src/economy/equipment');
const { resolveRegionLevels } = require('../src/world/region-levels');
const BASELINE = 'f374228585ae6b3d9e973389a2c0eab9410e80f3';
const LEVELS = [1, 10, 25, 50, 60, 100, 250, 500, 1000, 5000, 9999, 10000];
const CATEGORIES = ['normal', 'alpha', 'stone', 'boss', 'worldBoss', 'summoned', 'anomaly'];
const noop = () => {};
function legacyModules(reference = BASELINE) {
  const loaded = {};
  function load(filename) {
    if (loaded[filename]) return loaded[filename];
    let source;
    try { source = execFileSync('git', ['show', reference + ':' + filename], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 }); }
    catch { throw new Error('Historical production baseline unavailable: ' + reference + '. Use a full clone or --baseline <commit>. No estimated baseline is substituted.'); }
    const module = new Module(path.join(root, filename)); module.filename = path.join(root, filename); module.paths = Module._nodeModulePaths(root);
    module.require = createHistoricalRequire(module, {
      './monsters': () => load('monsters.js'), './characters': () => load('characters.js'),
    });
    module._compile(source, module.filename); loaded[filename] = module.exports; return module.exports;
  }
  return { monsters: load('monsters.js'), characters: load('characters.js'), combat: load('combat.js') };
}
function referenceHero(level, id = 1, gearBonus = 0, wisdom = false) {
  const weapon = { slot: 'weapon', ilvl: level, rar: 2, plus: 0, stats: { dmg: 0 } };
  const range = statRanges(weapon).dmg; weapon.stats.dmg = (range[0] + range[1]) / 2;
  const sk = characters.newSk(), available = level - 1;
  for (const [key, fraction] of [['might', .4], ['haste', .2], ['crit', .2], ['critdmg', .2]]) sk[key] = Math.min(99, Math.floor(available * fraction));
  const player = { id, name: 'Reference' + id, cls: 'archer', lvl: level, xp: 0, sp: 0, eq: { weapon }, sk, buf: { xp: wisdom ? Date.now() + 100000 : 0 }, x: 6000, y: 6000 };
  characters.stats(player); player.hp = player.maxhp; player.g.xpb = gearBonus;
  return player;
}
function referenceDps(player) {
  // Actual auto-attack damage/crit/haste functions; mean damage jitter is 1. Skills/AoE are excluded.
  return characters.playerDmg(player) * (1 + characters.critCh(player) * (characters.critMul(player) - 1)) / (.8 * (1 - characters.passive(player, 'haste')) * (1 - characters.gearAttackSpeed(player)));
}
function spawnReference(api, level, category, worldTier) {
  const generated = worldTier === undefined ? level >= 60 : worldTier >= 8;
  const tier = generated ? 7 : Math.max(0, api.TIERS.slice(0, 7).findIndex(zone => level >= zone.lv[0] && level <= zone.lv[1]));
  const previous = api.TIERS[7], oldBoss = api.MOBTYPES.balanceworldboss;
  const nearest = types => [...new Set(types)].sort((a, b) => Math.abs(api.MOBTYPES[a].lvl - level) - Math.abs(api.MOBTYPES[b].lvl - level) || a.localeCompare(b))[0];
  const normalType = generated ? 'wolf' : nearest(api.TIERS[tier].types), bossType = generated ? 'deathlord' : nearest(api.TIERS[tier].bosses);
  const type = category === 'stone' ? generated ? 'doomstone' : api.TIERS[tier].stone : category === 'boss' ? bossType : category === 'worldBoss' ? 'balanceworldboss' : normalType;
  api.MOBTYPES.balanceworldboss = { ...api.MOBTYPES[bossType], archetype: bossType, worldBoss: true };
  if (generated) api.TIERS[7] = { ...api.TIERS[0], generated: true, scale: true, lv: [level, level], types: ['wolf'], bosses: ['balanceworldboss'] };
  const mobs = new Map(); let id = 0;
  try {
    const service = api.createMonsterSpawner({ mobs, rates: { monsterHp: 1.6 }, world: { width: 10600, height: 10600, centerX: 5300, centerY: 5300 }, allocateId: () => ++id, rnd: (a, b) => (a + b) / 2, rint: a => a, pick: values => values[0] });
    const monster = service.spawnMob(type, 6020, 6000, tier, { level, alpha: category === 'alpha' });
    monster.summoned = category === 'summoned'; monster.anomaly = category === 'anomaly';
    return { monster, template: api.MOBTYPES[type] };
  } finally { if (previous) api.TIERS[7] = previous; else api.TIERS.splice(7); if (oldBoss) api.MOBTYPES.balanceworldboss = oldBoss; else delete api.MOBTYPES.balanceworldboss; }
}
function beforeAward(legacy, { level, monsterLevel, category, members, gearBonus, wisdom, serverRate, share = true, worldTier }) {
  const source = spawnReference(legacy.monsters, monsterLevel, category, worldTier);
  const roster = members.map((memberLevel, index) => referenceHero(memberLevel, index + 1, gearBonus, wisdom)), player = roster[0];
  // The old combat module needs its category template after spawnReference restores the temporary registry.
  const oldTemplate = legacy.monsters.MOBTYPES[source.monster.ty]; legacy.monsters.MOBTYPES[source.monster.ty] = source.template;
  const progression = legacy.characters.createProgression({ fire: noop, ev: noop, say: noop, toast: noop, broadcast: noop, sendInv: noop });
  const monster = { ...source.monster, hp: 1, mh: 1, ps: 1 };
  const combat = legacy.combat.createCombat({ players: new Map(roster.map(p => [p.id, p])), mobs: new Map([[monster.id, monster]]), rates: { xpRate: serverRate, respawnSeconds: 10 }, teams: { monsterScale: () => 1.5 ** (members.length - 1), sharesLoot: () => share, nearbyMembers: () => roster, XP_BONUS_PER_MEMBER: .15 }, gainXp: progression.gainXp, spawnMob: noop, dropLoot: noop, ev: noop, fire: noop, say: noop, broadcast: noop });
  try { combat.hitMob(player, monster, 1e15); return { xp: player.xp, health: source.monster.mh, enemyDamage: source.monster.dmg }; }
  finally { if (oldTemplate) legacy.monsters.MOBTYPES[source.monster.ty] = oldTemplate; else delete legacy.monsters.MOBTYPES[source.monster.ty]; }
}
function levelUps(level, award, capped) {
  let count = 0; while (award >= xp.xpNeed(level) && (!capped || level < xp.MAX_PLAYER_LEVEL) && count < 200000) { award -= xp.xpNeed(level++); count++; }
  return count;
}
function metrics(award, level, seconds, capped) { const need = xp.xpNeed(level); return { xp: award, percent: award / need * 100, killsPerLevel: award ? need / award : null, xpPerMinute: award / seconds * 60, xpPerHour: award / seconds * 3600, minutesPerLevel: award ? need / award * seconds / 60 : null, levelUps: levelUps(level, award, capped), secondsPerKill: seconds }; }
function scenario(legacy, options) {
  const { level, monsterLevel, category, members, gearBonus = 0, wisdom = false, serverRate = 1, share = true, contributions = members.map(() => 1) } = options;
  const before = beforeAward(legacy, { ...options, gearBonus, wisdom, serverRate, share }), afterSource = spawnReference(monsters, monsterLevel, category, options.worldTier);
  const roster = members.map((memberLevel, index) => referenceHero(memberLevel, index + 1, gearBonus, wisdom));
  const damage = roster.map((player, index) => referenceDps(player) * contributions[index]);
  const totalDps = damage.reduce((a, b) => a + b, 0);
  const eligible = members.filter((memberLevel, index) => (share || !index) && damage[index] >= totalDps * xp.XP_BALANCE.minimumDamageFraction && xp.levelGapScale(memberLevel, monsterLevel) > 0).length;
  const award = damage[0] >= totalDps * xp.XP_BALANCE.minimumDamageFraction ? xp.calculateEncounterXp({ playerLevel: level, monsterLevel, category, members: share ? eligible || 1 : 1, healthScale: xp.partyHpScale(share ? members.length : 1), gearBonus, wisdom, serverRate }) : 0;
  const uptime = { normal: .85, alpha: .80, stone: .65, boss: .60, worldBoss: .55, summoned: .85, anomaly: .60 }[category];
  const beforeSeconds = before.health * 1.5 ** (members.length - 1) / Math.max(1, totalDps * uptime);
  const afterSeconds = afterSource.monster.mh * xp.partyHpScale(share ? members.length : 1) / Math.max(1, totalDps * uptime);
  const beforeSolo = beforeAward(legacy, { ...options, members: [level], gearBonus, wisdom, serverRate, share: false });
  const afterSolo = xp.calculateEncounterXp({ playerLevel: level, monsterLevel, category, gearBonus, wisdom, serverRate });
  const soloDps = referenceDps(roster[0]) * uptime;
  const beforeMetrics = metrics(before.xp, level, beforeSeconds, false), afterMetrics = metrics(award, level, afterSeconds, true);
  beforeMetrics.partyEfficiency = beforeSolo.xp ? beforeMetrics.xpPerHour / (beforeSolo.xp / (beforeSolo.health / soloDps) * 3600) : null;
  afterMetrics.partyEfficiency = afterSolo ? afterMetrics.xpPerHour / (afterSolo / (afterSource.monster.mh / soloDps) * 3600) : null;
  return { worldTier: options.worldTier, level, monsterLevel, category, members, gearBonus, wisdom, serverRate, share, contributions, before: beforeMetrics, after: afterMetrics };
}
const f = value => value === null ? '—' : Number.isFinite(value) ? Number(value.toFixed(3)).toLocaleString('en-US') : String(value);
function report(reference = BASELINE) {
  const legacy = legacyModules(reference), rows = [];
  const started = performance.now();
  for (const level of LEVELS) for (const category of CATEGORIES) for (let size = 1; size <= 5; size++) for (const gearBonus of [0, 100, 1000]) for (const wisdom of [false, true]) for (const serverRate of [1, 2, 10]) for (const offset of [0, -12, -13, 5, 100]) {
    const monsterLevel = Math.max(1, Math.min(10000, level + offset));
    rows.push(scenario(legacy, { level, monsterLevel, category, members: Array(size).fill(level), gearBonus, wisdom, serverRate }));
  }
  for (const members of [[100, 100], [100, 100, 100, 100, 100], [100, 113], [100, 500], [10, 100]]) for (const share of [false, true]) for (const contributions of [members.map(() => 1), members.map((_, i) => i ? .5 : 1), members.map((_, i) => i ? 0 : 1)]) {
    rows.push(scenario(legacy, { level: members[0], monsterLevel: members[0], category: 'normal', members, share, contributions }));
  }
  const mixedRows = rows.slice(LEVELS.length * CATEGORIES.length * 5 * 3 * 2 * 3 * 5);
  const regions = [1, 8, 20, 50, 100, 500, 1000, 10000].map(tier => ({ tier, levels: tier <= 7 ? monsters.TIERS[tier - 1].lv.slice() : resolveRegionLevels('xp-balance-reference', tier) }));
  const tierRows = [];
  for (const region of regions) {
    const samples = [...new Set([region.levels[0], Math.floor((region.levels[0] + region.levels[1]) / 2), region.levels[1]])];
    for (const level of [...new Set([...samples, Math.min(9999, samples[0])])]) for (const monsterLevel of samples) for (const category of ['normal', 'alpha', 'stone', 'boss', 'worldBoss']) for (const size of [1, 3, 5]) tierRows.push(scenario(legacy, { level, monsterLevel, category, members: Array(size).fill(level), worldTier: region.tier }));
  }
  rows.push(...tierRows);
  const powerRows = [];
  for (const [level, monsterLevel] of [[1, 5000], [10, 1000], [100, 1000], [100, 200]]) for (const category of ['normal', 'stone', 'worldBoss']) for (const members of [[level], [level, monsterLevel]]) powerRows.push(scenario(legacy, { level, monsterLevel, category, members }));
  rows.push(...powerRows);
  rows.push(scenario(legacy, { level: 9999, monsterLevel: 10000, category: 'worldBoss', members: [9999], gearBonus: 1e9, wisdom: true, serverRate: 1e6 }));
  for (const row of rows) if (!Number.isSafeInteger(row.after.xp) || row.after.xp < 0 || row.after.xp > xp.encounterLimit(row.level) || row.after.levelUps > 1) throw new Error('Unsafe production reward: ' + JSON.stringify(row));
  const summary = { scenarios: rows.length, elapsedMs: performance.now() - started, beforeMaxXp: Math.max(...rows.map(row => row.before.xp)), afterMaxXp: Math.max(...rows.map(row => row.after.xp)), beforeMaxLevels: Math.max(...rows.map(row => row.before.levelUps)), afterMaxLevels: Math.max(...rows.map(row => row.after.levelUps)), beforeMultiLevelCases: rows.filter(row => row.before.levelUps > 1).length, afterMultiLevelCases: rows.filter(row => row.after.levelUps > 1).length, longNormalKillCases: rows.filter(row => row.after.secondsPerKill > 60 && row.category === 'normal' && row.members.length === 1).length };
  const text = ['# XP Economy 2.0 — production balance simulation', '', 'Historical baseline: `' + reference + '`. BEFORE loads and executes the actual historical monster, combat and progression modules from Git; AFTER uses the current production XP functions and monster spawner. No save files are read or written.', '', 'Assumptions: rare +0 weapon at character level, midpoint real statRanges damage, archer auto-attacks, actual crit/haste/passive formulas, 40/20/20/20% available points in Might/Haste/Precision/Brutality (each capped at 99). No skills, AoE, potion burst, travel, competition or deaths. Mean attack jitter = 1. Reference active uptime: normal/summoned 85%, Alpha 80%, stone 65%, boss/anomaly 60%, World Boss 55%. These are modeling assumptions, not measured player DPS.', '', '## Equal-level solo, no bonuses, rate 1', '', '| Level | Enemy | Before XP | After XP | Before level % | After level % | Before kills/level | After kills/level | After XP/min | After XP/hour | After minutes/level | After seconds/kill | Before/after level-ups from zero XP |', '|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|'];
  for (const row of rows.filter(row => row.monsterLevel === row.level && row.members.length === 1 && row.gearBonus === 0 && !row.wisdom && row.serverRate === 1).filter((row, i, all) => all.findIndex(other => other.level === row.level && other.category === row.category) === i)) text.push('| ' + [row.level, row.category, f(row.before.xp), f(row.after.xp), f(row.before.percent), f(row.after.percent), f(row.before.killsPerLevel), f(row.after.killsPerLevel), f(row.after.xpPerMinute), f(row.after.xpPerHour), f(row.after.minutesPerLevel), f(row.after.secondsPerKill), row.before.levelUps + ' / ' + row.after.levelUps].join(' | ') + ' |');
  text.push('', '## Default-rate time-efficiency comparison', '', '| Level | Enemy | Before XP/min | After XP/min | Before XP/hour | After XP/hour | Before minutes/level | After minutes/level |', '|---:|---|---:|---:|---:|---:|---:|---:|');
  for (const level of [1, 10, 100, 1000, 9999]) for (const category of ['normal', 'stone', 'worldBoss']) {
    const row = rows.find(row => row.level === level && row.monsterLevel === level && row.category === category && row.members.length === 1 && !row.gearBonus && !row.wisdom && row.serverRate === 1);
    text.push('| ' + [level, category, f(row.before.xpPerMinute), f(row.after.xpPerMinute), f(row.before.xpPerHour), f(row.after.xpPerHour), f(row.before.minutesPerLevel), f(row.after.minutesPerLevel)].join(' | ') + ' |');
  }
  text.push('', '## Equal-DPS party efficiency relative to solo (level 100 normal enemy)', '', '| Members | Before HP scale | After HP scale | Before damage scale | After damage scale | Before per-member XP/hour vs solo | After per-member XP/hour vs solo |', '|---:|---:|---:|---:|---:|---:|---:|');
  for (let size = 1; size <= 5; size++) { const row = rows.find(row => row.level === 100 && row.monsterLevel === 100 && row.category === 'normal' && row.members.length === size && !row.gearBonus && !row.wisdom && row.serverRate === 1); text.push('| ' + [size, f(1.5 ** (size - 1)), f(xp.partyHpScale(size)), f(1.5 ** (size - 1)), f(xp.partyDamageScale(size)), f(row.before.partyEfficiency), f(row.after.partyEfficiency)].join(' | ') + ' |'); }
  text.push('', '## Mixed-level, low-contribution and sharing scenarios', '', '| Levels | DPS weights | Sharing | Before XP | After XP | Before efficiency | After efficiency |', '|---|---|---|---:|---:|---:|---:|');
  for (const row of mixedRows) text.push('| ' + [row.members.join('/'), row.contributions.join('/'), row.share, f(row.before.xp), f(row.after.xp), f(row.before.partyEfficiency), f(row.after.partyEfficiency)].join(' | ') + ' |');
  text.push('', '## World Tier scenarios (solo normal enemy, minimum/midpoint/maximum levels)', '', '| World Tier | Hero level | Enemy level | Before XP | After XP | After level % | After XP/hour | After minutes/level |', '|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const row of tierRows.filter(row => row.category === 'normal' && row.members.length === 1 && row.level === Math.min(9999, row.monsterLevel))) text.push('| ' + [row.worldTier, row.level, row.monsterLevel, f(row.before.xp), f(row.after.xp), f(row.after.percent), f(row.after.xpPerHour), f(row.after.minutesPerLevel)].join(' | ') + ' |');
  text.push('', '## Extreme underlevel / carry scenarios', '', '| Hero level | Enemy level | Enemy | Party levels | Before XP | After XP | Before level-ups | After level-ups |', '|---:|---:|---|---|---:|---:|---:|---:|');
  for (const row of powerRows) text.push('| ' + [row.level, row.monsterLevel, row.category, row.members.join('/'), f(row.before.xp), f(row.after.xp), row.before.levelUps, row.after.levelUps].join(' | ') + ' |');
  text.push('', '## Deterministic region ranges', '', '| World Tier | Levels |', '|---:|---|', ...regions.map(region => '| ' + region.tier + ' | ' + region.levels.join('–') + ' |'), '', '## Numerical and progression checks', '', '```json', JSON.stringify(summary, null, 2), '```', '', 'Level-up counts start with zero pending XP. At level 10000 the AFTER system grants no new XP; the level requirement shown in percentage columns is only a diagnostic denominator. Anomaly BEFORE rows represent an ordinary enemy because the historical category did not exist. Summoned BEFORE rewards reproduce the old farmable behavior.', '', 'Equal-DPS party advantages do not apply to idle or low-DPS groups: fixed HP scaling depends on the initial roster while rewards require actual recent participation. Mixed-level mentoring can remain fast when a strong mentor supplies most damage, but tiny tags (<1% contribution), extreme underlevel rewards and summoned-enemy XP farms are constrained.', '', 'The inherited non-party monster HP and player damage curves are unchanged. This model flags long high-level kills and poor boss XP/time efficiency; it does not prove live time-to-level balance. Bosses also grant drops and world progression, which are not valued as XP in this report. Target fractions are initial balance constants requiring real combat telemetry, especially at high levels.');
  return { baseline: reference, assumptions: text[4], summary, regions, rows, markdown: text.join('\n') + '\n' };
}
if (require.main === module) {
  const args = process.argv.slice(2), option = name => { const index = args.indexOf(name); return index < 0 ? null : args[index + 1]; };
  const result = args.includes('--progression') ? require('./xp-progression-balance').report(option('--baseline') || require('./xp-progression-balance').BASELINE) : report(option('--baseline') || BASELINE);
  if (option('--out')) fs.writeFileSync(path.resolve(option('--out')), result.markdown);
  if (option('--json')) fs.writeFileSync(path.resolve(option('--json')), JSON.stringify({ ...result, markdown: undefined }));
  process.stdout.write(result.markdown);
}
module.exports = { report, scenario, legacyModules, referenceDps, referenceHero };
