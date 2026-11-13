'use strict';

const { nearby: queryNearby, SpatialIndex } = require('../shared/spatial-index');
const { CLASSES, xpNeed, playerDmg } = require('../player/characters');
const { inVillage, mapOf, worldInfo } = require('../world/game-world');
const { bossPhase, ENEMY_SCALING } = require('../combat/enemy-scaling');

const SNAPSHOT_RADIUS = 1150;
const SNAPSHOT_MOB_LIMIT = 420;

// Exact nearest-K selection: bounded max-heap, then the same distance/ID order
// as a full sort. Each distance is computed once, not on every comparison.
function nearestMobs(candidates, player, limit) {
  const distances = new Float64Array(candidates.length), heap = [];
  const compare = (a, b) => distances[a] - distances[b] || candidates[a].id - candidates[b].id;
  for (let index = 0; index < candidates.length; index++) {
    distances[index] = Math.abs(candidates[index].x - player.x) + Math.abs(candidates[index].y - player.y);
    if (heap.length < limit) {
      let at = heap.length; heap.push(index);
      while (at > 0) { const parent = (at - 1) >> 1; if (compare(heap[parent], index) >= 0) break; heap[at] = heap[parent]; at = parent; }
      heap[at] = index;
    } else if (compare(index, heap[0]) < 0) {
      let at = 0;
      while (at * 2 + 1 < heap.length) {
        let child = at * 2 + 1;
        if (child + 1 < heap.length && compare(heap[child + 1], heap[child]) > 0) child++;
        if (compare(index, heap[child]) >= 0) break;
        heap[at] = heap[child]; at = child;
      }
      heap[at] = index;
    }
  }
  return heap.sort(compare).map(index => candidates[index]);
}

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
  // This consumer applies its own ID/distance ordering below.
  if (mobs.spatial) collect(queryNearby(mobs, player, SNAPSHOT_RADIUS, false));
  else if (cells) {
    const cx = Math.floor(player.x / SNAPSHOT_RADIUS), cy = Math.floor(player.y / SNAPSHOT_RADIUS);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = cells.get((cx + dx) + ',' + (cy + dy));
        if (cell) collect(cell);
      }
    }
  } else collect(mobs.values());

  if (nearby.length > SNAPSHOT_MOB_LIMIT) {
    return nearestMobs(nearby, player, SNAPSHOT_MOB_LIMIT);
  } else if (cells || mobs.spatial) nearby.sort((a, b) => a.id - b.id);
  return nearby;
}
// Wire fields: mo is a full list, md contains changed rows, and mi carries the new ID order.
function mobRow(mob, typeIndex, originX, originY) {
  return [mob.id, typeIndex[mob.ty], Math.round(mob.x - originX), Math.round(mob.y - originY), Math.max(0, Math.round(mob.hp)), mob.mh, mob.lvl, mob.alpha,
    mob.boss ? bossPhase(mob) : 0, mob.cast?.s || '', mob.cast?.startedAt || 0, mob.cast?.at || 0, mob.recoverUntil || 0,
    mob.worldBoss && mob.fightStart ? mob.fightStart + ENEMY_SCALING.boss.worldBossEnrage.afterMs : 0, mob.look || 0]; // look: World Boss appearance code (visual)
}
function mobSnapshot(connection, nearby, typeIndex, originX = 0, originY = 0, rowFor) {
  const rows = nearby.map(mob => rowFor ? rowFor(mob) : mobRow(mob, typeIndex, originX, originY));
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
  if (connection.mobFieldDeltas) {
    const added = [], fields = [];
    for (const row of changed) {
      const old = previous.get(row[0]);
      if (!old) { added.push(row); continue; }
      let mask = 0; const values = [];
      for (let column = 1; column < row.length; column++) if (!Object.is(row[column], old[column])) { mask |= 1 << (column - 1); values.push(row[column]); }
      if (mask) fields.push([row[0], mask, ...values]);
    }
    if (added.length) delta.md = added;
    if (fields.length) delta.mf = fields;
  } else if (changed.length) delta.md = changed;
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

// Keep frequently changing state small; send inventory and skill ranks only when changed.
function playerStateDelta(connection, state) {
  const previous = connection.playerState || (connection.playerState = {});
  for (const key of ['inv', 'sk']) {
    const value = state[key], old = previous[key], keys = Object.keys(value);
    if (old && keys.length === Object.keys(old).length && keys.every(name => value[name] === old[name])) delete state[key];
    else previous[key] = { ...value };
  }
  return state;
}

const FAR_PLAYER_RADIUS = 750;
const FAR_PLAYER_INTERVAL_MS = 200;
const FULL_SNAPSHOT_INTERVAL_MS = 10000;

function sameFields(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && Object.is(a[key], b[key]));
}
function ownStateDelta(connection, state) {
  const previous = connection.ownState || (connection.ownState = {}), changed = {};
  for (const [key, value] of Object.entries(state)) {
    if (!Object.hasOwn(previous, key) || !sameFields(previous[key], value)) {
      changed[key] = value;
      previous[key] = value && typeof value === 'object' ? { ...value } : value;
    }
  }
  return changed;
}

// Rows are complete replacements. Missing IDs are removed immediately, even when movement is throttled.
function entityListDelta(connection, rows, kind, now, observer) {
  const playerList = kind === 'players';
  const fullKey = playerList ? 'pl' : 'lo', changedKey = playerList ? 'pd' : 'ld', removedKey = playerList ? 'pr' : 'lr';
  const cacheKey = playerList ? 'playerRows' : 'lootRows';
  const previous = connection[cacheKey];
  if (!previous) {
    connection[cacheKey] = new Map(rows.map(row => [row.id, { ...row }]));
    if (playerList) connection.playerSentAt = new Map(rows.map(row => [row.id, now]));
    return { [fullKey]: rows };
  }
  const visible = new Set(), changed = [], removed = [];
  for (const row of rows) {
    visible.add(row.id);
    const old = previous.get(row.id);
    if (old && sameFields(old, row)) continue;
    if (old && playerList) {
      const far = Math.hypot(row.x - observer.x, row.y - observer.y) > FAR_PLAYER_RADIUS;
      const stateChanged = Object.keys(row).some(key => key !== 'x' && key !== 'y' && !Object.is(old[key], row[key]));
      if (far && !stateChanged && now - connection.playerSentAt.get(row.id) < FAR_PLAYER_INTERVAL_MS) continue;
    }
    changed.push(row); previous.set(row.id, { ...row });
    if (playerList) connection.playerSentAt.set(row.id, now);
  }
  for (const id of previous.keys()) if (!visible.has(id)) {
    previous.delete(id); removed.push(id);
    if (playerList) connection.playerSentAt.delete(id);
  }
  return { ...(changed.length ? { [changedKey]: changed } : {}), ...(removed.length ? { [removedKey]: removed } : {}) };
}
function resetSnapshotBaseline(connection) {
  for (const key of ['ownState', 'playerState', 'playerRows', 'lootRows', 'playerSentAt', 'mobRows', 'mobIds']) delete connection[key];
  connection.snapshotBaseline = false;
}

function otherPlayerSnapshot(player, now, map) {
  return {
    id: player.id, n: player.name, x: Math.round(player.x - map.x0), y: Math.round(player.y - map.y0),
    hp: Math.round(player.hp), mh: player.maxhp, l: player.lvl, c: player.cls,
    w: player.w, d: player.dead ? 1 : 0, rg: now < player.buf.rage ? 1 : 0,
    ...(player.gmIndex ? { gm: player.gmIndex } : {}), // GM characters show the GM emblem to everyone
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
  return [key, { n: type.name, r: type.r, c: type.color, st: !!type.stone, boss: !!type.boss, lvl: type.lvl, shape: type.shape, as: type.archetype, wb: type.worldBoss ? 1 : undefined, wn: type.worldBossLook ? type.worldBossLook.name : undefined }];
}));

function createSnapshotPublisher({ players, mobs, loot, drainEvents, refreshMobTypes, send, canSend }) {
  return function publishSnapshots(activePlayers, now) {
    const events = drainEvents();
    const { indices } = refreshMobTypes();
    const mobCells = !mobs.spatial && activePlayers.length > 1 ? indexLivingMobs(mobs) : null;
    // Publication-local immutable wire rows: shared only inside one map/tick.
    // Connection baselines, ownership filtering and far-player cadence remain private.
    const mapCaches = new Map(), eventIndex = new SpatialIndex(1300);
    for (const event of events) eventIndex.update({ x: event.x, y: event.y, event });
    function cacheFor(map) {
      let cache = mapCaches.get(map);
      if (!cache) {
        cache = { mobs: new Map(), players: new Map(), loot: new Map(), events: new Map(),
          makeMob: entity => mobRow(entity, indices, map.x0, map.y0), makePlayer: entity => otherPlayerSnapshot(entity, now, map),
          makeLoot: entity => lootSnapshot(entity, map), makeEvent: entity => localEvent(entity, map) };
        mapCaches.set(map, cache);
      }
      return cache;
    }
    function rowFor(cache, entity, make) {
      let row = cache.get(entity);
      if (!row) { row = make(entity); cache.set(entity, row); }
      return row;
    }
    for (const player of activePlayers) {
      if (!canSend(player.c)) { resetSnapshotBaseline(player.c); continue; }
      const map = mapOf(player);
      const cache = cacheFor(map), onMap = entity => mapOf(entity) === map;
      // However a player changed map (portal, admin teleport), the client is told before it sees the new positions.
      if (player.c.mapIndex === undefined) player.c.mapIndex = map.index;
      else if (player.c.mapIndex !== map.index) { player.c.mapIndex = map.index; send(player.c, { t: 'map', world: worldInfo(map), arrived: true }); }
      const connection = player.c;
      const fullSnapshot = !connection.snapshotBaseline || connection.snapshotMap !== map.index || now >= connection.nextFullSnapshot;
      if (fullSnapshot) {
        resetSnapshotBaseline(connection);
        connection.snapshotBaseline = true; connection.snapshotMap = map.index;
        connection.nextFullSnapshot = now + FULL_SNAPSHOT_INTERVAL_MS;
      }
      const isNearby = (entity, radius) => Math.abs(entity.x - player.x) < radius && Math.abs(entity.y - player.y) < radius;
      const nearbyMonsters = snapshotMobs(mobs, player, mobCells).filter(onMap);
      const nearbyPlayers = (players?.spatial ? queryNearby(players, player, 1500) : activePlayers).filter(other => other !== player && isNearby(other, 1500) && onMap(other));
      const nearbyLoot = queryNearby(loot, player, 1150).filter(drop => now <= drop.exp && isNearby(drop, 1150) &&
        onMap(drop) && (!drop.owner || drop.owner === player.id || now >= drop.free));
      const own = ownPlayerSnapshot(player, now, map);
      const playerRows = nearbyPlayers.map(other => rowFor(cache.players, other, cache.makePlayer));
      const lootRows = nearbyLoot.map(drop => rowFor(cache.loot, drop, cache.makeLoot));
      const result = send(player.c, {
        t: 's', tm: now,
        ...(fullSnapshot && (connection.stateDeltas || connection.listDeltas) ? { sf: 1 } : {}),
        me: connection.stateDeltas ? ownStateDelta(connection, own) : connection.meDeltas ? playerStateDelta(connection, own) : own,
        ...(connection.listDeltas ? entityListDelta(connection, playerRows, 'players', now, own) : { pl: playerRows }),
        ...mobSnapshot(player.c, nearbyMonsters, indices, map.x0, map.y0, mob => rowFor(cache.mobs, mob, cache.makeMob)),
        ...(connection.listDeltas ? entityListDelta(connection, lootRows, 'loot', now, own) : { lo: lootRows }),
        ev: eventIndex.query(player, 1300).filter(entry => isNearby(entry, 1300) && onMap(entry)).map(({ event }) => rowFor(cache.events, event, cache.makeEvent)),
      });
      if (result === false) resetSnapshotBaseline(connection);
    }
  };
}

module.exports = { ownStateDelta, entityListDelta, resetSnapshotBaseline, FAR_PLAYER_RADIUS, FAR_PLAYER_INTERVAL_MS, FULL_SNAPSHOT_INTERVAL_MS, playerStateDelta, mobTypesForClient, createMobTypeIndex, createSnapshotPublisher, indexLivingMobs, snapshotMobs, mobSnapshot };
