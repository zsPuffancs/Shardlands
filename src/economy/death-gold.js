'use strict';
const { frontierAverageGold, GOLD_BALANCE } = require('./gold-rewards');
const { DEATH_GOLD_LIMITS, validAmount } = require('../shared/safety-limits');

const DEFAULT_DEATH_GOLD_RATES = Object.freeze({ deathGoldLoss: DEATH_GOLD_LIMITS.maxFraction, deathGoldKillCap: DEATH_GOLD_LIMITS.maxNormalKills });
const MAX_FRACTION_DIVISOR = 1 / DEATH_GOLD_LIMITS.maxFraction;
const bounded = (value, maximum) => Number.isFinite(value) ? Math.max(0, Math.min(maximum, value)) : maximum;

function deathGoldPenalty(player, rates = {}) {
  if (!validAmount(player.gold) || !player.gold || !Number.isFinite(player.lvl)) return 0;
  const level = Math.max(1, Math.min(GOLD_BALANCE.maxLevel, Math.floor(player.lvl)));
  const fraction = bounded(rates.deathGoldLoss, DEATH_GOLD_LIMITS.maxFraction);
  const kills = bounded(rates.deathGoldKillCap, DEATH_GOLD_LIMITS.maxNormalKills);
  const referenceReward = frontierAverageGold(level, 'normal');
  // Division enforces the exact 5% ceiling even at maximum safe integer balances.
  return Math.min(Math.floor(player.gold * fraction), Math.floor(player.gold / MAX_FRACTION_DIVISOR), Math.floor(kills * referenceReward));
}

module.exports = { DEFAULT_DEATH_GOLD_RATES, deathGoldPenalty };
