'use strict';

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
function mobSnapshot(connection, nearby, typeIndex) {
  const rows = nearby.map(mob => [mob.id, typeIndex[mob.ty], Math.round(mob.x), Math.round(mob.y), Math.max(0, Math.round(mob.hp)), mob.mh, mob.lvl, mob.alpha]);
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

module.exports = { indexLivingMobs, snapshotMobs, mobSnapshot };
