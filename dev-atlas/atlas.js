'use strict';
const $ = id => document.getElementById(id), canvas = $('map'), context = canvas.getContext('2d');
const layers = { terrain: true, heatmap: true, encounters: true, protected: true, routes: true, diagnostics: true };
const names = { terrain: 'Terrain & region boundaries', heatmap: 'Danger heatmap', encounters: 'Encounters & bosses', protected: 'Protected zones & settlement', routes: 'Safe & dangerous routes', diagnostics: 'Generation diagnostics' };
const palette = [[83, 184, 180], [104, 172, 98], [196, 174, 70], [210, 116, 53], [214, 57, 91]];
let data = null, heatmap = null, camera = { scale: 1, x: 0, y: 0 }, width = 1, height = 1, requestId = 0, activeQuery = '', selected = null, probeTimer, probeAbort, probeId = 0, drag = null, pinned = false;
for (const [key, value] of Object.entries(layers)) {
  const label = document.createElement('label'), input = document.createElement('input'); label.className = 'check'; input.type = 'checkbox'; input.checked = value;
  input.addEventListener('change', () => { layers[key] = input.checked; draw(); }); label.append(input, names[key]); $('layers').append(label);
}
function color(score, alpha = 1) {
  const stops = [0, .2, .4, .65, .85, 1]; let i = 0; while (i < 3 && score > stops[i + 1]) i++;
  const t = Math.max(0, Math.min(1, (score - stops[i]) / (stops[i + 1] - stops[i]))), a = palette[i], b = palette[Math.min(4, i + 1)];
  return 'rgba(' + a.map((value, index) => Math.round(value * (1 - t) + b[index] * t)).join(',') + ',' + alpha + ')';
}
function fitView(w = width, h = height) { if (!data) return camera; const g = data.geometry, scale = Math.min((w - 80) / g.width, (h - 80) / g.height); return { scale, x: (w - g.width * scale) / 2, y: (h - g.height * scale) / 2 }; }
function line(ctx, points, view) { ctx.beginPath(); points.forEach((point, i) => { const x = view.x + point.x * view.scale, y = view.y + point.y * view.scale; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); }
function circle(ctx, point, radius, view) { ctx.beginPath(); ctx.arc(view.x + point.x * view.scale, view.y + point.y * view.scale, radius * view.scale, 0, Math.PI * 2); }
function render(ctx, w, h, view) {
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#090e10'; ctx.fillRect(0, 0, w, h); if (!data) return;
  const geometry = data.geometry, plan = data.plan, scale = view.scale, left = view.x, top = view.y;
  ctx.save(); ctx.beginPath(); ctx.rect(left, top, geometry.width * scale, geometry.height * scale); ctx.clip();
  if (layers.terrain) { const colors = { wildwood: '#2f4f2d', volcanic: '#4d2620', glacier: '#75848d', voidscar: '#2b1f3c', warfields: '#6b5f52', necropolis: '#281b1c' }; ctx.fillStyle = colors[data.descriptor.biome] || '#35453b'; ctx.fillRect(left, top, geometry.width * scale, geometry.height * scale); }
  if (layers.heatmap && heatmap) { ctx.globalAlpha = .72; ctx.imageSmoothingEnabled = true; ctx.drawImage(heatmap, left, top, geometry.width * scale, geometry.height * scale); ctx.globalAlpha = 1; }
  if (layers.terrain) {
    ctx.strokeStyle = '#a99b6e'; ctx.lineWidth = 1.5; ctx.strokeRect(left + geometry.margin * scale, top + geometry.margin * scale, (geometry.width - geometry.margin * 2) * scale, (geometry.height - geometry.margin * 2) * scale);
    if (geometry.shape === 'annulus') { ctx.fillStyle = '#090e10b0'; ctx.beginPath(); ctx.rect(left, top, geometry.width * scale, geometry.height * scale); ctx.arc(left + geometry.cx * scale, top + geometry.cy * scale, geometry.max * scale, 0, Math.PI * 2, true); ctx.fill('evenodd'); circle(ctx, { x: geometry.cx, y: geometry.cy }, geometry.max, view); ctx.stroke(); }
    if (geometry.min) { circle(ctx, { x: geometry.cx, y: geometry.cy }, geometry.min, view); ctx.setLineDash([4, 4]); ctx.strokeStyle = '#b8a47d88'; ctx.stroke(); ctx.setLineDash([]); }
    ctx.font = '10px system-ui'; ctx.fillStyle = '#c8c4ac88'; const step = 500;
    for (let x = 0; x <= geometry.width; x += step) { const screenX = left + x * scale; ctx.strokeStyle = '#b5c4a510'; ctx.beginPath(); ctx.moveTo(screenX, top); ctx.lineTo(screenX, top + geometry.height * scale); ctx.stroke(); if (scale * step > 35) ctx.fillText(String(x), screenX + 3, Math.max(12, top + 12)); }
    for (let y = 0; y <= geometry.height; y += step) { const screenY = top + y * scale; ctx.strokeStyle = '#b5c4a510'; ctx.beginPath(); ctx.moveTo(left, screenY); ctx.lineTo(left + geometry.width * scale, screenY); ctx.stroke(); if (scale * step > 35) ctx.fillText(String(y), Math.max(3, left + 3), screenY - 3); }
  }
  if (layers.routes && plan) for (const route of plan.paths) {
    line(ctx, route.points, view); ctx.strokeStyle = route.kind === 'safe' ? '#83d9bd77' : '#ffaf63bb'; ctx.lineWidth = route.kind === 'safe' ? Math.max(2, route.width * 2 * scale) : 2; ctx.setLineDash(route.kind === 'safe' ? [] : [7, 5]); ctx.stroke(); ctx.setLineDash([]);
    if (route.kind === 'safe') { line(ctx, route.points, view); ctx.lineWidth = 1; ctx.strokeStyle = '#c6ffe4'; ctx.stroke(); }
  }
  if (layers.protected && plan) {
    for (const area of plan.protectedAreas) { circle(ctx, area, area.radius, view); ctx.fillStyle = '#65e8cd1c'; ctx.fill(); ctx.strokeStyle = '#a3ecd9'; ctx.lineWidth = 1.5; ctx.stroke(); }
    circle(ctx, plan.settlement, 220, view); ctx.strokeStyle = '#fff4b166'; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
    const x = left + plan.settlement.x * scale, y = top + plan.settlement.y * scale; ctx.fillStyle = '#f4df9d'; ctx.fillRect(x - 4, y - 4, 8, 8); ctx.font = '11px Georgia'; ctx.fillText('Settlement / entry', x + 9, y - 10); ctx.fillText('◈ Portal', left + (plan.portal?.x || plan.settlement.x) * scale + 9, top + (plan.portal?.y || plan.settlement.y + 62) * scale + 12);
    if (plan.danger) for (const respite of plan.danger.respites) { circle(ctx, respite, respite.radius, view); ctx.strokeStyle = '#8cdbb955'; ctx.stroke(); }
  }
  if (layers.encounters && plan) for (const encounter of plan.encounters) {
    const x = left + encounter.x * scale, y = top + encounter.y * scale, radius = encounter.kind === 'boss' ? 7 : encounter.kind === 'alpha' ? 5 : 3;
    ctx.fillStyle = encounter.kind === 'boss' ? '#ff526b' : encounter.kind === 'alpha' ? '#ffb94f' : encounter.kind === 'stone' ? '#b6a4ff' : '#ece1aa';
    if (encounter.kind === 'boss' || encounter.kind === 'alpha') { ctx.beginPath(); ctx.moveTo(x, y - radius); ctx.lineTo(x + radius, y); ctx.lineTo(x, y + radius); ctx.lineTo(x - radius, y); ctx.closePath(); ctx.fill(); circle(ctx, encounter, encounter.radius, view); ctx.strokeStyle = '#ffac8555'; ctx.stroke(); }
    else if (encounter.kind === 'stone') ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    else { ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); }
  }
  if (layers.diagnostics && plan) {
    for (const error of data.validation.errors || []) {
      const id = error.slice(error.indexOf(':') + 1), encounter = plan.encounters.find(encounter => encounter.id === id) || plan.spawns.find(spawn => spawn.id === id) || data.validation.routes?.objectives.find(objective => objective.id === id);
      if (encounter) { circle(ctx, encounter, Math.max(encounter.radius || 100, 100), view); ctx.strokeStyle = '#ff3c51'; ctx.lineWidth = 4; ctx.stroke(); }
    }
    ctx.font = '11px system-ui'; ctx.fillStyle = data.validation.valid ? '#a8edbc' : data.validation.valid === false ? '#ff8c8c' : '#bdbaa5'; ctx.fillText(data.validation.valid === null ? 'Legacy encounter validation unavailable' : data.validation.valid ? '✓ Mandatory routes & encounter spacing validated' : '⚠ Generation validation failed', left + 12, top + geometry.height * scale - 15);
  }
  if (selected) { circle(ctx, selected, 12 / scale, view); ctx.strokeStyle = '#fff4c1'; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.restore();
}
function draw() { render(context, width, height, camera); }
function resize() { const bounds = $('viewport').getBoundingClientRect(), ratio = Math.min(2, window.devicePixelRatio || 1); width = bounds.width; height = bounds.height; canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); context.setTransform(ratio, 0, 0, ratio, 0, 0); if (data && camera.scale === 1) camera = fitView(); draw(); }
new ResizeObserver(resize).observe($('viewport'));
function buildHeatmap() {
  heatmap = null; if (!data.heatmap) return;
  const size = data.heatmap.resolution; heatmap = document.createElement('canvas'); heatmap.width = size; heatmap.height = size; const ctx = heatmap.getContext('2d');
  data.heatmap.values.forEach((score, index) => { ctx.fillStyle = color(score); ctx.fillRect(index % size, Math.floor(index / size), 1, 1); });
}
function metadata() {
  $('metadata').replaceChildren();
  const rows = { Seed: data.seed, Tier: data.tier, Biome: data.descriptor.biome || 'Founding lands', Layout: 'Generator v' + data.generatorVersion, Danger: data.dangerVersion ? data.plan.danger.profile + ' · v' + data.dangerVersion : 'Legacy / unmodeled', Levels: data.descriptor.levels.join('–'), Snapshot: data.snapshotId.slice(0, 16), Geometry: data.geometry.width + ' × ' + data.geometry.height };
  for (const [label, value] of Object.entries(rows)) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; $('metadata').append(dt, dd); }
  $('name').textContent = data.descriptor.name;
  $('badge').textContent = data.status.toUpperCase().replaceAll('-', ' '); $('badge').className = data.status.includes('preview') ? 'preview' : '';
  $('notes').textContent = data.notes.join(' ');
  const optional = data.plan?.failures.length || 0;
  $('validation').textContent = data.validation.valid === null ? data.validation.unsupported : (data.validation.valid ? 'PASS' : 'FAIL') + ' · ' + (data.plan?.spawns.length || 0) + ' planned enemies · ' + optional + ' optional placements omitted · ' + (data.plan?.routeRepairs?.length || 0) + ' route repairs';
  $('issues').replaceChildren(); for (const issue of [...(data.validation.errors || []), ...(data.plan?.failures || []).map(failure => 'Optional placement omitted: ' + failure.id)]) { const li = document.createElement('li'); li.textContent = issue; $('issues').append(li); }
}
async function fetchJson(url, options) { const response = await fetch(url, options), result = await response.json(); if (!response.ok) throw new Error(result.error || 'Atlas request failed'); return result; }
async function load() {
  const id = ++requestId; probeAbort?.abort(); clearTimeout(probeTimer); probeId++; $('status').textContent = 'Inspecting authoritative generation data…'; $('image').disabled = true; $('report').disabled = true;
  const query = new URLSearchParams({ tier: $('tier').value, mode: $('preview').checked ? 'preview' : 'persisted' }); if ($('preview').checked) query.set('seed', $('seed').value);
  try { const next = await fetchJson('/dev/atlas/api/region?' + query); if (id !== requestId) return; data = next; activeQuery = query.toString(); selected = null; pinned = false; buildHeatmap(); metadata(); camera = fitView(); draw(); $('image').disabled = false; $('report').disabled = false; $('status').textContent = data.status.includes('preview') ? 'Hypothetical preview. No unlock, spawn, history or persistence changes.' : 'Persisted region inspected. Unmaterialized plans are generated in memory only.'; }
  catch (error) { if (id === requestId) $('status').textContent = error.message; }
}
function point(event) { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left - camera.x) / camera.scale, y: (event.clientY - rect.top - camera.y) / camera.scale }; }
function nearby(position) { return data?.plan?.encounters.filter(encounter => Math.hypot(encounter.x - position.x, encounter.y - position.y) * camera.scale < 12).sort((a, b) => Math.hypot(a.x - position.x, a.y - position.y) - Math.hypot(b.x - position.x, b.y - position.y))[0]; }
async function probe(position, pin, event) {
  if (!data || position.x < 0 || position.y < 0 || position.x > data.geometry.width || position.y > data.geometry.height) return;
  probeAbort?.abort(); const controller = new AbortController(); probeAbort = controller; const id = ++probeId;
  try { const result = await fetchJson('/dev/atlas/api/probe?' + activeQuery + '&x=' + position.x + '&y=' + position.y, { signal: controller.signal }); if (id !== probeId) return;
    const encounter = nearby(position), lines = ['Local coordinates: ' + result.x.toFixed(1) + ', ' + result.y.toFixed(1), 'Danger: ' + (result.score === null ? 'unmodeled' : result.score.toFixed(3)) + ' · ' + result.category];
    if (encounter) { const members = data.plan.spawns.filter(spawn => spawn.encounterId === encounter.id); lines.push(encounter.kind.toUpperCase() + ' · ' + encounter.id, members.map(spawn => spawn.type + ' Lv ' + spawn.level).join(', ') || 'No enemy members'); }
    else if (result.encounters.length) lines.push('Nearby: ' + result.encounters.map(encounter => encounter.id).join(', '));
    if (pin || !pinned) { $('selection').replaceChildren(); const b = document.createElement('b'), p = document.createElement('p'); b.textContent = pin ? 'Pinned location' : 'Position & encounter inspector'; p.textContent = lines.join('\n'); $('selection').append(b, p); }
    if (pin) { selected = encounter || position; pinned = true; draw(); }
    else if (event) { const tooltip = $('tooltip'), bounds = $('viewport').getBoundingClientRect(); tooltip.textContent = lines.slice(0, 3).join('\n'); tooltip.hidden = false; tooltip.style.left = Math.max(5, Math.min(width - 245, event.clientX - bounds.left + 16)) + 'px'; tooltip.style.top = Math.max(5, Math.min(height - 85, event.clientY - bounds.top + 16)) + 'px'; }
  } catch (error) { if (error.name !== 'AbortError') $('status').textContent = error.message; }
}
canvas.addEventListener('pointerdown', event => { canvas.setPointerCapture(event.pointerId); drag = { x: event.clientX, y: event.clientY, cameraX: camera.x, cameraY: camera.y, moved: false }; $('tooltip').hidden = true; });
canvas.addEventListener('pointermove', event => {
  if (drag) { const dx = event.clientX - drag.x, dy = event.clientY - drag.y; if (Math.hypot(dx, dy) > 4) drag.moved = true; if (drag.moved) { camera.x = drag.cameraX + dx; camera.y = drag.cameraY + dy; draw(); } return; }
  clearTimeout(probeTimer); const position = point(event); probeTimer = setTimeout(() => probe(position, false, event), 140);
});
canvas.addEventListener('pointerup', event => { if (drag && !drag.moved) { clearTimeout(probeTimer); probe(point(event), true); } drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });
canvas.addEventListener('pointerleave', () => { clearTimeout(probeTimer); $('tooltip').hidden = true; });
canvas.addEventListener('wheel', event => { event.preventDefault(); if (!data) return; const position = point(event), next = Math.max(fitView().scale * .4, Math.min(3, camera.scale * Math.exp(-event.deltaY * .001))); camera.x += position.x * (camera.scale - next); camera.y += position.y * (camera.scale - next); camera.scale = next; draw(); }, { passive: false });
$('fit').onclick = () => { camera = fitView(); draw(); };
$('inspect').onclick = load;
$('preview').onchange = () => { $('seed').disabled = !$('preview').checked; };
$('regions').onchange = () => { $('tier').value = $('regions').value; $('preview').checked = false; $('seed').disabled = true; load(); };
$('report').onclick = () => { const anchor = document.createElement('a'); anchor.href = '/dev/atlas/api/report?' + activeQuery; anchor.download = 'shardlands-validation.json'; anchor.click(); };
$('image').onclick = () => {
  if (!data) return; const output = document.createElement('canvas'); output.width = 1600; output.height = 1660; const ctx = output.getContext('2d'); ctx.translate(0, 60); render(ctx, 1600, 1540, fitView(1600, 1540)); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#101716'; ctx.fillRect(0, 0, 1600, 60); ctx.fillRect(0, 1600, 1600, 60); ctx.fillStyle = '#ead6a4'; ctx.font = '24px Georgia'; ctx.fillText('SHARDLANDS · ' + data.descriptor.name + ' · Tier ' + data.tier, 24, 37); ctx.font = '14px system-ui'; ctx.fillStyle = '#bcb79f'; ctx.fillText(data.status + ' · Seed ' + data.seed + ' · v' + data.generatorVersion + ' · snapshot ' + data.snapshotId.slice(0, 16), 24, 1626); ctx.fillText('SAFE → LOW → NORMAL → HIGH → EXTREME · flat gameplay geometry · enabled layers', 24, 1649);
  output.toBlob(blob => { const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = 'shardlands-atlas-tier-' + data.tier + '.png'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
};
(async () => {
  try { let offset = 0, first; do { const result = await fetchJson('/dev/atlas/api/regions?offset=' + offset); first ||= result; for (const region of result.regions) { const option = document.createElement('option'); option.value = region.tier; option.textContent = 'WT ' + region.tier + ' · ' + region.name; $('regions').append(option); } offset = result.nextOffset; } while (offset !== null); $('seed').value = first.seed; $('tier').value = first.worldTier; $('tier').max = first.maxTier; $('regions').value = first.worldTier; await load(); }
  catch (error) { $('status').textContent = error.message; }
})();
