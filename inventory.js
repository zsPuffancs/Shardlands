'use strict';

const { localizedText: messageText, gearText, isLocalizedText } = require('./localized-text');

const { NPCS, CX, CY, nearNpc, inVillage, rnd } = require('./game-world');
const { BASES, SLOTS, RARITY, UP_RATE, upCostFor, sellValue } = require('./equipment');
const { CLASSES, ITEMS, SKILLS, newSk, stats, defRed, critCh, critMul, goldFind, playerDmg } = require('./characters');

const BAGMAX = 30;

function createInventory({ send, say, toast, broadcast, ev, fire, genGear }) {
  function sendInv(player) { send(player.c, { t: 'inv', bag: player.bag, eq: player.eq, gs: Object.assign({}, player.g, { _dmg: Math.round(playerDmg(player)), _dr: Math.round(defRed(player) * 100), _hp: player.maxhp, _mp: player.maxmp, _crit: Math.round(critCh(player) * 100), _cdmg: Math.round(critMul(player) * 100), _ls: Math.round(0.8 * player.sk.lifesteal * 10) / 10, _haste: Math.round(3.5 * player.sk.haste), _gf: Math.round(goldFind(player)) }) }); }
  function afterGearChange(player) { const previousMaxHealth = player.maxhp; stats(player); if (player.maxhp > previousMaxHealth) player.hp += player.maxhp - previousMaxHealth; player.hp = Math.min(player.hp, player.maxhp); player.mp = Math.min(player.mp, player.maxmp); sendInv(player); }
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
      ev('heal', player.x, player.y, '+' + healAmount, { combatPlayerId: player.id, restoredHealth: Math.round(player.hp - previousHealth) });
    }
    else if (itemKey === 'mp') { const h = Math.floor(player.maxmp * 0.5); player.mp = Math.min(player.maxmp, player.mp + h); ev('mana', player.x, player.y, '+' + h); }
    else if (itemKey === 'atk' || itemKey === 'def' || itemKey === 'spd') { player.buf[itemKey] = now + 60000; ev('fx', player.x, player.y, 50, { s: 'buff', a: player.id }); }
    else if (itemKey === 'xp') { player.buf.xp = now + 300000; ev('fx', player.x, player.y, 50, { s: 'buff', a: player.id }); }
    else if (itemKey === 'ret') { ev('fx', player.x, player.y, 60, { s: 'buff', a: player.id }); player.x = CX + rnd(-50, 50); player.y = CY + rnd(30, 95); player.dest = null; player.target = 0; player.chasingTarget = false; ev('fx', player.x, player.y, 60, { s: 'buff', a: player.id }); }
    else if (itemKey === 'reset') { player.sk = newSk(); player.sp = player.lvl; stats(player); player.hp = Math.min(player.hp, player.maxhp); say(player, messageText("server.skillRefund", "Skill points refunded: {count} available.", { count: player.sp })); sendInv(player); }
    if (!isPotion && itemKey !== 'ret' && itemKey !== 'reset') say(player, messageText("server.itemUsed", "{item} used.", { item: messageText('item.' + itemKey + '.name', item.n) }));
  }

  function mergeItems(player, items) {
    const rarity = items[0].rar, first = items[0], itemLevel = Math.max(1, Math.round(player.lvl * rnd(0.8, 1.2)));
    const result = genGear(first.slot, itemLevel, Math.min(4, rarity + 1), first.fam); result.plus = Math.max(...items.map(i => i.plus || 0));
    const firstItemIndex = player.bag.indexOf(first); player.bag = player.bag.filter(i => !items.includes(i)); player.bag.splice(Math.min(firstItemIndex, player.bag.length), 0, result);
    fire('merge', player, result, items); return result;
  }
  function doMerge(player, uids) {
    if (player.dead || !Array.isArray(uids) || uids.length !== 3 || new Set(uids).size !== 3) return;
    const items = uids.map(u => player.bag.find(i => i.uid === u)); if (items.some(i => !i)) return;
    if (items.some(i => i.rar !== items[0].rar)) return say(player, messageText("server.mergeRarity", "Pick 3 items of the same rarity (colour) to merge."));
    const result = mergeItems(player, items); ev('fx', player.x, player.y, 60, { s: 'lvl', a: player.id }); ev('loot', player.x, player.y, messageText("server.mergeResult", "Merged: {item}", { item: gearText(result.name) }), { r: result.rar });
    toast(player, messageText("server.mergeDetail", "Merged → {rarity} {item} (iLvl {level})", { rarity: messageText('rarity.' + result.rar, RARITY[result.rar].n), item: gearText(result.name), level: result.ilvl }), ['#d8d8d8', '#4ee26a', '#4da3ff', '#b25cff', '#ff9d2e'][result.rar]);
    if (result.rar >= 3) broadcast({ t: 'chat', n: '*', m: messageText("server.playerMerged", "{player} merged a {rarity} {item}!", { player: player.name, rarity: messageText('rarity.' + result.rar, RARITY[result.rar].n), item: gearText(result.name) }) });
    sendInv(player);
  }
  function autoMerge(player, maxRarity) {
    if (player.dead) return; maxRarity = Math.max(0, Math.min(3, maxRarity | 0)); let n = 0, best = null;
    for (let r = 0; r <= maxRarity; r++) for (;;) {
      const g = player.bag.filter(i => i.rar === r).sort((a, b) => a.ilvl - b.ilvl); if (g.length < 3) break;
      const result = mergeItems(player, g.slice(0, 3)); n++; if (!best || result.rar > best.rar) best = result;
    }
    if (!n) return say(player, messageText("server.nothingToMerge", "Nothing to merge: you need 3 bag items of the same rarity."));
    ev('fx', player.x, player.y, 60, { s: 'lvl', a: player.id }); ev('loot', player.x, player.y, messageText("server.mergeCount", "Merges: {count}!", { count: n }), { r: best.rar });
    say(player, messageText("server.bestMerge", "Merged {used} items into {count}. Best result: {rarity} {item}.", { used: n * 3, count: n, rarity: messageText('rarity.' + best.rar, RARITY[best.rar].n), item: gearText(best.name) })); toast(player, messageText("server.mergeDone", "Completed merges: {count}", { count: n }), '#ffe97a'); sendInv(player);
  }
  function upgradeItem(player, uid) {
    if (!nearNpc(player, 'smith')) return say(player, messageText("server.upgradeAtSmith", "Talk to the Blacksmith in the village to upgrade equipment."));
    let item = null; for (const slot of SLOTS) if (player.eq[slot] && player.eq[slot].uid === uid) item = player.eq[slot];
    if (!item) return say(player, messageText("server.upgradeWorn", "The Blacksmith only upgrades equipment you are wearing.")); if (item.plus >= 9) return say(player, messageText("server.upgradeMax", "{item} is already +9.", { item: gearText(item.name) }));
    const cost = upCostFor(item); if (player.gold < cost) return say(player, messageText("server.upgradeCost", "The Blacksmith wants {gold} gold.", { gold: cost }));
    player.gold -= cost; const smith = NPCS.smith;
    if (Math.random() < UP_RATE[item.plus]) { item.plus++; send(player.c, { t: 'forge', ok: 1, uid, plus: item.plus }); ev('fx', smith.x, smith.y, 50, { s: 'lvl' }); if (item.plus >= 7) broadcast({ t: 'chat', n: '*', m: messageText("server.playerForged", "{player} forged a +{level} {item}!", { player: player.name, level: item.plus, item: gearText(item.name) }) }); }
    else { const drop = item.plus >= 5; if (drop) item.plus--; send(player.c, { t: 'forge', ok: 0, uid, plus: item.plus, drop }); ev('fx', smith.x, smith.y, 40, { s: 'rage' }); }
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
    ev('gold', player.x, player.y, '+' + value + 'g');
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

  return { equipItem, unequipItem, sellItem, sellByRarity, buyItem, sendInv, afterGearChange, starterWeapon, addGear, useItem, doMerge, autoMerge, upgradeItem };
}

module.exports = { BAGMAX, createInventory };
