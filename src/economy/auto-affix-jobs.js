'use strict';
const { AFFIXES, AFFIX_COST, AFFIX_SLOTS, affixRange, itemView } = require('./equipment');
const { AUTO_AFFIX_LIMITS: LIMITS, validAmount, canSpend } = require('../shared/safety-limits');
const { estimate } = require('../../public/affix-math');
const { nearNpc, mapOf } = require('../world/game-world');
const validUid = uid => typeof uid === 'string' && uid.length > 0 && uid.length <= 128 && uid.trim() === uid && !/[\x00-\x1f\x7f]/.test(uid);
const invariant = item => { const { name, afx, ...metadata } = item; return JSON.stringify(metadata); };
const state = item => JSON.stringify(item);
function createAutoAffixJobs({ applyAffix, send, sendInventory, refreshStats, persistPlayer, isItemReserved = () => false, isPlayerOnline = player => !player.c?.closed && player.c?.p !== null, clock = Date.now }) {
  const jobs = new Map(), lastResults = new WeakMap(); let nextJobId = 1;
  function owned(player, uid) {
    const matches = player.bag.filter(item => item.uid === uid).map(item => ({ item, location: 'bag' }));
    for (const [slot, item] of Object.entries(player.eq)) if (item?.uid === uid) matches.push({ item, location: 'eq:' + slot });
    return matches.length === 1 ? matches[0] : null;
  }
  function isReserved(player, uid) { const job = jobs.get(player.id); return !!job && job.player === player && job.uid === uid; }
  function validate(player, uid, key) {
    if (!validUid(uid)) return { error: 'invalid_item' };
    if (typeof key !== 'string' || !Object.hasOwn(AFFIXES, key)) return { error: 'invalid_affix' };
    if (!isPlayerOnline(player)) return { error: 'disconnected' };
    if (player.dead) return { error: 'dead' };
    if (!nearNpc(player, 'mystic')) return { error: 'out_of_range' };
    const record = owned(player, uid);
    if (!record || !Object.hasOwn(AFFIX_SLOTS, record.item.slot) || !affixRange(record.item, key)) return { error: 'invalid_item' };
    if (isItemReserved(player, uid)) return { error: 'item_reserved' };
    const cost = AFFIX_COST[record.item.rar];
    if (!Number.isSafeInteger(cost) || cost <= 0 || !validAmount(player.souls)) return { error: 'invalid_balance' };
    return { ...record, cost, range: affixRange(record.item, key) };
  }
  function view(job) {
    return { id: job.id, uid: job.uid, key: job.key, minimum: job.minimum, maxAttempts: job.maxAttempts, maxSouls: job.maxSouls, attempts: job.attempts, spent: job.spent, best: job.best, current: job.item.afx && { ...job.item.afx }, itemName: job.item.name, cost: job.cost, souls: job.player.souls, startedAt: job.startedAt, status: job.status, reason: job.reason || null, remainingBudget: Math.max(0, job.maxSouls - job.spent), remainingAttempts: Math.max(0, Math.min(job.maxAttempts - job.attempts, Math.floor(Math.min(Math.max(0, job.maxSouls - job.spent), Math.max(0, job.player.souls)) / job.cost))), estimate: job.estimate };
  }
  function publish(job, force = false) {
    const now = clock();
    if (!force && now - job.lastPublish < LIMITS.progressMs) return;
    job.lastPublish = now;
    const snapshot = view(job); lastResults.set(job.player, snapshot);
    if (isPlayerOnline(job.player)) { send(job.player.c, { t: 'autoAffixStatus', job: snapshot }); sendInventory(job.player); }
  }
  function finish(job, status, reason = status) {
    if (job.status !== 'running') return;
    jobs.delete(job.player.id); job.status = status; job.reason = reason;
    refreshStats(job.player); persistPlayer(job.player); publish(job, true);
  }
  function reject(player, error, extra = {}) {
    const current = jobs.get(player.id);
    send(player.c, { t: 'autoAffixStatus', error, ...(current ? { job: view(current) } : {}), ...extra });
    return false;
  }
  function inspect(player, uid, key) {
    const result = validate(player, uid, key);
    if (result.error) return reject(player, result.error);
    const ranges = Object.fromEntries(Object.keys(AFFIXES).map(key => [key, affixRange(result.item, key)]).filter(([, range]) => range));
    send(player.c, { t: 'autoAffixPreview', uid, item: itemView(result.item), location: result.location, ranges, cost: result.cost, souls: player.souls, limits: LIMITS, ...(jobs.has(player.id) ? { job: view(jobs.get(player.id)) } : {}) });
    return true;
  }
  function start(player, request) {
    if (jobs.has(player.id)) return reject(player, 'already_running');
    const { uid, key, minimum, maxAttempts, maxSouls } = request;
    if (typeof key !== 'string' || !Number.isFinite(minimum) || minimum < 0 || minimum > LIMITS.maxMinimum || Math.abs(minimum * 10 - Math.round(minimum * 10)) > 1e-7 || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > LIMITS.maxAttempts || !Number.isSafeInteger(maxSouls) || maxSouls < 0 || maxSouls > LIMITS.maxSouls) return reject(player, 'invalid_limits');
    const result = validate(player, uid, key); if (result.error) return reject(player, result.error);
    const target = Math.round(minimum * 10) / 10;
    const prediction = estimate({ ...result.range, minimum: target, attempts: maxAttempts, budget: maxSouls, souls: player.souls, cost: result.cost, current: result.item.afx, key });
    if (!prediction.valid || prediction.impossible) return reject(player, 'impossible_target', { estimate: prediction });
    const job = { id: nextJobId++, player, uid, item: result.item, location: result.location, map: mapOf(player), key, minimum: target, maxAttempts, maxSouls, cost: result.cost, range: result.range, attempts: 0, spent: 0, best: null, startedAt: clock(), lastPublish: -Infinity, status: 'running', estimate: prediction, expectedState: state(result.item) };
    jobs.set(player.id, job);
    if (prediction.alreadySatisfied) finish(job, 'success', 'already_satisfied');
    else if (maxSouls < job.cost) finish(job, 'budget_exhausted');
    else if (!canSpend(player.souls, job.cost)) finish(job, 'insufficient_souls');
    else publish(job, true);
    return true;
  }
  function stop(player, reason = 'stopped') {
    const job = jobs.get(player.id);
    if (job && job.player === player) { finish(job, reason); return true; }
    const last = lastResults.get(player);
    if (isPlayerOnline(player)) send(player.c, { t: 'autoAffixStatus', job: last || null });
    return false;
  }
  function status(player) {
    const job = jobs.get(player.id);
    send(player.c, { t: 'autoAffixStatus', job: job?.player === player ? view(job) : lastResults.get(player) || null });
  }
  function executeRoll(job) {
    const { player, item } = job;
    let backup; const beforeSouls = player.souls;
    try {
      backup = structuredClone(item); const unrelated = invariant(item);
      player.souls -= job.cost;
      const result = applyAffix(item, job.key), affix = item.afx;
      const minimum = Math.round(job.range.low * 10) / 10, maximum = Math.round(job.range.high * 10) / 10;
      if (result !== true || !affix || affix.k !== job.key || !Number.isFinite(affix.v) || affix.v < minimum || affix.v > maximum || Math.abs(affix.v * 10 - Math.round(affix.v * 10)) > 1e-7 || invariant(item) !== unrelated || !item.name.startsWith(AFFIXES[job.key].prefix + ' ')) throw new Error('Invalid affix roll');
      job.attempts++; job.spent += job.cost; job.best = job.best === null ? affix.v : Math.max(job.best, affix.v); job.expectedState = state(item);
      return true;
    } catch {
      if (backup) { for (const key of Object.keys(item)) delete item[key]; Object.assign(item, backup); }
      player.souls = beforeSouls;
      finish(job, 'error', 'invalid_roll'); return false;
    }
  }
  function process() {
    let budget = LIMITS.attemptsPerTick, visited = 0, remaining = Math.min(jobs.size, LIMITS.jobsPerTick);
    while (remaining-- > 0 && budget > 0 && jobs.size) {
      const [id, job] = jobs.entries().next().value; visited++;
      let count = 0;
      while (count < LIMITS.attemptsPerJob && budget > 0 && job.status === 'running') {
        const { player } = job;
        if (mapOf(player) !== job.map) { finish(job, 'cancelled', 'region_changed'); break; }
        const current = validate(player, job.uid, job.key);
        if (current.error) { const error = current.error; finish(job, ['disconnected', 'out_of_range'].includes(error) ? error : error === 'dead' ? 'cancelled' : 'invalid_item', error); break; }
        if (current.item !== job.item || current.location !== job.location || current.cost !== job.cost || state(job.item) !== job.expectedState) { finish(job, 'invalid_item', 'item_changed'); break; }
        if (job.item.afx?.k === job.key && Number.isFinite(job.item.afx.v) && job.item.afx.v >= job.minimum) { finish(job, 'success'); break; }
        if (job.attempts >= job.maxAttempts) { finish(job, 'attempts_exhausted'); break; }
        if (job.cost > job.maxSouls - job.spent) { finish(job, 'budget_exhausted'); break; }
        if (!canSpend(player.souls, job.cost)) { finish(job, 'insufficient_souls'); break; }
        budget--; count++;
        if (!executeRoll(job)) break;
        if (job.item.afx.v >= job.minimum) finish(job, 'success');
        else if (job.attempts >= job.maxAttempts) finish(job, 'attempts_exhausted');
        else if (job.cost > job.maxSouls - job.spent) finish(job, 'budget_exhausted');
        else if (!canSpend(player.souls, job.cost)) finish(job, 'insufficient_souls');
      }
      if (job.status === 'running') { if (count) { refreshStats(job.player); persistPlayer(job.player); } jobs.delete(id); jobs.set(id, job); if (count) publish(job); }
    }
    return { attempts: LIMITS.attemptsPerTick - budget, visited };
  }
  function cancelAll(reason = 'cancelled') { for (const job of [...jobs.values()]) finish(job, reason); }
  function cancelActive(player, reason = 'stopped') { if (jobs.get(player.id)?.player === player) return stop(player, reason); return false; }
  return { inspect, start, stop, status, process, cancelAll, cancelActive, isReserved, limits: LIMITS, activeCount: () => jobs.size };
}
module.exports = { createAutoAffixJobs };
