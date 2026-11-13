'use strict';

// Persistent cell membership. Moving entities must call update after their position changes.
class SpatialIndex {
  constructor(cellSize = 600) { this.cellSize = cellSize; this.cells = new Map(); this.members = new Map(); this.sequence = 0; this.ranges = new Map(); this.cachedMembers = 0; }
  invalidate() { this.ranges.clear(); this.cachedMembers = 0; }
  key(entity) { return Math.floor(entity.x / this.cellSize) + ',' + Math.floor(entity.y / this.cellSize); }
  update(entity) {
    const key = this.key(entity), previous = this.members.get(entity);
    if (previous?.key === key) return;
    if (previous) this.remove(entity);
    let cell = this.cells.get(key); if (!cell) this.cells.set(key, cell = new Set());
    const member = { entity, key, order: previous?.order ?? this.sequence++ };
    cell.add(member); this.members.set(entity, member);
    this.invalidate();
  }
  remove(entity) { const previous = this.members.get(entity); if (!previous) return; const cell = this.cells.get(previous.key); cell.delete(previous); if (!cell.size) this.cells.delete(previous.key); this.members.delete(entity); this.invalidate(); }
  clear() { this.cells.clear(); this.members.clear(); this.sequence = 0; this.invalidate(); }
  query(entity, radius, ordered = true) {
    const result = [], size = this.cellSize;
    const x0 = Math.floor((entity.x - radius) / size), x1 = Math.floor((entity.x + radius) / size), y0 = Math.floor((entity.y - radius) / size), y1 = Math.floor((entity.y + radius) / size);
    if (!ordered) {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const cell = this.cells.get(x + ',' + y); if (!cell) continue;
        for (const { entity: candidate } of cell) if (Math.abs(candidate.x - entity.x) <= radius && Math.abs(candidate.y - entity.y) <= radius) result.push(candidate);
      }
      return result;
    }
    const key = x0 + ':' + x1 + ':' + y0 + ':' + y1;
    let members = ordered && this.ranges.get(key);
    if (!members) {
      members = [];
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const cell = this.cells.get(x + ',' + y); if (!cell) continue;
        for (const member of cell) members.push(member);
      }
      if (ordered) {
        members.sort((a, b) => a.order - b.order);
        // Bounded reference cache, invalidated only on membership changes. Positions are
        // filtered afresh, including moves inside a cell. No cached visibility decisions.
        if (this.ranges.size >= 64 || this.cachedMembers + members.length > 65536) this.invalidate();
        if (members.length <= 65536) { this.ranges.set(key, members); this.cachedMembers += members.length; }
      }
    }
    for (const { entity: candidate } of members) if (Math.abs(candidate.x - entity.x) <= radius && Math.abs(candidate.y - entity.y) <= radius) result.push(candidate);
    return result;
  }
  some(entity, radius, predicate) {
    const size = this.cellSize;
    for (let x = Math.floor((entity.x - radius) / size); x <= Math.floor((entity.x + radius) / size); x++) {
      for (let y = Math.floor((entity.y - radius) / size); y <= Math.floor((entity.y + radius) / size); y++) {
        const cell = this.cells.get(x + ',' + y); if (!cell) continue;
        for (const { entity: candidate } of cell) if (Math.abs(candidate.x - entity.x) <= radius && Math.abs(candidate.y - entity.y) <= radius && predicate(candidate)) return true;
      }
    }
    return false;
  }
}
class IndexedEntities extends Map {
  constructor() { super(); this.spatial = new SpatialIndex(); }
  set(id, entity) { const old = this.get(id); if (old && old !== entity) this.spatial.remove(old); super.set(id, entity); this.spatial.update(entity); return this; }
  delete(id) { const entity = this.get(id); if (entity) this.spatial.remove(entity); return super.delete(id); }
  clear() { super.clear(); this.spatial.clear(); }
  update(entity) { if (this.get(entity.id) === entity) this.spatial.update(entity); }
}
function nearby(entities, point, radius, ordered = true) { return entities.spatial ? entities.spatial.query(point, radius, ordered) : [...entities.values()].filter(entity => Math.abs(entity.x - point.x) <= radius && Math.abs(entity.y - point.y) <= radius); }
function anyNearby(entities, point, radius, predicate) {
  if (entities.spatial) return entities.spatial.some(point, radius, predicate);
  for (const entity of entities.values()) if (Math.abs(entity.x - point.x) <= radius && Math.abs(entity.y - point.y) <= radius && predicate(entity)) return true;
  return false;
}
module.exports = { SpatialIndex, IndexedEntities, nearby, anyNearby };
