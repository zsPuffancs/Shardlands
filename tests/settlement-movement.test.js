'use strict';
// Prepared for explicit execution on user request; no automatic test hook.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const Settlement = require('../public/settlement');
const narrow = { reach: 200, obstacles: [{ type: 'rect', x: 0, y: 0, yaw: 0, w: 8, d: 100, br: 51 }], wall: null };

test('a normal server step cannot choose the opposite face of a thin building', () => {
  const previous = { x: -15, y: 0 }, endpoint = { x: 5, y: 0 };
  assert.equal(Settlement.moveWithCollision(endpoint, narrow, 0, 0, 11, previous), true);
  assert.ok(endpoint.x <= -15 + 1e-6); assert.ok(Math.hypot(endpoint.x - previous.x, endpoint.y - previous.y) <= 20 + 1e-6);
});
test('a long client frame cannot skip the whole footprint and repeated clicks never catch up through it', () => {
  const position = { x: -35, y: 0 };
  for (let tick = 0; tick < 100; tick++) {
    const previous = { ...position }; position.x += 100;
    Settlement.moveWithCollision(position, narrow, 0, 0, 11, previous);
    assert.ok(position.x <= -15 + 1e-6); assert.equal(position.y, 0);
  }
});
test('rotated footprints block the path while allowing movement along their near face', () => {
  const yaw = .7, lay = { ...narrow, obstacles: [{ ...narrow.obstacles[0], yaw }] };
  const world = (u, v) => ({ x: u * Math.cos(yaw) + v * Math.sin(yaw), y: -u * Math.sin(yaw) + v * Math.cos(yaw) });
  const previous = world(-15, 0), endpoint = world(80, 25);
  Settlement.moveWithCollision(endpoint, lay, 0, 0, 11, previous);
  const u = endpoint.x * Math.cos(yaw) - endpoint.y * Math.sin(yaw), v = endpoint.x * Math.sin(yaw) + endpoint.y * Math.cos(yaw);
  assert.ok(u <= -15 + 1e-6); assert.ok(v > 0 && v <= 25 + 1e-6);
});
test('crossing paths outside the settlement stay unchanged, and excessive moves inside are bounded', () => {
  const clear = { x: 1000, y: 1000 }; assert.equal(Settlement.moveWithCollision(clear, narrow, 0, 0, 11, { x: 900, y: 1000 }), false); assert.deepEqual(clear, { x: 1000, y: 1000 });
  const empty = { reach: 1000, obstacles: [], wall: null }, endpoint = { x: 10000, y: 0 };
  assert.equal(Settlement.moveWithCollision(endpoint, empty, 0, 0, 11, { x: 0, y: 0 }), true); assert.ok(endpoint.x <= 352 + 1e-6);
});
test('NaN endpoints are rejected and newly built scenery can depenetrate a stationary character', () => {
  const invalid = { x: NaN, y: 0 }; Settlement.moveWithCollision(invalid, narrow, 0, 0, 11, { x: -20, y: 0 }); assert.deepEqual(invalid, { x: -20, y: 0 });
  const embedded = { x: 0, y: 0 }; assert.equal(Settlement.moveWithCollision(embedded, narrow, 0, 0, 11, { ...embedded }), true); assert.ok(Math.abs(embedded.x) >= 15);
});
test('real client prediction respects the building and still accepts explicit authoritative corrections', () => {
  const source = fs.readFileSync(require.resolve('../public/game'), 'utf8');
  const browser = vm.createContext({ Settlement, WORLD: { W: 1000, H: 1000, CX: 200, CY: 200, layout: narrow }, S: { rx: 165, ry: 200 }, me: { x: 165, y: 200, spd: 400 }, intent: { x: 400, y: 200 }, wantDir: () => [0, 0], animate() {} });
  vm.runInContext(source.slice(source.indexOf('function updateSelf(d)'), source.indexOf('let nextFrameAt =')), browser);
  browser.updateSelf(.25); assert.ok(browser.S.rx <= 185 + 1e-6);
  // A trusted correction to a clear point on the other side is not swept back through the wall.
  browser.me.x = 600; browser.me.y = 200; browser.updateSelf(.016); assert.equal(browser.S.rx, 600);
});
