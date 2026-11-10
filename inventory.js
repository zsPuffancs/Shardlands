'use strict';

const { localizedText: messageText, gearText, isLocalizedText } = require('./localized-text');

const { NPCS, CX, CY, nearNpc, inVillage, rnd, placeInVillage, npcPosition, mapOf } = require('./game-world');
const { BASES, SLOTS, RARITY, MYTHIC, MERGE_COST, REROLL_COST, UP_RATE, upCostFor, sellValue } = require('./equipment');
const RARITY_COLOR = ['#d8d8d8', '#4ee26a', '#4da3ff', '#b25cff', '#ff9d2e', '#ff4560'];
const { CLASSES, ITEMS, SKILLS, newSk, stats, defRed, critCh, critMul, goldFind, playerDmg, rank } = require('./characters');

const BAG_PAGE_SIZE = 30;
const BAGMAX = BAG_PAGE_SIZE * 3;

function createInventory({ send, say, toast, broadcast, ev, fire, genGear, rerollGear }) {
  function sendInv(player) { send(player.c, { t: 'inv', bag: player.bag, eq: player.eq, skb: player.skb || {}, souls: player.souls || 0, gs: Object.assign({}, player.g, { _dmg: Math.round(playerDmg(player)), _dr: Math.round(defRed(player) * 100), _hp: player.maxhp, _mp: player.maxmp, _crit: Math.round(critCh(player) * 100), _cdmg: Math.round(critMul(player) * 100), _ls: Math.round(0.8 * rank(player, 'lifesteal') * 10) / 10, _haste: Math.round(3.5 * rank(player, 'haste')), _gf: Math.round(goldFind(player)) }) }); }
  function afterGearChange(player) {
    stats(player);
    player.hp = Math.min(player.hp, player.maxhp);
    player.mp = Math.min(player.mp, player.maxmp);
    sendInv(player);
  }
  function starterWeapon(player, plus) { const item = genGear('weapon', 1, 0, CLASSES[player.cls].fam); item.name = 'Worn ' + BASES.weapon[item.fam]; item.plus = plus || 0; return item; }
  function addGear(player, item) { if (player.bag.length >= BAGMAX) return false; player.bag.push(item); sendInv(player); return true; }

  function useItem(player, itemKey) {
    if (!Object.hasOwn(ITEMS, itemKey)) return;
    const item = ITEMS[itemKey], now = Date.now();
    if (!item || player.dead || !(player.inv[itemKey] > 0)) return;
    const isPotion = itemKey === 'hp' || itemKey === 'hp2' || itemKey === 'mp';
    if (typeof item.use === 'function') { let r; try { r = item.use(player); } catch (e) { return say(player, messageText("server.itemError", "Item error: {error}", { error: e.message })); } if (r === false) return; player.inv[itemKey]--; if (typeof r === 'string' || isLocalizedText(r)) say(player, r); return; }
    if (isPotion) { if (now < player.potCd) return; if (itemKey === 'mp' ? player.mp >= player.maxmp : player.hp >= player.maxhp) return; }
    if (itemKey === 'ret' && inVillage(player)) return say(player, messageText("server.inVillage", "You are already in the village."));
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
    else if (itemKey === 'atk' || itemKey === 'def' || itemKey === 'spd') { player.buf[itemKey] = now + 60000; ev('fx', player.x, player.y, 50, { s: 'buff', a: player.id }); }
    else if (itemKey === 'xp') { player.buf.xp = now + 300000; ev('fx', player.x, player.y, 50, { s: 'buff', a: player.id }); }
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
    const items = uids.map(u => player.bag.find(i => i.uid === u)); if (items.some(i => !i)) return;
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
      const need = MERGE_COST[r], g = player.bag.filter(i => i.rar === r).sort((a, b) => a.ilvl - b.ilvl); if (g.length < need) break;
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
    const rejectUpgrade = message => send(player.c, { t: 'forge', uid, m: message });
    if (!nearNpc(player, 'smith')) return rejectUpgrade(messageText('server.upgradeAtSmith', 'Talk to the Blacksmith in the village to upgrade equipment.'));
    const item = SLOTS.map(slot => player.eq[slot]).find(gear => gear?.uid === uid);
    if (!item) return rejectUpgrade(messageText('server.upgradeWorn', 'The Blacksmith only upgrades equipment you are wearing.'));
    if (item.plus >= 9) return rejectUpgrade(messageText('server.upgradeMax', '{item} is already +9.', { item: gearText(item.name) }));
    let cost = upCostFor(item);
    if (player.gold < cost) return rejectUpgrade(messageText('server.upgradeCost', 'The Blacksmith wants {gold} gold.', { gold: cost }));

    const smith = npcPosition(mapOf(player), 'smith');
    if (!automatic) {
      const { success, drop } = tryUpgrade(player, item, cost);
      send(player.c, { t: 'forge', ok: success ? 1 : 0, uid, plus: item.plus, ...(success ? {} : { drop }) });
      ev('fx', smith.x, smith.y, success ? 50 : 40, { s: success ? 'lvl' : 'rage' });
      if (success) announceUpgrade(player, item);
    } else {
      const initialLevel = item.plus;
      let attempts = 0, spent = 0;
      while (item.plus < 9 && cost > 0 && Number.isFinite(cost) && player.gold >= cost) {
        tryUpgrade(player, item, cost);
        attempts++;
        spent += cost;
        cost = upCostFor(item);
      }
      const improved = item.plus > initialLevel;
      send(player.c, { t: 'forge', automatic: true, ok: improved ? 1 : 0, uid, plus: item.plus, attempts, spent });
      ev('fx', smith.x, smith.y, improved ? 50 : 40, { s: improved ? 'lvl' : 'rage' });
      if (improved) announceUpgrade(player, item);
    }
    afterGearChange(player);
  }

  function rerollItem(player, uid) {
    if (!nearNpc(player, 'mystic')) return say(player, messageText("server.rerollAtMystic", "Talk to the Soul Mystic in the village to reroll equipment."));
    let item = player.bag.find(i => i.uid === uid) || null; for (const slot of SLOTS) if (!item && player.eq[slot] && player.eq[slot].uid === uid) item = player.eq[slot];
    if (!item) return;
    const cost = REROLL_COST[item.rar] || 1;
    if ((player.souls || 0) < cost) return say(player, messageText("server.rerollCost", "The Soul Mystic wants {souls} souls.", { souls: cost }));
    player.souls -= cost; rerollGear(item); fire('reroll', player, item);
    const mystic = npcPosition(mapOf(player), 'mystic'); ev('fx', mystic.x, mystic.y, 55, { s: 'summon' }); send(player.c, { t: 'reroll', uid: item.uid });
    if (item.rar >= 4) broadcast({ t: 'chat', n: '*', channel: 'loot', m: messageText("server.playerRerolled", "{player} rerolled {rarity} {item}.", { player: player.name, rarity: messageText('rarity.' + item.rar, RARITY[item.rar].n), item: gearText(item.name) }) });
    afterGearChange(player);
  }

  function equipItem(player, itemId) {
    if (player.dead) return;
    const index = player.bag.findIndex(item => item.uid === itemId);
    if (index < 0) return;
    const item = player.bag[index];
    if (player.lvl < item.req) return say(player, messageText("server.equipLevel", "{item} requires level {level}.", { item: gearText(item.name), level: item.req }));
    const previousItem = player.eq[item.slot];
    player.eq[item.slot] = item;
    player.bag.splice(index, 1);
    if (previousItem) player.bag.splice(index, 0, previousItem);
    afterGearChange(player);
  }

  function unequipItem(player, slot) {
    if (!SLOTS.includes(slot) || player.dead) return;
    const item = player.eq[slot];
    if (!item) return;
    if (player.bag.length >= BAGMAX) return say(player, messageText("server.bagFull", "Your bag is full."));
    player.eq[slot] = null;
    player.bag.push(item);
    afterGearChange(player);
  }

  function sellItem(player, itemId) {
    if (!nearNpc(player, 'merchant')) return say(player, messageText("server.sellAtMerchant", "Sell items to the Merchant in the village."));
    const index = player.bag.findIndex(item => item.uid === itemId);
    if (index < 0) return;
    const value = sellValue(player.bag[index]);
    player.gold += value;
    player.bag.splice(index, 1);
    ev('gold', player.x, player.y, messageText('server.pickedUpGold', 'You gained: {gold} gold', { gold: value }));
    sendInv(player);
  }

  function sellByRarity(player, rarity) {
    if (!nearNpc(player, 'merchant')) return say(player, messageText("server.sellAtMerchant", "Sell items to the Merchant in the village."));
    const maxRarity = Math.max(0, Math.min(4, rarity | 0));
    let total = 0, soldCount = 0;
    player.bag = player.bag.filter(item => {
      if (!(item.rar <= maxRarity)) return true;
      total += sellValue(item);
      soldCount++;
      return false;
    });
    player.gold += total;
    say(player, soldCount ? messageText("server.sold", "Sold {count} item(s) for {gold} gold.", { count: soldCount, gold: total }) : messageText("server.nothingToSell", "Nothing to sell."));
    sendInv(player);
  }

  function buyItem(player, itemKey, quantity) {
    if (typeof itemKey !== 'string' || !Object.hasOwn(ITEMS, itemKey)) return;
    if (!nearNpc(player, 'merchant')) return say(player, messageText("server.buyAtMerchant", "Visit the Merchant in the village to buy."));
    const item = ITEMS[itemKey], count = Math.max(1, Math.min(50, quantity | 0));
    const cost = count * item.price;
    if (player.gold < cost) return say(player, messageText("server.notEnoughGold", "Not enough gold."));
    player.gold -= cost;
    player.inv[itemKey] = (player.inv[itemKey] || 0) + count;
    say(player, messageText("server.bought", "Bought {count} x {item}.", { count, item: messageText('item.' + itemKey + '.name', item.n) }));
  }

  return { rerollItem, equipItem, unequipItem, sellItem, sellByRarity, buyItem, sendInv, afterGearChange, starterWeapon, addGear, useItem, doMerge, autoMerge, upgradeItem };
}

module.exports = { BAGMAX, BAG_PAGE_SIZE, createInventory };
