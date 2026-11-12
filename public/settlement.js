'use strict';
// Settlements: the village, encampment or bare portal site at the centre of every map.
// Shared by the server (collision, NPC positions, safe zone, arrival) and the client (what is drawn),
// so both always agree. All positions are relative to the map centre: +x east, +y south (the client's z axis).
//
// Every settlement has the World Portal at its exact centre (0, 0). Vendor NPCs stand around the portal plaza,
// facing the portal, with their cart (or, in an encampment, their stall) directly behind them: Portal -> NPC -> cart.
// Villages use one of eight layouts (LAYOUTS); the map's style (timber, snow, ...) only decides materials.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Settlement = api;
}(typeof self !== 'undefined' ? self : this, function () {
  const TAU = Math.PI * 2;
  // ---------- dimensions (change VILLAGE_SCALE to grow or shrink every village) ----------
  const VILLAGE_SCALE = 1.6;                      // 1 = the old village (wall radius 214)
  const BASE = Object.freeze({ wallR: 214, gateHalfWidth: 28, roadHalfWidth: 19, plazaR: 66, npcRing: 82 });
  const DIM = Object.freeze({
    wallR: Math.round(BASE.wallR * VILLAGE_SCALE),               // 342
    gateHalfWidth: Math.round(BASE.gateHalfWidth * VILLAGE_SCALE), // 45
    roadHalfWidth: Math.round(BASE.roadHalfWidth * VILLAGE_SCALE), // 30
    plazaR: Math.round(BASE.plazaR * VILLAGE_SCALE),             // 106
    npcRing: Math.round(BASE.npcRing * VILLAGE_SCALE),           // 131
    cartGap: 40,                                                  // NPC centre to cart centre
    cart: Object.freeze({ w: 42, d: 24 }),
    wallThickness: 10,
  });
  const SAFE_RADIUS = { village: DIM.wallR + 10, camp: 170, none: 95 };
  // Styles drawn with the dark-fantasy village kit (public/village-kit.js). Their bigger pieces are solid too:
  // the portal's two monoliths, the full vendor station around each cart, and the gate towers beside each road.
  const KIT_STYLES = ['timber', 'snow', 'sandstone', 'dark', 'ember', 'void']; // drawn by the village kit (public/village-kit.js), with its extra collision
  const KIT_STATION = Object.freeze({ w: 82, d: 26 });
  const KIT_PORTAL_FEET = Object.freeze([{ x: -46, y: 0, r: 13 }, { x: 46, y: 0, r: 13 }, { x: 0, y: -40, r: 12 }, { x: 0, y: 40, r: 12 }]); // two crossed gates
  // Kept for compatibility: the classic circular wall description.
  const WALL = { r: DIM.wallR, thickness: DIM.wallThickness, gateHalfWidth: DIM.gateHalfWidth };
  const GATES = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];        // east, south, west, north: the world's four roads
  const PORTAL = Object.freeze({ x: 0, y: 0 });
  const PORTAL_OFFSET = PORTAL;
  // On an encampment the stalls are built by players. The board stands near the fire.
  const CAMP_BOARD = { x: 62, y: -48 };
  const STALL_COST = { merchant: 250000, smith: 400000, mystic: 400000 };
  // Chance that a generated village starts without its vendors: the Merchant, Blacksmith and Soul Mystic then
  // come only when heroes buy their stalls at the village board (the encampment stall system, same prices).
  const UNSTAFFED_VILLAGE_CHANCE = 0.25;
  const STALL_NAMES = { merchant: "Merchant's stall", smith: "Blacksmith's forge", mystic: "Soul Mystic's tent" };
  const VENDORS = ['merchant', 'smith', 'mystic'];

  // ---------- geometry ----------
  const faceCentre = (x, y) => Math.atan2(-x, -y);       // yaw that turns local +v (front) towards the portal
  const polar = (a, r) => ({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  const angleDiff = (a, b) => { const d = ((a - b) % TAU + TAU * 1.5) % TAU - Math.PI; return Math.abs(d); };
  // Local frame of a rect: u along its width, v along its depth (v = front when yaw = faceCentre).
  const toLocal = (o, x, y) => { const c = Math.cos(o.yaw || 0), s = Math.sin(o.yaw || 0), dx = x - o.x, dy = y - o.y; return { u: dx * c - dy * s, v: dx * s + dy * c }; };
  const corners = o => { const c = Math.cos(o.yaw || 0), s = Math.sin(o.yaw || 0), hw = o.w / 2, hd = o.d / 2; return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => ({ x: o.x + u * c + v * s, y: o.y - u * s + v * c })); };
  function overlaps(a, b, margin = 0) {
    if (a.type === 'circle' && b.type === 'circle') return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + margin;
    if (a.type === 'circle' || b.type === 'circle') {
      const c = a.type === 'circle' ? a : b, r = a.type === 'circle' ? b : a, p = toLocal(r, c.x, c.y);
      const qu = Math.max(-r.w / 2, Math.min(r.w / 2, p.u)), qv = Math.max(-r.d / 2, Math.min(r.d / 2, p.v));
      return Math.hypot(p.u - qu, p.v - qv) < c.r + margin;
    }
    // two rotated rects: separating axis test
    const A = corners(a), B = corners(b);
    for (const o of [a, b]) for (const axis of [[Math.cos(o.yaw || 0), -Math.sin(o.yaw || 0)], [Math.sin(o.yaw || 0), Math.cos(o.yaw || 0)]]) {
      const pa = A.map(p => p.x * axis[0] + p.y * axis[1]), pb = B.map(p => p.x * axis[0] + p.y * axis[1]);
      if (Math.max(...pa) + margin <= Math.min(...pb) || Math.max(...pb) + margin <= Math.min(...pa)) return false;
    }
    return true;
  }
  const boundR = o => o.type === 'circle' ? o.r : Math.hypot(o.w, o.d) / 2;

  // ---------- walls ----------
  // A wall is a list of straight segments around the village (a circle is drawn as many short ones), with gaps at the gates.
  function buildWall({ shape = 'circle', sides = 8, r = DIM.wallR, thickness = DIM.wallThickness, gateHalfWidth = DIM.gateHalfWidth, fence }) {
    const rot = shape === 'polygon' ? Math.PI / sides : 0;
    const vertexAngles = shape === 'polygon' ? Array.from({ length: sides }, (_, k) => rot + k * TAU / sides) : [];
    // where the ray from the centre at angle a meets the wall
    const point = a => {
      if (shape !== 'polygon') return polar(a, r);
      const k = Math.floor((((a - rot) % TAU) + TAU) % TAU / (TAU / sides)), p0 = polar(rot + k * TAU / sides, r), p1 = polar(rot + (k + 1) * TAU / sides, r);
      const dx = Math.cos(a), dy = Math.sin(a), ex = p1.x - p0.x, ey = p1.y - p0.y, s = (p0.x * ey - p0.y * ex) / (dx * ey - dy * ex);
      return { x: dx * s, y: dy * s };
    };
    const inner = shape === 'polygon' ? r * Math.cos(Math.PI / sides) : r, gateA = gateHalfWidth / inner;
    const norm = a => ((a % TAU) + TAU) % TAU;
    const cuts = shape === 'polygon' ? vertexAngles.map(norm) : Array.from({ length: 72 }, (_, i) => i / 72 * TAU);
    for (const g of GATES) cuts.push(norm(g - gateA), norm(g + gateA));
    const sorted = [...new Set(cuts.map(a => Math.round(a * 1e9) / 1e9))].sort((x, y) => x - y), segments = [];
    const inGate = a => GATES.some(g => angleDiff(a, g) < gateA);
    for (let i = 0; i < sorted.length; i++) {
      const a0 = sorted[i], a1 = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + TAU;
      if (inGate((a0 + a1) / 2)) continue;
      const p = point(a0), q = point(a1); segments.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y });
    }
    // corner towers, except where a gate opens at a corner
    const towers = shape === 'polygon' ? vertexAngles.filter(a => !GATES.some(g => angleDiff(a, g) < gateA + 22 / inner)).map(a => ({ ...polar(a, r), r: 15 })) : [];
    return { shape, sides, rot, r, inner, thickness, gateHalfWidth, gates: GATES.slice(), segments, towers, fence };
  }
  const gateOpen = (wall, angle) => GATES.some(g => angleDiff(angle, g) * wall.inner < wall.gateHalfWidth);

  // ---------- layout builder ----------
  // Places buildings and props one by one; anything that would block a road, the plaza, an NPC or cart,
  // the wall, or another building is skipped, so every layout is valid by construction.
  let DEBUG = false;
  function builder(id, wall, opts = {}) {
    opts = { debug: DEBUG, ...opts };
    const lay = {
      kind: 'village', id, layout: id, safe: SAFE_RADIUS.village, wall, plazaR: opts.plazaR || DIM.plazaR, roadHalfWidth: opts.roadHalfWidth || DIM.roadHalfWidth,
      portal: { ...PORTAL }, npcSpots: {}, carts: [], houses: [], props: [], stones: [], tents: [], stalls: [], obstacles: [], npcs: {},
      roads: [], wide: opts.wide || {}, rejected: opts.debug ? [] : undefined, arrival: { angle: Math.PI / 2, spread: 0.45, r: [opts.arrivalMin || 52, 88] },
    };
    // Roads: from the plaza to each gate (a boulevard can be wider).
    for (const a of GATES) {
      const half = (lay.wide[Math.round(a / (Math.PI / 2)) % 4] || 1) * lay.roadHalfWidth, len = wall.r + 30;
      lay.roads.push({ angle: a, half, type: 'rect', x: Math.cos(a) * len / 2, y: Math.sin(a) * len / 2, w: half * 2, d: len, yaw: Math.PI / 2 - a });
    }
    const reserved = [{ type: 'circle', x: 0, y: 0, r: lay.plazaR }];
    // NPCs on the plaza ring facing the portal; their carts right behind them, also facing the portal.
    const npcAngles = opts.npcAngles || { merchant: -Math.PI * 0.75, smith: -Math.PI * 0.25, mystic: Math.PI * 0.75 };
    for (const key of VENDORS) {
      const a = npcAngles[key], n = polar(a, opts.npcRing || DIM.npcRing), c = polar(a, (opts.npcRing || DIM.npcRing) + DIM.cartGap);
      lay.npcSpots[key] = { x: n.x, y: n.y, yaw: faceCentre(n.x, n.y), angle: a };
      const cart = { key, type: 'rect', x: c.x, y: c.y, w: DIM.cart.w, d: DIM.cart.d, yaw: faceCentre(c.x, c.y) };
      lay.carts.push(cart); lay.obstacles.push(cart); lay.npcs[key] = true;
      // the whole vendor station (cart plus workstation either side, see KIT_STATION) stays clear in every style
      reserved.push({ type: 'circle', x: n.x, y: n.y, r: 18 }, { ...cart, w: KIT_STATION.w + 8, d: cart.d + 10 });
    }
    // furthest point of the shape from the centre must stay inside the wall
    const reach = o => o.type === 'circle' ? Math.hypot(o.x, o.y) + o.r : Math.max(...corners(o).map(p => Math.hypot(p.x, p.y)));
    const wallClear = (o, gap = 12) => reach(o) + gap < wall.inner - wall.thickness / 2;
    const onRoad = (o, gap = 6) => lay.roads.some(road => overlaps(o, road, gap));
    const reject = (o, why) => { if (lay.rejected) lay.rejected.push({ x: Math.round(o.x), y: Math.round(o.y), why }); return false; };
    function fits(o, { gap = 8, road = true, plaza = true } = {}) {
      if (!wallClear(o, Math.max(4, gap))) return reject(o, 'wall');
      if (road && onRoad(o)) return reject(o, 'road');
      if (reserved.some((r, i) => (plaza || i > 0) && overlaps(o, r, gap))) return reject(o, 'plaza/npc/cart');
      if (lay.obstacles.some(b => overlaps(o, b, gap))) return reject(o, 'building');
      if (lay.props.some(p => p.solid && overlaps(o, p.shape, gap))) return reject(o, 'prop');
      return true;
    }
    // A building: rect (w x d), turned to face the portal unless a yaw is given.
    // Each building keeps a hero-sized doorstep free in front of its door; nothing may be built on a doorstep.
    const doorsteps = [];
    function building(type, x, y, w, d, extra = {}) {
      const yaw = extra.yaw === undefined ? faceCentre(x, y) : extra.yaw, o = { type: 'rect', x, y, w: w + 6, d: d + 6, yaw };
      const step = { type: 'circle', x: x + Math.sin(yaw) * (d / 2 + 17), y: y + Math.cos(yaw) * (d / 2 + 17), r: 13 };
      if (!fits(o, extra)) return false;
      if (doorsteps.some(s => overlaps(o, s, 2))) return reject(o, 'doorstep');
      if (lay.obstacles.some(b2 => overlaps(step, b2, 0)) || lay.props.some(p => p.solid && overlaps(step, p.shape, 0)) || !wallClear(step, 0)) return reject(o, 'door blocked');
      lay.houses.push({ type, x, y, w, d, yaw, ...extra.look }); lay.obstacles.push(o); doorsteps.push(step); return true;
    }
    // A prop: decoration; solid ones get a collision circle or rect.
    function prop(type, x, y, extra = {}) {
      const r = extra.r || 0, solid = !!extra.solid;
      const shape = extra.w ? { type: 'rect', x, y, w: extra.w, d: extra.d, yaw: extra.yaw || 0 } : { type: 'circle', x, y, r: Math.max(1, r) };
      if (extra.check !== false && !fits(shape, { gap: extra.gap ?? 4, road: extra.road !== false, plaza: extra.plaza !== false })) return false;
      if (solid && doorsteps.some(s => overlaps(shape, s, 1))) return reject(shape, 'doorstep');
      const p = { type, x, y, ...extra, solid, shape };
      lay.props.push(p); if (solid) lay.obstacles.push(shape); return true;
    }
    const ring = (count, r, a0, fn) => { for (let i = 0; i < count; i++) { const a = a0 + i / count * TAU, p = polar(a, r); fn(p.x, p.y, a, i); } };
    // Evenly spaced spots between the roads: per spots in each quarter, keeping pad (half a building + gap) off the road edge.
    // size: the footprint ({ w, d }) or a radius, used to keep its inner corners off the roads.
    const quads = (r, per, size, fn, only) => {
      const w = typeof size === 'number' ? size * 2 : size.w + 6, d = typeof size === 'number' ? size * 2 : size.d + 6;
      const margin = h => Math.asin(Math.min(1, (h + w / 2 + 12) / Math.max(1, r - d / 2)));
      for (let q = 0; q < 4; q++) {
        if (only && !only.includes(q)) continue;
        const g0 = GATES[q], m0 = margin(lay.roads[q].half), m1 = margin(lay.roads[(q + 1) % 4].half), span = Math.PI / 2 - m0 - m1;
        for (let k = 0; k < per; k++) { const a = g0 + m0 + span * (per === 1 ? 0.5 : k / (per - 1)), p = polar(a, r); fn(p.x, p.y, a, q, k); }
      }
    };
    // Lamps along the four roads and around the plaza (no collision).
    function lamps(step = 62, plazaCount = 8, offset = 10) {
      for (const road of lay.roads) for (let d = lay.plazaR + 30; d < wall.inner - 30; d += step) for (const side of [-1, 1]) {
        const a = road.angle, x = Math.cos(a) * d - Math.sin(a) * side * (road.half + offset), y = Math.sin(a) * d + Math.cos(a) * side * (road.half + offset);
        prop('lamp', x, y, { r: 3, road: false, plaza: false, gap: 2 });
      }
      ring(plazaCount, lay.plazaR + 8, Math.PI / plazaCount, (x, y) => prop('lamp', x, y, { r: 3, road: false, plaza: false, gap: 2 }));
    }
    return { lay, fits, building, prop, ring, quads, lamps, reserved, onRoad };
  }

  // ---------- the eight layouts ----------
  const between = (lo, hi, t) => lo + (hi - lo) * t;
  // Quarters (between the roads): 0 = south-east, 1 = south-west, 2 = north-west, 3 = north-east.
  const LAYOUTS = {
    // 1. Grand Circle: two rings of houses around the portal plaza, four roads to four gates, lamps, gardens and a well.
    grand() {
      const b = builder('grand', buildWall({}), { npcAngles: { merchant: -Math.PI * 0.75, smith: -Math.PI * 0.25, mystic: Math.PI * 0.75 } });
      for (const g of GATES) for (const side of [-1, 1]) { const a = g + side * 0.42, p = polar(a, 150); b.prop('garden', p.x, p.y, { w: 34, d: 20, yaw: faceCentre(p.x, p.y), gap: 4 }); }
      b.prop('well', ...Object.values(polar(Math.PI * 0.25, 150)), { r: 17, solid: true });
      b.quads(226, 3, { w: 58, d: 42 }, (x, y, a, q, k) => { if (q === 3 && k === 1) b.building('smithy', x, y, 58, 42); else if (q === 2 && k === 1) b.building('market', x, y, 60, 36); else b.building('house', x, y, 52, 40); });
      b.quads(304, 4, { w: 50, d: 30 }, (x, y, a, q, k) => b.building('house', x, y, 46 + (k % 2) * 4, 30));
      b.quads(318, 3, { w: 60, d: 20 }, (x, y, a, q, k) => { const off = 0.15; for (const s of [-1, 1]) { const p = polar(a + s * off, 318); b.prop('tree', p.x, p.y, { r: 9, solid: true, gap: 3 }); } });
      b.lamps(); return b.lay;
    },
    // 2. Royal Avenue: a wide boulevard from the south gate to the portal, mirrored halls, statues, a palace and a monumental arch.
    avenue() {
      const b = builder('avenue', buildWall({ fence: 'stone' }), { wide: { 1: 1.6 }, npcAngles: { merchant: Math.PI * 0.75, smith: Math.PI * 0.25, mystic: -Math.PI * 0.75 } });
      const lay = b.lay, half = lay.roads[1].half;
      for (const side of [-1, 1]) {
        const face = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        for (let k = 0; k < 4; k++) b.prop('statue', side * (half + 14), 140 + k * 44, { r: 7, solid: true, road: false, gap: 2 });
        for (let k = 0; k < 2; k++) b.building('hall', side * (half + 72), 194 + k * 66, 50, 44, { yaw: face });
        for (let k = 0; k < 2; k++) b.building('house', side * (half + 142), 178 + k * 56, 46, 38, { yaw: face });
        b.building('house', side * 262, 96, 44, 36);
        b.building('palace', side * 128, -232, 84, 50, { yaw: 0 });
        b.building('hall', side * 238, -108, 56, 44);
        b.prop('obelisk', side * (half + 14), lay.wall.inner - 26, { r: 8, solid: true, road: false, gap: 2 });
        b.prop('garden', side * 84, -168, { w: 40, d: 24, yaw: 0, gap: 4 });
      }
      for (const side of [-1, 1]) { b.building('house', side * 218, -196, 44, 36); b.building('house', side * 150, -142, 40, 32); }
      lay.props.push({ type: 'arch', x: 0, y: lay.wall.inner, w: half * 2 + 30, yaw: 0, solid: false, shape: { type: 'circle', x: 0, y: lay.wall.inner, r: 1 } });
      b.lamps(56, 8); return lay;
    },
    // 3. Fortress: octagonal walls with corner towers, a keep, halls and barracks, a walled courtyard around the portal.
    fortress() {
      const b = builder('fortress', buildWall({ shape: 'polygon', sides: 8, r: Math.round(DIM.wallR * 1.06), thickness: 14, fence: 'stone' }), { npcAngles: { merchant: -Math.PI * 0.75, smith: Math.PI * 0.25, mystic: Math.PI * 0.75 } });
      const lay = b.lay;
      // inner courtyard rampart with openings on the roads and towards each NPC
      for (let k = 0; k < 32; k++) {
        const a = (k + 0.5) / 32 * TAU, p = polar(a, 206);
        if (GATES.some(g => angleDiff(a, g) < 0.24) || Object.values(lay.npcSpots).some(n => angleDiff(a, n.angle) < 0.15)) continue;
        b.prop('rampart', p.x, p.y, { w: 37, d: 9, yaw: faceCentre(p.x, p.y), solid: true, gap: 0 });
      }
      b.quads(272, 2, { w: 68, d: 48 }, (x, y, a, q, k) => { if (q !== 3) b.building(q === 1 ? 'barracks' : 'hall', x, y, 68, 48); });
      b.building('keep', ...Object.values(polar(-Math.PI * 0.25, 280)), 80, 64);
      b.quads(296, 2, { w: 32, d: 32 }, (x, y) => b.building('tower-house', x, y, 32, 32), [3]);
      b.quads(312, 1, 10, (x, y) => b.prop('crates', x, y, { r: 10, solid: true, gap: 3 }), [0, 1, 2]);
      b.ring(8, 182, Math.PI / 8, (x, y) => b.prop('banner', x, y, { r: 3, gap: 2 }));
      b.lamps(70, 8); return lay;
    },
    // 4. Crescent: houses along a curved arc that opens to the south, a wide inner green, curved paths, a pond and trees.
    crescent() {
      const b = builder('crescent', buildWall({}), { plazaR: 120, npcRing: 145, npcAngles: { merchant: -Math.PI * 0.8, smith: -Math.PI * 0.2, mystic: Math.PI * 0.8 } });
      const lay = b.lay;
      for (let i = 0; i < 9; i++) { const a = between(Math.PI * 1.05, Math.PI * 1.95, i / 8), p = polar(a, 236); b.building('house', p.x, p.y, 52, 40); }
      for (let i = 0; i < 14; i++) { const a = between(Math.PI * 0.62, Math.PI * 2.12, i / 13), p = polar(a, 308); b.building('cottage', p.x, p.y, 44, 34); }
      b.prop('pond', ...Object.values(polar(Math.PI * 0.25, 236)), { r: 36, solid: true });
      for (let i = 0; i < 24; i++) { const a = between(Math.PI * 0.06, Math.PI * 0.94, (i % 12) / 11), r = i < 12 ? 200 : 262, p = polar(a, r + (i % 3) * 8); b.prop(i % 4 === 3 ? 'rock' : 'tree', p.x, p.y, { r: i % 4 === 3 ? 7 : 9, solid: true, gap: 4 }); }
      lay.paths = [{ r: 196, from: Math.PI * 1.02, to: Math.PI * 1.98 }, { r: 172, from: Math.PI * 0.08, to: Math.PI * 0.92 }];
      b.ring(14, 180, 0.12, (x, y) => b.prop('flowers', x, y, { r: 7, gap: 3 }));
      b.lamps(66, 10); return lay;
    },
    // 5. High District: the portal on a raised dais, two terraces with stairs where the roads climb, buildings on each level.
    terraces() {
      const b = builder('terraces', buildWall({ shape: 'polygon', sides: 12, r: Math.round(DIM.wallR * 1.03), fence: 'stone' }), { arrivalMin: 66 });
      const lay = b.lay;
      lay.terraces = [{ r0: 0, r1: 62, h: 4.5, kind: 'dais' }, { r0: 196, r1: 262, h: 3, kind: 'terrace' }, { r0: 262, r1: lay.wall.inner - 6, h: 6, kind: 'terrace' }];
      b.quads(228, 3, { w: 48, d: 36 }, (x, y, a, q, k) => b.building(k === 1 ? 'tower-house' : 'house', x, y, k === 1 ? 36 : 48, k === 1 ? 36 : 36));
      b.quads(300, 4, { w: 50, d: 32 }, (x, y, a, q, k) => b.building(k === 1 || k === 2 ? 'hall' : 'house', x, y, k === 1 || k === 2 ? 56 : 44, 32));
      for (const road of lay.roads) for (const r of [196, 262]) lay.props.push({ type: 'stairs', x: Math.cos(road.angle) * r, y: Math.sin(road.angle) * r, w: road.half * 2, yaw: road.yaw, solid: false, shape: { type: 'circle', x: 0, y: 0, r: 1 } });
      b.quads(166, 1, 11, (x, y) => b.prop('planter', x, y, { r: 11, solid: true, gap: 4 }));
      b.lamps(60, 8); return lay;
    },
    // 6. Merchant Quarter: rows of market stalls, warehouses and stacked goods along wide market streets.
    market() {
      const b = builder('market', buildWall({}), { roadHalfWidth: 40, npcAngles: { merchant: -Math.PI * 0.75, smith: Math.PI * 0.25, mystic: Math.PI * 0.75 } });
      const lay = b.lay;
      b.quads(204, 3, { w: 34, d: 18 }, (x, y, a, q, k) => b.prop('stall', x, y, { w: 34, d: 18, yaw: faceCentre(x, y), solid: true, gap: 6, tint: (q + k) % 4 }));
      b.quads(240, 4, { w: 34, d: 18 }, (x, y, a, q, k) => b.prop('stall', x, y, { w: 34, d: 18, yaw: faceCentre(x, y), solid: true, gap: 6, tint: (q + k + 2) % 4 }));
      b.quads(300, 3, { w: 46, d: 32 }, (x, y, a, q, k) => k === 1 ? b.building('warehouse', x, y, 62, 34) : b.building('shop', x, y, 46, 32));
      b.prop('fountain', ...Object.values(polar(-Math.PI * 0.25, 160)), { r: 22, solid: true });
      b.ring(8, 168, Math.PI / 8 + 0.2, (x, y, a, i) => b.prop(i % 2 ? 'barrels' : 'crates', x, y, { r: 9, solid: true, gap: 4 }));
      b.lamps(58, 8); return lay;
    },
    // 7. Wildwood Haven: a living wall of trees, wooden huts among great trees, gardens and stepping-stone paths, a big clearing.
    haven() {
      const b = builder('haven', buildWall({ fence: 'hedge' }), { plazaR: 128, npcRing: 150, npcAngles: { merchant: -Math.PI * 0.7, smith: -Math.PI * 0.2, mystic: Math.PI * 0.75 } });
      const lay = b.lay;
      b.quads(232, 2, { w: 44, d: 38 }, (x, y) => b.building('hut', x, y, 44, 38));
      b.quads(304, 3, { w: 42, d: 32 }, (x, y) => b.building('hut', x, y, 42, 32));
      for (let i = 0; i < 70; i++) { const a = i * 2.39996 + 0.4, r = 200 + (i * 53 % 125), p = polar(a, r); if (i % 2) b.prop('bigtree', p.x, p.y, { r: 14, solid: true, gap: 6 }); else b.prop('garden', p.x, p.y, { w: 32, d: 20, yaw: faceCentre(p.x, p.y), gap: 6 }); }
      b.ring(10, 182, 0.5, (x, y) => b.prop('tree', x, y, { r: 9, solid: true, gap: 4 }));
      b.ring(16, lay.plazaR + 10, 0.1, (x, y) => b.prop('flowers', x, y, { r: 6, plaza: false, gap: 3 }));
      lay.steppingStones = true;
      b.lamps(74, 6, 8); return lay;
    },
    // 8. Ancient Citadel: a colonnade around the portal plaza, statues, gothic halls, a cathedral, obelisks and braziers.
    citadel() {
      const b = builder('citadel', buildWall({ shape: 'polygon', sides: 10, r: Math.round(DIM.wallR * 1.05), thickness: 14, fence: 'stone' }), { plazaR: 112, npcRing: 140, npcAngles: { merchant: -Math.PI * 0.72, smith: -Math.PI * 0.28, mystic: Math.PI * 0.75 } });
      const lay = b.lay;
      b.ring(24, lay.plazaR + 6, 0.13, (x, y, a) => { if (Object.values(lay.npcSpots).some(n => angleDiff(a, n.angle) < 0.2)) return; b.prop('pillar', x, y, { r: 5, solid: true, plaza: false, gap: 2 }); });
      b.building('cathedral', ...Object.values(polar(Math.PI * 0.25, 262)), 104, 66);
      b.ring(8, 196, Math.PI / 8 + 0.04, (x, y) => b.prop('statue', x, y, { r: 8, solid: true, gap: 4 }));
      b.quads(262, 3, { w: 58, d: 44 }, (x, y, a, q, k) => b.building(k === 1 ? 'gothic' : 'hall', x, y, k === 1 ? 52 : 58, 44), [1, 2, 3]);
      b.quads(314, 3, 8, (x, y, a, q, k) => b.prop(k === 1 ? 'obelisk' : 'brazier', x, y, { r: k === 1 ? 8 : 6, solid: true, gap: 3 }));
      b.lamps(64, 10); return lay;
    },
  };
  const LAYOUT_IDS = Object.keys(LAYOUTS);
  const LAYOUT_NAMES = { grand: 'Grand Circle', avenue: 'Royal Avenue', fortress: 'Fortress', crescent: 'Crescent', terraces: 'High District', market: 'Merchant Quarter', haven: 'Wildwood Haven', citadel: 'Ancient Citadel' };
  // Which layouts suit each style (weights). Every layout still works with every style.
  const LAYOUT_WEIGHTS = {
    timber: { grand: 3, haven: 3, crescent: 2, market: 2, avenue: 1, terraces: 1 },
    snow: { fortress: 3, grand: 2, terraces: 2, crescent: 2, citadel: 1 },
    sandstone: { avenue: 3, market: 3, terraces: 2, fortress: 1, grand: 1 },
    dark: { citadel: 4, fortress: 2, terraces: 1, avenue: 1 },
    ember: { fortress: 2, citadel: 2, terraces: 1 },
    void: { citadel: 2, terraces: 2, fortress: 1 },
  };
  function chooseLayout(style, random) {
    const weights = LAYOUT_WEIGHTS[style] || LAYOUT_WEIGHTS.timber, keys = Object.keys(weights);
    let roll = random() * keys.reduce((s, k) => s + weights[k], 0);
    for (const k of keys) { roll -= weights[k]; if (roll < 0) return k; }
    return keys[keys.length - 1];
  }

  // ---------- encampment and bare portal site ----------
  function campLayout(built) {
    const out = { kind: 'camp', safe: SAFE_RADIUS.camp, portal: { ...PORTAL }, houses: [], tents: [], stalls: [], stones: [], props: [], carts: [], obstacles: [], wall: null, npcs: {}, npcSpots: {}, roads: [], arrival: { angle: Math.PI / 2, spread: 0.4, r: [48, 70] } };
    // Portal -> NPC -> stall: the stall is the vendor's "cart" here.
    const angles = { merchant: -Math.PI * 0.62, smith: Math.PI * 0.12, mystic: Math.PI * 0.82 };
    for (const key of VENDORS) {
      const a = angles[key], n = polar(a, 92), s = polar(a, 132);
      out.npcSpots[key] = { x: n.x, y: n.y, yaw: faceCentre(n.x, n.y), angle: a };
      const stall = { key, x: s.x, y: s.y, yaw: faceCentre(s.x, s.y) };
      if (built[key]) { out.stalls.push(stall); out.npcs[key] = true; out.obstacles.push({ type: 'rect', x: s.x, y: s.y, w: 44, d: 22, yaw: stall.yaw }); }
      else out.stalls.push({ ...stall, site: true });
    }
    for (const t of [{ x: -150, y: -40, s: 1 }, { x: -110, y: -125, s: .85 }, { x: 115, y: -112, s: .9 }, { x: 40, y: 150, s: 1 }, { x: -150, y: 70, s: .8 }]) { out.tents.push(t); out.obstacles.push({ type: 'circle', x: t.x, y: t.y, r: 26 * t.s }); }
    out.fire = { x: -70, y: 40 };
    out.obstacles.push({ type: 'circle', x: out.fire.x, y: out.fire.y, r: 12 });
    out.board = CAMP_BOARD;
    return out;
  }
  function noneLayout() {
    const out = { kind: 'none', safe: SAFE_RADIUS.none, portal: { ...PORTAL }, houses: [], tents: [], stalls: [], stones: [], props: [], carts: [], obstacles: [], wall: null, npcs: {}, npcSpots: {}, roads: [], arrival: { angle: Math.PI / 2, spread: 0.6, r: [42, 62] } };
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + .3, x = Math.cos(a) * 88, y = Math.sin(a) * 88; out.stones.push({ x, y, h: 26 + (i % 3) * 9 }); out.obstacles.push({ type: 'circle', x, y, r: 9 }); }
    return out;
  }

  // kind: 'village' | 'camp' | 'none'; style: 'timber' | 'snow' | 'sandstone' | 'dark' | 'ember' | 'void';
  // built: stalls on a camp; layoutId: one of LAYOUT_IDS for a village (default grand).
  const cache = new Map();
  // The kit's extra solid pieces, added to a copy of the layout's obstacles.
  function kitObstacles(base) {
    const out = base.obstacles.map(o => base.carts.includes(o) ? { ...o, w: KIT_STATION.w, d: KIT_STATION.d } : o);
    for (const f of KIT_PORTAL_FEET) out.push({ type: 'circle', x: f.x, y: f.y, r: f.r });
    const W = base.wall;
    for (let k = 0; k < 4; k++) {
      const a = GATES[k], half = Math.max(W.gateHalfWidth, base.roads[k].half + 8), px = Math.cos(a), py = Math.sin(a);
      for (const sgn of [-1, 1]) out.push({ type: 'rect', x: px * W.inner - py * sgn * (half + 13), y: py * W.inner + px * sgn * (half + 13), w: 26, d: 26, yaw: Math.PI / 2 - a });
    }
    return out;
  }
  // A village without vendors: only the bought stalls (and their NPCs and carts) stand; the others are empty sites,
  // and a stall board on the plaza takes the purchases. Buildings, walls, roads and the portal are untouched.
  function villageBoard(base) {
    const npcAngles = Object.values(base.npcSpots).map(n => n.angle);
    for (const a of [Math.PI / 4, -Math.PI / 4, Math.PI * 3 / 4, -Math.PI * 3 / 4, Math.PI / 8, -Math.PI / 8, Math.PI * 7 / 8, -Math.PI * 7 / 8]) {
      if (npcAngles.some(n => angleDiff(a, n) < 0.5) || GATES.some(g => angleDiff(a, g) < 0.35)) continue;
      return polar(a, 78);
    }
    return polar(Math.PI / 4, 78);
  }
  function unstaffed(out, built) {
    const missing = new Set(VENDORS.filter(k => !built[k]));
    out.npcs = Object.fromEntries(VENDORS.filter(k => !missing.has(k)).map(k => [k, true]));
    out.stallSites = out.carts.filter(c => missing.has(c.key)).map(c => ({ ...c, site: true }));
    out.carts = out.carts.filter(c => !missing.has(c.key));
    out.obstacles = out.obstacles.filter(o => !(o.key && missing.has(o.key)));
    out.board = villageBoard(out); out.stalls = true;
    return out;
  }
  // stalls: true for a village that spawned without vendors (see UNSTAFFED_VILLAGE_CHANCE).
  function layout(kind, style, built, layoutId, stalls) {
    built = built || {};
    let out;
    if (kind === 'village') {
      const id = LAYOUTS[layoutId] ? layoutId : 'grand';
      if (!cache.has(id)) cache.set(id, LAYOUTS[id]());
      const base = cache.get(id);
      out = { ...base, style, npcs: { ...base.npcs } };
      if (KIT_STYLES.includes(style)) out.obstacles = kitObstacles(base);
      if (stalls) unstaffed(out, built);
    } else if (kind === 'camp') out = { ...campLayout(built), style };
    else out = { ...noneLayout(), style };
    // Quick reject for collision: nothing to bump into beyond this distance from the centre.
    out.reach = Math.max(out.safe, out.wall ? out.wall.r + 30 : 0, ...out.obstacles.map(o => Math.hypot(o.x, o.y) + boundR(o))) + 20;
    for (const o of out.obstacles) o.br = o.br || boundR(o);
    return out;
  }

  // Where a newly arrived hero stands: on the plaza, just south of the portal, clear of everything.
  function arrivalPoint(lay, random) {
    random = random || Math.random;
    for (let tries = 0; tries < 20; tries++) {
      const a = lay.arrival.angle + (random() * 2 - 1) * lay.arrival.spread, r = lay.arrival.r[0] + random() * (lay.arrival.r[1] - lay.arrival.r[0]), p = polar(a, r);
      if (!lay.obstacles.some(o => overlaps({ type: 'circle', x: p.x, y: p.y, r: 12 }, o))) return p;
    }
    return polar(lay.arrival.angle, lay.arrival.r[0]);
  }

  // Push an entity out of buildings, carts and the wall. Positions are world coordinates; cx, cy is the settlement centre.
  // prev (the position before this move) decides which side of the wall the entity belongs on.
  function collide(entity, lay, cx, cy, radius, prev) {
    if (!lay) return false;
    radius = radius || 10; let moved = false;
    const lx0 = entity.x - cx, ly0 = entity.y - cy;
    if (Math.abs(lx0) > lay.reach || Math.abs(ly0) > lay.reach) return false;
    let lx = lx0, ly = ly0;
    for (const o of lay.obstacles) {
      if (Math.abs(lx - o.x) > o.br + radius || Math.abs(ly - o.y) > o.br + radius) continue;
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
    const wall = lay.wall;
    if (wall) {
      const d = Math.hypot(lx, ly), half = wall.thickness / 2 + radius;
      if (d > wall.inner - half - 2 && d < wall.r + half + 2) {
        const ref = prev ? { x: prev.x - cx, y: prev.y - cy } : { x: lx0, y: ly0 };
        for (const sgm of wall.segments) {
          const ex = sgm.x2 - sgm.x1, ey = sgm.y2 - sgm.y1, L2 = ex * ex + ey * ey || 1, t = Math.max(0, Math.min(1, ((lx - sgm.x1) * ex + (ly - sgm.y1) * ey) / L2));
          const qx = sgm.x1 + ex * t, qy = sgm.y1 + ey * t, dist = Math.hypot(lx - qx, ly - qy);
          if (dist >= half) continue;
          // which side: the side the entity came from (inside if it was inside before)
          const side = Math.sign(ex * (ref.y - sgm.y1) - ey * (ref.x - sgm.x1)) || 1, nx = -ey / Math.sqrt(L2) * side, ny = ex / Math.sqrt(L2) * side;
          const along = (lx - qx) * nx + (ly - qy) * ny;
          if (t > 0 && t < 1) { const push = half - along; lx += nx * push; ly += ny * push; }
          else { const k = dist > 0.01 ? (lx - qx) / dist : nx, j = dist > 0.01 ? (ly - qy) / dist : ny; lx = qx + k * half; ly = qy + j * half; }
          moved = true;
        }
        for (const t of wall.towers) { const dx = lx - t.x, dy = ly - t.y, dist = Math.hypot(dx, dy), min = t.r + radius; if (dist < min) { const k = dist > .01 ? dx / dist : 1, j = dist > .01 ? dy / dist : 0; lx = t.x + k * min; ly = t.y + j * min; moved = true; } }
      }
    }
    if (moved) { entity.x = cx + lx; entity.y = cy + ly; }
    return moved;
  }

  // Moving bodies must test the path, not only its endpoint: nearest-face depenetration can
  // otherwise eject a fast step through a narrow obstacle. Consume blocked motion instead
  // of catching up to the original endpoint on the following substep.
  function moveWithCollision(entity, lay, cx, cy, radius, prev) {
    if (!lay || !prev) return collide(entity, lay, cx, cy, radius, prev);
    if (![prev.x, prev.y].every(Number.isFinite)) return false;
    if (![entity.x, entity.y].every(Number.isFinite)) { entity.x = prev.x; entity.y = prev.y; return true; }
    radius = Number.isFinite(radius) && radius > 0 ? radius : 10;
    const fromX = prev.x - cx, fromY = prev.y - cy, toX = entity.x - cx, toY = entity.y - cy;
    // A path wholly outside the settlement's bounding square needs no substeps.
    const reach = lay.reach + radius;
    if (Math.min(fromX, toX) > reach || Math.max(fromX, toX) < -reach || Math.min(fromY, toY) > reach || Math.max(fromY, toY) < -reach) return false;
    const start = { x: prev.x, y: prev.y };
    // Newly built scenery may occupy the old position. Resolve that separately from walking.
    if (collide(start, lay, cx, cy, radius, prev) && Math.hypot(start.x - prev.x, start.y - prev.y) > 1e-6) { entity.x = start.x; entity.y = start.y; return true; }
    const dx = entity.x - prev.x, dy = entity.y - prev.y, distance = Math.hypot(dx, dy), stepSize = Math.max(1, radius / 2);
    if (!Number.isFinite(distance)) { entity.x = prev.x; entity.y = prev.y; return true; }
    if (!distance) return false;
    const maxDistance = stepSize * 64, travel = Math.min(distance, maxDistance), steps = Math.max(1, Math.ceil(travel / stepSize));
    const stepX = dx / distance * travel / steps, stepY = dy / distance * travel / steps, allowance = 2 * travel / steps + 1e-6;
    entity.x = prev.x; entity.y = prev.y; let blocked = distance > maxDistance;
    for (let index = 0; index < steps; index++) {
      const before = { x: entity.x, y: entity.y };
      entity.x += stepX; entity.y += stepY;
      blocked = collide(entity, lay, cx, cy, radius, before) || blocked;
      // Intersecting inflated obstacles must not turn a small walk into a large push.
      if (Math.hypot(entity.x - before.x, entity.y - before.y) > allowance) { entity.x = before.x; entity.y = before.y; return true; }
    }
    return blocked;
  }

  // Which settlement a generated region gets. Fire and void lands only allow an encampment that players build;
  // other lands get a village, or sometimes nothing but the portal (never the first region beyond the founding lands).
  // (The village layout is chosen separately, see chooseLayout, so these rolls stay as they were.)
  function choose(biome, tier, random) {
    const style = { glacier: 'snow', warfields: 'sandstone', necropolis: 'dark', wildwood: 'timber', volcanic: 'ember', voidscar: 'void' }[biome] || 'timber';
    if (biome === 'volcanic' || biome === 'voidscar') return { kind: 'camp', style };
    if (tier > 8 && random() < 0.3) return { kind: 'none', style };
    return { kind: 'village', style };
  }
  // Compatibility: the founding village's NPC spots (Grand Circle).
  const NPC_OFFSETS = Object.fromEntries(VENDORS.map(k => { const s = layout('village', 'timber', {}, 'grand').npcSpots[k]; return [k, { x: s.x, y: s.y }]; }));

  return { UNSTAFFED_VILLAGE_CHANCE, KIT_STYLES, KIT_STATION, KIT_PORTAL_FEET, VILLAGE_SCALE, DIM, NPC_OFFSETS, PORTAL, PORTAL_OFFSET, CAMP_BOARD, STALL_COST, STALL_NAMES, SAFE_RADIUS, WALL, GATES, VENDORS, LAYOUT_IDS, LAYOUT_NAMES, LAYOUT_WEIGHTS,
    debugLayout: id => { DEBUG = true; try { return LAYOUTS[id](); } finally { DEBUG = false; } },
    layout, chooseLayout, arrivalPoint, collide, moveWithCollision, choose, overlaps, faceCentre, gateOpen, buildWall };
}));
