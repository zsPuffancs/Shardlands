'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs');
function fixture() {
  const nodes = new Map(), sent = [], events = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, { value: '', disabled: false, innerHTML: '', textContent: '', style: {} }); return nodes.get(id); };
  node('aa-attempts').value = '100'; node('aa-budget').value = '1000';
  const item = { uid: 'sword', name: 'Iron Sword', slot: 'weapon', ilvl: 100, rar: 3, plus: 7, afx: { k: 'ls', v: 2 } };
  const context = { AffixMath: require('../public/affix-math'), I: { affixSlots: ['weapon', 'ring'], rarity: ['Common', 'Uncommon', 'Rare', 'Epic'], affixes: { aspd: { n: 'Attack Speed %' }, ls: { n: 'Lifesteal %' } } }, BAG: [item], EQ: {}, SOULS: 2000, afSel: 'sword', afKey: 'aspd', keys: {}, held: true,
    $: node, esc: value => String(value).replaceAll('<', '&lt;'), text: (key, fallback) => fallback, gearName: name => name, slotHtml: () => 'ITEM', GameText: { number: value => String(value) },
    send: message => sent.push(message), buildAffix() {}, isOpen: id => node(id).style.display === 'flex', openWin: id => { node(id).style.display = 'flex'; }, closeWin: id => { node(id).style.display = 'none'; }, closeAll() {},
    onInv: message => { context.BAG = message.bag; context.EQ = message.eq; context.SOULS = message.souls; },
    document: { addEventListener() {} }, addEventListener: (type, fn) => events.set(type, fn) };
  vm.createContext(context); vm.runInContext(fs.readFileSync(require.resolve('../public/auto-affix-ui'), 'utf8'), context);
  function preview() { context.onAutoAffixMessage({ t: 'autoAffixPreview', uid: 'sword', item, cost: 5, limits: { maxAttempts: 100000, maxSouls: 1000000, maxMinimum: 1000000 }, ranges: { aspd: { base: 10, low: 8.5, high: 11.5, spread: [.85, 1.15] }, ls: { base: 2, low: 1.7, high: 2.3, spread: [.85, 1.15] } } }); }
  return { context, node, sent, events, preview };
}
test('Auto Affix client uses authoritative preview, validates target/caps and prevents duplicate Starts', () => {
  const ui = fixture(), { node, sent } = ui; node('auto-affix-open').onclick();
  assert.equal(node('aa-start').disabled, true); assert.equal(sent[0].op, 'inspect'); ui.preview();
  assert.equal(node('aa-min').value, 11.5); assert.equal(node('aa-start').disabled, false); assert.ok(node('aa-estimate').innerHTML.includes('Effective maximum attempts')); assert.equal(ui.context.held, false);
  node('aa-min').value = '11.6'; node('aa-min').oninput(); assert.equal(node('aa-start').disabled, true); assert.ok(node('aa-notice').textContent.includes('cannot'));
  node('aa-min').value = '11.5'; node('aa-attempts').value = '1.5'; node('aa-attempts').oninput(); assert.equal(node('aa-start').disabled, true);
  node('aa-attempts').value = '100'; node('aa-start').onclick(); node('aa-start').onclick(); assert.equal(sent.filter(packet => packet.op === 'start').length, 1); assert.equal(sent.at(-1).minimum, 11.5); assert.equal(node('aa-key').disabled, true);
});
test('Auto Affix client shows actual server result separately from best and cancels on close/Escape', () => {
  const ui = fixture(), { node, sent, context } = ui; node('auto-affix-open').onclick(); ui.preview();
  context.onAutoAffixMessage({ t: 'autoAffixStatus', job: { uid: 'sword', itemName: 'Swift Iron Sword', key: 'aspd', minimum: 11.5, status: 'budget_exhausted', reason: 'budget_exhausted', current: { k: 'aspd', v: 8.5 }, best: 11, attempts: 20, spent: 100, souls: 1900, remainingAttempts: 0, remainingBudget: 0 } });
  assert.equal(node('aa-status-title').textContent, 'Auto Affix Completed'); for (const value of ['8.5%', '11%', '20', '1900', 'Souls budget exhausted']) assert.ok(node('aa-statistics').innerHTML.includes(value), value);
  context.closeWin('autoaffixw'); assert.equal(sent.at(-1).op, 'stop'); assert.equal(context.isOpen('autoaffixw'), false);
  node('auto-affix-open').onclick(); let stopped = false, prevented = false;
  ui.events.get('keydown')({ key: 'Escape', target: { closest: () => node('autoaffixw') }, stopImmediatePropagation: () => { stopped = true; }, preventDefault: () => { prevented = true; } });
  assert.ok(stopped && prevented); assert.equal(sent.at(-1).op, 'stop');
  context.onAutoAffixMessage({ t: 'autoAffixStatus', error: 'invalid_item' }); assert.equal(context.isOpen('autoaffixw'), false);
});
test('Auto Affix client reacts to authoritative balance changes and all feedback has Hungarian translations', () => {
  const ui = fixture(); ui.node('auto-affix-open').onclick(); ui.preview(); ui.context.onInv({ bag: ui.context.BAG, eq: {}, souls: 0 }); assert.equal(ui.node('aa-start').disabled, true);
  let catalog; vm.runInNewContext(fs.readFileSync(require.resolve('../public/locales/hu'), 'utf8'), { GameText: { addCatalog: (code, entries) => { catalog = entries; } } });
  const source = fs.readFileSync(require.resolve('../public/auto-affix-ui'), 'utf8');
  for (const match of source.matchAll(/tr\('([^']+)'/g)) assert.ok(Object.hasOwn(catalog, 'autoAffix.' + match[1]), match[1]);
  const statuses = ['idle', 'running', 'success', 'attempts_exhausted', 'budget_exhausted', 'insufficient_souls', 'stopped', 'invalid_item', 'out_of_range', 'disconnected', 'cancelled', 'error', 'invalid_roll', 'already_satisfied', 'invalid_affix', 'invalid_limits', 'impossible_target', 'already_running', 'invalid_balance', 'item_reserved', 'dead', 'item_changed', 'region_changed'];
  for (const status of statuses) assert.ok(Object.hasOwn(catalog, 'autoAffix.' + status), status);
});
