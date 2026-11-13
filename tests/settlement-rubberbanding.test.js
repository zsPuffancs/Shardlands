'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const Settlement = require('../public/settlement');
const world = require('../src/world/game-world');
const narrow = { reach: 200, obstacles: [{ type: 'rect', x: 0, y: 0, yaw: 0, w: 8, d: 100, br: 51 }], wall: null };
const source = fs.readFileSync(require.resolve('../public/game'), 'utf8');
function client(layout, position, authoritative = position) {
  const context = vm.createContext({ Settlement, WORLD: { W: 2000, H: 2000, CX: 1000, CY: 1000, layout }, S: { rx: position.x, ry: position.y }, me: { ...authoritative, spd: 190, dead: 0 }, intent: null, direction: [0, 0], wantDir: () => context.direction, animate() {} });
  vm.runInContext(source.slice(source.indexOf('function updateSelf(d)'), source.indexOf('let nextFrameAt =')), context); return context;
}
test('walking into, parallel to, and then away from a wall stays clear without backward pulls', () => {
  const p = { x: -25, y: 0 };
  for (let tick = 0; tick < 30; tick++) { const before = { ...p }; p.x += 9.5; Settlement.moveWithCollision(p, narrow, 0, 0, 11, before); assert.ok(p.x <= -15 + 1e-6); }
  const y = p.y; for (let i = 0; i < 3; i++) { const before = { ...p }; p.y += 9.5; Settlement.moveWithCollision(p, narrow, 0, 0, 11, before); assert.ok(p.x <= -15 + 1e-6); }
  assert.ok(p.y > y);
  for (let i = 0; i < 10; i++) { const before = { ...p }; p.x -= 9.5; Settlement.moveWithCollision(p, narrow, 0, 0, 11, before); assert.ok(p.x < before.x - 9); }
});
test('the real Grand Circle overlapping wall regression recovers to a fully clear nearby point', () => {
  const lay = Settlement.layout('village', 'timber', {}, 'grand'), previous = { x: 288.1653436056328, y: 183.58157064777996 }, p = { ...previous };
  assert.equal(Settlement.isPositionValid(p, lay, 0, 0), false);
  Settlement.moveWithCollision(p, lay, 0, 0, 11, previous);
  assert.equal(Settlement.isPositionValid(p, lay, 0, 0), true); assert.ok(Math.hypot(p.x - previous.x, p.y - previous.y) < 50);
  const settled = { ...p }; for (let i = 0; i < 30; i++) Settlement.moveWithCollision(p, lay, 0, 0, 11, { ...p }); assert.deepEqual(p, settled);
});
test('all layouts recover from building centres, towers, wall corners and gate endpoints without changing geometry', () => {
  for (const id of Settlement.LAYOUT_IDS) {
    const lay = Settlement.layout('village', 'timber', {}, id), frozen = JSON.stringify(lay);
    const points = [...lay.obstacles.map(o => ({ x: o.x, y: o.y })), ...lay.wall.towers.map(t => ({ x: t.x, y: t.y })), ...lay.wall.segments.flatMap(s => [{ x: s.x1, y: s.y1 }, { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 }])];
    for (const start of points) {
      const p = { ...start }; Settlement.moveWithCollision(p, lay, 0, 0, 11, start);
      assert.equal(Settlement.isPositionValid(p, lay, 0, 0), true, id + ' ' + JSON.stringify(start));
      assert.ok(Math.hypot(p.x - start.x, p.y - start.y) < 150, id + ' bounded recovery');
    }
    assert.equal(JSON.stringify(lay), frozen);
  }
});
test('sub-threshold server positions behind solid walls reconcile instead of remaining trapped forever', () => {
  const c = client(narrow, { x: 985, y: 1000 }, { x: 1015, y: 1000 });
  for (let i = 0; i < 180; i++) c.updateSelf(1 / 60);
  assert.ok(Math.abs(c.S.rx - c.me.x) < 1e-5); assert.ok(Settlement.isPositionValid({ x: c.S.rx, y: c.S.ry }, narrow, 1000, 1000));
  c.direction = [1, 0]; c.updateSelf(1 / 60); assert.ok(c.S.rx > 1015);
});
test('clear prediction around corners is smoothed, not snapped to a stale snapshot', () => {
  const lay = { reach: 200, obstacles: [{ type: 'circle', x: 0, y: 0, r: 20, br: 20 }], wall: null };
  const c = client(lay, { x: 1032, y: 1000 }, { x: 1000, y: 1032 }); c.updateSelf(1 / 60);
  assert.ok(Math.hypot(c.S.rx - 1032, c.S.ry - 1000) < 10); assert.ok(Settlement.isPositionValid({ x: c.S.rx, y: c.S.ry }, lay, 1000, 1000));
});
test('authoritative resets from invalid geometry use the same reliable recovery as walking', () => {
  const lay = Settlement.layout('village', 'timber', {}, 'grand'), c = client(lay, { x: 1600, y: 1600 }, { x: 1288.1653436056328, y: 1183.58157064777996 });
  c.updateSelf(1 / 60); assert.ok(Settlement.isPositionValid({ x: c.S.rx, y: c.S.ry }, lay, 1000, 1000));
});
test('server world-coordinate recovery and local client recovery agree for all layouts', () => {
  const map = world.addMap(6, { tier: 0 });
  for (const id of Settlement.LAYOUT_IDS) {
    world.setSettlement(map, { kind: 'village', style: 'timber', built: {}, layout: id });
    const lay = world.layoutOf(map);
    for (const s of lay.wall.segments.slice(0, 12)) {
      const local = { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 }, server = { x: map.cx + local.x, y: map.cy + local.y }, p = { ...local };
      world.collideSettlement(server, { ...server }, 11); Settlement.moveWithCollision(p, lay, 0, 0, 11, { ...p });
      assert.ok(Math.hypot(server.x - map.cx - p.x, server.y - map.cy - p.y) < 1e-5, id + ' translation agreement');
    }
  }
});
test('repeated keyboard/click prediction and 20Hz server updates stay clear and escape the wall smoothly', () => {
  for (const mode of ['keyboard', 'click']) {
    const c = client(narrow, { x: 975, y: 1000 }), server = { x: 975, y: 1000 };
    for (let frame = 0; frame < 240; frame++) {
      const sign = frame < 120 ? 1 : -1;
      c.direction = mode === 'keyboard' ? [sign, 0] : [0, 0]; c.intent = mode === 'click' ? { x: sign > 0 ? 1100 : 500, y: 1000 } : null;
      if (frame % 3 === 0) { const previous = { ...server }; server.x += sign * 190 * .05; Settlement.moveWithCollision(server, narrow, 1000, 1000, 11, previous); c.me.x = server.x; }
      const before = c.S.rx; c.updateSelf(1 / 60);
      assert.ok(Settlement.isPositionValid({ x: c.S.rx, y: c.S.ry }, narrow, 1000, 1000));
      if (frame > 122) assert.ok(c.S.rx <= before + 1e-6, mode + ' no backward pull while escaping');
    }
    assert.ok(server.x < 850 && c.S.rx < 850);
  }
});
