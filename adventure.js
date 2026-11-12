'use strict';
const { mapOf, nearNpc, layoutOf } = require('./game-world');
const { MOBTYPES, SPECIAL } = require('./monsters');
const { credit, room } = require('./safety-limits');
const { localizedText } = require('./localized-text');

const CONTRACTS = Object.freeze({
  clear: Object.freeze({ target: 12, souls: 2 }),
  stone: Object.freeze({ target: 2, souls: 3 }),
  boss: Object.freeze({ target: 1, souls: 5 }),
});
const MAX_ENTRIES = 256, MAX_COUNTER = 1000000000, MAX_CLAIMS = 256;
const increment = (value, amount = 1) => Math.min(MAX_COUNTER, Math.max(0, Number.isSafeInteger(value) ? value : 0) + Math.max(0, Math.min(MAX_COUNTER, amount)));
function createAdventure({ send, say, persistPlayer = () => {}, durableSave = async () => {}, sendInventory = () => {}, clock = Date.now }) {
  const today = () => new Date(clock()).toISOString().slice(0, 10);
  const normalized = new WeakSet(), pendingUpdates = new WeakMap(), nextUpdate = new WeakMap(), fullRefresh = new WeakSet();
  let nextDailyCheck = 0;
  function data(player) {
    player.data ||= {};
    const record = player.data.adventure ||= { version: 1, bestiary: {}, day: today(), claimed: [], active: null };
    if (record.version !== 1) return null;
    if (!normalized.has(record)) { record.bestiary = Object.assign(Object.create(null), record.bestiary); normalized.add(record); }
    if (record.day !== today()) { record.day = today(); record.claimed = []; record.active = null; fullRefresh.add(player); }
    if (!Array.isArray(record.claimed)) record.claimed = [];
    return record;
  }
  function entry(player, type) {
    const template = MOBTYPES[type]; if (!template) return null;
    const journal = data(player); if (!journal) return null;
    const key = template.archetype || type, book = journal.bestiary;
    if (!Object.hasOwn(book, key)) {
      if (Object.keys(book).length >= MAX_ENTRIES) return null;
      book[key] = { kills: 0, minLevel: null, maxLevel: null, categories: {}, attacks: [], drops: {} };
    }
    return { key, record: book[key] };
  }
  function publishEntry(player, result) {
    if (!result || !player.c?.adventureOpen) return;
    let update = pendingUpdates.get(player);
    if (!update) pendingUpdates.set(player, update = { t: 'adventureUpdate', entries: Object.create(null) });
    update.entries[result.key] = entryView(result.key, result.record);
  }
  function entryView(key, record) { return { ...record, name: MOBTYPES[key]?.name || key }; }
  function observe(player, monster) {
    const result = entry(player, monster.ty); if (!result) return;
    const record = result.record, template = MOBTYPES[monster.ty];
    const category = template.worldBoss ? 'worldBoss' : template.stone ? 'stone' : template.boss ? 'boss' : monster.alpha ? 'alpha' : 'normal';
    const attack = template.boss && (template.special || SPECIAL[monster.ty] || 'slam');
    const changed = !record.categories[category] || (attack && !record.attacks.includes(attack)) || record.minLevel === null || monster.lvl < record.minLevel || monster.lvl > record.maxLevel;
    record.categories[category] = true;
    if (attack && !record.attacks.includes(attack) && record.attacks.length < 8) record.attacks.push(attack);
    record.minLevel = record.minLevel === null ? monster.lvl : Math.min(record.minLevel, monster.lvl);
    record.maxLevel = record.maxLevel === null ? monster.lvl : Math.max(record.maxLevel, monster.lvl);
    if (changed) publishEntry(player, result);
  }
  function kill(player, monster) {
    observe(player, monster); const result = entry(player, monster.ty);
    if (result) { result.record.kills = increment(result.record.kills); publishEntry(player, result); }
    const record = data(player); if (!record) return;
    const active = record.active;
    if (!active || active.map !== mapOf(monster).index || monster.summoned || player.lvl - monster.lvl >= 13) return;
    const template = MOBTYPES[monster.ty];
    const matches = active.kind === 'stone' ? template.stone : active.kind === 'boss' ? template.boss : !template.stone && !template.boss;
    if (!matches || active.progress >= CONTRACTS[active.kind].target) return;
    active.progress++;
    if (player.c?.adventureOpen) {
      let update = pendingUpdates.get(player);
      if (!update) pendingUpdates.set(player, update = { t: 'adventureUpdate', entries: Object.create(null) });
      update.active = { ...active }; update.day = record.day;
    }
    persistPlayer(player);
  }
  function pickup(player, drop, amount) {
    if (!drop.source) return;
    const result = entry(player, drop.source); if (!result) return;
    const key = drop.kind === 'gear' ? 'gear:' + drop.rar : drop.kind === 'item' ? 'item:' + drop.k : drop.kind;
    if (!Object.hasOwn(result.record.drops, key) && Object.keys(result.record.drops).length >= 32) return;
    result.record.drops[key] = increment(result.record.drops[key], amount); publishEntry(player, result);
  }
  const atSettlement = player => !player.dead && ['camp', 'merchant', 'smith', 'mystic'].some(key => nearNpc(player, key));
  function inspect(player) {
    const record = data(player), map = mapOf(player), available = ['village', 'camp'].includes(layoutOf(map).kind);
    if (!record) { fullRefresh.delete(player); pendingUpdates.delete(player); return say(player, localizedText('adventure.unsupported', 'This journal version is not supported; your saved journal was preserved.')); }
    const delivered = send(player.c, { t: 'adventure', entries: Object.fromEntries(Object.entries(record.bestiary).map(([key, record]) => [key, entryView(key, record)])),
      active: record.active, day: record.day, map: map.index, atSettlement: atSettlement(player), available,
      offers: Object.entries(CONTRACTS).map(([kind, spec]) => ({ kind, ...spec, claimed: record.claimed.includes(map.index + ':' + kind) })), claimLimit: record.claimed.length >= MAX_CLAIMS });
    if (delivered !== false) { pendingUpdates.delete(player); fullRefresh.delete(player); }
    else fullRefresh.add(player);
  }
  async function handle(player, message) {
    if (message.op === 'close') { player.c.adventureOpen = false; pendingUpdates.delete(player); return; }
    if (message.op === 'inspect') { player.c.adventureOpen = true; inspect(player); return; }
    const record = data(player), map = mapOf(player);
    if (!record) return inspect(player);
    if (!atSettlement(player)) { say(player, localizedText('adventure.return', 'Visit a village trader or an encampment board to manage contracts.')); inspect(player); return; }
    if (message.op === 'accept') {
      if (typeof message.kind !== 'string' || !Object.hasOwn(CONTRACTS, message.kind)) return;
      if (record.active || record.claimed.length >= MAX_CLAIMS || record.claimed.includes(map.index + ':' + message.kind)) return inspect(player);
      record.active = { kind: message.kind, map: map.index, progress: 0, day: record.day };
    } else if (message.op === 'abandon') { record.active = null; }
    else if (message.op === 'claim') {
      const active = record.active;
      if (!active || active.map !== map.index || active.progress < CONTRACTS[active.kind].target || record.claimed.includes(map.index + ':' + active.kind) || record.claimed.length >= MAX_CLAIMS) return inspect(player);
      const reward = CONTRACTS[active.kind].souls;
      if (room(player.souls) < reward) { say(player, localizedText('server.storageFull', 'Your currency or consumable storage limit has been reached.')); return; }
      // Mark before awaiting persistence so duplicate requests cannot claim twice.
      record.claimed.push(map.index + ':' + active.kind); record.active = null; credit(player, 'souls', reward); sendInventory(player);
    } else return;
    persistPlayer(player);
    try { await durableSave(); }
    catch (error) { console.error('[adventure save]', error); say(player, localizedText('adventure.savePending', 'Saving failed. Your changes remain in memory and will be retried; do not repeat the reward claim.')); }
    if (!player.c.closed && player.c.p === player) inspect(player);
  }
  function flush(players, now = clock()) {
    const checkDaily = now >= nextDailyCheck, day = checkDaily ? today() : null;
    if (checkDaily) nextDailyCheck = now + 1000;
    for (const player of players) {
      // The existing tick checks the UTC boundary even if the player is idle with the book open.
      if (checkDaily && player.data?.adventure?.version === 1 && player.data.adventure.day !== day) data(player);
      if (!player.c?.adventureOpen || player.c.closed) { pendingUpdates.delete(player); continue; }
      if (fullRefresh.has(player)) {
        if (now >= (nextUpdate.get(player) || 0)) { inspect(player); nextUpdate.set(player, now + 250); }
        continue;
      }
      const update = pendingUpdates.get(player);
      if (update && now >= (nextUpdate.get(player) || 0) && send(player.c, update) !== false) { pendingUpdates.delete(player); nextUpdate.set(player, now + 250); }
    }
  }
  return { observe, kill, pickup, handle, inspect, flush };
}
module.exports = { createAdventure, CONTRACTS };
