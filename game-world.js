'use strict';

const { TIERS } = require('./monsters');

const W = 10600, H = 10600, CX = 5300, CY = 5300, VILLAGE = 220;
// Keep the NPCs in the open plaza, clear of the stall and smithy roofs.
const NPCS = {
  merchant: { x: CX - 12, y: CY - 65, name: 'Merchant' },
  smith: { x: CX + 104, y: CY + 58, name: 'Blacksmith' },
};
const NPC_RANGE = 210;

const rnd = (a, b) => a + Math.random() * (b - a), rint = (a, b) => Math.floor(rnd(a, b + 1)), pick = a => a[Math.floor(Math.random() * a.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const nearNpc = (p, k) => Math.hypot(p.x - NPCS[k].x, p.y - NPCS[k].y) <= NPC_RANGE;
const inVillage = entity => Math.hypot(entity.x - CX, entity.y - CY) < VILLAGE;
const clampWorld = entity => { entity.x = Math.max(20, Math.min(W - 20, entity.x)); entity.y = Math.max(20, Math.min(H - 20, entity.y)); };
function moveToward(entity, targetX, targetY, speed, deltaTime) { const offsetX = targetX - entity.x, offsetY = targetY - entity.y, distance = Math.hypot(offsetX, offsetY); if (distance < 1) return 0; const s = Math.min(distance, speed * deltaTime); entity.x += offsetX / distance * s; entity.y += offsetY / distance * s; return distance; }
const tierOf = (x, y) => { const distance = Math.hypot(x - CX, y - CY); for (let i = 0; i < TIERS.length; i++) if (distance < TIERS[i].max) return i; return TIERS.length - 1; };
const worldInfo = () => ({ W, H, CX, CY, V: VILLAGE, npcs: NPCS, npcRange: NPC_RANGE, tiers: TIERS.map(t => ({ name: t.name, min: t.min, max: t.max, lv: t.lv, outer: !!t.outer })) });

module.exports = { W, H, CX, CY, VILLAGE, NPCS, NPC_RANGE, rnd, rint, pick, dist, nearNpc, inVillage, clampWorld, moveToward, tierOf, worldInfo };
