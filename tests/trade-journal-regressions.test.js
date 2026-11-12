'use strict';
// Prepared for explicit execution on request; no automatic runner or hook is added.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createInventory } = require('../inventory');
const { createTeams } = require('../teams');
const { createAdventure } = require('../adventure');
const { stats, newSk } = require('../characters');
const { NPCS } = require('../game-world');
const noop = () => {};
const item = uid => ({ uid, name: 'Iron Sword', slot: 'weapon', fam: 'sword', ilvl: 10, rar: 0, plus: 0, req: 1, stats: { dmg: 25 } });
function hero(id = 1) { const player = { id, name: 'Hero' + id, cls: 'blade', c: {}, lvl: 10, gold: 1000, souls: 100, xp: 0, bag: [], eq: {}, sk: newSk(), buf: {}, inv: {}, data: {}, x: NPCS.mystic.x, y: NPCS.mystic.y }; stats(player); player.hp = player.maxhp; player.mp = player.maxmp; player.c.p = player; return player; }
function tradeGame() {
  const a = hero(), b = hero(2), players = new Map([[1, a], [2, b]]), packets = [], messages = [], rolls = [];
  a.bag = [item('sword'), item('other')]; b.bag = [item('shield')];
  const send = (connection, packet) => packets.push({ player: connection.p.id, ...packet });
  const inventory = createInventory({ send, say: (p, message) => messages.push(message), toast: noop, broadcast: noop, ev: noop, fire: noop, genGear: () => item('merged'), rerollGear: target => { rolls.push(target.uid); target.stats.dmg = 1; }, applyAffix: () => { rolls.push('affix'); return true; }, isItemReserved: (p, uid) => teams.isItemReserved(p, uid) });
  const teams = createTeams({ players, send, say: (p, message) => messages.push(message), toast: noop, fire: noop, afterGearChange: inventory.afterGearChange });
  teams.chatCommands.invite.fn(a, [b.name]); teams.chatCommands.accept.fn(b);
  teams.handlers.trade(a, { op: 'request', name: b.name }); teams.handlers.trade(b, { op: 'accept' });
  teams.handlers.trade(a, { op: 'offer', uids: ['sword'], gold: 50 }); teams.handlers.trade(b, { op: 'offer', uids: ['shield'], gold: 10 });
  messages.length = 0;
  const confirm = player => { const state = packets.findLast(packet => packet.t === 'trade' && packet.player === player.id && packet.open); teams.handlers.trade(player, { op: 'confirm', id: state.id, revision: state.revision }); };
  return { a, b, teams, inventory, packets, messages, rolls, confirm };
}
test('offered items cannot be mutated or consumed; removing the offer restores normal operations', () => {
  const game = tradeGame(), { a, b, teams, inventory, rolls } = game, original = JSON.stringify(a.bag);
  game.confirm(b);
  for (const operation of [() => inventory.rerollItem(a, 'sword'), () => inventory.affixItem(a, 'sword', 'ls'), () => inventory.lockItem(a, 'sword'), () => inventory.equipItem(a, 'sword'), () => inventory.sellItem(a, 'sword'), () => inventory.doMerge(a, ['sword', 'other']), () => inventory.mergeMythics(a, ['sword', 'other', 'third']), () => inventory.upgradeItem(a, 'sword', true)]) operation();
  assert.equal(JSON.stringify(a.bag), original); assert.deepEqual(rolls, []); assert.equal(a.souls, 100); assert.equal(a.gold, 1000);
  assert.ok(game.messages.every(message => message.key === 'trade.itemReserved'));
  inventory.autoMerge(a, 0); assert.equal(a.bag.length, 2);
  a.x = NPCS.merchant.x; a.y = NPCS.merchant.y; inventory.sellByRarity(a, 4); assert.deepEqual(a.bag.map(item => item.uid), ['sword']);
  teams.handlers.trade(a, { op: 'offer', uids: [], gold: 0 }); a.x = NPCS.mystic.x; a.y = NPCS.mystic.y; inventory.rerollItem(a, 'sword'); assert.deepEqual(rolls, ['sword']);
});
test('external item mutation, replacement, locking or duplicate UIDs revoke both acceptances before payout', () => {
  const mutations = [a => { a.bag[0].stats.dmg = 1; }, a => { a.bag[0] = structuredClone(a.bag[0]); }, a => { a.bag[0].lk = 1; }, a => { a.bag.push(structuredClone(a.bag[0])); }];
  for (const mutate of mutations) {
    const { a, b, packets, confirm } = tradeGame(); confirm(b); mutate(a); confirm(a);
    assert.equal(a.gold, 1000); assert.equal(b.gold, 1000); assert.equal(b.bag.some(item => item.uid === 'sword'), false);
    const update = packets.findLast(packet => packet.t === 'trade'); assert.equal(update.open, true); assert.equal(update.mine.ok, false); assert.equal(update.theirs.ok, false);
  }
});
test('reconfirming a refreshed item trades the visible new state once', () => {
  const { a, b, confirm } = tradeGame(); confirm(b); a.bag[0].stats.dmg = 1; confirm(a);
  confirm(a); confirm(b);
  assert.equal(b.bag.find(item => item.uid === 'sword').stats.dmg, 1); assert.equal(a.gold, 960); assert.equal(b.gold, 1040);
  confirm(b); assert.equal(b.gold, 1040);
});
test('an in-flight confirmation cannot accept a newer offer or a different trade', () => {
  const { a, b, teams, packets, confirm } = tradeGame();
  const state = packets.findLast(packet => packet.t === 'trade' && packet.open), stale = { op: 'confirm', id: state.id, revision: state.revision };
  a.bag[0].stats.dmg = 1; confirm(a); confirm(a);
  teams.handlers.trade(b, stale); assert.equal(a.gold, 1000); assert.equal(b.gold, 1000); assert.equal(packets.at(-1).mine.ok, false);
  teams.handlers.trade(b, { op: 'confirm', id: state.id + 1, revision: packets.at(-1).revision }); assert.equal(a.gold, 1000);
  confirm(b); assert.equal(a.gold, 960); assert.equal(b.gold, 1040);
});
test('an idle open journal receives expired-contract and daily-offer state at the UTC boundary', async () => {
  let now = Date.UTC(2026, 10, 12, 23, 59, 59); const p = hero(), packets = [];
  const service = createAdventure({ send: (c, packet) => { packets.push(packet); return true; }, say: noop, clock: () => now });
  await service.handle(p, { op: 'inspect' }); await service.handle(p, { op: 'accept', kind: 'clear' });
  p.data.adventure.claimed = ['0:stone']; service.flush([p], now);
  service.kill(p, { ty: 'wolf', lvl: 10, x: 6000, y: 6000 });
  const boundary = packets.length; now += 1000; service.flush([p], now);
  const update = packets.at(-1); assert.equal(update.t, 'adventure'); assert.equal(update.day, '2026-11-13'); assert.equal(update.active, null); assert.ok(update.offers.every(offer => !offer.claimed));
  assert.ok(packets.slice(boundary).every(packet => packet.t !== 'adventureUpdate' || packet.active === null));
  assert.equal(p.souls, 100);
});
test('rollover discovered by a stale claim sends a fresh view; failed delivery retries without old progress', async () => {
  let now = Date.UTC(2026, 10, 12, 23, 59, 59), blocked = false; const p = hero(), packets = [];
  const service = createAdventure({ send: (c, packet) => { packets.push(packet); return !blocked; }, say: noop, clock: () => now });
  await service.handle(p, { op: 'inspect' }); await service.handle(p, { op: 'accept', kind: 'clear' });
  now += 1000; await service.handle(p, { op: 'claim' }); assert.equal(packets.at(-1).active, null); assert.equal(packets.at(-1).day, '2026-11-13');
  await service.handle(p, { op: 'accept', kind: 'clear' }); now += 86400000; blocked = true; service.flush([p], now); const count = packets.length;
  service.flush([p], now + 50); assert.equal(packets.length, count); blocked = false; service.flush([p], now + 250); assert.equal(packets.at(-1).day, '2026-11-14'); assert.equal(packets.at(-1).active, null);
});
test('real journal HUD redraws access on death, respawn and leaving NPC range', () => {
  const source = fs.readFileSync(require.resolve('../public/adventure-ui'), 'utf8'); let tick = 0, draws = 0;
  const context = vm.createContext({ WORLD: { map: 0, npcRange: 210, npcs: { merchant: { x: 10, y: 20 } } }, me: { x: 10, y: 20, dead: 0 }, mo: [], performance: { now: () => (tick += 100) }, previousHud: noop, isOpen: () => true, render: () => { draws++; }, $: () => ({ hidden: false }), lastBossRender: 0, lastContractAccess: null });
  vm.runInContext(source.slice(0, source.indexOf('const AdventureUI =')), context);
  vm.runInContext(source.slice(source.indexOf('hud = function () {'), source.indexOf("  document.addEventListener('game-language-change'")), context);
  assert.equal(context.canManageContracts(context.me, context.WORLD), true); context.hud();
  context.me.dead = 5000; assert.equal(context.canManageContracts(context.me, context.WORLD), false); context.hud();
  context.me.dead = 0; context.hud(); context.me.x = 1000; context.hud(); assert.equal(draws, 4); assert.equal(context.canManageContracts(context.me, context.WORLD), false);
});
