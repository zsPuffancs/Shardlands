'use strict';
// The dark-fantasy village kit (public/village-kit.js), run headless with a stub GPU: geometry, palettes,
// placement against the shared layout (portal, NPC -> cart order, buildings, walls, decoration) and draw budgets.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Settlement = require('../public/settlement');

function loadKit() {
  const STRIDE = 17, meshes = [];
  const GL = {
    STRIDE, meshFromArray: arr => { const m = { arr }; meshes.push(m); return m; },
    instWrite(A, o, x, y, z, sx, sy, sz, yaw, col, emis) { const c = Math.cos(yaw), s = Math.sin(yaw); A.set([c * sx, 0, s * sz, x, 0, sy, 0, y, -s * sx, 0, c * sz, z, col[0], col[1], col[2], 1, emis || 0], o); },
    pushInst() {}, sky: () => ({ d: 1 }),
  };
  const context = { GL, Settlement, Math, Object, Array, JSON, Number, Float32Array, Map, Set, D() {}, M: {}, burst() {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/village-kit.js'), 'utf8') + '\nthis.VillageKit = VillageKit;', context);
  return { kit: context.VillageKit, meshes };
}

test('every asset is valid low-poly geometry with a sensible triangle budget', () => {
  const { kit } = loadKit(), built = kit.build();
  const names = Object.keys(kit.RECIPES);
  assert.ok(names.length >= 35, names.length + ' assets');
  for (const required of ['portal', 'cartMerchant', 'cartSmith', 'cartMystic', 'stationMerchant', 'stationSmith', 'stationMystic', 'houseCottage', 'houseStone', 'houseTown', 'houseTower',
    'wall', 'tower', 'gateTower', 'gateArch', 'marketStall', 'well', 'forge', 'lantern', 'deadTree', 'bush', 'rock', 'barrels', 'crates', 'fence', 'sign', 'supplies', 'bones', 'wreck']) assert.ok(built[required], required);
  let total = 0;
  for (const [name, asset] of Object.entries(built)) {
    let tris = 0;
    for (const { mat, mesh } of asset.meshes) {
      const a = mesh.arr; assert.equal(a.length % 18, 0, name + ' whole triangles');
      for (let i = 0; i < a.length; i += 6) {
        for (let k = 0; k < 6; k++) assert.ok(Number.isFinite(a[i + k]), name + ' finite');
        assert.ok(Math.abs(Math.hypot(a[i + 3], a[i + 4], a[i + 5]) - 1) < 1e-4, name + ' unit normals');
      }
      tris += a.length / 18;
      assert.ok(kit.KIT_PALETTES.dark[mat], name + ' uses a palette material: ' + mat);
    }
    assert.ok(tris > 10 && tris < 3000, name + ': ' + tris + ' triangles');
    total += tris;
  }
  assert.ok(total < 20000, 'whole kit ' + total + ' triangles');
  // the portal is the tallest, widest piece: its silhouette reads from afar
  const height = a => { let h = 0; for (const { mesh } of a.meshes) for (let i = 1; i < mesh.arr.length; i += 6) h = Math.max(h, mesh.arr[i]); return h; };
  assert.ok(height(built.portal) > 180 && height(built.portal) > height(built.houseChapel), 'portal ' + height(built.portal));
});

test('palettes: every style defines every material the kit uses, glow is controlled', () => {
  const { kit } = loadKit(), built = kit.build(), used = new Set();
  for (const a of Object.values(built)) for (const m of a.meshes) used.add(m.mat);
  for (const [style, pal] of Object.entries(kit.KIT_PALETTES)) {
    for (const mat of used) assert.ok(pal[mat], style + ' lacks ' + mat);
    for (const [mat, v] of Object.entries(pal)) {
      const [col, emis] = Array.isArray(v[0]) ? v : [v, 0];
      assert.ok(col.every(c => c >= 0 && c <= 1) && emis <= 1, style + ' ' + mat);
      if (style === 'dark' && !emis) assert.ok(Math.max(...col) < .66, 'dark ' + mat + ' stays muted');
    }
  }
  for (const style of ['timber', 'snow', 'sandstone', 'dark', 'ember', 'void']) assert.ok(kit.KIT_PALETTES[style], style + ' palette prepared');
});

test('placement follows the shared layout: portal at the centre, NPC -> cart order, every building and wall piece', () => {
  for (const id of Settlement.LAYOUT_IDS) {
    const { kit } = loadKit(), lay = Settlement.layout('village', 'dark', {}, id), CX = 2500, CY = 2500;
    assert.equal(kit.place(lay, CX, CY, 'dark'), true);
    const log = kit.placements();
    const portal = log.filter(p => p.key === 'portal'); assert.equal(portal.length, 1); assert.deepEqual([portal[0].x, portal[0].z], [CX, CY]);
    for (const key of Settlement.VENDORS) {
      const cartKey = { merchant: 'cartMerchant', smith: 'cartSmith', mystic: 'cartMystic' }[key], stationKey = cartKey.replace('cart', 'station');
      const cart = log.find(p => p.key === cartKey), station = log.find(p => p.key === stationKey), spot = lay.npcSpots[key], c = lay.carts.find(k => k.key === key);
      assert.ok(cart && station, id + ' ' + key);
      assert.ok(Math.abs(cart.x - (CX + c.x)) < 1e-9 && Math.abs(cart.z - (CY + c.y)) < 1e-9 && cart.yaw === c.yaw && station.x === cart.x && station.yaw === cart.yaw);
      // Portal -> NPC -> cart, and the cart's front (+z) looks at the portal
      const dn = Math.hypot(spot.x, spot.y), dc = Math.hypot(c.x, c.y); assert.ok(dc > dn + 20);
      const front = [Math.sin(cart.yaw), Math.cos(cart.yaw)], toPortal = [-c.x / dc, -c.y / dc]; assert.ok(front[0] * toPortal[0] + front[1] * toPortal[1] > .9999);
    }
    const kinds = new Set(['houseCottage', 'houseStone', 'houseTown', 'houseTower', 'houseChapel', 'forge']);
    assert.equal(log.filter(p => kinds.has(p.key)).length, lay.houses.length, id + ' one asset per building');
    assert.ok(log.filter(p => p.key === 'wall').length >= lay.wall.segments.length, id + ' wall modules');
    assert.equal(log.filter(p => p.key === 'gateArch').length, 4); assert.equal(log.filter(p => p.key === 'gateTower').length, 8);
    // every lamp of the layout becomes a lantern, every stall a market stall
    assert.equal(log.filter(p => p.key === 'lantern').length, lay.props.filter(p => p.type === 'lamp').length);
    assert.equal(log.filter(p => p.key === 'marketStall').length, lay.props.filter(p => p.type === 'stall').length);
    const s = kit.stats(); assert.ok(s.instances > 150 && s.groups <= 200, id + ' ' + JSON.stringify(s));
  }
});

test('decoration stays off roads, doorsteps, the plaza, NPC areas and anything solid', () => {
  const DECOR = new Set(['barrels', 'crates', 'supplies', 'fence', 'bones', 'wreck', 'sign', 'bush', 'rock', 'deadTreeB']);
  for (const id of Settlement.LAYOUT_IDS) {
    const { kit } = loadKit(), lay = Settlement.layout('village', 'dark', {}, id), CX = 0, CY = 0;
    kit.place(lay, CX, CY, 'dark');
    const fromLayout = new Set(lay.props.map(p => Math.round(p.x) + ',' + Math.round(p.y)));
    const scatter = kit.placements().filter(p => DECOR.has(p.key) && !fromLayout.has(Math.round(p.x) + ',' + Math.round(p.z)));
    assert.ok(scatter.length >= 10, id + ' has ' + scatter.length + ' details');
    for (const d of scatter) {
      const c = { type: 'circle', x: d.x, y: d.z, r: 6 };
      assert.ok(Math.hypot(d.x, d.z) > lay.plazaR + 20, id + ' off the plaza');
      for (const road of lay.roads) assert.ok(!Settlement.overlaps(c, road), id + ' off the roads');
      for (const o of lay.obstacles) assert.ok(!Settlement.overlaps(c, o), id + ' not inside a building');
      for (const h of lay.houses) assert.ok(Math.hypot(d.x - (h.x + Math.sin(h.yaw) * (h.d / 2 + 17)), d.z - (h.y + Math.cos(h.yaw) * (h.d / 2 + 17))) > 13, id + ' off doorsteps');
      for (const n of Object.values(lay.npcSpots)) assert.ok(Math.hypot(n.x - d.x, n.y - d.z) > 30, id + ' away from NPCs');
    }
  }
});

test('repeated decoration is instanced: many copies, few draw calls, identical across clients', () => {
  const a = loadKit(), b = loadKit(), lay = Settlement.layout('village', 'dark', {}, 'grand');
  a.kit.place(lay, 100, 100, 'dark'); b.kit.place(lay, 100, 100, 'dark');
  assert.equal(JSON.stringify(a.kit.placements()), JSON.stringify(b.kit.placements()), 'deterministic: every client builds the same village');
  const s = a.kit.stats();
  assert.ok(s.instances / s.groups > 4, 'about ' + (s.instances / s.groups).toFixed(1) + ' instances per draw call');
  const lanterns = a.kit.placements().filter(p => p.key === 'lantern').length; assert.ok(lanterns > 20);
  // non-village settlements are left to the base renderer
  assert.equal(a.kit.place(Settlement.layout('camp', 'dark', {}), 0, 0, 'dark'), false); assert.equal(a.kit.isActive(), false);
});
