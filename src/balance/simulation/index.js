'use strict';
const { resolveBalance } = require('..');
const xp = require('../../progression/xp-economy');
const equipment = require('../../economy/equipment');
const gold = require('../../economy/gold-rewards');
const { STONE_REWARDS } = require('../../economy/stone-rewards');
const { dropSpecification, expectedGearDrops } = require('../../economy/loot-math');
const scaling = require('../../combat/enemy-scaling');
const combatModel = require('./combat');
const { createRegionDescriptor } = require('../../world/universe');
const { buildRegionPlan } = require('../../world/region-blueprint');
const { validateSpawnPlan, HARD_BUDGETS } = require('../../world/world-generation');
const { constructionCostsForTier } = require('../../economy/settlement-economy');
const { deathGoldPenalty } = require('../../economy/death-gold');
const { playerDmg } = require('../../player/characters');
const { forgeExpectation } = require('./forge');
const CHECKPOINTS = Object.freeze([1, 100, 500, 1000, 5000, 10000]);
const CATEGORIES = Object.freeze(['normal', 'alpha', 'stone', 'boss', 'worldBoss']);
const finite = value => Number.isFinite(value) && value >= 0;
function checkPoints(values, maximum, count, label) {
  if (!Array.isArray(values) || !values.length || values.length > count || values.some(value => !Number.isSafeInteger(value) || value < 1 || value > maximum)) throw new RangeError('Invalid ' + label);
  return [...new Set(values)].sort((a, b) => a - b);
}
function sampleGold(monster, template, options) {
  let mean = 0;
  // Uniform mid-quantile quadrature of the actual rounded payout, not a second formula.
  for (let index = 0; index < 1000; index++) mean += gold.monsterGoldRewards({ monster, template, ...options, roll: (index + .5) / 1000 })[0] / 1000;
  return Math.min(Number.MAX_SAFE_INTEGER, mean);
}
function simulate(options = {}) {
  const resolved = resolveBalance({ ruleset: options.ruleset ?? 'Normal', overrides: options.overrides ?? {} });
  const { rates } = resolved.values, levels = checkPoints(options.levels ?? CHECKPOINTS, 10000, 50, 'player levels');
  const tiers = checkPoints(options.tiers ?? CHECKPOINTS, 65542, 100, 'World Tiers');
  const seed = options.seed ?? 'SHARDLANDS-BALANCE';
  if (typeof seed !== 'string' || !seed.length || seed.length > 40) throw new RangeError('Seed must contain 1..40 characters');
  const assumptions = [
    'Synthetic deterministic world; no real saves, unlocks, current clock or live player state.',
    'Player levels, item levels and World Tiers are separate axes. Level scenarios are on-level reference fights in Tier 8; region rows use actual generated ranges.',
    'Reference build: Common +0 below level 30, Rare +3 thereafter; three-class average, existing single-target combat model, 50% telegraph dodging, no potions/travel/respawn/guardian waves.',
    'Gold means use 1000 uniform mid-quantiles of the production payout. Income/hour is on-target modeled output, not measured farming income.',
    'Forge uses exact absorbing Markov equations and production probabilities, prices and downgrade transitions. Expected spending is not a wallet transaction.',
    'Rarity and drop expectations reuse production helpers; sale values are on-level +0 reference items, not actual random drop-level sales.',
    'No economic preference is an objective failure. Missing telemetry and reference-only estimates are warnings.',
  ];
  const checks = [], rows = [], progression = [], worlds = [];
  const check = (id, passed, detail) => checks.push({ id, status: passed ? 'PASS' : 'FAIL', detail });
  for (const level of levels) {
    const build = level < 30 ? { rarity: 0, plus: 0 } : { rarity: 2, plus: 3 };
    const hero = scaling.referenceHero({ level, ...build });
    const forge = forgeExpectation({ ilvl: level });
    const ranges = equipment.statRanges({ slot: 'weapon', ilvl: level, rar: build.rarity, stats: { dmg: 0 } });
    progression.push({ level, xpRequirement: xp.xpNeed(level), effectiveItemLevel: equipment.effectiveStatLevel(level), referenceHeroHp: hero.maxhp, referenceHeroDamage: playerDmg(hero), referenceDps: scaling.heroDps(hero), weaponDamageRange: ranges.dmg, forgeAttemptsTo9: forge.attempts, forgeGoldTo9: forge.gold });
    check('progression-' + level, finite(forge.gold) && finite(forge.attempts) && xp.xpNeed(level) > 0 && ranges.dmg.every(finite), 'Finite production progression, ranges and expected forge costs');
    for (const category of CATEGORIES) {
      const type = category === 'stone' ? 'doomstone' : undefined;
      const { monster, template } = combatModel.spawn({ category, level, worldTier: 8, rates, type });
      const encounter = combatModel.encounter({ heroLevel: level, monsterLevel: level, worldTier: 8, category, rates, ...build, monsterType: type });
      const rewardScale = category === 'stone' ? STONE_REWARDS.completion.gold : 1;
      const meanGold = sampleGold(monster, template, { rate: rates.goldRate, rewardScale });
      const referenceGoldFind = sampleGold(monster, template, { rate: rates.goldRate, rewardScale, bonuses: [100] });
      const xpAward = xp.calculateEncounterXp({ playerLevel: level, monsterLevel: level, category, serverRate: rates.xpRate });
      const referencePrice = equipment.upCostFor({ ilvl: level, plus: 0, slot: 'weapon' });
      const specification = dropSpecification(monster, template, rates, { loot: 1 });
      const probabilities = equipment.rarityProbabilities(specification.rarityBonus, rates.rarityBoost, specification.minimumRarity);
      const expectedDrops = expectedGearDrops(specification);
      const budget = gold.monsterGoldBudget({ monster, template, rate: rates.goldRate, roll: .5 });
      const partyGold = gold.monsterGoldRewards({ monster, template, rate: rates.goldRate, rewardScale, bonuses: [0, 0, 0, 0, 0], roll: .5 });
      const partyXp = xp.calculateEncounterXp({ playerLevel: level, monsterLevel: level, category, members: 5, healthScale: scaling.partyHealthScale(category, 5), serverRate: rates.xpRate });
      rows.push({ level, category, scenarioWorldTier: 8, monsterHp: monster.mh, monsterDamage: monster.dmg * rates.monsterDamage, monsterDefense: null,
        xp: xpAward, killsPerLevel: xpAward ? xp.xpNeed(level) / xpAward : null, meanGold, goldWith100PercentFind: referenceGoldFind,
        modeledKillSeconds: encounter.ttk, modeledSecondsToDie: Number.isFinite(encounter.ttd) ? encounter.ttd : null,
        modeledGoldPerHour: meanGold * 3600 / encounter.ttk, modeledXpPerHour: xpAward * 3600 / encounter.ttk,
        normalUpgradePrice: referencePrice, killsForUpgrade: meanGold ? referencePrice / meanGold : null,
        deathPenaltyAtMillionGold: deathGoldPenalty({ lvl: level, gold: 1000000 }, rates),
        expectedGearDrops: expectedDrops, expectedConsumables: specification.potionCount || specification.potionChance,
        rarityProbabilities: probabilities, expectedDropsByRarity: probabilities.map(value => value * expectedDrops),
        referenceSaleValues: equipment.RARITY.map((_, rar) => equipment.sellValue({ ilvl: level, rar, plus: 0 })), partyGold, partyXpPerMember: partyXp });
      if (category === 'stone') {
        const normal = combatModel.spawn({ category: 'normal', level, worldTier: 8, rates });
        const guardianXp = policy => xp.calculateEncounterXp({ playerLevel: level, monsterLevel: level, category: 'normal', serverRate: rates.xpRate, rewardScale: policy.xp });
        const guardianGold = policy => sampleGold(normal.monster, normal.template, { rate: rates.goldRate, rewardScale: policy.gold });
        rows.at(-1).stoneEncounterRewardCeiling = {
          xp: xpAward + STONE_REWARDS.maxGuardians * guardianXp(STONE_REWARDS.guardian) + STONE_REWARDS.maxAlphaGuardians * guardianXp(STONE_REWARDS.alpha),
          meanGold: meanGold + STONE_REWARDS.maxGuardians * guardianGold(STONE_REWARDS.guardian) + STONE_REWARDS.maxAlphaGuardians * guardianGold(STONE_REWARDS.alpha),
          expectedSouls: STONE_REWARDS.completion.souls.reduce((a, b) => a + b, 0) / 2 + STONE_REWARDS.maxAlphaGuardians * STONE_REWARDS.alpha.soulChance * STONE_REWARDS.alpha.souls,
          note: 'Maximum rewarded lifecycle permits consumed; not guaranteed realized income or a clear-time estimate.',
        };
      }
      check('rewards-' + level + '-' + category, Number.isSafeInteger(xpAward) && xpAward >= 0 && finite(meanGold) && partyGold.every(value => Number.isSafeInteger(value) && value >= 0) && Math.abs(probabilities.reduce((a, b) => a + b, 0) - 1) < 1e-12, 'Safe production rewards and normalized rarity probabilities');
      check('combat-' + level + '-' + category, monster.mh > 0 && finite(monster.mh) && finite(monster.dmg) && encounter.ttk > 0 && Number.isFinite(encounter.ttk) && finite(budget), 'Positive finite HP/TTK and nonnegative damage/gold');
    }
  }
  const state = { seed, generatorVersion: 2, levelRangeVersion: 1, regions: {}, generationSettings: structuredClone(resolved.values.worldGeneration) };
  const snapshot = { elements: {}, stones: 0, deaths: 0, mythics: 0, events: 0 };
  for (const tier of tiers) {
    const region = createRegionDescriptor(state, tier, snapshot);
    state.regions[tier] = region;
    try {
      const plan = buildRegionPlan(state, region), repeat = buildRegionPlan(state, region), validation = validateSpawnPlan(plan);
      const midpoint = Math.floor((region.levels[0] + region.levels[1]) / 2);
      const probe = combatModel.spawn({ category: 'normal', level: midpoint, worldTier: tier, rates, type: region.families?.[0] });
      worlds.push({ tier, levels: region.levels, biome: region.biome ?? 'founding', generatorVersion: 2, counts: validation.counts, valid: validation.valid, errors: validation.errors,
        midpointNormal: { level: midpoint, monsterHp: probe.monster.mh, monsterDamage: probe.monster.dmg * rates.monsterDamage, gold: sampleGold(probe.monster, probe.template, { rate: rates.goldRate }) },
        constructionCosts: constructionCostsForTier(tier, resolved.values.settlement) });
      check('world-' + tier, validation.valid && JSON.stringify(plan) === JSON.stringify(repeat), 'Production generation is deterministic and validates against production geometry/budgets');
    } catch (error) {
      worlds.push({ tier, levels: region.levels, valid: false, errors: [error.message] });
      check('world-' + tier, false, error.message);
    }
  }
  const normal = rows.filter(row => row.category === 'normal');
  check('monotonic-normal-gold', normal.every((row, index) => !index || row.meanGold + 1e-8 >= normal[index - 1].meanGold), 'Normal gold is nondecreasing across sampled levels');
  checks.push({ id: 'live-economy-telemetry', status: 'WARN', detail: 'No live travel/kill/respawn telemetry; reference income and sustainability ratios are analytical scenarios.' });
  checks.push({ id: 'monster-defense', status: 'WARN', detail: 'No standalone monster-defense stat exists in the current monster spawner; reported as null rather than invented.' });
  if (!rates.goldRate || !rates.xpRate) checks.push({ id: 'disabled-rewards', status: 'WARN', detail: 'A reward rate is zero; null kills-to-goal values mean income/progression is disabled.' });
  const status = checks.some(row => row.status === 'FAIL') ? 'FAIL' : checks.some(row => row.status === 'WARN') ? 'WARN' : 'PASS';
  return { schemaVersion: 1, status, ruleset: resolved.ruleset, effectiveBalance: resolved.values, seed, assumptions, hardBudgets: HARD_BUDGETS, checks, progression, encounters: rows, worlds };
}
module.exports = { simulate, CHECKPOINTS, CATEGORIES };
