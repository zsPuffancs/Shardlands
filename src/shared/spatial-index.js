'use strict';

// Persistent cell membership. Moving entities must call update after their position changes.
class SpatialIndex {
  constructor(cellSize = 600) { this.cellSize = cellSize; this.cells = new Map(); this.members = new Map(); this.sequence = 0; }
  key(entity) { return Math.floor(entity.x / this.cellSize) + ',' + Math.floor(entity.y / this.cellSize); }
  update(entity) {
    const key = this.key(entity), previous = this.members.get(entity);
    if (previous?.key === key) return;
    if (previous) this.remove(entity);
    let cell = this.cells.get(key); if (!cell) this.cells.set(key, cell = new Set()); cell.add(entity);
    this.members.set(entity, { key, order: previous?.order ?? this.sequence++ });
  }
  remove(entity) { const previous = this.members.get(entity); if (!previous) return; const cell = this.cells.get(previous.key); cell.delete(entity); if (!cell.size) this.cells.delete(previous.key); this.members.delete(entity); }
  clear() { this.cells.clear(); this.members.clear(); this.sequence = 0; }
  query(entity, radius) {
    const result = [], size = this.cellSize;
    for (let x = Math.floor((entity.x - radius) / size); x <= Math.floor((entity.x + radius) / size); x++) {
      for (let y = Math.floor((entity.y - radius) / size); y <= Math.floor((entity.y + radius) / size); y++) {
        const cell = this.cells.get(x + ',' + y); if (!cell) continue;
        for (const candidate of cell) if (Math.abs(candidate.x - entity.x) <= radius && Math.abs(candidate.y - entity.y) <= radius) result.push(candidate);
      }
    }
    return result.sort((a, b) => this.members.get(a).order - this.members.get(b).order);
  }
}
class IndexedEntities extends Map {
  constructor() { super(); this.spatial = new SpatialIndex(); }
  set(id, entity) { const old = this.get(id); if (old && old !== entity) this.spatial.remove(old); super.set(id, entity); this.spatial.update(entity); return this; }
  delete(id) { const entity = this.get(id); if (entity) this.spatial.remove(entity); return super.delete(id); }
  clear() { super.clear(); this.spatial.clear(); }
  update(entity) { if (this.get(entity.id) === entity) this.spatial.update(entity); }
}
function nearby(entities, point, radius) { return entities.spatial ? entities.spatial.query(point, radius) : [...entities.values()].filter(entity => Math.abs(entity.x - point.x) <= radius && Math.abs(entity.y - point.y) <= radius); }
module.exports = { SpatialIndex, IndexedEntities, nearby };
