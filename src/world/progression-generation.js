'use strict';
// Versioned, server-authoritative level assignment. Geometry and encounter identity never change.
const { levelGapScale, encounterShare } = require('../progression/xp-economy');
const { dangerAt, navigable } = require('./danger-geography');
const POLICY_VERSION = 1;
const POLICY = Object.freeze({ gridSize: 33, sampleStep: 25, accessibleDanger: .85, entryDanger: .65,
  minimumNormals: 4, minimumGapMultiplier: .65, minimumBudgetRatio: .5, maximumSpan: 45,
  names: ['entry', 'progression', 'danger', 'endgame'],
  normalCuts: [0, .2, .46, .78, 1], stoneCuts: [0, .2, .5, .8, 1],
  normalWeights: [.35, .35, .2, .1], stoneWeights: [.3, .4, .2, .1] });
class ProgressionGenerationError extends Error {
  constructor(report) { super('Region progression constraints failed: ' + report.errors.join(', ')); this.name = 'ProgressionGenerationError'; this.code = 'INVALID_PROGRESSION'; this.diagnostics = report; }
}
function bandsFor(levels, kind) {
  const [min, max] = levels, count = max - min + 1, cuts = kind === 'stone' ? POLICY.stoneCuts : POLICY.normalCuts;
  const weights = kind === 'stone' ? POLICY.stoneWeights : POLICY.normalWeights;
  return POLICY.names.map((name, index) => ({ name, min: min + Math.round(count * cuts[index]), max: min + Math.round(count * cuts[index + 1]) - 1, weight: weights[index] })).filter(band => band.min <= band.max);
}
function checkedLevels(levels) {
  if (!Array.isArray(levels) || levels.length !== 2 || !levels.every(level => Number.isSafeInteger(level) && level >= 1 && level <= 10000) || levels[1] < levels[0] || levels[1] - levels[0] > POLICY.maximumSpan) throw new RangeError('Invalid progression level range');
  return levels;
}
// A bounded flood on the authoritative danger field, excluding boss arenas even before their defeat.
// Each connector/edge is sampled; this is an accessibility approximation, not combat or navigation AI.
function accessibility(plan) {
  const size = POLICY.gridSize, boundary = plan.boundary, origin = plan.portal || plan.settlement;
  const bosses = plan.encounters.filter(encounter => encounter.kind === 'boss');
  const point = id => ({ x: 21 + (id % size) * (boundary.width - 42) / (size - 1), y: 21 + Math.floor(id / size) * (boundary.height - 42) / (size - 1) });
  const allowed = (p, threshold) => navigable(p, boundary) && (!plan.danger || dangerAt(plan.danger, p.x, p.y) < threshold) && bosses.every(boss => Math.hypot(p.x - boss.x, p.y - boss.y) > boss.radius + 30);
  const edge = (a, b, threshold) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / POLICY.sampleStep));
    for (let i = 0; i <= steps; i++) if (!allowed({ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }, threshold)) return false;
    return true;
  };
  const nearest = p => {
    const x = Math.max(0, Math.min(size - 1, Math.round((p.x - 21) / (boundary.width - 42) * (size - 1))));
    const y = Math.max(0, Math.min(size - 1, Math.round((p.y - 21) / (boundary.height - 42) * (size - 1))));
    return y * size + x;
  };
  function flood(threshold) {
    const visited = new Uint8Array(size * size), queue = [], start = nearest(origin);
    if (edge(origin, point(start), threshold)) { visited[start] = 1; queue.push(start); }
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head], x = id % size, y = Math.floor(id / size);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        if (x + dx < 0 || x + dx >= size || y + dy < 0 || y + dy >= size) continue;
        const next = id + dx + dy * size;
        if (!visited[next] && edge(point(id), point(next), threshold)) { visited[next] = 1; queue.push(next); }
      }
    }
    return p => {
      const id = nearest(p), x = id % size, y = Math.floor(id / size);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (x + dx < 0 || x + dx >= size || y + dy < 0 || y + dy >= size) continue;
        const next = id + dx + dy * size;
        if (visited[next] && edge(point(next), p, threshold)) return true;
      }
      return false;
    };
  }
  const reachable = flood(POLICY.accessibleDanger), entry = flood(POLICY.entryDanger);
  return Object.fromEntries(plan.encounters.filter(encounter => ['camp', 'stone', 'alpha'].includes(encounter.kind)).map(encounter => [encounter.id, { accessible: reachable(encounter), entryAccessible: entry(encounter), danger: plan.danger ? dangerAt(plan.danger, encounter.x, encounter.y) : 0 }]));
}
function encounterData(plan, access) {
  const members = new Map();
  for (const spawn of plan.spawns) { if (!members.has(spawn.encounterId)) members.set(spawn.encounterId, []); members.get(spawn.encounterId).push(spawn); }
  return plan.encounters.map(encounter => ({ ...encounter, ...access[encounter.id], members: members.get(encounter.id) || [] }));
}
function suitable(playerLevel, monsterLevel, category = 'normal') {
  if (playerLevel === 10000) return monsterLevel >= 9990;
  return levelGapScale(playerLevel, monsterLevel) >= POLICY.minimumGapMultiplier && encounterShare({ playerLevel, monsterLevel, category }) >= encounterShare({ playerLevel, monsterLevel: playerLevel, category }) * POLICY.minimumBudgetRatio;
}
function validateProgression(plan, levels = plan.progression?.levels, access) {
  checkedLevels(levels);
  access = access || accessibility(plan);
  const entries = encounterData(plan, access), normal = plan.spawns.filter(spawn => spawn.kind === 'camp'), stones = plan.spawns.filter(spawn => spawn.kind === 'stone');
  const errors = [], warnings = [], legacy = plan.progression?.version !== POLICY_VERSION;
  for (const spawn of plan.spawns) if (!Number.isSafeInteger(spawn.level) || spawn.level < levels[0] || spawn.level > levels[1]) errors.push('level-outside-region:' + spawn.id);
  const populations = kind => bandsFor(levels, kind).map(band => {
    const source = kind === 'stone' ? stones : normal, count = source.filter(spawn => spawn.level >= band.min && spawn.level <= band.max).length;
    const percent = source.length ? count / source.length * 100 : 0;
    if (!count || percent < band.weight * 50) warnings.push('Underrepresented ' + kind + ' band: ' + band.name);
    return { ...band, count, percent };
  });
  const normalBands = populations('camp'), stoneBands = populations('stone'), segments = [];
  for (let level = levels[0]; level <= levels[1]; level++) {
    const normalCount = entries.filter(e => e.kind === 'camp' && e.accessible).reduce((sum, e) => sum + e.members.filter(s => suitable(level, s.level)).length, 0);
    const stoneCount = entries.filter(e => e.kind === 'stone' && e.accessible && e.members.some(s => suitable(level, s.level, 'stone'))).length;
    segments.push({ level, normalCount, stoneCount, terminal: level === 10000, viable: normalCount >= POLICY.minimumNormals && stoneCount >= 1 });
  }
  const entryEncounters = entries.filter(e => e.kind === 'camp' && e.entryAccessible && e.members.some(s => s.level >= levels[0] && s.level <= Math.min(levels[1], levels[0] + 5)));
  const entryCount = entryEncounters.reduce((sum, e) => sum + e.members.filter(s => s.level <= levels[0] + 5).length, 0);
  if (entryCount < POLICY.minimumNormals) errors.push('insufficient-safe-entry-normals');
  const gaps = []; let current = null;
  for (const segment of segments) {
    if (!segment.viable && !segment.terminal) { if (!current) { current = { min: segment.level, max: segment.level }; gaps.push(current); } else current.max = segment.level; }
    else current = null;
  }
  if (gaps.length) errors.push('xp-coverage-gaps');
  if (!normal.length) errors.push('missing-normal-population');
  if (!stones.length) errors.push('missing-stone-population');
  return { version: plan.progression?.version || 0, legacy, tier: plan.tier, levels: levels.slice(), valid: !errors.length, errors, warnings, normalBands, stoneBands,
    encounterLevels: plan.spawns.length ? { min: Math.min(...plan.spawns.map(s => s.level)), max: Math.max(...plan.spawns.map(s => s.level)) } : null,
    gapCount: gaps.length, gaps, largestGap: Math.max(0, ...gaps.map(gap => gap.max - gap.min + 1)), segments,
    entry: { accessible: entryCount >= POLICY.minimumNormals, normalCount: entryCount, encounterIds: entryEncounters.map(e => e.id) },
    accessibility: { gridSize: POLICY.gridSize, sampleStep: POLICY.sampleStep, maximumDanger: POLICY.accessibleDanger, entryMaximumDanger: POLICY.entryDanger, excludesBossArenas: true },
    encounters: entries.filter(e => e.kind !== 'resource').map(e => ({ id: e.id, accessible: !!e.accessible, entryAccessible: !!e.entryAccessible, danger: e.danger ?? null, levels: e.members.map(s => s.level), band: bandsFor(levels, e.kind).find(band => e.members.some(s => s.level >= band.min && s.level <= band.max))?.name || 'endgame', entryEligible: e.kind === 'camp' && entryEncounters.some(entry => entry.id === e.id) })) };
}
function assignProgression(plan, levels, random) {
  checkedLevels(levels);
  plan.progression = { version: POLICY_VERSION, levels: levels.slice(), repairs: [] };
  const access = accessibility(plan), entries = encounterData(plan, access), origin = plan.portal || plan.settlement;
  const score = entry => (entry.danger || 0) * .75 + Math.hypot(entry.x - origin.x, entry.y - origin.y) / Math.hypot(plan.boundary.width, plan.boundary.height) * .15 + random() * .10;
  function distribute(group, kind) {
    const bands = bandsFor(levels, kind), totalWeight = bands.reduce((sum, b) => sum + b.weight, 0);
    const ranked = group.map(entry => ({ entry, score: score(entry) })).sort((a, b) => a.score - b.score || a.entry.id.localeCompare(b.entry.id));
    let cumulative = 0, offset = 0;
    for (let i = 0; i < bands.length; i++) {
      const band = bands[i]; cumulative += band.weight / totalWeight;
      const end = i === bands.length - 1 ? ranked.length : Math.round(cumulative * ranked.length), population = ranked.slice(offset, end);
      population.forEach(({ entry }, index) => {
        const level = population.length === 1 ? Math.round((band.min + band.max) / 2) : Math.round(band.min + (band.max - band.min) * index / (population.length - 1));
        for (const spawn of entry.members) spawn.level = Math.max(band.min, Math.min(band.max, level + (kind === 'camp' ? random.int(-1, 1) : 0)));
      }); offset = end;
    }
  }
  for (const kind of ['camp', 'stone']) {
    // Accessible and optional isolated populations each receive their own full progression distribution.
    const group = entries.filter(entry => entry.kind === kind);
    distribute(group.filter(entry => entry.accessible), kind); distribute(group.filter(entry => !entry.accessible), kind);
  }
  const camps = entries.filter(entry => entry.kind === 'camp' && entry.members.length);
  for (const entry of entries.filter(e => e.kind === 'alpha')) {
    const nearest = camps.slice().sort((a, b) => Math.hypot(a.x - entry.x, a.y - entry.y) - Math.hypot(b.x - entry.x, b.y - entry.y))[0];
    const level = nearest ? Math.max(...nearest.members.map(s => s.level)) + random.int(1, 3) : levels[1];
    entry.members.forEach(spawn => { spawn.level = Math.min(levels[1], level); });
  }
  for (const entry of entries.filter(e => e.kind === 'boss')) entry.members.forEach(spawn => { spawn.level = levels[1]; });
  const safeEntry = camps.filter(entry => entry.entryAccessible).sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y))[0];
  if (safeEntry) { safeEntry.members.forEach(spawn => { spawn.level = levels[0]; }); plan.progression.repairs.push({ id: safeEntry.id, reason: 'safe-entry-anchor', level: levels[0] }); }
  // At most one repair per supported level per population. No placement retry or geometry mutation.
  for (const kind of ['camp', 'stone']) {
    const group = entries.filter(entry => entry.kind === kind && entry.accessible && entry.members.length);
    const category = kind === 'stone' ? 'stone' : 'normal';
    for (let attempt = 0; attempt <= levels[1] - levels[0]; attempt++) {
      const gap = Array.from({ length: levels[1] - levels[0] + 1 }, (_, i) => levels[0] + i).find(level => level < 10000 && group.reduce((sum, entry) => sum + entry.members.filter(spawn => suitable(level, spawn.level, category)).length, 0) < (kind === 'camp' ? POLICY.minimumNormals : 1));
      if (gap === undefined) break;
      const candidates = group.filter(entry => entry !== safeEntry);
      // Reuse the most redundant encounter, never the only source covering another segment.
      const candidate = candidates.find(entry => Array.from({ length: levels[1] - levels[0] + 1 }, (_, i) => levels[0] + i).every(level => level === 10000 || !entry.members.some(spawn => suitable(level, spawn.level, category)) || group.filter(other => other !== entry).reduce((sum, other) => sum + other.members.filter(s => suitable(level, s.level, category)).length, 0) >= (kind === 'camp' ? POLICY.minimumNormals : 1)));
      if (!candidate) break;
      candidate.members.forEach(spawn => { spawn.level = gap; }); plan.progression.repairs.push({ id: candidate.id, reason: 'coverage-gap', level: gap });
    }
  }
  const report = validateProgression(plan, levels, access);
  if (!report.valid) throw new ProgressionGenerationError(report);
  return plan;
}
module.exports = { POLICY_VERSION, POLICY, ProgressionGenerationError, bandsFor, accessibility, assignProgression, validateProgression };
