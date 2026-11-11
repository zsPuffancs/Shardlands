'use strict';
// Authoritative local geometry and encounter inputs shared by gameplay and the Atlas.
const { TIERS, MOBTYPES } = require('./monsters');
const { W, H, CX, CY, REGION_SIZE, REGION_SAFE_RADIUS, npcPosition } = require('./game-world');
const { generateSpawnPlan, validateSpawnPlan } = require('./world-generation');
const FOUNDING_TIERS = 7, MAX_ATLAS_TIER = 65542;
const STONE_FOR = { fire: 'emberstone', frost: 'froststone', void: 'voidstone', beast: 'jadestone', war: 'bonestone', undead: 'bonestone' };
function regionGeometry(tier) { return tier <= FOUNDING_TIERS ? { x0: 0, y0: 0, w: W, h: H, cx: CX, cy: CY } : { x0: 0, y0: 0, w: REGION_SIZE, h: REGION_SIZE, cx: REGION_SIZE / 2, cy: REGION_SIZE / 2 }; }
function frontierZone(record, area) {
  const families = record.families.filter(type => MOBTYPES[type]);
  return { name: record.name, min: REGION_SAFE_RADIUS, max: 99999, lv: record.levels.slice(), types: families.length ? families : ['voidknight'], bosses: [record.worldBoss.type], worldBoss: record.worldBoss.type, bossCount: 1, count: 260, stones: record.stones, stone: STONE_FOR[record.element] || 'doomstone', alphas: 8, scale: true, outer: true, generated: true, area };
}
function buildRegionPlan(state, record, zone, area) {
  if (state.generatorVersion !== 2) throw new RangeError('Legacy v1 has no authoritative saved encounter plan.');
  zone = zone || (record.tier <= FOUNDING_TIERS ? TIERS[record.tier - 1] : frontierZone(record, area || regionGeometry(record.tier)));
  area = area || regionGeometry(record.tier);
  const portal = npcPosition(area, 'portal');
  const levelRules = Object.fromEntries([...zone.types, ...(zone.bosses || []), zone.stone || 'stone'].map(type => [type, { level: MOBTYPES[type]?.lvl || (type === record.worldBoss.type ? MOBTYPES[record.worldBoss.archetype]?.lvl : 0) || zone.lv[0] }]));
  const plan = generateSpawnPlan({ seed: state.seed, tier: record.tier, zone: { ...zone, portal: { id: 'portal', x: portal.x - area.x0, y: portal.y - area.y0 }, worldBoss: record.worldBoss.type, levelRules }, area, budgets: state.generationSettings?.budgets, spacing: state.generationSettings?.spacing, dangerSpec: record.dangerSpec });
  const validation = validateSpawnPlan(plan);
  if (!validation.valid) throw new Error('Invalid spawn plan: ' + validation.errors.slice(0, 5).join(', '));
  return plan;
}
module.exports = { FOUNDING_TIERS, MAX_ATLAS_TIER, regionGeometry, frontierZone, buildRegionPlan };
