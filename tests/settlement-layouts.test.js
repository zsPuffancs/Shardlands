'use strict';
// Village layouts (public/settlement.js) and how the server uses them (game-world.js, universe.js),
// plus a headless run of the client renderer (public/village.js) for every layout and style.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Settlement = require('../public/settlement');
const world = require('../game-world');

const STYLES = ['timber', 'snow', 'sandstone', 'dark', 'ember', 'void'];
const unit = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
const facing = yaw => [Math.sin(yaw), Math.cos(yaw)]; // the direction a yaw looks at (+v of a rect, a model's front)
const villages = (styles = ['timber', 'dark']) => styles.flatMap(style => Settlement.LAYOUT_IDS.map(id => [id + (style === 'timber' ? '' : ':' + style), Settlement.layout('village', style, {}, id)]));

test('there are eight distinct layouts, each a walled village with all three vendors', () => {
  assert.deepEqual(Settlement.LAYOUT_IDS, ['grand', 'avenue', 'fortress', 'crescent', 'terraces', 'market', 'haven', 'citadel']);
  const signatures = new Set();
  for (const [id, lay] of villages(['timber'])) {
    assert.equal(lay.kind, 'village'); assert.equal(lay.layout, id);
    for (const key of Settlement.VENDORS) assert.ok(lay.npcs[key] && lay.npcSpots[key], id + ' ' + key);
    assert.ok(lay.houses.length >= 7, id + ' has ' + lay.houses.length + ' buildings'); // the Fortress has fewer, larger buildings
    assert.ok(lay.wall && lay.wall.segments.length >= 12);
    signatures.add(JSON.stringify([lay.wall.shape, lay.wall.sides, lay.houses.map(h => h.type).sort().join(), lay.props.map(p => p.type).sort().join()]));
  }
  assert.equal(signatures.size, 8);
});

test('the portal is at the exact centre, on a clear plaza, for every kind of settlement', () => {
  for (const [id, lay] of villages()) {
    assert.deepEqual(lay.portal, { x: 0, y: 0 }, id);
    // only the kit portal's own two monoliths stand on the dais
    const feet = Settlement.KIT_STYLES.includes(lay.style) ? Settlement.KIT_PORTAL_FEET : [];
    for (const o of lay.obstacles) if (!feet.some(f => o.type === 'circle' && o.x === f.x && o.y === f.y)) assert.ok(!Settlement.overlaps({ type: 'circle', x: 0, y: 0, r: 52 }, o), id + ': nothing solid on the portal dais');
    for (const f of feet) assert.ok(Math.abs(f.y) < 1e-9 && Math.abs(Math.abs(f.x) - 46) < 1e-9, 'monoliths flank the portal east and west');
  }
  for (const kind of ['camp', 'none']) assert.deepEqual(Settlement.layout(kind, 'ember', { merchant: { by: 'a' } }).portal, { x: 0, y: 0 });
  const map = world.addMap(3, { tier: 9, regionTier: 10 });
  for (const id of Settlement.LAYOUT_IDS) {
    world.setSettlement(map, { kind: 'village', style: 'snow', built: {}, layout: id });
    const portal = world.npcPosition(map, 'portal'); assert.equal(portal.x, map.cx); assert.equal(portal.y, map.cy);
  }
});

test('every NPC faces the portal and has its cart directly behind it (Portal -> NPC -> cart)', () => {
  const check = (lay, carts, label) => {
    for (const key of Settlement.VENDORS) {
      const npc = lay.npcSpots[key], toPortal = unit(-npc.x, -npc.y), look = facing(npc.yaw);
      assert.ok(look[0] * toPortal[0] + look[1] * toPortal[1] > 0.9999, label + ' ' + key + ' faces the portal');
      const cart = carts.find(c => c.key === key); if (!cart) continue;
      const away = unit(cart.x - npc.x, cart.y - npc.y), out = unit(npc.x, npc.y);
      assert.ok(away[0] * out[0] + away[1] * out[1] > 0.9999, label + ' ' + key + ' cart is straight behind');
      assert.ok(Math.hypot(cart.x, cart.y) > Math.hypot(npc.x, npc.y) + 20, label + ' cart further out than the NPC');
      const front = facing(cart.yaw); assert.ok(front[0] * toPortal[0] + front[1] * toPortal[1] > 0.9999, label + ' cart faces the portal too');
      assert.ok(!Settlement.overlaps({ type: 'circle', x: npc.x, y: npc.y, r: 10 }, { type: 'rect', ...cart, w: cart.w || 44, d: cart.d || 22 }), label + ' NPC not inside its cart');
    }
  };
  for (const [id, lay] of villages()) check(lay, lay.carts, id);
  const camp = Settlement.layout('camp', 'void', { merchant: { by: 'a' }, smith: { by: 'b' }, mystic: { by: 'c' } });
  check(camp, camp.stalls, 'camp');
});

test('nothing overlaps: buildings, carts, solid props, NPCs, roads and the portal plaza', () => {
  for (const [id, lay] of villages()) {
    const solids = [...lay.obstacles];
    for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
      // rampart pieces of the Fortress courtyard are allowed to touch end to end
      if (solids[i].w === 37 && solids[j].w === 37) continue;
      assert.ok(!Settlement.overlaps(solids[i], solids[j], -0.5), id + ' overlap ' + JSON.stringify([solids[i], solids[j]]));
    }
    for (const key of Settlement.VENDORS) { const n = lay.npcSpots[key]; for (const o of solids) assert.ok(!Settlement.overlaps({ type: 'circle', x: n.x, y: n.y, r: 12 }, o), id + ' NPC ' + key + ' blocked'); }
    // roads beyond the plaza (inside the plaza the portal monoliths of the kit stand on the axis; players walk around them)
    for (const road of lay.roads) { const len = road.d - lay.plazaR, mid = lay.plazaR + len / 2, part = { ...road, x: Math.cos(road.angle) * mid, y: Math.sin(road.angle) * mid, d: len }; for (const o of solids) assert.ok(!Settlement.overlaps(part, o), id + ' road blocked by ' + JSON.stringify(o)); }
    const wallReach = Math.max(...lay.wall.segments.flatMap(s => [Math.hypot(s.x1, s.y1), Math.hypot(s.x2, s.y2)]));
    for (const o of solids) { if (o.w === 26 && o.d === 26) continue; /* kit gate towers straddle the wall line */ const r = o.type === 'circle' ? Math.hypot(o.x, o.y) + o.r : Math.hypot(o.x, o.y) + Math.hypot(o.w, o.d) / 2; assert.ok(r <= wallReach + 1, id + ' inside the wall'); }
  }
});

test('buildings and walls block movement; the gates and roads stay open', () => {
  const centre = { x: 1000, y: 1000 };
  for (const [id, lay] of villages()) {
    // walking into a house pushes the hero back out
    // walking into a house through its front door pushes the hero back out in front of it
    for (const h of lay.houses) {
      const front = [Math.sin(h.yaw), Math.cos(h.yaw)], prev = { x: centre.x + h.x + front[0] * (h.d / 2 + 16), y: centre.y + h.y + front[1] * (h.d / 2 + 16) };
      const e = { x: centre.x + h.x + front[0] * (h.d / 2 - 2), y: centre.y + h.y + front[1] * (h.d / 2 - 2) };
      assert.ok(Settlement.collide(e, lay, centre.x, centre.y, 11, prev), id + ' ' + h.type + ' is solid');
      assert.ok(!Settlement.overlaps({ type: 'circle', x: e.x - centre.x, y: e.y - centre.y, r: 10.9 }, { type: 'rect', x: h.x, y: h.y, w: h.w + 6, d: h.d + 6, yaw: h.yaw }), id + ' pushed out of the ' + h.type);
    }
    const h = lay.houses[0], e = { x: centre.x + h.x + Math.sin(h.yaw) * (h.d / 2), y: centre.y + h.y + Math.cos(h.yaw) * (h.d / 2) };
    Settlement.collide(e, lay, centre.x, centre.y, 11);
    assert.ok(!lay.obstacles.some(o => Settlement.overlaps({ type: 'circle', x: e.x - centre.x, y: e.y - centre.y, r: 10.9 }, o)), id + ' pushed clear');
    // every road, from the plaza out past the wall, is walkable along its middle and both sides
    for (const road of lay.roads) for (const side of [-0.6, 0, 0.6]) for (let d = lay.plazaR; d < lay.wall.r + 40; d += 6) {
      const x = Math.cos(road.angle) * d - Math.sin(road.angle) * side * road.half, y = Math.sin(road.angle) * d + Math.cos(road.angle) * side * road.half;
      const p = { x: centre.x + x, y: centre.y + y }; assert.equal(Settlement.collide(p, lay, centre.x, centre.y, 11, { ...p }), false, id + ' road ' + road.angle.toFixed(2) + ' blocked at ' + d);
    }
    // between the gates the wall holds from both sides
    const a = Math.PI / 4 + 0.05, inner = lay.wall.inner;
    for (const [from, to] of [[inner - 30, inner + 2], [lay.wall.r + 30, inner - 2]]) {
      const prev = { x: centre.x + Math.cos(a) * from, y: centre.y + Math.sin(a) * from }, p = { x: centre.x + Math.cos(a) * to, y: centre.y + Math.sin(a) * to };
      Settlement.collide(p, lay, centre.x, centre.y, 11, prev);
      const d = Math.hypot(p.x - centre.x, p.y - centre.y);
      assert.ok(from < to ? d < inner : d > inner - 1, id + ' wall holds ' + (from < to ? 'from inside' : 'from outside') + ' (' + d.toFixed(1) + ')');
    }
  }
});

test('NPCs can be reached from the plaza and the arrival spot; arrivals land clear on the plaza', () => {
  const map = world.addMap(4, { tier: 10, regionTier: 11 });
  for (const style of ['timber', 'dark']) for (const layoutId of Settlement.LAYOUT_IDS) {
    const id = layoutId + ':' + style;
    world.setSettlement(map, { kind: 'village', style, built: {}, layout: layoutId });
    const lay = world.layoutOf(map);
    for (let n = 0; n < 40; n++) {
      const hero = { x: 0, y: 0 }; world.placeInVillage(hero, map);
      const local = { x: hero.x - map.cx, y: hero.y - map.cy };
      assert.ok(world.inVillage(hero), id + ' arrival is in the safe zone');
      assert.ok(Math.hypot(local.x, local.y) >= 42 && Math.hypot(local.x, local.y) <= lay.plazaR, id + ' arrival on the plaza, off the portal');
      assert.ok(!lay.obstacles.some(o => Settlement.overlaps({ type: 'circle', ...local, r: 11 }, o)), id + ' arrival clear');
    }
    for (const key of Settlement.VENDORS) {
      const npc = world.npcPosition(map, key);
      assert.ok(world.nearNpc({ x: npc.x - (npc.x - map.cx) * 0.3, y: npc.y - (npc.y - map.cy) * 0.3 }, key), id + ' can talk to ' + key + ' from the plaza');
      // the straight walk from the portal to the NPC is free of obstacles
      for (let t = 0.35; t <= 0.85; t += 0.05) { const p = { x: (npc.x - map.cx) * t, y: (npc.y - map.cy) * t }; assert.ok(!lay.obstacles.some(o => Settlement.overlaps({ type: 'circle', ...p, r: 10 }, o)), id + ' path to ' + key); }
    }
  }
});

test('server and client agree: the client rebuilds the same layout from what the server sends', () => {
  const map = world.addMap(5, { tier: 11, regionTier: 12 });
  world.setSettlement(map, { kind: 'village', style: 'sandstone', built: {}, layout: 'market' });
  // worldInfo needs a zone for this map
  const { TIERS } = require('../monsters'), length = TIERS.length, saved = TIERS[11]; TIERS[11] = { name: 'Test', lv: [100, 130] };
  try {
    const info = world.worldInfo(map);
    assert.equal(info.settlement.layout, 'market'); assert.equal(info.V, Settlement.SAFE_RADIUS.village);
    const client = Settlement.layout(info.settlement.kind, info.settlement.style, info.settlement.built, info.settlement.layout);
    for (const key of Settlement.VENDORS) {
      assert.ok(Math.abs(info.npcs[key].x - (info.CX + client.npcSpots[key].x)) < 1e-9 && Math.abs(info.npcs[key].y - (info.CY + client.npcSpots[key].y)) < 1e-9);
      assert.equal(info.npcs[key].yaw, client.npcSpots[key].yaw);
    }
    assert.equal(info.npcs.portal ? info.npcs.portal.x : info.CX, info.CX);
  } finally { if (saved) TIERS[11] = saved; else { delete TIERS[11]; TIERS.length = length; } }
  // the founding village (map 0) is the Grand Circle, and NPCS still points at it
  world.setSettlement(world.maps[0], { kind: 'village', style: 'timber', built: {}, layout: 'grand' });
  for (const key of Settlement.VENDORS) assert.deepEqual([world.NPCS[key].x, world.NPCS[key].y], [world.npcPosition(world.maps[0], key).x, world.npcPosition(world.maps[0], key).y]);
});

test('village size: about 1.6x the old wall, safe zone matches, and the monster spawn ring stays outside', () => {
  assert.equal(Settlement.DIM.wallR, Math.round(214 * Settlement.VILLAGE_SCALE));
  assert.ok(Settlement.VILLAGE_SCALE >= 1.5 && Settlement.VILLAGE_SCALE <= 2);
  for (const [id, lay] of villages()) {
    assert.ok(lay.safe >= lay.wall.inner, id + ' safe zone covers the inside');
    assert.ok(lay.wall.r + lay.wall.thickness < 400, id + ' fits inside the 400 unit spawn-free ring'); // REGION_SAFE_RADIUS, founding zone min
  }
  assert.equal(world.REGION_SAFE_RADIUS, 400);
});

test('layout selection is deterministic, prefers the biome, keeps old settlement rules, and old saves get a layout', () => {
  const seeded = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const style of STYLES) {
    const a = Settlement.chooseLayout(style, seeded(7)), b = Settlement.chooseLayout(style, seeded(7)); assert.equal(a, b);
    const seen = new Set(); const r = seeded(11); for (let i = 0; i < 400; i++) seen.add(Settlement.chooseLayout(style, r));
    for (const id of seen) assert.ok(Settlement.LAYOUT_WEIGHTS[style][id] > 0, style + ' picks only suitable layouts');
    assert.ok(seen.size >= 3, style + ' gets variety');
  }
  // village / camp / none rules are unchanged
  assert.deepEqual(Settlement.choose('volcanic', 20, () => 0), { kind: 'camp', style: 'ember' });
  assert.deepEqual(Settlement.choose('voidscar', 20, () => 0), { kind: 'camp', style: 'void' });
  assert.deepEqual(Settlement.choose('glacier', 8, () => 0), { kind: 'village', style: 'snow' });
  assert.deepEqual(Settlement.choose('glacier', 9, () => 0.1), { kind: 'none', style: 'snow' });
  assert.deepEqual(Settlement.choose('glacier', 9, () => 0.5), { kind: 'village', style: 'snow' });
  // universe: the founding village is the Grand Circle; an old save without a layout gets a lasting one
  const { createUniverse } = require('../universe');
  const universe = createUniverse({ store: { data: {}, save: async () => {} }, config: { worldSeed: 'LAYOUT-TEST', generatorVersion: 2 }, broadcast: () => {}, messageText: () => '', isAdmin: () => false });
  universe.state.worldTier = 40; universe.state.settlements = { founding: { kind: 'village', style: 'timber', built: {} } }; // an old save, no layout yet
  {
    assert.equal(universe.settlement(1).layout, 'grand');
    for (let tier = 8; tier < 30; tier++) universe.state.settlements[String(tier)] = { kind: tier % 5 ? 'village' : 'camp', style: ['timber', 'snow', 'sandstone', 'dark'][tier % 4], built: {} };
    const first = {};
    for (let tier = 8; tier < 30; tier++) { const s = universe.settlement(tier); if (s.kind === 'village') { assert.ok(Settlement.LAYOUT_WEIGHTS[s.style][s.layout] > 0); first[tier] = s.layout; } else assert.equal(s.layout, undefined); }
    for (const tier in first) assert.equal(universe.settlement(+tier).layout, first[tier], 'kept');
    assert.ok(new Set(Object.values(first)).size >= 4, 'different villages look different');
  }
});

test('the client renderer draws every layout in every style, and camps and portal sites, without errors', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/village.js'), 'utf8');
  let pieces = 0; const meshes = new Proxy({}, { get: (_, key) => key });
  const context = { Settlement, M: meshes, lamps: [], mix: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], WORLD: null, Math, Object, Array, JSON, Number };
  vm.createContext(context); vm.runInContext(source + '\nthis.bakeSettlement = bakeSettlement; this.paintSettlementGround = paintSettlementGround; this.cartPoint = cartPoint;', context);
  const B = (mesh, ...args) => { assert.equal(typeof mesh, 'string'); for (const v of args.slice(0, 8)) assert.ok(v === undefined || Number.isFinite(v), 'finite numbers for ' + mesh); pieces++; };
  const cases = [];
  for (const id of Settlement.LAYOUT_IDS) for (const style of STYLES) cases.push({ kind: 'village', style, layout: id, built: {} });
  for (const style of ['ember', 'void']) cases.push({ kind: 'camp', style, built: { merchant: { by: 'a' } } });
  cases.push({ kind: 'none', style: 'timber', built: {} });
  const counts = {};
  for (const settlement of cases) {
    context.WORLD = { CX: 2500, CY: 2500, settlement, npcs: {} }; context.lamps = [];
    const before = pieces; let seed = 5; context.bakeSettlement(B, () => (seed = (seed * 16807) % 2147483647) / 2147483647);
    counts[settlement.kind + ':' + (settlement.layout || '') + ':' + settlement.style] = pieces - before;
    const g = { fillRect() {}, beginPath() {}, arc() {}, fill() {}, save() {}, restore() {}, translate() {}, rotate() {} };
    context.paintSettlementGround(g, v => v, 1);
  }
  // a big village, but a bounded number of baked pieces (everything is merged into a few buffers)
  for (const [key, n] of Object.entries(counts)) assert.ok(n > (key.startsWith('none') ? 8 : key.startsWith('camp') ? 60 : 200) && n < 6000, key + ': ' + n + ' pieces');
  context.WORLD = { CX: 0, CY: 0, settlement: { kind: 'village', style: 'timber', layout: 'grand', built: {} }, npcs: {} };
  const anvil = context.cartPoint('smith', -10, 0), cart = Settlement.layout('village', 'timber', {}, 'grand').carts.find(c => c.key === 'smith');
  assert.ok(Math.hypot(anvil.x - cart.x, anvil.z - cart.y) < 12, 'the anvil sits on the smith cart');
});
