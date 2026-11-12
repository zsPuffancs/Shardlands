'use strict';
// Prepared for explicit execution on user request; no automatic test runner is installed.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { MAX_CURRENCY, MAX_ITEM_STACK, MAX_SUMMONS_GLOBAL, MAX_SUMMONS_PER_MAP, MAX_SUMMONS_PER_SOURCE, credit, boundedRateSettings, commandAllowed } = require('../src/shared/safety-limits');
const { createLoot } = require('../src/economy/loot');
const { createInventory } = require('../src/economy/inventory');
const { createSummons } = require('../src/combat/summons');
const { newSk, stats, createProgression } = require('../src/player/characters');
const { NPCS, addMap } = require('../src/world/game-world');
const noop = () => {};
function hero(npc = 'merchant') { const p = { id: 1, c: {}, cls: 'archer', lvl: 1, xp: 0, sp: 0, eq: {}, bag: [], sk: newSk(), buf: {}, inv: { hp: 1 }, souls: 0, gold: 1000000, x: NPCS[npc].x, y: NPCS[npc].y }; stats(p); p.hp = p.maxhp; p.mp = p.maxmp; return p; }
function inventory(extra = {}) { return createInventory({ send: noop, say: noop, toast: noop, broadcast: noop, ev: noop, fire: noop, genGear: noop, rerollGear: noop, ...extra }); }
test('legacy over-cap stacks remain intact; new credit cannot overflow safe integers', () => {
  const stack = { hp: MAX_ITEM_STACK + 10 }; assert.equal(credit(stack, 'hp', 5, MAX_ITEM_STACK), 0); assert.equal(stack.hp, MAX_ITEM_STACK + 10);
  const wallet = { gold: MAX_CURRENCY - 2 }; assert.equal(credit(wallet, 'gold', 100), 2); assert.equal(wallet.gold, MAX_CURRENCY); assert.equal(credit(wallet, 'gold', Infinity), 0);
});
test('rate limits apply both to config assignments and subsequent admin/plugin writes', () => {
  const rates = boundedRateSettings({ xpRate: 1, gearDropRate: 1, deathGoldLoss: .1 }); rates.gearDropRate = 1e300; assert.equal(rates.gearDropRate, 1000);
  rates.xpRate = Infinity; assert.equal(rates.xpRate, 1); rates.deathGoldLoss = 999; assert.equal(rates.deathGoldLoss, 1);
});
test('high-tier stones generate at most ten equipment drops', () => {
  const loot = new Map(); let id = 0, gear = 0;
  const service = createLoot({ loot, players: new Map(), allocateId: () => ++id, rates: { goldRate: 0, gearDropRate: 1e200, potionDropRate: 0 }, ev: noop, say: noop, toast: noop, broadcast: noop, addGear: noop, genGear: () => { gear++; return { name: 'Item', rar: 2 }; }, rollRarity: () => 2 });
  service.dropLoot(hero(), { ty: 'stone', tier: 1000000, lvl: 100, gm: 1, x: 6000, y: 6000 }); assert.equal(gear, 10);
});
test('partial pickup leaves excess on the ground and a full stack does not consume gold', () => {
  const p = hero(), loot = new Map(); p.inv.hp = MAX_ITEM_STACK - 1; let id = 0;
  const service = createLoot({ loot, players: new Map([[p.id, p]]), allocateId: () => ++id, rates: {}, ev: noop, say: noop, toast: noop, broadcast: noop, addGear: noop });
  const drop = service.dropAt(p.x, p.y, { kind: 'item', k: 'hp', n: 3, name: 'Health Potion' }, p.id); service.pickupTick(Date.now());
  assert.equal(p.inv.hp, MAX_ITEM_STACK); assert.equal(drop.n, 2); assert.ok(loot.has(drop.id));
  const gold = p.gold; inventory().buyItem(p, 'hp', 1); assert.equal(p.gold, gold); assert.equal(p.inv.hp, MAX_ITEM_STACK);
});
test('sales reject wallet overflow and preserve locked items', () => {
  const p = hero(), service = inventory(); p.gold = MAX_CURRENCY; p.bag = [{ uid: 'a', ilvl: 1, rar: 0, plus: 0 }, { uid: 'b', ilvl: 1, rar: 0, plus: 0, lk: 1 }];
  service.sellByRarity(p, 0); assert.equal(p.bag.length, 2); p.gold = 0; service.sellByRarity(p, 0); assert.deepEqual(p.bag.map(i => i.uid), ['b']); assert.equal(p.gold, 8);
});
test('automatic forging yields between batches and stops when equipment is removed', () => {
  const p = hero('smith'), packets = [], service = inventory({ send: (c, m) => packets.push(m) });
  const item = { uid: 'weapon', slot: 'weapon', rar: 0, ilvl: 1, stats: {}, plus: 1 }; p.eq.weapon = item; p.gold = 1000000000;
  const random = Math.random; Math.random = () => .999;
  try {
    service.upgradeItem(p, item.uid, true); assert.equal(packets.at(-1).pending, true); assert.equal(p.gold, 1000000000);
    service.processJobs(); const progress = packets.findLast(m => m.t === 'forge'); assert.equal(progress.attempts, 25); assert.equal(progress.pending, true);
    const balance = p.gold; p.eq.weapon = null; service.processJobs(); assert.equal(p.gold, balance); assert.equal(packets.findLast(m => m.t === 'forge').cancelled, true);
  } finally { Math.random = random; }
});
test('summons share source, map and global quotas', () => {
  const mobs = new Map(); let id = 0;
  const service = createSummons({ mobs, spawnMob: (ty, x, y) => { const m = { id: ++id, ty, x, y }; mobs.set(m.id, m); return m; } });
  const source = { id: 1, tier: 0, x: 6000, y: 6000 }, requests = Array.from({ length: 1000 }, () => ({ type: 'wolf', x: 6000, y: 6000 }));
  assert.equal(service.spawnBatch(source, requests).length, MAX_SUMMONS_PER_SOURCE); assert.equal(service.spawnBatch(source, requests).length, 0);
  service.spawnBatch({ ...source, id: 2 }, requests); assert.equal(mobs.size, MAX_SUMMONS_PER_MAP);
  assert.equal(service.spawnBatch({ ...source, id: 3 }, requests).length, 0);
  const other = addMap(1, {});
  for (const monster of mobs.values()) { monster.x = other.x0 + 1000; monster.y = other.y0 + 1000; }
  while (mobs.size < MAX_SUMMONS_GLOBAL) mobs.set(++id, { id, x: other.x0 + 1000, y: other.y0 + 1000, summoned: true });
  assert.equal(service.spawnBatch({ ...source, id: 4 }, requests).length, 0);
});
test('command throttling recovers over time without growing buckets for unknown types', () => {
  const c = {}; for (let i = 0; i < 6; i++) assert.equal(commandAllowed(c, 'chat', 1000), true); assert.equal(commandAllowed(c, 'chat', 1000), false);
  assert.equal(commandAllowed(c, 'chat', 2000), true); for (let i = 0; i < 1000; i++) commandAllowed(c, 'unknown-' + i, 2000); assert.equal(Object.keys(c.commandBudget).length, 6);
});
test('large XP awards are finite and level processing has a per-tick work budget', () => {
  const p = hero(), service = createProgression({ fire: noop, ev: noop, say: noop, toast: noop, broadcast: noop, sendInv: noop });
  service.gainXp(p, Infinity); assert.equal(p.xp, 0); service.gainXp(p, 1e12); assert.equal(p.lvl, 1); service.processLevels([p]); assert.equal(p.lvl, 6); assert.ok(Number.isSafeInteger(p.xp));
});
test('all renderer entry points obey shared caps and preserve room for warnings', () => {
  const source = fs.readFileSync(require.resolve('../public/game.js'), 'utf8'), context = vm.createContext({ parts: [], fxs: [], S: { rx: 0, ry: 0 } });
  vm.runInContext(source.slice(source.indexOf('const MAX_PARTICLES'), source.indexOf('function addRing(')), context);
  for (let i = 0; i < 1000; i++) context.addParticle({}); assert.equal(context.parts.length, 700);
  for (let i = 0; i < 1000; i++) context.addEffect({ k: 'ring' }); assert.equal(context.fxs.length, 192);
  for (let i = 0; i < 100; i++) context.addEffect({ k: 'tele', x: i, z: 0, r: 10 }); assert.equal(context.fxs.length, 256); assert.ok(context.fxs.some(fx => fx.k === 'tele'));
});
