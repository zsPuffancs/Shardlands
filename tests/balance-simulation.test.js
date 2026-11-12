'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { simulate, CHECKPOINTS } = require('../src/balance/simulation');
const { forgeExpectation } = require('../src/balance/simulation/forge');
const { UP_RATE, upCostFor, upgradeOutcome } = require('../public/forge-math');
const { createEquipment, rarityProbabilities, effectiveStatLevel, statRanges } = require('../src/economy/equipment');
const { stream, HARD_BUDGETS } = require('../src/world/world-generation');
const { dropSpecification, expectedGearDrops } = require('../src/economy/loot-math');
const { csv, markdown, selection } = require('../scripts/simulate-balance');
const { MAX_CURRENCY } = require('../src/shared/safety-limits');

test('forge Markov expectations satisfy production transition Bellman equations and default prices', () => {
  for (const ilvl of CHECKPOINTS) {
    const result = forgeExpectation({ ilvl });
    assert.ok(result.attempts > 9 && Number.isFinite(result.gold));
    for (let plus = 0; plus < 9; plus++) {
      const success = upgradeOutcome(plus, 0).plus, failure = upgradeOutcome(plus, 1).plus;
      const attempts = 1 + UP_RATE[plus] * (result.attemptsByState[success] || 0) + (1 - UP_RATE[plus]) * result.attemptsByState[failure];
      const gold = upCostFor({ ilvl, slot: 'weapon', plus }) + UP_RATE[plus] * (result.goldByState[success] || 0) + (1 - UP_RATE[plus]) * result.goldByState[failure];
      assert.ok(Math.abs(attempts - result.attemptsByState[plus]) < 1e-9, 'attempt state ' + plus);
      assert.ok(Math.abs(gold - result.goldByState[plus]) < 1e-6, 'gold state ' + plus);
      for (const slot of ['weapon', 'armor']) assert.equal(upCostFor({ ilvl, slot, plus }), Math.round(100 * (plus + 1) ** 1.3 * (1 + ilvl / 12) * (slot === 'weapon' ? 1 : .8)));
      assert.equal(upgradeOutcome(plus, 1).plus, plus < 5 ? plus : plus - 1);
    }
  }
  assert.equal(forgeExpectation({ ilvl: 1, target: 1 }).attempts, 1);
  assert.equal(forgeExpectation({ ilvl: 1, start: 9 }).gold, 0);
  assert.equal(upgradeOutcome('1', 0).plus, 2); // Preserve the old increment coercion for legacy saved values.
});

test('seeded real forge outcomes agree with configured success probabilities and Markov long-run cost', () => {
  const random = stream('forge-statistics', 8, 2, 'regression');
  const samples = 20000;
  UP_RATE.forEach((probability, plus) => {
    let successes = 0;
    for (let index = 0; index < samples; index++) successes += Number(upgradeOutcome(plus, random()).success);
    const tolerance = 6 * Math.sqrt(samples * probability * (1 - probability)) + 2;
    assert.ok(Math.abs(successes - samples * probability) <= tolerance, '+' + plus);
  });
  let attempts = 0, spent = 0;
  for (let run = 0; run < 4000; run++) {
    let plus = 0;
    while (plus < 9) { spent += upCostFor({ ilvl: 100, slot: 'weapon', plus }); plus = upgradeOutcome(plus, random()).plus; attempts++; }
  }
  const expected = forgeExpectation({ ilvl: 100 });
  assert.ok(Math.abs(attempts / 4000 / expected.attempts - 1) < .06);
  assert.ok(Math.abs(spent / 4000 / expected.gold - 1) < .06);
});

test('seeded production rarity rolls match normalized probabilities including minimum-rarity folding', () => {
  for (const [bonus, boost, minimum] of [[0, 0, 0], [3, 2, 3]]) {
    const random = stream('rarity-statistics', 8, 2, String(minimum));
    const api = createEquipment({ rates: { rarityBoost: boost }, random });
    const probabilities = rarityProbabilities(bonus, boost, minimum), counts = probabilities.map(() => 0), samples = 50000;
    for (let index = 0; index < samples; index++) counts[api.rollRarity(bonus, minimum)]++;
    assert.ok(Math.abs(probabilities.reduce((a, b) => a + b) - 1) < 1e-12);
    probabilities.forEach((probability, index) => assert.ok(Math.abs(counts[index] - samples * probability) <= 6 * Math.sqrt(samples * probability * (1 - probability)) + 2, 'rarity ' + index));
  }
});

test('seeded production item rolls stay within real ranges at progression checkpoints', () => {
  // Patch only the synchronous test scope; restore even if an assertion fails.
  const previous = Math.random;
  Math.random = stream('item-statistics', 8, 2, 'ranges');
  try {
    const api = createEquipment({ rates: { rarityBoost: 0 } });
    for (const level of CHECKPOINTS) for (let rarity = 0; rarity < 6; rarity++) for (let index = 0; index < 20; index++) {
      const item = api.genGear('weapon', level, rarity, 'sword'), ranges = statRanges(item);
      for (const [key, value] of Object.entries(item.stats)) {
        const tolerance = ['crit', 'spd'].includes(key) ? .051 : .501;
        assert.ok(value >= ranges[key][0] - tolerance && value <= ranges[key][1] + tolerance, level + '/' + rarity + '/' + key);
      }
    }
  } finally { Math.random = previous; }
  assert.ok(effectiveStatLevel(10000) < 10000);
});

test('shared UMD forge helper has identical Node and browser pricing and transitions', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../public/forge-math.js'), 'utf8'), context);
  for (const ilvl of CHECKPOINTS) for (let plus = 0; plus < 9; plus++) {
    const item = { ilvl, plus, slot: 'weapon' };
    assert.equal(context.ForgeMath.upCostFor(item), upCostFor(item));
    assert.equal(JSON.stringify(context.ForgeMath.upgradeOutcome(plus, .9)), JSON.stringify(upgradeOutcome(plus, .9)));
  }
});

test('production loot expectation respects rates, fixed encounter drops and technical caps', () => {
  const rates = { gearDropRate: 0, potionDropRate: 0 }, reward = { loot: 1 };
  assert.equal(expectedGearDrops(dropSpecification({ tier: 7 }, {}, rates, reward)), 0);
  assert.equal(expectedGearDrops(dropSpecification({ tier: 10000 }, { stone: true }, rates, reward)), 10);
  assert.equal(expectedGearDrops(dropSpecification({ tier: 7 }, {}, { gearDropRate: 1, potionDropRate: 1 }, reward)), .26);
  assert.ok(expectedGearDrops(dropSpecification({ tier: 7 }, {}, { gearDropRate: 1000, potionDropRate: 1 }, reward)) <= 10);
});

test('default simulation is deterministic at all required levels/Tiers with valid numeric and generation invariants', () => {
  const result = simulate();
  assert.deepEqual(result, simulate());
  assert.deepEqual(result.worlds.map(row => row.tier), CHECKPOINTS);
  assert.deepEqual(result.progression.map(row => row.level), CHECKPOINTS);
  assert.equal(result.checks.filter(row => row.status === 'FAIL').length, 0);
  assert.equal(result.status, 'WARN');
  for (const row of result.worlds) {
    assert.equal(row.valid, true);
    for (const [key, cap] of Object.entries(HARD_BUDGETS)) assert.ok(row.counts[key] <= cap);
  }
  for (const row of result.encounters) {
    assert.ok(row.meanGold <= MAX_CURRENCY);
    assert.ok(row.partyGold.every(Number.isSafeInteger));
    if (row.level === 10000) assert.equal(row.xp, 0);
    // Personal Gold Find rounds the unrounded budget, so doubling an already
    // rounded zero-bonus reward can differ by at most one gold per payout.
    if (row.category === 'normal') assert.ok(Math.abs(row.goldWith100PercentFind - 2 * row.meanGold) <= 1 + 1e-8);
  }
  assert.equal(result.worlds.find(row => row.tier === 100).levels[0] > 100, true);
});

test('alternative Rulesets, zero rewards, extreme allowed rates and export formats use resolved production settings', () => {
  const reference = simulate({ levels: [100], tiers: [8] });
  const changed = simulate({ ruleset: 'Hardcore', levels: [100], tiers: [8], overrides: { rates: { goldRate: 2, monsterHp: 3.2 } } });
  assert.ok(Math.abs(changed.encounters[0].meanGold / reference.encounters[0].meanGold - 2) < .001);
  assert.ok(Math.abs(changed.encounters[0].monsterHp / reference.encounters[0].monsterHp - 2) < .001);
  const zero = simulate({ levels: [1, 10000], tiers: [8], overrides: { rates: { goldRate: 0, xpRate: 0 } } });
  assert.ok(zero.encounters.every(row => row.meanGold === 0 && row.xp === 0 && row.killsForUpgrade === null));
  const extreme = simulate({ levels: [10000], tiers: [10000], overrides: { rates: { goldRate: 1e6, xpRate: 1e6, gearDropRate: 1000, rarityBoost: 1000, monsterHp: 1e6, monsterDamage: 1e6 } } });
  assert.equal(extreme.checks.filter(row => row.status === 'FAIL').length, 0);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(extreme)));
  assert.ok(csv(reference).startsWith('\uFEFF"level","category"'));
  assert.match(markdown(reference), /Forge Markov/);
  assert.deepEqual(selection('1:100:33'), [1, 34, 67, 100]);
  for (const range of ['1:10000', '1:2:0', '2:1', '1:2:3:4']) assert.throws(() => selection(range));
  assert.throws(() => simulate({ tiers: [Number.MAX_SAFE_INTEGER] }));
});

test('generation failures produce structured FAIL diagnostics instead of hiding physically invalid configurations', () => {
  const result = simulate({ levels: [1], tiers: [8], overrides: { worldGeneration: { budgets: { bosses: 0, monsters: 0, stones: 0, alphas: 0 } } } });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.worlds[0].valid, false);
  assert.ok(result.worlds[0].errors.some(error => error.includes('progression')));
  assert.ok(result.checks.some(row => row.id === 'world-8' && row.status === 'FAIL'));
});
