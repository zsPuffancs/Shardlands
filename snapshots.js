'use strict';

const { CLASSES, xpNeed, playerDmg } = require('./characters');
const { inVillage, mapOf, worldInfo } = require('./game-world');

const SNAPSHOT_RADIUS = 1150;
const SNAPSHOT_MOB_LIMIT = 420;

function indexLivingMobs(mobs) {
  const cells = new Map();
  for (const mob of mobs.values()) {
    if (mob.dead) continue;
    const key = Math.floor(mob.x / SNAPSHOT_RADIUS) + ',' + Math.floor(mob.y / SNAPSHOT_RADIUS);
    let cell = cells.get(key);
    if (!cell) cells.set(key, cell = []);
    cell.push(mob);
  }
  return cells;
}

function snapshotMobs(mobs, player, cells) {
  const nearby = [];
  const collect = candidates => {
    for (const mob of candidates) {
      if (!mob.dead && Math.abs(mob.x - player.x) < SNAPSHOT_RADIUS && Math.abs(mob.y - player.y) < SNAPSHOT_RADIUS) nearby.push(mob);
    }
  };
  if (cells) {
    const cx = Math.floor(player.x / SNAPSHOT_RADIUS), cy = Math.floor(player.y / SNAPSHOT_RADIUS);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = cells.get((cx + dx) + ',' + (cy + dy));
        if (cell) collect(cell);
      }
    }
  } else collect(mobs.values());

  if (nearby.length > SNAPSHOT_MOB_LIMIT) {
    const distance = mob => Math.abs(mob.x - player.x) + Math.abs(mob.y - player.y);
    nearby.sort((a, b) => distance(a) - distance(b) || a.id - b.id);
    nearby.length = SNAPSHOT_MOB_LIMIT;
  } else if (cells) nearby.sort((a, b) => a.id - b.id);
  return nearby;
}
// Wire fields: mo is a full list, md contains changed rows, and mi carries the new ID order.
function mobSnapshot(connection, nearby, typeIndex, originX = 0, originY = 0) {
  const rows = nearby.map(mob => [mob.id, typeIndex[mob.ty], Math.round(mob.x - originX), Math.round(mob.y - originY), Math.max(0, Math.round(mob.hp)), mob.mh, mob.lvl, mob.alpha]);
  if (!connection.mobDeltas) return { mo: rows };

  const previous = connection.mobRows;
  const ids = rows.map(row => row[0]);
  connection.mobRows = new Map(rows.map(row => [row[0], row]));
  const previousIds = connection.mobIds;
  connection.mobIds = ids;
  if (!previous) return { mo: rows };

  const changed = rows.filter(row => {
    const previousRow = previous.get(row[0]);
    return !previousRow || row.some((value, i) => value !== previousRow[i]);
  });
  const orderChanged = ids.length !== previousIds.length || ids.some((id, i) => id !== previousIds[i]);
  if (changed.length === rows.length && orderChanged) return { mo: rows };
  const delta = {};
  if (changed.length) delta.md = changed;
  if (orderChanged) delta.mi = ids;
  return delta;
}

function createMobTypeIndex(mobTypes) {
  let types = [], indices = {};
  return function refreshMobTypes() {
    const keys = Object.keys(mobTypes);
    if (keys.length !== types.length) {
      types = keys;
      indices = Object.fromEntries(types.map((type, index) => [type, index]));
    }
    return { types, indices };
  };
}

function activeBuffs(player, now) {
  const buffs = {};
  for (const key in player.buf) if (player.buf[key] > now) buffs[key] = player.buf[key] - now;
  return buffs;
}

// These field names are the client protocol. Use descriptive names in the server implementation.
function ownPlayerSnapshot(player, now, map) {
  return {
    x: player.x - map.x0, y: player.y - map.y0, hp: Math.round(player.hp), mh: player.maxhp,
    mp: Math.round(player.mp), mm: player.maxmp, l: player.lvl,
    xp: player.xp, xn: xpNeed(player.lvl), g: player.gold, so: player.souls || 0, w: player.w,
    inv: player.inv, sk: player.sk, sp: player.sp, buf: activeBuffs(player, now),
    c1: Math.max(0, player.cd1 - now), c2: Math.max(0, player.cd2 - now), c3: Math.max(0, player.cd3 - now),
    dmg: Math.round(playerDmg(player)), tg: player.target, dead: player.dead ? player.dead - now : 0, vil: inVillage(player) ? 1 : 0,
    bag: player.bag.length, spd: Math.round(player.spdNow || 190), rng: CLASSES[player.cls].range,
  };
}

function otherPlayerSnapshot(player, now, map) {
  return {
    id: player.id, n: player.name, x: Math.round(player.x - map.x0), y: Math.round(player.y - map.y0),
    hp: Math.round(player.hp), mh: player.maxhp, l: player.lvl, c: player.cls,
    w: player.w, d: player.dead ? 1 : 0, rg: now < player.buf.rage ? 1 : 0,
  };
}

function lootSnapshot(drop, map) {
  return {
    id: drop.id, x: drop.x - map.x0, y: drop.y - map.y0, k: drop.kind, n: drop.name, r: drop.rar || 0, i: drop.k,
    s: drop.item ? (drop.item.slot === 'weapon' ? drop.item.fam : drop.item.slot) : undefined,
  };
}

// Events are created in world coordinates. Every position field is shifted to the receiver's map.
function localEvent(event, map) {
  if (!map.x0 && !map.y0) return event;
  const local = { ...event, x: event.x - map.x0, y: event.y - map.y0 };
  if (typeof local.tx === 'number') local.tx -= map.x0;
  if (typeof local.ty === 'number') local.ty -= map.y0;
  if (typeof local.x0 === 'number') local.x0 -= map.x0;
  if (typeof local.y0 === 'number') local.y0 -= map.y0;
  if (Array.isArray(local.pts)) local.pts = local.pts.map(point => [point[0] - map.x0, point[1] - map.y0]);
  return local;
}
const mobTypesForClient = mobTypes => Object.fromEntries(Object.keys(mobTypes).map(key => {
  const type = mobTypes[key];
  return [key, { n: type.name, r: type.r, c: type.color, st: !!type.stone, boss: !!type.boss, lvl: type.lvl, shape: type.shape, as: type.archetype, wb: type.worldBoss ? 1 : undefined }];
}));

function createSnapshotPublisher({ mobs, loot, drainEvents, refreshMobTypes, send, canSend }) {
  return function publishSnapshots(activePlayers, now) {
    const events = drainEvents();
    const { indices } = refreshMobTypes();
    const mobCells = activePlayers.length > 1 ? indexLivingMobs(mobs) : null;
    for (const player of activePlayers) {
      if (!canSend(player.c)) continue;
      const map = mapOf(player);
      // However a player changed map (portal, admin teleport), the client is told before it sees the new positions.
      if (player.c.mapIndex === undefined) player.c.mapIndex = map.index;
      else if (player.c.mapIndex !== map.index) { player.c.mapIndex = map.index; send(player.c, { t: 'map', world: worldInfo(map), arrived: true }); }
      const isNearby = (entity, radius) => Math.abs(entity.x - player.x) < radius && Math.abs(entity.y - player.y) < radius;
      const nearbyMonsters = snapshotMobs(mobs, player, mobCells);
      const nearbyPlayers = activePlayers.filter(other => other !== player && isNearby(other, 1500));
      const nearbyLoot = [...loot.values()].filter(drop => isNearby(drop, 1150) &&
        (!drop.owner || drop.owner === player.id || now >= drop.free));
      send(player.c, {
        t: 's', tm: now,
        me: ownPlayerSnapshot(player, now, map),
        pl: nearbyPlayers.map(other => otherPlayerSnapshot(other, now, map)),
        ...mobSnapshot(player.c, nearbyMonsters, indices, map.x0, map.y0),
        lo: nearbyLoot.map(drop => lootSnapshot(drop, map)),
        ev: events.filter(event => isNearby(event, 1300)).map(event => localEvent(event, map)),
      });
    }
  };
}

module.exports = { mobTypesForClient, createMobTypeIndex, createSnapshotPublisher, indexLivingMobs, snapshotMobs, mobSnapshot };
