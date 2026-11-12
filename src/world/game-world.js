'use strict';

const { TIERS, WORLD_BOSS_SIZE } = require('../combat/monsters');
const { ENEMY_SCALING, worldFactor } = require('../combat/enemy-scaling');
const { XP_BALANCE } = require('../progression/xp-economy');
const Settlement = require('../../public/settlement');
const { settlementConstructionCosts } = require('../economy/settlement-economy');

const W = 10600, H = 10600, CX = 5300, CY = 5300, VILLAGE = Settlement.SAFE_RADIUS.village;
// The founding village (map 0) uses the Grand Circle layout. Other maps place their NPCs by their own layout.
const FOUNDING_LAYOUT = 'grand';
const NPC_NAMES = { merchant: 'Merchant', smith: 'Blacksmith', mystic: 'Soul Mystic', portal: 'World Portal' };
const foundingSpots = Settlement.layout('village', 'timber', {}, FOUNDING_LAYOUT).npcSpots;
const NPCS = Object.fromEntries(Settlement.VENDORS.map(key => [key, { x: CX + foundingSpots[key].x, y: CY + foundingSpots[key].y, name: NPC_NAMES[key] }]));
const NPC_RANGE = 210;
// The World Portal stands at the exact centre of every settlement once a region beyond the founding lands is open.
const PORTAL = { x: CX + Settlement.PORTAL.x, y: CY + Settlement.PORTAL.y, name: NPC_NAMES.portal };

// ---------- maps ----------
// Every map lives in its own square of one shared coordinate plane, far away from the others,
// so all distance checks keep working unchanged. Map 0 is the founding world at the origin.
// Clients never see these offsets: they always get coordinates local to their own map.
const MAP_SPACING = 16000, MAPS_PER_ROW = 32, REGION_SIZE = 5000, REGION_SAFE_RADIUS = 400;
const maps = [{ index: 0, x0: 0, y0: 0, w: W, h: H, cx: CX, cy: CY }];
function addMap(index, info) {
  const x0 = (index % MAPS_PER_ROW) * MAP_SPACING, y0 = Math.floor(index / MAPS_PER_ROW) * MAP_SPACING;
  return maps[index] = { index, x0, y0, w: REGION_SIZE, h: REGION_SIZE, cx: x0 + REGION_SIZE / 2, cy: y0 + REGION_SIZE / 2, ...info };
}
function mapAt(x, y) {
  const column = Math.floor(x / MAP_SPACING), row = Math.floor(y / MAP_SPACING);
  return (column >= 0 && column < MAPS_PER_ROW && row >= 0 && maps[row * MAPS_PER_ROW + column]) || maps[0];
}
const mapOf = entity => mapAt(entity.x, entity.y);
const portalOpen = () => maps.length > 1;
// Where an NPC stands on a map (world coordinates), and which way it faces (towards the portal).
// Anything without a settlement (e.g. a region geometry used for planning) falls back to the founding positions.
function npcPosition(map, key) {
  if (key === 'portal') return { x: map.cx + Settlement.PORTAL.x, y: map.cy + Settlement.PORTAL.y, name: NPC_NAMES.portal, yaw: 0 };
  const spot = (map.layout || map.settlement ? layoutOf(map).npcSpots[key] : null) || foundingSpots[key];
  return { x: map.cx + spot.x, y: map.cy + spot.y, name: NPC_NAMES[key], yaw: spot.yaw };
}

const rnd = (a, b) => a + Math.random() * (b - a), rint = (a, b) => Math.floor(rnd(a, b + 1)), pick = a => a[Math.floor(Math.random() * a.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// What stands at a map's centre: a village, an encampment players build, or only the portal.
function setSettlement(map, record) {
  map.settlement = record || { kind: 'village', style: 'timber', built: {}, layout: FOUNDING_LAYOUT };
  map.layout = Settlement.layout(map.settlement.kind, map.settlement.style, map.settlement.built, map.settlement.layout, map.settlement.stalls);
}
const layoutOf = map => map.layout || (setSettlement(map), map.layout);
// Is this NPC on the map? The portal is everywhere once open; an encampment only has the stalls players built.
function npcAvailable(map, k) {
  if (k === 'portal') return portalOpen();
  const lay = layoutOf(map);
  if (k === 'camp') return !!lay.board; // the encampment board, or the stall board of a village without vendors
  return !!lay.npcs[k];
}
function nearNpc(p, k) {
  const map = mapOf(p);
  if (!npcAvailable(map, k)) return false;
  const npc = k === 'camp' ? boardPosition(map) : npcPosition(map, k);
  return Math.hypot(p.x - npc.x, p.y - npc.y) <= NPC_RANGE;
}
// Where the stall board stands (world coordinates), for camps and villages without vendors.
const boardPosition = map => { const b = layoutOf(map).board || Settlement.CAMP_BOARD; return { x: map.cx + b.x, y: map.cy + b.y }; };
const inVillage = entity => { const map = mapOf(entity); return Math.hypot(entity.x - map.cx, entity.y - map.cy) < layoutOf(map).safe; };
// Keep players and monsters out of houses, stalls and the village wall. prev is where the entity was before moving.
const collideSettlement = (entity, prev, radius) => { const map = mapOf(prev || entity); return Settlement.moveWithCollision(entity, layoutOf(map), map.cx, map.cy, radius, prev); };
const clampWorld = (entity, map = mapOf(entity)) => { entity.x = Math.max(map.x0 + 20, Math.min(map.x0 + map.w - 20, entity.x)); entity.y = Math.max(map.y0 + 20, Math.min(map.y0 + map.h - 20, entity.y)); };
// Put an entity on the arrival spot of a village (its own map's village unless another map is given).
// Arrival spots are on the portal plaza, just south of the portal and clear of everything (settlement.js arrivalPoint).
function placeInVillage(entity, map) { map = map || mapOf(entity); const spot = Settlement.arrivalPoint(layoutOf(map)); entity.x = map.cx + spot.x; entity.y = map.cy + spot.y; }
function moveToward(entity, targetX, targetY, speed, deltaTime) { const offsetX = targetX - entity.x, offsetY = targetY - entity.y, distance = Math.hypot(offsetX, offsetY); if (distance < 1) return 0; const s = Math.min(distance, speed * deltaTime); entity.x += offsetX / distance * s; entity.y += offsetY / distance * s; return distance; }
const tierOf = (x, y) => {
  const map = mapAt(x, y); if (map.index > 0) return map.tier;
  const distance = Math.hypot(x - CX, y - CY); let last = 0;
  for (let i = 0; i < TIERS.length; i++) { if (TIERS[i].generated) continue; last = i; if (distance < TIERS[i].max) return i; }
  return last;
};
let universeIdentity = () => null;
const attachUniverse = provider => { universeIdentity = provider; };
// The world as one client sees it: always in coordinates local to that map.
function worldInfo(map, { monsterPolicy, combatPolicy } = {}) {
  map = map || maps[0];
  const local = key => { const npc = npcPosition(map, key); return { x: npc.x - map.x0, y: npc.y - map.y0, name: npc.name, yaw: npc.yaw }; };
  const npcs = {}; for (const key in NPCS) if (npcAvailable(map, key)) npcs[key] = local(key); if (portalOpen()) npcs.portal = local('portal');
  if (npcAvailable(map, 'camp')) { const b = boardPosition(map); npcs.camp = { x: b.x - map.x0, y: b.y - map.y0, name: layoutOf(map).kind === 'camp' ? 'Encampment board' : 'Village board' }; }
  const settlement = { kind: layoutOf(map).kind, style: layoutOf(map).style, layout: layoutOf(map).layout, stalls: !!(map.settlement && map.settlement.stalls), built: (map.settlement && map.settlement.built) || {}, cost: settlementConstructionCosts(map.settlement),
    funds: Object.fromEntries(Object.entries((map.settlement && map.settlement.funds) || {}).map(([key, fund]) => [key, fund.donors])) };
  const zones = map.index === 0 ? TIERS.filter(t => !t.generated).map(t => ({ name: t.name, min: t.min, max: t.max, lv: t.lv, outer: !!t.outer }))
    : [{ name: TIERS[map.tier].name, min: REGION_SAFE_RADIUS, max: 99999, lv: TIERS[map.tier].lv, outer: false, look: map.look, generated: true }];
  const depth = worldFactor(map.regionTier || 1, monsterPolicy);
  const scaling = { worldHp: depth.hp, worldDamage: depth.dmg, worldBossSize: WORLD_BOSS_SIZE, bossHp: ENEMY_SCALING.categories.boss.hp, worldBossHp: ENEMY_SCALING.categories.worldBoss.hp,
    partyHp: ENEMY_SCALING.partyHpPerMember, partyDamage: XP_BALANCE.partyDamagePerMember, punishBonus: combatPolicy?.recoveryDamageMultiplier ?? ENEMY_SCALING.boss.punishBonus };
  return { universe: universeIdentity(), map: map.index, maps: maps.length, W: map.w, H: map.h, CX: map.cx - map.x0, CY: map.cy - map.y0, V: layoutOf(map).safe, settlement, npcs, npcRange: NPC_RANGE, tiers: zones, scaling };
}

module.exports = { boardPosition, FOUNDING_LAYOUT, setSettlement, layoutOf, npcAvailable, collideSettlement, W, H, CX, CY, VILLAGE, NPCS, NPC_RANGE, REGION_SIZE, REGION_SAFE_RADIUS, maps, addMap, mapAt, mapOf, portalOpen, npcPosition, placeInVillage, rnd, rint, pick, dist, nearNpc, inVillage, clampWorld, moveToward, tierOf, worldInfo, attachUniverse };
