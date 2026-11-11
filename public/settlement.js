'use strict';
// Settlements: the village, encampment or bare portal site at the centre of every map.
// Shared by the server (collision, which NPCs exist) and the client (what is drawn), so both always agree.
// All positions are relative to the map centre: +x east, +y south (the client's z axis).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Settlement = api;
}(typeof self !== 'undefined' ? self : this, function () {
  // NPC spots are the same in every settlement; only what stands around them changes.
  const NPC_OFFSETS = { merchant: { x: -12, y: -65 }, smith: { x: 104, y: 58 }, mystic: { x: -58, y: 122 } };
  const PORTAL_OFFSET = { x: 0, y: 62 };
  // On an encampment the stalls are built by players. The board stands where the plaza would be.
  const CAMP_BOARD = { x: 62, y: -48 };
  const STALL_COST = { merchant: 250000, smith: 400000, mystic: 400000 };
  const STALL_NAMES = { merchant: "Merchant's stall", smith: "Blacksmith's forge", mystic: "Soul Mystic's tent" };
  const SAFE_RADIUS = { village: 220, camp: 170, none: 95 };
  const WALL = { r: 214, thickness: 9, gateHalfWidth: 42 };
  const GATES = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];

  // Houses stand between the four roads, turned to face the plaza, clear of every NPC.
  const HOUSE_RING = [
    { a: 0.84, r: 168, w: 52, d: 40 }, { a: 1.19, r: 170, w: 46, d: 38 },
    { a: 2.53, r: 168, w: 54, d: 40 }, { a: 2.71, r: 172, w: 44, d: 36 },
    { a: 3.58, r: 168, w: 56, d: 42 }, { a: 4.15, r: 170, w: 48, d: 38 },
    { a: 5.24, r: 168, w: 52, d: 40 }, { a: 5.76, r: 170, w: 46, d: 38 },
  ];
  const TENTS = [{ x: -150, y: -50, s: 1 }, { x: -120, y: -120, s: .85 }, { x: 140, y: -105, s: .9 }, { x: 150, y: 120, s: 1 }, { x: -150, y: 60, s: .8 }];
  const STALL_SPOTS = { merchant: { x: -12, y: -100, yaw: 0 }, smith: { x: 136, y: 68, yaw: -1.2 }, mystic: { x: -78, y: 152, yaw: 2.6 } };

  // kind: 'village' | 'camp' | 'none'; style: 'timber' | 'snow' | 'sandstone' | 'dark' | 'ember' | 'void'; built: stalls on a camp.
  function layout(kind, style, built) {
    built = built || {};
    const out = { kind, style, safe: SAFE_RADIUS[kind] || 220, houses: [], tents: [], stalls: [], stones: [], obstacles: [], wall: null, npcs: {} };
    if (kind === 'village') {
      out.wall = WALL;
      for (const h of HOUSE_RING) {
        const x = Math.cos(h.a) * h.r, y = Math.sin(h.a) * h.r, yaw = Math.atan2(-x, -y);
        out.houses.push({ x, y, w: h.w, d: h.d, yaw });
        out.obstacles.push({ type: 'rect', x, y, w: h.w + 6, d: h.d + 6, yaw });
      }
      out.obstacles.push({ type: 'rect', x: 0, y: -16, w: 56, d: 18, yaw: 0 });       // market stall
      out.forge = { x: 150, y: 40 };
      out.obstacles.push({ type: 'rect', x: 150, y: 40, w: 30, d: 24, yaw: 0 });      // smithy forge
      out.obstacles.push({ type: 'circle', x: -72, y: 68, r: 17 });                  // well
      for (const k in NPC_OFFSETS) out.npcs[k] = true;
    } else if (kind === 'camp') {
      for (const t of TENTS) { out.tents.push(t); out.obstacles.push({ type: 'circle', x: t.x, y: t.y, r: 26 * t.s }); }
      out.obstacles.push({ type: 'circle', x: 0, y: -8, r: 12 });                    // campfire
      for (const k in STALL_SPOTS) if (built[k]) {
        const s = STALL_SPOTS[k]; out.stalls.push({ key: k, ...s }); out.npcs[k] = true;
        out.obstacles.push({ type: 'rect', x: s.x, y: s.y, w: 44, d: 22, yaw: s.yaw });
      } else out.stalls.push({ key: k, ...STALL_SPOTS[k], site: true });
      out.board = CAMP_BOARD;
    } else {
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + .3, x = Math.cos(a) * 92, y = PORTAL_OFFSET.y - 20 + Math.sin(a) * 92; out.stones.push({ x, y, h: 26 + (i % 3) * 9 }); out.obstacles.push({ type: 'circle', x, y, r: 9 }); }
    }
    return out;
  }

  const inGate = angle => GATES.some(g => { let d = Math.abs(((angle - g) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI); return d * WALL.r < WALL.gateHalfWidth; });
  // Push an entity out of houses, stalls and the wall. Positions are world coordinates; cx, cy is the settlement centre.
  // prev (the position before this move) decides which side of the wall the entity belongs on.
  function collide(entity, lay, cx, cy, radius, prev) {
    if (!lay) return false;
    radius = radius || 10; let moved = false;
    const lx0 = entity.x - cx, ly0 = entity.y - cy;
    if (Math.abs(lx0) > 260 || Math.abs(ly0) > 260) return false;
    let lx = lx0, ly = ly0;
    for (const o of lay.obstacles) {
      if (o.type === 'circle') {
        const dx = lx - o.x, dy = ly - o.y, dist = Math.hypot(dx, dy), min = o.r + radius;
        if (dist < min) { const k = dist > 0.01 ? dx / dist : 1, j = dist > 0.01 ? dy / dist : 0; lx = o.x + k * min; ly = o.y + j * min; moved = true; }
      } else {
        const c = Math.cos(o.yaw), s = Math.sin(o.yaw), dx = lx - o.x, dy = ly - o.y;
        // the rect is drawn turned by yaw about the vertical axis: local u along its width, v along its depth
        const u = dx * c - dy * s, v = dx * s + dy * c, hw = o.w / 2 + radius, hd = o.d / 2 + radius;
        if (Math.abs(u) < hw && Math.abs(v) < hd) {
          let nu = u, nv = v; if (hw - Math.abs(u) < hd - Math.abs(v)) nu = Math.sign(u || 1) * hw; else nv = Math.sign(v || 1) * hd;
          lx = o.x + nu * c + nv * s; ly = o.y - nu * s + nv * c; moved = true;
        }
      }
    }
    if (lay.wall) {
      const d = Math.hypot(lx, ly), half = lay.wall.thickness / 2 + radius;
      if (Math.abs(d - lay.wall.r) < half && !inGate(Math.atan2(ly, lx))) {
        const wasInside = prev ? Math.hypot(prev.x - cx, prev.y - cy) < lay.wall.r : Math.hypot(lx0, ly0) < lay.wall.r, target = wasInside ? lay.wall.r - half : lay.wall.r + half;
        lx = lx / (d || 1) * target; ly = ly / (d || 1) * target; moved = true;
      }
    }
    if (moved) { entity.x = cx + lx; entity.y = cy + ly; }
    return moved;
  }

  // Which settlement a generated region gets. Fire and void lands only allow an encampment that players build;
  // other lands get a village, or sometimes nothing but the portal (never the first region beyond the founding lands).
  function choose(biome, tier, random) {
    const style = { glacier: 'snow', warfields: 'sandstone', necropolis: 'dark', wildwood: 'timber', volcanic: 'ember', voidscar: 'void' }[biome] || 'timber';
    if (biome === 'volcanic' || biome === 'voidscar') return { kind: 'camp', style };
    if (tier > 8 && random() < 0.3) return { kind: 'none', style };
    return { kind: 'village', style };
  }

  return { NPC_OFFSETS, PORTAL_OFFSET, CAMP_BOARD, STALL_COST, STALL_NAMES, SAFE_RADIUS, WALL, layout, collide, choose };
}));
