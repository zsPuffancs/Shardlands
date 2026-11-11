'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { estimate, rollValue } = require('../public/affix-math');
const { affixRange, AFFIXES, AFFIX_COST, RARITY, createEquipment } = require('../equipment');
const { createAutoAffixJobs } = require('../auto-affix-jobs');
const { AUTO_AFFIX_LIMITS } = require('../safety-limits');
const { createInventory } = require('../inventory');
const { newSk, stats } = require('../characters');
const { NPCS, maps, addMap } = require('../game-world');
const { createGameSaves } = require('../persistence');
const { createTeams } = require('../teams');
const { createPlayerSessions } = require('../player-session');
const noop = () => {};
function hero(id = 1) { const p = { id, name: 'Hero' + id, c: {}, cls: 'archer', lvl: 100, xp: 100, sp: 20, gold: 10000, souls: 1000000, bag: [], eq: {}, inv: {}, sk: newSk(), buf: {}, x: NPCS.mystic.x, y: NPCS.mystic.y }; stats(p); p.hp = p.maxhp; p.mp = p.maxmp; p.c.p = p; return p; }
function item(uid = 'target', extra = {}) { return { uid, name: 'Iron Sword', slot: 'weapon', fam: 'sword', ilvl: 100, rar: 3, plus: 7, req: 1, stats: { dmg: 123, crit: 5 }, psk: { might: 2 }, lk: 1, ...extra }; }
function productionRoll(units = [0]) { const real = createEquipment({ rates: { rarityBoost: 0 } }).applyAffix; let index = 0; return (item, key) => { const original = Math.random; Math.random = () => units[Math.min(index++, units.length - 1)]; try { return real(item, key); } finally { Math.random = original; } }; }
function setup({ roll = productionRoll(), reserved = () => false } = {}) {
  const packets = [], inventories = [], persisted = [], refreshed = [], online = new Set(); let now = 1000;
  const jobs = createAutoAffixJobs({ applyAffix: roll, send: (c, packet) => packets.push({ id: c.p?.id, ...packet }), sendInventory: p => inventories.push(p.id), refreshStats: p => refreshed.push(p.id), persistPlayer: p => persisted.push({ id: p.id, souls: p.souls, item: JSON.stringify(p.bag[0] || p.eq.weapon) }), isItemReserved: reserved, isPlayerOnline: p => online.has(p.id), clock: () => now });
  const player = hero(); player.bag = [item()]; online.add(player.id);
  const range = affixRange(player.bag[0], 'aspd');
  const request = { uid: 'target', key: 'aspd', minimum: estimate({ ...range, minimum: 0, attempts: 1, budget: 15, souls: 15, cost: 5 }).maxValue, maxAttempts: 1000, maxSouls: 100000 };
  return { jobs, player, online, packets, inventories, persisted, refreshed, request, advance: ms => { now += ms; }, last: () => packets.filter(packet => packet.t === 'autoAffixStatus').at(-1)?.job };
}

test('shared rounding and ranges exactly match existing affix production formula', () => {
  for (const key of Object.keys(AFFIXES)) for (const level of [1, 10, 100, 9999, 10000]) for (let rarity = 0; rarity < RARITY.length; rarity++) {
    const target = item('x', { ilvl: level, rar: rarity }), range = affixRange(target, key), base = AFFIXES[key].f(level) * (.6 + .4 * RARITY[rarity].m);
    assert.equal(range.base, base); assert.equal(range.low, base * .85); assert.equal(range.high, base * 1.15);
    for (const unit of [0, .1, .5, .99, 1 - Number.EPSILON / 2]) {
      const expected = Math.round(base * (.85 + unit * (1.15 - .85)) * 10) / 10;
      assert.equal(rollValue(base, range.spread, unit), expected); productionRoll([unit])(target, key); assert.equal(target.afx.v, expected);
    }
  }
});

test('probability estimator includes rounding thresholds, impossible/guaranteed cases and stable large N', () => {
  const args = { low: 1, high: 2, minimum: 1.5, attempts: 10, budget: 100, souls: 100, cost: 2 };
  const result = estimate(args); assert.ok(Math.abs(result.probability - .55) < 1e-12); assert.equal(result.minValue, 1); assert.equal(result.maxValue, 2); assert.ok(Math.abs(result.chanceWithin - (1 - .45 ** 10)) < 1e-12);
  assert.ok(Math.abs(result.expectedAttempts - 1 / .55) < 1e-12); assert.ok(Math.abs(result.expectedSouls - result.chanceWithin / .55 * 2) < 1e-12);
  assert.equal(estimate({ ...args, minimum: 2.1 }).impossible, true); assert.equal(estimate({ ...args, minimum: 1 }).guaranteed, true);
  assert.equal(estimate({ ...args, attempts: 1000000000000 }).effectiveAttempts, 50);
  const large = estimate({ low: 0, high: 100000, minimum: 100000, attempts: 1000000, budget: 1000000, souls: 1000000, cost: 1 }); assert.ok(large.probability > 0 && large.probability < 1e-5); assert.ok(Number.isFinite(large.chanceWithin) && large.chanceWithin > 0 && large.chanceWithin < 1);
  assert.equal(estimate({ ...args, budget: 0 }).chanceWithin, 0);
  assert.equal(estimate({ ...args, low: 1.23, high: 1.23, minimum: 1.2 }).probability, 1);
  const beforeRandom = Math.random; Math.random = () => { throw Error('Estimator consumed RNG'); }; try { estimate(args); } finally { Math.random = beforeRandom; }
});

test('success stops on the first matching roll and never spends after completion', () => {
  for (const units of [[.999], [0, .5, .999]]) {
    const game = setup({ roll: productionRoll(units) }); game.jobs.start(game.player, game.request); assert.equal(game.player.souls, 1000000); assert.equal(game.last().status, 'running');
    game.jobs.process(); const final = game.last(); assert.equal(final.status, 'success'); assert.equal(final.attempts, units.length); assert.equal(final.spent, units.length * 5); assert.equal(final.current.k, 'aspd'); assert.ok(final.current.v >= game.request.minimum); const balance = game.player.souls;
    for (let i = 0; i < 10; i++) game.jobs.process(); assert.equal(game.player.souls, balance); assert.equal(game.jobs.activeCount(), 0);
  }
});

test('attempt, spending and Souls limits stop exactly and current-best are distinct', () => {
  const attempts = setup({ roll: productionRoll([.8, 0]) }); attempts.jobs.start(attempts.player, { ...attempts.request, maxAttempts: 2 }); attempts.jobs.process(); assert.equal(attempts.last().status, 'attempts_exhausted'); assert.equal(attempts.last().attempts, 2); assert.ok(attempts.last().best > attempts.last().current.v); assert.equal(attempts.last().spent, 10);
  const budget = setup(); budget.jobs.start(budget.player, { ...budget.request, maxSouls: 12 }); budget.jobs.process(); assert.equal(budget.last().status, 'budget_exhausted'); assert.equal(budget.last().attempts, 2); assert.equal(budget.last().spent, 10); assert.equal(budget.last().remainingBudget, 2);
  const balance = setup(); balance.player.souls = 11; balance.jobs.start(balance.player, balance.request); balance.jobs.process(); assert.equal(balance.last().status, 'insufficient_souls'); assert.equal(balance.player.souls, 1); assert.equal(balance.last().attempts, 2);
});

test('zero-attempt success precedes budgets, insufficient funds and impossible reroll ranges', () => {
  const game = setup(); game.player.souls = 0; game.player.bag[0].afx = { k: 'aspd', v: 1000 }; game.jobs.start(game.player, { ...game.request, minimum: 1000, maxSouls: 0 }); assert.equal(game.last().status, 'success'); assert.equal(game.last().reason, 'already_satisfied'); assert.equal(game.last().attempts, 0); assert.equal(game.last().spent, 0); assert.equal(game.last().best, null);
  const zero = setup(); zero.jobs.start(zero.player, { ...zero.request, maxSouls: 0 }); assert.equal(zero.last().status, 'budget_exhausted'); assert.equal(zero.last().attempts, 0);
});

test('duplicate starts, cancellation before/after work and repeated Stop never duplicate/refund charges', () => {
  const game = setup(); game.jobs.start(game.player, game.request); assert.equal(game.jobs.start(game.player, game.request), false); assert.equal(game.packets.at(-1).error, 'already_running');
  game.jobs.stop(game.player); assert.equal(game.last().attempts, 0); assert.equal(game.player.souls, 1000000); game.jobs.stop(game.player); assert.equal(game.player.souls, 1000000);
  game.jobs.start(game.player, game.request); game.jobs.process(); const balance = game.player.souls, attempts = game.last().attempts; game.jobs.stop(game.player); assert.equal(game.last().status, 'stopped'); assert.equal(game.last().attempts, 10); assert.equal(game.player.souls, balance); game.jobs.stop(game.player); assert.equal(game.player.souls, balance); assert.ok(attempts <= 10);
});

test('strict limits, unknown UIDs/keys and unsupported slots are rejected without spending', () => {
  const game = setup(); const invalid = [{ minimum: NaN }, { minimum: Infinity }, { minimum: -1 }, { minimum: 1.23 }, { minimum: 1000001 }, { maxAttempts: 0 }, { maxAttempts: 1.5 }, { maxAttempts: '10' }, { maxAttempts: 100001 }, { maxSouls: -1 }, { maxSouls: .5 }, { maxSouls: Infinity }, { maxSouls: 1000001 }, { uid: {} }, { uid: 'missing' }, { key: 'constructor' }, { key: { toString: 1 } }];
  for (const patch of invalid) assert.equal(game.jobs.start(game.player, { ...game.request, ...patch }), false);
  assert.equal(game.jobs.inspect(game.player, 'target', { toString: 1 }), false);
  game.player.bag[0].slot = 'boots'; assert.equal(game.jobs.start(game.player, game.request), false); assert.equal(game.player.souls, 1000000);
});

test('disconnect, death, range loss, item replacement/removal and region changes stop before another roll', () => {
  for (const reason of ['disconnect', 'death', 'range', 'removed', 'replaced', 'changed', 'equipped', 'region']) {
    const game = setup(); game.jobs.start(game.player, game.request); const balance = game.player.souls;
    if (reason === 'disconnect') game.online.delete(game.player.id);
    if (reason === 'death') game.player.dead = 1;
    if (reason === 'range') game.player.x += 1000;
    if (reason === 'removed') game.player.bag = [];
    if (reason === 'replaced') game.player.bag[0] = structuredClone(game.player.bag[0]);
    if (reason === 'changed') game.player.bag[0].plus++;
    if (reason === 'equipped') { game.player.eq.weapon = game.player.bag.pop(); }
    if (reason === 'region') { const map = addMap(1, {}); game.player.x = map.cx; game.player.y = map.cy; }
    game.jobs.process(); assert.equal(game.jobs.activeCount(), 0, reason); assert.equal(game.player.souls, balance, reason); maps.splice(1);
  }
});

test('invalid applyAffix results restore the item and refund only the failed attempt', () => {
  for (const failure of [() => false, item => { item.uid = 'other'; item.afx = { k: 'aspd', v: 0 }; return true; }, item => { item.stats.dmg = 999; item.afx = { k: 'aspd', v: NaN }; return true; }, () => { throw Error('roll failed'); }]) {
    const game = setup({ roll: failure }), before = JSON.stringify(game.player.bag[0]); game.jobs.start(game.player, game.request); game.jobs.process(); assert.equal(game.last().status, 'error'); assert.equal(game.last().spent, 0); assert.equal(game.player.souls, 1000000); assert.equal(JSON.stringify(game.player.bag[0]), before);
  }
  let count = 0; const real = productionRoll(); const game = setup({ roll: (item, key) => ++count === 2 ? false : real(item, key) }); game.jobs.start(game.player, game.request); game.jobs.process(); assert.equal(game.last().attempts, 1); assert.equal(game.last().spent, 5); assert.equal(game.player.souls, 999995);
});

test('global and per-job budgets are fair and progress is batched rather than per attempt', () => {
  const game = setup(), players = [game.player];
  for (let id = 2; id <= 12; id++) { const player = hero(id); player.bag = [item()]; players.push(player); game.online.add(id); }
  for (const player of players) game.jobs.start(player, game.request);
  let attempts = 0; for (let i = 0; i < 3; i++) { const result = game.jobs.process(); attempts += result.attempts; assert.ok(result.attempts <= AUTO_AFFIX_LIMITS.attemptsPerTick); game.advance(50); }
  assert.equal(attempts, 150); for (const player of players) assert.ok(player.souls < 1000000);
  assert.ok(game.packets.length < attempts); assert.ok(game.inventories.length < attempts);
  game.jobs.cancelAll(); assert.equal(game.jobs.activeCount(), 0); for (const player of players) assert.ok(game.persisted.some(record => record.id === player.id));
});

test('hundreds of real rolls preserve UID/metadata and replace the prefix without best restoration', () => {
  const game = setup({ roll: productionRoll([0]) }), before = structuredClone(game.player.bag[0]); game.jobs.start(game.player, { ...game.request, maxAttempts: 300 });
  for (let i = 0; i < 30; i++) game.jobs.process(); const final = game.player.bag[0];
  assert.equal(game.last().attempts, 300); assert.equal(final.name, 'Swift Iron Sword'); for (const key of ['uid', 'rar', 'ilvl', 'plus', 'stats', 'psk', 'lk']) assert.deepEqual(final[key], before[key]);
  const value = final.afx.v, fresh = setup(); fresh.player.bag[0].afx = { k: 'ls', v: 1 }; fresh.player.bag[0].name = 'Vampiric Iron Sword'; fresh.jobs.start(fresh.player, { ...fresh.request, maxAttempts: 1 }); fresh.jobs.process(); assert.equal(fresh.player.bag[0].name, 'Swift Iron Sword'); assert.equal(fresh.player.bag[0].afx.v, value);
});

function inventoryGame() {
  const player = hero(), packets = [], messages = [], saved = {};
  player.bag = [item('target', { lk: undefined }), item('other', { lk: undefined })];
  const saves = createGameSaves({ players: new Map([[player.id, player]]), saveStore: { data: saved, save: async () => {} }, pluginStore: { save: async () => {} } });
  const inventory = createInventory({ send: (c, packet) => packets.push(packet), say: (p, message) => messages.push(message), toast: noop, broadcast: noop, ev: noop, fire: noop, genGear: noop, applyAffix: productionRoll(), rerollGear: target => { target.stats.dmg = 321; }, persistPlayer: saves.savePlayer, isItemReserved: (p, uid) => game.teams?.isItemReserved(p, uid) || false });
  const game = { player, packets, inventory, saved, messages, start: () => inventory.handleAutoAffix(player, { op: 'start', uid: 'target', key: 'aspd', minimum: 15.6, maxAttempts: 1000, maxSouls: 10000 }), last: () => packets.filter(packet => packet.t === 'autoAffixStatus').at(-1) };
  return game;
}
test('inventory integration blocks conflicting mutations, supports worn items and preserves manual Mystic operations', () => {
  const game = inventoryGame(), { player, inventory } = game; game.start(); assert.equal(game.last().job.status, 'running');
  const before = JSON.stringify(player.bag), souls = player.souls;
  for (const action of [() => inventory.affixItem(player, 'target', 'ls'), () => inventory.rerollItem(player, 'target'), () => inventory.lockItem(player, 'target'), () => inventory.sellItem(player, 'target'), () => inventory.equipItem(player, 'target'), () => inventory.upgradeItem(player, 'target', true), () => inventory.doMerge(player, ['target', 'other']), () => inventory.mergeMythics(player, ['target', 'other', 'third'])]) action();
  assert.equal(JSON.stringify(player.bag), before); assert.equal(player.souls, souls); assert.equal(game.messages.length, 8);
  assert.equal(inventory.prepareDestroy(player, 'target'), false);
  inventory.processJobs(); assert.equal(player.souls, souls - 50); inventory.cancelAutoAffix(player);
  inventory.affixItem(player, 'target', 'ls'); assert.equal(player.bag[0].afx.k, 'ls'); assert.equal(player.souls, souls - 55);
  inventory.rerollItem(player, 'target'); assert.equal(player.bag[0].stats.dmg, 321);
  inventory.equipItem(player, 'target'); assert.equal(player.eq.weapon.uid, 'target'); game.start(); assert.equal(game.last().job.status, 'running');
  inventory.unequipItem(player, 'weapon'); inventory.equipItem(player, 'other'); assert.equal(player.eq.weapon.uid, 'target');
  inventory.cancelAllAutoAffix(); assert.equal(inventory.isAutoAffixReserved(player, 'target'), false);
});
test('bulk sales and automatic merging skip the busy UID; trade reservations work in both directions', () => {
  const game = inventoryGame(), { player, inventory } = game; game.start(); player.x = NPCS.merchant.x; player.y = NPCS.merchant.y;
  inventory.sellByRarity(player, 4); assert.deepEqual(player.bag.map(item => item.uid), ['target']);
  inventory.autoMerge(player); assert.deepEqual(player.bag.map(item => item.uid), ['target']); inventory.cancelAutoAffix(player);
  player.x = NPCS.mystic.x; player.y = NPCS.mystic.y;
  const other = hero(2), players = new Map([[1, player], [2, other]]);
  const teams = createTeams({ players, send: noop, say: (p, message) => game.messages.push(message), toast: noop, fire: noop, afterGearChange: noop, isExternalItemReserved: inventory.isAutoAffixReserved }); game.teams = teams;
  teams.chatCommands.invite.fn(player, [other.name]); teams.chatCommands.accept.fn(other);
  teams.handlers.trade(player, { op: 'request', name: other.name }); teams.handlers.trade(other, { op: 'accept' });
  game.start(); teams.handlers.trade(player, { op: 'offer', uids: ['target'], gold: 0 }); assert.equal(teams.isItemReserved(player, 'target'), false); assert.equal(game.messages.at(-1).key, 'autoAffix.busy');
  inventory.cancelAutoAffix(player); teams.handlers.trade(player, { op: 'offer', uids: ['target'], gold: 0 }); assert.equal(teams.isItemReserved(player, 'target'), true);
  game.start(); assert.equal(game.last().error, 'item_reserved');
  teams.handlers.trade(player, { op: 'cancel' }); game.start(); assert.equal(game.last().job.status, 'running');
});
test('forge and Auto Affix advance together, persist consistent item/Souls and never resume after restart', () => {
  const game = inventoryGame(), { player, inventory, saved } = game;
  player.eq.weapon = item('forge', { plus: 1, ilvl: 1, rar: 0 }); player.gold = 1000000000;
  const random = Math.random; Math.random = () => .999;
  try { inventory.upgradeItem(player, 'forge', true); game.start(); inventory.processJobs(); }
  finally { Math.random = random; }
  assert.equal(game.packets.findLast(packet => packet.t === 'forge').attempts, 25); assert.equal(player.souls, 999950);
  inventory.cancelAllAutoAffix('cancelled'); const record = JSON.parse(JSON.stringify(saved[player.name.toLowerCase()]));
  assert.equal(record.souls, player.souls); assert.deepEqual(record.bag[0].afx, player.bag[0].afx); assert.equal(Object.hasOwn(record, 'autoAffix'), false);
  const restored = hero(); Object.assign(restored, record); const balance = restored.souls;
  const fresh = createAutoAffixJobs({ applyAffix: productionRoll(), send: noop, sendInventory: noop, refreshStats: noop, persistPlayer: noop }); fresh.process(); fresh.status(restored);
  assert.equal(fresh.activeCount(), 0); assert.equal(restored.souls, balance); assert.equal(restored.bag[0].uid, 'target');
});
test('authenticated dispatch rejects impersonation; Stop survives throttling and disconnect cancels before save', () => {
  const game = inventoryGame(), { player, inventory } = game, players = new Map([[1, player]]), order = [];
  const sessions = createPlayerSessions({ config: { admins: [] }, players, mobs: new Map(), saves: {}, send: noop, inventory, fire: noop, teams: { onLeave: noop }, savePlayer: p => { order.push(inventory.isAutoAffixReserved(p, 'target')); }, broadcast: noop });
  const request = { t: 'autoAffix', op: 'start', uid: 'target', key: 'aspd', minimum: 15.6, maxAttempts: 100, maxSouls: 500 };
  sessions.handleMessage({}, request); assert.equal(game.packets.length, 0);
  sessions.handleMessage(player.c, { ...request, playerId: 2 }); assert.equal(game.last().job.status, 'running');
  const empty = () => ({ tokens: 0, at: Date.now() + 100000 }); player.c.commandBudget = { all: empty(), actions: empty() };
  sessions.handleMessage(player.c, { t: 'autoAffix', op: 'stop' }); assert.equal(game.last().job.status, 'stopped'); const count = game.packets.length;
  sessions.handleMessage(player.c, { t: 'autoAffix', op: 'stop' }); assert.equal(game.packets.length, count);
  game.start(); inventory.processJobs(); const balance = player.souls; sessions.leavePlayer(player.c); assert.deepEqual(order, [false]); assert.equal(player.c.p, null); inventory.processJobs(); assert.equal(player.souls, balance);
});

test('server shutdown cancels jobs before transport close and the final durable save', async () => {
  const vm = require('node:vm'), fs = require('node:fs'), game = inventoryGame(), order = [], signals = new Map();
  game.start(); game.inventory.processJobs(); const balance = game.player.souls;
  let exit; const exited = new Promise(resolve => { exit = resolve; });
  const sandbox = { module: { exports: {} }, require: name => { assert.equal(name, './server-console'); return { RESTART_EXIT_CODE: 75 }; },
    process: { argv: [], stdin: {}, on: (name, callback) => signals.set(name, callback), exit }, console: { log: noop, error: noop }, performance: { now: () => 0 },
    setInterval: () => 1, setTimeout: () => 2, clearInterval: noop, clearTimeout: noop };
  vm.runInNewContext(fs.readFileSync(require.resolve('../server-lifecycle'), 'utf8'), sandbox);
  sandbox.module.exports.startServer({ server: { once: noop, listen: noop, close: () => order.push('server') }, transport: { close: () => order.push('transport') },
    tick: noop, tickIntervalMs: 50, beforeShutdown: () => { order.push('cancel'); game.inventory.cancelAllAutoAffix('cancelled'); },
    saveAll: async () => { order.push('save'); assert.equal(game.inventory.isAutoAffixReserved(game.player, 'target'), false); assert.equal(game.player.souls, balance); return true; } });
  signals.get('SIGTERM')(); assert.equal(await exited, 0); assert.deepEqual(order, ['cancel', 'server', 'transport', 'save']); assert.equal(game.last().job.status, 'cancelled');
});
