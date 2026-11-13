'use strict';
const crypto = require('node:crypto');
const { SpatialIndex } = require('../shared/spatial-index');
const VERSION = 2;
const HARD_BUDGETS = Object.freeze({ monsters: 800, stones: 40, alphas: 16, bosses: 4, resources: 32 });
const SPACING = Object.freeze({ camp: 180, stone: 200, alpha: 180, boss: 500, resource: 180 });
const RADII = Object.freeze({ camp: 80, stone: 40, alpha: 40, boss: 180, resource: 25 });
function stream(seed, tier, version, purpose, id = '') {
  // Counter-based SHA-256 blocks avoid ambiguous labels and 32-bit seed-state collisions.
  const key = crypto.createHash('sha256').update(JSON.stringify([String(seed), tier, version, purpose, String(id)])).digest();
  const counterBytes = Buffer.alloc(8); let counter = 0, block = Buffer.alloc(0), offset = 0;
  const random = () => {
    if (offset >= block.length) {
      counterBytes.writeBigUInt64LE(BigInt(counter++));
      block = crypto.createHash('sha256').update(key).update(counterBytes).digest(); offset = 0;
    }
    const result = block.readUInt32LE(offset) / 4294967296; offset += 4; return result;
  };
  random.float = (min, max) => min + random() * (max - min);
  random.int = (min, max) => Math.floor(random.float(min, max + 1));
  random.pick = values => values[Math.floor(random() * values.length)];
  random.weighted = entries => { let value = random() * entries.reduce((sum, entry) => sum + entry[1], 0); for (const entry of entries) { value -= entry[1]; if (value < 0) return entry[0]; } return entries.at(-1)[0]; };
  return random;
}
function bounded(value, fallback, cap) { return Number.isFinite(value) ? Math.max(0, Math.min(cap, Math.floor(value))) : Math.min(cap, fallback); }
function normalizeBudgets(input = {}, defaults = {}) {
  const fallback = { monsters: 260, stones: 32, alphas: 8, bosses: 1, resources: 0, ...defaults };
  return Object.fromEntries(Object.keys(HARD_BUDGETS).map(key => [key, bounded(input[key], fallback[key], HARD_BUDGETS[key])]));
}
function sampleAnnulus(random, cx, cy, min, max) {
  if (!(min >= 0 && max >= min)) throw new RangeError('Invalid annulus');
  const angle = random() * Math.PI * 2, radius = Math.sqrt(min * min + random() * (max * max - min * min));
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}
function segmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}
function separation(a, b, spacing = SPACING) { return Math.max(spacing[a.kind], spacing[b.kind], a.radius + b.radius + 20); }
function inBounds(point, boundary, radius = 0) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  if (point.x < boundary.margin + radius || point.y < boundary.margin + radius || point.x > boundary.width - boundary.margin - radius || point.y > boundary.height - boundary.margin - radius) return false;
  const distance = Math.hypot(point.x - boundary.cx, point.y - boundary.cy);
  if (distance < boundary.min + radius) return false;
  return boundary.shape !== 'annulus' || distance <= boundary.max - radius;
}
function boundaryFor(zone, area) {
  const boundary = { shape: zone.outer ? 'square' : 'annulus', width: area.w, height: area.h, cx: area.cx - (area.x0 || 0), cy: area.cy - (area.y0 || 0), min: Math.max(0, zone.min || 0), max: zone.max, margin: 30 };
  if (![boundary.width, boundary.height, boundary.cx, boundary.cy, boundary.min].every(Number.isFinite) || boundary.width <= 0 || boundary.height <= 0 || (boundary.shape === 'annulus' && (!Number.isFinite(boundary.max) || boundary.max <= boundary.min))) throw new RangeError('Invalid region boundary');
  return boundary;
}
function generateSpawnPlan({ seed, tier, generatorVersion = VERSION, zone, area, budgets: options, spacing: customSpacing = {}, protectedAreas = [], dangerSpec, progressionVersion = 0, generationAttempt = 0 }) {
  if (generatorVersion !== VERSION) throw new RangeError('Spawn plans require generator v2');
  if (!Number.isSafeInteger(tier) || tier < 1) throw new RangeError('Invalid region tier');
  if (!Number.isSafeInteger(generationAttempt) || generationAttempt < 0) throw new RangeError('Invalid generation attempt');
  // Attempt zero is byte-for-byte the original stream. Retries change placement
  // domains, never the universe seed, descriptor, danger spec or frozen history.
  const attemptStream = (version, purpose, id = '') => stream(seed, tier, version, purpose,
    generationAttempt ? JSON.stringify(['generation-attempt-v1', generationAttempt, String(id)]) : id);
  const boundary = boundaryFor(zone, area), families = [...new Set(zone.types)].sort();
  if (!families.length) throw new RangeError('A region needs monster families');
  const budgets = normalizeBudgets(options, { monsters: typeof zone.count === 'number' ? zone.count : 800, stones: zone.stones || 0, alphas: zone.alphas || 0, bosses: Math.min(2, new Set(zone.bosses || []).size) });
  if (zone.worldBoss) budgets.bosses = Math.max(1, budgets.bosses);
  const spacing = Object.fromEntries(Object.entries(SPACING).map(([key, value]) => [key, Number.isFinite(customSpacing[key]) ? Math.max(40, Math.min(1000, customSpacing[key])) : value]));
  const maxSpacing = Math.max(...Object.values(spacing), 2 * RADII.boss + 20);
  const exclusions = [{ id: 'settlement', kind: 'safe', x: boundary.cx, y: boundary.cy, radius: 400 }, ...protectedAreas.map(point => ({ ...point }))];
  if (exclusions.some(point => ![point.x, point.y, point.radius].every(Number.isFinite) || point.radius < 0)) throw new RangeError('Invalid protected area');
  const roadLength = boundary.shape === 'annulus' ? Math.min(boundary.max, Math.min(boundary.width, boundary.height) / 2 - 40) : Math.min(boundary.width, boundary.height) / 2 - 40;
  const roads = Array.from({ length: 4 }, (_, i) => { const angle = i * Math.PI / 2; return { from: { x: boundary.cx, y: boundary.cy }, to: { x: boundary.cx + Math.cos(angle) * roadLength, y: boundary.cy + Math.sin(angle) * roadLength }, width: 24 }; });
  const geography = dangerSpec ? require('./danger-geography') : null;
  const danger = geography ? geography.materializeDanger(dangerSpec, boundary, exclusions) : null;
  let safeRoutes = [];
  const index = new SpatialIndex(600), encounters = [], spawns = [], failures = [], metrics = { attempts: 0, memberFailures: 0 };
  function permitted(point, radius) { return inBounds(point, boundary, radius) && exclusions.every(exclusion => Math.hypot(point.x - exclusion.x, point.y - exclusion.y) >= exclusion.radius + radius); }
  const coverage = attemptStream(VERSION, 'coverage'), anglePhase = coverage() * Math.PI * 2;
  const cells = Array.from({ length: 16 }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) { const j = coverage.int(0, i); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  function candidate(random, slot, attempt) {
    if (boundary.shape === 'annulus') {
      const point = sampleAnnulus(random, boundary.cx, boundary.cy, boundary.min, boundary.max);
      if (slot !== undefined && attempt < 64) {
        const angle = anglePhase + (slot % 12 + random()) * Math.PI * 2 / 12;
        const radius = Math.hypot(point.x - boundary.cx, point.y - boundary.cy);
        point.x = boundary.cx + Math.cos(angle) * radius; point.y = boundary.cy + Math.sin(angle) * radius;
      }
      return point;
    }
    if (slot !== undefined && attempt < 64) {
      const cell = cells[slot % 16], w = boundary.width / 4, h = boundary.height / 4;
      return { x: (cell % 4 + random()) * w, y: (Math.floor(cell / 4) + random()) * h };
    }
    return { x: random() * boundary.width, y: random() * boundary.height };
  }
  function place(kind, number, count, type) {
    const id = kind + ':' + number, random = attemptStream(VERSION, kind === 'camp' ? 'camps' : kind === 'stone' ? 'stones' : kind === 'boss' ? 'bosses' : kind === 'resource' ? 'resources' : 'elites', id);
    for (let attempt = 0; attempt < 192; attempt++) {
      metrics.attempts++;
      const point = candidate(random, kind === 'boss' ? undefined : number, attempt), encounter = { id, kind, ...point, radius: RADII[kind], affixes: [], spawnIds: [] };
      if (!permitted(point, encounter.radius)) continue;
      if (danger && !geography.placementAllowed(danger, kind, point)) continue;
      if (safeRoutes.some(route => route.to !== id && route.points.some((end, i) => i && segmentDistance(point, route.points[i - 1], end) < route.width + encounter.radius))) continue;
      if (roads.some(road => segmentDistance(point, road.from, road.to) < road.width + encounter.radius)) continue;
      if (index.query(point, maxSpacing).some(other => Math.hypot(point.x - other.x, point.y - other.y) < separation(encounter, other, spacing))) continue;
      encounters.push(encounter); index.update(encounter);
      if (kind !== 'resource') {
        const members = attemptStream(VERSION, 'members', id), stats = attemptStream(VERSION, 'spawn-stats', id), family = type || members.pick(families);
        for (let i = 0; i < count; i++) {
          let member = point;
          if (kind === 'camp') {
            member = null;
            for (let retry = 0; retry < 32; retry++) {
              const angle = members() * Math.PI * 2, radius = Math.sqrt(members()) * encounter.radius;
              const proposed = { x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius };
              if (permitted(proposed, 15)) { member = proposed; break; }
            }
          }
          if (!member) { metrics.memberFailures++; continue; }
          const spawn = { id: id + ':' + i, encounterId: id, kind, type: kind === 'camp' && members() >= .75 ? members.pick(families) : family, x: member.x, y: member.y, alpha: kind === 'alpha' };
          const minLevel = Math.max(1, Math.min(10000, zone.lv[0])), maxLevel = Math.max(minLevel, Math.min(10000, zone.lv[1]));
          const rule = zone.levelRules?.[spawn.type];
          if (kind === 'stone') spawn.level = zone.generated ? minLevel : Math.max(1, Math.min(10000, rule?.level || minLevel));
          else if (rule && !zone.scale && rule.level >= minLevel) spawn.level = Math.min(10000, rule.level);
          else spawn.level = Math.max(rule?.level || minLevel, stats.int(kind === 'boss' && zone.scale ? maxLevel : minLevel, Math.min(10000, maxLevel + (kind === 'boss' && zone.scale ? 5 : 0))));
          encounter.spawnIds.push(spawn.id); spawns.push(spawn);
        }
      }
      return encounter;
    }
    failures.push({ kind, id }); return null;
  }
  // Major arenas are reserved before camps. Optional encounters are dropped rather than violating spacing.
  const bossTypes = [...new Set(zone.bosses || [])].sort();
  const bosses = (zone.worldBoss ? [zone.worldBoss, ...bossTypes.filter(type => type !== zone.worldBoss)] : bossTypes).slice(0, budgets.bosses);
  for (let i = 0; i < bosses.length; i++) if (!place('boss', i, 1, bosses[i])) throw new Error('Required boss arena cannot be placed: ' + bosses[i]);
  const routePlan = danger ? { danger, boundary, encounters, portal: zone.portal, settlement: { id: 'settlement', x: boundary.cx, y: boundary.cy }, paths: [] } : null;
  if (routePlan) { geography.buildRoutes(routePlan); safeRoutes = routePlan.paths.filter(path => path.kind === 'safe'); }
  for (let remaining = budgets.monsters, i = 0; remaining > 0; i++) {
    const count = Math.min(remaining, attemptStream(VERSION, 'camp-size', i).int(4, 6));
    place('camp', i, count); remaining -= count;
  }
  for (let i = 0; i < budgets.alphas; i++) place('alpha', i, 1);
  for (let i = 0; i < budgets.stones; i++) place('stone', i, 1, zone.stone || 'stone');
  for (let i = 0; i < budgets.resources; i++) place('resource', i, 0);
  const settlement = { id: 'settlement', x: boundary.cx, y: boundary.cy };
  const paths = encounters.filter(encounter => encounter.kind === 'boss').map(encounter => ({ from: settlement.id, to: encounter.id, points: [{ x: settlement.x, y: settlement.y }, { x: encounter.x, y: encounter.y }] }));
  const plan = { version: VERSION, tier, boundary, budgets, spacing, protectedAreas: exclusions, settlement, roads, paths: routePlan ? routePlan.paths : paths, ...(danger ? { danger, portal: routePlan.portal, routeRepairs: routePlan.routeRepairs } : {}), requiredLocations: bosses.map((type, i) => ({ id: 'boss:' + i, type })), encounters, spawns, failures, metrics, difficulty: { worldAffixes: [], encounterAffixes: [], combatAffixes: [], anomalies: { enabled: false, budget: 1 } } };
  if (zone.generated && progressionVersion) {
    const progression = require('./progression-generation');
    if (progressionVersion !== progression.POLICY_VERSION) throw new RangeError('Unsupported progression policy: ' + progressionVersion);
    progression.assignProgression(plan, zone.lv, attemptStream(progressionVersion, 'progression-levels'));
  }
  if (generationAttempt) plan.generationAttempt = generationAttempt;
  return plan;
}
function validateSpawnPlan(plan) {
  const errors = [], seen = new Set(), index = new SpatialIndex(600), maxSpacing = Math.max(...Object.values(plan.spacing), 1000);
  for (const encounter of plan.encounters) {
    if (!inBounds(encounter, plan.boundary, encounter.radius)) errors.push('encounter-boundary:' + encounter.id);
    if (plan.protectedAreas.some(area => Math.hypot(encounter.x - area.x, encounter.y - area.y) < area.radius + encounter.radius - 1e-7)) errors.push('protected:' + encounter.id);
    for (const other of index.query(encounter, maxSpacing)) if (Math.hypot(encounter.x - other.x, encounter.y - other.y) < separation(encounter, other, plan.spacing) - 1e-7) errors.push('spacing:' + encounter.id);
    index.update(encounter);
  }
  const counts = { monsters: 0, stones: 0, alphas: 0, bosses: 0, resources: plan.encounters.filter(e => e.kind === 'resource').length };
  for (const spawn of plan.spawns) {
    if (seen.has(spawn.id)) errors.push('duplicate:' + spawn.id); seen.add(spawn.id);
    if (!inBounds(spawn, plan.boundary)) errors.push('spawn-boundary:' + spawn.id);
    if (plan.protectedAreas.some(area => Math.hypot(spawn.x - area.x, spawn.y - area.y) < area.radius - 1e-7)) errors.push('spawn-protected:' + spawn.id);
    counts[spawn.kind === 'camp' ? 'monsters' : spawn.kind === 'stone' ? 'stones' : spawn.kind === 'alpha' ? 'alphas' : 'bosses']++;
  }
  for (const key of Object.keys(counts)) if (counts[key] > plan.budgets[key]) errors.push('budget:' + key);
  for (const required of plan.requiredLocations || []) if (!plan.encounters.some(encounter => encounter.id === required.id && encounter.kind === 'boss') || !plan.spawns.some(spawn => spawn.encounterId === required.id && spawn.type === required.type)) errors.push('missing-required:' + required.id);
  for (const boss of plan.encounters.filter(encounter => encounter.kind === 'boss')) {
    const path = plan.paths.find(path => path.from === 'settlement' && path.to === boss.id);
    if (!path || path.points.length < 2 || Math.hypot(path.points[0].x - plan.settlement.x, path.points[0].y - plan.settlement.y) > 1e-7 || path.points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x > plan.boundary.width || point.y > plan.boundary.height) || Math.hypot(path.points.at(-1).x - boss.x, path.points.at(-1).y - boss.y) > 1e-7) errors.push('unreachable:' + boss.id);
  }
  if (plan.danger) {
    const geography = require('./danger-geography');
    errors.push(...geography.validateRoutes(plan).errors);
    for (const encounter of plan.encounters) {
      // Bosses add their own threat after placement; their approach remains deliberately HIGH.
      if (encounter.kind !== 'boss' && !geography.placementAllowed(plan.danger, encounter.kind, encounter)) errors.push('danger-placement:' + encounter.id);
    }
  }
  const progression = plan.progression ? require('./progression-generation').validateProgression(plan) : undefined;
  if (progression) errors.push(...progression.errors.map(error => 'progression:' + error));
  return { valid: errors.length === 0, errors, counts, ...(progression ? { progression } : {}) };
}
module.exports = { VERSION, HARD_BUDGETS, SPACING, stream, sampleAnnulus, normalizeBudgets, generateSpawnPlan, validateSpawnPlan, segmentDistance };
