'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const gold = require('../src/economy/gold-rewards');
const { MOBTYPES, TIERS, createMonsterSpawner } = require('../src/combat/monsters');
const { createLoot } = require('../src/economy/loot');
const { MAX_CURRENCY } = require('../src/shared/safety-limits');
const { newSk, stats, goldFind } = require('../src/player/characters');
const { createGameSaves } = require('../src/server/persistence');
const noop = () => {};
const { finishStone } = require('./helpers/stone-encounter');
function hero(id = 1, bonus = 0) { const player = { id, name: 'Hero' + id, c: {}, cls: 'archer', lvl: 100, xp: 1234, sp: 25, gold: 777, souls: 123, eq: {}, bag: [], inv: {}, sk: newSk(), buf: {}, x: 6000, y: 6000 }; stats(player); player.hp = player.maxhp; player.mp = player.maxmp; player.g.gf = bonus; return player; }
function spawn(type = 'wolf', level = 100, generated = true, alpha = false) {
  const previous = TIERS[7]; if (generated) TIERS[7] = { ...TIERS[0], generated: true, scale: true, lv: [level, level] };
  try { const mobs = new Map(); let id = 0; const service = createMonsterSpawner({ mobs, rates: { monsterHp: 1.6 }, world: { width: 10600, height: 10600, centerX: 5300, centerY: 5300 }, allocateId: () => ++id, rnd: (a, b) => (a + b) / 2, rint: a => a, pick: values => values[0] }); return service.spawnMob(type, 6020, 6000, generated ? 7 : 0, { level, alpha }); }
  finally { if (previous) TIERS[7] = previous; else TIERS.splice(7); }
}
function lootService(players = [hero()], rate = 1) { const loot = new Map(); let id = 0; const events = []; const service = createLoot({ loot, players: new Map(players.map(p => [p.id, p])), allocateId: () => ++id, rates: { goldRate: rate, potionDropRate: 0, gearDropRate: 0 }, ev: (...args) => events.push(args), say: noop, toast: noop, broadcast: noop, addGear: noop, genGear: () => ({ name: 'Item', rar: 0 }), rollRarity: () => 0 }); return { ...service, loot, events }; }
function fixedRandom(action, value = .5) { const random = Math.random; Math.random = () => value; try { return action(); } finally { Math.random = random; } }

test('frontier normal gold follows forge-independent linear reference and is monotonic through level 10000', () => {
  let previous = 0;
  for (let level = 1; level <= 10000; level++) {
    const expected = .065 * 100 * (1 + level / 12); assert.ok(Math.abs(gold.frontierAverageGold(level) - expected) < 1e-9);
    const reward = gold.monsterGoldRewards({ monster: { lvl: level, goldModel: gold.FRONTIER_MODEL }, template: {}, roll: .5 })[0];
    assert.ok(Number.isSafeInteger(reward) && reward >= previous); previous = reward;
  }
  const ratio = gold.frontierAverageGold(10000) / gold.frontierAverageGold(1000); assert.ok(ratio < 10);
  assert.equal(previous, 5423);
});

test('frontier category bonuses apply once and stone/world-boss flags override Alpha', () => {
  const level = 100, average = gold.frontierAverageGold(level);
  for (const [category, template, monster] of [['normal', {}, {}], ['alpha', {}, { alpha: 1 }], ['stone', { stone: true }, { alpha: 1 }], ['boss', { boss: true }, { alpha: 1 }], ['worldBoss', { boss: true, worldBoss: true }, { alpha: 1 }]]) {
    assert.equal(gold.goldCategory(monster, template), category);
    const source = { lvl: level, goldModel: gold.FRONTIER_MODEL, gm: 1e9, gb: [1e6, 1e9], ...monster };
    const actual = gold.monsterGoldBudget({ monster: source, template, rate: 1, roll: .5 }); assert.ok(Math.abs(actual - average * gold.GOLD_BALANCE.multipliers[category]) < 1e-9);
    const [low, high] = [0, 1].map(roll => gold.monsterGoldRewards({ monster: source, template, roll })[0]); assert.equal(low, Math.round(actual * .8)); assert.equal(high, Math.round(actual * 1.2));
  }
});

test('spawner tags frontier gold separately without applying legacy Alpha multipliers', () => {
  for (const type of ['wolf', 'stone', 'deathlord']) for (const alpha of [false, true]) {
    const frontier = spawn(type, 10000, true, alpha); assert.equal(frontier.goldModel, gold.FRONTIER_MODEL); assert.equal(frontier.gm, 1);
    const founding = spawn(type, MOBTYPES[type].lvl, false, alpha); assert.equal(founding.goldModel, gold.FOUNDING_MODEL); assert.equal(founding.gm, alpha ? 5 : 1);
  }
});

test('founding solo gold preserves legacy discrete rolls, fractional scaling, Gold Find and stone bonus', () => {
  for (const type of ['wolf', 'bandit', 'stone', 'doomstone', 'deathlord']) for (const alpha of [false, true]) for (const rate of [.1, 1, 2]) for (const bonus of [0, 50, 300]) for (const roll of [0, .25, .5, .99, 1]) {
    const template = MOBTYPES[type], monster = spawn(type, Math.min(10000, template.lvl + 5), false, alpha);
    const range = template.gold, randomBase = range[0] + Math.min(range[1] - range[0], Math.floor(roll * (range[1] - range[0] + 1)));
    const old = Math.round(randomBase * (monster.lvl / template.lvl) ** 1.5 * (alpha ? 5 : 1) * rate * (template.stone ? 1.5 : 1) * (1 + bonus / 100));
    assert.equal(gold.monsterGoldRewards({ monster, template, rate, roll, bonuses: [bonus] })[0], old, JSON.stringify({ type, alpha, rate, bonus, roll }));
  }
});

test('party payouts conserve one integer pool and personal Gold Find is applied only to each share', () => {
  for (let total = 0; total <= 1000; total++) for (let size = 1; size <= 5; size++) {
    const split = gold.distributeGold(total, Array(size).fill(0)); assert.equal(split.reduce((sum, value) => sum + value, 0), total); assert.ok(Math.max(...split) - Math.min(...split) <= 1);
  }
  assert.deepEqual(gold.distributeGold(100, [100, 50, 0]), [68, 50, 33]);
  assert.deepEqual(gold.distributeGold(1, [0, 0, 0, 0, 0]), [1, 0, 0, 0, 0]);
  const capped = gold.distributeGold(MAX_CURRENCY, [0, 0, 0, 0, 0]); assert.equal(capped.reduce((sum, value) => sum + BigInt(value), 0n), BigInt(MAX_CURRENCY));
});

test('real loot path keeps killer ownership, immediate ally payment, wallet overflow and unique recipients', () => {
  const killer = hero(), member = hero(2); member.gold = MAX_CURRENCY - 2; const service = lootService([killer, member]);
  const monster = spawn('wolf', 100), before = killer.gold;
  fixedRandom(() => service.dropLoot(killer, monster, [killer, member, member]));
  const drops = [...service.loot.values()].filter(drop => drop.kind === 'gold');
  assert.equal(drops.length, 2); const owned = drops.find(drop => drop.owner === killer.id), remainder = drops.find(drop => drop.owner === member.id);
  const shares = gold.monsterGoldRewards({ monster, template: MOBTYPES.wolf, bonuses: [0, 0], roll: .5 });
  assert.equal(owned.v, shares[0]); assert.equal(remainder.v, shares[1] - 2); assert.equal(member.gold, MAX_CURRENCY); assert.equal(killer.gold, before);
  assert.equal(owned.free - owned.exp, 25000 - 180000); assert.equal(service.events.filter(event => event[0] === 'gold').length, 1);
});

test('Fortune Gold Find (gear gold find ignored) stays active in live pickup and founding/generated reward paths', () => {
  const player = hero(); player.eq.ring = { slot: 'ring', plus: 0, stats: { gf: 100 } }; player.sk.fortune = 5; stats(player);
  assert.equal(goldFind(player), 6);
  for (const generated of [false, true]) {
    const service = lootService([player]), monster = spawn('wolf', generated ? 100 : 1, generated);
    const expected = gold.monsterGoldRewards({ monster, template: MOBTYPES.wolf, bonuses: [6], roll: .5 })[0], before = player.gold;
    fixedRandom(() => service.dropLoot(player, monster)); const drop = [...service.loot.values()].find(drop => drop.kind === 'gold'); assert.equal(drop.v, expected);
    player.x = monster.x; player.y = monster.y; service.pickupTick(Date.now()); assert.equal(player.gold, before + expected);
  }
});

test('zero rates suppress gold only, while extreme levels, rates and bonuses remain integer safe', () => {
  const player = hero(), service = lootService([player], 0), monster = spawn('stone', 100);
  assert.equal(finishStone(monster).kind, 'stone');
  fixedRandom(() => service.dropLoot(player, monster)); assert.ok(![...service.loot.values()].some(drop => drop.kind === 'gold')); assert.ok([...service.loot.values()].some(drop => drop.kind === 'souls'));
  for (const level of [1, 10000, 10001, -1, 0, Infinity, NaN, Number.MAX_SAFE_INTEGER]) for (const rate of [0, .001, 1, 1e6, Number.MAX_VALUE, Infinity, NaN, -1]) for (const bonus of [0, 300, Number.MAX_VALUE, Infinity, NaN, -100]) {
    const result = gold.monsterGoldRewards({ monster: { lvl: level, goldModel: gold.FRONTIER_MODEL, tier: Number.MAX_SAFE_INTEGER }, template: { worldBoss: true }, rate, bonuses: [bonus] })[0]; assert.ok(Number.isSafeInteger(result) && result >= 0 && result <= MAX_CURRENCY);
  }
  assert.equal(gold.frontierAverageGold(100, 'constructor'), 0); assert.deepEqual(gold.distributeGold(100, null), []);
});

test('saved player balances/items/currencies are not migrated or modified by gold policy evaluation', () => {
  const player = hero(); player.eq.ring = { slot: 'ring', ilvl: 100, plus: 3, stats: { gf: 100 } }; player.gold = MAX_CURRENCY - 100; player.souls = 888;
  const before = JSON.stringify(player), saveStore = { data: {}, save: async () => {} }, pluginStore = { data: {}, save: async () => {} };
  const saves = createGameSaves({ players: new Map([[player.id, player]]), saveStore, pluginStore }); saves.savePlayer(player);
  for (let i = 0; i < 100; i++) gold.monsterGoldRewards({ monster: spawn('wolf', 10000), template: MOBTYPES.wolf, bonuses: [100] });
  assert.equal(JSON.stringify(player), before); const saved = JSON.parse(JSON.stringify(saveStore.data.hero1));
  for (const key of ['gold', 'souls', 'lvl', 'xp', 'sp', 'eq', 'bag', 'inv']) assert.deepEqual(saved[key], player[key]);
});

test('unversioned frontier monsters use authoritative zone fallback and explicit founding tags remain legacy', () => {
  const monster = spawn('wolf', 100), template = MOBTYPES.wolf; delete monster.goldModel; monster.gm = 1e6;
  assert.equal(gold.monsterGoldRewards({ monster, template, generated: true })[0], Math.round(gold.frontierAverageGold(100)));
  monster.goldModel = gold.FOUNDING_MODEL;
  assert.ok(gold.monsterGoldRewards({ monster, template, generated: true })[0] > 1e6);
});
