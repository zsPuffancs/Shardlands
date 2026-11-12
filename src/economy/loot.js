'use strict';

const { MAX_CURRENCY, MAX_ITEM_STACK, MAX_GEAR_DROPS, positiveAmount, credit } = require('../shared/safety-limits');
const { nearby } = require('../shared/spatial-index');
const { localizedText: messageText, gearText } = require('../shared/localized-text');

const { clampWorld, rnd, rint, pick } = require('../world/game-world');
const { MOBTYPES, TIERS } = require('../combat/monsters');
const { monsterGoldRewards, GOLD_BALANCE, FRONTIER_MODEL } = require('./gold-rewards');
const { STONE_REWARDS, takeLootPermit } = require('./stone-rewards');
const { SLOTS, RARITY } = require('./equipment');
const { ITEMS, CLASSES, goldFind } = require('../player/characters');

function createLoot({ loot, players, allocateId, rates, ev, say, toast, broadcast, addGear, genGear, rollRarity, gearRecipient = player => player, onPickup = () => {} }) {
  function dropAt(x, y, details, owner) {
    const drop = Object.assign({ id: allocateId(), x: Math.round(x), y: Math.round(y), owner: owner || 0, free: Date.now() + (owner ? 25000 : 0), exp: Date.now() + 180000 }, details);
    clampWorld(drop); loot.set(drop.id, drop); return drop;
  }
  // sharers: team members who split the gold (the killer first). Everything else goes to the killer.
  function dropLoot(player, monster, sharers) {
    const actualTemplate = MOBTYPES[monster.ty], reward = takeLootPermit(monster, actualTemplate);
    if (!reward.gold && !reward.loot) return;
    const guardian = !!monster.summoned;
    const dropMonster = (x, y, details, owner) => dropAt(x, y, { ...details, source: MOBTYPES[monster.ty]?.archetype || monster.ty }, owner);
    sharers = sharers && sharers.length ? sharers : [player];
    sharers = [...new Map(sharers.map(hero => [hero.id, hero])).values()];
    const template = guardian ? { ...actualTemplate, stone: false, boss: false, worldBoss: false } : actualTemplate;
    const boss = !!template.boss, stone = !!template.stone, alpha = !!monster.alpha && !guardian, worldBoss = !!template.worldBoss;
    const generated = !!TIERS[monster.tier]?.generated;
    const frontierGold = monster.goldModel === FRONTIER_MODEL || !monster.goldModel && generated;
    // Alpha guardians receive 50% of NORMAL gold, not 50% of an already multiplied Alpha budget.
    const goldMonster = guardian ? { ...monster, alpha: 0, gm: monster.alpha && !frontierGold ? monster.gm / GOLD_BALANCE.legacyAlphaMultiplier : monster.gm } : monster;
    const goldRewards = monsterGoldRewards({ monster: goldMonster, template, generated, rate: rates.goldRate ?? 0, rewardScale: reward.gold, roll: Math.random(), bonuses: sharers.map(goldFind) });
    for (let index = 0; index < sharers.length; index++) {
      const hero = sharers[index], gold = goldRewards[index];
      if (gold <= 0) continue;
      // The killer's part drops on the ground as before; team members get theirs straight away.
      if (hero === player) dropMonster(monster.x + rnd(-25, 25), monster.y + rnd(-25, 25), { kind: 'gold', v: gold, name: gold + ' gold' }, player.id);
      else { const added = credit(hero, 'gold', gold); if (added) { onPickup(hero, { source: MOBTYPES[monster.ty]?.archetype || monster.ty, kind: 'gold' }, added); ev('gold', hero.x, hero.y, messageText('server.teamGold', 'Team share: {gold} gold', { gold: added }), { pickupBy: hero.id }); } if (added < gold) dropMonster(hero.x, hero.y, { kind: 'gold', v: gold - added, name: (gold - added) + ' gold' }, hero.id); }
    }
    // souls: the Soul Mystic's currency, only from stones, Alphas and bosses
    if (guardian) {
      if (reward.soulChance && Math.random() < reward.soulChance) dropMonster(monster.x + rnd(-30, 30), monster.y + rnd(-30, 30), { kind: 'souls', v: reward.souls, name: reward.souls + (reward.souls === 1 ? ' soul' : ' souls') }, player.id);
    } else if (stone || boss || alpha) { const souls = worldBoss ? rint(5, 10) : stone ? rint(...STONE_REWARDS.completion.souls) : rint(1, 5); dropMonster(monster.x + rnd(-30, 30), monster.y + rnd(-30, 30), { kind: 'souls', v: souls, name: souls + (souls === 1 ? ' soul' : ' souls') }, player.id); }
    const consumableCount = stone ? 4 : boss ? 4 : alpha ? 2 : (Math.random() < Math.min(1, 0.16 * rates.potionDropRate * reward.loot) ? 1 : 0);
    for (let i = 0; i < consumableCount; i++) {
      const pool = Object.keys(ITEMS).filter(k => ITEMS[k].w > 0 && (k !== 'hp2' || monster.tier >= 1));
      let r = Math.random() * pool.reduce((s, k) => s + ITEMS[k].w, 0), pk = pool[0]; for (const k of pool) { r -= ITEMS[k].w; if (r <= 0) { pk = k; break; } }
      dropMonster(monster.x + rnd(-45, 45), monster.y + rnd(-45, 45), { kind: 'item', k: pk, n: 1, name: ITEMS[pk].n }, player.id);
    }
    const gearChance = (0.14 + 0.02 * Math.min(monster.tier, 6)) * rates.gearDropRate * reward.loot;
    // World Bosses are milestones: more gear, at least Epic, a little above their level.
    let gearCount = stone ? 4 + STONE_REWARDS.completion.extraGear + Math.floor(monster.tier / 2) : worldBoss ? 7 : boss ? 5 : alpha ? 2 : 0; if (!stone && !boss && !alpha) { gearCount = Math.floor(gearChance); if (Math.random() < gearChance - gearCount) gearCount++; }
    gearCount = Math.min(reward.maxGear ?? MAX_GEAR_DROPS, positiveAmount(gearCount));
    for (let i = 0; i < gearCount; i++) {
      const ilvl = Math.max(1, monster.lvl + rint(-1, 2) + (worldBoss ? 5 : boss ? 3 : 0) + (stone || alpha ? 1 : 0)), minR = worldBoss ? 3 : stone ? STONE_REWARDS.completion.minimumRarity : boss ? 2 : alpha ? 1 : 0;
      const recipient = gearRecipient(player, monster);
      const item = genGear(pick(SLOTS), ilvl, rollRarity((boss ? 3 : stone ? 2.2 : alpha ? 1.2 : 0) + monster.tier * 0.15, minR), CLASSES[recipient.cls].fam);
      dropMonster(monster.x + rnd(-50, 50), monster.y + rnd(-50, 50), { kind: 'gear', item: item, name: item.name, rar: item.rar }, recipient.id);
      if (item.rar >= 3) broadcast({ t: 'chat', n: '*', channel: 'loot', m: messageText("server.playerLoot", "{player} found {rarity} {item}!", { player: recipient.name, rarity: messageText('rarity.' + item.rar, RARITY[item.rar].n), item: gearText(item.name) }) });
    }
  }
  let cleanupAt = 0;
  function pickupTick(now) {
    if (now >= cleanupAt) {
      cleanupAt = now + 500;
      for (const drop of loot.values()) if (now > drop.exp) loot.delete(drop.id);
    }
    let candidates = loot.values();
    if (loot.spatial) {
      const found = new Set();
      for (const player of players.values()) if (!player.dead) for (const drop of nearby(loot, player, 58)) found.add(drop);
      candidates = [...found].sort((a, b) => loot.spatial.members.get(a).order - loot.spatial.members.get(b).order);
    }
    for (const drop of candidates) {
      if (now > drop.exp) { loot.delete(drop.id); continue; }
      if (drop.owner && now < drop.free && !players.has(drop.owner)) drop.free = 0;
      for (const player of nearby(players, drop, 58)) {
        if (player.dead || (drop.owner && now < drop.free && drop.owner !== player.id) || Math.abs(player.x - drop.x) > 58 || Math.abs(player.y - drop.y) > 58 || Math.hypot(player.x - drop.x, player.y - drop.y) > 58) continue;
        if (drop.kind === 'gold' || drop.kind === 'souls' || drop.kind === 'item') {
          const item = drop.kind === 'item', field = item ? 'n' : 'v', amount = positiveAmount(drop[field]);
          if (!amount) { loot.delete(drop.id); break; }
          const added = credit(item ? player.inv : player, item ? drop.k : drop.kind, amount, item ? MAX_ITEM_STACK : MAX_CURRENCY);
          if (!added) {
            if (now >= (player.limitNoticeAt || 0)) { player.limitNoticeAt = now + 3000; say(player, messageText('server.storageFull', 'Your currency or consumable storage limit has been reached.')); }
            continue;
          }
          drop[field] = amount - added;
          onPickup(player, drop, added);
          if (drop.kind === 'gold') ev('gold', drop.x, drop.y, messageText('server.pickedUpGold', 'You gained: {gold} gold', { gold: added }), { pickupBy: player.id });
          else if (drop.kind === 'souls') ev('souls', drop.x, drop.y, messageText('server.pickedUpSouls', 'You gained: {souls} souls', { souls: added }), { pickupBy: player.id });
          else ev('loot', drop.x, drop.y, messageText('server.pickedUp', 'You picked up: {item}', { item: messageText('item.' + drop.k + '.name', drop.name) }), { r: 0, pickupBy: player.id });
          if (!drop[field]) loot.delete(drop.id);
          break;
        }
        else if (drop.kind === 'gear') {
          if (!addGear(player, drop.item)) { if (now > (player.fullT || 0)) { player.fullT = now + 3000; say(player, messageText("server.lootBagFull", "Your bag is full! Merge, sell or equip something.")); toast(player, messageText("server.bagFullShort", "Bag full!"), '#ff8a6a'); } continue; }
          onPickup(player, drop, 1);
          ev('loot', drop.x, drop.y, messageText('server.pickedUp', 'You picked up: {item}', { item: gearText(drop.name) }), { r: drop.rar, pickupBy: player.id }); if (drop.rar >= 3) toast(player, messageText("server.rareLoot", "{rarity}: {item}", { rarity: messageText('rarity.' + drop.rar, RARITY[drop.rar].n), item: gearText(drop.name) }), ['', '', '', '#b25cff', '#ff9d2e', '#ff4560'][drop.rar]);
        }
        loot.delete(drop.id); break;
      }
    }
  }

  return { dropAt, dropLoot, pickupTick };
}

module.exports = { createLoot };
