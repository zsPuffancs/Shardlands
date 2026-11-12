'use strict';
// Lightweight destination metadata only: browsing never creates a region or loads its spawn plan.
const PORTAL_LIMITS = Object.freeze({ pageSize: 25, maxPageSize: 25, queryLength: 80, favorites: 256, recent: 20 });
const fold = value => String(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const BIOME_SEARCH = Object.freeze({ volcanic: 'volcanic vulkanikus', glacier: 'glacier gleccser', voidscar: 'voidscar uressegheg', wildwood: 'wildwood vadon', warfields: 'warfields csatamezok', necropolis: 'necropolis nekropolisz' });
function integer(value, fallback, min, max) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid portal parameter');
  return value;
}
function parseRequest(message) {
  if (message.op !== undefined && message.op !== 'list') throw new RangeError('Invalid portal operation');
  const page = integer(message.page, 1, 1, Number.MAX_SAFE_INTEGER), limit = integer(message.limit, PORTAL_LIMITS.pageSize, 1, PORTAL_LIMITS.maxPageSize);
  const requestId = integer(message.requestId, undefined, 0, Number.MAX_SAFE_INTEGER);
  const tier = integer(message.tier, undefined, 1, Number.MAX_SAFE_INTEGER);
  const query = message.query === undefined ? '' : message.query;
  if (typeof query !== 'string' || query.length > PORTAL_LIMITS.queryLength || /[\x00-\x1f]/.test(query)) throw new RangeError('Invalid portal query');
  const scope = message.scope === undefined ? 'all' : message.scope;
  if (!['all', 'favorites', 'recent'].includes(scope)) throw new RangeError('Invalid portal scope');
  const indices = message.indices === undefined ? [] : message.indices;
  if (!Array.isArray(indices) || indices.length > (scope === 'recent' ? PORTAL_LIMITS.recent : PORTAL_LIMITS.favorites) || indices.some(index => !Number.isSafeInteger(index) || index < 0 || index > 65535)) throw new RangeError('Invalid portal preferences');
  return { page, limit, requestId, tier, query: fold(query.trim()), scope, indices: [...new Set(indices)] };
}
function createPortalDirectory({ maps, regions, players, worldTier, mapOf, foundingTiers = 7 }) {
  const entries = [], byIndex = new Map(), byTier = new Map();
  let revision = 0, availableRevision = -1, availableTier, available = [];
  function register(map, region) {
    if (byIndex.has(map.index)) return;
    if (map.index !== 0 && !region) return;
    const metadata = map.index === 0 ? { index: 0, founding: true, tier: 1, name: 'The Founding Lands', levels: [1, 60], biome: 'founding' }
      : { index: map.index, tier: map.regionTier, name: String(region.name).slice(0, 200), biome: String(region.biome).slice(0, 40), levels: region.levels.slice(0, 2), boss: String(region.worldBoss?.name || '').slice(0, 200) };
    const entry = { metadata, search: fold([metadata.name, metadata.biome, BIOME_SEARCH[metadata.biome] || '', metadata.founding ? 'founding lands alapito foldek' : ''].join(' ')) };
    byIndex.set(metadata.index, entry); byTier.set(metadata.tier, entry);
    if (metadata.founding) for (let tier = 2; tier <= foundingTiers; tier++) byTier.set(tier, entry);
    // Runtime regions are normally opened in order; keep direct inserts deterministic too.
    let left = 0, right = entries.length;
    while (left < right) { const middle = (left + right) >>> 1; if (entries[middle].metadata.index < metadata.index) left = middle + 1; else right = middle; }
    entries.splice(left, 0, entry);
    revision++;
  }
  for (const map of maps) if (map) register(map, map.index ? regions[map.regionTier] : null);
  function unlocked(entry) {
    if (!entry) return false;
    const row = entry.metadata, map = maps[row.index];
    return !!map && (row.index === 0 || row.tier <= worldTier() && !!regions[row.tier] && map.regionTier === row.tier);
  }
  function canTravel(index) { return Number.isSafeInteger(index) && index >= 0 && unlocked(byIndex.get(index)); }
  function availableEntries() {
    if (availableRevision !== revision || availableTier !== worldTier()) {
      // Reverse the cached ascending index before filtering/pagination, not just each visible page.
      available = entries.filter(unlocked).reverse(); availableRevision = revision; availableTier = worldTier();
    }
    return available;
  }
  function list(player, message = {}) {
    let request;
    try { request = parseRequest(message); }
    catch {
      return { t: 'portal', op: 'list', ...(Number.isSafeInteger(message.requestId) && message.requestId >= 0 ? { requestId: message.requestId } : {}), error: 'invalidRequest', maps: [] };
    }
    const currentMap = mapOf(player), population = new Map();
    for (const other of players.values()) { const index = mapOf(other).index; population.set(index, (population.get(index) || 0) + 1); }
    const view = entry => entry ? { ...entry.metadata, players: population.get(entry.metadata.index) || 0, ...(entry.metadata.founding ? {} : { defeated: entry.metadata.tier < worldTier() }) } : null;
    const numericQuery = /^(?:(?:tier|wt)\s*|#)?(\d+)$/.exec(request.query);
    const requestedTier = request.tier ?? (numericQuery ? Number(numericQuery[1]) : undefined);
    const available = availableEntries();
    let candidates = request.scope === 'all' ? available : request.indices.map(index => byIndex.get(index)).filter(Boolean);
    if (requestedTier !== undefined) {
      const entry = byTier.get(requestedTier);
      candidates = entry && (request.scope === 'all' || request.indices.includes(entry.metadata.index)) ? [entry] : [];
    }
    const terms = numericQuery ? [] : request.query.split(/\s+/).filter(Boolean);
    const matches = request.scope === 'all' && requestedTier === undefined && !terms.length ? candidates : candidates.filter(entry => unlocked(entry) && terms.every(term => entry.search.includes(term)));
    if (request.scope === 'favorites') matches.sort((a, b) => b.metadata.tier - a.metadata.tier || b.metadata.index - a.metadata.index);
    const total = matches.length, pages = Math.max(1, Math.ceil(total / request.limit)), page = Math.min(request.page, pages);
    return { t: 'portal', op: 'list', requestId: request.requestId, page, limit: request.limit, pages, total,
      unlockedTotal: available.length,
      here: currentMap.index, tier: worldTier(), current: view(byIndex.get(currentMap.index)),
      maps: matches.slice((page - 1) * request.limit, page * request.limit).map(view), limits: PORTAL_LIMITS };
  }
  return { register, list, canTravel };
}
module.exports = { PORTAL_LIMITS, createPortalDirectory };
