'use strict';
// Presentation and local navigation preferences only. Every destination and travel is server-validated.
window.PortalUI = (() => {
  const PAGE_SIZE = 12, FAVORITE_LIMIT = 256, RECENT_LIMIT = 20, SEARCH_DELAY_MS = 350;
  const BIOMES = { volcanic: 'Volcanic', glacier: 'Glacier', voidscar: 'Voidscar', wildwood: 'Wildwood', warfields: 'Warfields', necropolis: 'Necropolis' };
  let scopeKey = '', favorites = [], recent = [], lastWorld = null, lastTier = null, response = null, selected = null;
  let mode = 'all', query = '', tierFilter, page = 1, sequence = 0, listRequest = 0, travelRequest = 0;
  let loading = false, travelling = false, travelTarget = null, searchTimer, listTimer, travelTimer, notice = '', mounted = false;
  const root = $('portalb'), visible = () => isOpen('portalw');
  const validIndex = value => Number.isSafeInteger(value) && value >= 0 && value <= 65535;
  const clean = (values, cap) => Array.isArray(values) ? [...new Set(values.slice(0, cap).filter(validIndex))] : [];
  const name = row => row.founding ? text('portal.founding', 'The Founding Lands') : row.name;
  const tierLabel = row => row.founding ? text('portal.foundingTiers', 'World Tiers 1–7') : text('portal.arrivedTier', 'World Tier {tier}', { tier: row.tier });
  const statusText = key => ({
    loading: text('portal.loading', 'Reading the world chronicle…'),
    offline: text('portal.offline', 'Connection unavailable. Reconnect and refresh the portal.'),
    timeout: text('portal.timeout', 'The portal did not answer. Refresh to try again.'),
    invalidRequest: text('portal.invalidRequest', 'That portal request is invalid. Adjust the search and try again.'),
    invalidTier: text('portal.invalidTier', 'Enter a whole World Tier of at least 1.'),
    travelFailed: text('portal.travelFailed', 'Travel could not be completed. Check your location and try again.'),
    favoriteLimit: text('portal.favoriteLimit', 'You can save up to {count} favorite destinations.', { count: FAVORITE_LIMIT }),
  })[key] || '';
  function savePreferences() {
    try { localStorage.setItem(scopeKey, JSON.stringify({ version: 1, favorites, recent })); } catch {}
  }
  function ensurePreferences() {
    if (!I || !WORLD?.universe) return;
    const universe = WORLD.universe;
    const key = 'sl_portal_v2:' + JSON.stringify([location.origin, String(I.name || '').toLowerCase(), universe.name, universe.seedNumber, universe.foundedAt]);
    if (scopeKey === key) return;
    scopeKey = key; favorites = []; recent = []; lastWorld = null; lastTier = null; response = null; selected = null;
    mode = 'all'; query = ''; tierFilter = undefined; page = 1;
    clearTimeout(searchTimer); clearTimeout(listTimer); clearTimeout(travelTimer);
    listRequest = ++sequence; travelRequest = 0; loading = false; travelling = false; travelTarget = null; notice = ''; mounted = false;
    try { const prefs = JSON.parse(localStorage.getItem(key) || '{}'); if (prefs.version === 1) { favorites = clean(prefs.favorites, FAVORITE_LIMIT); recent = clean(prefs.recent, RECENT_LIMIT); } } catch {}
  }
  function remember(index) {
    if (!validIndex(index) || !scopeKey) return;
    recent = [index, ...recent.filter(value => value !== index)].slice(0, RECENT_LIMIT); savePreferences();
  }
  function mount() {
    if (mounted) return; mounted = true;
    root.innerHTML = '<header class="portal-summary"><div><span class="portal-eyebrow">' + esc(text('portal.currentLocation', 'Current location')) + '</span><h3 id="portal-current-name"></h3><span id="portal-current-tier"></span></div><div class="portal-totals" id="portal-total"></div></header>' +
      '<div class="portal-controls"><label class="portal-search"><span>' + esc(text('portal.search', 'Search the realms')) + '</span><input id="portal-search" type="search" maxlength="80" autocomplete="off" placeholder="' + esc(text('portal.searchHint', 'Tier, region name or biome')) + '"></label>' +
      '<form id="portal-jump" class="portal-jump" novalidate><label for="portal-tier">' + esc(text('portal.jumpLabel', 'World Tier')) + '</label><div><input id="portal-tier" type="number" min="1" step="1" inputmode="numeric" aria-label="' + esc(text('portal.jumpLabel', 'World Tier')) + '"><button type="submit">' + esc(text('portal.jump', 'Find tier')) + '</button></div></form></div>' +
      '<nav class="portal-tabs" aria-label="' + esc(text('portal.navigation', 'Destination collections')) + '">' + [['all', text('portal.all', 'All destinations')], ['recent', text('portal.recent', 'Recently visited')], ['favorites', text('portal.favorites', 'Favorites')]].map(([key, label]) => '<button type="button" data-portal-mode="' + key + '" aria-pressed="false">' + esc(label) + '</button>').join('') + '<button type="button" id="portal-founding">' + esc(text('portal.founding', 'The Founding Lands')) + '</button></nav>' +
      '<p id="portal-status" class="portal-status" role="status" aria-live="polite"></p><div id="portal-results" class="portal-results" tabindex="-1" aria-label="' + esc(text('portal.destinations', 'Unlocked destinations')) + '"></div>' +
      '<nav class="portal-pages" aria-label="' + esc(text('portal.pagination', 'Destination pages')) + '"><button type="button" id="portal-prev">' + esc(text('portal.previous', 'Previous')) + '</button><span id="portal-page"></span><button type="button" id="portal-next">' + esc(text('portal.next', 'Next')) + '</button><button type="button" id="portal-refresh">' + esc(text('portal.refresh', 'Refresh')) + '</button></nav>' +
      '<footer class="portal-travel"><div id="portal-selected"></div><button type="button" class="pri" id="portal-travel">' + esc(text('portal.travel', 'Travel')) + '</button></footer>';
    $('portal-search').value = query; $('portal-tier').value = tierFilter ?? '';
    $('portal-search').addEventListener('input', event => {
      query = event.target.value; tierFilter = undefined; $('portal-tier').value = ''; page = 1;
      invalidate(); searchTimer = setTimeout(request, SEARCH_DELAY_MS);
    });
    $('portal-jump').addEventListener('submit', event => {
      event.preventDefault(); const value = $('portal-tier').value.trim();
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) { notice = 'invalidTier'; selected = null; renderStatus(); renderFooter(); return; }
      tierFilter = Number(value); query = ''; $('portal-search').value = ''; mode = 'all'; page = 1; request();
    });
    $('portal-prev').onclick = () => { if (page > 1 && !loading) { page--; request(); } };
    $('portal-next').onclick = () => { if (response && page < response.pages && !loading) { page++; request(); } };
    $('portal-refresh').onclick = () => request();
    $('portal-founding').onclick = () => { mode = 'all'; query = ''; tierFilter = 1; page = 1; $('portal-search').value = ''; $('portal-tier').value = '1'; request(); };
    $('portal-travel').onclick = travel;
    render();
  }
  function invalidate() {
    clearTimeout(searchTimer); clearTimeout(listTimer); listRequest = ++sequence;
    loading = true; notice = ''; selected = null;
    if (mounted) { renderStatus(); renderFooter(); $('portal-results').setAttribute('aria-busy', 'true'); }
  }
  function request() {
    ensurePreferences(); if (!visible()) return; mount(); invalidate();
    if (!ws || ws.readyState !== 1) { loading = false; response = null; notice = 'offline'; render(); return; }
    const requestId = listRequest;
    send({ t: 'portal', op: 'list', requestId, page, limit: PAGE_SIZE, query: query.trim(), scope: mode,
      ...(tierFilter === undefined ? {} : { tier: tierFilter }), ...(mode === 'all' ? {} : { indices: mode === 'recent' ? recent : favorites }) });
    listTimer = setTimeout(() => { if (listRequest === requestId) { listRequest = ++sequence; loading = false; notice = 'timeout'; response = null; render(); } }, 10000);
    render();
  }
  function renderStatus() {
    if (!mounted) return;
    $('portal-status').textContent = loading ? statusText('loading') : statusText(notice);
    $('portal-prev').disabled = loading || travelling || page <= 1;
    $('portal-next').disabled = loading || travelling || !response || page >= response.pages;
    $('portal-refresh').disabled = loading || travelling;
    for (const button of root.querySelectorAll('[data-portal-mode]')) button.setAttribute('aria-pressed', String(button.dataset.portalMode === mode));
  }
  function renderFooter() {
    if (!mounted) return;
    $('portal-selected').textContent = selected ? name(selected) + ' · ' + tierLabel(selected) : text('portal.selectDestination', 'Choose a destination to open the way.');
    const here = selected && selected.index === response?.here;
    $('portal-travel').textContent = travelling ? text('portal.travelling', 'Opening the way…') : here ? text('portal.here', 'You are here') : text('portal.travel', 'Travel');
    $('portal-travel').disabled = loading || travelling || !selected || here || selected.index === WORLD?.map;
  }
  function render() {
    if (!mounted) return;
    const focused = document.activeElement?.closest?.('[data-portal-select], [data-portal-favorite]');
    const focusAttribute = focused?.hasAttribute('data-portal-favorite') ? 'data-portal-favorite' : 'data-portal-select';
    const focusIndex = focused?.getAttribute(focusAttribute);
    const current = response?.current;
    $('portal-current-name').textContent = current ? name(current) : WORLD?.map ? zoneName(WORLD.tiers[0]?.name || '') : text('portal.founding', 'The Founding Lands');
    $('portal-current-tier').textContent = current ? tierLabel(current) : WORLD?.map ? text('portal.arrivedTier', 'World Tier {tier}', { tier: WORLD.map + 7 }) : text('portal.foundingTiers', 'World Tiers 1–7');
    $('portal-total').textContent = response ? text('portal.destinationCount', '{count} unlocked destinations', { count: GameText.number(response.unlockedTotal) }) + ' · ' + text('portal.frontierTier', 'Frontier: Tier {tier}', { tier: response.tier }) : '';
    $('portal-results').setAttribute('aria-busy', String(loading));
    const rows = response?.maps || [];
    $('portal-results').innerHTML = rows.length ? rows.map(row => {
      const here = row.index === response.here, favorite = favorites.includes(row.index), picked = selected?.index === row.index;
      const favoriteLabel = favorite ? text('portal.removeFavorite', 'Remove {name} from favorites', { name: name(row) }) : text('portal.addFavorite', 'Add {name} to favorites', { name: name(row) });
      return '<article class="portal-card' + (row.founding ? ' founding' : '') + (here ? ' here' : '') + (picked ? ' selected' : '') + '"><button type="button" class="portal-select" data-portal-select="' + row.index + '" aria-pressed="' + picked + '"' + (loading || travelling ? ' disabled' : '') + '>' +
        '<span class="portal-card-tier">' + esc(tierLabel(row)) + '</span><span class="portal-card-name">' + esc(name(row)) + '</span><span class="portal-card-meta">' + esc(row.founding ? text('portal.foundingHome', 'The first seven lands · ancestral sanctuary') : text('biome.' + row.biome, BIOMES[row.biome] || row.biome)) + '</span>' +
        '<span class="portal-card-levels">' + esc(text('portal.recommendedLevels', 'Recommended levels {min}–{max}', { min: row.levels[0], max: row.levels[1] })) + '</span>' +
        (row.founding ? '' : '<span class="portal-card-boss' + (row.defeated ? ' defeated' : '') + '">' + esc(text('portal.bossStatus', 'World Boss {boss}: {status}', { boss: row.boss, status: row.defeated ? text('portal.defeated', 'defeated') : text('portal.undefeated', 'undefeated') })) + '</span>') +
        '<span class="portal-card-bottom"><span>' + esc(text('portal.heroes', 'Heroes there now: {count}', { count: row.players })) + '</span>' + (here ? '<strong>' + esc(text('portal.here', 'You are here')) + '</strong>' : '') + '</span></button>' +
        '<button type="button" class="portal-favorite" data-portal-favorite="' + row.index + '" aria-pressed="' + favorite + '" aria-label="' + esc(favoriteLabel) + '" title="' + esc(favoriteLabel) + '"' + (loading || travelling ? ' disabled' : '') + '>' + (favorite ? '★' : '☆') + '</button></article>';
    }).join('') : '<div class="portal-empty">' + esc(loading ? text('portal.loading', 'Reading the world chronicle…') : notice ? statusText(notice) : mode === 'favorites' ? text('portal.noFavorites', 'No unlocked favorites match. Mark a realm with its star.') : mode === 'recent' ? text('portal.noRecent', 'No visited destinations match this search.') : text('portal.noMatches', 'No unlocked destination matches. Try another tier, region or biome.')) + '</div>';
    $('portal-page').textContent = response ? text('portal.pageInfo', 'Page {page}/{pages} · {count} found', { page: response.page, pages: response.pages, count: GameText.number(response.total) }) : '';
    renderStatus(); renderFooter();
    if (focusIndex !== undefined && focusIndex !== null) {
      const target = root.querySelector('[' + focusAttribute + '="' + focusIndex + '"]');
      (target && !target.disabled ? target : $('portal-results')).focus({ preventScroll: true });
    }
  }
  function travel() {
    if (!selected || loading || travelling || selected.index === WORLD?.map || selected.index === response?.here) return;
    if (!ws || ws.readyState !== 1) { notice = 'offline'; renderStatus(); return; }
    travelling = true; travelTarget = selected.index; notice = ''; travelRequest = ++sequence;
    send({ t: 'travel', map: selected.index, requestId: travelRequest });
    const requestId = travelRequest;
    travelTimer = setTimeout(() => { if (requestId === travelRequest) { travelRequest = 0; travelling = false; travelTarget = null; notice = 'timeout'; render(); } }, 10000);
    render();
  }
  root.addEventListener('click', event => {
    const tab = event.target.closest('[data-portal-mode]');
    if (tab) { mode = tab.dataset.portalMode; tierFilter = undefined; $('portal-tier').value = ''; page = 1; request(); return; }
    const star = event.target.closest('[data-portal-favorite]');
    if (star && !loading && !travelling) {
      const index = Number(star.dataset.portalFavorite); if (!response?.maps.some(row => row.index === index)) return;
      if (favorites.includes(index)) favorites = favorites.filter(value => value !== index);
      else if (favorites.length < FAVORITE_LIMIT) favorites.push(index);
      else { notice = 'favoriteLimit'; renderStatus(); return; }
      savePreferences(); if (mode === 'favorites') request(); else render(); return;
    }
    const card = event.target.closest('[data-portal-select]');
    if (card && !loading && !travelling) { selected = response?.maps.find(row => row.index === Number(card.dataset.portalSelect)) || null; render(); }
  });
  // Form and navigation keys must never trigger movement, skills, inventory or chat behind this window.
  addEventListener('keydown', event => {
    if (!visible() || !event.target.closest?.('#portalb')) return;
    keys = {}; held = false;
    if (event.key === 'Shift') return;
    if (event.key === 'Escape') { event.preventDefault(); closeWin('portalw'); }
    event.stopImmediatePropagation();
  }, true);
  function open() { ensurePreferences(); mount(); worldChanged(WORLD, false); request(); }
  function close() { clearTimeout(searchTimer); clearTimeout(listTimer); listRequest = ++sequence; loading = false; selected = null; }
  function receive(message) {
    if (message.op === 'travel') {
      if (message.requestId !== travelRequest || !travelling) return;
      clearTimeout(travelTimer); travelRequest = 0; travelling = false; travelTarget = null;
      if (message.ok && validIndex(message.map)) { remember(message.map); closeWin('portalw'); }
      else { notice = 'travelFailed'; render(); }
      return;
    }
    if (!visible() || message.requestId !== listRequest) return;
    clearTimeout(listTimer); loading = false;
    if (message.error) { response = null; selected = null; notice = 'invalidRequest'; render(); return; }
    response = message; page = message.page; notice = ''; selected = null; render();
  }
  function worldChanged(world, refresh = true) {
    ensurePreferences(); if (!world || !I) return;
    const changed = lastWorld !== world.map;
    if (changed) { lastWorld = world.map; remember(world.map); response = null; selected = null; }
    if (travelling && changed && world.map === travelTarget) {
      clearTimeout(travelTimer); travelRequest = 0; travelling = false; travelTarget = null; closeWin('portalw');
    }
    const tierChanged = lastTier !== world.universe?.tier; lastTier = world.universe?.tier;
    if (refresh && visible() && (changed || tierChanged)) request();
  }
  document.addEventListener('game-language-change', () => { if (visible()) { mounted = false; mount(); render(); } });
  return { open, close, receive, worldChanged };
})();
