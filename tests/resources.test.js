'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const resources = require('../src/shared/generated/resources');
const baseline = require('./fixtures/domain-baseline.json');
function host() {
  const writes = { width: 0, text: 0, attributes: 0 }, attributes = {};
  const fill = { style: {} }, label = {};
  Object.defineProperty(fill.style, 'width', { set(value) { writes.width++; this.value = value; }, get() { return this.value; } });
  Object.defineProperty(label, 'textContent', { set(value) { writes.text++; this.value = value; }, get() { return this.value; } });
  return { firstElementChild: fill, lastElementChild: label, writes, attributes, setAttribute(key, value) { writes.attributes++; attributes[key] = value; } };
}
test('shared health arithmetic retains exact pre-refactor fractional, capped healing and overkill behavior', () => {
  for (const row of baseline.resourceCases) {
    assert.equal(resources.restoreResource(row.value, row.maximum, row.amount), row.healed);
    assert.equal(resources.subtractResource(row.value, row.amount), row.damaged);
    assert.equal(resources.resourcePercent(row.value, row.maximum, .5), row.percent);
  }
  for (const value of [0, .25, 99.999, 10000, Number.MAX_SAFE_INTEGER]) for (const maximum of [1, 100, 1e9]) {
    assert.equal(resources.restoreResource(value, maximum, .125), Math.min(maximum, value + .125));
    assert.equal(resources.subtractResource(value, 123.45), value - 123.45);
  }
});
test('presentation normalizes zero, invalid and out-of-range values without NaN widths', () => {
  for (const [value, maximum, percent] of [[50,100,50],[200,100,100],[-1,100,0],[0,0,0],[NaN,100,0],[1,Infinity,0],[Infinity,100,0]]) assert.equal(resources.resourcePercent(value, maximum), percent);
  assert.throws(() => resources.resourcePercent(1, 2, 0));
});
test('ResourceBar preserves rounding/text, caches DOM writes and updates common accessible state', () => {
  const element = host(), bar = new resources.ResourceBar(element);
  bar.update(12.26,100,'12 / 100',{step:.5,label:'Hero'});
  assert.equal(element.firstElementChild.style.width,'12.5%');
  assert.equal(element.lastElementChild.textContent,'12 / 100');
  assert.equal(element.attributes.role,'progressbar');
  assert.equal(element.attributes['aria-valuenow'],'12.26');
  assert.equal(element.attributes['aria-valuemax'],'100');
  assert.equal(element.attributes['aria-label'],'Hero');
  const writes = {...element.writes};
  bar.update(12.26,100,'12 / 100',{step:.5,label:'Hero'});
  assert.deepEqual(element.writes,writes);
  bar.update(1000,100,'100 / 100',{label:'Boss'});
  assert.equal(element.firstElementChild.style.width,'100%');
  assert.equal(element.attributes['aria-valuenow'],'100');
  assert.equal(element.attributes['aria-label'],'Boss');
  // Existing CSS transitions remain responsible for animation; no new timers/styles.
  assert.deepEqual(Object.keys(element.firstElementChild.style),['value']);
});
test('nameplate-only resource presenter does not overwrite its fill and uses one cached controller', () => {
  const element = host(); element.lastElementChild = element.firstElementChild;
  resources.updateResourceBar(element,.5,1,undefined,{label:'Monster'});
  const writes = {...element.writes};
  resources.updateResourceBar(element,.5,1,undefined,{label:'Monster'});
  assert.deepEqual(element.writes,writes);
  assert.equal(element.firstElementChild.style.width,'50%');
  assert.equal(element.firstElementChild.textContent,undefined);
});
test('generated UMD browser resource API matches Node and actual HUD setBar uses it', () => {
  const element = host(), browser = vm.createContext({ $: () => element });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/resource-bars.js'),'utf8'),browser);
  const ui = fs.readFileSync(path.join(__dirname,'../public/ui.js'),'utf8');
  vm.runInContext(ui.slice(ui.indexOf('function setBar('),ui.indexOf('\n',ui.indexOf('function setBar('))),browser);
  browser.setBar('hp',50,100,'50 / 100');
  assert.equal(element.firstElementChild.style.width,'50%');
  for (const row of baseline.resourceCases) assert.equal(browser.SharedResources.restoreResource(row.value,row.maximum,row.amount),resources.restoreResource(row.value,row.maximum,row.amount));
  const html = fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  assert.ok(html.indexOf('src="resource-bars.js"') < html.indexOf('src="game.js"'));
  assert.ok(html.indexOf('src="resource-bars.js"') >= 0);
});
