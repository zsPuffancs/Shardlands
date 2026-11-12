'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveBalance, resolveLiveUpdate, settingMode, RULESETS, formulaCatalog, BASE_RATES } = require('../src/balance');
const { RATE_BOUNDS, MAX_CURRENCY } = require('../src/shared/safety-limits');
const { SETTLEMENT_ECONOMY } = require('../src/economy/settlement-economy-config');
const { constructionCostsForTier } = require('../src/economy/settlement-economy');

test('all named Rulesets preserve current defaults and explicit overrides win without global mutation', () => {
  const normal = resolveBalance();
  assert.deepEqual(normal.values.rates, { xpRate: 1, goldRate: 1, gearDropRate: .8, potionDropRate: 1, rarityBoost: 0, monsterHp: 1.6, monsterDamage: 1.4, deathZoneMonsters: 1800, deathGoldLoss: .05, deathGoldKillCap: 12, respawnSeconds: 11 });
  assert.deepEqual(normal.values.settlement, SETTLEMENT_ECONOMY);
  for (const ruleset of Object.keys(RULESETS)) {
    assert.deepEqual(resolveBalance({ ruleset }).values, normal.values);
    const custom = resolveBalance({ ruleset, overrides: { rates: { xpRate: 2 }, settlement: { scalingCoefficient: .1 } } });
    assert.equal(custom.values.rates.xpRate, 2);
    assert.equal(custom.values.rates.goldRate, 1);
    assert.equal(custom.values.settlement.scalingCoefficient, .1);
  }
  assert.equal(BASE_RATES.xpRate, 1);
  assert.throws(() => { normal.values.rates.goldRate = 3; }, TypeError);
  assert.throws(() => { normal.values.settlement.baseCosts.smith = 1; }, TypeError);
  assert.deepEqual(resolveBalance().values, normal.values);
});

test('strict new configuration rejects nonfinite, unsafe, unknown and malformed values', () => {
  for (const value of [NaN, Infinity, -1, 1e300, '2', null, undefined]) assert.throws(() => resolveBalance({ overrides: { rates: { xpRate: value } } }), /balance/);
  for (const value of [null, [], 1, new Date()]) assert.throws(() => resolveBalance(value));
  assert.throws(() => resolveBalance({ ruleset: 'normal' }), /Ruleset/);
  assert.throws(() => resolveBalance({ overrides: { xp: { overlevelCutoff: 13 } } }), /Unknown/);
  assert.throws(() => resolveBalance({ overrides: JSON.parse('{"__proto__":{"polluted":true}}') }), /Unknown/);
  assert.equal({}.polluted, undefined);
  assert.equal(resolveBalance({ overrides: { rates: { deathZoneMonsters: 1.5 } } }).values.rates.deathZoneMonsters, 1.5);
  assert.throws(() => resolveBalance({ overrides: { settlement: { version: 2 } } }));
  assert.throws(() => resolveBalance({ overrides: { settlement: { baseCosts: { merchant: MAX_CURRENCY + 1 } } } }));
  assert.throws(() => resolveBalance({ overrides: { worldGeneration: { budgets: { monsters: 801 } } } }));
  assert.throws(() => resolveBalance({ overrides: { worldGeneration: { danger: { baseline: .9 } } } }));
  assert.throws(() => resolveBalance({ overrides: { worldGeneration: { spacing: { arbitrary: 1 } } } }));
  for (const [key, maximum] of Object.entries(RATE_BOUNDS)) {
    assert.equal(resolveBalance({ overrides: { rates: { [key]: maximum } } }).values.rates[key], maximum);
    assert.throws(() => resolveBalance({ overrides: { rates: { [key]: maximum + 1 } } }));
  }
});

test('live resolution blocks restart, generation and save-sensitive changes', () => {
  const current = resolveBalance({ ruleset: 'Custom', overrides: { rates: { goldRate: 2 } } });
  const changed = resolveLiveUpdate(current, { rates: { xpRate: 4 } });
  assert.equal(changed.values.rates.goldRate, 2);
  assert.equal(changed.values.rates.xpRate, 4);
  assert.equal(current.values.rates.xpRate, 1);
  assert.equal(settingMode('settlement.version'), 'save-sensitive');
  assert.equal(settingMode('rates.deathZoneMonsters'), 'restart-required');
  assert.equal(settingMode('worldGeneration.budgets.monsters'), 'generation-locked');
  for (const patch of [{ rates: { deathZoneMonsters: 10 } }, { settlement: { scalingCoefficient: .1 } }, { worldGeneration: { budgets: { monsters: 100 } } }]) assert.throws(() => resolveLiveUpdate(current, patch), /restart|snapshot/);
});

test('settlement defaults exactly match production and extreme inputs saturate safely', () => {
  const defaults = resolveBalance().values.settlement;
  for (const tier of [1, 8, 100, 500, 1000, 5000, 10000, Number.MAX_SAFE_INTEGER]) assert.deepEqual(constructionCostsForTier(tier, defaults), constructionCostsForTier(tier));
  const extreme = resolveBalance({ overrides: { settlement: { scalingCoefficient: 1e6, scalingExponent: 4 } } });
  for (const cost of Object.values(constructionCostsForTier(Number.MAX_SAFE_INTEGER, extreme.values.settlement))) assert.equal(cost, MAX_CURRENCY);
});

test('read-only formula catalog reflects actual production constants and cannot silently override them', () => {
  const catalog = formulaCatalog();
  assert.deepEqual(catalog.xp, require('../src/progression/xp-economy').XP_BALANCE);
  assert.deepEqual(catalog.monsters, require('../src/combat/enemy-scaling').ENEMY_SCALING);
  assert.deepEqual(catalog.gold, require('../src/economy/gold-rewards').GOLD_BALANCE);
  assert.deepEqual(catalog.stones, require('../src/economy/stone-rewards').STONE_REWARDS);
  assert.deepEqual(catalog.forging.success, require('../public/forge-math').UP_RATE);
  assert.throws(() => { catalog.forging.success[0] = .1; }, TypeError);
});
