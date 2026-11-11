'use strict';
// Compact, immutable danger geography. All coordinates are local to the region.
const { stream, segmentDistance } = require('./world-generation');
const DANGER_VERSION = 1, GRID_SIZE = 41;
const PROFILES = Object.freeze({
  wildwood: { baseline: .40, noise: .17, territories: 4, extremes: 1, respites: 4 },
  volcanic: { baseline: .56, noise: .15, territories: 7, extremes: 3, respites: 2 },
  glacier: { baseline: .45, noise: .21, territories: 5, extremes: 2, respites: 3 },
  necropolis: { baseline: .53, noise: .13, territories: 7, extremes: 2, respites: 2 },
  voidscar: { baseline: .52, noise: .20, territories: 6, extremes: 3, respites: 2 },
  warfields: { baseline: .48, noise: .16, territories: 6, extremes: 1, respites: 3 },
});
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
function category(score) { return score < .2 ? 'SAFE' : score < .4 ? 'LOW' : score < .65 ? 'NORMAL' : score < .85 ? 'HIGH' : 'EXTREME'; }
function createDangerSpec({ seed, tier, biome, options = {} }) {
  const random = stream(seed, tier, DANGER_VERSION, 'danger-geography');
  const profile = { ...(PROFILES[biome] || PROFILES.wildwood) };
  for (const key of ['baseline', 'noise']) if (Number.isFinite(options[key])) profile[key] = Math.max(key === 'noise' ? .05 : .25, Math.min(key === 'noise' ? .25 : .65, options[key]));
  const noise = Array.from({ length: 8 * 8 }, () => random.float(-1, 1));
  const point = () => { const angle = random.float(0, 2 * Math.PI), radius = random.float(.17, .42); return { x: .5 + Math.cos(angle) * radius, y: .5 + Math.sin(angle) * radius }; };
  const threats = Array.from({ length: profile.territories + random.int(-1, 1) }, (_, i) => ({ id: 'territory:' + i, ...point(), radius: random.float(.08, .17), strength: random.float(.20, .36), kind: 'territory' }));
  for (let i = 0; i < profile.extremes; i++) threats.push({ id: 'anomaly:' + i, ...point(), radius: random.float(.045, .08), strength: .65, kind: 'anomaly' });
  const respites = Array.from({ length: profile.respites }, (_, i) => ({ id: 'respite:' + i, ...point(), radius: random.float(.055, .10), strength: .42 }));
  return { version: DANGER_VERSION, profile: biome, parameters: profile, noiseSize: 8, noise, threats, respites, routePhase: random.float(0, Math.PI * 2) };
}
function materializeDanger(spec, boundary, protectedAreas) {
  if (spec.version !== DANGER_VERSION) throw new RangeError('Unsupported danger version');
  const scale = Math.min(boundary.width, boundary.height);
  const expand = point => ({ ...point, x: point.x * boundary.width, y: point.y * boundary.height, radius: point.radius * scale });
  return { ...structuredClone(spec), boundary: { ...boundary }, threats: spec.threats.map(expand), respites: spec.respites.map(expand), protectedAreas: structuredClone(protectedAreas), routes: [] };
}
function noiseAt(field, x, y) {
  const n = field.noiseSize, gx = clamp(x / field.boundary.width) * (n - 1), gy = clamp(y / field.boundary.height) * (n - 1);
  const ix = Math.min(n - 2, Math.floor(gx)), iy = Math.min(n - 2, Math.floor(gy)), tx = smooth(gx - ix), ty = smooth(gy - iy);
  const a = field.noise[iy * n + ix] * (1 - tx) + field.noise[iy * n + ix + 1] * tx;
  const b = field.noise[(iy + 1) * n + ix] * (1 - tx) + field.noise[(iy + 1) * n + ix + 1] * tx;
  return a * (1 - ty) + b * ty;
}
function influence(point, x, y) { return smooth(1 - Math.hypot(x - point.x, y - point.y) / point.radius) * point.strength; }
function dangerAt(field, x, y) {
  const raw = field.parameters.baseline + noiseAt(field, x, y) * field.parameters.noise + field.threats.reduce((sum, point) => sum + influence(point, x, y), 0);
  let safety = field.respites.reduce((sum, point) => sum + influence(point, x, y), 0);
  for (const area of field.protectedAreas) {
    const weight = 1 - smooth((Math.hypot(x - area.x, y - area.y) - area.radius) / 300);
    safety = Math.max(safety, Math.max(0, raw - .10) * weight);
  }
  for (const route of field.routes) {
    let distance = Infinity;
    for (let i = 1; i < route.points.length; i++) distance = Math.min(distance, segmentDistance({ x, y }, route.points[i - 1], route.points[i]));
    const end = route.points.at(-1), target = .32 + .46 * Math.exp(-((Math.hypot(x - end.x, y - end.y) / 280) ** 2));
    safety = Math.max(safety, Math.max(0, raw - target) * (1 - smooth(distance / route.width)));
  }
  return clamp(raw - safety);
}
// The game currently has no solid terrain obstacles: only the map edge blocks walking.
function navigable(point, boundary) { return Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 20 && point.y >= 20 && point.x <= boundary.width - 20 && point.y <= boundary.height - 20; }
function samples(a, b, visit) { const count = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 25)); for (let i = 0; i <= count; i++) if (!visit({ x: a.x + (b.x - a.x) * i / count, y: a.y + (b.y - a.y) * i / count })) return false; return true; }
function edgeAllowed(a, b, field, allowExtreme, arenas, destination) {
  return samples(a, b, point => navigable(point, field.boundary) && (allowExtreme || dangerAt(field, point.x, point.y) < .85) && !arenas.some(arena => arena.id !== destination && Math.hypot(point.x - arena.x, point.y - arena.y) < arena.radius + 30));
}
// Bounded Dijkstra on an eight-neighbour graph. Never allocates in proportion to tier.
function findPath(field, from, to, { allowExtreme = false, arenas = [], destination = '', riskWeight = 10 } = {}) {
  if (!navigable(from, field.boundary) || !navigable(to, field.boundary)) return null;
  const size = GRID_SIZE, count = size * size, width = field.boundary.width - 60, height = field.boundary.height - 60;
  const coordinate = id => ({ x: 30 + id % size * width / (size - 1), y: 30 + Math.floor(id / size) * height / (size - 1) });
  const nearest = point => Math.round((point.x - 30) / width * (size - 1)) + Math.round((point.y - 30) / height * (size - 1)) * size;
  const start = nearest(from), end = nearest(to), costs = new Float64Array(count).fill(Infinity), parents = new Int32Array(count).fill(-1), visited = new Uint8Array(count);
  costs[start] = 0;
  // Binary heap keeps generation O(V log V) rather than scanning the whole grid for each node.
  const heap = [];
  function push(id, cost) { let i = heap.length; heap.push({ id, cost }); while (i) { const p = (i - 1) >> 1; if (heap[p].cost <= cost) break; heap[i] = heap[p]; i = p; } heap[i] = { id, cost }; }
  function pop() { const first = heap[0], last = heap.pop(); if (heap.length) { let i = 0; while (i * 2 + 1 < heap.length) { let child = i * 2 + 1; if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost) child++; if (last.cost <= heap[child].cost) break; heap[i] = heap[child]; i = child; } heap[i] = last; } return first; }
  if (!edgeAllowed(from, coordinate(start), field, allowExtreme, arenas, destination) || !edgeAllowed(coordinate(end), to, field, allowExtreme, arenas, destination)) return null;
  const danger = Array.from({ length: count }, (_, id) => { const point = coordinate(id); return dangerAt(field, point.x, point.y); });
  push(start, 0);
  while (heap.length) {
    const { id } = pop(); if (visited[id]) continue; visited[id] = 1; if (id === end) break;
    const x = id % size, y = Math.floor(id / size), a = coordinate(id);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      if (x + dx < 0 || x + dx >= size || y + dy < 0 || y + dy >= size) continue;
      const next = id + dx + dy * size, b = coordinate(next);
      if (visited[next] || !edgeAllowed(a, b, field, allowExtreme, arenas, destination)) continue;
      const value = costs[id] + Math.hypot(a.x - b.x, a.y - b.y) * (1 + danger[next] ** 2 * riskWeight);
      if (value < costs[next]) { costs[next] = value; parents[next] = id; push(next, value); }
    }
  }
  if (!Number.isFinite(costs[end])) return null;
  const ids = []; for (let id = end; id !== -1; id = parents[id]) ids.push(id);
  const points = [from, ...ids.reverse().map(coordinate), to];
  return points.filter((point, i) => !i || Math.hypot(point.x - points[i - 1].x, point.y - points[i - 1].y) > .01);
}
function validateRoutes(plan) {
  const errors = [], objectives = [plan.settlement, plan.portal || { id: 'portal', x: plan.settlement.x, y: plan.settlement.y + 62 }, ...plan.encounters.filter(e => e.kind === 'boss')];
  for (const objective of objectives) {
    if (!navigable(objective, plan.boundary)) { errors.push('objective-boundary:' + objective.id); continue; }
    if (objective.id === 'settlement') continue;
    const path = plan.paths.find(path => path.from === 'settlement' && path.to === objective.id && path.kind === 'safe');
    if (!path || path.points.length < 2 || Math.hypot(path.points[0].x - plan.settlement.x, path.points[0].y - plan.settlement.y) > .1 || Math.hypot(path.points.at(-1).x - objective.x, path.points.at(-1).y - objective.y) > .1) { errors.push('unreachable:' + objective.id); continue; }
    for (let i = 1; i < path.points.length; i++) if (!edgeAllowed(path.points[i - 1], path.points[i], plan.danger, false, plan.encounters.filter(e => e.kind === 'boss'), objective.id)) { errors.push('unsafe-route:' + objective.id); break; }
  }
  return { valid: errors.length === 0, errors, objectives };
}
function buildRoutes(plan) {
  const field = plan.danger, bosses = plan.encounters.filter(e => e.kind === 'boss');
  const repairs = [], paths = [];
  for (const boss of bosses) {
    field.threats.push({ id: boss.id, kind: 'boss', x: boss.x, y: boss.y, radius: 600, strength: .30 });
  }
  const objectives = [plan.portal || { id: 'portal', x: plan.settlement.x, y: plan.settlement.y + 62 }, ...bosses];
  for (const objective of objectives) {
    const options = { arenas: bosses, destination: objective.id };
    let points;
    if (objective.id === 'portal') points = [plan.settlement, objective];
    else {
      // A seeded approach landmark avoids a single straight, radial safe corridor.
      const angle = field.routePhase + bosses.indexOf(objective) * 1.7;
      const waypoint = { x: field.boundary.cx + Math.cos(angle) * 650, y: field.boundary.cy + Math.sin(angle) * 650 };
      const first = findPath(field, plan.settlement, waypoint, options), second = findPath(field, waypoint, objective, options);
      points = first && second ? [...first, ...second.slice(1)] : null;
      if (!points) { points = findPath(field, plan.settlement, objective, { ...options, allowExtreme: true }); repairs.push({ objective: objective.id, action: 'carve-safe-corridor' }); }
      if (!points) throw new Error('Mandatory objective cannot be repaired: ' + objective.id);
    }
    const route = { from: 'settlement', to: objective.id, kind: 'safe', width: 95, points };
    paths.push(route); field.routes.push(route);
    if (objective.id !== 'portal') {
      const shortcut = findPath(field, plan.settlement, objective, { ...options, allowExtreme: true, riskWeight: 0 });
      if (shortcut) paths.push({ from: 'settlement', to: objective.id, kind: 'risky', width: 0, points: shortcut });
    }
  }
  plan.paths = paths; plan.routeRepairs = repairs;
  const validation = validateRoutes(plan);
  if (!validation.valid) throw new Error('Invalid mandatory routes: ' + validation.errors.join(', '));
  for (const path of paths) {
    path.length = 0; path.maxDanger = 0;
    for (let i = 1; i < path.points.length; i++) {
      path.length += Math.hypot(path.points[i].x - path.points[i - 1].x, path.points[i].y - path.points[i - 1].y);
      samples(path.points[i - 1], path.points[i], point => { path.maxDanger = Math.max(path.maxDanger, dangerAt(field, point.x, point.y)); return true; });
    }
  }
  return validation;
}
function placementAllowed(field, kind, point) {
  const score = dangerAt(field, point.x, point.y);
  if (kind === 'boss') return score >= .5 && score < .85;
  if (kind === 'alpha') return score >= .65;
  if (kind === 'camp') return score >= .23 && score <= .84;
  return score >= .20;
}
function sampleHeatmap(field, resolution = 96) {
  resolution = Math.max(16, Math.min(128, Math.floor(resolution) || 96));
  const values = Array.from({ length: resolution * resolution }, (_, i) => Math.round(dangerAt(field, (i % resolution + .5) / resolution * field.boundary.width, (Math.floor(i / resolution) + .5) / resolution * field.boundary.height) * 1000) / 1000);
  return { resolution, values };
}
module.exports = { DANGER_VERSION, GRID_SIZE, PROFILES, category, createDangerSpec, materializeDanger, dangerAt, navigable, findPath, validateRoutes, buildRoutes, placementAllowed, sampleHeatmap };
