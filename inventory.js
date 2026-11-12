'use strict';
const crypto = require('node:crypto');
const { createAutoAffixJobs } = require('./auto-affix-jobs');

const { MAX_ITEM_STACK, FORGE_ATTEMPTS_PER_TICK, FORGE_ATTEMPTS_PER_JOB, validAmount, room, credit, canSpend } = require('./safety-limits');
const { localizedText: messageText, gearText, isLocalizedText } = require('./localized-text');

const { NPCS, CX, CY, nearNpc, inVillage, rnd, placeInVillage, npcPosition, mapOf } = require('./game-world');
const { BASES, SLOTS, RARITY, MYTHIC, MERGE_COST, REROLL_COST, AFFIXES, AFFIX_SLOTS, AFFIX_COST, MYTHIC_MERGE_COUNT, MYTHIC_MERGE_GOLD, itemView, UP_RATE, upCostFor, sellValue } = require('./equipment');
// Elixirs and scrolls stack: each one adds its duration, up to this much time left.
const BUFF_CAP_MS = 5 * 60 * 1000;
const BUFF_DURATION = { atk: 60000, def: 60000, spd: 60000, xp: 300000 };
const RARITY_COLOR = ['#d8d8d8', '#4ee26a', '#4da3ff', '#b25cff', '#ff9d2e', '#ff4560'];
const { CLASSES, ITEMS, SKILLS, newSk, stats, defRed, critCh, critMul, goldFind, playerDmg, rank, passive, gearLifesteal, gearAttackSpeed } = require('./characters');

const BAG_PAGE_SIZE = 30;
const BAGMAX = BAG_PAGE_SIZE * 3;

function createInventory({ send, say, toast, broadcast, ev, fire, genGear, rerollGear, applyAffix, isItemReserved = () => false, persistPlayer = () => {}, isPlayerOnline }) {
  const autoAffixJobs = createAutoAffixJobs({ applyAffix, send, sendInventory: sendInv, refreshStats: refreshGearStats, persistPlayer, isPlayerOnline, isItemReserved: (player, uid) => isItemReserved(player, uid) || forgeJobs.get(player.id)?.uid === uid });
  const autoAffixBusy = (player, uid) => autoAffixJobs.isReserved(player, uid);
  const rejectAutoAffixConflict = player => say(player, messageText('autoAffix.busy', 'Stop Auto Affix before changing this item.'));
  function rejectReservedChange(player, uids) {
    if (uids.some(uid => autoAffixBusy(player, uid))) { rejectAutoAffixConflict(player); return true; }
    if (uids.some(uid => isItemReserved(player, uid))) { say(player, messageText('trade.itemReserved', 'Remove this item from your trade offer before changing it.')); return true; }
    return false;
  }
  function handleAutoAffix(player, message) {
    if (message.op === 'inspect') return autoAffixJobs.inspect(player, message.uid, message.key);
    if (message.op === 'start') return autoAffixJobs.start(player, message);
    if (message.op === 'stop') return autoAffixJobs.stop(player);
    if (message.op === 'status') return autoAffixJobs.status(player);
  }
  const destroyRequests = new WeakMap(), DESTROY_TTL_MS = 30000;
  const validUid = uid => typeof uid === 'string' && uid.length > 0 && uid.length <= 128 && uid.trim() === uid && !/[\x00-\x1f\x7f]/.test(uid);
  const itemFingerprint = item => crypto.createHash('sha256').update(JSON.stringify(item)).digest('hex');
  function destroyFailure(player, uid, key, fallback) { send(player.c, { t: 'destroyResult', uid: typeof uid === 'string' ? uid : null, ok: false, m: messageText(key, fallback) }); return false; }
  function destroyCandidate(player, uid) {
    if (!validUid(uid)) return { key: 'inventory.destroyInvalidUid', fallback: 'Invalid item identifier.' };
    if (player.dead) return { key: 'inventory.destroyDead', fallback: 'You cannot destroy items while dead.' };
    const items = player.bag.filter(item => item.uid === uid);
    if (Object.values(player.eq).some(item => item?.uid === uid) || items.length > 1 || items[0]?.lk || isItemReserved(player, uid) || autoAffixBusy(player, uid) || forgeJobs.get(player.id)?.uid === uid) return { key: 'inventory.destroyProtected', fallback: 'This item is equipped, locked or reserved by another operation.' };
    if (items.length !== 1) return { key: 'inventory.destroyNotFound', fallback: 'This item is no longer in your bag.' };
    return { item: items[0] };
  }
  function prepareDestroy(player, uid) {
    destroyRequests.delete(player);
    const candidate = destroyCandidate(player, uid);
    if (!candidate.item) return destroyFailure(player, uid, candidate.key, candidate.fallback);
    const token = crypto.randomBytes(18).toString('base64url'), expiresAt = Date.now() + DESTROY_TTL_MS;
    destroyRequests.set(player, { uid, token, expiresAt, item: candidate.item, fingerprint: itemFingerprint(candidate.item) });
    send(player.c, { t: 'destroyPreview', uid, token, expiresAt, item: itemView(candidate.item), deliberate: candidate.item.rar >= 4 });
    return true;
  }
  function destroyItem(player, uid, token, deliberate) {
    const request = destroyRequests.get(player); destroyRequests.delete(player);
    if (!validUid(uid) || !request || request.uid !== uid || typeof token !== 'string' || token !== request.token || Date.now() >= request.expiresAt) return destroyFailure(player, uid, 'inventory.destroyExpired', 'Confirmation expired. Select the item and confirm again.');
    const candidate = destroyCandidate(player, uid);
    if (!candidate.item) return destroyFailure(player, uid, candidate.key, candidate.fallback);
    const item = candidate.item;
    if (item !== request.item || itemFingerprint(item) !== request.fingerprint) return destroyFailure(player, uid, 'inventory.destroyChanged', 'The item changed. Inspect it and confirm again.');
    if (item.rar >= 4 && deliberate !== true) return destroyFailure(player, uid, 'inventory.destroyDeliberate', 'Legendary and Mythic items require the additional confirmation.');
    player.bag.splice(player.bag.indexOf(item), 1);
    persistPlayer(player); sendInv(player);
    send(player.c, { t: 'destroyResult', uid, ok: true, m: messageText('inventory.destroySuccess', 'Permanently destroyed {item}.', { item: gearText(item.name) }) });
    return true;
  }
  function sendInv(player) { const eq = {}; for (const slot of SLOTS) eq[slot] = itemView(player.eq[slot]);
    send(player.c, { t: 'inv', bag: player.bag.map(itemView), eq, skb: player.skb || {}, souls: player.souls || 0, gs: Object.assign({}, player.g, { _dmg: Math.round(playerDmg(player)), _dr: Math.round(defRed(player) * 100), _hp: player.maxhp, _mp: player.maxmp, _crit: Math.round(critCh(player) * 100), _cdmg: Math.round(critMul(player) * 100), _ls: Math.round((passive(player, 'lifesteal') + gearLifesteal(player)) * 1000) / 10, _haste: Math.round((1 - (1 - passive(player, 'haste')) * (1 - gearAttackSpeed(player))) * 100), _gf: Math.round(goldFind(player)) }) }); }
  function refreshGearStats(player) {
    stats(player);
    player.hp = Math.min(player.hp, player.maxhp);
    player.mp = Math.min(player.mp, player.maxmp);
  }
  function afterGearChange(player) { refreshGearStats(player); sendInv(player); }
  function starterWeapon(player, plus) { const item = genGear('weapon', 1, 0, CLASSES[player.cls].fam); item.name = 'Worn ' + BASES.weapon[item.fam]; item.plus = plus || 0; return item; }
  function addGear(player, item) { if (player.bag.length >= BAGMAX) return false; player.bag.push(item); sendInv(player); return true; }

  function useItem(player, itemKey) {
    if (!Object.hasOwn(ITEMS, itemKey)) return;
    const item = ITEMS[itemKey], now = Date.now();
    if (!item || player.dead || !canSpend(player.inv[itemKey], 1)) return;
    const isPotion = itemKey === 'hp' || itemKey === 'hp2' || itemKey === 'mp';
    if (typeof item.use === 'function') { let r; try { r = item.use(player); } catch (e) { return say(player, messageText("server.itemError", "Item error: {error}", { error: e.message })); } if (r === false) return; player.inv[itemKey]--; if (typeof r === 'string' || isLocalizedText(r)) say(player, r); return; }
    if (isPotion) { if (now < player.potCd) return; if (itemKey === 'mp' ? player.mp >= player.maxmp : player.hp >= player.maxhp) return; }
    if (itemKey === 'ret' && inVillage(player)) return say(player, messageText("server.inVillage", "You are already in the village."));
    if (BUFF_DURATION[itemKey] && (player.buf[itemKey] || 0) - now > BUFF_CAP_MS - 1000) return say(player, messageText('server.buffFull', '{item} is already at the 5 minute maximum.', { item: messageText('item.' + itemKey + '.name', item.n) }));
    if (itemKey === 'reset' && SKILLS.every(slot => player.sk[slot] === (slot === 's1' ? 1 : 0))) return say(player, messageText("server.nothingToReset", "Nothing to reset."));
    player.inv[itemKey]--; if (isPotion) player.potCd = now + 1000;
    if (itemKey === 'hp' || itemKey === 'hp2') {
      const healAmount = Math.floor(player.maxhp * (itemKey === 'hp' ? 0.4 : 1));
      const previousHealth = player.hp;
      player.hp = Math.min(player.maxhp, player.hp + healAmount);
      const restoredHealth = Math.round(player.hp - previousHealth);
      ev('heal', player.x, player.y, '+' + restoredHealth, { combatPlayerId: player.id, restoredHealth });
    }
    else if (itemKey === 'mp') {
      const restoredMana = Math.min(player.maxmp - player.mp, Math.floor(player.maxmp * 0.5));
      player.mp += restoredMana;
      ev('mana', player.x, player.y, '+' + Math.round(restoredMana));
    }
    else if (BUFF_DURATION[itemKey]) { player.buf[itemKey] = Math.min(now + BUFF_CAP_MS, Math.max(now, player.buf[itemKey] || 0) + BUFF_DURATION[itemKey]); ev('fx', player.x, player.y, 50, { s: 'buff', a: player.id }); }
    else if (itemKey === 'ret') { ev('fx', player.x, player.y, 60, { s: 'buff', a: player.id }); placeInVillage(player); player.dest = null; player.target = 0; player.chasingTarget = false; ev('fx', player.x, player.y, 60, { s: 'buff', a: player.id }); }
    else if (itemKey === 'reset') { player.sk = newSk(); player.sp = player.lvl; stats(player); player.hp = Math.min(player.hp, player.maxhp); say(player, messageText("server.skillRefund", "Skill points refunded: {count} available.", { count: player.sp })); sendInv(player); }
    if (!isPotion && itemKey !== 'ret' && itemKey !== 'reset') say(player, messageText("server.itemUsed", "{item} used.", { item: messageText('item.' + itemKey + '.name', item.n) }));
  }

  function mergeItems(player, items) {
    const rarity = items[0].rar, first = items[0], itemLevel = Math.max(1, Math.round(items.reduce((sum, i) => sum + (i.ilvl || 1), 0) / items.length));
    const result = genGear(first.slot, itemLevel, Math.min(MYTHIC, rarity + 1), first.fam); result.plus = Math.max(...items.map(i => i.plus || 0));
    const firstItemIndex = player.bag.indexOf(first); player.bag = player.bag.filter(i => !items.includes(i)); player.bag.splice(Math.min(firstItemIndex, player.bag.length), 0, result);
    fire('merge', player, result, items); return result;
  }
  function doMerge(player, uids) {
    if (player.dead || !Array.isArray(uids) || uids.length < 2 || uids.length > 15 || new Set(uids).size !== uids.length) return;
    if (rejectReservedChange(player, uids)) return;
    const items = uids.map(u => player.bag.find(i => i.uid === u)); if (items.some(i => !i)) return;
    if (items.some(i => i.lk)) return say(player, messageText('server.itemLocked', 'Locked items are protected. Unlock them first (Ctrl+click).'));
    if (items.some(i => i.rar !== items[0].rar)) return say(player, messageText("server.mergeRarity", "Pick items of the same rarity (colour) to merge."));
    if (items[0].rar >= MYTHIC) return say(player, messageText("server.mergeMythic", "Mythic items are the highest tier and cannot be merged."));
    const need = MERGE_COST[items[0].rar];
    if (items.length !== need) return say(player, messageText("server.mergeNeedCount", "Merging {rarity} items needs exactly {count} of them.", { rarity: messageText('rarity.' + items[0].rar, RARITY[items[0].rar].n), count: need }));
    const result = mergeItems(player, items); ev('fx', player.x, player.y, 60, { s: 'lvl', a: player.id }); ev('loot', player.x, player.y, messageText("server.mergeResult", "Merged: {item}", { item: gearText(result.name) }), { r: result.rar });
    toast(player, messageText("server.mergeDetail", "Merged → {rarity} {item} (iLvl {level})", { rarity: messageText('rarity.' + result.rar, RARITY[result.rar].n), item: gearText(result.name), level: result.ilvl }), RARITY_COLOR[result.rar]);
    if (result.rar >= 3) broadcast({ t: 'chat', n: '*', m: messageText("server.playerMerged", "{player} merged a {rarity} {item}!", { player: player.name, rarity: messageText('rarity.' + result.rar, RARITY[result.rar].n), item: gearText(result.name) }) });
    sendInv(player);
  }
  function autoMerge(player, maxRarity) {
    if (player.dead) return; maxRarity = Math.max(0, Math.min(MYTHIC - 1, maxRarity | 0)); let n = 0, used = 0, best = null;
    for (let r = 0; r <= maxRarity; r++) for (;;) {
      const need = MERGE_COST[r], g = player.bag.filter(i => i.rar === r && !i.lk && !autoAffixBusy(player, i.uid) && !isItemReserved(player, i.uid)).sort((a, b) => a.ilvl - b.ilvl); if (g.length < need) break;
      const result = mergeItems(player, g.slice(0, need)); n++; used += need; if (!best || result.rar > best.rar) best = result;
    }
    if (!n) return say(player, messageText("server.nothingToMergeCounts", "Nothing to merge: you need 2 Common, 3 Uncommon, 4 Rare, 5 Epic or 15 Legendary items of the same rarity."));
    ev('fx', player.x, player.y, 60, { s: 'lvl', a: player.id }); ev('loot', player.x, player.y, messageText("server.mergeCount", "Merges: {count}!", { count: n }), { r: best.rar });
    say(player, messageText("server.bestMerge", "Merged {used} items into {count}. Best result: {rarity} {item}.", { used, count: n, rarity: messageText('rarity.' + best.rar, RARITY[best.rar].n), item: gearText(best.name) })); toast(player, messageText("server.mergeDone", "Completed merges: {count}", { count: n }), '#ffe97a'); sendInv(player);
  }
  function tryUpgrade(player, item, cost) {
    player.gold -= cost;
    const success = Math.random() < UP_RATE[item.plus];
    const drop = !success && item.plus >= 5;
    if (success) item.plus++;
    else if (drop) item.plus--;
    return { success, drop };
  }

  function announceUpgrade(player, item) {
    if (item.plus < 7) return;
    broadcast({ t: 'chat', n: '*', m: messageText('server.playerForged', '{player} forged a +{level} {item}!', {
      player: player.name, level: item.plus, item: gearText(item.name),
    }) });
  }

  function upgradeItem(player, uid, automatic = false) {
    if (rejectReservedChange(player, [uid])) return;
    const rejectUpgrade = message => send(player.c, { t: 'forge', uid, m: message, pending: forgeJobs.has(player.id) });
    if (!nearNpc(player, 'smith')) return rejectUpgrade(messageText('server.upgradeAtSmith', 'Talk to the Blacksmith in the village to upgrade equipment.'));
    if (forgeJobs.has(player.id)) return rejectUpgrade(messageText('server.forgeBusy', 'Your automatic upgrade is still running.'));
    const item = SLOTS.map(slot => player.eq[slot]).find(gear => gear?.uid === uid);
    if (!item) return rejectUpgrade(messageText('server.upgradeWorn', 'The Blacksmith only upgrades equipment you are wearing.'));
    if (item.plus >= 9) return rejectUpgrade(messageText('server.upgradeMax', '{item} is already +9.', { item: gearText(item.name) }));
    let cost = upCostFor(item);
    if (!canSpend(player.gold, cost)) return rejectUpgrade(messageText('server.upgradeCost', 'The Blacksmith wants {gold} gold.', { gold: cost }));

    const smith = npcPosition(mapOf(player), 'smith');
    if (!automatic) {
      const { success, drop } = tryUpgrade(player, item, cost);
      send(player.c, { t: 'forge', ok: success ? 1 : 0, uid, plus: item.plus, ...(success ? {} : { drop }) });
      ev('fx', smith.x, smith.y, success ? 50 : 40, { s: success ? 'lvl' : 'rage' });
      if (success) announceUpgrade(player, item);
    } else {
      forgeJobs.set(player.id, { player, item, uid, initialLevel: item.plus, attempts: 0, spent: 0 });
      send(player.c, { t: 'forge', automatic: true, pending: true, uid, plus: item.plus, attempts: 0, spent: 0 });
      return;
    }
    afterGearChange(player);
  }

  const forgeJobs = new Map();
  function processForgeJobs() {
    let budget = FORGE_ATTEMPTS_PER_TICK;
    for (const [id, job] of [...forgeJobs]) {
      const { player, item, uid } = job;
      const disconnected = player.c.closed || player.c.p === null;
      const valid = !disconnected && !player.dead && nearNpc(player, 'smith') && SLOTS.some(slot => player.eq[slot] === item);
      let cost = upCostFor(item), count = 0;
      while (valid && budget > 0 && count < FORGE_ATTEMPTS_PER_JOB && item.plus < 9 && cost > 0 && canSpend(player.gold, cost)) {
        tryUpgrade(player, item, cost); job.attempts++; credit(job, 'spent', cost); budget--; count++;
        cost = upCostFor(item);
      }
      const done = !valid || item.plus >= 9 || cost <= 0 || !canSpend(player.gold, cost);
      if (done) forgeJobs.delete(id);
      if (!disconnected && (count || done)) {
        const improved = item.plus > job.initialLevel;
        send(player.c, { t: 'forge', automatic: true, pending: !done, cancelled: !valid, ok: improved ? 1 : 0, uid, plus: item.plus, attempts: job.attempts, spent: job.spent });
        afterGearChange(player);
        if (done && valid) {
          const smith = npcPosition(mapOf(player), 'smith'); ev('fx', smith.x, smith.y, improved ? 50 : 40, { s: improved ? 'lvl' : 'rage' });
          if (improved) announceUpgrade(player, item);
        }
      }
      // Rotate unfinished jobs so one rich player cannot monopolize the next tick.
      if (!done) { forgeJobs.delete(id); forgeJobs.set(id, job); }
      if (budget <= 0) break;
    }
  }

  function rerollItem(player, uid) {
    if (rejectReservedChange(player, [uid])) return;
    if (!nearNpc(player, 'mystic')) return say(player, messageText("server.rerollAtMystic", "Talk to the Soul Mystic in the village to reroll equipment."));
    let item = player.bag.find(i => i.uid === uid) || null; for (const slot of SLOTS) if (!item && player.eq[slot] && player.eq[slot].uid === uid) item = player.eq[slot];
    if (!item) return;
    const cost = REROLL_COST[item.rar] || 1;
    if (!canSpend(player.souls || 0, cost)) return say(player, messageText("server.rerollCost", "The Soul Mystic wants {souls} souls.", { souls: cost }));
    player.souls -= cost; rerollGear(item); fire('reroll', player, item);
    const mystic = npcPosition(mapOf(player), 'mystic'); ev('fx', mystic.x, mystic.y, 55, { s: 'summon' }); send(player.c, { t: 'reroll', uid: item.uid });
    if (item.rar >= 4) broadcast({ t: 'chat', n: '*', channel: 'loot', m: messageText("server.playerRerolled", "{player} rerolled {rarity} {item}.", { player: player.name, rarity: messageText('rarity.' + item.rar, RARITY[item.rar].n), item: gearText(item.name) }) });
    afterGearChange(player);
  }

  // Locked items cannot be sold, merged, fused or traded until they are unlocked.
  function lockItem(player, uid) {
    if (rejectReservedChange(player, [uid])) return;
    let item = player.bag.find(i => i.uid === uid) || null;
    for (const slot of SLOTS) if (!item && player.eq[slot] && player.eq[slot].uid === uid) item = player.eq[slot];
    if (!item) return;
    if (item.lk) delete item.lk; else item.lk = 1;
    sendInv(player);
  }
  // Blacksmith: three unwanted Mythics from the bag become one random Mythic at their average item level.
  function mergeMythics(player, uids) {
    const reply = (message, extra) => send(player.c, { t: 'mythicMerge', m: message, ...extra });
    if (player.dead || !Array.isArray(uids) || uids.length !== MYTHIC_MERGE_COUNT || new Set(uids).size !== uids.length) return;
    if (rejectReservedChange(player, uids)) return;
    if (!nearNpc(player, 'smith')) return reply(messageText('server.mythicMergeAtSmith', 'Only the Blacksmith can fuse Mythic items.'));
    const items = uids.map(uid => player.bag.find(item => item.uid === uid));
    if (items.some(item => item && item.lk)) return reply(messageText('server.itemLocked', 'Locked items are protected. Unlock them first (Ctrl+click).'));
    if (items.some(item => !item || item.rar !== MYTHIC)) return reply(messageText('server.mythicMergeOnly', 'Pick {count} Mythic items from your bag.', { count: MYTHIC_MERGE_COUNT }));
    if (!canSpend(player.gold, MYTHIC_MERGE_GOLD)) return reply(messageText('server.mythicMergeGold', 'Fusing Mythics costs {gold} gold.', { gold: MYTHIC_MERGE_GOLD }));
    player.gold -= MYTHIC_MERGE_GOLD;
    const itemLevel = Math.max(1, Math.round(items.reduce((sum, item) => sum + (item.ilvl || 1), 0) / items.length));
    const slot = SLOTS[Math.floor(Math.random() * SLOTS.length)];
    const result = genGear(slot, itemLevel, MYTHIC, CLASSES[player.cls].fam); result.plus = Math.max(...items.map(item => item.plus || 0));
    const index = player.bag.indexOf(items[0]); player.bag = player.bag.filter(item => !items.includes(item)); player.bag.splice(Math.min(index, player.bag.length), 0, result);
    fire('merge', player, result, items);
    const smith = npcPosition(mapOf(player), 'smith'); ev('fx', smith.x, smith.y, 70, { s: 'lvl' });
    reply(messageText('server.mythicMergeDone', 'The Blacksmith fused a new Mythic: {item}.', { item: gearText(result.name) }), { ok: 1, uid: result.uid });
    broadcast({ t: 'chat', n: '*', channel: 'loot', m: messageText('server.playerMythicMerged', '{player} fused three Mythics into {item}!', { player: player.name, item: gearText(result.name) }) });
    afterGearChange(player);
  }
  // Soul Mystic: put (or replace) the affix on a weapon, ring or amulet.
  function affixItem(player, uid, key) {
    if (rejectReservedChange(player, [uid])) return;
    const reply = (message, extra) => send(player.c, { t: 'affix', m: message, ...extra });
    if (player.dead) return;
    if (!nearNpc(player, 'mystic')) return reply(messageText('server.affixAtMystic', 'Talk to the Soul Mystic in a village to add affixes.'));
    let item = player.bag.find(i => i.uid === uid) || null; for (const slot of SLOTS) if (!item && player.eq[slot] && player.eq[slot].uid === uid) item = player.eq[slot];
    if (!item || !Object.hasOwn(AFFIXES, key)) return;
    if (!AFFIX_SLOTS[item.slot]) return reply(messageText('server.affixSlots', 'Affixes go on weapons, rings and amulets.'));
    const cost = AFFIX_COST[item.rar] || 2;
    if (!canSpend(player.souls || 0, cost)) return reply(messageText('server.rerollCost', 'The Soul Mystic wants {souls} souls.', { souls: cost }));
    player.souls -= cost; applyAffix(item, key); fire('affix', player, item);
    const mystic = npcPosition(mapOf(player), 'mystic'); ev('fx', mystic.x, mystic.y, 55, { s: 'summon' });
    reply(messageText('server.affixDone', '{item} now carries {affix}.', { item: gearText(item.name), affix: messageText('affix.' + key, AFFIXES[key].n) }), { ok: 1, uid: item.uid });
    afterGearChange(player);
  }

  function equipItem(player, itemId) {
    if (player.dead) return;
    const index = player.bag.findIndex(item => item.uid === itemId);
    if (index < 0) return;
    const item = player.bag[index];
    if (player.lvl < item.req) return say(player, messageText("server.equipLevel", "{item} requires level {level}.", { item: gearText(item.name), level: item.req }));
    const previousItem = player.eq[item.slot];
    if (rejectReservedChange(player, [item.uid, previousItem?.uid].filter(Boolean))) return;
    player.eq[item.slot] = item;
    player.bag.splice(index, 1);
    if (previousItem) player.bag.splice(index, 0, previousItem);
    afterGearChange(player);
  }

  function unequipItem(player, slot) {
    if (!SLOTS.includes(slot) || player.dead) return;
    const item = player.eq[slot];
    if (!item) return;
    if (rejectReservedChange(player, [item.uid])) return;
    if (player.bag.length >= BAGMAX) return say(player, messageText("server.bagFull", "Your bag is full."));
    player.eq[slot] = null;
    player.bag.push(item);
    afterGearChange(player);
  }

  function sellItem(player, itemId) {
    if (rejectReservedChange(player, [itemId])) return;
    if (!nearNpc(player, 'merchant')) return say(player, messageText("server.sellAtMerchant", "Sell items to the Merchant in the village."));
    const index = player.bag.findIndex(item => item.uid === itemId);
    if (index < 0) return;
    if (player.bag[index].lk) return say(player, messageText('server.itemLocked', 'Locked items are protected. Unlock them first (Ctrl+click).'));
    const value = sellValue(player.bag[index]);
    if (!validAmount(value) || value > room(player.gold)) return say(player, messageText('server.storageFull', 'Your currency or consumable storage limit has been reached.'));
    credit(player, 'gold', value);
    player.bag.splice(index, 1);
    ev('gold', player.x, player.y, messageText('server.pickedUpGold', 'You gained: {gold} gold', { gold: value }));
    sendInv(player);
  }

  function sellByRarity(player, rarity) {
    if (!nearNpc(player, 'merchant')) return say(player, messageText("server.sellAtMerchant", "Sell items to the Merchant in the village."));
    const maxRarity = Math.max(0, Math.min(4, rarity | 0));
    let total = 0, soldCount = 0;
    const selected = player.bag.filter(item => item.rar <= maxRarity && !item.lk && !autoAffixBusy(player, item.uid) && !isItemReserved(player, item.uid));
    for (const item of selected) {
      const value = sellValue(item);
      if (!validAmount(value) || value > room(player.gold) - total) return say(player, messageText('server.storageFull', 'Your currency or consumable storage limit has been reached.'));
      total += value; soldCount++;
    }
    const sold = new Set(selected); player.bag = player.bag.filter(item => !sold.has(item));
    credit(player, 'gold', total);
    say(player, soldCount ? messageText("server.sold", "Sold {count} item(s) for {gold} gold.", { count: soldCount, gold: total }) : messageText("server.nothingToSell", "Nothing to sell."));
    sendInv(player);
  }

  function buyItem(player, itemKey, quantity) {
    if (typeof itemKey !== 'string' || !Object.hasOwn(ITEMS, itemKey)) return;
    if (!nearNpc(player, 'merchant')) return say(player, messageText("server.buyAtMerchant", "Visit the Merchant in the village to buy."));
    const item = ITEMS[itemKey], count = Number.isFinite(quantity) ? Math.max(1, Math.min(50, Math.floor(quantity))) : 1;
    if (count > room(player.inv[itemKey] ?? 0, MAX_ITEM_STACK)) return say(player, messageText('server.storageFull', 'Your currency or consumable storage limit has been reached.'));
    const cost = count * item.price;
    if (!canSpend(player.gold, cost)) return say(player, messageText("server.notEnoughGold", "Not enough gold."));
    player.gold -= cost;
    credit(player.inv, itemKey, count, MAX_ITEM_STACK);
    say(player, messageText("server.bought", "Bought {count} x {item}.", { count, item: messageText('item.' + itemKey + '.name', item.n) }));
  }

  function processJobs() { processForgeJobs(); autoAffixJobs.process(); }
  return { handleAutoAffix, isAutoAffixReserved: autoAffixBusy, cancelAutoAffix: autoAffixJobs.stop, cancelActiveAutoAffix: autoAffixJobs.cancelActive, cancelAllAutoAffix: autoAffixJobs.cancelAll, prepareDestroy, destroyItem, processJobs, lockItem, mergeMythics, affixItem, rerollItem, equipItem, unequipItem, sellItem, sellByRarity, buyItem, sendInv, afterGearChange, starterWeapon, addGear, useItem, doMerge, autoMerge, upgradeItem };
}

module.exports = { BAGMAX, BAG_PAGE_SIZE, createInventory };
