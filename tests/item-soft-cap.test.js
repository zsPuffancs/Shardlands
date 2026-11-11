'use strict';
// Item stat soft cap: stats follow the old linear formulas up to ITEM_STAT_SOFT_CAP_START and then grow logarithmically.
const test = require('node:test'), assert = require('node:assert/strict');
const {
  ITEM_STAT_SOFT_CAP_START, ITEM_STAT_SOFT_CAP_SCALE, effectiveStatLevel, createEquipment, statRanges, affixRange,
  RARITY, AFFIXES, STATDEF, plusMul,
} = require('../equipment');
const { createInventory } = require('../inventory');
const { newSk, stats } = require('../characters');
const { NPCS } = require('../game-world');

const equipment = createEquipment({ rates: { rarityBoost: 0 } });
const noop = () => {};
const LEVELS = [1, 10, 100, 499, 500, 501, 1000, 2000, 5000, 10000];
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), a + ' != ' + b);
// Ranges come from unrounded values; generated stats are rounded to 1 (flat) or 0.1 (percent) and may sit on the edge.
const within = (value, [low, high], key) => { const slack = STATDEF[key] && STATDEF[key].pct ? 0.05 : 0.5; assert.ok(value >= low - slack && value <= high + slack, key + ' ' + value + ' outside ' + low + '-' + high); };

test('effective stat level is the real level up to the soft-cap start, then grows with diminishing returns', () => {
  assert.equal(ITEM_STAT_SOFT_CAP_START, 500); assert.equal(ITEM_STAT_SOFT_CAP_SCALE, 500);
  for (let level = 1; level <= 500; level++) assert.equal(effectiveStatLevel(level), level);
  for (const bad of [0, -5, NaN, undefined, null, 'abc']) assert.equal(effectiveStatLevel(bad), 1);
  close(effectiveStatLevel(1000), 500 + 500 * Math.log(2));
  // Still increasing (soft, not hard cap), but each further 500 levels add less than the previous 500.
  let previousGain = Infinity;
  for (let level = 500; level < 10000; level += 500) {
    const gain = effectiveStatLevel(level + 500) - effectiveStatLevel(level);
    assert.ok(gain > 0 && gain <= previousGain + 1e-9, 'gain at ' + level); previousGain = gain;
  }
  assert.ok(effectiveStatLevel(10000) < 2000 && effectiveStatLevel(10000) > effectiveStatLevel(5000));
});

test('generated primary and extra stats stay inside the tooltip ranges at every level and rarity', () => {
  for (const slot of ['weapon', 'helm', 'armor', 'boots', 'ring', 'amulet']) for (const level of LEVELS) for (let rarity = 0; rarity < RARITY.length; rarity++) {
    for (let n = 0; n < 4; n++) {
      const item = equipment.genGear(slot, level, rarity, 'sword'), ranges = statRanges(item);
      assert.equal(item.ilvl, level); assert.equal(item.req, Math.max(1, level - 3));
      for (const key in item.stats) { assert.ok(ranges[key], slot + ' ' + key); within(item.stats[key], ranges[key], slot + ' ' + key + ' L' + level); }
    }
  }
});

test('below the soft cap the stat ranges are exactly the old linear formulas', () => {
  const item = { slot: 'weapon', ilvl: 300, rar: 2, stats: { dmg: 1, hp: 1 }, plus: 0 }, ranges = statRanges(item);
  close(ranges.dmg[0], (3 * 300 + 5) * RARITY[2].m * 0.9); close(ranges.dmg[1], (3 * 300 + 5) * RARITY[2].m * 1.1);
  close(ranges.hp[0], (7 * 300 + 8) * (0.6 + 0.4 * RARITY[2].m) * 0.85);
});

test('above the soft cap ranges use the effective level, and rarity multipliers still apply on top', () => {
  for (const level of [1000, 5000, 10000]) {
    const effective = effectiveStatLevel(level);
    for (let rarity = 0; rarity < RARITY.length; rarity++) {
      const ranges = statRanges({ slot: 'weapon', ilvl: level, rar: rarity, stats: { dmg: 1, crit: 1 }, plus: 0 });
      close(ranges.dmg[0], (3 * effective + 5) * RARITY[rarity].m * 0.9);
      close(ranges.crit[1], STATDEF.crit.f(effective) * (0.6 + 0.4 * RARITY[rarity].m) * 1.15);
      if (rarity) assert.ok(ranges.dmg[0] > statRanges({ slot: 'weapon', ilvl: level, rar: rarity - 1, stats: { dmg: 1 }, plus: 0 }).dmg[0]);
    }
    assert.ok(statRanges({ slot: 'weapon', ilvl: level, rar: 0, stats: { dmg: 1 } }).dmg[1] < (3 * level + 5) * 1.1);
  }
});

test('rarity keeps its number of extra stats', () => {
  for (const level of [100, 1000, 10000]) for (let rarity = 0; rarity < RARITY.length; rarity++) {
    const weapon = equipment.genGear('weapon', level, rarity, 'bow');
    assert.equal(Object.keys(weapon.stats).length, 1 + RARITY[rarity].x, 'rarity ' + rarity);
  }
});

test('affixes use the effective level, and the rolled value matches the displayed range', () => {
  for (const key of Object.keys(AFFIXES)) for (const level of [100, 500, 2000, 10000]) for (const rarity of [0, 3, 5]) {
    const item = equipment.genGear('ring', level, rarity), range = affixRange(item, key);
    close(range.base, AFFIXES[key].f(effectiveStatLevel(level)) * (0.6 + 0.4 * RARITY[rarity].m));
    assert.ok(equipment.applyAffix(item, key));
    const shown = statRanges(item)['afx:' + key]; close(shown[0], range.low); close(shown[1], range.high);
    assert.ok(item.afx.v >= range.low - 0.05 && item.afx.v <= range.high + 0.05);
  }
});

test('rerolling keeps level, rarity and upgrades and rolls with the same soft-capped scaling', () => {
  for (const level of [200, 3000, 10000]) {
    const item = equipment.genGear('armor', level, 4); item.plus = 5; const before = { ilvl: item.ilvl, rar: item.rar, name: item.name };
    for (let n = 0; n < 5; n++) {
      equipment.rerollGear(item);
      assert.deepEqual({ ilvl: item.ilvl, rar: item.rar, name: item.name }, before); assert.equal(item.plus, 5);
      const ranges = statRanges(item); for (const key in item.stats) within(item.stats[key], ranges[key], 'armor ' + key);
    }
  }
});

test('+ upgrades stay independent of the soft cap', () => {
  for (const level of [10, 500, 10000]) for (const plus of [0, 4, 9]) {
    const weapon = { slot: 'weapon', ilvl: level, rar: 3, plus }, ring = { slot: 'ring', ilvl: level, rar: 0, plus };
    assert.equal(plusMul(weapon, 'dmg'), 1 + plus * 0.15); assert.equal(plusMul(ring, 'dmg'), 1 + plus * 0.1);
  }
});

test('merging still makes the average real item level, and the result uses the soft cap', () => {
  const player = { id: 1, name: 'Merger', c: {}, cls: 'blade', lvl: 100, xp: 0, sp: 0, gold: 0, souls: 0, eq: {}, bag: [], inv: {}, sk: newSk(), buf: {}, x: NPCS.smith.x, y: NPCS.smith.y };
  stats(player);
  const inventory = createInventory({ send: noop, say: noop, toast: noop, broadcast: noop, ev: noop, fire: noop, genGear: equipment.genGear, rerollGear: equipment.rerollGear });
  const parts = [800, 1200, 3001, 77].map(level => equipment.genGear('weapon', level, 3, 'sword')); // Epic: 5 items
  parts.push(equipment.genGear('weapon', 4000, 3, 'sword'));
  player.bag = parts.slice(); inventory.doMerge(player, parts.map(item => item.uid));
  assert.equal(player.bag.length, 1); const merged = player.bag[0];
  assert.equal(merged.ilvl, Math.round((800 + 1200 + 3001 + 77 + 4000) / 5)); assert.equal(merged.rar, 4);
  within(merged.stats.dmg, statRanges(merged).dmg, 'merged dmg');
  assert.ok(statRanges(merged).dmg[1] < (3 * merged.ilvl + 5) * RARITY[4].m * 1.1);
});
