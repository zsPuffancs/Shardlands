'use strict';

const { TIERS } = require('./monsters');

const W = 10600, H = 10600, CX = 5300, CY = 5300, VILLAGE = 220;
// Keep the NPCs in the open plaza, clear of the stall and smithy roofs.
const NPCS = {
  merchant: { x: CX - 12, y: CY - 65, name: 'Merchant' },
  smith: { x: CX + 104, y: CY + 58, name: 'Blacksmith' },
  mystic: { x: CX - 58, y: CY + 122, name: 'Soul Mystic' },
};
const NPC_RANGE = 210;
// The World Portal stands in the centre of every village once a region beyond the founding lands is open.
const PORTAL = { x: CX, y: CY + 62, name: 'World Portal' };

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
function npcPosition(map, key) {
  const npc = key === 'portal' ? PORTAL : NPCS[key];
  return { x: map.cx + npc.x - CX, y: map.cy + npc.y - CY, name: npc.name };
}

const rnd = (a, b) => a + Math.random() * (b - a), rint = (a, b) => Math.floor(rnd(a, b + 1)), pick = a => a[Math.floor(Math.random() * a.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function nearNpc(p, k) {
  if (k === 'portal' && !portalOpen()) return false;
  const npc = npcPosition(mapOf(p), k);
  return Math.hypot(p.x - npc.x, p.y - npc.y) <= NPC_RANGE;
}
const inVillage = entity => { const map = mapOf(entity); return Math.hypot(entity.x - map.cx, entity.y - map.cy) < VILLAGE; };
const clampWorld = entity => { const map = mapOf(entity); entity.x = Math.max(map.x0 + 20, Math.min(map.x0 + map.w - 20, entity.x)); entity.y = Math.max(map.y0 + 20, Math.min(map.y0 + map.h - 20, entity.y)); };
// Put an entity on the arrival spot of a village (its own map's village unless another map is given).
function placeInVillage(entity, map) { map = map || mapOf(entity); entity.x = map.cx + rnd(-50, 50); entity.y = map.cy + rnd(30, 95); }
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
function worldInfo(map) {
  map = map || maps[0];
  const local = key => { const npc = npcPosition(map, key); return { x: npc.x - map.x0, y: npc.y - map.y0, name: npc.name }; };
  const npcs = {}; for (const key in NPCS) npcs[key] = local(key); if (portalOpen()) npcs.portal = local('portal');
  const zones = map.index === 0 ? TIERS.filter(t => !t.generated).map(t => ({ name: t.name, min: t.min, max: t.max, lv: t.lv, outer: !!t.outer }))
    : [{ name: TIERS[map.tier].name, min: REGION_SAFE_RADIUS, max: 99999, lv: TIERS[map.tier].lv, outer: false, look: map.look, generated: true }];
  return { universe: universeIdentity(), map: map.index, maps: maps.length, W: map.w, H: map.h, CX: map.cx - map.x0, CY: map.cy - map.y0, V: VILLAGE, npcs, npcRange: NPC_RANGE, tiers: zones };
}

module.exports = { W, H, CX, CY, VILLAGE, NPCS, NPC_RANGE, REGION_SAFE_RADIUS, maps, addMap, mapAt, mapOf, portalOpen, npcPosition, placeInVillage, rnd, rint, pick, dist, nearNpc, inVillage, clampWorld, moveToward, tierOf, worldInfo, attachUniverse };
