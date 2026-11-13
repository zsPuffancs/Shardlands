'use strict';

const MAX_SAFE_AMOUNT = Number.MAX_SAFE_INTEGER;
const MAX_CURRENCY = MAX_SAFE_AMOUNT;
const MAX_ITEM_STACK = 1000000;
const MAX_GEAR_DROPS = 10;
const MAX_SUMMONS_GLOBAL = 512, MAX_SUMMONS_PER_MAP = 128, MAX_SUMMONS_PER_SOURCE = 64;
const FORGE_ATTEMPTS_PER_TICK = 100, FORGE_ATTEMPTS_PER_JOB = 25;
const AUTO_AFFIX_LIMITS = Object.freeze({ attemptsPerTick: 50, attemptsPerJob: 10, jobsPerTick: 100, maxAttempts: 100000, maxSouls: 1000000, maxMinimum: 1000000, progressMs: 250 });
const LEVEL_UPS_PER_TICK = 20;
const DEATH_GOLD_LIMITS = Object.freeze({ maxFraction: .05, maxNormalKills: 12 });
const RATE_BOUNDS = Object.freeze({ xpRate: 1000000, goldRate: 1000000, gearDropRate: 1000, potionDropRate: 1000, rarityBoost: 1000, monsterHp: 1000000, monsterDamage: 1000000, deathZoneMonsters: 10000, deathGoldLoss: DEATH_GOLD_LIMITS.maxFraction, deathGoldKillCap: DEATH_GOLD_LIMITS.maxNormalKills, respawnSeconds: 86400 });
const validAmount = value => Number.isSafeInteger(value) && value >= 0;
const positiveAmount = value => Number.isFinite(value) && value > 0 ? Math.min(MAX_SAFE_AMOUNT, Math.floor(value)) : 0;
function room(current = 0, cap = MAX_CURRENCY) { return validAmount(current) ? Math.max(0, cap - current) : 0; }
function credit(object, key, amount, cap = MAX_CURRENCY) {
  const current = object[key] ?? 0, added = Math.min(room(current, cap), positiveAmount(amount));
  if (added) object[key] = current + added;
  return added;
}
function canSpend(balance, amount) { return validAmount(balance) && validAmount(amount) && amount <= balance; }
function adjust(object, key, amount, cap = MAX_CURRENCY) {
  if (!Number.isSafeInteger(amount)) return 0;
  if (amount >= 0) return credit(object, key, amount, cap);
  const current = object[key] ?? 0; if (!validAmount(current)) return 0;
  const removed = Math.min(current, -amount); object[key] = current - removed; return -removed;
}
function boundedRateSettings(defaults) {
  return new Proxy({ ...defaults }, { set(target, key, value) {
    if (Object.hasOwn(RATE_BOUNDS, key)) { if (Number.isFinite(value)) target[key] = Math.max(0, Math.min(RATE_BOUNDS[key], value)); return true; }
    return Reflect.set(target, key, value);
  } });
}
// Token buckets have fixed keys, so arbitrary message types cannot grow connection memory.
function consume(bucket, rate, capacity, now, amount = 1) {
  bucket.tokens = Math.min(capacity, (bucket.tokens ?? capacity) + Math.max(0, now - (bucket.at ?? now)) * rate / 1000); bucket.at = now;
  if (bucket.tokens < amount) return false; bucket.tokens -= amount; return true;
}
function commandAllowed(connection, type, now = Date.now()) {
  if (!connection.commandBudget) connection.commandBudget = { all: {}, movement: {}, chat: {}, actions: {}, join: {}, sync: {} };
  const budget = connection.commandBudget;
  if (!consume(budget.all, 100, 150, now)) return false;
  if (type === 'dir' || type === 'move' || type === 'target') return consume(budget.movement, 40, 60, now);
  if (type === 'chat') return consume(budget.chat, 3, 6, now);
  if (type === 'join' || type === 'gmLogin' || type === 'gmReauth' || type === 'gmChangePassword') return consume(budget.join, .5, 3, now);
  if (['uiSync', 'universe', 'portal'].includes(type)) return consume(budget.sync, 5, 10, now);
  return consume(budget.actions, 15, 30, now);
}
module.exports = { AUTO_AFFIX_LIMITS, DEATH_GOLD_LIMITS, MAX_SAFE_AMOUNT, MAX_CURRENCY, MAX_ITEM_STACK, MAX_GEAR_DROPS, MAX_SUMMONS_GLOBAL, MAX_SUMMONS_PER_MAP, MAX_SUMMONS_PER_SOURCE, FORGE_ATTEMPTS_PER_TICK, FORGE_ATTEMPTS_PER_JOB, LEVEL_UPS_PER_TICK, RATE_BOUNDS, validAmount, positiveAmount, room, credit, canSpend, adjust, boundedRateSettings, consume, commandAllowed };
