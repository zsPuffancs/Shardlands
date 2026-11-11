'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const BagView = require('../public/bag-view');
function uiFixture() {
  const nodes = new Map(), documentEvents = new Map(), windowEvents = new Map(), sent = [], toasts = [], storage = new Map();
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const handlers = new Map(), classes = new Set();
    const value = { id, value: '', checked: false, hidden: false, disabled: false, open: false, isConnected: true, innerHTML: '', textContent: '', style: {}, dataset: {}, offsetWidth: 160, offsetHeight: 70,
      classList: { add: key => classes.add(key), remove: key => classes.delete(key), toggle: (key, on) => on ? classes.add(key) : classes.delete(key), contains: key => classes.has(key) },
      addEventListener: (type, fn) => { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(fn); },
      emit(type, target = value) { for (const fn of handlers.get(type) || []) fn({ target }); },
      focus() { context.document.activeElement = value; }, blur() { context.document.activeElement = null; }, contains: other => other === value,
      getBoundingClientRect: () => ({ left: 20, right: 70, bottom: 90, top: 20 }),
      showModal() { value.open = true; }, close() { value.open = false; value.emit('close'); }, closest: () => null };
    nodes.set(id, value); return value;
  }
  const item = (uid, extra = {}) => ({ uid, name: 'Iron Sword ' + uid, slot: 'weapon', rar: 0, ilvl: 1, plus: 0, stats: {}, ...extra });
  const bag = Array.from({ length: 73 }, (_, i) => item('uid-' + i, { ilvl: i + 1, rar: i % 6 }));
  const context = { BagView, BAG: bag, EQ: {}, GS: {}, I: { bagMax: 90, bagPageSize: 30, slots: ['weapon', 'helm', 'armor', 'boots', 'ring', 'amulet'], rarity: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'], affixes: {}, stat: {} }, me: { inv: {} }, bagPage: 0, mergeSel: [], mmSel: [], mySel: null, smSel: null, afSel: null, TRADE: null, tipEl: null, keys: {}, held: false, innerWidth: 1200, innerHeight: 800,
    SLOTNAME: { weapon: 'Weapon' }, tip: node('tip'), document: { documentElement: { lang: 'en' }, activeElement: null, addEventListener: (type, fn) => { if (!documentEvents.has(type)) documentEvents.set(type, []); documentEvents.get(type).push(fn); } },
    $: node, text: (key, fallback, values = {}) => fallback.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '{' + key + '}'), gearName: name => name, esc: value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]),
    slotHtml: (item, attrs) => '<div class="slot" ' + attrs + '>' + item.name + '</div>',
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    send: message => sent.push(message), toast: (...args) => toasts.push(args), isOpen: id => id === 'invp', addEventListener: (type, fn) => { if (!windowEvents.has(type)) windowEvents.set(type, []); windowEvents.get(type).push(fn); },
    renderBagPage: () => { node('bag').innerHTML = 'CONSUMABLES'; }, onInv: message => { context.BAG = message.bag; context.EQ = message.eq; context.renderBagPage(); }, MouseEvent: function (type, options) { this.type = type; Object.assign(this, options); } };
  vm.createContext(context); vm.runInContext(fs.readFileSync(require.resolve('../public/inventory-qol'), 'utf8'), context);
  return { context, node, sent, toasts, storage, documentEvents, windowEvents, item, run: source => vm.runInContext(source, context) };
}

test('client renders all-page search/sort/pagination locally, keeps capacity and leaves consumables separate', () => {
  const ui = uiFixture(), { context, node, sent } = ui; context.renderBagPage();
  assert.ok(node('bag').innerHTML.includes('uid-0')); assert.ok(!node('bag').innerHTML.includes('data-bag="uid-72"'));
  node('bag-search').value = 'uid-72'; node('bag-search').emit('input'); assert.ok(node('bag').innerHTML.includes('data-bag="uid-72"')); assert.equal(node('bag-matches').textContent, 'Showing 1 of 73 items'); assert.equal(context.bagPage, 0);
  assert.ok(!node('bag-pages').innerHTML.includes('data-bag-page="1"')); assert.equal(context.BAG.length, 73); assert.equal(sent.length, 0);
  node('bag-clear').onclick(); node('bag-sort').onchange({ target: { value: 'level-desc' } }); assert.ok(node('bag').innerHTML.indexOf('uid-72') < node('bag').innerHTML.indexOf('uid-71')); assert.equal(context.BAG[0].uid, 'uid-0'); assert.equal(ui.storage.get('sl_bag_sort'), 'level-desc');
  context.bagPage = 2; context.renderBagPage(); assert.ok(node('bag').innerHTML.includes('data-bag="uid-0"'));
  context.bagPage = 'cons'; context.renderBagPage(); assert.equal(node('bag').innerHTML, 'CONSUMABLES'); assert.equal(node('bag-tools').hidden, true);
  context.bagPage = 0; node('bag-reset').onclick(); assert.equal(ui.storage.get('sl_bag_sort'), 'original'); assert.ok(node('bag').innerHTML.includes('data-bag="uid-0"')); assert.equal(sent.length, 0);
});

test('destroy UI confirms actual UID after sorting and requires deliberate rare-item input', () => {
  const ui = uiFixture(), { context, node, sent } = ui; context.renderBagPage(); node('bag-sort').onchange({ target: { value: 'level-desc' } });
  ui.run("requestDestroy('uid-71')"); assert.equal(sent.at(-1).t, 'prepareDestroy'); assert.equal(sent.at(-1).uid, 'uid-71');
  context.onDestroyMessage({ t: 'destroyPreview', uid: 'uid-71', token: 'server-token', item: context.BAG[71], deliberate: true });
  assert.equal(node('bag-destroy-dialog').open, true); assert.equal(node('bag-destroy-confirm').disabled, true); assert.ok(node('bag-destroy-item').textContent.includes('Mythic'));
  node('bag-destroy-check').checked = true; node('bag-destroy-check').onchange(); assert.equal(node('bag-destroy-confirm').disabled, true);
  node('bag-destroy-phrase').value = 'DESTROY'; node('bag-destroy-phrase').oninput(); assert.equal(node('bag-destroy-confirm').disabled, false);
  node('bag-destroy-confirm').onclick(); assert.equal(sent.at(-1).t, 'destroy'); assert.equal(sent.at(-1).uid, 'uid-71'); assert.equal(sent.at(-1).token, 'server-token'); assert.equal(sent.at(-1).deliberate, true);
  context.onInv({ bag: context.BAG.filter(item => item.uid !== 'uid-71'), eq: {} }); assert.equal(node('bag-destroy-dialog').open, false);
  context.onDestroyMessage({ t: 'destroyResult', uid: 'uid-71', ok: true, m: 'Destroyed' }); assert.equal(ui.toasts.at(-1)[0], 'Destroyed');
});

test('inventory synchronization clears stale selections, tooltip and pending destruction references', () => {
  const ui = uiFixture(), { context, node } = ui;
  context.mergeSel = ['uid-0', 'uid-1']; context.mmSel = ['uid-1']; context.mySel = 'uid-1'; context.afSel = 'uid-1'; context.smSel = 'uid-1'; context.tip.style.display = 'block';
  ui.run("requestDestroy('uid-1')"); context.onDestroyMessage({ t: 'destroyPreview', uid: 'uid-1', token: 'token', item: context.BAG[1], deliberate: false });
  context.onInv({ bag: [context.BAG[0]], eq: {} });
  assert.equal(context.mergeSel.join(','), 'uid-0'); assert.equal(context.mmSel.length, 0); assert.equal(context.mySel, null); assert.equal(context.afSel, null); assert.equal(context.smSel, null); assert.equal(context.tip.style.display, 'none'); assert.equal(context.tipEl, null); assert.equal(node('bag-destroy-dialog').open, false);
});

test('all new inventory UI and server feedback keys have Hungarian catalog entries', () => {
  let catalog; vm.runInNewContext(fs.readFileSync(require.resolve('../public/locales/hu'), 'utf8'), { GameText: { addCatalog: (language, values) => { catalog = values; } } });
  const source = fs.readFileSync(require.resolve('../public/inventory-qol'), 'utf8') + fs.readFileSync(require.resolve('../inventory'), 'utf8');
  for (const match of source.matchAll(/['"](inventory\.[A-Za-z]+)['"]/g)) assert.ok(Object.hasOwn(catalog, match[1]), match[1]);
});

test('bag keyboard controls stop gameplay hotkeys and menu Escape restores item focus', () => {
  const ui = uiFixture(), { context, node } = ui; node('bag-item-menu').hidden = true;
  const anchor = node('item-anchor'); anchor.focus(); ui.run("openBagMenu('uid-1', 40, 40)"); assert.equal(context.document.activeElement.id, 'bag-menu-close');
  let stopped = false, prevented = false;
  const event = { key: 'Escape', target: anchor, preventDefault: () => { prevented = true; }, stopImmediatePropagation: () => { stopped = true; } };
  ui.windowEvents.get('keydown')[0](event); assert.equal(stopped, true); assert.equal(prevented, true); assert.equal(node('bag-item-menu').hidden, true); assert.equal(context.document.activeElement, anchor);
  stopped = false; context.keys = { w: true }; context.held = true;
  ui.windowEvents.get('keydown')[0]({ key: 'i', target: { closest: selector => selector === '#bag-tools' ? node('bag-tools') : null }, preventDefault() {}, stopImmediatePropagation: () => { stopped = true; } });
  assert.equal(stopped, true); assert.equal(Object.keys(context.keys).length, 0); assert.equal(context.held, false); assert.equal(ui.sent.length, 0);
});
