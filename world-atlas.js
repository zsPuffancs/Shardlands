'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRegionDescriptor, generationSnapshot } = require('./universe');
const { buildRegionPlan, regionGeometry, MAX_ATLAS_TIER } = require('./region-blueprint');
const { validateSpawnPlan } = require('./world-generation');
const { sampleHeatmap, validateRoutes, dangerAt, category } = require('./danger-geography');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function localRequest(request) {
  const address = request.socket.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return false;
  if (['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip'].some(key => request.headers[key] !== undefined)) return false;
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(request.headers.host || '')) return false;
  if (request.headers.origin && request.headers.origin !== 'http://' + request.headers.host) return false;
  return request.headers['sec-fetch-site'] !== 'cross-site';
}
function createAtlas({ universe, directory = path.join(__dirname, 'dev-atlas') }) {
  // An Atlas session freezes history, range context and configuration at server startup.
  const initial = universe.state;
  const frozen = structuredClone({ seed: initial.seed, generatorVersion: initial.generatorVersion, generationSettings: initial.generationSettings, levelRangeVersion: initial.levelRangeVersion, regions: Object.fromEntries(Object.entries(initial.regions).map(([tier, region]) => [tier, { levels: region.levels }])), snapshot: generationSnapshot(initial) });
  const snapshotId = digest(frozen), cache = new Map();
  function inspect({ tier, preview = false, seed = frozen.seed }) {
    if (!Number.isSafeInteger(tier) || tier < 1 || tier > MAX_ATLAS_TIER) throw new RangeError('Tier must be an integer from 1 to ' + MAX_ATLAS_TIER);
    if (typeof seed !== 'string' || !seed.trim() || seed.length > 40 || /[\x00-\x1f]/.test(seed)) throw new RangeError('Seed must contain 1-40 printable characters.');
    seed = seed.trim();
    const saved = universe.state.regions[tier];
    if (!preview && (!saved || tier > universe.state.worldTier)) throw new RangeError('Region is not persisted and unlocked. Select dry-run preview.');
    const context = { ...frozen, seed, regions: seed === frozen.seed ? frozen.regions : {} };
    const record = preview ? createRegionDescriptor(context, tier, frozen.snapshot) : saved;
    const { spawnState, spawnPlan, ...descriptor } = record;
    const key = digest({ seed: preview ? seed : initial.seed, tier, version: initial.generatorVersion, snapshotId, preview, descriptor, spawnPlan, settings: frozen.generationSettings });
    if (cache.has(key)) { const value = cache.get(key); cache.delete(key); cache.set(key, value); return value; }
    const plan = spawnPlan || (initial.generatorVersion === 2 ? buildRegionPlan({ ...context, seed: preview ? seed : initial.seed }, record) : null);
    const validation = plan ? validateSpawnPlan(plan) : { valid: null, errors: [], counts: {}, unsupported: 'v1 has no saved encounter geometry; legacy placement is intentionally unchanged.' };
    if (plan?.danger) validation.routes = validateRoutes(plan);
    const payload = { seed: preview ? seed : initial.seed, tier, generatorVersion: initial.generatorVersion, dangerVersion: plan?.danger?.version || null, status: preview ? 'hypothetical-preview' : spawnPlan ? 'persisted-plan' : 'persisted-region-unmaterialized-plan', snapshotId: preview ? snapshotId : digest(record.snapshot || {}), frozenSnapshot: preview ? frozen.snapshot : record.snapshot, descriptor, geometry: plan?.boundary || { shape: tier <= 7 && !require('./monsters').TIERS[tier - 1].outer ? 'annulus' : 'square', width: regionGeometry(tier).w, height: regionGeometry(tier).h, cx: regionGeometry(tier).cx, cy: regionGeometry(tier).cy, min: tier <= 7 ? require('./monsters').TIERS[tier - 1].min : 400, max: tier <= 7 ? require('./monsters').TIERS[tier - 1].max : 99999, margin: 30 }, plan, heatmap: plan?.danger ? sampleHeatmap(plan.danger) : null, validation, notes: ['Flat walkable gameplay terrain; scenery is decorative, not a collision mesh.', ...(preview ? ['Read-only dry run; history/configuration frozen at server startup. Alternative seeds use the independent tier-level fallback.'] : []), ...(!plan?.danger ? ['Legacy region: no danger field is retrofitted.'] : [])] };
    cache.set(key, payload); if (cache.size > 8) cache.delete(cache.keys().next().value);
    return payload;
  }
  function handle(request, response) {
    let url;
    try { url = new URL(request.url, 'http://localhost'); } catch { return false; }
    if (url.pathname !== '/dev/atlas' && !url.pathname.startsWith('/dev/atlas/')) return false;
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    function json(status, value) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); }
    if (!localRequest(request)) { json(403, { error: 'Atlas is restricted to direct loopback access. Proxied and remote connections are denied.' }); return true; }
    if (request.method !== 'GET') { json(405, { error: 'Read-only endpoint' }); return true; }
    try {
      if (url.pathname === '/dev/atlas/api/regions') {
        const offset = Number(url.searchParams.get('offset') || 0);
        if (!Number.isSafeInteger(offset) || offset < 0) throw new RangeError('Invalid list offset');
        const regions = Object.values(universe.state.regions).filter(region => region.tier <= universe.state.worldTier).sort((a, b) => a.tier - b.tier);
        json(200, { regions: regions.slice(offset, offset + 1024).map(region => ({ tier: region.tier, name: region.name, biome: region.biome || 'founding', status: region.spawnPlan ? 'persisted-plan' : 'persisted-region' })), nextOffset: offset + 1024 < regions.length ? offset + 1024 : null, worldTier: universe.state.worldTier, maxTier: MAX_ATLAS_TIER, seed: frozen.seed, snapshotId });
      } else if (['/dev/atlas/api/region', '/dev/atlas/api/report', '/dev/atlas/api/probe'].includes(url.pathname)) {
        const result = inspect({ tier: Number(url.searchParams.get('tier')), preview: url.searchParams.get('mode') === 'preview', seed: url.searchParams.get('seed') || frozen.seed });
        if (url.pathname.endsWith('/probe')) {
          const x = Number(url.searchParams.get('x')), y = Number(url.searchParams.get('y'));
          if (!url.searchParams.has('x') || !url.searchParams.has('y') || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > result.geometry.width || y > result.geometry.height) throw new RangeError('Probe outside region');
          const score = result.plan?.danger ? dangerAt(result.plan.danger, x, y) : null;
          json(200, { x, y, score, category: score === null ? 'LEGACY / UNMODELED' : category(score), encounters: result.plan?.encounters.filter(e => Math.hypot(x - e.x, y - e.y) <= e.radius + 80).map(e => ({ id: e.id, kind: e.kind, spawnIds: e.spawnIds })) || [] });
        } else if (url.pathname.endsWith('/report')) { response.setHeader('Content-Disposition', 'attachment; filename="shardlands-validation-' + result.tier + '.json"'); json(200, { seed: result.seed, tier: result.tier, generatorVersion: result.generatorVersion, status: result.status, snapshotId: result.snapshotId, geometry: result.geometry, validation: result.validation, dangerProfile: result.plan?.danger?.profile || null, routes: result.plan?.paths || [], routeRepairs: result.plan?.routeRepairs || [], failures: result.plan?.failures || [], notes: result.notes }); }
        else json(200, result);
      } else {
        const asset = { '/dev/atlas': 'index.html', '/dev/atlas/': 'index.html', '/dev/atlas/atlas.js': 'atlas.js', '/dev/atlas/atlas.css': 'atlas.css' }[url.pathname];
        if (!asset) json(404, { error: 'Not found' });
        else { const body = fs.readFileSync(path.join(directory, asset)); response.writeHead(200, { 'Content-Type': asset.endsWith('.js') ? 'text/javascript; charset=utf-8' : asset.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8' }); response.end(body); }
      }
    } catch (error) { json(error instanceof RangeError ? 400 : 422, { error: error.message }); }
    return true;
  }
  return { handle, inspect, snapshotId, cacheSize: () => cache.size };
}
module.exports = { createAtlas, localRequest };
