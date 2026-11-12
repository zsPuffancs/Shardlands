'use strict';
// Display-only bag tools. BAG remains the authoritative snapshot; every item action uses its UID.
let bagViewState = BagView.defaults(), bagControlKey = '', bagMenuUid = null, bagMenuFocus = null, destroyState = null, destroyReturnFocus = null;
try { const sort = localStorage.getItem('sl_bag_sort'); if (BagView.SORTS.includes(sort)) bagViewState.sort = sort; } catch {}
const BAG_SORT_LABELS = { original: ['inventory.sortOriginal', 'Original bag order'], 'rarity-desc': ['inventory.sortRarityDesc', 'Rarity: highest first'], 'rarity-asc': ['inventory.sortRarityAsc', 'Rarity: lowest first'], 'level-desc': ['inventory.sortLevelDesc', 'Item level: highest first'], 'level-asc': ['inventory.sortLevelAsc', 'Item level: lowest first'], slot: ['inventory.sortSlot', 'Equipment type'], 'name-asc': ['inventory.sortNameAsc', 'Name: A to Z'], 'name-desc': ['inventory.sortNameDesc', 'Name: Z to A'] };
function bagLabels() {
  return { locale: document.documentElement.lang, slots: I.slots, itemName: item => gearName(item.name), rarityNames: I.rarity.map((name, index) => text('rarity.' + index, name)), slotNames: Object.fromEntries(I.slots.map(slot => [slot, text('slot.' + slot, SLOTNAME[slot] || slot)])), typeNames: Object.fromEntries(['sword', 'bow', 'staff'].map(type => [type, text('weapon.' + type, type)])), affixes: Object.fromEntries(Object.entries(I.affixes || {}).map(([key, value]) => [key, { name: text('affix.' + key, value.n), prefix: text('affix.' + key + '.prefix', value.prefix) }])), statNames: Object.fromEntries(Object.entries(I.stat || {}).map(([key, value]) => [key, text('stat.' + key, value.n)])) };
}
function ensureBagControls(force = false) {
  if (!I) return;
  const key = JSON.stringify([I.slots, I.rarity, document.documentElement.lang]); if (!force && bagControlKey === key) return; bagControlKey = key;
  const labels = bagLabels(), option = (value, label) => '<option value="' + esc(value) + '">' + esc(label) + '</option>';
  $('bag-sort').innerHTML = BagView.SORTS.map(sort => option(sort, text(...BAG_SORT_LABELS[sort]))).join(''); $('bag-sort').value = bagViewState.sort;
  const checks = (values, kind, selected) => values.map(([value, label]) => '<label><input type="checkbox" data-bag-filter="' + kind + '" value="' + esc(value) + '"' + (selected.includes(value) ? ' checked' : '') + '>' + esc(label) + '</label>').join('');
  $('bag-filter-controls').innerHTML = '<fieldset><legend>' + esc(text('inventory.filterRarity', 'Rarity (any selected)')) + '</legend><div class="bag-checks">' + checks(labels.rarityNames.map((name, index) => [index, name]), 'rarities', bagViewState.rarities) + '</div></fieldset><fieldset><legend>' + esc(text('inventory.filterType', 'Equipment type (any selected)')) + '</legend><div class="bag-checks">' + checks(I.slots.map(slot => [slot, labels.slotNames[slot]]), 'slots', bagViewState.slots) + '</div></fieldset><div class="bag-level-range"><label>' + esc(text('inventory.minimumLevel', 'Minimum item level')) + '<input type="number" min="1" step="1" inputmode="numeric" data-bag-filter="minLevel" value="' + esc(bagViewState.minLevel) + '"></label><label>' + esc(text('inventory.maximumLevel', 'Maximum item level')) + '<input type="number" min="1" step="1" inputmode="numeric" data-bag-filter="maxLevel" value="' + esc(bagViewState.maxLevel) + '"></label></div><label for="bag-status">' + esc(text('inventory.filterStatus', 'Item status')) + '</label><select id="bag-status" data-bag-filter="status">' + [['all', 'inventory.statusAll', 'All'], ['locked', 'inventory.statusLocked', 'Locked'], ['unlocked', 'inventory.statusUnlocked', 'Unlocked'], ['upgraded', 'inventory.statusUpgraded', 'Upgraded (+1 or higher)'], ['affixed', 'inventory.statusAffixed', 'Has affixes']].map(([value, key, label]) => option(value, text(key, label))).join('') + '</select>';
  $('bag-status').value = bagViewState.status; $('bag-search').value = bagViewState.query;
}
const originalRenderBagPage = renderBagPage;
renderBagPage = function () {
  if (!I || !me) return;
  ensureBagControls();
  const consumables = bagPage === 'cons'; $('bag-tools').hidden = consumables;
  if (consumables) { originalRenderBagPage(); return; }
  const result = BagView.page(BAG, bagViewState, bagLabels(), { index: bagPage, size: I.bagPageSize || 30, capacity: I.bagMax }); bagPage = result.page;
  const pageBar = $('bag-pages');
  pageBar.innerHTML = Array.from({ length: result.pageCount }, (_, index) => '<button type="button" data-bag-page="' + index + '" aria-controls="bag" aria-pressed="' + (index === bagPage) + '" class="' + (index === bagPage ? 'on' : '') + '" aria-label="' + esc(text('inventory.bagPage', 'Bag page {page}', { page: index + 1 })) + '">' + (index + 1) + '</button>').join('') + '<button type="button" data-bag-page="cons" class="constab" aria-controls="bag" aria-pressed="false">' + esc(text('inventory.consumablesTab', '🧪 Consumables')) + '</button>';
  $('bag').classList.remove('consview');
  const cells = result.visible.map(item => slotHtml(item, 'tabindex="0" role="button" aria-label="' + esc(gearName(item.name)) + '" data-tip="bag:' + esc(item.uid) + '" data-bag="' + esc(item.uid) + '"', mergeSel.includes(item.uid) ? ' sel' : '').replace(/<\/div>$/, '<button type="button" class="bag-item-actions" data-item-actions="' + esc(item.uid) + '" aria-label="' + esc(text('inventory.itemActions', 'Item actions: {item}', { item: gearName(item.name) })) + '" title="' + esc(text('inventory.itemActions', 'Item actions: {item}', { item: gearName(item.name) })) + '">⋯</button></div>'));
  if (result.active && !result.visible.length) cells.push('<div class="bag-empty-message">' + esc(text(result.errors.length ? 'inventory.invalidLevelRange' : 'inventory.noMatches', result.errors.length ? 'Enter valid whole item levels; minimum must not exceed maximum.' : 'No matching items.')) + '</div>');
  else while (cells.length < result.pageSize) cells.push('<div class="slot empty"></div>');
  $('bag').innerHTML = cells.join('');
  $('bag-matches').textContent = result.errors.length ? text('inventory.invalidLevelRange', 'Enter valid whole item levels; minimum must not exceed maximum.') : text('inventory.showingMatches', 'Showing {count} of {total} items', { count: result.items.length, total: BAG.length });
  $('bag-matches').classList.toggle('invalid', !!result.errors.length);
  const count = Number(!!bagViewState.query.trim()) + Number(!!bagViewState.rarities.length) + Number(!!bagViewState.slots.length) + Number(bagViewState.minLevel !== '' || bagViewState.maxLevel !== '') + Number(bagViewState.status !== 'all'); $('bag-filter-count').textContent = count ? '(' + count + ')' : '';
  tip.style.display = 'none'; tipEl = null;
};
function refreshBagView() { if (bagPage !== 'cons') bagPage = 0; renderBagPage(); }
$('bag-search').addEventListener('input', event => { bagViewState.query = event.target.value; refreshBagView(); });
$('bag-clear').onclick = () => { bagViewState.query = ''; $('bag-search').value = ''; refreshBagView(); $('bag-search').focus(); };
$('bag-sort').onchange = event => { bagViewState.sort = event.target.value; try { localStorage.setItem('sl_bag_sort', bagViewState.sort); } catch {} refreshBagView(); };
$('bag-reset').onclick = () => { bagViewState = BagView.defaults(); try { localStorage.setItem('sl_bag_sort', 'original'); } catch {} ensureBagControls(true); refreshBagView(); };
function changeBagFilter(event) {
  const input = event.target, key = input.dataset.bagFilter; if (!key) return;
  if (input.type === 'checkbox') { const value = key === 'rarities' ? Number(input.value) : input.value; bagViewState[key] = input.checked ? [...new Set([...bagViewState[key], value])] : bagViewState[key].filter(entry => entry !== value); }
  else bagViewState[key] = input.validity?.badInput ? 'invalid' : input.value;
  refreshBagView();
}
$('bag-filter-controls').addEventListener('change', changeBagFilter);
$('bag-filter-controls').addEventListener('input', event => { if (event.target.type === 'number') changeBagFilter(event); });
$('bag-filter-panel').addEventListener('toggle', () => { if (typeof fitWindow === 'function') fitWindow($('invp')); });
function closeBagMenu(restore = false) { bagMenuUid = null; $('bag-item-menu').hidden = true; if (restore && bagMenuFocus?.isConnected) bagMenuFocus.focus(); bagMenuFocus = null; }
function openBagMenu(uid, x, y) {
  const item = BAG.find(item => item.uid === uid); if (!item) return;
  bagMenuUid = uid; bagMenuFocus = document.activeElement; tip.style.display = 'none'; const menu = $('bag-item-menu'); menu.hidden = false;
  const reserved = TRADE?.mine?.uids?.includes(uid); $('bag-destroy-action').disabled = !!item.lk || !!reserved;
  $('bag-destroy-action').title = item.lk || reserved ? text('inventory.destroyProtected', 'This item is equipped, locked or reserved by another operation.') : '';
  menu.style.left = Math.max(6, Math.min(x, innerWidth - menu.offsetWidth - 6)) + 'px'; menu.style.top = Math.max(6, Math.min(y, innerHeight - menu.offsetHeight - 6)) + 'px'; $('bag-menu-close').focus();
}
const destroyDialog = $('bag-destroy-dialog');
function closeDestroyDialog() { if (destroyDialog.open) destroyDialog.close(); destroyState = null; if (destroyReturnFocus?.isConnected) destroyReturnFocus.focus(); destroyReturnFocus = null; }
function destroyPhrase() { return text('inventory.destroyPhrase', 'DESTROY'); }
function updateDestroyButton() { $('bag-destroy-confirm').disabled = !destroyState?.token || !!destroyState.pending || !!destroyState.deliberate && (!$('bag-destroy-check').checked || $('bag-destroy-phrase').value !== destroyPhrase()); }
function requestDestroy(uid) {
  if (!BAG.some(item => item.uid === uid)) return;
  closeBagMenu(true); destroyReturnFocus = document.activeElement; destroyState = { uid, signature: JSON.stringify(BAG.find(item => item.uid === uid)) };
  send({ t: 'prepareDestroy', uid });
}
function onDestroyMessage(message) {
  if (message.t === 'destroyResult') { if (destroyState?.uid === message.uid) closeDestroyDialog(); if (message.text || message.m) toast(message.text || message.m, message.ok ? '#b8d99a' : '#ffab8e'); return; }
  if (!destroyState || destroyState.uid !== message.uid || !message.item || !BAG.some(item => item.uid === message.uid)) return;
  destroyState = { ...destroyState, token: message.token, deliberate: !!message.deliberate };
  const item = message.item;
  $('bag-destroy-item').textContent = text('inventory.destroyDetails', '{item} · {rarity} · iLvl {level} · +{upgrade}', { item: gearName(item.name), rarity: text('rarity.' + item.rar, I.rarity[item.rar]), level: item.ilvl, upgrade: item.plus || 0 });
  $('bag-destroy-extra').hidden = !message.deliberate; $('bag-destroy-check').checked = false; $('bag-destroy-phrase').value = '';
  $('bag-destroy-phrase-label').textContent = text('inventory.destroyTypePhrase', 'Type {phrase} to confirm:', { phrase: destroyPhrase() });
  updateDestroyButton(); keys = {}; held = false; tip.style.display = 'none'; destroyDialog.showModal();
}
$('bag-destroy-confirm').onclick = () => { updateDestroyButton(); if ($('bag-destroy-confirm').disabled || !destroyState) return; const current = BAG.find(item => item.uid === destroyState.uid); if (!current || current.lk) return closeDestroyDialog(); destroyState.pending = true; send({ t: 'destroy', uid: destroyState.uid, token: destroyState.token, deliberate: destroyState.deliberate ? true : false }); updateDestroyButton(); };
$('bag-destroy-check').onchange = updateDestroyButton; $('bag-destroy-phrase').oninput = updateDestroyButton;
destroyDialog.addEventListener('close', () => { destroyState = null; if (destroyReturnFocus?.isConnected) destroyReturnFocus.focus(); destroyReturnFocus = null; });
$('bag-destroy-action').onclick = () => { if (bagMenuUid) requestDestroy(bagMenuUid); };
$('bag-menu-close').onclick = () => closeBagMenu(true);
document.addEventListener('click', event => {
  const action = event.target.closest?.('[data-item-actions]');
  if (action) { event.preventDefault(); event.stopImmediatePropagation(); action.focus(); const bounds = action.getBoundingClientRect(); openBagMenu(action.dataset.itemActions, bounds.right, bounds.bottom); return; }
  if (!$('bag-item-menu').contains(event.target)) closeBagMenu();
}, true);
document.addEventListener('contextmenu', event => {
  const slot = event.target.closest?.('[data-bag]'); if (!slot || isOpen('shopw')) return;
  event.preventDefault(); event.stopImmediatePropagation(); slot.focus(); const bounds = slot.getBoundingClientRect(); openBagMenu(slot.dataset.bag, event.clientX || bounds.right, event.clientY || bounds.bottom);
}, true);
addEventListener('keydown', event => {
  if (destroyDialog.open) { event.stopImmediatePropagation(); return; }
  if (!$('bag-item-menu').hidden) { if (event.key === 'Escape') { event.preventDefault(); closeBagMenu(true); } event.stopImmediatePropagation(); return; }
  if (event.target.closest?.('#bag-tools')) {
    keys = {}; held = false;
    // Sorting leaves focus on the control; Shift must still reach the tooltip listeners.
    if (event.key === 'Shift') return;
    if (event.key === 'Escape') { event.preventDefault(); event.target.blur(); }
    event.stopImmediatePropagation(); return;
  }
  const slot = event.target.closest?.('#bag [data-bag]'); if (!slot) return;
  if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') { event.preventDefault(); event.stopImmediatePropagation(); const bounds = slot.getBoundingClientRect(); openBagMenu(slot.dataset.bag, bounds.right, bounds.bottom); }
  else if (event.key === 'Enter' || event.key === ' ') { event.stopImmediatePropagation(); if (!event.target.closest('button')) { event.preventDefault(); slot.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey })); } }
}, true);
const originalOnInv = onInv;
onInv = function (message) {
  if (destroyState) { const item = message.bag.find(item => item.uid === destroyState.uid); if (!item || JSON.stringify(item) !== destroyState.signature) closeDestroyDialog(); }
  if (bagMenuUid && !message.bag.some(item => item.uid === bagMenuUid)) closeBagMenu();
  const uids = new Set(message.bag.map(item => item.uid));
  mergeSel = mergeSel.filter(uid => uids.has(uid)); mmSel = mmSel.filter(uid => uids.has(uid));
  const exists = uid => message.bag.some(item => item.uid === uid) || Object.values(message.eq).some(item => item?.uid === uid);
  if (mySel && !exists(mySel)) mySel = null; if (afSel && !exists(afSel)) afSel = null; if (smSel && !Object.values(message.eq).some(item => item?.uid === smSel)) smSel = null;
  tip.style.display = 'none'; tipEl = null; originalOnInv(message);
};
document.addEventListener('game-language-change', () => { ensureBagControls(true); if (I && me && isOpen('invp')) renderBagPage(); closeBagMenu(); if (destroyDialog.open) closeDestroyDialog(); });
