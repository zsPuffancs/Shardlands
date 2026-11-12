'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadServerConfig } = require('../src/server/server-config');
const { createUniverse } = require('../src/world/universe');
const { constructionCostsForTier } = require('../src/economy/settlement-economy');
function temporary(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shardlands-balance-'));
  try { return run(directory); } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('shardlands-balance-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
const write = (directory, file, data) => fs.writeFileSync(path.join(directory, file), JSON.stringify(data));

test('server configuration resolves Rulesets, overrides and legacy rates with existing reload/clamp behavior', () => temporary(directory => {
  write(directory, 'config.json', { balance: { ruleset: 'Accelerated', overrides: { rates: { xpRate: 2, goldRate: 3 } } } });
  write(directory, 'rates.json', { goldRate: 4, deathGoldLoss: .1, unknown: 99, potionDropRate: 'bad' });
  const service = loadServerConfig(directory, { watch: false });
  assert.equal(service.balance.ruleset, 'Accelerated');
  assert.equal(service.rates.xpRate, 2); assert.equal(service.rates.goldRate, 4); assert.equal(service.rates.deathGoldLoss, .05);
  assert.equal(service.rates.potionDropRate, 1); assert.equal(service.rates.unknown, undefined);
  write(directory, 'rates.json', { xpRate: 0, goldRate: -2 }); service.reloadRates();
  assert.equal(service.rates.xpRate, 0); assert.equal(service.rates.goldRate, 0);
  fs.writeFileSync(path.join(directory, 'rates.json'), '{bad'); service.reloadRates();
  assert.equal(service.rates.xpRate, 0);
  service.rates.xpRate = 1e300; assert.equal(service.rates.xpRate, 1e6);
  service.rates.xpRate = Infinity; assert.equal(service.rates.xpRate, 1e6);
  assert.equal(service.effectiveBalance().values.rates.xpRate, 1e6);
  service.close();
}));

test('invalid new balance configuration fails before creating rate or world save files', () => temporary(directory => {
  write(directory, 'config.json', { balance: { ruleset: 'Unknown' } });
  assert.throws(() => loadServerConfig(directory, { watch: false }), /Ruleset/);
  assert.equal(fs.existsSync(path.join(directory, 'rates.json')), false);
  assert.equal(fs.existsSync(path.join(directory, 'universe.json')), false);
}));

test('production universe uses resolved new-project costs while old prices/donations and generation snapshots remain pinned', () => temporary(directory => {
  write(directory, 'config.json', { worldSeed: 'BALANCE-COMPAT', balance: { ruleset: 'Custom', overrides: { settlement: { scalingCoefficient: .2 }, worldGeneration: { budgets: { monsters: 100 } } } } });
  const service = loadServerConfig(directory, { watch: false });
  const state = {}, store = { data: state, save: async () => true };
  const args = { store, config: service.config, constructionEconomy: service.balance.values.settlement, broadcast() {}, messageText: (key, text) => text, isAdmin: () => false };
  const world = createUniverse(args), project = world.settlement(8);
  assert.deepEqual(project.constructionCosts, constructionCostsForTier(8, service.balance.values.settlement));
  const later = world.settlement(20);
  assert.deepEqual(later.constructionCosts, constructionCostsForTier(20, service.balance.values.settlement));
  later.donations = { smith: { Hero: 123 } };
  state.settlements.legacy = { kind: 'camp', donated: 42 };
  const costs = structuredClone(later.constructionCosts), generation = structuredClone(state.generationSettings), region = JSON.stringify(world.regionFor(20));
  const changed = { ...args, config: { ...service.config, worldGeneration: { budgets: { monsters: 700 } } }, constructionEconomy: { ...args.constructionEconomy, scalingCoefficient: .9 } };
  const restarted = createUniverse(changed);
  assert.deepEqual(restarted.settlement(20).constructionCosts, costs);
  assert.deepEqual(restarted.settlement(20).donations, { smith: { Hero: 123 } });
  assert.equal(state.settlements.legacy.donated, 42);
  assert.deepEqual(state.settlements.legacy.constructionCosts, { merchant: 250000, smith: 400000, mystic: 400000 });
  assert.deepEqual(state.generationSettings, generation);
  assert.equal(JSON.stringify(restarted.regionFor(20)), region);
  assert.equal(restarted.settlement(21).constructionCosts.smith, constructionCostsForTier(21, changed.constructionEconomy).smith);
  service.close();
}));
