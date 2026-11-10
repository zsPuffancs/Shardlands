'use strict';

const { localizedText: messageText, gearText } = require('./localized-text');

const { clampWorld, rnd, rint, pick } = require('./game-world');
const { MOBTYPES } = require('./monsters');
const { SLOTS, RARITY } = require('./equipment');
const { ITEMS, CLASSES, goldFind } = require('./characters');

function createLoot({ loot, players, allocateId, rates, ev, say, toast, broadcast, addGear, genGear, rollRarity }) {
  function dropAt(x, y, details, owner) {
    const drop = Object.assign({ id: allocateId(), x: Math.round(x), y: Math.round(y), owner: owner || 0, free: Date.now() + (owner ? 25000 : 0), exp: Date.now() + 180000 }, details);
    clampWorld(drop); loot.set(drop.id, drop); return drop;
  }
  function dropLoot(player, monster) {
    const template = MOBTYPES[monster.ty], boss = !!template.boss, stone = !!template.stone, alpha = !!monster.alpha;
    const gold = Math.round(rint(template.gold[0], template.gold[1]) * monster.gm * rates.goldRate * (stone ? 1.5 : 1) * (1 + goldFind(player) / 100));
    if (gold > 0) dropAt(monster.x + rnd(-25, 25), monster.y + rnd(-25, 25), { kind: 'gold', v: gold, name: gold + ' gold' }, player.id);
    const consumableCount = stone ? 4 : boss ? 4 : alpha ? 2 : (Math.random() < Math.min(1, 0.16 * rates.potionDropRate) ? 1 : 0);
    for (let i = 0; i < consumableCount; i++) {
      const pool = Object.keys(ITEMS).filter(k => ITEMS[k].w > 0 && (k !== 'hp2' || monster.tier >= 1));
      let r = Math.random() * pool.reduce((s, k) => s + ITEMS[k].w, 0), pk = pool[0]; for (const k of pool) { r -= ITEMS[k].w; if (r <= 0) { pk = k; break; } }
      dropAt(monster.x + rnd(-45, 45), monster.y + rnd(-45, 45), { kind: 'item', k: pk, n: 1, name: ITEMS[pk].n }, player.id);
    }
    const gearChance = (0.14 + 0.02 * Math.min(monster.tier, 6)) * rates.gearDropRate;
    let gearCount = stone ? 4 + Math.floor(monster.tier / 2) : boss ? 5 : alpha ? 2 : 0; if (!stone && !boss && !alpha) { gearCount = Math.floor(gearChance); if (Math.random() < gearChance - gearCount) gearCount++; }
    for (let i = 0; i < gearCount; i++) {
      const ilvl = Math.max(1, monster.lvl + rint(-1, 2) + (boss ? 3 : 0) + (stone || alpha ? 1 : 0)), minR = stone || boss ? 2 : alpha ? 1 : 0;
      const item = genGear(pick(SLOTS), ilvl, rollRarity((boss ? 3 : stone ? 2.2 : alpha ? 1.2 : 0) + monster.tier * 0.15, minR), CLASSES[player.cls].fam);
      dropAt(monster.x + rnd(-50, 50), monster.y + rnd(-50, 50), { kind: 'gear', item: item, name: item.name, rar: item.rar }, player.id);
      if (item.rar >= 3) broadcast({ t: 'chat', n: '*', m: messageText("server.playerLoot", "{player} found {rarity} {item}!", { player: player.name, rarity: messageText('rarity.' + item.rar, RARITY[item.rar].n), item: gearText(item.name) }) });
    }
  }
  function pickupTick(now) {
    for (const drop of loot.values()) {
      if (now > drop.exp) { loot.delete(drop.id); continue; }
      if (drop.owner && now < drop.free && !players.has(drop.owner)) drop.free = 0;
      for (const player of players.values()) {
        if (player.dead || (drop.owner && now < drop.free && drop.owner !== player.id) || Math.abs(player.x - drop.x) > 58 || Math.abs(player.y - drop.y) > 58 || Math.hypot(player.x - drop.x, player.y - drop.y) > 58) continue;
        if (drop.kind === 'gold') { player.gold += drop.v; ev('gold', drop.x, drop.y, '+' + drop.v + 'g'); }
        else if (drop.kind === 'item') { player.inv[drop.k] = (player.inv[drop.k] || 0) + drop.n; ev('loot', drop.x, drop.y, messageText('server.pickedUp', '+{item}', { item: messageText('item.' + drop.k + '.name', drop.name) }), { r: 0 }); }
        else if (drop.kind === 'gear') {
          if (!addGear(player, drop.item)) { if (now > (player.fullT || 0)) { player.fullT = now + 3000; say(player, messageText("server.lootBagFull", "Your bag is full! Merge, sell or equip something.")); toast(player, messageText("server.bagFullShort", "Bag full!"), '#ff8a6a'); } continue; }
          ev('loot', drop.x, drop.y, messageText('server.pickedUp', '+{item}', { item: gearText(drop.name) }), { r: drop.rar }); if (drop.rar >= 3) toast(player, messageText("server.rareLoot", "{rarity}: {item}", { rarity: messageText('rarity.' + drop.rar, RARITY[drop.rar].n), item: gearText(drop.name) }), ['', '', '', '#b25cff', '#ff9d2e'][drop.rar]);
        }
        loot.delete(drop.id); break;
      }
    }
  }

  return { dropAt, dropLoot, pickupTick };
}

module.exports = { createLoot };
